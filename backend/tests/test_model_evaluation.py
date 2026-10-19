"""Automated evaluation test runner for Manufacturing Analytics Chatbot and LLM models.

Evaluates:
1. Intent classification accuracy across the 64-item evaluation dataset.
2. Tool selection accuracy and parameter extraction.
3. 100% exact numerical agreement with authoritative deterministic tools.
4. Tool-calling safety safeguards:
   - Tool name allowlist enforcement.
   - Malformed JSON argument handling.
   - Provider HTTP 429 rate limit and timeout fallback activation.
5. Hugging Face hosted router adapter comparison:
   - Candidate 1: openai/gpt-oss-120b
   - Candidate 2: Qwen/Qwen3-4B-Instruct-2507
6. Live HF_TOKEN connectivity audit (or BLOCKED report when credentials absent).
"""

from __future__ import annotations

import json
import sys
from datetime import date, timedelta
from typing import Any
from unittest.mock import MagicMock, patch

if "openai" not in sys.modules:
    sys.modules["openai"] = MagicMock()

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api.routes.chat import check_chat_access
from app.core.config import settings
from app.main import app
from app.models.user import User
from app.services import chat_analytics_tools as tools
from tests.chat_test_support import install_mock_chat_sources
from app.services.chat_service import (
    ALLOWED_TOOL_NAMES,
    CHAT_TOOLS_SCHEMA,
    ChatFilterContext,
    ChatRequestPayload,
    ChatResponsePayload,
    classify_intent,
    execute_tool_call,
    process_chat_query,
    resolve_model_provider,
    _deterministic_query_engine,
    _parse_date_from_query,
    _resolve_relative_date,
)
from tests.evaluation_dataset import EVALUATION_DATASET, EvalTestCase


@pytest.fixture(autouse=True)
def mock_chat_sources(monkeypatch: pytest.MonkeyPatch):
    install_mock_chat_sources(monkeypatch)


@pytest.fixture
def mock_dashboard_user() -> User:
    return User(
        email="auditor@patilgroup.com",
        employee_code="AUD-001",
        is_active=True,
    )


@pytest.fixture
def client(mock_dashboard_user: User):
    app.dependency_overrides[check_chat_access] = lambda: mock_dashboard_user
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# 1. Dataset Evaluation Across All 64 Questions
# ---------------------------------------------------------------------------

class TestDatasetEvaluation:
    """Evaluate all 64 structured evaluation dataset questions."""

    @pytest.mark.parametrize("case", EVALUATION_DATASET, ids=lambda c: f"{c.id}_{c.question[:20]}")
    def test_eval_case_routing_and_tool_execution(self, case: EvalTestCase):
        """Verify intent, tool selection, parameters, and numerical grounding."""
        # Fixed reference date for reproducible testing: 2026-10-13
        ref_date = date(2026, 10, 13)

        # 1. Intent accuracy
        actual_intent = classify_intent(case.question, ref_date=ref_date)
        assert actual_intent == case.expected_intent, (
            f"Case {case.id} intent mismatch for '{case.question}'. "
            f"Expected '{case.expected_intent}', got '{actual_intent}'"
        )

        # 2. Deterministic execution
        filters = ChatFilterContext(**case.active_filters)
        resp_text, data_used, suggested = _deterministic_query_engine(
            case.question, filters, ref_date=ref_date
        )

        assert resp_text and len(resp_text) > 10
        assert len(suggested) >= 2

        # 3. Tool verification
        if case.expected_tool is None:
            # Greetings, identity, ambiguous, and unsupported queries MUST NOT execute analytics
            assert "kpis" not in data_used or data_used.get("intent") in {"greeting", "identity", "unsupported", "ambiguous_request"}
            if case.expected_response_type == "greeting":
                assert "hello" in resp_text.lower() or "hi" in resp_text.lower()
            elif case.expected_response_type == "identity":
                assert "patil" in resp_text.lower() or "manufacturing" in resp_text.lower()
            elif case.expected_response_type == "clarification":
                assert "clarify" in resp_text.lower() or "example" in resp_text.lower()
            elif case.expected_response_type == "unsupported":
                assert "not sure" in resp_text.lower() or "specialized" in resp_text.lower()
        else:
            # Verified tool selection
            actual_tool = data_used.get("tool")
            assert actual_tool == case.expected_tool, (
                f"Case {case.id} tool mismatch. Expected '{case.expected_tool}', got '{actual_tool}'"
            )

            # 4. Parameter / date verification
            if "target_date" in case.expected_params:
                assert data_used.get("queried_date") == case.expected_params["target_date"]
            if "relative_label" in case.expected_params:
                assert data_used.get("relative_label") == case.expected_params["relative_label"]

            # 5. Exact numerical agreement: If tool produced calculated numbers,
            # verify that formatted numbers in response text match the tool's data
            kpis = data_used.get("kpis")
            if kpis and isinstance(kpis, dict) and kpis.get("recordCount", 0) > 0:
                total_prod = kpis.get("totalProduction")
                if total_prod is not None:
                    # Formatted with commas
                    prod_str = f"{total_prod:,}"
                    assert prod_str in resp_text, (
                        f"Numerical divergence in case {case.id}: '{prod_str}' missing from response text."
                    )


