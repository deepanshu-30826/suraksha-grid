"""
Historical Crime Evidence API endpoints.

GET  /api/v1/crime/evidence
     Returns overall availability status + summary.

POST /api/v1/crime/route-analysis
     Body: { route_wkt: str, route_length_m: float }
     Returns intersection results and HistoricalEvidence.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from typing import Optional

from app.db.client import get_supabase
from app.services.crime.spatial import route_crime_intersections, check_dataset_available
from app.services.crime.evidence import aggregate
from app.services.crime.config import SOURCE_DISCLAIMER, UNAVAILABLE_MESSAGE

router = APIRouter()


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
    available    = await check_dataset_available(db)
    intersections = []
    if available:
        intersections = await route_crime_intersections(
            db, body.route_wkt, body.route_length_m
        )

    evidence = aggregate(intersections, dataset_available=available)

    return RouteAnalysisResponse(
        dataset_available  = evidence.dataset_available,
        evidence_level     = evidence.evidence_level,
        confidence         = evidence.confidence,
        score_adjustment   = evidence.score_adjustment,
        intersections      = [
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
            for ix in intersections
        ],
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