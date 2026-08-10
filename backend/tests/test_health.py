"""Health endpoint unit tests (database mocked — no live Postgres required)."""

from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_root() -> None:
    response = client.get("/")
    assert response.status_code == 200
    body = response.json()
    assert body["phase"] == "1-foundation"
    assert body["health"] == "/api/v1/health"


@patch("app.api.routes.health.check_database_connection", return_value=True)
def test_health_ok(_mock_db) -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"]["connected"] is True


@patch(
    "app.api.routes.health.check_database_connection",
    side_effect=Exception("connection refused"),
)
def test_health_degraded(_mock_db) -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "degraded"
    assert body["database"]["connected"] is False
    assert "connection refused" in (body["database"]["error"] or "")
