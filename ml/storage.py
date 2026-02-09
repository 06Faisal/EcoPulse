import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "ecopulse.db"


def get_connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    return sqlite3.connect(DB_PATH)


def init_db():
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS trips (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                date TEXT NOT NULL,
                distance REAL NOT NULL,
                co2 REAL NOT NULL,
                vehicle TEXT
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS bills (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                date TEXT NOT NULL,
                units REAL NOT NULL
            )
            """
        )
        conn.commit()


def insert_trip(payload):
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO trips (user_id, date, distance, co2, vehicle) VALUES (?, ?, ?, ?, ?)",
            (payload.user_id, payload.date, payload.distance, payload.co2, payload.vehicle),
        )
        conn.commit()


def insert_bill(payload):
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO bills (user_id, date, units) VALUES (?, ?, ?)",
            (payload.user_id, payload.date, payload.units),
        )
        conn.commit()


def fetch_trips(user_id: str):
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT date, distance, co2, vehicle FROM trips WHERE user_id = ? ORDER BY date ASC",
            (user_id,),
        )
        return cur.fetchall()


def fetch_bills(user_id: str):
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT date, units FROM bills WHERE user_id = ? ORDER BY date ASC",
            (user_id,),
        )
        return cur.fetchall()


def fetch_user_ids():
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT DISTINCT user_id FROM trips ORDER BY user_id ASC")
        rows = cur.fetchall()
        return [row[0] for row in rows]
