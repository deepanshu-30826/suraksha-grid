"""
Tests for the Emergency Alert Service.
Run: cd backend && pytest tests/test_emergency.py -v
"""
from __future__ import annotations
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime, timezone


def make_event(**kw):
    from app.services.emergency import EmergencyEvent
    defaults = dict(
        user_id="u1", user_name="Test User",
        latitude=28.46, longitude=77.02,
    )
    defaults.update(kw)
    return EmergencyEvent(**defaults)


class TestDemoSmsProvider:
    @pytest.mark.asyncio
    async def test_demo_never_claims_real_delivery(self):
        from app.services.emergency import DemoSmsProvider
        svc = DemoSmsProvider()
        ok, msg = await svc.send("+91999", "test message")
        # ok=True (no exception) but message must say SIMULATED
        assert "SIMULATED" in (msg or "")

    @pytest.mark.asyncio
    async def test_demo_does_not_raise(self):
        from app.services.emergency import DemoSmsProvider
        svc = DemoSmsProvider()
        ok, _ = await svc.send("+0000000000", "body")
        assert isinstance(ok, bool)


class TestEmergencyService:
    @pytest.mark.asyncio
    async def test_no_resend_key_skips_email(self, monkeypatch):
        monkeypatch.delenv("RESEND_API_KEY", raising=False)
        from app.services.emergency import EmergencyService
        svc = EmergencyService()
        evt = make_event(emergency_contact_email="a@b.com")
        result = await svc.dispatch(evt)
        assert not result.email_sent
        assert result.email_error is not None

    @pytest.mark.asyncio
    async def test_no_contact_email_skips_email(self, monkeypatch):
        monkeypatch.delenv("RESEND_API_KEY", raising=False)
        from app.services.emergency import EmergencyService
        svc = EmergencyService()
        evt = make_event()   # no emergency_contact_email
        result = await svc.dispatch(evt)
        assert not result.email_sent

    @pytest.mark.asyncio
    async def test_sms_always_simulated(self, monkeypatch):
        monkeypatch.delenv("RESEND_API_KEY", raising=False)
        from app.services.emergency import EmergencyService
        svc = EmergencyService()
        evt = make_event(emergency_contact_phone="+91999")
        result = await svc.dispatch(evt)
        assert result.sms_simulated

    @pytest.mark.asyncio
    async def test_resend_success(self, monkeypatch):
        monkeypatch.setenv("RESEND_API_KEY", "test-key")
        from app.services.emergency import EmergencyService
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        with patch("httpx.AsyncClient") as mc:
            client = AsyncMock()
            mc.return_value.__aenter__.return_value = client
            client.post = AsyncMock(return_value=mock_resp)
            svc = EmergencyService()
            evt = make_event(emergency_contact_email="x@y.com")
            result = await svc.dispatch(evt)
        assert result.email_sent

    @pytest.mark.asyncio
    async def test_resend_failure_non_fatal(self, monkeypatch):
        import httpx
        monkeypatch.setenv("RESEND_API_KEY", "test-key")
        from app.services.emergency import EmergencyService
        with patch("httpx.AsyncClient") as mc:
            client = AsyncMock()
            mc.return_value.__aenter__.return_value = client
            client.post = AsyncMock(side_effect=httpx.TimeoutException("timeout"))
            svc = EmergencyService()
            evt = make_event(emergency_contact_email="x@y.com")
            result = await svc.dispatch(evt)
        assert not result.email_sent
        assert result.email_error is not None

    def test_map_link_contains_coords(self):
        from app.services.emergency import _map_link
        link = _map_link(28.46, 77.02)
        assert "28.46" in link and "77.02" in link

    @pytest.mark.asyncio
    async def test_dispatch_without_location_marks_unavailable(self, monkeypatch):
        monkeypatch.delenv("RESEND_API_KEY", raising=False)
        from app.services.emergency import EmergencyService
        svc = EmergencyService()
        evt = make_event(latitude=None, longitude=None, emergency_contact_phone="+919999999999")
        result = await svc.dispatch(evt)
        assert not result.location_available
        assert result.map_link == ""

    def test_emergency_trigger_endpoint_without_location(self):
        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)
        resp = client.post("/api/v1/emergency/trigger", json={
            "user_name": "Test User",
            "emergency_contact_phone": "+919999999999"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["location_available"] is False
        assert data["map_link"] == ""

    @pytest.mark.asyncio
    async def test_emergency_missing_contacts_returns_errors(self, monkeypatch):
        monkeypatch.delenv("RESEND_API_KEY", raising=False)
        from app.services.emergency import EmergencyService
        svc = EmergencyService()
        evt = make_event()  # no email, no phone
        result = await svc.dispatch(evt)
        assert not result.email_sent
        assert not result.sms_sent
        assert "No emergency contact email" in (result.email_error or "")
        assert "No emergency contact phone" in (result.sms_error or "")

    @pytest.mark.asyncio
    async def test_emergency_with_both_contacts(self, monkeypatch):
        monkeypatch.delenv("RESEND_API_KEY", raising=False)
        from app.services.emergency import EmergencyService
        svc = EmergencyService()
        evt = make_event(
            emergency_contact_email="test@example.com",
            emergency_contact_phone="+919876543210",
        )
        result = await svc.dispatch(evt)
        assert result.sms_simulated is True
        assert result.location_available is True


class TestVisionService:
    def test_vision_module_parses(self):
        import ast, os
        path = os.path.join(os.path.dirname(__file__), "../app/services/vision.py")
        ast.parse(open(path).read())

    @pytest.mark.asyncio
    async def test_no_api_key_returns_none(self, monkeypatch):
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
        from app.services.vision import analyse_image
        result, err = await analyse_image(b"fake", "image/jpeg", api_key="")
        assert result is None
        assert err is not None

    @pytest.mark.asyncio
    async def test_unsupported_mime_returns_error(self):
        from app.services.vision import analyse_image
        result, err = await analyse_image(b"fake", "application/pdf", api_key="test")
        assert result is None
        assert "Unsupported" in (err or "")