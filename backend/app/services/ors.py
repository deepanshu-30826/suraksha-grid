from __future__ import annotations

import os
from typing import Any

import httpx


ORS_URL = "https://api.heigit.org/openrouteservice/v2/directions"


class ORSError(Exception):
    """Raised when OpenRouteService cannot calculate a route."""


async def get_ors_routes(
    origin: list[float],
    destination: list[float],
    profile: str = "foot-walking",
) -> list[dict[str, Any]]:
    """
    Calculate alternative routes using OpenRouteService.

    Coordinates are [longitude, latitude].
    API key stays server-side.
    """

    api_key = os.getenv("OPENROUTESERVICE_API_KEY")

    if not api_key:
        raise ORSError("OPENROUTESERVICE_API_KEY is not configured")

    if profile not in {
        "foot-walking",
        "driving-car",
        "cycling-regular",
    }:
        raise ORSError(f"Unsupported routing profile: {profile}")

    payload = {
        "coordinates": [origin, destination],
        "format": "geojson",
        "alternative_routes": {
            "target_count": 3,
            "share_factor": 0.6,
            "weight_factor": 1.4,
        },
        "instructions": False,
    }

    url = f"{ORS_URL}/{profile}"

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                url,
                headers={
                    "Authorization": api_key,
                    "Content-Type": "application/json",
                    "Accept": "application/json, application/geo+json, application/gpx+xml",
                },
                json=payload,
            )

    except httpx.RequestError as exc:
        raise ORSError(f"ORS network error: {exc}") from exc

    if response.status_code >= 400:
        try:
            detail = response.json()
        except Exception:
            detail = response.text

        raise ORSError(
            f"ORS returned HTTP {response.status_code}: {detail}"
        )

    data = response.json()

    # Standard GeoJSON response
    features = data.get("features", [])

    # Fallback if the provider returns a routes array
    if not features and isinstance(data.get("routes"), list):
        return data["routes"]

    if not features:
        raise ORSError(
            f"ORS returned no routes. "
            f"HTTP {response.status_code}. "
            f"Response keys: {list(data.keys())}. "
            f"Response: {data}"
        )

    return features