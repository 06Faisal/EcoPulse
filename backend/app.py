import logging
import os
from typing import Optional

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from ml.cluster import cluster_users
from ml.predict import predict_user_forecast
from ml.storage import init_db, insert_bill, insert_trip
from ml.train import train_user_model
from security import validate_user_id, verify_api_key

logger = logging.getLogger("ecopulse")

app = FastAPI(title="EcoPulse ML Backend", version="2.0.0")

cors_origins = [
    origin.strip()
    for origin in os.environ.get(
        "CORS_ORIGINS", "http://localhost:5173,http://localhost:5174"
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    # Enumerate what the frontend actually uses instead of "*". With
    # allow_credentials=True a wildcard is both invalid per the CORS spec and
    # needlessly permissive.
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "x-api-key", "x-goog-api-key"],
)

init_db()


class UserScopedIn(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=64)

    @field_validator("user_id")
    @classmethod
    def _check_user_id(cls, value: str) -> str:
        try:
            return validate_user_id(value)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc


class TripIn(UserScopedIn):
    date: str = Field(..., description="ISO date or datetime")
    distance: float = Field(..., ge=0)
    co2: float = Field(..., ge=0)
    vehicle: Optional[str] = Field(default=None, max_length=64)


class BillIn(UserScopedIn):
    date: str = Field(..., description="ISO date or datetime")
    units: float = Field(..., ge=0, description="kWh")


class TrainIn(UserScopedIn):
    pass


class PredictIn(UserScopedIn):
    pass


@app.get("/api/health")
def health():
    """Liveness plus a booleans-only view of what is configured.

    Reports whether each credential is present, never its value, so a
    misconfigured deployment can be diagnosed without a signed-in session and
    without exposing anything sensitive.
    """
    return {
        "status": "ok",
        "version": "2.0.0",
        "configured": {
            "gemini": bool(GEMINI_API_KEY),
            "supabase": bool(SUPABASE_URL and SUPABASE_ANON_KEY),
            "ml_api_key": bool(os.environ.get("ML_API_KEY", "").strip()),
            "cors_origins": len(cors_origins),
        },
    }


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


# ─── Gemini proxy ─────────────────────────────────────────────────────────────
#
# The browser must never hold the Gemini key: anything Vite inlines as
# `import.meta.env.VITE_*` ends up readable in the deployed JavaScript bundle.
# The frontend points the Google SDK at this endpoint via `httpOptions.baseUrl`
# and we attach the real key server-side.
#
# Access is gated on a Supabase access token so the proxy cannot be used as a
# free, anonymous relay to Google on the project owner's quota.

GEMINI_UPSTREAM = "https://generativelanguage.googleapis.com"
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_ANON_KEY = os.environ.get("VITE_SUPABASE_ANON_KEY", "").strip()

# Only models the app actually calls. Keeps the proxy from being repurposed to
# reach arbitrary (and more expensive) upstream endpoints.
ALLOWED_GEMINI_MODELS = {"gemini-2.0-flash", "gemini-2.5-flash"}


async def require_supabase_user(request: Request) -> str:
    """Verify the caller's Supabase access token, returning their user id."""
    auth_header = request.headers.get("authorization", "")
    if not auth_header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = auth_header[7:].strip()

    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise HTTPException(status_code=503, detail="Auth backend not configured")

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={"Authorization": f"Bearer {token}", "apikey": SUPABASE_ANON_KEY},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session")
    return resp.json().get("id", "")


@app.post("/api/ai/{path:path}")
async def gemini_proxy(
    path: str,
    request: Request,
    user_id: str = Depends(require_supabase_user),
):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="AI backend not configured")

    # Paths look like "v1beta/models/gemini-2.0-flash:generateContent".
    if ".." in path or path.startswith("/"):
        raise HTTPException(status_code=400, detail="Invalid upstream path")

    model = path.rsplit("/", 1)[-1].split(":", 1)[0]
    if model not in ALLOWED_GEMINI_MODELS:
        raise HTTPException(status_code=400, detail=f"Model not allowed: {model}")

    body = await request.body()
    async with httpx.AsyncClient(timeout=60) as client:
        upstream = await client.post(
            f"{GEMINI_UPSTREAM}/{path}",
            content=body,
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": GEMINI_API_KEY,
            },
        )

    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        media_type=upstream.headers.get("content-type", "application/json"),
    )
