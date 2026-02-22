"""
Vehicle Type Selection Feature - Complete Implementation

This module contains all the logic for vehicle-specific risk adjustments.
Add this to your app.py or import from here.
"""

# ═══════════════════════════════════════════════════════════════════════
# VEHICLE TYPE CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════

VEHICLE_TYPES = {
    'car': {
        'name': 'Car',
        'icon': '🚗',
        'risk_multiplier': 1.0,      # Baseline
        'speed_factor': 1.0,          # Normal speed
        'weather_sensitivity': {
            'Clear': 1.0,
            'Rain': 1.0,
            'Fog': 1.0,
            'Heavy Rain': 1.0
        }
    },
    'bike': {
        'name': 'Bike/Motorcycle',
        'icon': '🏍️',
        'risk_multiplier': 1.8,       # 80% more risky
        'speed_factor': 0.85,          # 15% slower in traffic
        'weather_sensitivity': {
            'Clear': 1.0,
            'Rain': 1.5,               # 50% more risky in rain
            'Fog': 1.3,                # 30% more risky in fog
            'Heavy Rain': 2.0          # 100% more risky in heavy rain
        }
    },
    'auto': {
        'name': 'Auto Rickshaw',
        'icon': '🛺',
        'risk_multiplier': 1.5,       # 50% more risky
        'speed_factor': 0.75,          # 25% slower
        'weather_sensitivity': {
            'Clear': 1.0,
            'Rain': 1.3,
            'Fog': 1.2,
            'Heavy Rain': 1.6
        }
    },
    'bus': {
        'name': 'Bus',
        'icon': '🚌',
        'risk_multiplier': 1.2,       # 20% more risky
        'speed_factor': 0.80,          # 20% slower
        'weather_sensitivity': {
            'Clear': 1.0,
            'Rain': 1.1,
            'Fog': 1.1,
            'Heavy Rain': 1.3
        }
    },
    'truck': {
        'name': 'Truck',
        'icon': '🚚',
        'risk_multiplier': 1.3,       # 30% more risky
        'speed_factor': 0.70,          # 30% slower
        'weather_sensitivity': {
            'Clear': 1.0,
            'Rain': 1.2,
            'Fog': 1.2,
            'Heavy Rain': 1.4
        }
    }
}


def get_vehicle_multiplier(vehicle_type: str, weather_condition: str = 'Clear') -> dict:
    """
    Calculate the complete risk multiplier for a vehicle type and weather.
    
    Args:
        vehicle_type: One of 'car', 'bike', 'auto', 'bus', 'truck'
        weather_condition: Current weather condition
    
    Returns:
        Dict with risk_multiplier, speed_factor, and metadata
    """
    vehicle_type = vehicle_type.lower()
    
    if vehicle_type not in VEHICLE_TYPES:
        vehicle_type = 'car'  # Default to car
    
    vehicle = VEHICLE_TYPES[vehicle_type]
    
    # Base risk multiplier
    base_multiplier = vehicle['risk_multiplier']
    
    # Weather sensitivity multiplier
    weather_multiplier = vehicle['weather_sensitivity'].get(weather_condition, 1.0)
    
    # Combined multiplier
    combined_multiplier = base_multiplier * weather_multiplier
    
    return {
        'vehicle_type': vehicle_type,
        'vehicle_name': vehicle['name'],
        'vehicle_icon': vehicle['icon'],
        'base_multiplier': base_multiplier,
        'weather_multiplier': weather_multiplier,
        'combined_multiplier': round(combined_multiplier, 2),
        'speed_factor': vehicle['speed_factor']
    }


def calculate_vehicle_adjusted_time(base_time_minutes: int, vehicle_type: str) -> int:
    """
    Adjust travel time based on vehicle type.
    
    Args:
        base_time_minutes: Base travel time (assuming car)
        vehicle_type: Type of vehicle
    
    Returns:
        Adjusted time in minutes
    """
    vehicle_type = vehicle_type.lower()
    
    if vehicle_type not in VEHICLE_TYPES:
        return base_time_minutes
    
    speed_factor = VEHICLE_TYPES[vehicle_type]['speed_factor']
    adjusted_time = int(base_time_minutes / speed_factor)
    
    return adjusted_time


def get_vehicle_specific_tips(vehicle_type: str, risk_level: str, weather: str) -> list:
    """
    Get safety tips specific to vehicle type, risk level, and weather.
    
    Args:
        vehicle_type: Type of vehicle
        risk_level: 'low', 'medium', or 'high'
        weather: Weather condition
    
    Returns:
        List of safety tips
    """
    tips = []
    vehicle_type = vehicle_type.lower()
    
    # General tips by risk level
    if risk_level == 'high':
        tips.append('⚠️ High risk route. Consider delaying travel if possible.')
    
    # Vehicle-specific tips
    if vehicle_type == 'bike':
        tips.append('🏍️ Ensure helmet and protective gear are worn.')
        if weather in ['Rain', 'Heavy Rain']:
            tips.append('🌧️ Reduce speed by 30-40% on wet roads.')
            tips.append('⚠️ Watch for oil slicks near traffic signals.')
            tips.append('💡 Consider taking alternate transport in heavy rain.')
        if weather == 'Fog':
            tips.append('🌫️ Use low beam and hazard lights. Stay visible.')
    
    elif vehicle_type == 'auto':
        tips.append('🛺 Keep side curtains closed in rain for better stability.')
        if weather in ['Rain', 'Heavy Rain']:
            tips.append('🌧️ Reduce speed on turns - autos are prone to tipping.')
    
    elif vehicle_type == 'truck':
        tips.append('🚚 Check height clearances before selecting this route.')
        tips.append('⚡ Allow extra braking distance (trucks take 40% longer).')
        if weather in ['Rain', 'Heavy Rain']:
            tips.append('🌧️ Risk of hydroplaning increases with load weight.')
    
    elif vehicle_type == 'bus':
        tips.append('🚌 Factor in passenger pickup/drop delays.')
        if risk_level in ['medium', 'high']:
            tips.append('👥 Extra caution - you have passenger safety responsibility.')
    
    else:  # car
        if weather in ['Rain', 'Heavy Rain']:
            tips.append('🚗 Maintain 3-second following distance.')
    
    # Weather-general tips
    if weather == 'Heavy Rain':
        tips.append('⛈️ Avoid flooded underpasses on this route.')
    
    return tips[:5]  # Max 5 tips
