"""
Real-Time Traffic Integration Module
Google Maps API integration for live traffic data, route optimization, and predictions
"""

import googlemaps
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
import time

class TrafficIntegration:
    """
    Integrates Google Maps API for real-time traffic data
    """
    
    def __init__(self, api_key: str):
        """
        Initialize Google Maps client
        
        Args:
            api_key: Your Google Maps API key
        """
        self.gmaps = googlemaps.Client(key=api_key)
        self.cache = {}
        self.cache_duration = 300  # 5 minutes cache
        
    def get_route_with_traffic(
        self, 
        start: str, 
        end: str, 
        departure_time: str = "now",
        avoid_tolls: bool = False,
        avoid_highways: bool = False
    ) -> Dict:
        """
        Get route with real-time traffic data
        
        Args:
            start: Starting location (address or coordinates)
            end: Destination location (address or coordinates)
            departure_time: When to depart ("now" or datetime object)
            avoid_tolls: Whether to avoid toll roads
            avoid_highways: Whether to avoid highways
            
        Returns:
            Dictionary with route details including traffic
        """
        
        # Build avoid parameter
        avoid = []
        if avoid_tolls:
            avoid.append("tolls")
        if avoid_highways:
            avoid.append("highways")
        
        avoid_param = "|".join(avoid) if avoid else None
        
        try:
            # Get directions with traffic
            directions = self.gmaps.directions(
                start,
                end,
                mode="driving",
                departure_time=departure_time if departure_time == "now" else departure_time,
                traffic_model="best_guess",
                alternatives=True,  # Get alternative routes
                avoid=avoid_param
            )
            
            if not directions:
                return {"error": "No route found"}
            
            # Process all route alternatives
            routes = []
            for idx, route in enumerate(directions):
                leg = route['legs'][0]
                
                # Extract traffic duration
                duration_in_traffic = leg.get('duration_in_traffic', {}).get('value', 0)
                normal_duration = leg['duration']['value']
                distance = leg['distance']['value']
                
                # Calculate delay
                traffic_delay = duration_in_traffic - normal_duration
                delay_minutes = traffic_delay / 60
                
                # Determine traffic severity
                if delay_minutes < 5:
                    traffic_level = "Light"
                    severity = "low"
                elif delay_minutes < 15:
                    traffic_level = "Moderate"
                    severity = "medium"
                else:
                    traffic_level = "Heavy"
                    severity = "high"
                
                # Extract route polyline for map display
                polyline = route['overview_polyline']['points']
                
                # Get step-by-step directions
                steps = []
                for step in leg['steps']:
                    steps.append({
                        'instruction': step['html_instructions'],
                        'distance': step['distance']['text'],
                        'duration': step['duration']['text']
                    })
                
                routes.append({
                    'route_number': idx + 1,
                    'summary': route['summary'],
                    'distance_km': distance / 1000,
                    'distance_text': leg['distance']['text'],
                    'normal_duration_min': normal_duration / 60,
                    'traffic_duration_min': duration_in_traffic / 60,
                    'traffic_delay_min': delay_minutes,
                    'traffic_level': traffic_level,
                    'severity': severity,
                    'start_address': leg['start_address'],
                    'end_address': leg['end_address'],
                    'polyline': polyline,
                    'steps': steps,
                    'warnings': route.get('warnings', []),
                    'via_waypoints': route.get('via_waypoint', [])
                })
            
            # Sort routes by traffic duration (fastest first)
            routes.sort(key=lambda x: x['traffic_duration_min'])
            
            return {
                'success': True,
                'routes': routes,
                'best_route': routes[0],
                'alternatives': routes[1:] if len(routes) > 1 else [],
                'timestamp': datetime.now().isoformat()
            }
            
        except googlemaps.exceptions.ApiError as e:
            return {'error': f'Google Maps API Error: {str(e)}'}
        except Exception as e:
            return {'error': f'Error: {str(e)}'}
    
    def get_traffic_comparison(
        self,
        start: str,
        end: str,
        times: List[str] = None
    ) -> Dict:
        """
        Compare traffic at different times of day
        
        Args:
            start: Starting location
            end: Destination
            times: List of times to check (default: morning, afternoon, evening)
            
        Returns:
            Traffic comparison data
        """
        
        if times is None:
            # Default check times
            now = datetime.now()
            times = [
                now.replace(hour=8, minute=0),   # Morning peak
                now.replace(hour=14, minute=0),  # Afternoon
                now.replace(hour=18, minute=0),  # Evening peak
                now.replace(hour=22, minute=0),  # Night
            ]
        
        results = []
        
        for check_time in times:
            try:
                directions = self.gmaps.directions(
                    start,
                    end,
                    mode="driving",
                    departure_time=check_time,
                    traffic_model="best_guess"
                )
                
                if directions:
                    leg = directions[0]['legs'][0]
                    duration_in_traffic = leg.get('duration_in_traffic', {}).get('value', 0)
                    
                    results.append({
                        'time': check_time.strftime('%I:%M %p'),
                        'duration_min': duration_in_traffic / 60,
                        'duration_text': leg.get('duration_in_traffic', {}).get('text', 'N/A')
                    })
                
                # Small delay to avoid rate limiting
                time.sleep(0.5)
                
            except Exception as e:
                print(f"Error checking time {check_time}: {e}")
        
        # Find best time
        if results:
            best_time = min(results, key=lambda x: x['duration_min'])
            worst_time = max(results, key=lambda x: x['duration_min'])
            
            return {
                'success': True,
                'comparison': results,
                'best_time': best_time,
                'worst_time': worst_time,
                'time_savings': worst_time['duration_min'] - best_time['duration_min']
            }
        
        return {'error': 'Could not retrieve traffic data'}
    
    def get_live_traffic_conditions(
        self,
        location: str,
        radius: int = 5000
    ) -> Dict:
        """
        Get current traffic conditions in an area
        
        Args:
            location: Center point (address or coordinates)
            radius: Radius in meters (default 5km)
            
        Returns:
            Traffic conditions summary
        """
        
        # Geocode the location first
        try:
            geocode_result = self.gmaps.geocode(location)
            if not geocode_result:
                return {'error': 'Location not found'}
            
            center = geocode_result[0]['geometry']['location']
            
            # Use Distance Matrix to check traffic to nearby points
            # This gives us an idea of overall area traffic
            nearby_points = self._generate_nearby_points(center, radius)
            
            traffic_data = []
            for point in nearby_points:
                result = self.gmaps.distance_matrix(
                    origins=[f"{center['lat']},{center['lng']}"],
                    destinations=[f"{point['lat']},{point['lng']}"],
                    mode="driving",
                    departure_time="now",
                    traffic_model="best_guess"
                )
                
                if result['rows'][0]['elements'][0]['status'] == 'OK':
                    element = result['rows'][0]['elements'][0]
                    duration = element.get('duration_in_traffic', {}).get('value', 0)
                    normal_duration = element['duration']['value']
                    
                    traffic_data.append({
                        'delay_seconds': duration - normal_duration,
                        'duration': duration
                    })
            
            if traffic_data:
                avg_delay = sum(d['delay_seconds'] for d in traffic_data) / len(traffic_data)
                avg_delay_min = avg_delay / 60
                
                if avg_delay_min < 2:
                    condition = "Free Flow"
                    color = "green"
                elif avg_delay_min < 5:
                    condition = "Light Traffic"
                    color = "yellow"
                elif avg_delay_min < 10:
                    condition = "Moderate Traffic"
                    color = "orange"
                else:
                    condition = "Heavy Traffic"
                    color = "red"
                
                return {
                    'success': True,
                    'location': location,
                    'condition': condition,
                    'color': color,
                    'avg_delay_min': round(avg_delay_min, 2),
                    'timestamp': datetime.now().isoformat()
                }
            
            return {'error': 'Could not determine traffic conditions'}
            
        except Exception as e:
            return {'error': f'Error: {str(e)}'}
    
    def find_best_route_avoiding_traffic(
        self,
        start: str,
        end: str,
        max_alternatives: int = 3
    ) -> Dict:
        """
        Find the best route considering current traffic
        Analyzes multiple alternatives and picks the fastest
        
        Args:
            start: Starting location
            end: Destination
            max_alternatives: Maximum number of routes to compare
            
        Returns:
            Best route avoiding traffic jams
        """
        
        result = self.get_route_with_traffic(start, end)
        
        if not result.get('success'):
            return result
        
        routes = result['routes'][:max_alternatives]
        
        # Analyze each route for traffic issues
        for route in routes:
            # Calculate traffic score (lower is better)
            traffic_score = (
                route['traffic_delay_min'] * 2 +  # Heavily weight delays
                route['distance_km'] * 0.5  # Slightly weight distance
            )
            route['traffic_score'] = traffic_score
            
            # Add recommendation
            if route['traffic_delay_min'] < 5:
                route['recommendation'] = "Good route - minimal traffic"
            elif route['traffic_delay_min'] < 15:
                route['recommendation'] = "Moderate delays expected"
            else:
                route['recommendation'] = "Heavy traffic - consider alternative time"
        
        # Sort by traffic score
        routes.sort(key=lambda x: x['traffic_score'])
        
        best_route = routes[0]
        
        return {
            'success': True,
            'recommended_route': best_route,
            'all_routes': routes,
            'traffic_summary': {
                'best_delay': best_route['traffic_delay_min'],
                'worst_delay': max(r['traffic_delay_min'] for r in routes),
                'alternatives_available': len(routes) - 1
            },
            'timestamp': datetime.now().isoformat()
        }
    
    def predict_arrival_time(
        self,
        start: str,
        end: str,
        departure_time: Optional[datetime] = None
    ) -> Dict:
        """
        Predict arrival time considering traffic
        
        Args:
            start: Starting location
            end: Destination
            departure_time: When you plan to leave (default: now)
            
        Returns:
            Predicted arrival time and traffic info
        """
        
        if departure_time is None:
            departure_time = "now"
        
        result = self.get_route_with_traffic(start, end, departure_time)
        
        if not result.get('success'):
            return result
        
        best_route = result['best_route']
        
        if departure_time == "now":
            depart_dt = datetime.now()
        else:
            depart_dt = departure_time
        
        arrival_time = depart_dt + timedelta(minutes=best_route['traffic_duration_min'])
        
        return {
            'success': True,
            'departure_time': depart_dt.strftime('%I:%M %p'),
            'arrival_time': arrival_time.strftime('%I:%M %p'),
            'journey_duration': f"{int(best_route['traffic_duration_min'])} minutes",
            'traffic_delay': f"{int(best_route['traffic_delay_min'])} minutes",
            'traffic_level': best_route['traffic_level'],
            'distance': best_route['distance_text'],
            'route': best_route['summary'],
            'timestamp': datetime.now().isoformat()
        }
    
    def _generate_nearby_points(
        self,
        center: Dict,
        radius: int
    ) -> List[Dict]:
        """
        Generate points around a center for traffic sampling
        
        Args:
            center: {'lat': float, 'lng': float}
            radius: Radius in meters
            
        Returns:
            List of nearby points
        """
        import math
        
        # Simple 4-point sampling (North, South, East, West)
        # 1 degree latitude ≈ 111km
        lat_offset = (radius / 111000)
        lng_offset = (radius / (111000 * math.cos(math.radians(center['lat']))))
        
        points = [
            {'lat': center['lat'] + lat_offset, 'lng': center['lng']},  # North
            {'lat': center['lat'] - lat_offset, 'lng': center['lng']},  # South
            {'lat': center['lat'], 'lng': center['lng'] + lng_offset},  # East
            {'lat': center['lat'], 'lng': center['lng'] - lng_offset},  # West
        ]
        
        return points


