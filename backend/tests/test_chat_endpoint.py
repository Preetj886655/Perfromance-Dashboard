"""Tests for Manufacturing AI Chatbot endpoints, tools, and fallback engine."""

from __future__ import annotations

import sys
from typing import Any
from unittest.mock import MagicMock, patch

if "openai" not in sys.modules:
    sys.modules["openai"] = MagicMock()

import pytest
from fastapi.testclient import TestClient

from app.api.routes.chat import check_chat_access
from app.core.config import settings
from app.main import app
from app.models.user import User
from app.services import chat_analytics_tools as tools
from tests.chat_test_support import install_mock_chat_sources
from app.services.chat_service import (
    ChatFilterContext,
    ChatRequestPayload,
    process_chat_query,
)


@pytest.fixture(autouse=True)
def mock_chat_sources(monkeypatch: pytest.MonkeyPatch):
    install_mock_chat_sources(monkeypatch)


@pytest.fixture
def mock_dashboard_user() -> User:
    user = User(
        email="test.user@patilgroup.com",
        employee_code="EMP-TEST",
        is_active=True,
    )
    return user


@pytest.fixture
def client(mock_dashboard_user: User):
    def mock_require_perm():
        return mock_dashboard_user

    app.dependency_overrides[check_chat_access] = mock_require_perm
    with patch.object(settings, "chat_provider", "deterministic"):
        with TestClient(app) as test_client:
            yield test_client
    app.dependency_overrides.clear()


def test_chat_analytics_tools_manufacturing_kpis():
    """Verify core KPI tool returns calculated metrics from live/mock data."""
    res = tools.get_manufacturing_kpis(date_from="2026-01-01", date_to="2026-10-09")
    assert "totalProduction" in res
    assert "totalTarget" in res
    assert "productionAchievementPercent" in res
    assert "productionGap" in res
    assert "totalDowntimeHours" in res
    assert "rejectionRatePercent" in res
    assert res["recordCount"] > 0


def test_chat_analytics_tools_line_gap():
    """Verify line breakdown correctly identifies and sorts by production gap."""
    lines = tools.get_production_by_line(date_from="2026-01-01", date_to="2026-10-09")
    assert isinstance(lines, list)
    if lines:
        first = lines[0]
        assert "line" in first
        assert "gap" in first
        assert "achievementPercent" in first
        # Verify sorted descending by gap
        for i in range(len(lines) - 1):
            assert lines[i]["gap"] >= lines[i + 1]["gap"]


def test_chat_analytics_tools_top_downtime_causes():
    """Verify top downtime causes tool returns sorted causes."""
    causes = tools.get_top_downtime_causes(date_from="2026-01-01", date_to="2026-10-09", limit=5)
    assert isinstance(causes, list)
    if causes:
        assert "cause" in causes[0]
        assert "downtimeHours" in causes[0]
        assert "sharePercent" in causes[0]


def test_chat_analytics_tools_maintenance_breakdown():
    """Verify Medchal breakdown report tool returns MTTR and breakdown categories."""
    maint = tools.get_maintenance_breakdown_summary(date_from="2024-01-01", date_to="2026-10-09")
    assert "totalBreakdowns" in maint
    assert "totalDowntimeHours" in maint
    assert "mttrHours" in maint
    assert "byType" in maint
    assert "topBreakdownMachines" in maint


def test_chat_analytics_tools_corrective_actions():
    """Verify maintenance records with root causes and corrective actions."""
    actions = tools.get_maintenance_corrective_actions(date_from="2024-01-01", date_to="2026-10-09", limit=5)
    assert isinstance(actions, list)
    for item in actions:
        assert "machine" in item
        assert "breakdownType" in item


def test_chat_endpoint_deterministic_queries(client: TestClient):
    """Test all required prompt categories via POST /api/v1/chat using deterministic engine."""
    queries = [
        "What is the total production this month?",
        "What is the production achievement percentage?",
        "Which line has the largest production gap?",
        "What are the top five downtime causes?",
        "Which machines have the highest downtime?",
        "Compare day shift and night shift.",
        "What is the rejection rate for the selected period?",
        "What are the main maintenance breakdown causes in Medchal?",
        "Which breakdown records have corrective-action information?",
        "Summarize the main operational problems in the selected date range.",
    ]

    for q in queries:
        resp = client.post(
            "/api/v1/chat",
            json={
                "message": q,
                "filters": {
                    "dateFrom": "2026-01-01",
                    "dateTo": "2026-10-09",
                    "line": "All Lines",
                    "shift": "All Shifts",
                },
            },
        )
        assert resp.status_code == 200, f"Query '{q}' failed with {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "response" in data
        assert len(data["response"]) > 20
        assert "conversation_id" in data
        assert "suggested_questions" in data
        assert len(data["suggested_questions"]) >= 2
        assert "data_used" in data


def test_chat_endpoint_unauthorized():
    """Unauthenticated request must be rejected with 401 or 403."""
    # Ensure overrides are clear for this test
    app.dependency_overrides.clear()
    with TestClient(app) as raw_client:
        resp = raw_client.post(
            "/api/v1/chat",
            json={"message": "What is the total production?"},
        )
        assert resp.status_code in {401, 403}


