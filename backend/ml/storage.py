import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables from .env.local in the project root
env_path = Path(__file__).resolve().parent.parent.parent / '.env.local'
load_dotenv(dotenv_path=env_path)

SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("VITE_SUPABASE_ANON_KEY", "")

# Initialize Supabase client
# Fallback to dummy client if keys are missing (should not happen in proper deploy)
if SUPABASE_URL and SUPABASE_KEY:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
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
