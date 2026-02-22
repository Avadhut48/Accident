from flask import Flask, render_template, request, jsonify
import pickle
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import random
import math
import os
import json
import uuid

app = Flask(__name__)

# ═══════════════════════════════════════════════════════════════════════
# ACCIDENT REPORTER CLASS
# ═══════════════════════════════════════════════════════════════════════
class AccidentReporter:
    def __init__(self, storage_path="data/live_accidents.json"):
        self.storage_path = storage_path
        os.makedirs(os.path.dirname(storage_path), exist_ok=True)
        if not os.path.exists(storage_path):
            with open(storage_path, 'w') as f:
                json.dump([], f)
    
    def report_accident(self, latitude, longitude, severity="moderate", description=""):
        accidents = self._load_accidents()
        accident = {
            "id": f"acc_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{random.randint(1000,9999)}",
            "timestamp": datetime.now().isoformat(),
            "expires_at": (datetime.now() + timedelta(hours=2)).isoformat(),
            "latitude": latitude,
            "longitude": longitude,
            "severity": severity,
            "description": description,
            "upvotes": 0,
            "downvotes": 0,
            "verified": False
        }
        accidents.append(accident)
        self._save_accidents(accidents)
        return {"success": True, "accident": accident}
    
    def get_active_accidents(self):
        accidents = self._load_accidents()
        now = datetime.now()
        active = [acc for acc in accidents if datetime.fromisoformat(acc['expires_at']) > now]
        self._save_accidents(active) 
        return active
    
    def vote_accident(self, accident_id, vote_type):
        accidents = self._load_accidents()
        for acc in accidents:
            if acc['id'] == accident_id:
                if vote_type == 'up':
                    acc['upvotes'] += 1
                    if acc['upvotes'] >= 3:
                        acc['verified'] = True
                elif vote_type == 'down':
                    acc['downvotes'] += 1
                if acc['downvotes'] >= 5:
                    accidents.remove(acc)
                    self._save_accidents(accidents)
                    return {"success": True, "removed": True}
                break
        self._save_accidents(accidents)
        return {"success": True}
    
    def get_accidents_on_route(self, waypoints, buffer_km=0.5):
        accidents = self.get_active_accidents()
        route_accidents = []
        for acc in accidents:
            acc_lat, acc_lon = acc['latitude'], acc['longitude']
            for wp in waypoints:
                dist = self._haversine(wp[0], wp[1], acc_lat, acc_lon)
                if dist <= buffer_km:
                    route_accidents.append({
                        'severity': acc['severity'],
                        'distance_from_route_km': round(dist, 2),
                        'description': acc.get('description', '')
                    })
                    break
        return route_accidents
    
    def get_accident_impact_multiplier(self, waypoints):
        accidents = self.get_accidents_on_route(waypoints, buffer_km=1.0)
        if not accidents: return 1.0
        severity_weights = {'minor': 1.05, 'moderate': 1.15, 'severe': 1.30, 'fatal': 1.50}
        total_mult = 1.0
        for acc in accidents:
            weight = severity_weights.get(acc['severity'], 1.10)
            total_mult *= weight
        return min(total_mult, 2.0)
    
    def _haversine(self, lat1, lon1, lat2, lon2):
        R = 6371
        lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
        dlat, dlon = lat2 - lat1, lon2 - lon1
        a = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
        return R * 2 * math.asin(math.sqrt(a))
    
    def _load_accidents(self):
        try:
            with open(self.storage_path, 'r') as f: return json.load(f)
        except: return []
    
    def _save_accidents(self, accidents):
        with open(self.storage_path, 'w') as f: json.dump(accidents, f, indent=2)

accident_reporter = AccidentReporter()

# ═══════════════════════════════════════════════════════════════════════
# VEHICLE & ROUTE LOGIC
# ═══════════════════════════════════════════════════════════════════════
VEHICLE_TYPES = {
    'car': {'name': 'Car', 'icon': '🚗', 'risk_multiplier': 1.0, 'speed_factor': 1.0},
    'bike': {'name': 'Motorcycle', 'icon': '🏍️', 'risk_multiplier': 1.8, 'speed_factor': 0.85},
    'auto': {'name': 'Auto Rickshaw', 'icon': '🛺', 'risk_multiplier': 1.5, 'speed_factor': 0.75},
    'bus': {'name': 'Bus', 'icon': '🚌', 'risk_multiplier': 1.2, 'speed_factor': 0.80},
    'truck': {'name': 'Truck', 'icon': '🚚', 'risk_multiplier': 1.3, 'speed_factor': 0.70}
}

def get_vehicle_multiplier(vehicle_type: str) -> dict:
    vehicle_type = vehicle_type.lower()
    if vehicle_type not in VEHICLE_TYPES: vehicle_type = 'car'
    vehicle = VEHICLE_TYPES[vehicle_type]
    return {'vehicle_type': vehicle_type, 'vehicle_name': vehicle['name'], 'vehicle_icon': vehicle['icon'], 'combined_multiplier': vehicle['risk_multiplier'], 'speed_factor': vehicle['speed_factor']}

