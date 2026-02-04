from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional

from ml.storage import init_db, insert_trip, insert_bill
from ml.train import train_user_model
from ml.predict import predict_user_forecast
from ml.cluster import cluster_users

app = FastAPI(title="EcoPulse ML Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()


class TripIn(BaseModel):
    user_id: str = Field(..., min_length=1)
    date: str = Field(..., description="ISO date or datetime")
    distance: float = Field(..., ge=0)
    co2: float = Field(..., ge=0)
    vehicle: Optional[str] = None


class BillIn(BaseModel):
    user_id: str = Field(..., min_length=1)
    date: str = Field(..., description="ISO date or datetime")
    units: float = Field(..., ge=0, description="kWh")


class TrainIn(BaseModel):
    user_id: str = Field(..., min_length=1)


class PredictIn(BaseModel):
    user_id: str = Field(..., min_length=1)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/trips")
def add_trip(payload: TripIn):
    insert_trip(payload)
    return {"status": "ok"}


@app.post("/api/bills")
def add_bill(payload: BillIn):
    insert_bill(payload)
    return {"status": "ok"}


@app.post("/api/train")
def train(payload: TrainIn):
    try:
        result = train_user_model(payload.user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return result


@app.post("/api/predict")
def predict(payload: PredictIn):
    try:
        result = predict_user_forecast(payload.user_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Model not found. Train first.")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return result


@app.get("/api/cluster")
def cluster():
    try:
        result = cluster_users()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return result
