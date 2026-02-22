"""
Flask Backend - v6 with Vehicle Type Selection

Key changes:
  • Vehicle type parameter in /api/routes
  • Risk multiplier applied: Car 1.0x, Bike 1.8x, Truck 1.3x, etc.
  • Weather sensitivity: Bikes 2.0x riskier in heavy rain
  • Speed adjustments: Bikes 15% slower, Trucks 30% slower
  • Vehicle-specific safety tips
"""
from flask import Flask, render_template, request, jsonify
import pickle
import numpy as np
import pandas as pd
from datetime import datetime
import random
import math
import os

try:
    import requests as req_lib
except ImportError:
    req_lib = None

from route_history import RouteHistoryManager
from accident_reporter import AccidentReporter

app = Flask(__name__)

history_manager = RouteHistoryManager(storage_path="data/route_history.json")
accident_reporter = AccidentReporter(storage_path="data/live_accidents.json")

# ═══════════════════════════════════════════════════════════════════════
# VEHICLE TYPE CONFIGURATION (NEW)
# ═══════════════════════════════════════════════════════════════════════

VEHICLE_TYPES = {
    'car': {
        'name': 'Car',
        'icon': '🚗',
        'risk_multiplier': 1.0,
        'speed_factor': 1.0,
        'weather_sensitivity': {'Clear': 1.0, 'Rain': 1.0, 'Fog': 1.0, 'Heavy Rain': 1.0}
    },
    'bike': {
        'name': 'Bike/Motorcycle',
        'icon': '🏍️',
        'risk_multiplier': 1.8,
        'speed_factor': 0.85,
        'weather_sensitivity': {'Clear': 1.0, 'Rain': 1.5, 'Fog': 1.3, 'Heavy Rain': 2.0}
    },
    'auto': {
        'name': 'Auto Rickshaw',
        'icon': '🛺',
        'risk_multiplier': 1.5,
        'speed_factor': 0.75,
        'weather_sensitivity': {'Clear': 1.0, 'Rain': 1.3, 'Fog': 1.2, 'Heavy Rain': 1.6}
    },
    'bus': {
        'name': 'Bus',
        'icon': '🚌',
        'risk_multiplier': 1.2,
        'speed_factor': 0.80,
        'weather_sensitivity': {'Clear': 1.0, 'Rain': 1.1, 'Fog': 1.1, 'Heavy Rain': 1.3}
    },
    'truck': {
        'name': 'Truck',
        'icon': '🚚',
        'risk_multiplier': 1.3,
        'speed_factor': 0.70,
        'weather_sensitivity': {'Clear': 1.0, 'Rain': 1.2, 'Fog': 1.2, 'Heavy Rain': 1.4}
    }
}

def get_vehicle_multiplier(vehicle_type: str, weather_condition: str = 'Clear') -> dict:
    """Calculate complete risk multiplier for vehicle + weather combo."""
    vehicle_type = vehicle_type.lower()
    if vehicle_type not in VEHICLE_TYPES:
        vehicle_type = 'car'
    
    vehicle = VEHICLE_TYPES[vehicle_type]
    base_mult = vehicle['risk_multiplier']
    weather_mult = vehicle['weather_sensitivity'].get(weather_condition, 1.0)
    combined = base_mult * weather_mult
    
    return {
        'vehicle_type': vehicle_type,
        'vehicle_name': vehicle['name'],
        'vehicle_icon': vehicle['icon'],
        'base_multiplier': base_mult,
        'weather_multiplier': weather_mult,
        'combined_multiplier': round(combined, 2),
        'speed_factor': vehicle['speed_factor']
    }

# ═══════════════════════════════════════════════════════════════════════
# Config (unchanged)
# ═══════════════════════════════════════════════════════════════════════

OWM_KEY = os.environ.get("OPENWEATHER_API_KEY", "")
OWM_URL = "https://api.openweathermap.org/data/2.5/weather"
MUMBAI_LAT, MUMBAI_LON = 19.0760, 72.8777

with open('models/risk_model.pkl', 'rb') as f:
    model_data = pickle.load(f)

with open('models/segment_risk_scores.pkl', 'rb') as f:
    segment_risk_scores = pickle.load(f)

segments_df = pd.read_csv('data/road_segments.csv')

