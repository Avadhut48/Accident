"""
Flask Backend for Mumbai Safe Route Navigation
"""
from flask import Flask, render_template, request, jsonify
import pickle
import numpy as np
import pandas as pd
from datetime import datetime
import random
import math
import json
import os

app = Flask(__name__)

# Load ML model and risk scores
with open('models/risk_model.pkl', 'rb') as f:
    model_data = pickle.load(f)

with open('models/segment_risk_scores.pkl', 'rb') as f:
    segment_risk_scores = pickle.load(f)

# Load road data
segments_df = pd.read_csv('data/road_segments.csv')

# Famous Mumbai locations for autocomplete
MUMBAI_LOCATIONS = {
    "Bandra": [19.0596, 72.8295],
    "Andheri": [19.1136, 72.8697],
    "Powai": [19.1197, 72.9067],
    "Worli": [19.0176, 72.8125],
    "Marine Drive": [18.9432, 72.8236],
    "BKC": [19.0653, 72.8684],
    "Goregaon": [19.1663, 72.8526],
    "Thane": [19.1972, 73.0032],
    "Navi Mumbai": [19.0330, 73.0297],
    "Malad": [19.1867, 72.8483],
    "Borivali": [19.2304, 72.8571],
    "Dadar": [19.0176, 72.8479],
    "Churchgate": [18.9322, 72.8264],
    "CST": [18.9398, 72.8355],
    "Lower Parel": [18.9968, 72.8265],
    "Kurla": [19.0728, 72.8987],
    "Ghatkopar": [19.0860, 72.9081],
    "Mulund": [19.1726, 72.9586],
    "Juhu": [19.0969, 72.8265],
    "Nariman Point": [18.9256, 72.8235]
}

