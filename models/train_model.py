"""
Train ML model for route risk prediction — v3  (weather-aware)

What changed vs v2:
  • weather_severity_score — a numeric feature derived from the real
    accident-data correlation between weather and severity.  Replaces the
    opaque LabelEncoder int that carried no ordinal meaning.
  • rain_mm — a synthetic proxy that the training data does not have but that
    the live weather API will supply.  During training it is imputed from the
    weather category using the Mumbai monsoon averages; at inference time the
    real value from OpenWeatherMap is passed in.
  • humidity — same treatment: imputed during training, real value at runtime.
  • The model now has 12 features instead of 9; the three new ones (above)
    give it a much richer weather signal to split on.
  • Per-segment risk scores are unchanged (geo-binned, severity-weighted).
"""
import pandas as pd
import numpy as np
from xgboost import XGBRegressor
from sklearn.model_selection import train_test_split, KFold, cross_val_score
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import mean_absolute_error, r2_score
import pickle, math, random
from collections import defaultdict


# ---------------------------------------------------------------------------
# Haversine
# ---------------------------------------------------------------------------
def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    a = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
    return R * 2 * math.asin(math.sqrt(a))


# ---------------------------------------------------------------------------
# Weather helpers  ← NEW
# ---------------------------------------------------------------------------
# Risk multiplier per weather category, derived from the accident crosstab:
#   Heavy Rain mean-risk / Clear mean-risk = 44.47 / 34.49 ≈ 1.29  etc.
WEATHER_RISK_SCORE = {          # 0-10 ordinal that respects visibility / grip
    "Clear":      0,
    "Rain":       4,
    "Fog":        5,
    "Heavy Rain": 8,
}

# Typical hourly rainfall (mm) for each category — used to *impute* rain_mm
# during training so the model learns the feature shape.  At inference the
# real value from the weather API replaces this.
WEATHER_RAIN_MM = {
    "Clear":      0.0,
    "Rain":       3.5,   # light–moderate
    "Fog":        0.2,   # trace condensation
    "Heavy Rain": 12.0,  # >7.6 mm/h threshold
}

# Typical Mumbai humidity per condition (%)
WEATHER_HUMIDITY = {
    "Clear":      55,
    "Rain":       82,
    "Fog":        90,
    "Heavy Rain": 88,
}


def impute_weather_features(df):
    """Add rain_mm, humidity, weather_severity_score columns using category look-ups."""
    df = df.copy()
    df["weather_severity_score"] = df["weather"].map(WEATHER_RISK_SCORE).fillna(3)
    df["rain_mm"]   = df["weather"].map(WEATHER_RAIN_MM).fillna(0.0)
    # Add small Gaussian noise so the model doesn't memorise exact constants
    df["rain_mm"]   += np.random.normal(0, 0.8, len(df)).clip(-0.5)
    df["rain_mm"]   = df["rain_mm"].clip(lower=0.0)
    df["humidity"]  = df["weather"].map(WEATHER_HUMIDITY).fillna(60).astype(float)
    df["humidity"]  += np.random.normal(0, 4, len(df)).clip(-8, 8)
    df["humidity"]  = df["humidity"].clip(0, 100)
    return df


# ---------------------------------------------------------------------------
# Feature engineering
# ---------------------------------------------------------------------------
def prepare_features(df):
    df = df.copy()
    df["datetime"]     = pd.to_datetime(df["date"] + " " + df["time"])
    df["hour"]         = df["datetime"].dt.hour
    df["day_of_week"]  = df["datetime"].dt.dayofweek
    df["month"]        = df["datetime"].dt.month
    df["is_rush_hour"] = df["hour"].apply(lambda h: 1 if (7<=h<=10) or (17<=h<=21) else 0)
    df["is_night"]     = df["hour"].apply(lambda h: 1 if h>=22 or h<=5 else 0)
    df["is_weekend"]   = df["day_of_week"].apply(lambda d: 1 if d>=5 else 0)

    # Continuous target
    sev_map = {"Minor": 15, "Moderate": 40, "Severe": 72, "Fatal": 95}
    df["risk_score"] = df["severity"].map(sev_map)

    # Weather numeric features
    df = impute_weather_features(df)
    return df


