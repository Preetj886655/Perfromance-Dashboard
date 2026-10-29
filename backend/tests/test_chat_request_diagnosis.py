"""Regression tests for date, item-field, and source-status chat routing."""

from __future__ import annotations

import json
from datetime import date
from unittest.mock import MagicMock, patch

import httpx
import pytest

from app.core.config import settings
from app.services import chat_analytics_tools as analytics
from app.services.chat_service import (
    INTENT_DATE_RANGE_COMPARISON,
    INTENT_GREETING,
    INTENT_KPI_SUMMARY,
    ChatFilterContext,
    ChatMessage,
    ChatRequestPayload,
    classify_intent,
    process_chat_query,
)

_REAL_GET_RAW_MANUFACTURING_RECORDS = analytics.get_raw_manufacturing_records


def _record(
    record_date: str,
    part: str,
    stage: str,
    production: int,
    target: int,
) -> dict[str, object]:
    return {
        "date": record_date,
        "part": part,
        "stage": stage,
        "line": "LINE-1",
        "machine": "M-1",
        "shift": "Day",
        "totalProduction": production,
        "productionTarget": target,
        "rejection": 0,
        "downtimeMinutes": 0,
        "productionLoss": 0,
    }


@pytest.fixture
def source_records() -> list[dict[str, object]]:
    return [
        _record("2026-09-07", "MK3", "Clip", 100, 150),
        _record("2026-09-08", "MK5", "Clip", 200, 250),
        _record("2026-09-09", "MK5", "Clamp", 50, 100),
        _record("2026-08-31", "Liner Less", "Clip", 75, 125),
        _record("2026-09-17", "ZERO-PROD", "Clip", 0, 0),
        _record("2026-09-28", "MK5", "Clip", 80, 90),
        _record("2026-10-04", "MK3", "Clip", 100, 105),
        _record("2026-10-05", "MK5", "Clip", 110, 120),
        _record("2026-10-10", "MK5", "Clip", 70, 90),
        _record("2026-10-11", "MK3", "Clip", 130, 140),
        _record("2026-10-13", "MK3", "Clip", 90, 110),
    ]


@pytest.fixture(autouse=True)
def mock_chat_environment(monkeypatch: pytest.MonkeyPatch, source_records: list[dict[str, object]]):
    """Keep chat routing tests local, deterministic, and independent of provider credentials."""
    monkeypatch.setattr(settings, "chat_provider", "deterministic")
    monkeypatch.setattr(
        "app.services.chat_service._get_business_today",
        lambda ref_date=None: ref_date or date(2026, 10, 14),
    )
    monkeypatch.setattr(analytics, "get_raw_manufacturing_records", lambda: source_records)


def _active_filters(**updates: str) -> ChatFilterContext:
    values = {
        "dateFrom": "2026-01-01",
        "dateTo": "2026-10-13",
        "line": "All Lines",
        "shift": "All Shifts",
    }
    values.update(updates)
    return ChatFilterContext(**values)


def _process(message: str, filters: ChatFilterContext | None = None, history=None):
    return process_chat_query(
        ChatRequestPayload(
            message=message,
            history=history or [],
            filters=filters or _active_filters(),
        )
    )


def test_pure_greeting_stays_greeting():
    assert classify_intent("hi") == INTENT_GREETING
    response = _process("hi")
    assert response.data_used["intent"] == "greeting"
    assert "hello" in response.response.lower()


def test_greeting_plus_weekly_production_is_not_greeting():
    query = "hi tell me the production of previous week"
    assert classify_intent(query) == INTENT_KPI_SUMMARY
    response = _process(query)
    assert response.data_used["tool"] == "get_manufacturing_kpis"
    assert response.data_used["tool_arguments"]["date_from"] == "2026-10-05"
    assert response.data_used["tool_arguments"]["date_to"] == "2026-10-11"


def test_previous_completed_week_overrides_active_dashboard_dates():
    calls = []
    original = analytics.get_manufacturing_kpis

    def capture(**kwargs):
        calls.append(kwargs)
        return original(**kwargs)

    with patch.object(analytics, "get_manufacturing_kpis", side_effect=capture):
        response = _process("What was production during the previous week?")

    assert calls[-1]["date_from"] == "2026-10-05"
    assert calls[-1]["date_to"] == "2026-10-11"
    assert response.data_used["tool_arguments"]["date_from"] == "2026-10-05"


