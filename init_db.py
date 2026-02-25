import sqlite3
import json
import os
from datetime import datetime

DB_PATH = "data/mumbai_safe_route.db"
ACCIDENTS_JSON = "data/live_accidents.json"
FAVORITES_JSON = "data/favorites.json"
SHARED_ROUTES_JSON = "data/shared_routes.json"

def init_db():
    print(f"Initializing database at {DB_PATH}...")
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Create Accidents table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS accidents (
        id TEXT PRIMARY KEY,
        timestamp TEXT,
        latitude REAL,
        longitude REAL,
        severity TEXT,
        description TEXT,
        upvotes INTEGER DEFAULT 0,
        downvotes INTEGER DEFAULT 0,
        verified BOOLEAN DEFAULT 0,
        expires_at TEXT
    )
    ''')
    
    # Create Favorites table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS favorites (
        id TEXT PRIMARY KEY,
        name TEXT,
        locationName TEXT
    )
    ''')
    
    # Create Shared Routes table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS shared_routes (
        route_id TEXT PRIMARY KEY,
        route_data TEXT,
        created_at TEXT
    )
    ''')
    
    conn.commit()
    return conn

def migrate_data(conn):
    cursor = conn.cursor()
    
    # Migrate Accidents
    if os.path.exists(ACCIDENTS_JSON):
        print("Migrating accidents...")
        try:
            with open(ACCIDENTS_JSON, 'r') as f:
                accidents = json.load(f)
                for acc in accidents:
                    cursor.execute('''
                    INSERT OR REPLACE INTO accidents 
                    (id, timestamp, latitude, longitude, severity, description, upvotes, downvotes, verified, expires_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        acc['id'], acc['timestamp'], acc['latitude'], acc['longitude'], 
                        acc['severity'], acc.get('description', ''), acc.get('upvotes', 0), 
                        acc.get('downvotes', 0), acc.get('verified', False), 
                        acc.get('expires_at', (datetime.now()).isoformat())
                    ))
        except Exception as e:
            print(f"Error migrating accidents: {e}")

    # Migrate Favorites
    if os.path.exists(FAVORITES_JSON):
        print("Migrating favorites...")
        try:
            with open(FAVORITES_JSON, 'r') as f:
                favorites = json.load(f)
                # Handle both list and object formats if necessary
                if isinstance(favorites, list):
                    for fav in favorites:
                        cursor.execute('INSERT OR REPLACE INTO favorites (id, name, locationName) VALUES (?, ?, ?)', 
                                     (fav['id'], fav['name'], fav['locationName']))
        except Exception as e:
            print(f"Error migrating favorites: {e}")

    # Migrate Shared Routes
    if os.path.exists(SHARED_ROUTES_JSON):
        print("Migrating shared routes...")
        try:
            with open(SHARED_ROUTES_JSON, 'r') as f:
                routes = json.load(f)
                for rid, data in routes.items():
                    cursor.execute('INSERT OR REPLACE INTO shared_routes (route_id, route_data, created_at) VALUES (?, ?, ?)', 
                                 (rid, json.dumps(data), datetime.now().isoformat()))
        except Exception as e:
            print(f"Error migrating shared routes: {e}")

    conn.commit()
    print("Migration complete.")

if __name__ == "__main__":
    connection = init_db()
    migrate_data(connection)
    connection.close()
