import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables from .env.local in the project root
env_path = Path(__file__).resolve().parent.parent.parent / '.env.local'
load_dotenv(dotenv_path=env_path)

import logging

logger = logging.getLogger("ecopulse.storage")

SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL", "")

# This service reads other users' rows on their behalf (training, prediction,
# cohort clustering), so it must authenticate as the service role.
#
# The anon key was used here previously, which silently returned nothing: the
# RLS policies on trips/bills/profiles are granted `to authenticated`, and the
# anon role matches none of them. Every query came back empty, so training and
# clustering always reported "not enough data" no matter how much the user had
# logged.
#
# The service role bypasses RLS, which means the user_id filter in each query
# below is the only thing scoping a request to one user. Those ids are
# validated in security.py before reaching here, and every route requires the
# service API key. This key must never reach the frontend.
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
ANON_KEY = os.environ.get("VITE_SUPABASE_ANON_KEY", "").strip()
SUPABASE_KEY = SERVICE_KEY or ANON_KEY

if SUPABASE_URL and SUPABASE_KEY:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    if not SERVICE_KEY:
        logger.warning(
            "SUPABASE_SERVICE_ROLE_KEY is not set; falling back to the anon key. "
            "Row-level security will hide every row from this service, so "
            "training, prediction and clustering will all report no data."
        )
else:
    supabase = None

def init_db():
    # No-op since Supabase is managed externally
    pass

def insert_trip(payload):
    # No-op: Frontend already writes directly to Supabase via cloudService.ts.
    # We keep this endpoint alive so we don't break frontend mlBackend sync logic,
    # but the ML service exclusively reads from Supabase anyway.
    pass

def insert_bill(payload):
    # No-op: Frontend already writes directly to Supabase via cloudService.ts.
    pass

def fetch_trips(user_id: str):
    if not supabase:
        raise ValueError("Supabase client not initialized")
        
    response = supabase.table("trips").select("date, distance, co2, vehicle").eq("user_id", user_id).order("date").execute()
    
    return [(row["date"], float(row["distance"]), float(row["co2"]), row.get("vehicle", "")) for row in response.data]

def fetch_bills(user_id: str):
    if not supabase:
        raise ValueError("Supabase client not initialized")
        
    response = supabase.table("bills").select("date, units").eq("user_id", user_id).order("date").execute()
    
    return [(row["date"], float(row["units"])) for row in response.data]

def fetch_user_ids():
    if not supabase:
        raise ValueError("Supabase client not initialized")
        
    response = supabase.table("profiles").select("id").execute()
    
    return [row["id"] for row in response.data]
