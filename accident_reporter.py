"""
Real-Time Accident Reporting System
Manages user-reported accidents with automatic expiration and impact on route risk.
"""
import json
import os
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import math


class AccidentReporter:
    """Manages real-time accident reports from users."""
    
    def __init__(self, storage_path: str = "data/live_accidents.json"):
        self.storage_path = storage_path
        self.expiry_hours = 2  # Accidents expire after 2 hours
        self._ensure_storage_dir()
    
    def _ensure_storage_dir(self):
        """Create storage directory if it doesn't exist."""
        os.makedirs(os.path.dirname(self.storage_path), exist_ok=True)
        if not os.path.exists(self.storage_path):
            self._save_accidents([])
    
    def _load_accidents(self) -> List[Dict]:
        """Load accidents from JSON file."""
        try:
            with open(self.storage_path, 'r') as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return []
    
    def _save_accidents(self, accidents: List[Dict]):
        """Save accidents to JSON file."""
        with open(self.storage_path, 'w') as f:
            json.dump(accidents, f, indent=2)
    
    def _clean_expired(self, accidents: List[Dict]) -> List[Dict]:
        """Remove accidents older than expiry_hours."""
        cutoff = datetime.now() - timedelta(hours=self.expiry_hours)
        return [
            acc for acc in accidents 
            if datetime.fromisoformat(acc['timestamp']) > cutoff
        ]
    
    def report_accident(self, latitude: float, longitude: float, 
                       severity: str, description: str = "",
                       user_id: Optional[str] = None) -> Dict:
        """
        Report a new accident.
        
        Args:
            latitude: Accident location latitude
            longitude: Accident location longitude
            severity: One of: minor, moderate, severe, fatal
            description: Optional user description
            user_id: Optional user identifier
        
        Returns:
            The created accident report
        """
        accidents = self._load_accidents()
        
        # Clean expired accidents
        accidents = self._clean_expired(accidents)
        
        # Create new accident
        accident = {
            'id': self._generate_id(),
            'timestamp': datetime.now().isoformat(),
            'latitude': round(latitude, 6),
            'longitude': round(longitude, 6),
            'severity': severity.lower(),
            'description': description,
            'user_id': user_id,
            'upvotes': 0,
            'downvotes': 0,
            'verified': False,
            'expires_at': (datetime.now() + timedelta(hours=self.expiry_hours)).isoformat()
        }
        
        accidents.append(accident)
        self._save_accidents(accidents)
        
        return accident
    
    def get_active_accidents(self) -> List[Dict]:
        """Get all active (non-expired) accidents."""
        accidents = self._load_accidents()
        accidents = self._clean_expired(accidents)
        self._save_accidents(accidents)  # Clean on read
        return accidents
    
    def get_accidents_near_location(self, latitude: float, longitude: float, 
                                    radius_km: float = 2.0) -> List[Dict]:
        """
        Get accidents within radius_km of a location.
        
        Args:
            latitude: Center point latitude
            longitude: Center point longitude
            radius_km: Search radius in kilometers
        
        Returns:
            List of accidents within radius
        """
        all_accidents = self.get_active_accidents()
        nearby = []
        
        for acc in all_accidents:
            distance = self._haversine_distance(
                latitude, longitude,
                acc['latitude'], acc['longitude']
            )
            if distance <= radius_km:
                acc['distance_km'] = round(distance, 2)
                nearby.append(acc)
        
        # Sort by distance
        nearby.sort(key=lambda x: x['distance_km'])
        return nearby
    
    def get_accidents_on_route(self, waypoints: List[List[float]], 
                              buffer_km: float = 0.5) -> List[Dict]:
        """
        Get accidents along a route with buffer zone.
        
        Args:
            waypoints: List of [lat, lon] points defining the route
            buffer_km: How far from route to search (km)
        
        Returns:
            List of accidents near the route
        """
        all_accidents = self.get_active_accidents()
        route_accidents = []
        
        for acc in all_accidents:
            # Check if accident is near any segment of the route
            for i in range(len(waypoints) - 1):
                distance = self._point_to_segment_distance(
                    acc['latitude'], acc['longitude'],
                    waypoints[i][0], waypoints[i][1],
                    waypoints[i+1][0], waypoints[i+1][1]
                )
                
                if distance <= buffer_km:
                    acc['distance_from_route_km'] = round(distance, 2)
                    route_accidents.append(acc)
                    break
        
        return route_accidents
    
    def vote_accident(self, accident_id: str, vote_type: str) -> bool:
        """
        Upvote or downvote an accident report.
        
        Args:
            accident_id: ID of the accident
            vote_type: 'up' or 'down'
        
        Returns:
            True if successful
        """
        accidents = self._load_accidents()
        
        for acc in accidents:
            if acc['id'] == accident_id:
                if vote_type == 'up':
                    acc['upvotes'] += 1
                elif vote_type == 'down':
                    acc['downvotes'] += 1
                
                # Auto-verify if enough upvotes
                if acc['upvotes'] >= 3 and not acc['verified']:
                    acc['verified'] = True
                
                # Auto-remove if too many downvotes
                if acc['downvotes'] >= 5:
                    accidents = [a for a in accidents if a['id'] != accident_id]
                
                self._save_accidents(accidents)
                return True
        
        return False
    
    def delete_accident(self, accident_id: str, user_id: Optional[str] = None) -> bool:
        """
        Delete an accident report (user can only delete their own).
        
        Args:
            accident_id: ID of the accident
            user_id: User requesting deletion
        
        Returns:
            True if deleted
        """
        accidents = self._load_accidents()
        
        for acc in accidents:
            if acc['id'] == accident_id:
                # Allow deletion if user owns it or no user_id provided (admin)
                if user_id is None or acc['user_id'] == user_id:
                    accidents = [a for a in accidents if a['id'] != accident_id]
                    self._save_accidents(accidents)
                    return True
        
        return False
    
    def get_accident_impact_multiplier(self, waypoints: List[List[float]]) -> float:
        """
        Calculate risk multiplier based on accidents on route.
        
        Args:
            waypoints: Route waypoints
        
        Returns:
            Multiplier (1.0 = no impact, 1.5 = +50% risk)
        """
        accidents = self.get_accidents_on_route(waypoints, buffer_km=0.5)
        
        if not accidents:
            return 1.0
        
        # Weight by severity and recency
        severity_weights = {
            'minor': 1.05,      # +5%
            'moderate': 1.15,   # +15%
            'severe': 1.30,     # +30%
            'fatal': 1.50       # +50%
        }
        
        total_impact = 1.0
        now = datetime.now()
        
        for acc in accidents:
            base_weight = severity_weights.get(acc['severity'], 1.10)
            
            # Decay impact over time (full impact for first 30 mins)
            accident_time = datetime.fromisoformat(acc['timestamp'])
            age_minutes = (now - accident_time).total_seconds() / 60
            
            if age_minutes <= 30:
                time_factor = 1.0
            elif age_minutes <= 60:
                time_factor = 0.8
            else:
                time_factor = 0.5
            
            # Verified accidents have more impact
            verification_factor = 1.2 if acc.get('verified') else 1.0
            
            impact = (base_weight - 1.0) * time_factor * verification_factor
            total_impact += impact
        
        # Cap at 2.0x (100% increase)
        return min(2.0, total_impact)
    
    def get_statistics(self) -> Dict:
        """Get summary statistics about reported accidents."""
        accidents = self.get_active_accidents()
        
        severity_counts = {'minor': 0, 'moderate': 0, 'severe': 0, 'fatal': 0}
        for acc in accidents:
            severity = acc['severity']
            if severity in severity_counts:
                severity_counts[severity] += 1
        
        return {
            'total_active': len(accidents),
            'verified': sum(1 for a in accidents if a.get('verified')),
            'by_severity': severity_counts,
            'avg_upvotes': round(sum(a['upvotes'] for a in accidents) / len(accidents), 1) if accidents else 0,
            'most_recent': accidents[-1] if accidents else None
        }
    
    def _haversine_distance(self, lat1: float, lon1: float, 
                           lat2: float, lon2: float) -> float:
        """Calculate distance between two points in km."""
        R = 6371
        lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
        return R * 2 * math.asin(math.sqrt(a))
    
    def _point_to_segment_distance(self, px: float, py: float,
                                   x1: float, y1: float,
                                   x2: float, y2: float) -> float:
        """Calculate minimum distance from point to line segment in km."""
        # Convert to radians for calculation
        # Simplified approximation - good enough for short distances
        
        # Vector from segment start to point
        dx = px - x1
        dy = py - y1
        
        # Vector of segment
        sx = x2 - x1
        sy = y2 - y1
        
        # Project point onto segment
        if sx == 0 and sy == 0:
            # Segment is a point
            return self._haversine_distance(px, py, x1, y1)
        
        t = max(0, min(1, (dx*sx + dy*sy) / (sx*sx + sy*sy)))
        
        # Closest point on segment
        closest_x = x1 + t * sx
        closest_y = y1 + t * sy
        
        return self._haversine_distance(px, py, closest_x, closest_y)
    
    def _generate_id(self) -> str:
        """Generate a unique ID for accident report."""
        return f"acc_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"
