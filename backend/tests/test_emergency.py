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


class TestVoiceMessageEmergency:
    def test_voice_attachment_validation_valid_webm(self):
        import base64
        from app.services.emergency import validate_and_prepare_voice_attachment
        sample_audio = b"\x1a\x45\xdf\xa3dummy-webm-audio-bytes"
        b64 = base64.b64encode(sample_audio).decode("ascii")
        att, err = validate_and_prepare_voice_attachment(b64, mime_type="audio/webm")
        assert err is None
        assert att is not None
        assert att["filename"].endswith(".webm")
        assert att["content_type"] == "audio/webm"
        assert base64.b64decode(att["content"]) == sample_audio

    def test_voice_attachment_validation_data_url(self):
        import base64
        from app.services.emergency import validate_and_prepare_voice_attachment
        sample_audio = b"OggSdummy-ogg-audio-bytes"
        b64 = "data:audio/ogg;base64," + base64.b64encode(sample_audio).decode("ascii")
        att, err = validate_and_prepare_voice_attachment(b64)
        assert err is None
        assert att is not None
        assert att["filename"].endswith(".ogg")
        assert att["content_type"] == "audio/ogg"
        assert base64.b64decode(att["content"]) == sample_audio

    def test_voice_attachment_validation_missing_audio(self):
        from app.services.emergency import validate_and_prepare_voice_attachment
        att, err = validate_and_prepare_voice_attachment(None)
        assert att is None
        assert err is None

        att2, err2 = validate_and_prepare_voice_attachment("")
        assert att2 is None
        assert "empty" in (err2 or "")

    def test_voice_attachment_validation_unsupported_mime(self):
        import base64
        from app.services.emergency import validate_and_prepare_voice_attachment
        b64 = base64.b64encode(b"malicious-script-or-pdf").decode("ascii")
        att, err = validate_and_prepare_voice_attachment(b64, mime_type="application/pdf")
        assert att is None
        assert "Unsupported audio MIME type" in (err or "")

    def test_voice_attachment_validation_invalid_base64(self):
        from app.services.emergency import validate_and_prepare_voice_attachment
        att, err = validate_and_prepare_voice_attachment("%%%invalid-base64%%%", mime_type="audio/webm")
        assert att is None
        assert "Invalid base64" in (err or "")

    def test_voice_attachment_validation_empty_audio(self):
        import base64
        from app.services.emergency import validate_and_prepare_voice_attachment
        b64 = base64.b64encode(b"").decode("ascii")
        att, err = validate_and_prepare_voice_attachment(b64, mime_type="audio/webm")
        assert att is None
        assert "empty" in (err or "")

    def test_voice_attachment_validation_oversized_audio(self):
        import base64
        from app.services.emergency import validate_and_prepare_voice_attachment
        big_audio = b"A" * 500
        b64 = base64.b64encode(big_audio).decode("ascii")
        att, err = validate_and_prepare_voice_attachment(b64, mime_type="audio/webm", max_bytes=200)
        assert att is None
        assert "exceeds maximum allowed size" in (err or "")

    @pytest.mark.asyncio
    async def test_resend_email_attachment_construction(self, monkeypatch):
        import base64
        monkeypatch.setenv("RESEND_API_KEY", "test-key")
        from app.services.emergency import EmergencyService
        mock_resp = MagicMock()
        mock_resp.status_code = 200

        audio_bytes = b"dummy-audio"
        b64 = base64.b64encode(audio_bytes).decode("ascii")

        with patch("httpx.AsyncClient") as mc:
            client = AsyncMock()
            mc.return_value.__aenter__.return_value = client
            client.post = AsyncMock(return_value=mock_resp)

            svc = EmergencyService()
            evt = make_event(
                emergency_contact_email="guardian@example.com",
                emergency_contact_phone="+919999999999",
                voice_message_base64=b64,
                voice_message_mime_type="audio/webm",
            )
            result = await svc.dispatch(evt)

        assert result.email_sent is True
        assert result.voice_attached is True
        assert result.voice_error is None

        # Verify Resend API call arguments
        call_kwargs = client.post.call_args.kwargs
        json_body = call_kwargs["json"]
        assert "attachments" in json_body
        assert len(json_body["attachments"]) == 1
        att = json_body["attachments"][0]
        assert att["filename"].endswith(".webm")
        assert att["content"] == b64
        assert att["content_type"] == "audio/webm"
        assert "recorded voice message is attached" in json_body["text"]

    @pytest.mark.asyncio
    async def test_resend_email_voice_provider_failure(self, monkeypatch):
        import base64
        monkeypatch.setenv("RESEND_API_KEY", "test-key")
        from app.services.emergency import EmergencyService
        mock_resp = MagicMock()
        mock_resp.status_code = 422
        mock_resp.text = "Attachment validation failed"

        b64 = base64.b64encode(b"audio").decode("ascii")

        with patch("httpx.AsyncClient") as mc:
            client = AsyncMock()
            mc.return_value.__aenter__.return_value = client
            client.post = AsyncMock(return_value=mock_resp)

            svc = EmergencyService()
            evt = make_event(
                emergency_contact_email="guardian@example.com",
                voice_message_base64=b64,
                voice_message_mime_type="audio/webm",
            )
            result = await svc.dispatch(evt)

        assert result.email_sent is False
        assert result.voice_attached is False
        assert "Resend HTTP 422" in (result.email_error or "")
        assert result.voice_error is not None

    @pytest.mark.asyncio
    async def test_sos_preserves_flow_without_audio(self, monkeypatch):
        monkeypatch.setenv("RESEND_API_KEY", "test-key")
        from app.services.emergency import EmergencyService
        mock_resp = MagicMock()
        mock_resp.status_code = 200

        with patch("httpx.AsyncClient") as mc:
            client = AsyncMock()
            mc.return_value.__aenter__.return_value = client
            client.post = AsyncMock(return_value=mock_resp)

            svc = EmergencyService()
            evt = make_event(emergency_contact_email="guardian@example.com")
            result = await svc.dispatch(evt)

        assert result.email_sent is True
        assert result.voice_attached is False
        assert result.voice_error is None
        json_body = client.post.call_args.kwargs["json"]
        assert "attachments" not in json_body
        assert "No voice message was recorded." in json_body["text"]

    def test_endpoint_trigger_with_valid_voice(self, monkeypatch):
        import base64
        monkeypatch.setenv("RESEND_API_KEY", "test-key")
        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)

        mock_resp = MagicMock()
        mock_resp.status_code = 200

        b64 = base64.b64encode(b"valid-audio-data").decode("ascii")

        with patch("httpx.AsyncClient") as mc:
            mock_client = AsyncMock()
            mc.return_value.__aenter__.return_value = mock_client
            mock_client.post = AsyncMock(return_value=mock_resp)

            resp = client.post("/api/v1/emergency/trigger", json={
                "user_name": "Test User",
                "emergency_contact_email": "test@example.com",
                "voice_message_base64": b64,
                "voice_message_mime_type": "audio/webm",
            })

        assert resp.status_code == 200
        data = resp.json()
        assert data["email_sent"] is True
        assert data["voice_attached"] is True

    def test_endpoint_trigger_with_invalid_mime_returns_400(self):
        import base64
        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)

        b64 = base64.b64encode(b"not-audio").decode("ascii")
        resp = client.post("/api/v1/emergency/trigger", json={
            "user_name": "Test User",
            "emergency_contact_email": "test@example.com",
            "voice_message_base64": b64,
            "voice_message_mime_type": "application/pdf",
        })
        assert resp.status_code == 400
        assert "Unsupported audio MIME type" in resp.json()["detail"]

    def test_endpoint_trigger_with_corrupt_base64_returns_400(self):
        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)

        resp = client.post("/api/v1/emergency/trigger", json={
            "user_name": "Test User",
            "emergency_contact_email": "test@example.com",
            "voice_message_base64": "!!!corrupt!!!",
            "voice_message_mime_type": "audio/webm",
        })
        assert resp.status_code == 400
        assert "Invalid base64" in resp.json()["detail"]

    def test_endpoint_trigger_without_voice_preserves_existing_flow(self):
        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)

        resp = client.post("/api/v1/emergency/trigger", json={
            "user_name": "Test User",
            "emergency_contact_phone": "+919999999999",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["voice_attached"] is False
        assert data["sms_simulated"] is True


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