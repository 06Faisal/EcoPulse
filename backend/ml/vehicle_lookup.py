"""
Vehicle registration lookup for Indian vehicles.
Primary source: Parivahan.gov.in (government data)
Fallback: Gemini AI inference (triggered by caller)

Enhancements:
- Extracts emission norms, vehicle age, body type, fitness expiry
- Infers vehicle condition from BS norm + age
- In-memory TTL cache (1 hour) to avoid repeat scrapes
"""
import re
import time
import httpx
from bs4 import BeautifulSoup
from typing import Optional

PARIVAHAN_URL = "https://vahan.parivahan.gov.in/vahanservice/vahan/ui/statevalidation/homepage.xhtml"
PARIVAHAN_SEARCH_URL = "https://vahan.parivahan.gov.in/vahanservice/vahan/ui/searchvahan/searchVahan.xhtml"

# Cache: { plate -> (timestamp, result_dict) }
_LOOKUP_CACHE: dict[str, tuple[float, Optional[dict]]] = {}
_CACHE_TTL_SECONDS = 3600  # 1 hour

# Fuel type normalisation map (Parivahan uses different labels)
_FUEL_MAP = {
    "petrol": "petrol",
    "diesel": "diesel",
    "electric": "electric",
    "cng": "cng",
    "lpg": "lpg",
    "hybrid": "hybrid",
    "battery": "electric",
    "petrol+cng": "cng",
    "petrol+lpg": "lpg",
    "petrol/cng": "cng",
    "petrol/lpg": "lpg",
    "ev": "electric",
}

# Vehicle class normalisation
_VCLASS_MAP = {
    "motor cycle": "motorcycle",
    "motorcycle": "motorcycle",
    "motor car": "car",
    "car": "car",
    "jeep": "car",
    "suv": "car",
    "light motor vehicle": "car",
    "maxi cab": "bus",
    "bus": "bus",
    "scooter": "scooter",
    "moped": "scooter",
    "auto rickshaw": "auto",
    "e-rickshaw": "auto",
    "truck": "truck",
    "tractor": "truck",
    "hatch": "car",
    "sedan": "car",
    "mpv": "car",
    "crossover": "car",
}

# Emission norm → years since BS-VI became mandatory (April 2020)
_NORM_RANK = {
    "bs vi": 6,
    "bs-vi": 6,
    "bs6": 6,
    "bharat stage vi": 6,
    "bs iv": 4,
    "bs-iv": 4,
    "bs4": 4,
    "bharat stage iv": 4,
    "bs iii": 3,
    "bs-iii": 3,
    "bs3": 3,
    "bs ii": 2,
    "bs-ii": 2,
    "bs i": 1,
    "bs-i": 1,
}


def _normalise_fuel(raw: str) -> str:
    key = raw.strip().lower()
    return _FUEL_MAP.get(key, key)


def _normalise_vclass(raw: str) -> str:
    key = raw.strip().lower()
    for pattern, mapped in _VCLASS_MAP.items():
        if pattern in key:
            return mapped
    return key


def _parse_year_from_date(date_str: str) -> Optional[int]:
    """Extract 4-digit year from a date string."""
    if not date_str:
        return None
    match = re.search(r"\b(19|20)\d{2}\b", date_str)
    return int(match.group()) if match else None


def _infer_condition(emission_norm: str, vehicle_age: Optional[int]) -> str:
    """
    Infer vehicle condition from emission norm and age.
    Returns 'Good', 'Average', or 'Poor'.
    """
    norm_key = emission_norm.strip().lower()
    norm_rank = _NORM_RANK.get(norm_key, 0)

    age = vehicle_age if vehicle_age is not None else 99

    if norm_rank >= 6:  # BS-VI
        if age <= 3:
            return "Good"
        elif age <= 7:
            return "Average"
        else:
            return "Poor"
    elif norm_rank == 4:  # BS-IV
        if age <= 4:
            return "Average"
        else:
            return "Poor"
    else:  # BS-III or older / unknown
        return "Poor"