def test_yesterday_uses_the_business_timezone_date_and_single_day_tool():
    response = _process("What was production yesterday?")
    assert response.data_used["tool"] == "get_daily_production"
    assert response.data_used["queried_date"] == "2026-10-13"
    assert response.data_used["tool_arguments"]["target_date"] == "2026-10-13"


def test_compare_last_week_with_week_before_uses_comparison_tool():
    assert classify_intent("Compare production last week with the week before.") == INTENT_DATE_RANGE_COMPARISON
    response = _process("Compare production last week with the week before.")
    assert response.data_used["tool"] == "compare_date_ranges"
    assert response.data_used["tool_arguments"] == {
        "period_a_from": "2026-09-28",
        "period_a_to": "2026-10-04",
        "period_b_from": "2026-10-05",
        "period_b_to": "2026-10-11",
        "line": "All Lines",
        "shift": "All Shifts",
    }


def test_previous_month_clip_resolves_to_stage_and_uses_authoritative_kpis():
    response = _process("What is the production of clip in previous month?")
    expected = analytics.get_manufacturing_kpis(
        date_from="2026-09-01", date_to="2026-09-30", stage="Clip"
    )
    assert response.data_used["tool"] == "get_manufacturing_kpis"
    assert response.data_used["tool_arguments"]["date_from"] == "2026-09-01"
    assert response.data_used["tool_arguments"]["date_to"] == "2026-09-30"
    assert response.data_used["tool_arguments"]["stage"] == "Clip"
    assert response.data_used["tool_arguments"]["material"] is None
    assert response.data_used["kpis"] == expected
    assert str(expected["totalProduction"]) in response.response


def test_explicit_month_and_material_value_select_part_field():
    response = _process("What was production of MK5 in September 2026?")
    expected = analytics.get_manufacturing_kpis(
        date_from="2026-09-01", date_to="2026-09-30", material="MK5"
    )
    assert classify_intent("What was production of MK5 in September 2026?") == INTENT_KPI_SUMMARY
    assert response.data_used["tool_arguments"]["material"] == "MK5"
    assert response.data_used["tool_arguments"]["stage"] is None
    assert response.data_used["kpis"] == expected


def test_explicit_october_clip_query_uses_month_range_and_available_source_rows():
    response = _process("Show production of clip for October 2026.")
    assert response.data_used["tool_arguments"]["date_from"] == "2026-10-01"
    assert response.data_used["tool_arguments"]["date_to"] == "2026-10-31"
    assert response.data_used["tool_arguments"]["stage"] == "Clip"
    assert response.data_used["kpis"]["dateRange"]["end"] == "2026-10-13"
    assert response.data_used["kpis"]["recordCount"] > 0


def test_material_present_outside_selected_period_is_no_matching_records():
    response = _process("Show production of Liner Less for September 2026.")
    assert response.data_used["kpis"]["recordCount"] == 0
    assert response.data_used["tool_arguments"]["material"] == "Liner Less"
    assert "no matching production records" in response.response.lower()
    assert "does not establish a measured zero-production total" in response.response


def test_material_absent_entirely_is_not_unfiltered_summary():
    response = _process("Show production of Unknown Part for September 2026.")
    assert response.data_used["kpis"]["recordCount"] == 0
    assert response.data_used["tool_arguments"]["material"] == "Unknown Part"
    assert "no matching production records" in response.response.lower()


def test_matched_zero_production_row_is_not_reported_as_no_records():
    response = _process("Show production of ZERO-PROD in September 2026.")
    assert response.data_used["kpis"]["recordCount"] == 1
    assert response.data_used["kpis"]["totalProduction"] == 0
    assert "no matching production records" not in response.response.lower()
    assert "**Evaluated Records:** 1 records" in response.response


def test_data_source_error_is_not_presented_as_zero_production(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        analytics, "get_raw_manufacturing_records", _REAL_GET_RAW_MANUFACTURING_RECORDS
    )
    monkeypatch.setattr(
        analytics,
        "fetch_google_sheet_dataset",
        lambda **kwargs: {
            "status": "offline",
            "connectionStatus": "offline",
            "error": "private provider details omitted",
            "data": [],
        },
    )
    response = _process("What is production of clip in September 2026?")
    assert response.data_used["intent"] == "data_source_unavailable"
    assert response.data_used["data_source_status"] == "unavailable"
    assert "couldn't retrieve production data" in response.response
    assert "no matching production records" not in response.response.lower()
    assert "no production records were found" not in response.response.lower()
    assert "private provider details omitted" not in response.response


