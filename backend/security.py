"""Shared security helpers for the EcoPulse ML backend.

Two concerns live here:

1. Service authentication — the ``x-api-key`` header that gates every ML route.
2. Identifier validation — ``user_id`` reaches the filesystem (model files are
   named after it), so it must be constrained before it is ever interpolated
   into a path.
"""

import logging
import os
import re
import secrets
from pathlib import Path

from fastapi import HTTPException, Security
from fastapi.security import APIKeyHeader

logger = logging.getLogger("ecopulse.security")

API_KEY_NAME = "x-api-key"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=True)


def _resolve_api_key() -> str:
    """Return the expected service key, never a guessable default.

    A shared literal like ``ecopulse_dev_key`` baked into both the client and
    the server means anyone who reads the JavaScript bundle can call the API.
    If the operator has not configured ``ML_API_KEY`` we mint a random one so
    the service fails closed instead of failing open.
    """
    configured = os.environ.get("ML_API_KEY", "").strip()
    if configured:
        return configured

    generated = secrets.token_urlsafe(32)
    logger.warning(
        "ML_API_KEY is not set. Generated an ephemeral key for this process: %s\n"
        "Set ML_API_KEY in the environment to use a stable key.",
        generated,
    )
    return generated


EXPECTED_API_KEY = _resolve_api_key()


def verify_api_key(api_key: str = Security(api_key_header)) -> str:
    # Constant-time compare so the key cannot be recovered byte-by-byte.
    if not secrets.compare_digest(api_key, EXPECTED_API_KEY):
        raise HTTPException(status_code=403, detail="Could not validate credentials")
    return api_key


# Supabase user ids are UUIDs. The evaluation harness also uses readable ids
# such as ``user_eco_001``, so allow that shape too - but nothing else, and
# never ``.``, ``/`` or ``\`` which would let the id escape the models
# directory.
USER_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def validate_user_id(user_id: str) -> str:
    if not USER_ID_PATTERN.fullmatch(user_id):
        raise ValueError(
            "user_id must be 1-64 characters of letters, digits, hyphen or underscore"
        )
    return user_id


def safe_model_path(models_dir: Path, user_id: str, suffix: str) -> Path:
    """Build a model path and prove it stays inside ``models_dir``.

    ``validate_user_id`` already makes traversal impossible; this is the
    belt-and-braces check so a future change to the pattern cannot silently
    reintroduce an arbitrary-path ``joblib.load`` / ``joblib.dump``.
    """
    validate_user_id(user_id)
    root = models_dir.resolve()
    candidate = (root / f"{user_id}{suffix}").resolve()
    if candidate.parent != root:
        raise ValueError("Resolved model path escapes the models directory")
    return candidate
