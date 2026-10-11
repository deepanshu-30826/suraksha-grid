"""
Suraksha Grid — Emergency Alert Service
========================================

Flow:
  EmergencyEvent → EmailService (Resend) + SmsService (provider abstraction)

SMS:
  DemoSmsProvider  — always used unless a real provider is wired in.
  Clearly labelled SIMULATED. Never claims delivery.

Email:
  Resend provider via RESEND_API_KEY env var.
  Falls back gracefully when key is absent.

Safety Score is NOT recalculated here.
"""
from __future__ import annotations

import logging
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


# ── Data ─────────────────────────────────────────────────────────────────────

@dataclass
class EmergencyEvent:
    user_id:         Optional[str]
    user_name:       str
    latitude:        Optional[float] = None
    longitude:       Optional[float] = None
    timestamp:       datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    destination:     Optional[str] = None
    route_name:      Optional[str] = None
    emergency_contact_email: Optional[str] = None
    emergency_contact_phone: Optional[str] = None


@dataclass
class AlertResult:
    email_sent:  bool
    sms_sent:    bool
    sms_simulated: bool
    email_error: Optional[str] = None
    sms_error:   Optional[str] = None
    map_link:    str = ""
    location_available: bool = True


# ── SMS abstraction ───────────────────────────────────────────────────────────

class SmsProvider(ABC):
    @abstractmethod
    async def send(self, to: str, body: str) -> tuple[bool, Optional[str]]:
        """Returns (success, error_message)."""


class DemoSmsProvider(SmsProvider):
    """
    Demonstration SMS provider.

    SIMULATED — no real SMS is ever sent.
    Clearly labelled in all log output and responses.
    """
    async def send(self, to: str, body: str) -> tuple[bool, Optional[str]]:
        logger.warning(
            "[DEMO/SIMULATED] SMS NOT sent to %s. "
            "Body would have been: %s",
            to, body,
        )
        # Intentionally does not claim delivery
        return True, "SIMULATED — no real SMS was sent"


def get_sms_provider() -> SmsProvider:
    """
    Returns a real SMS provider when one is configured, otherwise DemoSmsProvider.
    Add real provider implementations here when integrating Twilio / Fast2SMS / etc.
    """
    # Future: if os.environ.get("TWILIO_ACCOUNT_SID"): return TwilioSmsProvider()
    return DemoSmsProvider()


# ── Email (Resend) ────────────────────────────────────────────────────────────

def _map_link(lat: float, lng: float) -> str:
    return f"https://www.google.com/maps?q={lat},{lng}"


def _email_body(evt: EmergencyEvent, link: str) -> str:
    dest = evt.destination or "unknown destination"
    route = evt.route_name or "unknown route"
    loc_str = (
        f"{evt.latitude:.5f}, {evt.longitude:.5f}\nMap:         {link}"
        if evt.latitude is not None and evt.longitude is not None and link
        else "Location unavailable (GPS coordinates not provided)\nMap:         Not available"
    )
    return f"""SURAKSHA GRID — EMERGENCY SAFETY ALERT

User:        {evt.user_name}
Time (UTC):  {evt.timestamp.strftime("%Y-%m-%d %H:%M:%S")}
Location:    {loc_str}
Destination: {dest}
Route:       {route}

---
This alert was triggered from the Suraksha Grid safety navigation app.
If this was a test or accidental trigger, no action is required.
"""


async def _send_resend_email(
    to: str,
    subject: str,
    body: str,
    api_key: str,
) -> tuple[bool, Optional[str]]:
    try:
        import httpx
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "from":    "Suraksha Grid <alerts@surakshagrid.app>",
                    "to":      [to],
                    "subject": subject,
                    "text":    body,
                },
            )
        if resp.status_code in (200, 201):
            return True, None
        return False, f"Resend HTTP {resp.status_code}: {resp.text[:200]}"
    except Exception as exc:
        return False, str(exc)


# ── Main service ──────────────────────────────────────────────────────────────

class EmergencyService:
    def __init__(self) -> None:
        self._resend_key = os.environ.get("RESEND_API_KEY", "")
        self._sms = get_sms_provider()

    async def dispatch(self, evt: EmergencyEvent) -> AlertResult:
        has_location = evt.latitude is not None and evt.longitude is not None
        link = _map_link(evt.latitude, evt.longitude) if has_location else ""
        result = AlertResult(
            email_sent=False, sms_sent=False,
            sms_simulated=isinstance(self._sms, DemoSmsProvider),
            map_link=link,
            location_available=has_location,
        )

        # ── Email ───────────────────────────────────────────────────────────
        to_email = evt.emergency_contact_email
        if to_email:
            if not self._resend_key:
                result.email_error = "RESEND_API_KEY not configured"
                logger.warning("Email skipped: RESEND_API_KEY absent")
            else:
                subject = f"⚠️ SAFETY ALERT — {evt.user_name} needs help"
                body = _email_body(evt, link)
                ok, err = await _send_resend_email(to_email, subject, body, self._resend_key)
                result.email_sent = ok
                result.email_error = err
        else:
            result.email_error = "No emergency contact email configured"

        # ── SMS ─────────────────────────────────────────────────────────────
        to_phone = evt.emergency_contact_phone
        if to_phone:
            loc_desc = f"Last location: {link}" if link else "Location unavailable"
            sms_body = (
                f"SAFETY ALERT: {evt.user_name} may need help. "
                f"{loc_desc} at {evt.timestamp.strftime('%H:%M UTC')}"
            )
            ok, err = await self._sms.send(to_phone, sms_body)
            result.sms_sent = ok
            result.sms_error = err
        else:
            result.sms_error = "No emergency contact phone configured"

        return result


_service: EmergencyService | None = None

def get_emergency_service() -> EmergencyService:
    global _service
    if _service is None:
        _service = EmergencyService()
    return _service