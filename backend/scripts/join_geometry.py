"""
python -m backend.scripts.join_geometry

Joins verified district administrative boundary geometry with existing
historical_crime_evidence rows that have no geometry yet.

Usage:
    python -m backend.scripts.join_geometry \\
        --boundaries data/crime/raw/india_districts.geojson

The GeoJSON must have features with properties:
    "state_name" (or similar — see STATE/DISTRICT_KEYS below)
    "district_name"

The script calls the attach_district_geometry() RPC to set geometry
for matching rows. It never fabricates coordinates.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

# Property keys to try for state and district names in the GeoJSON
STATE_KEYS    = ["state_name", "state", "STATE_NAME", "ST_NM", "st_nm"]
DISTRICT_KEYS = ["district_name", "district", "DISTRICT", "DIST_NAME", "dtname"]


def _get_prop(props: dict, keys: list[str]) -> str:
    for k in keys:
        if k in props and props[k]:
            return str(props[k]).strip()
    return ""


async def main(args: argparse.Namespace) -> int:
    import json
    from app.db.client import get_supabase

    path = Path(args.boundaries)
    if not path.exists():
        logger.error("Boundary file not found: %s", path)
        return 1

    with open(path, encoding="utf-8") as f:
        geojson = json.load(f)

    features = geojson.get("features", [])
    logger.info("Loaded %d boundary features", len(features))

    db      = get_supabase()
    updated = 0
    skipped = 0

    for feat in features:
        props    = feat.get("properties", {})
        state    = _get_prop(props, STATE_KEYS)
        district = _get_prop(props, DISTRICT_KEYS)
        if not state or not district:
            skipped += 1
            continue

        # Convert GeoJSON geometry to WKT for PostGIS
        geom = feat.get("geometry")
        if not geom:
            skipped += 1
            continue

        geom_type   = geom["type"]
        coordinates = geom["coordinates"]
        # Build WKT (simplified — for production use shapely or PostGIS ST_GeomFromGeoJSON)
        geom_wkt = _geojson_to_wkt(geom_type, coordinates)
        if not geom_wkt:
            skipped += 1
            continue

        try:
            resp = db.rpc("attach_district_geometry", {
                "p_state":    state,
                "p_district": district,
                "p_geometry": f"SRID=4326;{geom_wkt}",
            }).execute()
            n = resp.data or 0
            updated += n
        except Exception as exc:
            logger.warning("Failed to attach %s / %s: %s", state, district, exc)
            skipped += 1

    logger.info("Geometry join complete: %d features attached, %d skipped", updated, skipped)
    return 0


def _geojson_to_wkt(geom_type: str, coords: list) -> str | None:
    """Minimal GeoJSON → WKT converter for common geometry types."""
    def ring(pts: list) -> str:
        return "(" + ", ".join(f"{x} {y}" for x, y in pts) + ")"

    if geom_type == "Polygon":
        rings = ", ".join(ring(r) for r in coords)
        return f"POLYGON({rings})"
    if geom_type == "MultiPolygon":
        polys = ", ".join("(" + ", ".join(ring(r) for r in poly) + ")" for poly in coords)
        return f"MULTIPOLYGON({polys})"
    if geom_type == "Point":
        return f"POINT({coords[0]} {coords[1]})"
    logger.warning("Unsupported geometry type: %s", geom_type)
    return None


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Join district geometry with crime evidence rows")
    parser.add_argument("--boundaries", required=True, help="Path to GeoJSON boundary file")
    args = parser.parse_args()
    sys.exit(asyncio.run(main(args)))