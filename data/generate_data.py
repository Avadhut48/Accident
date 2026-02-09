"""
Generate synthetic accident data for Mumbai roads
"""
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import random

# Mumbai's major road coordinates (approximate)
MUMBAI_ROADS = [
    {"name": "Western Express Highway", "lat": 19.1136, "lon": 72.8697, "risk": "high"},
    {"name": "Eastern Express Highway", "lat": 19.1076, "lon": 72.8856, "risk": "high"},
    {"name": "Sion-Panvel Highway", "lat": 19.0433, "lon": 72.9265, "risk": "medium"},
    {"name": "LBS Marg", "lat": 19.0728, "lon": 72.8987, "risk": "medium"},
    {"name": "SV Road Andheri", "lat": 19.1136, "lon": 72.8347, "risk": "medium"},
    {"name": "Linking Road Bandra", "lat": 19.0596, "lon": 72.8295, "risk": "low"},
    {"name": "Marine Drive", "lat": 18.9432, "lon": 72.8236, "risk": "low"},
    {"name": "Worli Sea Link", "lat": 19.0176, "lon": 72.8125, "risk": "medium"},
    {"name": "Jogeshwari-Vikhroli Link Road", "lat": 19.1258, "lon": 72.9167, "risk": "high"},
    {"name": "Ghodbunder Road", "lat": 19.2183, "lon": 72.9781, "risk": "high"},
    {"name": "Palm Beach Road", "lat": 19.0330, "lon": 73.0297, "risk": "medium"},
    {"name": "Annie Besant Road", "lat": 19.0176, "lon": 72.8479, "risk": "low"},
    {"name": "BKC Road", "lat": 19.0653, "lon": 72.8684, "risk": "low"},
    {"name": "Powai-Chandivali Road", "lat": 19.1197, "lon": 72.9067, "risk": "medium"},
    {"name": "JVLR", "lat": 19.1095, "lon": 72.8801, "risk": "high"},
    {"name": "SV Road Goregaon", "lat": 19.1663, "lon": 72.8526, "risk": "medium"},
    {"name": "Thane-Belapur Road", "lat": 19.1972, "lon": 73.0032, "risk": "medium"},
    {"name": "Mulund-Airoli Bridge", "lat": 19.1726, "lon": 72.9586, "risk": "medium"},
    {"name": "Santacruz-Chembur Link Road", "lat": 19.0489, "lon": 72.8834, "risk": "high"},
    {"name": "Pedder Road", "lat": 18.9688, "lon": 72.8075, "risk": "low"}
]

SEVERITY_LEVELS = ["Minor", "Moderate", "Severe", "Fatal"]
WEATHER_CONDITIONS = ["Clear", "Rain", "Fog", "Heavy Rain"]
VEHICLE_TYPES = ["Car", "Bike", "Truck", "Bus", "Auto"]

def generate_accident_data(num_accidents=1000):
    """Generate synthetic accident data"""
    accidents = []
    
    # Start date: 3 years ago
    start_date = datetime.now() - timedelta(days=3*365)
    
    for i in range(num_accidents):
        # Select random road
        road = random.choice(MUMBAI_ROADS)
        
        # Risk factor influences accident frequency
        risk_multiplier = {"high": 3, "medium": 2, "low": 1}[road["risk"]]
        
        # Add some random offset to coordinates (±0.01 degrees ~ 1km)
        lat = road["lat"] + random.uniform(-0.01, 0.01)
        lon = road["lon"] + random.uniform(-0.01, 0.01)
        
        # Random date/time
        random_days = random.randint(0, 3*365)
        accident_date = start_date + timedelta(days=random_days)
        
        # Peak hours have more accidents (7-10 AM, 5-9 PM)
        hour = random.choices(
            range(24),
            weights=[2,1,1,1,1,3,5,8,8,7,4,3,3,3,3,4,5,8,9,8,6,4,3,2],
            k=1
        )[0]
        
        accident_time = accident_date.replace(
            hour=hour,
            minute=random.randint(0, 59)
        )
        
        # Severity influenced by road risk and weather
        weather = random.choices(
            WEATHER_CONDITIONS,
            weights=[60, 25, 10, 5],
            k=1
        )[0]
        
        severity_weights = {
            "Minor": 50, "Moderate": 30, "Severe": 15, "Fatal": 5
        }
        if weather in ["Rain", "Heavy Rain", "Fog"]:
            severity_weights = {
                "Minor": 35, "Moderate": 35, "Severe": 20, "Fatal": 10
            }
        
        severity = random.choices(
            SEVERITY_LEVELS,
            weights=list(severity_weights.values()),
            k=1
        )[0]
        
        accident = {
            "id": i + 1,
            "latitude": round(lat, 6),
            "longitude": round(lon, 6),
            "road_name": road["name"],
            "severity": severity,
            "date": accident_date.strftime("%Y-%m-%d"),
            "time": accident_time.strftime("%H:%M"),
            "datetime": accident_time,
            "weather": weather,
            "vehicle_type": random.choice(VEHICLE_TYPES),
            "road_risk_level": road["risk"]
        }
        
        accidents.append(accident)
    
    return pd.DataFrame(accidents)

def create_road_segments():
    """Create road segment data with accident statistics"""
    segments = []
    
    for road in MUMBAI_ROADS:
        # Create 5-10 segments per road
        num_segments = random.randint(5, 10)
        
        for seg in range(num_segments):
            segment = {
                "segment_id": f"{road['name'].replace(' ', '_')}_{seg}",
                "road_name": road["name"],
                "start_lat": road["lat"] + seg * 0.002,
                "start_lon": road["lon"] + seg * 0.002,
                "end_lat": road["lat"] + (seg + 1) * 0.002,
                "end_lon": road["lon"] + (seg + 1) * 0.002,
                "risk_level": road["risk"],
                "avg_traffic": random.randint(500, 5000),
                "speed_limit": random.choice([40, 50, 60, 80]),
                "lanes": random.choice([2, 3, 4, 6])
            }
            segments.append(segment)
    
    return pd.DataFrame(segments)

if __name__ == "__main__":
    print("Generating Mumbai accident data...")
    
    # Generate accident data
    accidents_df = generate_accident_data(1000)
    accidents_df.to_csv("mumbai_accidents.csv", index=False)
    print(f"✅ Generated {len(accidents_df)} accident records")
    
    # Generate road segments
    segments_df = create_road_segments()
    segments_df.to_csv("road_segments.csv", index=False)
    print(f"✅ Generated {len(segments_df)} road segments")
    
    # Print summary statistics
    print("\n📊 Data Summary:")
    print(f"Total accidents: {len(accidents_df)}")
    print(f"\nBy Severity:")
    print(accidents_df['severity'].value_counts())
    print(f"\nBy Road Risk Level:")
    print(accidents_df['road_risk_level'].value_counts())
    print(f"\nTop 5 Dangerous Roads:")
    print(accidents_df['road_name'].value_counts().head())