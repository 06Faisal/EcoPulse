from typing import Dict, List, Tuple
import numpy as np
from sklearn.cluster import KMeans

from .storage import fetch_user_ids, fetch_trips, fetch_bills
from .features import build_daily_series


def _vehicle_distribution(trips: List[Tuple[str, float, float, str]]) -> Dict[str, float]:
    counts: Dict[str, int] = {}
    for _, _, _, vehicle in trips:
        key = (vehicle or "Unknown").lower()
        counts[key] = counts.get(key, 0) + 1
    total = sum(counts.values()) or 1
    return {k: v / total for k, v in counts.items()}


def _user_features(user_id: str) -> Dict[str, float]:
    trips = fetch_trips(user_id)
    bills = fetch_bills(user_id)

    if len(trips) < 10:
        raise ValueError("Need at least 10 trips per user for clustering.")

    daily = build_daily_series(trips, bills)
    avg_daily_travel = float(daily["co2"].mean())
    avg_daily_energy = float(daily["energy"].mean())
    trips_per_day = float(len(trips) / max(len(daily), 1))

    vehicle_dist = _vehicle_distribution(trips)
    car_pct = float(vehicle_dist.get("car", 0.0))
    bus_pct = float(vehicle_dist.get("bus", 0.0))
    bike_pct = float(vehicle_dist.get("bike", 0.0))
    train_pct = float(vehicle_dist.get("train", 0.0))

    return {
        "avg_daily_travel": avg_daily_travel,
        "avg_daily_energy": avg_daily_energy,
        "trips_per_day": trips_per_day,
        "car_pct": car_pct,
        "bus_pct": bus_pct,
        "bike_pct": bike_pct,
        "train_pct": train_pct,
    }


def cluster_users():
    user_ids = fetch_user_ids()
    if len(user_ids) < 3:
        raise ValueError("Need at least 3 users with data to run clustering.")

    features = []
    valid_users = []
    for user_id in user_ids:
        try:
            feat = _user_features(user_id)
            features.append(
                [
                    feat["avg_daily_travel"],
                    feat["avg_daily_energy"],
                    feat["trips_per_day"],
                    feat["car_pct"],
                    feat["bus_pct"],
                    feat["bike_pct"],
                    feat["train_pct"],
                ]
            )
            valid_users.append((user_id, feat))
        except ValueError:
            continue

    if len(valid_users) < 3:
        raise ValueError("Not enough users with sufficient trip data.")

    X = np.array(features, dtype=float)

    kmeans = KMeans(n_clusters=3, n_init=10, random_state=42)
    labels = kmeans.fit_predict(X)
    centroids = kmeans.cluster_centers_

    # Rank clusters by total daily emissions (travel + energy)
    cluster_emission = {
        idx: float(center[0] + center[1]) for idx, center in enumerate(centroids)
    }
    ranked = sorted(cluster_emission.items(), key=lambda x: x[1])
    cluster_label_map = {
        ranked[0][0]: "Eco-friendly",
        ranked[1][0]: "Moderate",
        ranked[2][0]: "High-emission",
    }

    user_clusters = []
    for (user_id, feat), label in zip(valid_users, labels):
        user_clusters.append(
            {
                "user_id": user_id,
                "cluster_id": int(label),
                "cluster_label": cluster_label_map[int(label)],
                "features": feat,
            }
        )

    return {
        "status": "ok",
        "clusters": user_clusters,
        "cluster_centroids": [
            {
                "cluster_id": idx,
                "avg_daily_travel": float(center[0]),
                "avg_daily_energy": float(center[1]),
                "trips_per_day": float(center[2]),
                "car_pct": float(center[3]),
                "bus_pct": float(center[4]),
                "bike_pct": float(center[5]),
                "train_pct": float(center[6]),
                "cluster_label": cluster_label_map[idx],
            }
            for idx, center in enumerate(centroids)
        ],
    }
