# EcoPulse ML Backend

## Setup

1. Create a virtual env (optional)
2. Install deps:
   pip install -r backend/requirements.txt

## Run

uvicorn backend.app:app --reload --port 8000

## API

- POST /api/trips
- POST /api/bills
- POST /api/train
- POST /api/predict
- GET /api/health

## Notes

- SQLite DB stored at backend/data/ecopulse.db
- Models stored at backend/models/{user_id}.pkl
