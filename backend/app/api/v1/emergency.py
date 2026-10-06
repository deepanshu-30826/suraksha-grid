"""Emergency alert API endpoint."""
from __future__ import annotations

from fastapi import APIRouter, Header
from pydantic import BaseModel, Field
from typing import Optional

from app.services.emergency import EmergencyEvent, AlertResult, get_emergency_service

router = APIRouter()


class EmergencyRequest(BaseModel):
    user_name:       str = Field(default="App User", max_length=120)
    latitude:        float = Field(ge=-90, le=90)
    longitude:       float = Field(ge=-180, le=180)
    destination:     Optional[str] = Field(default=None, max_length=200)
    route_name:      Optional[str] = Field(default=None, max_length=80)
    emergency_contact_email: Optional[str] = Field(default=None, max_length=254)
    emergency_contact_phone: Optional[str] = Field(default=None, max_length=30)


class EmergencyResponse(BaseModel):
    email_sent:    bool
    sms_sent:      bool
    sms_simulated: bool
    map_link:      str
    email_error:   Optional[str] = None
    sms_error:     Optional[str] = None


@router.post("/trigger", response_model=EmergencyResponse, status_code=200)
async def trigger_emergency(
    body: EmergencyRequest,
    x_user_id: Optional[str] = Header(default=None),
):
    """
    Dispatch an emergency safety alert.

    Email: sent via Resend when RESEND_API_KEY is set.
    SMS:   SIMULATED in demo mode — DemoSmsProvider never delivers a real SMS.
    Safety Score is not recalculated here.
    """
    svc = get_emergency_service()
    evt = EmergencyEvent(
        user_id=x_user_id,
        user_name=body.user_name,
        latitude=body.latitude,
        longitude=body.longitude,
        destination=body.destination,
        route_name=body.route_name,
        emergency_contact_email=body.emergency_contact_email,
        emergency_contact_phone=body.emergency_contact_phone,
    )
    result = await svc.dispatch(evt)
    return EmergencyResponse(
        email_sent    = result.email_sent,
        sms_sent      = result.sms_sent,
        sms_simulated = result.sms_simulated,
        map_link      = result.map_link,
        email_error   = result.email_error,
        sms_error     = result.sms_error,
    )