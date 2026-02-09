"""
Flask Backend for Mumbai Safe Route Navigation — v4  (with Route History)

What changed vs v3:
  • RouteHistoryManager integration — all route searches are logged
  • /api/history — get recent searches
  • /api/history/stats — get statistics for a specific route
  • /api/history/popular — get most frequently searched routes
  • /api/history/clear — clear all history
  • /api/history/<id> DELETE — delete specific entry
  • /api/routes POST now logs every search automatically
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

# Import the history manager
from route_history import RouteHistoryManager

app = Flask(__name__)

# Initialize history manager
history_manager = RouteHistoryManager(storage_path="data/route_history.json")

# ---------------------------------------------------------------------------
# Config (unchanged from v3)
# ---------------------------------------------------------------------------
OWM_KEY = os.environ.get("OPENWEATHER_API_KEY", "")
OWM_URL = "https://api.openweathermap.org/data/2.5/weather"
MUMBAI_LAT, MUMBAI_LON = 19.0760, 72.8777

# Load model artefacts
with open('models/risk_model.pkl', 'rb') as f:
    model_data = pickle.load(f)

with open('models/segment_risk_scores.pkl', 'rb') as f:
    segment_risk_scores = pickle.load(f)

segments_df = pd.read_csv('data/road_segments.csv')

WEATHER_SEVERITY_SCORE = model_data.get("weather_severity_score",
    {"Clear":0,"Rain":4,"Fog":5,"Heavy Rain":8})
WEATHER_RAIN_MM        = model_data.get("weather_rain_mm",
    {"Clear":0.0,"Rain":3.5,"Fog":0.2,"Heavy Rain":12.0})
WEATHER_HUMIDITY       = model_data.get("weather_humidity",
    {"Clear":55,"Rain":82,"Fog":90,"Heavy Rain":88})

WEATHER_RISK_MULTIPLIER = {
    "Clear":      1.00,
    "Rain":       1.20,
    "Fog":        1.21,
    "Heavy Rain": 1.29,
}

MUMBAI_LOCATIONS = {
    "Bandra":        [19.0596, 72.8295],
    "Andheri":       [19.1136, 72.8697],
    "Powai":         [19.1197, 72.9067],
    "Worli":         [19.0176, 72.8125],
    "Marine Drive":  [18.9432, 72.8236],
    "BKC":           [19.0653, 72.8684],
    "Goregaon":      [19.1663, 72.8526],
    "Thane":         [19.1972, 73.0032],
    "Navi Mumbai":   [19.0330, 73.0297],
    "Malad":         [19.1867, 72.8483],
    "Borivali":      [19.2304, 72.8571],
    "Dadar":         [19.0176, 72.8479],
    "Churchgate":    [18.9322, 72.8264],
    "CST":           [18.9398, 72.8355],
    "Lower Parel":   [18.9968, 72.8265],
    "Kurla":         [19.0728, 72.8987],
    "Ghatkopar":     [19.0860, 72.9081],
    "Mulund":        [19.1726, 72.9586],
    "Juhu":          [19.0969, 72.8265],
    "Nariman Point": [18.9256, 72.8235],
}

# ===========================================================================
# Weather helpers (unchanged from v3)
# ===========================================================================
def _normalise_owm(owm_json):
    main_cond   = owm_json.get("weather", [{}])[0].get("main", "Clear")
    description = owm_json.get("weather", [{}])[0].get("description", "").lower()
    rain_mm     = owm_json.get("rain", {}).get("1h", 0.0)
    humidity    = owm_json.get("main", {}).get("humidity", 55)
    temp_c      = owm_json.get("main", {}).get("temp", 28) - 273.15
    wind_kmh    = owm_json.get("wind", {}).get("speed", 0) * 3.6

    fog_mains = {"Mist","Fog","Haze","Smoke","Dust","Sand","Squalls","Ash"}
    if main_cond in ("Clear", "Clouds"):
        condition = "Clear"
    elif main_cond in fog_mains:
        condition = "Fog"
    elif main_cond == "Thunderstorm":
        condition = "Heavy Rain"
    elif main_cond in ("Rain", "Drizzle"):
        if rain_mm >= 7.6 or "heavy" in description or "violent" in description:
            condition = "Heavy Rain"
        else:
            condition = "Rain"
    elif main_cond in ("Snow", "Sleet"):
        condition = "Fog"
    else:
        condition = "Clear"

    return {
        "condition":   condition,
        "rain_mm":     round(rain_mm, 2),
        "humidity":    humidity,
        "temp_c":      round(temp_c, 1),
        "wind_kmh":    round(wind_kmh, 1),
        "description": description,
    }

def _fetch_weather():
    if not OWM_KEY or req_lib is None:
        return {"condition": "Clear", "rain_mm": 0.0, "humidity": 55,
                "temp_c": 28.0, "wind_kmh": 10.0, "description": "clear sky",
                "api_status": "no_key"}
    try:
        resp = req_lib.get(OWM_URL, params={
            "lat": MUMBAI_LAT, "lon": MUMBAI_LON,
            "appid": OWM_KEY, "units": "metric"
        }, timeout=5)
        resp.raise_for_status()
        result = _normalise_owm(resp.json())
        result["api_status"] = "ok"
        return result
    except Exception as e:
        app.logger.warning(f"OWM fetch failed: {e}")
        return {"condition": "Clear", "rain_mm": 0.0, "humidity": 55,
                "temp_c": 28.0, "wind_kmh": 10.0, "description": "API error",
                "api_status": "error"}

# ===========================================================================
# Geometry helpers (unchanged)
# ===========================================================================
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

def calculate_route_risk(waypoints, weather_condition="Clear"):
    multiplier = WEATHER_RISK_MULTIPLIER.get(weather_condition, 1.0)
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
            adjusted_risk = min(100, base_risk * multiplier)
            total_risk += adjusted_risk * leg_dist
            total_dist += leg_dist
            risk_details.append({'road': nearest['road_name'], 'risk': round(adjusted_risk, 2)})
        else:
            total_risk += 40 * multiplier * leg_dist
            total_dist += leg_dist

    avg_risk = total_risk / max(total_dist, 0.001)
    return round(avg_risk, 2), risk_details

def get_route_metadata(waypoints, risk_score):
    total_distance = sum(
        haversine_distance(waypoints[i][0], waypoints[i][1],
                           waypoints[i+1][0], waypoints[i+1][1])
        for i in range(len(waypoints)-1)
    )
    time_minutes = int((total_distance / 30) * 60)
    if risk_score > 60:
        time_minutes = int(time_minutes * 1.15)
    return {'distance_km': round(total_distance, 2), 'time_minutes': time_minutes}


# ===========================================================================
# Routes
# ===========================================================================
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
    end_name   = data.get('end')

    if start_name not in MUMBAI_LOCATIONS:
        return jsonify({'error': 'Start location not found'}), 400
    if end_name not in MUMBAI_LOCATIONS:
        return jsonify({'error': 'End location not found'}), 400

    # Weather
    weather = data.get('weather')
    if weather and isinstance(weather, dict):
        weather_condition = weather.get('condition', 'Clear')
    else:
        weather = _fetch_weather()
        weather_condition = weather.get('condition', 'Clear')

    start_coords = MUMBAI_LOCATIONS[start_name]
    end_coords   = MUMBAI_LOCATIONS[end_name]

    routes = []
    for route_type, route_name in [('direct','Direct Route'),('highway','Via Highway'),('scenic','Scenic Route')]:
        wp = generate_route_waypoints(start_coords, end_coords, route_type)
        risk, details = calculate_route_risk(wp, weather_condition)
        meta = get_route_metadata(wp, risk)
        routes.append({
            'id':           len(routes)+1,
            'name':         route_name,
            'waypoints':    wp,
            'risk_score':   risk,
            'risk_level':   'low' if risk<35 else ('medium' if risk<60 else 'high'),
            'distance_km':  meta['distance_km'],
            'time_minutes': meta['time_minutes'],
            'risk_details': details[:5],
        })

    routes.sort(key=lambda x: x['risk_score'])
    routes[0]['recommended'] = True

    # ═══ LOG TO HISTORY ═══ (NEW)
    # Store the recommended route (or first route if user doesn't specify)
    try:
        history_manager.add_search(
            start=start_name,
            end=end_name,
            chosen_route=routes[0],  # Log the recommended route
            all_routes=routes,
            weather=weather
        )
    except Exception as e:
        app.logger.error(f"Failed to log route history: {e}")

    return jsonify({
        'start':   start_name,
        'end':     end_name,
        'weather': weather,
        'routes':  routes,
    })


@app.route('/api/predict_risk', methods=['POST'])
def predict_risk():
    data = request.get_json()
    now  = datetime.now()

    hour        = data.get('hour',        now.hour)
    day_of_week = data.get('day_of_week', now.weekday())
    weather_cond= data.get('weather',     'Clear')
    rain_mm     = data.get('rain_mm',     WEATHER_RAIN_MM.get(weather_cond, 0.0))
    humidity    = data.get('humidity',    WEATHER_HUMIDITY.get(weather_cond, 55))
    road_type   = data.get('road_type',   'medium')

    model = model_data['model']

    weather_sev       = WEATHER_SEVERITY_SCORE.get(weather_cond, 3)
    road_risk_encoded = {'low':0,'medium':1,'high':2}.get(road_type, 1)
    is_rush_hour      = 1 if (7<=hour<=10) or (17<=hour<=21) else 0
    is_night          = 1 if hour>=22 or hour<=5 else 0
    is_weekend        = 1 if day_of_week>=5 else 0

    features = np.array([[
        hour, day_of_week, now.month,
        is_rush_hour, is_night, is_weekend,
        weather_sev, rain_mm, humidity,
        road_risk_encoded, 0
    ]])

    risk_score = float(model.predict(features)[0])
    risk_score = max(0, min(100, risk_score))
    risk_level = 'low' if risk_score<35 else ('medium' if risk_score<60 else 'high')

    return jsonify({
        'risk_score':     round(risk_score, 2),
        'risk_level':     risk_level,
        'weather_used':   weather_cond,
        'recommendation': 'Use extra caution' if risk_level=='high' else
                          ('Stay alert'       if risk_level=='medium' else 'Safe to travel')
    })


# ===========================================================================
# ═══ NEW HISTORY ENDPOINTS ═══
# ===========================================================================

@app.route('/api/history', methods=['GET'])
def get_history():
    """Get recent route search history."""
    limit = request.args.get('limit', 10, type=int)
    history = history_manager.get_recent(limit=limit)
    return jsonify({
        'success': True,
        'count': len(history),
        'history': history
    })


@app.route('/api/history/all', methods=['GET'])
def get_all_history():
    """Get all route search history."""
    history = history_manager.get_all()
    return jsonify({
        'success': True,
        'count': len(history),
        'history': history
    })


@app.route('/api/history/stats', methods=['GET'])
def get_route_stats():
    """Get statistics for a specific route."""
    start = request.args.get('start')
    end = request.args.get('end')
    
    if not start or not end:
        return jsonify({'error': 'start and end parameters required'}), 400
    
    stats = history_manager.get_search_stats(start, end)
    return jsonify({
        'success': True,
        'route': f"{start} → {end}",
        'stats': stats
    })


@app.route('/api/history/popular', methods=['GET'])
def get_popular_routes():
    """Get most frequently searched routes."""
    limit = request.args.get('limit', 5, type=int)
    popular = history_manager.get_popular_routes(limit=limit)
    return jsonify({
        'success': True,
        'count': len(popular),
        'popular_routes': popular
    })


@app.route('/api/history/clear', methods=['POST'])
def clear_history():
    """Clear all route history."""
    try:
        history_manager.clear_history()
        return jsonify({
            'success': True,
            'message': 'History cleared successfully'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/history/<entry_id>', methods=['DELETE'])
def delete_history_entry(entry_id):
    """Delete a specific history entry."""
    success = history_manager.delete_entry(entry_id)
    
    if success:
        return jsonify({
            'success': True,
            'message': f'Entry {entry_id} deleted'
        })
    else:
        return jsonify({
            'success': False,
            'error': 'Entry not found'
        }), 404


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)