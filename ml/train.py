from pathlib import Path
import json
import joblib
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error

from .storage import fetch_trips, fetch_bills
from .features import build_daily_series, make_features, train_test_split_time

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)


def train_user_model(user_id: str):
    trips = fetch_trips(user_id)
    bills = fetch_bills(user_id)

    daily = build_daily_series(trips, bills)
    daily = make_features(daily)

    train, test = train_test_split_time(daily)

    feature_cols = ["day_index", "day_of_week", "is_weekend", "rolling_7"]
    X_train = train[feature_cols]
    y_train = train["total"]

    X_test = test[feature_cols]
    y_test = test["total"]

    model = RandomForestRegressor(
        n_estimators=200,
        random_state=42,
        min_samples_leaf=2,
    )
    model.fit(X_train, y_train)

    preds = model.predict(X_test)
    mae = float(mean_absolute_error(y_test, preds))

    baseline = float(np.mean(y_train))
    baseline_preds = np.full_like(y_test, baseline, dtype=float)
    baseline_mae = float(mean_absolute_error(y_test, baseline_preds))

    model_path = MODELS_DIR / f"{user_id}.pkl"
    joblib.dump(model, model_path)

    meta = {
        "user_id": user_id,
        "mae": mae,
        "baseline_mae": baseline_mae,
        "train_days": int(len(train)),
        "test_days": int(len(test)),
        "feature_cols": feature_cols,
    }

    meta_path = MODELS_DIR / f"{user_id}.json"
    meta_path.write_text(json.dumps(meta, indent=2))

    return {
        "status": "trained",
        "metrics": meta,
    }
