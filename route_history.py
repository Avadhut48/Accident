"""
Route History Manager
Stores and retrieves user route search history using JSON file storage.
"""
import json
import os
from datetime import datetime
from typing import List, Dict, Optional


class RouteHistoryManager:
    """Manages route search history with persistence to JSON."""
    
    def __init__(self, storage_path: str = "data/route_history.json"):
        self.storage_path = storage_path
        self._ensure_storage_dir()
    
    def _ensure_storage_dir(self):
        """Create storage directory if it doesn't exist."""
        os.makedirs(os.path.dirname(self.storage_path), exist_ok=True)
        if not os.path.exists(self.storage_path):
            self._save_history([])
    
    def _load_history(self) -> List[Dict]:
        """Load history from JSON file."""
        try:
            with open(self.storage_path, 'r') as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return []
    
    def _save_history(self, history: List[Dict]):
        """Save history to JSON file."""
        with open(self.storage_path, 'w') as f:
            json.dump(history, f, indent=2)
    
    def add_search(self, start: str, end: str, chosen_route: Dict, 
                   all_routes: List[Dict], weather: Optional[Dict] = None) -> Dict:
        """
        Add a new route search to history.
        
        Args:
            start: Starting location name
            end: Destination location name
            chosen_route: The route the user selected/viewed
            all_routes: All routes that were generated
            weather: Current weather conditions (optional)
        
        Returns:
            The created history entry
        """
        history = self._load_history()
        
        entry = {
            'id': self._generate_id(),
            'timestamp': datetime.now().isoformat(),
            'start': start,
            'end': end,
            'chosen_route': {
                'name': chosen_route['name'],
                'risk_score': chosen_route['risk_score'],
                'risk_level': chosen_route['risk_level'],
                'distance_km': chosen_route['distance_km'],
                'time_minutes': chosen_route['time_minutes']
            },
            'all_routes_count': len(all_routes),
            'weather': weather.get('condition', 'Unknown') if weather else 'Unknown',
            'weather_temp': weather.get('temp_c') if weather else None
        }
        
        history.insert(0, entry)  # Add to beginning (most recent first)
        
        # Keep only last 100 entries
        history = history[:100]
        
        self._save_history(history)
        return entry
    
    def get_recent(self, limit: int = 10) -> List[Dict]:
        """Get the most recent route searches."""
        history = self._load_history()
        return history[:limit]
    
    def get_all(self) -> List[Dict]:
        """Get all route search history."""
        return self._load_history()
    
    def get_search_stats(self, start: str, end: str) -> Dict:
        """
        Get statistics for a specific route (start -> end).
        
        Returns:
            Dict with count, last_searched, avg_risk_score, etc.
        """
        history = self._load_history()
        
        # Filter for this specific route
        route_searches = [
            h for h in history 
            if h['start'] == start and h['end'] == end
        ]
        
        if not route_searches:
            return {
                'count': 0,
                'last_searched': None,
                'avg_risk_score': None,
                'min_risk_score': None,
                'max_risk_score': None
            }
        
        risk_scores = [s['chosen_route']['risk_score'] for s in route_searches]
        
        return {
            'count': len(route_searches),
            'last_searched': route_searches[0]['timestamp'],
            'avg_risk_score': round(sum(risk_scores) / len(risk_scores), 2),
            'min_risk_score': min(risk_scores),
            'max_risk_score': max(risk_scores),
            'recent_searches': route_searches[:5]  # Last 5 searches of this route
        }
    
    def get_popular_routes(self, limit: int = 5) -> List[Dict]:
        """Get the most frequently searched routes."""
        history = self._load_history()
        
        # Count route pairs
        route_counts = {}
        for h in history:
            key = f"{h['start']} → {h['end']}"
            if key not in route_counts:
                route_counts[key] = {
                    'start': h['start'],
                    'end': h['end'],
                    'count': 0,
                    'last_searched': h['timestamp'],
                    'avg_risk': 0,
                    'total_risk': 0
                }
            route_counts[key]['count'] += 1
            route_counts[key]['total_risk'] += h['chosen_route']['risk_score']
        
        # Calculate averages and sort
        popular = []
        for route_info in route_counts.values():
            route_info['avg_risk'] = round(
                route_info['total_risk'] / route_info['count'], 2
            )
            del route_info['total_risk']
            popular.append(route_info)
        
        popular.sort(key=lambda x: x['count'], reverse=True)
        return popular[:limit]
    
    def clear_history(self):
        """Clear all route history."""
        self._save_history([])
    
    def delete_entry(self, entry_id: str) -> bool:
        """Delete a specific history entry by ID."""
        history = self._load_history()
        original_len = len(history)
        history = [h for h in history if h['id'] != entry_id]
        
        if len(history) < original_len:
            self._save_history(history)
            return True
        return False
    
    def _generate_id(self) -> str:
        """Generate a unique ID for history entry."""
        return f"rh_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"