try:
    with open('models/risk_model.pkl', 'rb') as f: model_data = pickle.load(f)
    with open('models/segment_risk_scores.pkl', 'rb') as f: segment_risk_scores = pickle.load(f)
    segments_df = pd.read_csv('data/road_segments.csv')
except:
    model_data, segment_risk_scores = None, {}
    segments_df = pd.DataFrame(columns=['segment_id', 'start_lat', 'start_lon', 'end_lat', 'end_lon', 'road_name'])

MUMBAI_LOCATIONS = {
    "Bandra": [19.0596, 72.8295], "Andheri": [19.1136, 72.8697], "Powai": [19.1197, 72.9067], "Worli": [19.0176, 72.8125],
    "Marine Drive": [18.9432, 72.8236], "BKC": [19.0653, 72.8684], "Goregaon": [19.1663, 72.8526], "Thane": [19.1972, 73.0032],
    "Navi Mumbai": [19.0330, 73.0297], "Malad": [19.1867, 72.8483], "Borivali": [19.2304, 72.8571], "Dadar": [19.0176, 72.8479],
    "Churchgate": [18.9322, 72.8264], "CST": [18.9398, 72.8355], "Lower Parel": [18.9968, 72.8265], "Kurla": [19.0728, 72.8987],
    "Ghatkopar": [19.0860, 72.9081], "Mulund": [19.1726, 72.9586], "Juhu": [19.0969, 72.8265], "Nariman Point": [18.9256, 72.8235]
}

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
        for i in range(1, 5): waypoints.append([start_lat+(end_lat-start_lat)*(i/5), start_lon+(end_lon-start_lon)*(i/5)])
    elif route_type == 'highway':
        mid_lat, mid_lon = (start_lat+end_lat)/2 + random.uniform(-0.01, 0.01), (start_lon+end_lon)/2 + random.uniform(-0.01, 0.01)
        for i in range(1, 3): waypoints.append([start_lat+(mid_lat-start_lat)*(i/3), start_lon+(mid_lon-start_lon)*(i/3)])
        waypoints.append([mid_lat, mid_lon])
        for i in range(1, 3): waypoints.append([mid_lat+(end_lat-mid_lat)*(i/3), mid_lon+(end_lon-mid_lon)*(i/3)])
    elif route_type == 'scenic':
        offset = 0.015
        mid_lat, mid_lon = (start_lat+end_lat)/2 + offset, (start_lon+end_lon)/2 - offset
        for i in range(1, 4): waypoints.append([start_lat+(mid_lat-start_lat)*(i/4), start_lon+(mid_lon-start_lon)*(i/4)])
        waypoints.append([mid_lat, mid_lon])
        for i in range(1, 4): waypoints.append([mid_lat+(end_lat-mid_lat)*(i/4), mid_lon+(end_lon-mid_lon)*(i/4)])
    waypoints.append([end_lat, end_lon])
    return waypoints

def calculate_route_risk(waypoints, vehicle_type="car"):
    accident_mult = accident_reporter.get_accident_impact_multiplier(waypoints)
    vehicle_info = get_vehicle_multiplier(vehicle_type)
    vehicle_mult = vehicle_info['combined_multiplier']
    combined_mult = accident_mult * vehicle_mult
    total_risk, total_dist, risk_details = 0.0, 0.0, []

    for i in range(len(waypoints) - 1):
        lat1, lon1 = waypoints[i]
        lat2, lon2 = waypoints[i+1]
        leg_mid_lat, leg_mid_lon = (lat1+lat2)/2, (lon1+lon2)/2
        leg_dist = haversine_distance(lat1, lon1, lat2, lon2) or 0.001
        min_d, nearest = float('inf'), None
        
        for _, seg in segments_df.iterrows():
            sm_lat, sm_lon = (seg['start_lat']+seg['end_lat'])/2, (seg['start_lon']+seg['end_lon'])/2
            d = haversine_distance(leg_mid_lat, leg_mid_lon, sm_lat, sm_lon)
            if d < min_d: min_d, nearest = d, seg

        if nearest is not None:
            base_risk = segment_risk_scores.get(nearest['segment_id'], {}).get('risk_score', 40)
            adjusted_risk = min(100, base_risk * combined_mult)
            total_risk += adjusted_risk * leg_dist
            risk_details.append({'road': nearest['road_name'], 'risk': round(adjusted_risk, 2)})
        else:
            total_risk += 40 * combined_mult * leg_dist
        total_dist += leg_dist

    avg_risk = total_risk / max(total_dist, 0.001)
    return {'risk_score': round(avg_risk, 2), 'accident_multiplier': accident_mult, 'vehicle_multiplier': vehicle_mult, 'vehicle_info': vehicle_info, 'combined_multiplier': round(combined_mult, 2), 'risk_details': risk_details}

