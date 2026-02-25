import requests
import os
from datetime import datetime

class WeatherService:
    """
    Fetches live weather data for Mumbai for the risk ML model.
    Falls back to mock data if no API key is provided.
    """
    
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.environ.get('OPENWEATHER_API_KEY')
        self.city = "Mumbai"
        self.base_url = "http://api.openweathermap.org/data/2.5/weather"
        
    def get_current_weather(self):
        """
        Returns {weather_category, rain_mm, humidity}
        """
        if not self.api_key:
            return self._get_mock_weather()
            
        try:
            params = {
                'q': self.city,
                'appid': self.api_key,
                'units': 'metric'
            }
            response = requests.get(self.base_url, params=params, timeout=5)
            data = response.json()
            
            if response.status_code != 200:
                print(f"Weather API Error: {data.get('message')}")
                return self._get_mock_weather()
                
            # Map OWM condition to our model's categories: Clear, Rain, Fog, Heavy Rain
            main_condition = data['weather'][0]['main']
            description = data['weather'][0]['description']
            
            weather_cat = "Clear"
            if "rain" in description.lower() or "drizzle" in description.lower():
                weather_cat = "Heavy Rain" if "heavy" in description.lower() else "Rain"
            elif "fog" in main_condition.lower() or "mist" in main_condition.lower() or "haze" in main_condition.lower():
                weather_cat = "Fog"
            elif main_condition != "Clear":
                # Default for clouds etc. if not exactly Clear
                weather_cat = "Clear" 
                
            rain_mm = data.get('rain', {}).get('1h', 0.0)
            humidity = data['main'].get('humidity', 60)
            
            return {
                'weather_category': weather_cat,
                'rain_mm': rain_mm,
                'humidity': humidity,
                'is_live': True,
                'temp': data['main']['temp']
            }
            
        except Exception as e:
            print(f"Weather Fetch Exception: {e}")
            return self._get_mock_weather()

    def _get_mock_weather(self):
        """Generates realistic mock weather based on Mumbai's current season."""
        now = datetime.now()
        month = now.month
        
        # Monsoon: June - September
        if 6 <= month <= 9:
            return {
                'weather_category': 'Rain',
                'rain_mm': 2.5,
                'humidity': 85,
                'is_live': False,
                'temp': 28.0
            }
        # Summer: March - May
        elif 3 <= month <= 5:
            return {
                'weather_category': 'Clear',
                'rain_mm': 0.0,
                'humidity': 65,
                'is_live': False,
                'temp': 33.0
            }
        # Winter: November - February
        else:
            return {
                'weather_category': 'Clear',
                'rain_mm': 0.0,
                'humidity': 55,
                'is_live': False,
                'temp': 24.0
            }

if __name__ == "__main__":
    # Test
    ws = WeatherService()
    print(f"Current Weather: {ws.get_current_weather()}")
