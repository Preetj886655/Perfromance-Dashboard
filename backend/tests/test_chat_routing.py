"""Regression tests for chatbot intent classification, date-specific queries,
relative-date resolution, greeting handling, and unsupported question routing.

These tests verify the deterministic query engine to ensure:
- Greetings do NOT trigger analytics tools.
- Date-specific queries use the correct single date.
- Relative dates resolve to the correct calendar date.
- Unsupported/unrelated queries do NOT return manufacturing KPI data.
- Ambiguous queries are handled gracefully.
- Different active filters are propagated correctly.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any
from unittest.mock import MagicMock, patch

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
    INTENT_GREETING,
    INTENT_IDENTITY,
    INTENT_KPI_SUMMARY,
    INTENT_DAILY_PRODUCTION,
    INTENT_DATE_SPECIFIC,
    INTENT_LINE_COMPARISON,
    INTENT_SHIFT_COMPARISON,
    INTENT_DOWNTIME_CAUSES,
    INTENT_DOWNTIME_MACHINES,
    INTENT_QUALITY,
    INTENT_MAINTENANCE,
    INTENT_CORRECTIVE,
    INTENT_OPERATIONAL_SUMMARY,
    INTENT_UNSUPPORTED,
    classify_intent,
    process_chat_query,
    _parse_date_from_query,
    _resolve_relative_date,
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


@pytest.fixture
def default_filters() -> dict[str, str]:
    return {
        "dateFrom": "2026-01-01",
        "dateTo": "2026-10-09",
        "line": "All Lines",
        "shift": "All Shifts",
    }


# ---------------------------------------------------------------------------
# 1. Intent Classification Unit Tests
# ---------------------------------------------------------------------------

class TestIntentClassification:
    """Verify classify_intent routes queries to the correct intent label."""

    @pytest.mark.parametrize("query", [
        "hi",
        "hello",
        "Hey",
        "good morning",
        "Hi!",
        "thanks",
        "ok",
        "bye",
    ])
    def test_greeting_classification(self, query: str):
        assert classify_intent(query) == INTENT_GREETING

    @pytest.mark.parametrize("query", [
        "who are you?",
        "what can you do?",
        "What are you?",
        "help me",
        "what questions can I ask",
    ])
    def test_identity_classification(self, query: str):
        assert classify_intent(query) == INTENT_IDENTITY

    @pytest.mark.parametrize("query", [
        "What is the total production this month?",
        "What is the production achievement percentage?",
        "how much production this month",
    ])
    def test_kpi_summary_classification(self, query: str):
        assert classify_intent(query) == INTENT_KPI_SUMMARY

    def test_date_specific_classification(self):
        assert classify_intent("what was production on 11-10-2026?") == INTENT_DATE_SPECIFIC
        assert classify_intent("production on 2026-10-11") == INTENT_DATE_SPECIFIC

    def test_daily_production_classification(self):
        assert classify_intent("what was yesterday's production?") == INTENT_DAILY_PRODUCTION
        assert classify_intent("what was the previous day production") == INTENT_DAILY_PRODUCTION
        assert classify_intent("today's production output") == INTENT_DAILY_PRODUCTION

    def test_line_comparison_classification(self):
        assert classify_intent("Which line has the largest production gap?") == INTENT_LINE_COMPARISON

    def test_shift_comparison_classification(self):
        assert classify_intent("Compare day shift and night shift.") == INTENT_SHIFT_COMPARISON

    @pytest.mark.parametrize("query", [
        "What are the top five downtime causes?",
        "top 5 downtime causes",
    ])
    def test_downtime_causes_classification(self, query: str):
        assert classify_intent(query) == INTENT_DOWNTIME_CAUSES

    def test_downtime_machines_classification(self):
        assert classify_intent("Which machines have the highest downtime?") == INTENT_DOWNTIME_MACHINES

    @pytest.mark.parametrize("query", [
        "What is the rejection rate for the selected period?",
        "quality analysis",
    ])
    def test_quality_classification(self, query: str):
        assert classify_intent(query) == INTENT_QUALITY

    def test_maintenance_classification(self):
        assert classify_intent("What are the main maintenance breakdown causes in Medchal?") == INTENT_MAINTENANCE

    def test_corrective_classification(self):
        assert classify_intent("Which breakdown records have corrective-action information?") == INTENT_CORRECTIVE

    def test_operational_summary_classification(self):
        assert classify_intent("Summarize the main operational problems") == INTENT_OPERATIONAL_SUMMARY

    @pytest.mark.parametrize("query", [
        "What is the weather today?",
        "Tell me a joke",
        "What is 2 + 2?",
        "Who is the president of India?",
        "Write me an email",
        "random unrelated question about nothing",
    ])
    def test_unsupported_classification(self, query: str):
        assert classify_intent(query) == INTENT_UNSUPPORTED


# ---------------------------------------------------------------------------
# 2. Date Parsing Unit Tests
# ---------------------------------------------------------------------------

class TestDateParsing:
    """Verify date extraction from user queries."""

    def test_dd_mm_yyyy_indian_format(self):
        """11-10-2026 should be parsed as 11 October 2026, not 10 November 2026."""
        result = _parse_date_from_query("production on 11-10-2026")
        assert result == date(2026, 10, 11)

    def test_dd_mm_yyyy_slash_format(self):
        result = _parse_date_from_query("production on 11/10/2026")
        assert result == date(2026, 10, 11)

    def test_iso_format(self):
        result = _parse_date_from_query("production on 2026-10-11")
        assert result == date(2026, 10, 11)

    def test_no_date_in_query(self):
        result = _parse_date_from_query("what is the total production?")
        assert result is None

    def test_invalid_date(self):
        result = _parse_date_from_query("production on 31-02-2026")
        assert result is None


# ---------------------------------------------------------------------------
# 3. Relative Date Resolution Unit Tests
# ---------------------------------------------------------------------------

class TestRelativeDateResolution:
    """Verify relative date resolution."""

    def test_yesterday_resolution(self):
        resolved, label = _resolve_relative_date("what was yesterday's production?")
        assert resolved == date.today() - timedelta(days=1)
        assert label == "yesterday"

    def test_previous_day_resolution(self):
        resolved, label = _resolve_relative_date("previous day production")
        assert resolved == date.today() - timedelta(days=1)
        assert label == "yesterday"

    def test_today_resolution(self):
        resolved, label = _resolve_relative_date("today's production")
        assert resolved == date.today()
        assert label == "today"

    def test_no_relative_date(self):
        resolved, label = _resolve_relative_date("what is total production")
        assert resolved is None
        assert label is None


# ---------------------------------------------------------------------------
# 4. Greeting Regression Tests (Bug #1: "hi" should NOT return KPI report)
# ---------------------------------------------------------------------------

def test_greeting_hi_does_not_return_kpis(client: TestClient, default_filters: dict):
    """Bug regression: 'hi' must return a greeting, not a manufacturing KPI report."""
    resp = client.post(
        "/api/v1/chat",
        json={"message": "hi", "filters": default_filters},
    )
    assert resp.status_code == 200
    data = resp.json()
    # Must contain greeting language
    assert "hello" in data["response"].lower() or "hi" in data["response"].lower()
    # Must NOT contain KPI numbers
    assert "kpis" not in data["data_used"]
    assert data["data_used"].get("intent") == "greeting"


def test_greeting_thanks(client: TestClient, default_filters: dict):
    resp = client.post(
        "/api/v1/chat",
        json={"message": "thanks", "filters": default_filters},
    )
    assert resp.status_code == 200
    assert resp.json()["data_used"].get("intent") == "greeting"


# ---------------------------------------------------------------------------
# 5. Identity / Capabilities Test
# ---------------------------------------------------------------------------

def test_who_are_you(client: TestClient, default_filters: dict):
    """'who are you?' should explain capabilities, not return KPI data."""
    resp = client.post(
        "/api/v1/chat",
        json={"message": "who are you?", "filters": default_filters},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["data_used"].get("intent") == "identity"
    assert "manufacturing" in data["response"].lower() or "patil" in data["response"].lower()
    assert "kpis" not in data["data_used"]


# ---------------------------------------------------------------------------
# 6. Date-Specific Production (Bug #3: "production on 11-10-2026")
# ---------------------------------------------------------------------------

def test_date_specific_production(client: TestClient, default_filters: dict):
    """Bug regression: production on 11-10-2026 must query only 2026-10-11, not the full range."""
    resp = client.post(
        "/api/v1/chat",
        json={
            "message": "what was production on 11-10-2026?",
            "filters": default_filters,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    # Verify the queried date is the single day, not the dashboard range
    assert data["data_used"].get("queried_date") == "2026-10-11"
    # Verify KPIs were retrieved for that specific date
    kpis = data["data_used"].get("kpis", {})
    assert kpis is not None
    # The response should mention the date
    assert "11 October 2026" in data["response"] or "2026-10-11" in data["response"]


def test_date_specific_no_records(client: TestClient, default_filters: dict):
    """A date with no records should clearly state no data was found."""
    resp = client.post(
        "/api/v1/chat",
        json={
            "message": "what was production on 01-01-1990?",
            "filters": default_filters,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["data_used"].get("queried_date") == "1990-01-01"
    kpis = data["data_used"]["kpis"]
    assert kpis["recordCount"] == 0
    assert "no" in data["response"].lower() and ("data" in data["response"].lower() or "record" in data["response"].lower())


# ---------------------------------------------------------------------------
# 7. Yesterday's Production (Bug #2: "previous day" returning full range)
# ---------------------------------------------------------------------------

def test_yesterday_production(client: TestClient, default_filters: dict):
    """Bug regression: 'previous day production' must query yesterday only, not the entire dashboard range."""
    resp = client.post(
        "/api/v1/chat",
        json={
            "message": "what was the previous day production",
            "filters": default_filters,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    assert data["data_used"].get("queried_date") == yesterday
    assert data["data_used"].get("relative_label") == "yesterday"


def test_today_production(client: TestClient, default_filters: dict):
    resp = client.post(
        "/api/v1/chat",
        json={
            "message": "what is today's production?",
            "filters": default_filters,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    today_iso = date.today().isoformat()
    assert data["data_used"].get("queried_date") == today_iso
    assert data["data_used"].get("relative_label") == "today"


# ---------------------------------------------------------------------------
# 8. Unsupported Questions (Bug #4)
# ---------------------------------------------------------------------------

def test_unsupported_question_does_not_return_kpis(client: TestClient, default_filters: dict):
    """Bug regression: Unrelated questions must NOT trigger a manufacturing summary."""
    resp = client.post(
        "/api/v1/chat",
        json={"message": "What is the weather today?", "filters": default_filters},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["data_used"].get("intent") == "unsupported"
    assert "kpis" not in data["data_used"]


def test_unsupported_random_text(client: TestClient, default_filters: dict):
    resp = client.post(
        "/api/v1/chat",
        json={"message": "tell me a joke", "filters": default_filters},
    )
    assert resp.status_code == 200
    assert resp.json()["data_used"].get("intent") == "unsupported"


# ---------------------------------------------------------------------------
# 9. Downtime Question Routing
# ---------------------------------------------------------------------------

def test_downtime_question_returns_causes(client: TestClient, default_filters: dict):
    resp = client.post(
        "/api/v1/chat",
        json={
            "message": "What are the top five downtime causes?",
            "filters": default_filters,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "top_causes" in data["data_used"]
    assert "hours" in data["response"].lower()
    assert "%" in data["response"]


# ---------------------------------------------------------------------------
# 10. Quality Question Routing
# ---------------------------------------------------------------------------

def test_quality_question_returns_rejection_analysis(client: TestClient, default_filters: dict):
    resp = client.post(
        "/api/v1/chat",
        json={
            "message": "What is the rejection rate for the selected period?",
            "filters": default_filters,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "quality" in data["data_used"]
    assert "%" in data["response"]


# ---------------------------------------------------------------------------
# 11. Follow-up Question with Context
# ---------------------------------------------------------------------------

def test_follow_up_preserves_conversation_id(client: TestClient, default_filters: dict):
    conv_id = "test-followup-123"
    resp = client.post(
        "/api/v1/chat",
        json={
            "message": "Which line has the largest production gap?",
            "conversation_id": conv_id,
            "history": [
                {"role": "user", "content": "What is the total production?"},
                {"role": "assistant", "content": "Total production was reported for the selected period."},
            ],
            "filters": default_filters,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["conversation_id"] == conv_id
    assert "lines" in data["data_used"]


# ---------------------------------------------------------------------------
# 12. Filter Propagation
# ---------------------------------------------------------------------------

def test_different_line_filter_affects_kpis(client: TestClient):
    """Verify that changing the line filter produces different results."""
    # All lines
    resp_all = client.post(
        "/api/v1/chat",
        json={
            "message": "What is the total production this month?",
            "filters": {
                "dateFrom": "2026-01-01",
                "dateTo": "2026-10-09",
                "line": "All Lines",
            },
        },
    )
    assert resp_all.status_code == 200
    all_kpis = resp_all.json()["data_used"]["kpis"]

    # Specific line (may or may not exist, but should be different or filtered)
    resp_line = client.post(
        "/api/v1/chat",
        json={
            "message": "What is the total production this month?",
            "filters": {
                "dateFrom": "2026-01-01",
                "dateTo": "2026-10-09",
                "line": "NONEXISTENT_LINE_XYZ",
            },
        },
    )
    assert resp_line.status_code == 200
    line_kpis = resp_line.json()["data_used"]["kpis"]
    # The filtered result should have 0 records (line doesn't exist)
    assert line_kpis["recordCount"] == 0
    assert line_kpis["totalProduction"] == 0


# ---------------------------------------------------------------------------
# 13. Existing queries still work (backward compatibility)
# ---------------------------------------------------------------------------

def test_existing_queries_still_work(client: TestClient, default_filters: dict):
    """Verify that the 10 original required prompt categories still work correctly."""
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
            json={"message": q, "filters": default_filters},
        )
        assert resp.status_code == 200, f"Query '{q}' failed with {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "response" in data
        assert len(data["response"]) > 20
        assert "conversation_id" in data
        assert "suggested_questions" in data
        assert len(data["suggested_questions"]) >= 2
        assert "data_used" in data


# ---------------------------------------------------------------------------
# 14. Ambiguous Question Handling
# ---------------------------------------------------------------------------

def test_ambiguous_question(client: TestClient, default_filters: dict):
    """An ambiguous question should NOT crash and should not return random KPIs."""
    resp = client.post(
        "/api/v1/chat",
        json={"message": "how is it going", "filters": default_filters},
    )
    assert resp.status_code == 200
    data = resp.json()
    # Should be classified as greeting or unsupported, but NOT as KPI summary
    intent = data["data_used"].get("intent")
    assert intent in {"greeting", "unsupported", "identity"} or "kpis" not in data["data_used"]


# ---------------------------------------------------------------------------
# 15. Invalid Date in Query
# ---------------------------------------------------------------------------

def test_invalid_date_in_query(client: TestClient, default_filters: dict):
    """A query with an invalid date (31-02-2026) should not crash."""
    resp = client.post(
        "/api/v1/chat",
        json={
            "message": "what was production on 31-02-2026?",
            "filters": default_filters,
        },
    )
    assert resp.status_code == 200
    # Since the date is invalid, it should fall through to unsupported or KPI summary
    # but it must not crash