# Example usage functions
def example_basic_route():
    """Example: Get route with traffic"""
    
    traffic = TrafficIntegration(api_key='YOUR_API_KEY_HERE')
    
    result = traffic.get_route_with_traffic(
        start="Gateway of India, Mumbai",
        end="Pune Railway Station, Pune"
    )
    
    if result.get('success'):
        best = result['best_route']
        print(f"Route: {best['summary']}")
        print(f"Distance: {best['distance_text']}")
        print(f"Normal time: {int(best['normal_duration_min'])} minutes")
        print(f"With traffic: {int(best['traffic_duration_min'])} minutes")
        print(f"Delay: {int(best['traffic_delay_min'])} minutes")
        print(f"Traffic: {best['traffic_level']}")
    else:
        print(f"Error: {result.get('error')}")


def example_avoid_traffic():
    """Example: Find best route avoiding traffic"""
    
    traffic = TrafficIntegration(api_key='YOUR_API_KEY_HERE')
    
    result = traffic.find_best_route_avoiding_traffic(
        start="Connaught Place, Delhi",
        end="Gurgaon Cyber City"
    )
    
    if result.get('success'):
        recommended = result['recommended_route']
        print(f"Recommended: {recommended['summary']}")
        print(f"Traffic delay: {int(recommended['traffic_delay_min'])} min")
        print(f"Recommendation: {recommended['recommendation']}")
        
        print(f"\nAlternatives: {result['traffic_summary']['alternatives_available']}")


