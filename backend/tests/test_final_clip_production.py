"""Tests verifying that production queries default to Final Clip Production.

In the Patil Group manufacturing facility, Elastic Rail Clips (ERC) undergo
multiple sequential process stages: Cut Bar -> Turned Bar -> Deburring -> Clip -> MPI.
Reporting total production across all stages causes 4-5x multi-counting of intermediate WIP.
These tests verify that:
1. Manufacturing KPI queries default to stage='Clip' (Final Clip Production).
2. Chat responses explicitly label the metric as 'Final Clip Production'.
3. Explicit requests for intermediate stages (e.g. 'Cut Bar') are honored.
4. An explicit request for all stages ('all_stages' or default_to_clip=False) is supported.
5. Production by line, shift, daily, and comparison tools default to Final Clip Production.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.api.routes.chat import check_chat_access
from app.main import app
from app.models.user import User
from app.services import chat_analytics_tools as tools
from app.services.chat_service import (
    ChatFilterContext,
    ChatRequestPayload,
    process_chat_query,
)
from tests.chat_test_support import install_mock_chat_sources


@pytest.fixture
def mock_dashboard_user() -> User:
    return User(
        email="auditor@patilgroup.com",
        employee_code="AUD-CLIP-001",
        is_active=True,
    )


@pytest.fixture
def client(mock_dashboard_user: User, monkeypatch: pytest.MonkeyPatch):
    install_mock_chat_sources(monkeypatch)
    app.dependency_overrides[check_chat_access] = lambda: mock_dashboard_user
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


class TestFinalClipProductionDefaults:
    """Verify core analytics tools default to final clip production."""

    def test_default_production_stage_constant(self):
        assert hasattr(tools, "DEFAULT_PRODUCTION_STAGE")
        assert tools.DEFAULT_PRODUCTION_STAGE == "Clip"

    def test_kpis_default_to_clip_stage(self):
        """get_manufacturing_kpis() without stage filter must default to 'Clip'."""
        kpis_default = tools.get_manufacturing_kpis()
        assert kpis_default["stage"] == "Clip"
        assert kpis_default["recordCount"] > 0
        assert kpis_default["totalProduction"] > 0

        # Compare with explicit stage='Clip'
        kpis_explicit_clip = tools.get_manufacturing_kpis(stage="Clip")
        assert kpis_default["totalProduction"] == kpis_explicit_clip["totalProduction"]
        assert kpis_default["totalTarget"] == kpis_explicit_clip["totalTarget"]
        assert kpis_default["recordCount"] == kpis_explicit_clip["recordCount"]

    def test_all_stages_explicit_flag_and_parameter(self):
        """Passing default_to_clip=False or stage='all_stages' yields full multi-stage sum."""
        kpis_clip = tools.get_manufacturing_kpis()
        kpis_all_flag = tools.get_manufacturing_kpis(default_to_clip=False)
        kpis_all_param = tools.get_manufacturing_kpis(stage="all_stages")

        assert kpis_all_flag["totalProduction"] == kpis_all_param["totalProduction"]
        # Multi-stage sum must be significantly higher than final clip production alone
        assert kpis_all_flag["totalProduction"] > kpis_clip["totalProduction"]

    def test_intermediate_stage_filter_honored(self):
        """Explicit stage filter (e.g. Cut Bar) returns only that stage's records."""
        kpis_cut_bar = tools.get_manufacturing_kpis(stage="Cut Bar")
        assert kpis_cut_bar["stage"] == "Cut Bar"
        assert kpis_cut_bar["recordCount"] > 0
        assert kpis_cut_bar["totalProduction"] > 0

        kpis_clip = tools.get_manufacturing_kpis(stage="Clip")
        assert kpis_cut_bar["totalProduction"] != kpis_clip["totalProduction"]

    def test_daily_production_defaults_to_clip(self):
        """get_daily_production defaults to 'Clip'."""
        daily_kpis = tools.get_daily_production("2026-10-09")
        assert daily_kpis["stage"] == "Clip"

    def test_compare_date_ranges_defaults_to_clip(self):
        """compare_date_ranges defaults to 'Clip' for both periods."""
        comparison = tools.compare_date_ranges(
            period_a_from="2026-10-01",
            period_a_to="2026-10-05",
            period_b_from="2026-10-06",
            period_b_to="2026-10-10",
        )
        assert comparison["periodA"]["kpis"]["stage"] == "Clip"
        assert comparison["periodB"]["kpis"]["stage"] == "Clip"

    def test_production_by_line_defaults_to_clip(self):
        """get_production_by_line calculates final clip production per line."""
        lines = tools.get_production_by_line()
        assert len(lines) > 0
        total_line_prod = sum(line["production"] for line in lines)
        clip_kpis = tools.get_manufacturing_kpis(stage="Clip")
        assert total_line_prod == clip_kpis["totalProduction"]

    def test_production_by_shift_defaults_to_clip(self):
        """get_production_by_shift calculates final clip production per shift."""
        shifts = tools.get_production_by_shift()
        assert len(shifts) > 0
        total_shift_prod = sum(s["production"] for s in shifts)
        clip_kpis = tools.get_manufacturing_kpis(stage="Clip")
        assert total_shift_prod == clip_kpis["totalProduction"]


class TestChatbotFinalClipProductionResponses:
    """Verify deterministic and LLM chat responses report final clip production."""

    def test_kpi_summary_response_uses_final_clip_production_label(self, client: TestClient):
        """Querying general production must return Final Clip Production label and figure."""
        resp = client.post(
            "/api/v1/chat",
            json={
                "message": "What is the total production this month?",
                "filters": {
                    "dateFrom": "2026-10-01",
                    "dateTo": "2026-10-15",
                    "line": "All Lines",
                    "shift": "All Shifts",
                },
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert any(
            phrase in data["response"].lower()
            for phrase in ["final clip production", "finished-clip", "finished\u2011clip", "finished clip"]
        )

        clip_kpis = tools.get_manufacturing_kpis(
            date_from="2026-10-01", date_to="2026-10-15", stage="Clip"
        )
        assert f"{clip_kpis['totalProduction']:,}" in data["response"]
        assert data["data_used"]["kpis"]["totalProduction"] == clip_kpis["totalProduction"]

    def test_date_specific_response_uses_final_clip_label(self, client: TestClient):
        """A single-date production query returns Final Clip Production when data exists."""
        resp = client.post(
            "/api/v1/chat",
            json={
                "message": "What was production on 09-10-2026?",
                "filters": {
                    "dateFrom": "2026-10-01",
                    "dateTo": "2026-10-15",
                },
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        daily_kpis = tools.get_daily_production("2026-10-09", stage="Clip")
        if daily_kpis["recordCount"] > 0:
            assert "Final Clip Production" in data["response"]
            assert f"{daily_kpis['totalProduction']:,}" in data["response"]
        else:
            assert "No Production Data" in data["response"] or "09 October 2026" in data["response"]
