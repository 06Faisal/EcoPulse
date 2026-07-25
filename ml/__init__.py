"""Offline evaluation support.

Holds only `storage.py`, the SQLite layer the local evaluation harness reads
from. Feature engineering and the model code live in `backend/ml/` and are
imported from there, so the harness scores exactly what production runs.
"""