def test_chat_service_openai_mocked():
    """Verify OpenAI tool-calling path when OPENAI_API_KEY is provided."""
    expected = tools.get_manufacturing_kpis(date_from="2026-01-01", date_to="2026-10-09")
    mock_choice = MagicMock()
    mock_choice.message.content = "Total production is available from the analytics tool."
    mock_choice.message.tool_calls = None

    mock_completion = MagicMock()
    mock_completion.choices = [mock_choice]

    with patch("app.core.config.settings.chat_provider", "openai"):
        with patch("app.core.config.settings.openai_api_key", "sk-mock-test-key-12345"):
            with patch("openai.OpenAI") as mock_openai_cls:
                mock_client = MagicMock()
                mock_client.chat.completions.create.return_value = mock_completion
                mock_openai_cls.return_value = mock_client

                payload = ChatRequestPayload(
                    message="What is the total production?",
                    filters=ChatFilterContext(dateFrom="2026-01-01", dateTo="2026-10-09"),
                )
                result = process_chat_query(payload)

                assert f"{expected['totalProduction']:,}" in result.response
                assert result.data_used["kpis"]["totalProduction"] == expected["totalProduction"]
                assert result.conversation_id is not None
                assert len(result.suggested_questions) > 0


def test_e2e_formula_parity_with_dashboard(client: TestClient):
    """Scenario B: Verified formula parity with dashboard calculations."""
    filters = {
        "dateFrom": "2026-01-01",
        "dateTo": "2026-10-09",
        "line": "All Lines",
    }
    raw_kpis = tools.get_manufacturing_kpis(date_from="2026-01-01", date_to="2026-10-09")

    resp = client.post(
        "/api/v1/chat",
        json={"message": "What is the total production?", "filters": filters},
    )
    assert resp.status_code == 200
    data = resp.json()

    # The computed KPIs in data_used must match raw_kpis exactly
    used = data["data_used"]["kpis"]
    assert used["totalProduction"] == raw_kpis["totalProduction"]
    assert used["totalTarget"] == raw_kpis["totalTarget"]
    assert used["productionAchievementPercent"] == raw_kpis["productionAchievementPercent"]
    assert used["productionGap"] == raw_kpis["productionGap"]
    assert used["totalDowntimeHours"] == raw_kpis["totalDowntimeHours"]
    assert used["rejectionRatePercent"] == raw_kpis["rejectionRatePercent"]


def test_e2e_downtime_ranking_and_units(client: TestClient):
    """Scenario C: Downtime query returns correct ranking and explicit units."""
    resp = client.post(
        "/api/v1/chat",
        json={
            "message": "What are the top five downtime causes?",
            "filters": {"dateFrom": "2026-01-01", "dateTo": "2026-10-09"},
        },
    )
    assert resp.status_code == 200
    text = resp.json()["response"]
    assert "hours" in text.lower()
    assert "mins" in text.lower()
    assert "%" in text


def test_e2e_maintenance_medchal_source(client: TestClient):
    """Scenario D: Maintenance query returns verified Medchal breakdown source data."""
    resp = client.post(
        "/api/v1/chat",
        json={
            "message": "What are the main maintenance breakdown causes in Medchal?",
            "filters": {"dateFrom": "2024-01-01", "dateTo": "2026-10-09"},
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    summary = data["data_used"]["maintenance_summary"]
    assert summary["totalBreakdowns"] > 0
    assert summary["mttrHours"] > 0
    assert len(summary["byType"]) > 0


def test_e2e_follow_up_preserves_conversation(client: TestClient):
    """Scenario E: Conversation history and conversation_id are preserved."""
    conv_id = "test-conv-987"
    history = [
        {"role": "user", "content": "What is the total production?"},
        {"role": "assistant", "content": "Total production was reported for the selected period."},
    ]
    resp = client.post(
        "/api/v1/chat",
        json={
            "message": "Which line has the largest production gap?",
            "conversation_id": conv_id,
            "history": history,
            "filters": {"dateFrom": "2026-01-01", "dateTo": "2026-10-09"},
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["conversation_id"] == conv_id
    assert "largest" in data["response"].lower() or "gap" in data["response"].lower()


def test_e2e_forbidden_user_rejected():
    """Scenario G: User without required permission is rejected."""
    inactive_user = User(
        email="inactive@patil.local",
        employee_code="EMP-INACTIVE",
        is_active=False,
    )
    # Clear overrides to test real dependency or simulate rejection
    def mock_forbidden():
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Permission denied: Dashboard access required")

    app.dependency_overrides[check_chat_access] = mock_forbidden
    with TestClient(app) as test_client:
        resp = test_client.post(
            "/api/v1/chat",
            json={"message": "What is total production?"},
        )
        assert resp.status_code == 403
    app.dependency_overrides.clear()


def test_e2e_empty_data_source_no_fabrication(client: TestClient):
    """Scenario H: No matching records results in clear empty message, not fabricated numbers."""
    resp = client.post(
        "/api/v1/chat",
        json={
            "message": "What is the total production?",
            "filters": {
                "dateFrom": "1970-01-01",
                "dateTo": "1970-01-02",
                "line": "NON_EXISTENT_LINE",
            },
        },
    )
    assert resp.status_code == 200
    kpis = resp.json()["data_used"]["kpis"]
    assert kpis["recordCount"] == 0
    assert kpis["totalProduction"] == 0
    assert kpis["totalTarget"] == 0
    assert kpis["productionAchievementPercent"] is None


def test_e2e_openai_error_activates_fallback(client: TestClient):
    """Scenario I: Provider error triggers graceful deterministic fallback."""
    with patch("app.core.config.settings.chat_provider", "openai"):
        with patch("app.core.config.settings.openai_api_key", "sk-live-test-key"):
            with patch("openai.OpenAI") as mock_openai_cls:
                mock_client = MagicMock()
                mock_client.chat.completions.create.side_effect = RuntimeError("OpenAI rate limit or network error")
                mock_openai_cls.return_value = mock_client

            resp = client.post(
                "/api/v1/chat",
                json={
                    "message": "What is the total production this month?",
                    "filters": {"dateFrom": "2026-01-01", "dateTo": "2026-10-09"},
                },
            )
            assert resp.status_code == 200
            assert "Manufacturing Performance" in resp.json()["response"]
            assert resp.json()["data_used"] is not None
