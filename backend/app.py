from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional

from ml.storage import init_db, insert_trip, insert_bill
from ml.train import train_user_model
from ml.predict import predict_user_forecast
from ml.cluster import cluster_users
from fastapi.security import APIKeyHeader
from fastapi import Security
import os

API_KEY_NAME = "x-api-key"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=True)

def verify_api_key(api_key: str = Security(api_key_header)):
    expected_key = os.environ.get("ML_API_KEY", "ecopulse_dev_key")
    if api_key != expected_key:
        raise HTTPException(status_code=403, detail="Could not validate credentials")
    return api_key

app = FastAPI(title="EcoPulse ML Backend", version="2.0.0")

cors_origins = os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://localhost:5174").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
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
    return {"status": "ok", "version": "2.0.0"}


@app.post("/api/trips")
def add_trip(payload: TripIn, api_key: str = Depends(verify_api_key)):
    insert_trip(payload)
    return {"status": "ok"}


@app.post("/api/bills")
def add_bill(payload: BillIn, api_key: str = Depends(verify_api_key)):
    insert_bill(payload)
    return {"status": "ok"}


@app.post("/api/train")
def train(payload: TrainIn, api_key: str = Depends(verify_api_key)):
    try:
        result = train_user_model(payload.user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return result


@app.post("/api/predict")
def predict(payload: PredictIn, api_key: str = Depends(verify_api_key)):
    try:
        result = predict_user_forecast(payload.user_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Model not found. Train first.")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return result


@app.get("/api/cluster")
def cluster(api_key: str = Depends(verify_api_key)):
    try:
        result = cluster_users()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return result



