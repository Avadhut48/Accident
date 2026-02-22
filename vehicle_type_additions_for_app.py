# ========== ADD THIS AFTER MUMBAI_LOCATIONS DICTIONARY ==========

# Vehicle type configurations
VEHICLE_CONFIGS = {
    'car': {
        'name': 'Car',
        'icon': '🚗',
        'risk_multiplier': 1.0,      # Baseline
        'speed_factor': 1.0,          # 40 km/h average
        'description': 'Standard passenger car',
        'emoji_display': '🚗 Car'
    },
    'bike': {
        'name': 'Motorcycle',
        'icon': '🏍️',
        'risk_multiplier': 1.8,      # 80% more risky
        'speed_factor': 0.85,         # Slower in traffic (34 km/h)
        'description': 'Two-wheeler - Higher vulnerability in accidents',
        'emoji_display': '🏍️ Bike/Motorcycle'
    },
    'truck': {
        'name': 'Truck',
        'icon': '🚚',
        'risk_multiplier': 1.3,      # 30% more risky
        'speed_factor': 0.75,         # Much slower (30 km/h)
        'description': 'Heavy goods vehicle - Slower maneuvering',
        'emoji_display': '🚚 Truck'
    },
    'bus': {
        'name': 'Bus',
        'icon': '🚌',
        'risk_multiplier': 1.2,      # 20% more risky
        'speed_factor': 0.80,         # Slower (32 km/h)
        'description': 'Public transport bus',
        'emoji_display': '🚌 Bus'
    },
    'auto': {
        'name': 'Auto Rickshaw',
        'icon': '🛺',
        'risk_multiplier': 1.5,      # 50% more risky
        'speed_factor': 0.90,         # Slightly slower (36 km/h)
        'description': 'Three-wheeler auto rickshaw',
        'emoji_display': '🛺 Auto Rickshaw'
    }
}

def get_vehicle_config(vehicle_type='car'):
    """Get vehicle configuration with defaults"""
    return VEHICLE_CONFIGS.get(vehicle_type.lower(), VEHICLE_CONFIGS['car'])

# ========== MODIFY YOUR get_route_metadata FUNCTION ==========
# Find your existing get_route_metadata function and replace it with:

def get_route_metadata(waypoints, risk_score, vehicle_config=None):
    """Calculate route metadata with vehicle-specific adjustments"""
    if vehicle_config is None:
        vehicle_config = VEHICLE_CONFIGS['car']
    
    # Calculate distance
    distance = 0
    for i in range(len(waypoints) - 1):
        distance += haversine_distance(
            waypoints[i][0], waypoints[i][1],
            waypoints[i+1][0], waypoints[i+1][1]
        )
    
    distance_km = round(distance, 1)
    
    # Base time calculation (40 km/h average for car)
    base_time_minutes = (distance_km / 40) * 60
    
    # Apply vehicle speed factor
    adjusted_time_minutes = int(base_time_minutes / vehicle_config['speed_factor'])
    
    # Calculate vehicle impact
    base_risk = int(risk_score / vehicle_config['risk_multiplier'])
    vehicle_impact_percent = int((vehicle_config['risk_multiplier'] - 1) * 100)
    
    return {
        'distance_km': distance_km,
        'time_minutes': adjusted_time_minutes,
        'vehicle_impact': {
            'multiplier': vehicle_config['risk_multiplier'],
            'impact_percent': vehicle_impact_percent,
            'time_adjustment': vehicle_config['speed_factor'],
            'base_risk': base_risk,
            'adjusted_risk': risk_score
        }
    }

# ========== MODIFY YOUR calculate_route_risk FUNCTION ==========
# Add vehicle_type parameter to your calculate_route_risk function:

def calculate_route_risk(waypoints, vehicle_type='car'):
    """Calculate risk score for a route with vehicle type consideration"""
    vehicle_config = get_vehicle_config(vehicle_type)
    
    # Your existing risk calculation code here...
    # ... 
    
    # At the end, apply vehicle multiplier:
    # base_risk = your_calculated_risk
    # adjusted_risk = min(base_risk * vehicle_config['risk_multiplier'], 100)
    
    # return int(adjusted_risk), risk_details
    
    # (Keep your existing implementation, just add the multiplier at the end)
    pass

# ========== ADD NEW ENDPOINT ==========

@app.route('/api/vehicles', methods=['GET'])
def get_vehicles():
    """Get all available vehicle types"""
    return jsonify({
        'success': True,
        'vehicles': VEHICLE_CONFIGS
    })

# ========== MODIFY YOUR get_safe_routes ENDPOINT ==========
# In your @app.route('/api/routes', methods=['POST']) function:
# Add this line after getting start_name and end_name:

    vehicle_type = data.get('vehicle_type', 'car')  # Get vehicle type from request
    vehicle_config = get_vehicle_config(vehicle_type)
    
# Then when calling calculate_route_risk, pass vehicle_type:
    risk1, details1 = calculate_route_risk(waypoints1, vehicle_type=vehicle_type)
    
# And when calling get_route_metadata, pass vehicle_config:
    meta1 = get_route_metadata(waypoints1, risk1, vehicle_config=vehicle_config)
    
# Add to each route dictionary:
    'vehicle_impact': meta1['vehicle_impact']
    
# Add to final response:
    return jsonify({
        'start': start_name,
        'end': end_name,
        'vehicle_type': vehicle_type,
        'vehicle_info': vehicle_config,
        'routes': routes
    })
