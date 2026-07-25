from pathlib import Path
import json
import joblib
import numpy as np

from .storage import fetch_trips, fetch_bills
from .features import build_daily_series, make_features, make_future_features
from security import safe_model_path

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"


def predict_user_forecast(user_id: str, days: int = 7):
    # joblib.load() executes pickle opcodes, so the path it is handed must be
    # provably inside MODELS_DIR - never something derived from raw input.
    model_path = safe_model_path(MODELS_DIR, user_id, ".pkl")
    meta_path = safe_model_path(MODELS_DIR, user_id, ".json")

    if not model_path.exists():
        raise FileNotFoundError("Model not found")

    trips = fetch_trips(user_id)
    bills = fetch_bills(user_id)
    daily = make_features(build_daily_series(trips, bills))

    model = joblib.load(model_path)
    future = make_future_features(daily, days=days)

    feature_cols = ["day_index", "day_of_week", "is_weekend", "rolling_7"]
    X_future = future[feature_cols]
    preds = model.predict(X_future)

    forecast = float(np.sum(preds))

    meta = {}
    if meta_path.exists():
        meta = json.loads(meta_path.read_text())

    daily_forecast = [
        {"day": str(row["date"]), "value": float(pred)}
        for row, pred in zip(future.to_dict(orient="records"), preds)
    ]

    return {
        "user_id": user_id,
        "forecast_7_day": forecast,
        "daily_forecast": daily_forecast,
        "metrics": meta,
    }
