"""
Basic smoke tests for the FastAPI application.
Run with:  cd backend && pytest tests/ -v
These tests use the in-process TestClient — no real database required.
"""
from __future__ import annotations
import os
import pytest
from unittest.mock import patch, MagicMock

# Patch settings before importing app to avoid needing real env vars
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:3000")

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["service"] == "suraksha-grid-api"


def test_docs_available():
    resp = client.get("/docs")
    assert resp.status_code == 200


def test_segments_requires_db():
    """Without a real DB the endpoint should return a 500 (not a crash)."""
    with patch("app.db.client.get_supabase", side_effect=RuntimeError("no db")):
        resp = client.get("/api/v1/segments/")
        assert resp.status_code in (500, 503)


def test_routes_requires_db():
    with patch("app.db.client.get_supabase", side_effect=RuntimeError("no db")):
        resp = client.get("/api/v1/routes/")
        assert resp.status_code in (500, 503)