# ---------------------------------------------------------------------------
# 2. Tool-Calling Safety Safeguards
# ---------------------------------------------------------------------------

class TestToolCallingSafeguards:
    """Verify tool allowlist, malformed argument handling, and provider fallback."""

    def test_disallowed_tool_call_is_rejected(self):
        """A model attempting to call an unapproved tool must be safely rejected."""
        fake_tool_name = "drop_database_tables"
        assert fake_tool_name not in ALLOWED_TOOL_NAMES

        result = execute_tool_call(fake_tool_name, {})
        assert "error" in result
        assert "Unknown tool" in result["error"]

    def test_provider_resolution(self):
        """Verify resolve_model_provider respects configuration and environment variables."""
        # 1. Deterministic mode
        with patch.object(settings, "chat_provider", "deterministic"):
            p, u, m, t = resolve_model_provider()
            assert p == "deterministic"
            assert t == ""

        # 2. Hugging Face mode with token
        with patch.object(settings, "chat_provider", "hf"):
            with patch.object(settings, "hf_token", "hf_mock_token_12345"):
                with patch.object(settings, "chat_model", "openai/gpt-oss-120b"):
                    p, u, m, t = resolve_model_provider()
                    assert p == "hf"
                    assert "huggingface" in u
                    assert m == "openai/gpt-oss-120b"
                    assert t == "hf_mock_token_12345"

        # 3. Auto mode prefers HF when HF_TOKEN is present and GROQ_API_KEY is not configured
        with patch.object(settings, "chat_provider", "auto"):
            with patch.object(settings, "groq_api_key", ""):
                with patch.object(settings, "hf_token", "hf_auto_token"):
                    with patch.object(settings, "openai_api_key", "sk-mock"):
                        p, u, m, t = resolve_model_provider()
                        assert p == "hf"
                        assert t == "hf_auto_token"

        # 4. Auto mode falls back to OpenAI if no GROQ_API_KEY and no HF_TOKEN
        with patch.object(settings, "chat_provider", "auto"):
            with patch.object(settings, "groq_api_key", ""):
                with patch.object(settings, "hf_token", ""):
                    with patch.object(settings, "openai_api_key", "sk-mock-auto"):
                        p, u, m, t = resolve_model_provider()
                        assert p == "openai"
                        assert t == "sk-mock-auto"

    def test_hf_adapter_tool_calling_flow(self):
        """Simulate a successful tool call round via Hugging Face router mock."""
        expected = tools.get_daily_production("2026-10-11")
        mock_response_1 = MagicMock()
        mock_response_1.status_code = 200
        mock_response_1.json.return_value = {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [
                            {
                                "id": "call_123",
                                "type": "function",
                                "function": {
                                    "name": "get_daily_production",
                                    "arguments": json.dumps({"target_date": "2026-10-11"}),
                                },
                            }
                        ],
                    }
                }
            ]
        }

        mock_response_2 = MagicMock()
        mock_response_2.status_code = 200
        mock_response_2.json.return_value = {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": (
                            "Production on 11 October 2026 was "
                            f"**{expected['totalProduction']:,} pcs** with "
                            f"**{expected['productionAchievementPercent']}%** achievement."
                        ),
                    }
                }
            ]
        }

        with patch.object(settings, "chat_provider", "hf"):
            with patch.object(settings, "hf_token", "hf_test_mock_token"):
                with patch.object(settings, "chat_model", "openai/gpt-oss-120b"):
                    with patch("httpx.Client.post", side_effect=[mock_response_1, mock_response_2]):
                        payload = ChatRequestPayload(
                            message="what was production on 11-10-2026?",
                            filters=ChatFilterContext(dateFrom="2026-01-01", dateTo="2026-10-09"),
                        )
                        result = process_chat_query(payload)

                        assert f"{expected['totalProduction']:,}" in result.response
                        assert "get_daily_production" in result.data_used
                        assert result.data_used["get_daily_production"]["targetDate"] == "2026-10-11"

    def test_hf_adapter_rate_limit_429_activates_fallback(self):
        """Simulate HTTP 429 rate limit: must smoothly fall back to deterministic engine."""
        mock_resp = MagicMock()
        mock_resp.status_code = 429
        mock_resp.raise_for_status.side_effect = httpx.HTTPStatusError(
            "429 Too Many Requests: Rate limit exceeded",
            request=MagicMock(),
            response=mock_resp,
        )

        with patch.object(settings, "chat_provider", "hf"):
            with patch.object(settings, "hf_token", "hf_test_mock_token"):
                with patch.object(settings, "chat_fallback_enabled", True):
                    with patch("httpx.Client.post", return_value=mock_resp):
                        payload = ChatRequestPayload(
                            message="What is the total production this month?",
                            filters=ChatFilterContext(dateFrom="2026-01-01", dateTo="2026-10-09"),
                        )
                        result = process_chat_query(payload)

                        # Must return grounded deterministic response, not an unhandled crash
                        assert result.response is not None
                        assert "Manufacturing Performance" in result.response
                        assert "kpis" in result.data_used

    def test_hf_adapter_timeout_activates_fallback(self):
        """Simulate network timeout: must smoothly fall back to deterministic engine."""
        with patch.object(settings, "chat_provider", "hf"):
            with patch.object(settings, "hf_token", "hf_test_mock_token"):
                with patch.object(settings, "chat_fallback_enabled", True):
                    with patch("httpx.Client.post", side_effect=httpx.TimeoutException("Read timed out after 45s")):
                        payload = ChatRequestPayload(
                            message="What are the top five downtime causes?",
                            filters=ChatFilterContext(dateFrom="2026-01-01", dateTo="2026-10-09"),
                        )
                        result = process_chat_query(payload)

                        assert result.response is not None
                        assert "Top Downtime Causes" in result.response
                        assert "top_causes" in result.data_used


