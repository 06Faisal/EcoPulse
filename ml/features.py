from datetime import datetime, timedelta
from typing import List, Tuple
import pandas as pd


def _to_date(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return datetime.strptime(value[:10], "%Y-%m-%d")


def build_daily_series(
    trips: List[Tuple[str, float, float, str]],
    bills: List[Tuple[str, float]],
) -> pd.DataFrame:
    if not trips:
        raise ValueError("Not enough trip data to train a model.")

    trip_rows = []
    for date, distance, co2, vehicle in trips:
        trip_rows.append({"date": _to_date(date).date(), "co2": float(co2)})

    trips_df = pd.DataFrame(trip_rows)
    daily_travel = trips_df.groupby("date")["co2"].sum().reset_index()

    if bills:
        latest_bill_units = float(bills[-1][1])
        daily_energy = (latest_bill_units * 0.45) / 30.0
    else:
        daily_energy = 0.0

    min_date = daily_travel["date"].min()
    max_date = daily_travel["date"].max()
    all_days = pd.date_range(start=min_date, end=max_date, freq="D")

    daily = pd.DataFrame({"date": all_days})
    daily["date"] = daily["date"].dt.date
    daily = daily.merge(daily_travel, on="date", how="left").fillna({"co2": 0.0})
    daily["energy"] = daily_energy
    daily["total"] = daily["co2"] + daily["energy"]

    return daily


def make_features(daily: pd.DataFrame) -> pd.DataFrame:
    daily = daily.copy()
    daily["date_dt"] = pd.to_datetime(daily["date"])
    daily["day_index"] = (daily["date_dt"] - daily["date_dt"].min()).dt.days
    daily["day_of_week"] = daily["date_dt"].dt.dayofweek
    daily["is_weekend"] = daily["day_of_week"].isin([5, 6]).astype(int)
    daily["rolling_7"] = daily["total"].rolling(window=7, min_periods=1).mean().shift(1)
    daily["rolling_7"] = daily["rolling_7"].fillna(daily["total"].mean())

    return daily


def train_test_split_time(daily: pd.DataFrame, test_ratio: float = 0.2):
    n = len(daily)
    if n < 14:
        raise ValueError("Need at least 14 days of data to train a model.")

    split_idx = int(n * (1 - test_ratio))
    train = daily.iloc[:split_idx]
    test = daily.iloc[split_idx:]

    return train, test


def make_future_features(daily: pd.DataFrame, days: int = 7) -> pd.DataFrame:
    last_date = pd.to_datetime(daily["date"]).max()
    future_dates = [last_date + timedelta(days=i) for i in range(1, days + 1)]
    base_index = daily["day_index"].max()
    rolling_mean = daily["total"].tail(7).mean()

    rows = []
    for i, dt in enumerate(future_dates, start=1):
        day_index = base_index + i
        day_of_week = dt.dayofweek
        rows.append(
            {
                "date": dt.date(),
                "day_index": day_index,
                "day_of_week": day_of_week,
                "is_weekend": 1 if day_of_week in [5, 6] else 0,
                "rolling_7": rolling_mean,
            }
        )

    return pd.DataFrame(rows)