def lookup_via_parivahan(reg_number: str) -> Optional[dict]:
    """
    Attempt to scrape vehicle details from Parivahan.
    Returns a dict with enriched fields or None on failure.

    Cached for 1 hour per plate number.
    """
    clean = reg_number.strip().upper().replace(" ", "")

    # Check in-memory cache first
    if clean in _LOOKUP_CACHE:
        ts, cached = _LOOKUP_CACHE[clean]
        if time.time() - ts < _CACHE_TTL_SECONDS:
            print(f"[vehicle_lookup] Cache hit for {clean}")
            return cached

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-IN,en;q=0.9",
        "Referer": "https://vahan.parivahan.gov.in/",
    }

    result = None
    try:
        with httpx.Client(timeout=12, follow_redirects=True, headers=headers) as client:
            # Step 1: Get the search page to grab session cookies + viewstate
            resp = client.get(PARIVAHAN_URL)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "html.parser")

            # Extract JSF viewstate
            viewstate_tag = soup.find("input", {"name": "javax.faces.ViewState"})
            if not viewstate_tag:
                _LOOKUP_CACHE[clean] = (time.time(), None)
                return None
            viewstate = viewstate_tag.get("value", "")

            # Step 2: Submit the registration number
            form_data = {
                "javax.faces.partial.ajax": "true",
                "javax.faces.source": "regSearchForm:regNoSearch",
                "javax.faces.partial.execute": "@all",
                "javax.faces.partial.render": "@all",
                "regSearchForm": "regSearchForm",
                "regSearchForm:regNo": clean,
                "javax.faces.ViewState": viewstate,
            }

            search_resp = client.post(PARIVAHAN_SEARCH_URL, data=form_data)
            search_resp.raise_for_status()

            result_soup = BeautifulSoup(search_resp.text, "html.parser")

            def get_cell(label: str) -> str:
                for row in result_soup.find_all("tr"):
                    cells = row.find_all("td")
                    if len(cells) >= 2:
                        if label.lower() in cells[0].get_text(strip=True).lower():
                            return cells[1].get_text(strip=True)
                return ""

            maker = get_cell("maker") or get_cell("manufacturer") or get_cell("make")
            model = get_cell("model")
            fuel_raw = get_cell("fuel") or get_cell("fuel type")
            vclass_raw = get_cell("vehicle class") or get_cell("class")
            reg_date = get_cell("registration date") or get_cell("reg date")
            fitness_expiry = get_cell("fitness upto") or get_cell("fitness") or get_cell("fitness valid")
            norm_raw = (
                get_cell("emission norm")
                or get_cell("bharat stage")
                or get_cell("norm")
                or get_cell("pollution norm")
            )
            body_type = get_cell("body type") or get_cell("body")
            colour = get_cell("colour") or get_cell("color")

            # Try to extract year from registration date
            reg_year = _parse_year_from_date(reg_date)
            current_year = 2026  # based on current date provided
            vehicle_age = (current_year - reg_year) if reg_year else None

            if not maker and not model and not fuel_raw:
                _LOOKUP_CACHE[clean] = (time.time(), None)
                return None  # Nothing useful found

            # Infer condition
            condition_hint = _infer_condition(norm_raw, vehicle_age)

            # Check if fitness is expired/near-expiry
            if fitness_expiry:
                fitness_year = _parse_year_from_date(fitness_expiry)
                if fitness_year and fitness_year < current_year:
                    condition_hint = "Poor"  # Fitness expired → override to Poor

            result = {
                "make": maker,
                "model": model,
                "fuelType": _normalise_fuel(fuel_raw) if fuel_raw else "",
                "vehicleType": _normalise_vclass(vclass_raw) if vclass_raw else "",
                "year": reg_year,
                "vehicleAge": vehicle_age,
                "emissionNorm": norm_raw or "",
                "bodyType": body_type or "",
                "colour": colour or "",
                "fitnessExpiry": fitness_expiry or "",
                "conditionHint": condition_hint,
                "source": "parivahan",
            }

    except Exception as exc:
        print(f"[vehicle_lookup] Parivahan scrape failed for {clean}: {exc}")
        result = None

    # Store in cache (even None, so we don't retry immediately)
    _LOOKUP_CACHE[clean] = (time.time(), result)
    return result