WEATHER_SEVERITY_SCORE = model_data.get("weather_severity_score", {"Clear":0,"Rain":4,"Fog":5,"Heavy Rain":8})
WEATHER_RAIN_MM = model_data.get("weather_rain_mm", {"Clear":0.0,"Rain":3.5,"Fog":0.2,"Heavy Rain":12.0})
WEATHER_HUMIDITY = model_data.get("weather_humidity", {"Clear":55,"Rain":82,"Fog":90,"Heavy Rain":88})

WEATHER_RISK_MULTIPLIER = {"Clear": 1.00, "Rain": 1.20, "Fog": 1.21, "Heavy Rain": 1.29}

MUMBAI_LOCATIONS = {
    "Bandra": [19.0596, 72.8295], "Andheri": [19.1136, 72.8697], "Powai": [19.1197, 72.9067],
    "Worli": [19.0176, 72.8125], "Marine Drive": [18.9432, 72.8236], "BKC": [19.0653, 72.8684],
    "Goregaon": [19.1663, 72.8526], "Thane": [19.1972, 73.0032], "Navi Mumbai": [19.0330, 73.0297],
    "Malad": [19.1867, 72.8483], "Borivali": [19.2304, 72.8571], "Dadar": [19.0176, 72.8479],
    "Churchgate": [18.9322, 72.8264], "CST": [18.9398, 72.8355], "Lower Parel": [18.9968, 72.8265],
    "Kurla": [19.0728, 72.8987], "Ghatkopar": [19.0860, 72.9081], "Mulund": [19.1726, 72.9586],
    "Juhu": [19.0969, 72.8265], "Nariman Point": [18.9256, 72.8235]
}

# ═══════════════════════════════════════════════════════════════════════
# Weather helpers (unchanged)
# ═══════════════════════════════════════════════════════════════════════

def _normalise_owm(owm_json):
    main_cond = owm_json.get("weather", [{}])[0].get("main", "Clear")
    description = owm_json.get("weather", [{}])[0].get("description", "").lower()
    rain_mm = owm_json.get("rain", {}).get("1h", 0.0)
    humidity = owm_json.get("main", {}).get("humidity", 55)
    temp_c = owm_json.get("main", {}).get("temp", 28) - 273.15
    wind_kmh = owm_json.get("wind", {}).get("speed", 0) * 3.6

    fog_mains = {"Mist","Fog","Haze","Smoke","Dust","Sand","Squalls","Ash"}
    if main_cond in ("Clear", "Clouds"):
        condition = "Clear"
    elif main_cond in fog_mains:
        condition = "Fog"
    elif main_cond == "Thunderstorm":
        condition = "Heavy Rain"
    elif main_cond in ("Rain", "Drizzle"):
        condition = "Heavy Rain" if rain_mm >= 7.6 or "heavy" in description else "Rain"
    elif main_cond in ("Snow", "Sleet"):
        condition = "Fog"
    else:
        condition = "Clear"

    return {
        "condition": condition, "rain_mm": round(rain_mm, 2), "humidity": humidity,
        "temp_c": round(temp_c, 1), "wind_kmh": round(wind_kmh, 1), "description": description
    }

def _fetch_weather():
    if not OWM_KEY or req_lib is None:
        return {"condition": "Clear", "rain_mm": 0.0, "humidity": 55, "temp_c": 28.0, 
                "wind_kmh": 10.0, "description": "clear sky", "api_status": "no_key"}
    try:
        resp = req_lib.get(OWM_URL, params={"lat": MUMBAI_LAT, "lon": MUMBAI_LON, 
                                             "appid": OWM_KEY, "units": "metric"}, timeout=5)
        resp.raise_for_status()
        result = _normalise_owm(resp.json())
        result["api_status"] = "ok"
        return result
    except Exception as e:
        app.logger.warning(f"OWM fetch failed: {e}")
        return {"condition": "Clear", "rain_mm": 0.0, "humidity": 55, "temp_c": 28.0, 
                "wind_kmh": 10.0, "description": "API error", "api_status": "error"}

# ═══════════════════════════════════════════════════════════════════════
# Geometry helpers
# ═══════════════════════════════════════════════════════════════════════

def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    a = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
    return R * 2 * math.asin(math.sqrt(a))