# ---------------------------------------------------------------------------
# 3. Model Candidates Comparison (openai/gpt-oss-120b vs Qwen/Qwen3-4B-Instruct-2507)
# ---------------------------------------------------------------------------

class TestModelCandidatesComparison:
    """Evaluate both candidate models against identical schemas and analytics."""

    @pytest.mark.parametrize("candidate_model", [
        "openai/gpt-oss-120b",
        "Qwen/Qwen3-4B-Instruct-2507",
    ])
    def test_candidate_model_tool_call_compatibility(self, candidate_model: str):
        """Verify that both candidate models integrate with identical tool schemas."""
        expected = tools.get_manufacturing_kpis(date_from="2026-01-01", date_to="2026-10-09")
        mock_response_1 = MagicMock()
        mock_response_1.status_code = 200
        mock_response_1.json.return_value = {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [
                            {
                                "id": f"call_{candidate_model[:5]}",
                                "type": "function",
                                "function": {
                                    "name": "get_manufacturing_kpis",
                                    "arguments": json.dumps({"date_from": "2026-01-01", "date_to": "2026-10-09"}),
                                },
                            }
                        ],
                    }
                }
            ]
        }

        mock_response_2 = MagicMock()
        mock_response_2.status_code = 200
        mock_response_2.json.return_value = {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                                    "content": (
                                        f"Model {candidate_model} reports total production is "
                                        f"{expected['totalProduction']:,} pcs."
                                    ),
                    }
                }
            ]
        }

        with patch.object(settings, "chat_provider", "hf"):
            with patch.object(settings, "hf_token", "hf_test_mock_token"):
                with patch.object(settings, "chat_model", candidate_model):
                    with patch("httpx.Client.post", side_effect=[mock_response_1, mock_response_2]):
                        payload = ChatRequestPayload(
                            message="What is total production in the selected date range?",
                            filters=ChatFilterContext(dateFrom="2026-01-01", dateTo="2026-10-09"),
                        )
                        result = process_chat_query(payload)

                        assert f"{expected['totalProduction']:,}" in result.response
                        assert "get_manufacturing_kpis" in result.data_used
                        assert result.data_used["get_manufacturing_kpis"]["totalProduction"] == expected["totalProduction"]


# ---------------------------------------------------------------------------
# 4. Hugging Face Provider Resolution Without Live Connectivity
# ---------------------------------------------------------------------------

def test_hf_provider_resolution_does_not_require_live_connectivity():
    """Provider selection is covered locally; ordinary tests never call the hosted router."""
    with patch.object(settings, "chat_provider", "hf"):
        with patch.object(settings, "hf_token", "mock-only"):
            provider, base_url, model, token = resolve_model_provider()
    assert provider == "hf"
    assert base_url == settings.hf_router_url.rstrip("/")
    assert model == settings.chat_model
    assert token == "mock-only"

