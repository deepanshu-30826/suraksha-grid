"""
Gemini Vision extension for the GeminiService.

Accepts a base64-encoded image and extracts ONLY safety-relevant signals:
- lighting level
- obstructions
- road accessibility
- visible crowd/activity level

Does NOT identify people, faces, license plates or infer sensitive attributes.
Does NOT produce a Safety Score — signals are fed to the Safety Engine.
"""
from __future__ import annotations

import base64
import json
import logging
from typing import Literal, Optional

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

VISION_PROMPT = """\
You are a safety-signal extractor for a navigation app.

Analyse this image and return ONLY a JSON object with these fields:
{
  "lighting":            "low" | "moderate" | "good" | "unknown",
  "obstruction":         "none" | "partial" | "significant" | "unknown",
  "road_accessibility":  "clear" | "partially_blocked" | "blocked" | "unknown",
  "crowd_activity":      "empty" | "low" | "moderate" | "high" | "unknown",
  "summary":             "<one sentence describing safety-relevant observations>",
  "confidence":          "low" | "medium" | "high"
}

Rules:
- Do NOT identify, describe or name any people in the image.
- Do NOT include faces, names, demographics or personal attributes.
- Focus only on environment: lighting, infrastructure, obstructions.
- Return ONLY the JSON — no markdown, no explanation.
"""


class VisionAnalysis(BaseModel):
    lighting:           Literal["low", "moderate", "good", "unknown"] = "unknown"
    obstruction:        Literal["none", "partial", "significant", "unknown"] = "unknown"
    road_accessibility: Literal["clear", "partially_blocked", "blocked", "unknown"] = "unknown"
    crowd_activity:     Literal["empty", "low", "moderate", "high", "unknown"] = "unknown"
    summary:            str = Field(default="No visual summary available", max_length=500)
    confidence:         Literal["low", "medium", "high"] = "low"


async def analyse_image(
    image_bytes: bytes,
    mime_type: str,
    api_key: str,
    timeout_s: float = 10.0,
) -> tuple[VisionAnalysis | None, str | None]:
    """
    Returns (VisionAnalysis, error_message).
    error_message is None on success.
    VisionAnalysis is None on failure.
    Never identifies people or produces safety scores.
    """
    if not api_key:
        return None, "GEMINI_API_KEY not configured"

    # Validate mime type — accept only common image formats
    allowed = {"image/jpeg", "image/png", "image/webp", "image/gif"}
    if mime_type not in allowed:
        return None, f"Unsupported image type: {mime_type}"

    b64 = base64.b64encode(image_bytes).decode()
    payload = {
        "contents": [{
            "parts": [
                {"text": VISION_PROMPT},
                {"inline_data": {"mime_type": mime_type, "data": b64}},
            ]
        }],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": 256},
    }
    GEMINI_URL = (
        "https://generativelanguage.googleapis.com/v1beta"
        "/models/gemini-1.5-flash:generateContent"
    )
    try:
        import httpx
        async with httpx.AsyncClient(timeout=timeout_s) as client:
            resp = await client.post(
                f"{GEMINI_URL}?key={api_key}",
                json=payload,
                headers={"Content-Type": "application/json"},
            )
        resp.raise_for_status()
        raw: str = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
        clean = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        parsed = json.loads(clean)
        return VisionAnalysis.model_validate(parsed), None
    except Exception as exc:
        logger.error("Vision analysis failed: %s", exc)
        return None, f"Vision analysis unavailable: {exc}"