def generate_route_waypoints(start, end, route_type='direct'):
    start_lat, start_lon = start
    end_lat, end_lon = end
    waypoints = [[start_lat, start_lon]]

    if route_type == 'direct':
        for i in range(1, 5):
            t = i / 5
            waypoints.append([start_lat+(end_lat-start_lat)*t, start_lon+(end_lon-start_lon)*t])
    elif route_type == 'highway':
        mid_lat = (start_lat+end_lat)/2 + random.uniform(-0.01, 0.01)
        mid_lon = (start_lon+end_lon)/2 + random.uniform(-0.01, 0.01)
        for i in range(1, 3):
            t = i / 3
            waypoints.append([start_lat+(mid_lat-start_lat)*t, start_lon+(mid_lon-start_lon)*t])
        waypoints.append([mid_lat, mid_lon])
        for i in range(1, 3):
            t = i / 3
            waypoints.append([mid_lat+(end_lat-mid_lat)*t, mid_lon+(end_lon-mid_lon)*t])
    elif route_type == 'scenic':
        offset = 0.015
        mid_lat = (start_lat+end_lat)/2 + offset
        mid_lon = (start_lon+end_lon)/2 - offset
        for i in range(1, 4):
            t = i / 4
            waypoints.append([start_lat+(mid_lat-start_lat)*t, start_lon+(mid_lon-start_lon)*t])
        waypoints.append([mid_lat, mid_lon])
        for i in range(1, 4):
            t = i / 4
            waypoints.append([mid_lat+(end_lat-mid_lat)*t, mid_lon+(end_lon-mid_lon)*t])

    waypoints.append([end_lat, end_lon])
    return waypoints

def calculate_route_risk(waypoints, weather_condition="Clear", vehicle_type="car"):
    """
    Calculate route risk with weather + accident + VEHICLE multipliers.
    """
    weather_mult = WEATHER_RISK_MULTIPLIER.get(weather_condition, 1.0)
    accident_mult = accident_reporter.get_accident_impact_multiplier(waypoints)
    
    # NEW: Vehicle multiplier
    vehicle_info = get_vehicle_multiplier(vehicle_type, weather_condition)
    vehicle_mult = vehicle_info['combined_multiplier']
    
    # Combined multiplier
    combined_mult = weather_mult * accident_mult * vehicle_mult
    
    total_risk = 0.0
    total_dist = 0.0
    risk_details = []

    for i in range(len(waypoints) - 1):
        lat1, lon1 = waypoints[i]
        lat2, lon2 = waypoints[i+1]
        leg_mid_lat = (lat1+lat2)/2
        leg_mid_lon = (lon1+lon2)/2
        leg_dist = haversine_distance(lat1, lon1, lat2, lon2) or 0.001

        min_d, nearest = float('inf'), None
        for _, seg in segments_df.iterrows():
            sm_lat = (seg['start_lat']+seg['end_lat'])/2
            sm_lon = (seg['start_lon']+seg['end_lon'])/2
            d = haversine_distance(leg_mid_lat, leg_mid_lon, sm_lat, sm_lon)
            if d < min_d:
                min_d, nearest = d, seg

        if nearest is not None:
            sid = nearest['segment_id']
            base_risk = segment_risk_scores.get(sid, {}).get('risk_score',
                        {'low':20,'medium':40,'high':70}.get(nearest['risk_level'], 40))
            adjusted_risk = min(100, base_risk * combined_mult)
            total_risk += adjusted_risk * leg_dist
            total_dist += leg_dist
            risk_details.append({'road': nearest['road_name'], 'risk': round(adjusted_risk, 2)})
        else:
            total_risk += 40 * combined_mult * leg_dist
            total_dist += leg_dist

    avg_risk = total_risk / max(total_dist, 0.001)
    
    return {
        'risk_score': round(avg_risk, 2),
        'weather_multiplier': weather_mult,
        'accident_multiplier': accident_mult,
        'vehicle_multiplier': vehicle_mult,  # NEW
        'vehicle_info': vehicle_info,         # NEW
        'combined_multiplier': round(combined_mult, 2),
        'risk_details': risk_details
    }