def test_active_filters_apply_without_explicit_period_and_explicit_month_wins():
    active = _active_filters()
    default_result = _process("What is the total production?", filters=active)
    month_result = _process("What was production of MK5 in September 2026?", filters=active)
    assert default_result.data_used["tool_arguments"]["date_from"] == active.dateFrom
    assert default_result.data_used["tool_arguments"]["date_to"] == active.dateTo
    assert month_result.data_used["tool_arguments"]["date_from"] == "2026-09-01"
    assert month_result.data_used["tool_arguments"]["date_to"] == "2026-09-30"


def test_month_without_year_uses_business_year():
    response = _process("What is the total production august month?")
    assert response.data_used["tool_arguments"]["date_from"] == "2026-08-01"
    assert response.data_used["tool_arguments"]["date_to"] == "2026-08-31"


def test_dashboard_line_display_label_matches_raw_source_line():
    assert analytics.filter_manufacturing_records(
        [{"line": "ERC", "date": "2026-08-15", "stage": "Clip"}],
        line="ERC Line",
    )


def test_natural_period_aliases_resolve_to_current_periods():
    quarterly = _process("What is the quarterly production?")
    yearly = _process("What is the yearly production?")
    assert quarterly.data_used["tool_arguments"]["date_from"] == "2026-10-01"
    assert yearly.data_used["tool_arguments"]["date_from"] == "2026-01-01"


def test_previous_day_follow_up_keeps_material_and_uses_prior_date_context():
    response = _process(
        "What about the previous day?",
        history=[ChatMessage(role="user", content="What was production of MK5 on 11 October 2026?")],
    )
    assert response.data_used["tool"] == "get_daily_production"
    assert response.data_used["queried_date"] == "2026-10-10"
    assert response.data_used["tool_arguments"]["material"] == "MK5"


def test_groq_arguments_are_pinned_to_resolved_dates_and_stage(
    source_records: list[dict[str, object]], monkeypatch: pytest.MonkeyPatch
):
    expected = analytics.get_manufacturing_kpis(
        date_from="2026-09-01", date_to="2026-09-30", stage="Clip"
    )
    first_response = MagicMock()
    first_response.raise_for_status.return_value = None
    first_response.json.return_value = {
        "choices": [
            {
                "message": {
                    "role": "assistant",
                    "tool_calls": [
                        {
                            "id": "call_clip",
                            "type": "function",
                            "function": {
                                "name": "get_manufacturing_kpis",
                                "arguments": json.dumps(
                                    {
                                        "date_from": "2026-01-01",
                                        "date_to": "2026-10-13",
                                        "material": "MK3",
                                    }
                                ),
                            },
                        }
                    ],
                }
            }
        ]
    }
    final_response = MagicMock()
    final_response.raise_for_status.return_value = None
    final_response.json.return_value = {
        "choices": [
            {
                "message": {
                    "content": f"Clip stage production in September 2026 was {expected['totalProduction']:,} pcs."
                }
            }
        ]
    }
    monkeypatch.setattr(settings, "chat_provider", "groq")
    monkeypatch.setattr(settings, "groq_api_key", "mock-only")
    with patch("httpx.Client.post", side_effect=[first_response, final_response]) as post:
        response = _process("What was production of clip in September 2026?")

    assert post.call_count == 2
    call_args = response.data_used["provider_tool_results"]["routing"][0]["arguments"]
    assert call_args["date_from"] == "2026-09-01"
    assert call_args["date_to"] == "2026-09-30"
    assert call_args["stage"] == "Clip"
    assert "material" not in call_args
    assert response.data_used["provider_tool_results"]["get_manufacturing_kpis"] == expected
    assert response.response == final_response.json.return_value["choices"][0]["message"]["content"]
    assert str(expected["totalProduction"]) in response.response


def test_groq_unavailable_falls_back_to_deterministic_report(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "chat_provider", "groq")
    monkeypatch.setattr(settings, "groq_api_key", "mock-only")
    with patch("httpx.Client.post", side_effect=httpx.ConnectError("mock offline")):
        response = _process("What was production of MK5 in September 2026?")
    expected = analytics.get_manufacturing_kpis(
        date_from="2026-09-01", date_to="2026-09-30", material="MK5"
    )
    assert response.data_used["tool"] == "get_manufacturing_kpis"
    assert response.data_used["kpis"] == expected
    assert str(expected["totalProduction"]) in response.response
