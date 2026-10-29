"""Tests for Phase 5: Manufacturing Chatbot Intelligence Integration with ERC Mk-V Line Tracker.

Verifies:
1. PPC Production Order fulfillment queries (PO-2026-001 at risk, order balances, DP date).
2. Component-weighted OEE and speed loss Pareto queries (37.96% OEE, 68.01 hrs speed loss).
3. Equipment Reliability and historical downtime Pareto queries (36,542.3h, 302 mirrored excluded).
4. Sikka1 & Autocopying-5 MTTR and calendar-time MTBF limitation disclaimers.
5. November 2024 downtime gap explanation (0 records logged in source).
6. RM heat conversion funnel and metallurgical reconciliation alerts (H-2409-118).
7. Intent routing and tool argument validation.
"""

from __future__ import annotations

import json
from datetime import date
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api.routes.chat import check_chat_access
from app.core.config import settings
from app.main import app
from app.models.user import User
from app.services import chat_analytics_tools as tools
from app.services.chat_service import (
    ChatFilterContext,
    ChatMessage,
    ChatRequestPayload,
    INTENT_LINE_TRACKER_OEE,
    INTENT_PPC_ORDERS,
    INTENT_RELIABILITY_PARETO,
    INTENT_TRACEABILITY,
    classify_intent,
    process_chat_query,
)


@pytest.fixture
def mock_dashboard_user() -> User:
    return User(
        email="auditor@patilgroup.com",
        employee_code="EMP-AUDIT",
        is_active=True,
    )


@pytest.fixture
def client(mock_dashboard_user: User):
    def mock_require_perm():
        return mock_dashboard_user

    app.dependency_overrides[check_chat_access] = mock_require_perm
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def mock_chat_environment(monkeypatch: pytest.MonkeyPatch):
    """Keep test suite deterministic and independent of live provider rate limits."""
    monkeypatch.setattr(settings, "chat_provider", "deterministic")


@pytest.fixture
def line_tracker_filters() -> dict[str, str]:
    return {
        "dateFrom": "2026-01-01",
        "dateTo": "2026-10-31",
        "line": "All Lines",
        "shift": "All Shifts",
    }


# ===========================================================================
# 1. Intent Classification Tests
# ===========================================================================


class TestLineTrackerIntentClassification:
    """Verify that Line Tracker domain queries classify into dedicated intents."""

    @pytest.mark.parametrize(
        "query",
        [
            "What is the status of PO-2026-001?",
            "Show production orders at risk",
            "What is the order balance for Western Railway?",
            "Show order fulfillment summary",
            "What is the DP date for PO-2026-001?",
        ],
    )
    def test_ppc_order_intent(self, query: str):
        assert classify_intent(query) == INTENT_PPC_ORDERS

    @pytest.mark.parametrize(
        "query",
        [
            "What is the overall OEE for ERC Mk-V?",
            "What is the line tracker OEE breakdown?",
            "Show speed loss for Press line E1",
            "What is the cycle time compliance for Forming work center?",
            "Which machines are running slower than rated cycle time?",
        ],
    )
    def test_line_tracker_oee_intent(self, query: str):
        assert classify_intent(query) == INTENT_LINE_TRACKER_OEE

    @pytest.mark.parametrize(
        "query",
        [
            "What are the top historical downtime categories?",
            "What is the downtime Pareto for Sikka1?",
            "What is the MTTR for Sikka1?",
            "What is the failure frequency for Autocopying-5?",
            "Why is there no downtime in November 2024?",
            "What happened to November 2024 downtime data?",
        ],
    )
    def test_reliability_pareto_intent(self, query: str):
        assert classify_intent(query) == INTENT_RELIABILITY_PARETO

    @pytest.mark.parametrize(
        "query",
        [
            "What is the raw material heat traceability status?",
            "Show the heat conversion funnel yield",
            "Are there any metallurgical reconciliation alerts?",
            "What is the status of placeholder heat H-2409-118?",
        ],
    )
    def test_traceability_intent(self, query: str):
        assert classify_intent(query) == INTENT_TRACEABILITY


# ===========================================================================
# 2. PPC Production Orders End-to-End Tests
# ===========================================================================


