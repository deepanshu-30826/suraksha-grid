"""
Reports API — integrates Gemini analysis, community evidence,
and the Safety Engine recalculation pathway.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, Field
from typing import Optional
import logging

from app.db.client import get_supabase
from app.schemas.models import ReportCreate, ReportResponse
from app.services.data import create_report, get_reports
from app.services.gemini_service import get_gemini_service
from app.services.safety_engine import (
    SafetyInput, ReportSignal, calculate_safety_score,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class AnalysedReportCreate(ReportCreate):
    """Extended report that accepts free-form text for Gemini analysis."""
    original_text: Optional[str] = Field(default=None, max_length=2000)
    language: Optional[str] = Field(default=None, max_length=20)


class AnalysedReportResponse(BaseModel):
    report: ReportResponse
    gemini_used: bool
    gemini_error: Optional[str] = None
    # Structured signals Gemini extracted (not a score)
    extracted_category: Optional[str] = None
    extracted_severity: Optional[int] = None
    extracted_lighting: Optional[str] = None
    extracted_time_context: Optional[str] = None
    summary: Optional[str] = None


@router.get("/", response_model=list[ReportResponse])
async def list_reports(limit: int = 50, db=Depends(get_supabase)):
    """Return recent non-dismissed safety reports."""
    return await get_reports(db, limit=min(limit, 200))


@router.post("/", response_model=AnalysedReportResponse, status_code=201)
async def submit_report(
    body: AnalysedReportCreate,
    db=Depends(get_supabase),
    x_user_id: Optional[str] = Header(default=None),
):
    """
    Submit a safety report.

    Flow:
      1. Validate input
      2. If original_text provided → Gemini analysis → structured signals
      3. Gemini failure is non-fatal; report still saved
      4. Store in Supabase
      5. Trigger safety recalculation for affected segment
    """
    gemini_result = None
    gemini_used   = False
    gemini_error: Optional[str] = None

    # ── 1. Gemini analysis (if text provided) ──────────────────────────────
    if body.original_text:
        svc = get_gemini_service()
        gemini_result = await svc.analyse(body.original_text)
        gemini_used   = gemini_result.gemini_used
        gemini_error  = gemini_result.error

        if gemini_result.analysis:
            # Override category/severity with Gemini's structured output
            # when they are more informative than the client-selected values.
            a = gemini_result.analysis
            if a.severity > body.severity:
                body = body.model_copy(update={"severity": a.severity})

    # ── 2. Persist report ──────────────────────────────────────────────────
    data = body.model_dump(exclude_none=True, exclude={"original_text","language"})
    saved = await create_report(db, data, user_id=x_user_id)

    report_resp = ReportResponse(
        id          = saved.get("id", ""),
        category    = saved.get("category", body.category),
        description = saved.get("description"),
        latitude    = saved.get("latitude", body.latitude),
        longitude   = saved.get("longitude", body.longitude),
        status      = saved.get("status", "pending"),
        created_at  = saved.get("created_at", ""),
    )

    # ── 3. Async recalculation (fire-and-forget; never blocks the response) ──
    seg_id = body.road_segment_id
    if seg_id:
        try:
            await _trigger_recalculation(db, str(seg_id))
        except Exception as exc:
            logger.warning("Recalculation skipped: %s", exc)

    return AnalysedReportResponse(
        report               = report_resp,
        gemini_used          = gemini_used,
        gemini_error         = gemini_error,
        extracted_category   = gemini_result.analysis.category   if gemini_result else None,
        extracted_severity   = gemini_result.analysis.severity   if gemini_result else None,
        extracted_lighting   = gemini_result.analysis.lighting   if gemini_result else None,
        extracted_time_context = gemini_result.analysis.time_context if gemini_result else None,
        summary              = gemini_result.analysis.summary    if gemini_result else None,
    )


async def _trigger_recalculation(db, segment_id: str) -> None:
    """
    Fetch current segment signals + recent reports → Safety Engine → persist.
    Called internally after a report is saved.
    Does NOT fake the result. Raises on DB errors so the caller can log/skip.
    """
    from datetime import datetime, timezone

    seg_resp = (
        db.table("road_segments")
        .select("id,lighting_score,pedestrian_activity_score,emergency_access_label")
        .eq("id", segment_id)
        .single()
        .execute()
    )
    seg = seg_resp.data
    if not seg:
        raise ValueError(f"Segment {segment_id} not found")

    rep_resp = (
        db.table("safety_reports")
        .select("category,severity,created_at")
        .eq("road_segment_id", segment_id)
        .neq("status", "dismissed")
        .execute()
    )
    now = datetime.now(timezone.utc)
    reports = [
        ReportSignal(
            category  = r["category"],
            severity  = r["severity"],
            age_hours = (now - datetime.fromisoformat(r["created_at"])).total_seconds() / 3600,
        )
        for r in (rep_resp.data or [])
    ]

    inp    = SafetyInput(
        lighting            = seg["lighting_score"],
        pedestrian_activity = seg["pedestrian_activity_score"],
        emergency_access    = seg["emergency_access_label"],
        reports             = reports,
    )
    result = calculate_safety_score(inp)

    db.rpc("upsert_segment_scores", {
        "p_segment_id":          segment_id,
        "p_safety_score":        result.safety_score,
        "p_confidence_score":    result.confidence_score,
        "p_lighting_score":      round(inp.lighting),
        "p_pedestrian_activity": round(inp.pedestrian_activity),
        "p_explanation":         result.explanation,
    }).execute()