def example_time_comparison():
    """Example: Compare traffic at different times"""
    
    traffic = TrafficIntegration(api_key='YOUR_API_KEY_HERE')
    
    result = traffic.get_traffic_comparison(
        start="Koramangala, Bangalore",
        end="Whitefield, Bangalore"
    )
    
    if result.get('success'):
        print("Traffic comparison:")
        for item in result['comparison']:
            print(f"  {item['time']}: {item['duration_text']}")
        
        print(f"\nBest time: {result['best_time']['time']}")
        print(f"Time savings: {int(result['time_savings'])} minutes")


def example_arrival_prediction():
    """Example: Predict arrival time"""
    
    traffic = TrafficIntegration(api_key='YOUR_API_KEY_HERE')
    
    result = traffic.predict_arrival_time(
        start="Marine Drive, Mumbai",
        end="Mumbai Airport"
    )
    
    if result.get('success'):
        print(f"Departure: {result['departure_time']}")
        print(f"Arrival: {result['arrival_time']}")
        print(f"Duration: {result['journey_duration']}")
        print(f"Traffic delay: {result['traffic_delay']}")
        print(f"Traffic: {result['traffic_level']}")


if __name__ == "__main__":
    print("Google Maps Traffic Integration Module")
    print("=" * 50)
    print("\nReplace 'YOUR_API_KEY_HERE' with your actual Google Maps API key")
    print("\nAvailable functions:")
    print("1. get_route_with_traffic() - Get route with live traffic")
    print("2. find_best_route_avoiding_traffic() - Find fastest route")
    print("3. get_traffic_comparison() - Compare traffic at different times")
    print("4. predict_arrival_time() - Predict when you'll arrive")
    print("5. get_live_traffic_conditions() - Check area traffic")
