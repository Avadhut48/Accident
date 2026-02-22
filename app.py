"""
Flask Backend - WITH WORKING ACCIDENT REPORTING
Fixed: All accident endpoints and integration
"""
from flask import Flask, render_template, request, jsonify
import pickle
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import random
import math
import os
import json

try:
    import requests as req_lib
except ImportError:
    req_lib = None

app = Flask(__name__)

# ═══════════════════════════════════════════════════════════════════════
# ACCIDENT REPORTER CLASS (INTEGRATED)
# ═══════════════════════════════════════════════════════════════════════

class AccidentReporter:
    def __init__(self, storage_path="data/live_accidents.json"):
        self.storage_path = storage_path
        os.makedirs(os.path.dirname(storage_path), exist_ok=True)
        if not os.path.exists(storage_path):
            with open(storage_path, 'w') as f:
                json.dump([], f)
    
    def report_accident(self, latitude, longitude, severity="moderate", description=""):
        """Report a new accident"""
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
        """Get all active accidents (not expired)"""
        accidents = self._load_accidents()
        now = datetime.now()
        
        active = [
            acc for acc in accidents
            if datetime.fromisoformat(acc['expires_at']) > now
        ]
        
        self._save_accidents(active)  # Auto-cleanup
        return active
    
    def vote_accident(self, accident_id, vote_type):
        """Upvote or downvote an accident"""
        accidents = self._load_accidents()
        
        for acc in accidents:
            if acc['id'] == accident_id:
                if vote_type == 'up':
                    acc['upvotes'] += 1
                    if acc['upvotes'] >= 3:
                        acc['verified'] = True
                elif vote_type == 'down':
                    acc['downvotes'] += 1
                
                # Remove if too many downvotes
                if acc['downvotes'] >= 5:
                    accidents.remove(acc)
                    self._save_accidents(accidents)
                    return {"success": True, "removed": True}
                
                break
        
        self._save_accidents(accidents)
        return {"success": True}
    
    def get_accidents_on_route(self, waypoints, buffer_km=0.5):
        """Find accidents near a route"""
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
        """Calculate risk multiplier based on nearby accidents"""
        accidents = self.get_accidents_on_route(waypoints, buffer_km=1.0)
        
        if not accidents:
            return 1.0
        
        severity_weights = {
            'minor': 1.05,
            'moderate': 1.15,
            'severe': 1.30,
            'fatal': 1.50
        }
        
        total_mult = 1.0
        for acc in accidents:
            weight = severity_weights.get(acc['severity'], 1.10)
            total_mult *= weight
        
        return min(total_mult, 2.0)  # Cap at 2x
    
    def _haversine(self, lat1, lon1, lat2, lon2):
        R = 6371
        lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
        dlat, dlon = lat2 - lat1, lon2 - lon1
        a = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
        return R * 2 * math.asin(math.sqrt(a))
    
    def _load_accidents(self):
        try:
            with open(self.storage_path, 'r') as f:
                return json.load(f)
        except:
            return []
    
    def _save_accidents(self, accidents):
        with open(self.storage_path, 'w') as f:
            json.dump(accidents, f, indent=2)

# Initialize accident reporter
accident_reporter = AccidentReporter()

# ═══════════════════════════════════════════════════════════════════════
# VEHICLE TYPE CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════

VEHICLE_TYPES = {
    'car': {
        'name': 'Car',
        'icon': '🚗',
        'risk_multiplier': 1.0,
        'speed_factor': 1.0,
    },
    'bike': {
        'name': 'Motorcycle',
        'icon': '🏍️',
        'risk_multiplier': 1.8,
        'speed_factor': 0.85,
    },
    'auto': {
        'name': 'Auto Rickshaw',
        'icon': '🛺',
        'risk_multiplier': 1.5,
        'speed_factor': 0.75,
    },
    'bus': {
        'name': 'Bus',
        'icon': '🚌',
        'risk_multiplier': 1.2,
        'speed_factor': 0.80,
    },
    'truck': {
        'name': 'Truck',
        'icon': '🚚',
        'risk_multiplier': 1.3,
        'speed_factor': 0.70,
    }
}

def get_vehicle_multiplier(vehicle_type: str) -> dict:
    vehicle_type = vehicle_type.lower()
    if vehicle_type not in VEHICLE_TYPES:
        vehicle_type = 'car'
    
    vehicle = VEHICLE_TYPES[vehicle_type]
    
    return {
        'vehicle_type': vehicle_type,
        'vehicle_name': vehicle['name'],
        'vehicle_icon': vehicle['icon'],
        'combined_multiplier': vehicle['risk_multiplier'],
        'speed_factor': vehicle['speed_factor']
    }

# Load ML model
with open('models/risk_model.pkl', 'rb') as f:
    model_data = pickle.load(f)

with open('models/segment_risk_scores.pkl', 'rb') as f:
    segment_risk_scores = pickle.load(f)

segments_df = pd.read_csv('data/road_segments.csv')