def get_route_metadata(waypoints, risk_score, vehicle_type="car"):
    total_distance = sum(haversine_distance(waypoints[i][0], waypoints[i][1], waypoints[i+1][0], waypoints[i+1][1]) for i in range(len(waypoints)-1))
    base_time_minutes = int((total_distance / 30) * 60)
    speed_factor = VEHICLE_TYPES.get(vehicle_type.lower(), VEHICLE_TYPES['car'])['speed_factor']
    time_minutes = int(base_time_minutes / speed_factor)
    if risk_score > 60: time_minutes = int(time_minutes * 1.15)
    return {'distance_km': round(total_distance, 2), 'time_minutes': time_minutes}

# ═══════════════════════════════════════════════════════════════════════
# API ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════
@app.route('/')
def index():
    return render_template('index.html', locations=MUMBAI_LOCATIONS)

@app.route('/api/routes', methods=['POST'])
def get_safe_routes():
    data = request.get_json()
    start_name, end_name, vehicle_type = data.get('start'), data.get('end'), data.get('vehicle_type', 'car')
    if start_name not in MUMBAI_LOCATIONS or end_name not in MUMBAI_LOCATIONS:
        return jsonify({'error': 'Location not found'}), 400

    routes = []
    for route_type, route_name in [('direct','Direct Route'),('highway','Via Highway'),('scenic','Scenic Route')]:
        wp = generate_route_waypoints(MUMBAI_LOCATIONS[start_name], MUMBAI_LOCATIONS[end_name], route_type)
        risk_result = calculate_route_risk(wp, vehicle_type)
        meta = get_route_metadata(wp, risk_result['risk_score'], vehicle_type)
        route_accidents = accident_reporter.get_accidents_on_route(wp, buffer_km=0.5)
        routes.append({
            'id': len(routes)+1, 'name': route_name, 'waypoints': wp, 'risk_score': risk_result['risk_score'],
            'risk_level': 'low' if risk_result['risk_score']<35 else ('medium' if risk_result['risk_score']<60 else 'high'),
            'distance_km': meta['distance_km'], 'time_minutes': meta['time_minutes'], 'risk_details': risk_result['risk_details'][:5],
            'vehicle_info': risk_result['vehicle_info'], 'accidents_on_route': len(route_accidents)
        })

    routes.sort(key=lambda x: x['risk_score'])
    routes[0]['recommended'] = True
    return jsonify({'start': start_name, 'end': end_name, 'vehicle_type': vehicle_type, 'routes': routes, 'active_accidents_count': len(accident_reporter.get_active_accidents())})

@app.route('/api/accidents/report', methods=['POST'])
def report_accident():
    data = request.get_json()
    if not data.get('latitude') or not data.get('longitude'): return jsonify({'success': False, 'error': 'Location required'}), 400
    return jsonify(accident_reporter.report_accident(data.get('latitude'), data.get('longitude'), data.get('severity', 'moderate'), data.get('description', '')))

@app.route('/api/accidents/active', methods=['GET'])
def get_active_accidents():
    accs = accident_reporter.get_active_accidents()
    return jsonify({'success': True, 'accidents': accs, 'count': len(accs)})

@app.route('/api/accidents/vote', methods=['POST'])
def vote_accident():
    data = request.get_json()
    if not data.get('accident_id') or data.get('vote_type') not in ['up', 'down']: return jsonify({'success': False, 'error': 'Invalid vote'}), 400
    return jsonify(accident_reporter.vote_accident(data.get('accident_id'), data.get('vote_type')))

FAVORITES_FILE = 'data/favorites.json'
@app.route('/api/favorites', methods=['GET', 'POST'])
def manage_favorites():
    os.makedirs(os.path.dirname(FAVORITES_FILE), exist_ok=True)
    if request.method == 'POST':
        favorites_data = request.json.get('favorites', [])
        with open(FAVORITES_FILE, 'w') as f: json.dump(favorites_data, f, indent=2)
        return jsonify({"success": True, "favorites": favorites_data})
    else:
        try:
            with open(FAVORITES_FILE, 'r') as f: favorites = json.load(f)
        except: favorites = [{'id': 'home', 'name': '🏠 Home', 'locationName': 'Bandra'}, {'id': 'work', 'name': '💼 Work', 'locationName': 'BKC'}]
        return jsonify({"success": True, "favorites": favorites})

ROUTES_FILE = 'data/shared_routes.json'
@app.route('/api/share-route', methods=['POST'])
def save_shared_route():
    route_id = str(uuid.uuid4())[:6]
    os.makedirs(os.path.dirname(ROUTES_FILE), exist_ok=True)
    try:
        with open(ROUTES_FILE, 'r') as f: routes = json.load(f)
    except: routes = {}
    routes[route_id] = request.json
    with open(ROUTES_FILE, 'w') as f: json.dump(routes, f, indent=2)
    return jsonify({'success': True, 'route_id': route_id}), 200

@app.route('/route/<route_id>', methods=['GET'])
def view_shared_route(route_id):
    try:
        with open(ROUTES_FILE, 'r') as f: routes = json.load(f)
        if route_id in routes:
            return render_template('index.html', locations=MUMBAI_LOCATIONS, preloaded_route=json.dumps(routes[route_id]))
    except: pass
    return render_template('index.html', locations=MUMBAI_LOCATIONS, error="Shared route not found.")

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)