def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate distance between two points in km"""
    R = 6371  # Earth's radius in km
    
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    
    return R * c

def generate_route_waypoints(start, end, route_type='direct'):
    """Generate waypoints for a route"""
    start_lat, start_lon = start
    end_lat, end_lon = end
    
    waypoints = [[start_lat, start_lon]]
    
    if route_type == 'direct':
        # Direct route with 5 intermediate points
        for i in range(1, 5):
            t = i / 5
            lat = start_lat + (end_lat - start_lat) * t
            lon = start_lon + (end_lon - start_lon) * t
            waypoints.append([lat, lon])
    
    elif route_type == 'highway':
        # Route via highways (slightly longer)
        mid_lat = (start_lat + end_lat) / 2 + random.uniform(-0.01, 0.01)
        mid_lon = (start_lon + end_lon) / 2 + random.uniform(-0.01, 0.01)
        
        for i in range(1, 3):
            t = i / 3
            lat = start_lat + (mid_lat - start_lat) * t
            lon = start_lon + (mid_lon - start_lon) * t
            waypoints.append([lat, lon])
        
        waypoints.append([mid_lat, mid_lon])
        
        for i in range(1, 3):
            t = i / 3
            lat = mid_lat + (end_lat - mid_lat) * t
            lon = mid_lon + (end_lon - mid_lon) * t
            waypoints.append([lat, lon])
    
    elif route_type == 'scenic':
        # Longer scenic route
        offset = 0.015
        mid_lat = (start_lat + end_lat) / 2 + offset
        mid_lon = (start_lon + end_lon) / 2 - offset
        
        for i in range(1, 4):
            t = i / 4
            lat = start_lat + (mid_lat - start_lat) * t
            lon = start_lon + (mid_lon - start_lon) * t
            waypoints.append([lat, lon])
        
        waypoints.append([mid_lat, mid_lon])
        
        for i in range(1, 4):
            t = i / 4
            lat = mid_lat + (end_lat - mid_lat) * t
            lon = mid_lon + (end_lon - mid_lon) * t
            waypoints.append([lat, lon])
    
    waypoints.append([end_lat, end_lon])
    return waypoints

def calculate_route_risk(waypoints):
    """Calculate risk score for a route based on waypoints"""
    total_risk = 0
    risk_details = []
    
    for i in range(len(waypoints) - 1):
        lat, lon = waypoints[i]
        
        # Find nearest road segments
        min_distance = float('inf')
        nearest_segment = None
        
        for _, segment in segments_df.iterrows():
            dist = haversine_distance(
                lat, lon,
                segment['start_lat'], segment['start_lon']
            )
            if dist < min_distance:
                min_distance = dist
                nearest_segment = segment
        
        # Get risk score for this segment
        if nearest_segment is not None:
            segment_id = nearest_segment['segment_id']
            if segment_id in segment_risk_scores:
                segment_risk = segment_risk_scores[segment_id]['risk_score']
            else:
                # Default risk based on road type
                risk_map = {'low': 20, 'medium': 40, 'high': 70}
                segment_risk = risk_map.get(nearest_segment['risk_level'], 40)
            
            total_risk += segment_risk
            risk_details.append({
                'road': nearest_segment['road_name'],
                'risk': segment_risk
            })
    
    # Average risk
    avg_risk = total_risk / max(len(waypoints) - 1, 1)
    
    return round(avg_risk, 2), risk_details

def get_route_metadata(waypoints, risk_score):
    """Calculate route metadata (distance, time)"""
    total_distance = 0
    
    for i in range(len(waypoints) - 1):
        dist = haversine_distance(
            waypoints[i][0], waypoints[i][1],
            waypoints[i+1][0], waypoints[i+1][1]
        )
        total_distance += dist
    
    # Estimate time based on average speed (30 km/h in Mumbai traffic)
    avg_speed = 30
    time_hours = total_distance / avg_speed
    time_minutes = int(time_hours * 60)
    
    # Adjust time based on risk (high risk = slower)
    if risk_score > 60:
        time_minutes = int(time_minutes * 1.15)
    
    return {
        'distance_km': round(total_distance, 2),
        'time_minutes': time_minutes
    }

@app.route('/')
def index():
    """Render main page"""
    return render_template('index.html', locations=MUMBAI_LOCATIONS)

@app.route('/api/locations', methods=['GET'])
def get_locations():
    """Get list of Mumbai locations for autocomplete"""
    return jsonify(MUMBAI_LOCATIONS)

@app.route('/api/routes', methods=['POST'])
def get_safe_routes():
    """Generate and analyze multiple routes"""
    data = request.get_json()
    
    start_name = data.get('start')
    end_name = data.get('end')
    
    # Get coordinates
    if start_name in MUMBAI_LOCATIONS:
        start_coords = MUMBAI_LOCATIONS[start_name]
    else:
        return jsonify({'error': 'Start location not found'}), 400
    
    if end_name in MUMBAI_LOCATIONS:
        end_coords = MUMBAI_LOCATIONS[end_name]
    else:
        return jsonify({'error': 'End location not found'}), 400
    
    # Generate 3 alternative routes
    routes = []
    
    # Route 1: Direct route
    waypoints1 = generate_route_waypoints(start_coords, end_coords, 'direct')
    risk1, details1 = calculate_route_risk(waypoints1)
    meta1 = get_route_metadata(waypoints1, risk1)
    
    routes.append({
        'id': 1,
        'name': 'Direct Route',
        'waypoints': waypoints1,
        'risk_score': risk1,
        'risk_level': 'low' if risk1 < 35 else ('medium' if risk1 < 60 else 'high'),
        'distance_km': meta1['distance_km'],
        'time_minutes': meta1['time_minutes'],
        'risk_details': details1[:5]  # Top 5 risky segments
    })
    
    # Route 2: Via Highway
    waypoints2 = generate_route_waypoints(start_coords, end_coords, 'highway')
    risk2, details2 = calculate_route_risk(waypoints2)
    meta2 = get_route_metadata(waypoints2, risk2)
    
    routes.append({
        'id': 2,
        'name': 'Via Highway',
        'waypoints': waypoints2,
        'risk_score': risk2,
        'risk_level': 'low' if risk2 < 35 else ('medium' if risk2 < 60 else 'high'),
        'distance_km': meta2['distance_km'],
        'time_minutes': meta2['time_minutes'],
        'risk_details': details2[:5]
    })
    
    # Route 3: Scenic route
    waypoints3 = generate_route_waypoints(start_coords, end_coords, 'scenic')
    risk3, details3 = calculate_route_risk(waypoints3)
    meta3 = get_route_metadata(waypoints3, risk3)
    
    routes.append({
        'id': 3,
        'name': 'Scenic Route',
        'waypoints': waypoints3,
        'risk_score': risk3,
        'risk_level': 'low' if risk3 < 35 else ('medium' if risk3 < 60 else 'high'),
        'distance_km': meta3['distance_km'],
        'time_minutes': meta3['time_minutes'],
        'risk_details': details3[:5]
    })
    
    # Sort by risk score (safest first)
    routes.sort(key=lambda x: x['risk_score'])
    
    # Mark recommended route
    routes[0]['recommended'] = True
    
    return jsonify({
        'start': start_name,
        'end': end_name,
        'routes': routes
    })

@app.route('/api/predict_risk', methods=['POST'])
def predict_risk():
    """Predict risk using ML model for specific conditions"""
    data = request.get_json()
    
    # Extract features
    hour = data.get('hour', datetime.now().hour)
    day_of_week = data.get('day_of_week', datetime.now().weekday())
    weather = data.get('weather', 'Clear')
    road_type = data.get('road_type', 'medium')
    
    # Prepare features
    model = model_data['model']
    le_weather = model_data['le_weather']
    
    # Encode features
    weather_encoded = le_weather.transform([weather])[0] if weather in le_weather.classes_ else 0
    road_risk_encoded = {'low': 0, 'medium': 1, 'high': 2}.get(road_type, 1)
    
    is_rush_hour = 1 if (7 <= hour <= 10) or (17 <= hour <= 21) else 0
    is_night = 1 if (hour >= 22) or (hour <= 5) else 0
    is_weekend = 1 if day_of_week >= 5 else 0
    
    features = np.array([[
        hour, day_of_week, datetime.now().month,
        is_rush_hour, is_night, is_weekend,
        weather_encoded, road_risk_encoded, 0  # vehicle_encoded default
    ]])
    
    # Predict
    prediction = model.predict(features)[0]
    probability = model.predict_proba(features)[0]
    
    return jsonify({
        'is_high_risk': bool(prediction),
        'risk_probability': float(probability[1]),
        'recommendation': 'Use caution' if prediction else 'Safe to travel'
    })

# ==================== FAVORITES ENDPOINTS ====================

# File to store favorites
FAVORITES_FILE = 'data/favorites.json'

def load_favorites():
    """Load favorites from JSON file"""
    try:
        if os.path.exists(FAVORITES_FILE):
            with open(FAVORITES_FILE, 'r') as f:
                return json.load(f)
        return []
    except Exception as e:
        print(f"Error loading favorites: {e}")
        return []

def save_favorites(favorites):
    """Save favorites to JSON file"""
    try:
        os.makedirs(os.path.dirname(FAVORITES_FILE), exist_ok=True)
        with open(FAVORITES_FILE, 'w') as f:
            json.dump(favorites, f, indent=2)
        return True
    except Exception as e:
        print(f"Error saving favorites: {e}")
        return False

@app.route('/api/favorites', methods=['GET'])
def get_favorites():
    """Get all saved favorite routes"""
    favorites = load_favorites()
    return jsonify({
        'success': True,
        'favorites': favorites,
        'count': len(favorites)
    })

@app.route('/api/favorites', methods=['POST'])
def add_favorite():
    """Add a new favorite route"""
    try:
        data = request.get_json()
        
        # Validate input
        if not data.get('name') or not data.get('start') or not data.get('end'):
            return jsonify({
                'success': False,
                'error': 'Missing required fields: name, start, end'
            }), 400
        
        # Load existing favorites
        favorites = load_favorites()
        
        # Check if name already exists
        if any(fav['name'] == data['name'] for fav in favorites):
            return jsonify({
                'success': False,
                'error': 'A favorite with this name already exists'
            }), 400
        
        # Create new favorite
        new_favorite = {
            'id': len(favorites) + 1,
            'name': data['name'],
            'start': data['start'],
            'end': data['end'],
            'created_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'used_count': 0
        }
        
        # Add to list
        favorites.append(new_favorite)
        
        # Save to file
        if save_favorites(favorites):
            return jsonify({
                'success': True,
                'message': 'Favorite route saved successfully',
                'favorite': new_favorite
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to save favorite'
            }), 500
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/favorites/<int:favorite_id>', methods=['DELETE'])
def delete_favorite(favorite_id):
    """Delete a favorite route"""
    try:
        favorites = load_favorites()
        
        # Find and remove the favorite
        favorites = [fav for fav in favorites if fav['id'] != favorite_id]
        
        if save_favorites(favorites):
            return jsonify({
                'success': True,
                'message': 'Favorite deleted successfully'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to delete favorite'
            }), 500
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/favorites/<int:favorite_id>/use', methods=['POST'])
def use_favorite(favorite_id):
    """Increment usage count when favorite is used"""
    try:
        favorites = load_favorites()
        
        # Find and update the favorite
        for fav in favorites:
            if fav['id'] == favorite_id:
                fav['used_count'] = fav.get('used_count', 0) + 1
                fav['last_used'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                break
        
        if save_favorites(favorites):
            return jsonify({
                'success': True,
                'message': 'Usage recorded'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to update favorite'
            }), 500
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)