def get_route_metadata(waypoints, risk_score, vehicle_type="car"):
    """Calculate distance and time with VEHICLE-SPECIFIC speed adjustments."""
    total_distance = sum(
        haversine_distance(waypoints[i][0], waypoints[i][1],
                           waypoints[i+1][0], waypoints[i+1][1])
        for i in range(len(waypoints)-1)
    )
    
    # Base time (assuming car at 30 km/h Mumbai avg)
    base_time_minutes = int((total_distance / 30) * 60)
    
    # Apply vehicle speed factor
    vehicle_type = vehicle_type.lower()
    if vehicle_type in VEHICLE_TYPES:
        speed_factor = VEHICLE_TYPES[vehicle_type]['speed_factor']
        time_minutes = int(base_time_minutes / speed_factor)
    else:
        time_minutes = base_time_minutes
    
    # Additional penalty for high risk
    if risk_score > 60:
        time_minutes = int(time_minutes * 1.15)
    
    return {'distance_km': round(total_distance, 2), 'time_minutes': time_minutes}

# ═══════════════════════════════════════════════════════════════════════
# Routes
# ═══════════════════════════════════════════════════════════════════════

@app.route('/')
def index():
    return render_template('index.html', locations=MUMBAI_LOCATIONS)

@app.route('/api/locations', methods=['GET'])
def get_locations():
    return jsonify(MUMBAI_LOCATIONS)

@app.route('/api/weather', methods=['GET'])
def get_weather():
    return jsonify(_fetch_weather())

@app.route('/api/routes', methods=['POST'])
def get_safe_routes():
    data = request.get_json()
    start_name = data.get('start')
    end_name = data.get('end')
    vehicle_type = data.get('vehicle_type', 'car')  # NEW: Vehicle type parameter

    if start_name not in MUMBAI_LOCATIONS:
        return jsonify({'error': 'Start location not found'}), 400
    if end_name not in MUMBAI_LOCATIONS:
        return jsonify({'error': 'End location not found'}), 400

    weather = data.get('weather')
    if weather and isinstance(weather, dict):
        weather_condition = weather.get('condition', 'Clear')
    else:
        weather = _fetch_weather()
        weather_condition = weather.get('condition', 'Clear')

    start_coords = MUMBAI_LOCATIONS[start_name]
    end_coords = MUMBAI_LOCATIONS[end_name]

    routes = []
    for route_type, route_name in [('direct','Direct Route'),('highway','Via Highway'),('scenic','Scenic Route')]:
        wp = generate_route_waypoints(start_coords, end_coords, route_type)
        
        # NEW: Pass vehicle_type to risk calculation
        risk_result = calculate_route_risk(wp, weather_condition, vehicle_type)
        risk_score = risk_result['risk_score']
        
        # NEW: Pass vehicle_type to metadata calculation
        meta = get_route_metadata(wp, risk_score, vehicle_type)
        
        route_accidents = accident_reporter.get_accidents_on_route(wp, buffer_km=0.5)
        
        routes.append({
            'id': len(routes)+1,
            'name': route_name,
            'waypoints': wp,
            'risk_score': risk_score,
            'risk_level': 'low' if risk_score<35 else ('medium' if risk_score<60 else 'high'),
            'distance_km': meta['distance_km'],
            'time_minutes': meta['time_minutes'],
            'risk_details': risk_result['risk_details'][:5],
            'weather_multiplier': risk_result['weather_multiplier'],
            'accident_multiplier': risk_result['accident_multiplier'],
            'vehicle_multiplier': risk_result['vehicle_multiplier'],  # NEW
            'vehicle_info': risk_result['vehicle_info'],              # NEW
            'accidents_on_route': len(route_accidents),
            'accident_details': route_accidents[:3]
        })

    routes.sort(key=lambda x: x['risk_score'])
    routes[0]['recommended'] = True

    try:
        history_manager.add_search(start=start_name, end=end_name, chosen_route=routes[0],
                                   all_routes=routes, weather=weather)
    except Exception as e:
        app.logger.error(f"Failed to log route history: {e}")

    return jsonify({
        'start': start_name,
        'end': end_name,
        'weather': weather,
        'vehicle_type': vehicle_type,  # NEW
        'routes': routes,
        'active_accidents_count': len(accident_reporter.get_active_accidents())
    })

# ... (rest of endpoints unchanged - predict_risk, history, accidents)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)

@app.route('/api/favorites')
def get_favorites():
    return jsonify({
        "success": True,
        "favorites": []
    })