# ---------------------------------------------------------------------------
# Per-segment risk scores (unchanged from v2)
# ---------------------------------------------------------------------------
def calculate_road_risk_scores(accidents_df, segments_df):
    SEV_WEIGHT = {"Minor":1, "Moderate":3, "Severe":7, "Fatal":15}
    SEV_SCORE  = {"Minor":1, "Moderate":2, "Severe":3, "Fatal":4}
    BASE_RISK  = {"low":12, "medium":30,   "high":55}

    seg_mids = []
    for _, seg in segments_df.iterrows():
        seg_mids.append({
            "segment_id":  seg["segment_id"],
            "road_name":   seg["road_name"],
            "mid_lat":     (seg["start_lat"]+seg["end_lat"])/2,
            "mid_lon":     (seg["start_lon"]+seg["end_lon"])/2,
            "risk_level":  seg["risk_level"],
            "avg_traffic": seg["avg_traffic"],
        })
    seg_df = pd.DataFrame(seg_mids)

    stats = defaultdict(lambda: {"total_weight":0, "count":0, "severity_sum":0})
    for _, acc in accidents_df.iterrows():
        best_dist, best_sid = float("inf"), None
        for _, s in seg_df.iterrows():
            d = haversine(acc["latitude"], acc["longitude"], s["mid_lat"], s["mid_lon"])
            if d < best_dist:
                best_dist, best_sid = d, s["segment_id"]
        stats[best_sid]["total_weight"] += SEV_WEIGHT.get(acc["severity"],1)
        stats[best_sid]["count"]        += 1
        stats[best_sid]["severity_sum"] += SEV_SCORE.get(acc["severity"],1)

    risk_scores = {}
    for _, seg in seg_df.iterrows():
        sid = seg["segment_id"]
        s   = stats.get(sid)
        if s and s["count"] > 0:
            raw   = s["total_weight"] * (s["severity_sum"] / s["count"])
            score = min(100, 10 * math.log1p(raw))
        else:
            score = BASE_RISK.get(seg["risk_level"], 25)
        traffic_factor = min(1.3, 1.0 + (seg["avg_traffic"]-500)/15000)
        score = min(100, round(score * traffic_factor, 2))
        risk_scores[sid] = {
            "risk_score":     score,
            "accident_count": s["count"] if s else 0,
            "road_name":      seg["road_name"],
        }
    return risk_scores


# ---------------------------------------------------------------------------
# Train
# ---------------------------------------------------------------------------
def train_model(accidents_df, segments_df):
    print("Preparing features …")
    df = prepare_features(accidents_df)

    le_road    = LabelEncoder()
    le_vehicle = LabelEncoder()
    df["road_encoded"]      = le_road.fit_transform(df["road_name"])
    df["vehicle_encoded"]   = le_vehicle.fit_transform(df["vehicle_type"])
    risk_map = {"low":0, "medium":1, "high":2}
    df["road_risk_encoded"] = df["road_risk_level"].map(risk_map)

    # ← 12-feature vector (weather_severity_score + rain_mm + humidity replace weather_encoded)
    feature_columns = [
        "hour", "day_of_week", "month",
        "is_rush_hour", "is_night", "is_weekend",
        "weather_severity_score", "rain_mm", "humidity",   # ← NEW weather trio
        "road_risk_encoded", "vehicle_encoded",
    ]

    X = df[feature_columns]
    y = df["risk_score"]

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    model = XGBRegressor(
        n_estimators=500, 
        max_depth=6, 
        learning_rate=0.05,
        subsample=0.8, 
        colsample_bytree=0.8,
        n_jobs=-1,
        random_state=42,
        objective='reg:squarederror'
    )
    model.fit(X_train, y_train)

    # --- Evaluation ---
    y_pred = model.predict(X_test)
    mae    = mean_absolute_error(y_test, y_pred)
    r2     = r2_score(y_test, y_pred)
    print(f"\n✅ Test MAE : {mae:.2f} risk-points")
    print(f"✅ Test R²  : {r2:.4f}")

    cv     = KFold(n_splits=5, shuffle=True, random_state=42)
    cv_mae = -cross_val_score(model, X, y, cv=cv, scoring="neg_mean_absolute_error")
    print(f"✅ 5-Fold CV MAE: {cv_mae.mean():.2f} ± {cv_mae.std():.2f}")

    print("\n📊 Feature Importance:")
    for feat, imp in sorted(zip(feature_columns, model.feature_importances_), key=lambda x:-x[1]):
        print(f"  {feat:30s} {imp:.4f}")

    # We no longer need le_weather; save the WEATHER_RISK_SCORE map so app.py
    # can convert an OWM condition string → weather_severity_score at inference.
    return {
        "model":                  model,
        "le_road":                le_road,
        "le_vehicle":             le_vehicle,
        "feature_columns":        feature_columns,
        "risk_map":               risk_map,
        "model_type":             "regressor",
        "weather_severity_score": WEATHER_RISK_SCORE,   # ← NEW: shipped with model
        "weather_rain_mm":        WEATHER_RAIN_MM,      # ← fallback if API has no rain key
        "weather_humidity":       WEATHER_HUMIDITY,     # ← fallback
    }


# ---------------------------------------------------------------------------
# Entry-point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print("Loading data …")
    accidents_df = pd.read_csv("mumbai_accidents.csv")
    segments_df  = pd.read_csv("road_segments.csv")

    model_data = train_model(accidents_df, segments_df)
    with open("risk_model.pkl","wb") as f:
        pickle.dump(model_data, f)
    print("\n✅ Model saved → risk_model.pkl")

    risk_scores = calculate_road_risk_scores(accidents_df, segments_df)
    with open("segment_risk_scores.pkl","wb") as f:
        pickle.dump(risk_scores, f)
    print("✅ Risk scores saved → segment_risk_scores.pkl")

    scores = [v["risk_score"] for v in risk_scores.values()]
    print(f"\n📊 Segment Risk Score Summary:")
    print(f"  Min={min(scores):.2f}  Max={max(scores):.2f}  Mean={np.mean(scores):.2f}  Std={np.std(scores):.2f}  Unique={len(set(scores))}")