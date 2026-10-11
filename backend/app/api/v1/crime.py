"""
Historical Crime Evidence API endpoints.

GET  /api/v1/crime/evidence
     Returns overall availability status + summary.

POST /api/v1/crime/route-analysis
     Body: { route_wkt: str, route_length_m: float }
     Returns intersection results and HistoricalEvidence.

GET  /api/v1/crime/segment/{segment_id}
     Returns historical evidence for a specific road segment's geometry.
"""
from __future__ import annotations

from uuid import UUID
from pathlib import Path
import json
from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field
from typing import Optional

from app.db.client import get_supabase
from app.services.crime.spatial import route_crime_intersections, check_dataset_available
from app.services.crime.evidence import aggregate
from app.services.crime.config import SOURCE_DISCLAIMER, UNAVAILABLE_MESSAGE

router = APIRouter()

# In-memory cache for processed GeoJSON bytes
_CRIME_GEOJSON_BYTES: bytes | None = None


# ── Schemas ───────────────────────────────────────────────────────────────────

class EvidenceStatusResponse(BaseModel):
    dataset_available: bool
    message: str
    disclaimer: str


class RouteAnalysisRequest(BaseModel):
    route_wkt:      str   = Field(description="WKT LineString, SRID 4326")
    route_length_m: float = Field(ge=0)


class IntersectionOut(BaseModel):
    district:        str
    state:           str
    crime_category:  str
    incident_count:  int
    year:            int
    severity_weight: float
    intersection_m:  float
    exposure_fraction: float
    source:          str
    source_dataset:  str


class RouteAnalysisResponse(BaseModel):
    dataset_available:  bool
    evidence_level:     str
    confidence:         int
    score_adjustment:   float
    intersections:      list[IntersectionOut]
    years:              list[int]
    categories:         list[str]
    source:             str
    source_dataset:     str
    explanation:        str
    disclaimer:         str
    limitations:        str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_intersections_out(ixs) -> list[IntersectionOut]:
    return [
        IntersectionOut(
            district          = ix.district,
            state             = ix.state,
            crime_category    = ix.crime_category,
            incident_count    = ix.incident_count,
            year              = ix.year,
            severity_weight   = ix.severity_weight,
            intersection_m    = ix.intersection_m,
            exposure_fraction = ix.exposure_fraction,
            source            = ix.source,
            source_dataset    = ix.source_dataset,
        )
        for ix in ixs
    ]


def _make_route_response(available: bool, intersections, evidence) -> RouteAnalysisResponse:
    return RouteAnalysisResponse(
        dataset_available  = evidence.dataset_available,
        evidence_level     = evidence.evidence_level,
        confidence         = evidence.confidence,
        score_adjustment   = evidence.score_adjustment,
        intersections      = _make_intersections_out(intersections),
        years              = evidence.years,
        categories         = evidence.categories,
        source             = evidence.source,
        source_dataset     = evidence.source_dataset,
        explanation        = evidence.explanation,
        disclaimer         = SOURCE_DISCLAIMER,
        limitations        = (
            "Area-level historical evidence only. "
            "Does not indicate a specific crime occurred on this road. "
            "Safety Score is an evidence-based index, not a crime probability."
        ),
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/evidence", response_model=EvidenceStatusResponse)
async def evidence_status(db=Depends(get_supabase)):
    """
    Check whether historical crime data has been imported.
    Returns availability status without exposing raw data.
    """
    available = await check_dataset_available(db)
    return EvidenceStatusResponse(
        dataset_available = available,
        message           = "Dataset loaded" if available else UNAVAILABLE_MESSAGE,
        disclaimer        = SOURCE_DISCLAIMER,
    )


@router.post("/route-analysis", response_model=RouteAnalysisResponse)
async def analyse_route(body: RouteAnalysisRequest, db=Depends(get_supabase)):
    """
    Spatial route analysis against historical crime evidence.

    Returns aggregated evidence for a route described by a WKT LineString.
    When no dataset is imported, returns UNAVAILABLE without error.
    """
    available     = await check_dataset_available(db)
    intersections = []
    if available:
        intersections = await route_crime_intersections(
            db, body.route_wkt, body.route_length_m
        )
    evidence = aggregate(intersections, dataset_available=available)
    return _make_route_response(available, intersections, evidence)


@router.get("/segment/{segment_id}", response_model=RouteAnalysisResponse)
async def segment_evidence(segment_id: UUID, db=Depends(get_supabase)):
    """
    Fetch historical crime evidence for a single road segment.

    Retrieves the segment's LineString geometry from road_segments,
    converts it to WKT, and performs a PostGIS route-intersection query.
    Falls back to UNAVAILABLE if the segment is not found or has no geometry.
    """
    available = await check_dataset_available(db)
    intersections = []

    if available:
        try:
            # Fetch segment geometry as WKT text
            resp = (
                db.table("road_segments")
                .select("id, geometry::text, ST_Length(geometry::geography) as length_m")
                .eq("id", str(segment_id))
                .maybe_single()
                .execute()
            )
            seg = resp.data
            if seg and seg.get("geometry"):
                geom_wkt   = seg["geometry"]
                # Supabase returns WKT like "LINESTRING(lng lat, lng lat)"
                route_len_m = float(seg.get("length_m") or 0)
                if route_len_m > 0:
                    intersections = await route_crime_intersections(
                        db, geom_wkt, route_len_m
                    )
        except Exception:
            pass

    evidence = aggregate(intersections, dataset_available=available)
    return _make_route_response(available, intersections, evidence)


@router.get("/geojson")
async def crime_geojson():
    """
    Return GeoJSON FeatureCollection of historical crime evidence by district.
    Each feature includes real NCRB 2023 counts, categories breakdown,
    severity weights, and district boundary polygons.
    """
    global _CRIME_GEOJSON_BYTES
    if _CRIME_GEOJSON_BYTES is not None:
        return Response(
            content=_CRIME_GEOJSON_BYTES,
            media_type="application/json",
            headers={"Cache-Control": "public, max-age=3600"},
        )

    # Search possible paths for processed GeoJSON
    candidates = [
        Path("data/crime/processed/ncrb_districts_geojson.json"),
        Path("../data/crime/processed/ncrb_districts_geojson.json"),
        Path(__file__).resolve().parent.parent.parent.parent.parent / "data" / "crime" / "processed" / "ncrb_districts_geojson.json",
    ]

    for p in candidates:
        if p.exists():
            try:
                content = p.read_bytes()
                _CRIME_GEOJSON_BYTES = content
                return Response(
                    content=content,
                    media_type="application/json",
                    headers={"Cache-Control": "public, max-age=3600"},
                )
            except Exception:
                pass

    # Empty fallback FeatureCollection
    empty_fc = json.dumps({"type": "FeatureCollection", "features": []}).encode("utf-8")
    return Response(
        content=empty_fc,
        media_type="application/json",
        headers={"Cache-Control": "no-cache"},
    )