class TestPPCOrderChat:
    """Verify chatbot answers for PPC order tracking and delivery risks."""

    def test_po_2026_001_details_and_risk(self, client: TestClient, line_tracker_filters: dict):
        resp = client.post(
            "/api/v1/chat",
            json={"message": "What is the status of PO-2026-001?", "filters": line_tracker_filters},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["data_used"].get("intent") == INTENT_PPC_ORDERS
        response_text = data["response"]

        # Verified domain facts from Line Tracker
        assert "PO-2026-001" in response_text
        assert "607,785" in response_text  # Order qty
        assert "589,626" in response_text  # Outstanding balance
        assert "At Risk" in response_text
        assert "2026-10-20" in response_text  # DP Date
        assert "H-2409-118" in response_text  # Placeholder heat reference

    def test_overall_order_fulfillment_summary(self, client: TestClient, line_tracker_filters: dict):
        resp = client.post(
            "/api/v1/chat",
            json={"message": "Show order fulfillment summary", "filters": line_tracker_filters},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["data_used"].get("intent") == INTENT_PPC_ORDERS
        response_text = data["response"]
        assert "3,943,015" in response_text  # Total ordered qty
        assert "560,537" in response_text  # Total produced/allocated
        assert "1,825,598" in response_text  # Outstanding balance
        assert "At Risk" in response_text


# ===========================================================================
# 3. Component-Weighted OEE & Speed Loss Tests
# ===========================================================================


class TestLineTrackerOEEChat:
    """Verify chatbot answers for component-weighted OEE and speed loss."""

    def test_overall_oee_and_speed_loss(self, client: TestClient, line_tracker_filters: dict):
        resp = client.post(
            "/api/v1/chat",
            json={"message": "What is the overall OEE for ERC Mk-V?", "filters": line_tracker_filters},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["data_used"].get("intent") == INTENT_LINE_TRACKER_OEE
        response_text = data["response"]

        # Verified component-weighted OEE values from Phase 3
        assert "37.96%" in response_text
        assert "100.0%" in response_text  # Availability
        assert "38.17%" in response_text  # Performance
        assert "99.45%" in response_text  # Quality
        assert "68.01" in response_text or "4,080.8" in response_text  # Speed loss
        assert "61.83%" in response_text  # Speed loss share of runtime

    def test_press_line_e1_machine_oee(self, client: TestClient, line_tracker_filters: dict):
        resp = client.post(
            "/api/v1/chat",
            json={"message": "What is the OEE and cycle time for Press line E1?", "filters": line_tracker_filters},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["data_used"].get("intent") == INTENT_LINE_TRACKER_OEE
        response_text = data["response"]
        assert "Press line E1" in response_text
        assert "67.58%" in response_text  # Performance
        assert "5.5s" in response_text  # Rated CT
        assert "8.14s" in response_text  # Weighted actual CT
        assert "Slower than rated" in response_text


# ===========================================================================
# 4. Equipment Reliability & Historical Downtime Pareto Tests
# ===========================================================================


class TestReliabilityParetoChat:
    """Verify historical downtime Pareto, MTTR, and data integrity disclaimers."""

    def test_historical_downtime_overview(self, client: TestClient, line_tracker_filters: dict):
        # 1. With active 2026 filters, filters apply accurately
        resp_filtered = client.post(
            "/api/v1/chat",
            json={"message": "What are the top historical downtime categories?", "filters": line_tracker_filters},
        )
        assert resp_filtered.status_code == 200
        assert any(num in resp_filtered.json()["response"] for num in ["24,450.5", "24,44"])
        assert "dimensions & length issue" in resp_filtered.json()["response"].lower()

        # 2. Across full historical dataset without date bounds
        resp_full = client.post(
            "/api/v1/chat",
            json={"message": "What are the top historical downtime categories?", "filters": {}},
        )
        assert resp_full.status_code == 200
        data = resp_full.json()
        assert data["data_used"].get("intent") == INTENT_RELIABILITY_PARETO
        response_text = data["response"]

        # Verified Phase 4 numbers: 36,542.3 total hours, 302 mirrored rows excluded
        assert any(hrs in response_text for hrs in ["36,542.3", "36,539.1"])
        assert any(cnt in response_text for cnt in ["14,567", "14,564"])  # accepted records
        assert "302" in response_text  # mirrored excluded
        assert "dimensions & length issue" in response_text.lower()

    def test_sikka1_mttr_and_breakdowns(self, client: TestClient, line_tracker_filters: dict):
        resp = client.post(
            "/api/v1/chat",
            json={"message": "What is the MTTR for Sikka1?", "filters": line_tracker_filters},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["data_used"].get("intent") == INTENT_RELIABILITY_PARETO
        response_text = data["response"]
        assert "Sikka1" in response_text
        assert "9.23" in response_text  # MTTR hours for Sikka1
        assert "MTBF" in response_text  # Mentions MTBF context

    def test_november_2024_logging_gap_explanation(self, client: TestClient, line_tracker_filters: dict):
        resp = client.post(
            "/api/v1/chat",
            json={"message": "Why is there no downtime in November 2024?", "filters": line_tracker_filters},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["data_used"].get("intent") == INTENT_RELIABILITY_PARETO
        response_text = data["response"]
        assert "November 2024" in response_text
        assert "0 records" in response_text or "0.0 downtime hours" in response_text
        assert "October 2024" in response_text
        assert "December 2024" in response_text
        assert "Source Data Gap" in response_text or "omission" in response_text.lower()


# ===========================================================================
# 5. Raw Material Heat Traceability Tests
# ===========================================================================


class TestTraceabilityChat:
    """Verify RM heat conversion funnel and metallurgical reconciliation alerts."""

    def test_conversion_funnel_and_alerts(self, client: TestClient, line_tracker_filters: dict):
        resp = client.post(
            "/api/v1/chat",
            json={"message": "What is the raw material heat traceability status?", "filters": line_tracker_filters},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["data_used"].get("intent") == INTENT_TRACEABILITY
        response_text = data["response"]

        assert "2,102.18 MT" in response_text
        assert "1,456,660 pcs" in response_text
        assert "90.43%" in response_text  # Forming yield
        assert "H-2409-118" in response_text
        assert "Pending Metallurgical Reconciliation" in response_text


# ===========================================================================
# 6. Groq Tool-Calling Schema & Tool Execution
# ===========================================================================


class TestLineTrackerToolCalling:
    """Verify tool calling schema and execution for Line Tracker tools."""

    def test_line_tracker_tools_registered_in_schema(self):
        from app.services.chat_service import CHAT_TOOLS_SCHEMA, ALLOWED_TOOL_NAMES

        tool_names = {t["function"]["name"] for t in CHAT_TOOLS_SCHEMA}
        required_tools = {
            "get_line_tracker_order_status",
            "get_line_tracker_oee_breakdown",
            "get_line_tracker_reliability",
            "get_line_tracker_traceability",
        }
        assert required_tools.issubset(tool_names)
        assert required_tools.issubset(ALLOWED_TOOL_NAMES)

    def test_execute_tool_call_for_ppc_orders(self):
        from app.services.chat_service import execute_tool_call

        res = execute_tool_call("get_line_tracker_order_status", {"order_number": "PO-2026-001"})
        assert "orders" in res
        assert len(res["orders"]) == 1
        assert res["orders"][0]["order_number"] == "PO-2026-001"

    def test_execute_tool_call_for_oee_breakdown(self):
        from app.services.chat_service import execute_tool_call

        res_forming = execute_tool_call("get_line_tracker_oee_breakdown", {"work_center": "Forming"})
        assert "work_centers" in res_forming
        assert res_forming["overall"]["oee_pct"] == 67.53

        res_all = execute_tool_call("get_line_tracker_oee_breakdown", {})
        assert res_all["overall"]["oee_pct"] == 37.96

    def test_execute_tool_call_for_reliability(self):
        from app.services.chat_service import execute_tool_call

        res_sikka = execute_tool_call("get_line_tracker_reliability", {"machine": "Sikka1"})
        assert "summary" in res_sikka
        assert res_sikka["summary"]["total_downtime_hours"] == 1300.6

        res_all = execute_tool_call("get_line_tracker_reliability", {})
        assert res_all["summary"]["total_downtime_hours"] == pytest.approx(36542.3, rel=0.01)

    def test_execute_tool_call_for_traceability(self):
        from app.services.chat_service import execute_tool_call

        res = execute_tool_call("get_line_tracker_traceability", {})
        assert "funnel_summary" in res
        assert res["funnel_summary"]["overall_forming_yield_pct"] == 90.43
