"""
Suraksha Grid — Nearby Emergency Help Services
Fetches genuine nearby police stations, hospitals, and emergency help points
using OpenStreetMap (Overpass API) and verified database points.
Never returns hardcoded or fabricated mock locations.
"""
from __future__ import annotations

import logging
import math
import time
import urllib.parse
import urllib.request
import json
import uuid
from typing import Any

logger = logging.getLogger(__name__)

# Overpass API mirrors
OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

# Simple in-memory cache: key -> (timestamp, data)
_CACHE: dict[str, tuple[float, list[dict[str, Any]]]] = {}
CACHE_TTL_SECONDS = 600.0  # 10 minutes


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle distance between two points in kilometres."""
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2.0) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(max(0.0, a)), math.sqrt(max(0.0, 1.0 - a)))
    return round(r * c, 2)


def _build_overpass_query(lat: float, lng: float, radius_m: int) -> str:
    """Build bounded Overpass QL query for police, hospital, and emergency help amenities."""
    return f"""[out:json][timeout:10];
(
  node["amenity"="police"](around:{radius_m},{lat},{lng});
  way["amenity"="police"](around:{radius_m},{lat},{lng});
  node["amenity"="hospital"](around:{radius_m},{lat},{lng});
  way["amenity"="hospital"](around:{radius_m},{lat},{lng});
  node["amenity"="clinic"](around:{radius_m},{lat},{lng});
  way["amenity"="clinic"](around:{radius_m},{lat},{lng});
  node["amenity"="doctors"](around:{radius_m},{lat},{lng});
  way["amenity"="doctors"](around:{radius_m},{lat},{lng});
  node["amenity"="fire_station"](around:{radius_m},{lat},{lng});
  way["amenity"="fire_station"](around:{radius_m},{lat},{lng});
  node["emergency"="phone"](around:{radius_m},{lat},{lng});
  node["emergency"="ambulance_station"](around:{radius_m},{lat},{lng});
  way["emergency"="ambulance_station"](around:{radius_m},{lat},{lng});
);
out center 40;"""


def _query_overpass(query_str: str) -> list[dict]:
    """Execute Overpass query with mirror fallbacks."""
    data = ("data=" + urllib.parse.quote(query_str)).encode("utf-8")
    last_err: Exception | None = None

    for mirror in OVERPASS_MIRRORS:
        try:
            req = urllib.request.Request(
                mirror,
                data=data,
                headers={
                    "User-Agent": "SurakshaGrid/1.0 (Nearby Emergency Help)",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            )
            with urllib.request.urlopen(req, timeout=9) as resp:
                if resp.status == 200:
                    body = json.loads(resp.read().decode("utf-8"))
                    elements = body.get("elements", [])
                    return elements
        except Exception as exc:
            last_err = exc
            logger.warning("Overpass mirror %s failed: %s", mirror, exc)
            continue

    if last_err:
        logger.error("All Overpass mirrors failed: %s", last_err)
    return []


def _classify_amenity(tags: dict[str, str]) -> str:
    """Map OSM tags to Suraksha Grid help categories: police, hospital, or help."""
    amenity = tags.get("amenity", "").lower()
    emergency = tags.get("emergency", "").lower()

    if amenity == "police":
        return "police"
    if amenity in {"hospital", "clinic", "doctors"} or emergency == "ambulance_station":
        return "hospital"
    return "help"


def _format_name(tags: dict[str, str], kind: str) -> str:
    """Extract real name or fall back to descriptive label."""
    name = (
        tags.get("name")
        or tags.get("name:en")
        or tags.get("official_name")
        or tags.get("operator")
    )
    if name and name.strip():
        return name.strip()

    if kind == "police":
        return "Police Station"
    if kind == "hospital":
        amenity = tags.get("amenity", "").lower()
        if amenity == "clinic":
            return "Health Clinic"
        return "Hospital / Medical Centre"
    if tags.get("amenity") == "fire_station":
        return "Fire & Rescue Station"
    return "Emergency Help Point"


def _parse_opening_hours(tags: dict[str, str]) -> tuple[bool, str | None]:
    """Parse opening hours tags honestly; never fabricate 'Open 24h'."""
    raw = tags.get("opening_hours", "").strip()
    emergency_val = tags.get("emergency", "").strip().lower()

    if raw == "24/7" or emergency_val in {"yes", "24/7"}:
        return True, "Open 24h"
    if raw:
        return False, raw
    return False, None


def get_nearby_places(lat: float, lng: float, radius_m: int = 5000) -> list[dict[str, Any]]:
    """
    Find genuine nearby emergency facilities for the user's actual GPS position.
    Initial search radius: 5 km (5000 m).
    Expands to 10 km (10000 m) if fewer than 3 genuine places are found.
    Results are strictly sorted nearest-first.
    """
    cache_key = f"{round(lat, 3)}:{round(lng, 3)}:{radius_m}"
    now = time.time()
    if cache_key in _CACHE:
        cached_time, cached_data = _CACHE[cache_key]
        if now - cached_time < CACHE_TTL_SECONDS:
            return cached_data

    # First attempt: search with requested radius (default 5 km)
    query = _build_overpass_query(lat, lng, radius_m)
    elements = _query_overpass(query)

    # If fewer than 3 results and initial radius was <= 5000m, expand to 10 km
    if len(elements) < 3 and radius_m <= 5000:
        logger.info("Fewer than 3 results within %dm. Expanding search to 10000m.", radius_m)
        expanded_query = _build_overpass_query(lat, lng, 10000)
        expanded_elements = _query_overpass(expanded_query)
        if len(expanded_elements) > len(elements):
            elements = expanded_elements
            radius_m = 10000

    results: list[dict[str, Any]] = []
    seen: set[tuple[str, int, int]] = set()

    for el in elements:
        tags = el.get("tags") or {}
        el_lat = el.get("lat") or el.get("center", {}).get("lat")
        el_lon = el.get("lon") or el.get("center", {}).get("lon")

        if el_lat is None or el_lon is None:
            continue

        dist_km = haversine_km(lat, lng, el_lat, el_lon)
        # Verify result is genuinely within the search radius (with 100m buffer)
        if dist_km * 1000 > radius_m + 100:
            continue

        kind = _classify_amenity(tags)
        name = _format_name(tags, kind)

        # Deduplicate by name and approximate coordinates (within ~100m)
        dedup_key = (name.lower(), round(el_lat * 1000), round(el_lon * 1000))
        if dedup_key in seen:
            continue
        seen.add(dedup_key)

        open_24h, hours_text = _parse_opening_hours(tags)
        phone = tags.get("phone") or tags.get("contact:phone")

        addr_parts = [
            tags.get("addr:housenumber"),
            tags.get("addr:street"),
            tags.get("addr:suburb") or tags.get("addr:district"),
            tags.get("addr:city"),
        ]
        address = ", ".join(p for p in addr_parts if p) or None

        el_type = el.get("type", "node")
        el_id = el.get("id", 0)
        point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"osm:{el_type}:{el_id}"))

        results.append({
            "id": point_id,
            "name": name,
            "type": kind,
            "latitude": el_lat,
            "longitude": el_lon,
            "address": address,
            "phone": phone,
            "open_24h": open_24h,
            "opening_hours": hours_text,
            "distance_km": dist_km,
        })

    # Sort strictly nearest-first
    results.sort(key=lambda x: x["distance_km"])

    _CACHE[cache_key] = (now, results)
    return results


def clear_help_cache() -> None:
    """Clear in-memory cache (for testing)."""
    _CACHE.clear()