MUMBAI_LOCATIONS = {
    "Bandra": [19.0596, 72.8295], "Andheri": [19.1136, 72.8697],
    "Powai": [19.1197, 72.9067], "Worli": [19.0176, 72.8125],
    "Marine Drive": [18.9432, 72.8236], "BKC": [19.0653, 72.8684],
    "Goregaon": [19.1663, 72.8526], "Thane": [19.1972, 73.0032],
    "Navi Mumbai": [19.0330, 73.0297], "Malad": [19.1867, 72.8483],
    "Borivali": [19.2304, 72.8571], "Dadar": [19.0176, 72.8479],
    "Churchgate": [18.9322, 72.8264], "CST": [18.9398, 72.8355],
    "Lower Parel": [18.9968, 72.8265], "Kurla": [19.0728, 72.8987],
    "Ghatkopar": [19.0860, 72.9081], "Mulund": [19.1726, 72.9586],
    "Juhu": [19.0969, 72.8265], "Nariman Point": [18.9256, 72.8235]
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

def calculate_route_risk(waypoints, vehicle_type="car"):
    """Calculate route risk with accident and vehicle multipliers"""
    accident_mult = accident_reporter.get_accident_impact_multiplier(waypoints)
    vehicle_info = get_vehicle_multiplier(vehicle_type)
    vehicle_mult = vehicle_info['combined_multiplier']
    
    combined_mult = accident_mult * vehicle_mult
    
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
            base_risk = segment_risk_scores.get(sid, {}).get('risk_score', 40)
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
        'accident_multiplier': accident_mult,
        'vehicle_multiplier': vehicle_mult,
        'vehicle_info': vehicle_info,
        'combined_multiplier': round(combined_mult, 2),
        'risk_details': risk_details
    }

def get_route_metadata(waypoints, risk_score, vehicle_type="car"):
    total_distance = sum(
        haversine_distance(waypoints[i][0], waypoints[i][1],
                           waypoints[i+1][0], waypoints[i+1][1])
        for i in range(len(waypoints)-1)
    )
    
    base_time_minutes = int((total_distance / 30) * 60)
    
    vehicle_type = vehicle_type.lower()
    if vehicle_type in VEHICLE_TYPES:
        speed_factor = VEHICLE_TYPES[vehicle_type]['speed_factor']
        time_minutes = int(base_time_minutes / speed_factor)
    else:
        time_minutes = base_time_minutes
    
    if risk_score > 60:
        time_minutes = int(time_minutes * 1.15)
    
    return {'distance_km': round(total_distance, 2), 'time_minutes': time_minutes}

# ═══════════════════════════════════════════════════════════════════════
# ROUTES
# ═══════════════════════════════════════════════════════════════════════

@app.route('/')
def index():
    return render_template('index.html', locations=MUMBAI_LOCATIONS)

@app.route('/api/routes', methods=['POST'])
def get_safe_routes():
    data = request.get_json()
    start_name = data.get('start')
    end_name = data.get('end')
    vehicle_type = data.get('vehicle_type', 'car')

    if start_name not in MUMBAI_LOCATIONS:
        return jsonify({'error': 'Start location not found'}), 400
    if end_name not in MUMBAI_LOCATIONS:
        return jsonify({'error': 'End location not found'}), 400

    start_coords = MUMBAI_LOCATIONS[start_name]
    end_coords = MUMBAI_LOCATIONS[end_name]

    routes = []
    for route_type, route_name in [('direct','Direct Route'),('highway','Via Highway'),('scenic','Scenic Route')]:
        wp = generate_route_waypoints(start_coords, end_coords, route_type)
        risk_result = calculate_route_risk(wp, vehicle_type)
        risk_score = risk_result['risk_score']
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
            'accident_multiplier': risk_result['accident_multiplier'],
            'vehicle_multiplier': risk_result['vehicle_multiplier'],
            'vehicle_info': risk_result['vehicle_info'],
            'accidents_on_route': len(route_accidents),
            'accident_details': route_accidents[:3]
        })

    routes.sort(key=lambda x: x['risk_score'])
    routes[0]['recommended'] = True

    return jsonify({
        'start': start_name,
        'end': end_name,
        'vehicle_type': vehicle_type,
        'routes': routes,
        'active_accidents_count': len(accident_reporter.get_active_accidents())
    })

# ═══════════════════════════════════════════════════════════════════════
# ACCIDENT ENDPOINTS (NEW/FIXED)
# ═══════════════════════════════════════════════════════════════════════

@app.route('/api/accidents/report', methods=['POST'])
def report_accident():
    """Report a new accident"""
    data = request.get_json()
    
    latitude = data.get('latitude')
    longitude = data.get('longitude')
    severity = data.get('severity', 'moderate')
    description = data.get('description', '')
    
    if not latitude or not longitude:
        return jsonify({'success': False, 'error': 'Location required'}), 400
    
    result = accident_reporter.report_accident(latitude, longitude, severity, description)
    return jsonify(result)

@app.route('/api/accidents/active', methods=['GET'])
def get_active_accidents():
    """Get all active accidents"""
    accidents = accident_reporter.get_active_accidents()
    return jsonify({
        'success': True,
        'accidents': accidents,
        'count': len(accidents)
    })

@app.route('/api/accidents/vote', methods=['POST'])
def vote_accident():
    """Upvote or downvote an accident"""
    data = request.get_json()
    accident_id = data.get('accident_id')
    vote_type = data.get('vote_type')
    
    if not accident_id or vote_type not in ['up', 'down']:
        return jsonify({'success': False, 'error': 'Invalid vote'}), 400
    
    result = accident_reporter.vote_accident(accident_id, vote_type)
    return jsonify(result)

@app.route('/api/favorites', methods=['GET'])
def get_favorites():
    return jsonify({"success": True, "favorites": []})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)