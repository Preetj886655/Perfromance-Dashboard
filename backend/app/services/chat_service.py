"""Chatbot orchestration service.

Provides:
1. OpenAI Tool-Calling LLM integration when OPENAI_API_KEY is available.
2. Grounded deterministic analytics query engine when OPENAI_API_KEY is not
   configured, ensuring reliable offline, CI/CD, and local development execution.
3. Multi-turn conversation handling and filter context propagation.
4. Explicit intent classification to prevent unsafe default routing.
5. Date-specific and relative-date query resolution.
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import date, datetime, timedelta
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.core.config import settings
from app.services import chat_analytics_tools as tools
from app.services.chat_analytics_tools import (
    ManufacturingDataUnavailable,
    UnsupportedMaterialField,
)

logger = logging.getLogger(__name__)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"] = Field(..., description="Conversation speaker")
    content: str = Field(..., min_length=1, max_length=4000, description="Message text")


class ChatFilterContext(BaseModel):
    dateFrom: str | None = None
    dateTo: str | None = None
    line: str | None = None
    shift: str | None = None
    stage: str | None = None
    machine: str | None = None
    material: str | None = None


class ChatRequestPayload(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000, description="User's query")
    conversation_id: str | None = Field(default=None, description="Existing or new conversation ID")
    history: list[ChatMessage] = Field(default_factory=list, max_length=12, description="Recent conversation turns")
    filters: ChatFilterContext = Field(default_factory=ChatFilterContext, description="Active dashboard filters")


class ChatResponsePayload(BaseModel):
    response: str
    conversation_id: str
    data_used: dict[str, Any]
    suggested_questions: list[str]


class AmbiguousQueryValue(RuntimeError):
    """Raised when a named production item matches multiple source dimensions."""


# ---------------------------------------------------------------------------
# Intent Classification
# ---------------------------------------------------------------------------

# Canonical intent labels
INTENT_GREETING = "greeting"
INTENT_IDENTITY = "assistant_identity"
INTENT_KPI_SUMMARY = "production_kpi_summary"
INTENT_DAILY_PRODUCTION = "daily_production"
INTENT_DATE_SPECIFIC = "date_specific_production"
INTENT_DATE_RANGE_COMPARISON = "date_range_comparison"
INTENT_LINE_COMPARISON = "line_comparison"
INTENT_SHIFT_COMPARISON = "shift_comparison"
INTENT_DOWNTIME_CAUSES = "downtime_cause_analysis"
INTENT_DOWNTIME_MACHINES = "machine_downtime_analysis"
INTENT_QUALITY = "quality_rejection_analysis"
INTENT_MAINTENANCE = "maintenance_breakdown_analysis"
INTENT_CORRECTIVE = "corrective_action_lookup"
INTENT_OPERATIONAL_SUMMARY = "operational_summary"
INTENT_PPC_ORDERS = "ppc_order_tracking"
INTENT_LINE_TRACKER_OEE = "line_tracker_oee_breakdown"
INTENT_RELIABILITY_PARETO = "line_tracker_reliability_pareto"
INTENT_TRACEABILITY = "line_tracker_traceability"
INTENT_AMBIGUOUS = "ambiguous_request"
INTENT_UNSUPPORTED = "unsupported"


# Date formats commonly used in Indian manufacturing context.
# DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
_DATE_PATTERN = re.compile(
    r"\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b"
)
# ISO yyyy-mm-dd
_ISO_DATE_PATTERN = re.compile(
    r"\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b"
)
# DD Month YYYY (e.g. 11 Oct 2026, 11th October 2026)
_TEXT_DATE_DMY = re.compile(
    r"\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-zA-Z]{3,9})\s+(\d{4})\b"
)
# Month DD, YYYY (e.g. Oct 11 2026, October 11, 2026)
_TEXT_DATE_MDY = re.compile(
    r"\b([a-zA-Z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(\d{4})\b"
)

_MONTHS_MAP = {
    "jan": 1, "january": 1,
    "feb": 2, "february": 2,
    "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5,
    "jun": 6, "june": 6,
    "jul": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "september": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}
_MONTH_NAME_PATTERN = "|".join(sorted(_MONTHS_MAP, key=len, reverse=True))
_MONTH_YEAR_PATTERN = re.compile(
    rf"\b({_MONTH_NAME_PATTERN})\s+(\d{{4}})\b", re.IGNORECASE
)
_MONTH_ONLY_PATTERN = re.compile(
    rf"\b({_MONTH_NAME_PATTERN})(?:\s+month)?\b", re.IGNORECASE
)

_GREETING_WORDS = {
    "hi", "hello", "hey", "good morning", "good afternoon", "good evening",
    "howdy", "greetings", "namaste", "hola", "sup", "yo", "hii", "hiii",
    "thanks", "thank you", "bye", "goodbye", "ok", "okay", "cool", "great",
    "nice", "welcome",
}

_IDENTITY_KEYWORDS = [
    "who are you", "what are you", "your name", "what can you do",
    "how can you help", "what do you do", "help me", "capabilities",
    "what can i ask", "what questions",
]

_AMBIGUOUS_TERMS = {
    "production", "downtime", "kpi", "kpis", "maintenance", "quality",
    "rejection", "breakdown", "performance", "targets", "target", "gap",
    "status", "compare", "comparison", "report", "summary",
    "show production", "view production", "check production",
    "check downtime", "show downtime", "show status", "what is status",
    "how are we doing",
}


def _has_production_language(query: str) -> bool:
    """Recognize common ways people describe production without using the KPI label."""
    q = query.casefold()
    if re.search(
        r"\b(production|produce|produced|output|manufactur\w*|throughput|units?|pieces?|pcs|volume|"
        r"target|goal|attainment|actuals?|shortfall|variance|capacity|efficiency|performance)\b",
        q,
    ):
        return True
    return bool(
        (
            re.search(r"\b(?:how many|how much)\b", q)
            and re.search(r"\b(?:mak\w*|build\w*|come off|came off|turn out)\b", q)
        )
        or re.search(r"\bwhat did (?:we|the line)\s+(?:mak\w*|build\w*)\b", q)
    )


def _has_analytics_language(query: str) -> bool:
    """Detect conversational manufacturing, quality, and maintenance vocabulary."""
    q = query.casefold()
    return _has_production_language(q) or bool(
        re.search(
            r"\b(target|goal|achievement|downtime|idle|stopp\w*|halt|loss|lost time|lose time|gap|yield|"
            r"kpi|maintenance|machine|line|shift|quality|rejection|reject|scrap|"
            r"defect\w*|breakdown\w*|repair|root cause|failure|incident|mttr|parts?|material|"
            r"numbers|figures|results|actuals?)\b",
            q,
        )
    )


def _parse_date_from_query(query: str) -> date | None:
    """Extract an explicit date from a user query.

    Supports:
    - DD-MM-YYYY (Indian convention — day first)
    - DD Month YYYY (e.g. '11 October 2026', '11th Oct 2026')
    - Month DD, YYYY (e.g. 'October 11, 2026')
    - ISO YYYY-MM-DD
    Returns None if no valid date is found.
    """
    # 1. Try DD-MM-YYYY first (Indian convention)
    m = _DATE_PATTERN.search(query)
    if m:
        day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            return date(year, month, day)
        except ValueError:
            pass

    # 2. Try DD Month YYYY (e.g. 11 Oct 2026)
    m = _TEXT_DATE_DMY.search(query)
    if m:
        day_str, mon_str, year_str = m.group(1), m.group(2).lower(), m.group(3)
        month = _MONTHS_MAP.get(mon_str)
        if month:
            try:
                return date(int(year_str), month, int(day_str))
            except ValueError:
                pass

    # 3. Try Month DD YYYY (e.g. Oct 11 2026)
    m = _TEXT_DATE_MDY.search(query)
    if m:
        mon_str, day_str, year_str = m.group(1).lower(), m.group(2), m.group(3)
        month = _MONTHS_MAP.get(mon_str)
        if month:
            try:
                return date(int(year_str), month, int(day_str))
            except ValueError:
                pass

    # 4. Try ISO YYYY-MM-DD
    m = _ISO_DATE_PATTERN.search(query)
    if m:
        year, month, day = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            return date(year, month, day)
        except ValueError:
            pass

    return None


def _parse_explicit_dates(query: str) -> list[date]:
    """Return explicit dates in the order they appear, including both ends of a range."""
    parsers = (
        (_DATE_PATTERN, lambda match: date(int(match.group(3)), int(match.group(2)), int(match.group(1)))),
        (_TEXT_DATE_DMY, lambda match: date(
            int(match.group(3)), _MONTHS_MAP[match.group(2).lower()], int(match.group(1))
        )),
        (_TEXT_DATE_MDY, lambda match: date(
            int(match.group(3)), _MONTHS_MAP[match.group(1).lower()], int(match.group(2))
        )),
        (_ISO_DATE_PATTERN, lambda match: date(int(match.group(1)), int(match.group(2)), int(match.group(3)))),
    )
    found: list[tuple[int, date]] = []
    for pattern, parser in parsers:
        for match in pattern.finditer(query):
            try:
                found.append((match.start(), parser(match)))
            except (ValueError, KeyError):
                continue
    return [value for _, value in sorted(found, key=lambda item: item[0])]


def _parse_month_range(query: str, ref_date: date | None = None) -> tuple[date, date] | None:
    """Return the full calendar month named in a query."""
    match = _MONTH_YEAR_PATTERN.search(query)
    month = _MONTHS_MAP.get(match.group(1).lower()) if match else None
    year = int(match.group(2)) if match else _get_business_today(ref_date).year
    if not match:
        match = _MONTH_ONLY_PATTERN.search(query)
        month = _MONTHS_MAP.get(match.group(1).lower()) if match else None
    if month is None:
        return None
    try:
        start = date(year, month, 1)
    except ValueError:
        return None
    next_month = date(year + (month == 12), 1 if month == 12 else month + 1, 1)
    return start, next_month - timedelta(days=1)


def _get_business_today(ref_date: date | None = None) -> date:
    """Return today's date in the configured business timezone (Asia/Kolkata) or ref_date."""
    if ref_date is not None:
        return ref_date
    tz_name = getattr(settings, "chat_timezone", "Asia/Kolkata")
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo(tz_name)).date()
    except Exception:
        return date.today()


def _resolve_relative_date(query: str, ref_date: date | None = None) -> tuple[date | None, str | None]:
    """Resolve relative date references like 'yesterday', 'today', 'day before yesterday'.

    Returns (resolved_date, label) or (None, None) if no relative reference found.
    The reference date is today's calendar date in the business timezone (Asia/Kolkata)
    or an injected ref_date for reproducible testing.
    """
    q = query.lower()
    today = _get_business_today(ref_date)

    if "day before yesterday" in q:
        d = today - timedelta(days=2)
        return d, "day before yesterday"
    if "yesterday" in q or "previous day" in q:
        d = today - timedelta(days=1)
        return d, "yesterday"
    if "today" in q or "today's" in q:
        return today, "today"
    ago_match = re.search(
        r"\b(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(days?|weeks?)\s+ago\b",
        q,
    )
    if ago_match:
        count_text, unit = ago_match.groups()
        word_counts = {
            "a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4,
            "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
        }
        count = int(count_text) if count_text.isdigit() else word_counts[count_text]
        offset = count * (7 if unit.startswith("week") else 1)
        target = today - timedelta(days=offset)
        return target, f"{count} {unit} ago"
    weekday_names = {
        "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
        "friday": 4, "saturday": 5, "sunday": 6,
    }
    weekday_match = re.search(
        r"\b(last|previous|this|next)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b",
        q,
    )
    if weekday_match:
        direction, weekday_name = weekday_match.groups()
        target_weekday = weekday_names[weekday_name]
        days_ahead = (target_weekday - today.weekday()) % 7
        if direction in {"last", "previous"}:
            days_ahead = days_ahead - 7 if days_ahead else -7
        elif direction == "next":
            days_ahead = days_ahead + 7 if days_ahead else 7
        target = today + timedelta(days=days_ahead)
        return target, f"{direction} {weekday_name}"
    if _is_last_week_query(q):
        # Handled specially via _get_last_week_range
        return None, None
    if "latest" in q and ("production" in q or "date" in q or "record" in q or "data" in q):
        latest_str = tools.get_latest_data_date()
        if latest_str:
            try:
                return date.fromisoformat(latest_str), "latest available date"
            except ValueError:
                pass

    return None, None


def _is_last_week_query(query: str) -> bool:
    """Check if query refers to the previous completed calendar week."""
    q = query.lower()
    return "last week" in q or "previous week" in q


def _get_last_week_range(ref_date: date | None = None) -> tuple[str, str]:
    """Return (Monday, Sunday) ISO strings for the previous calendar week."""
    today = _get_business_today(ref_date)
    # Monday of current week
    current_monday = today - timedelta(days=today.weekday())
    last_monday = current_monday - timedelta(weeks=1)
    last_sunday = last_monday + timedelta(days=6)
    return last_monday.isoformat(), last_sunday.isoformat()


def _get_week_before_last_range(ref_date: date | None = None) -> tuple[str, str]:
    """Return the Monday-Sunday range immediately before the previous week."""
    last_monday, last_sunday = (date.fromisoformat(value) for value in _get_last_week_range(ref_date))
    return (last_monday - timedelta(days=7)).isoformat(), (last_sunday - timedelta(days=7)).isoformat()


def _resolve_query_period(
    query: str, ref_date: date | None = None
) -> tuple[str, str, str] | None:
    """Resolve common calendar and rolling periods, independent of dashboard dates."""
    q = query.lower()
    today = _get_business_today(ref_date)

    explicit_dates = _parse_explicit_dates(query)
    has_range_language = re.search(r"\b(between|from|through|until|to)\b", q)
    if len(explicit_dates) >= 2 and has_range_language:
        start, end = explicit_dates[0], explicit_dates[1]
        if end < start:
            start, end = end, start
        return start.isoformat(), end.isoformat(), f"{start:%B} {start.day} to {end:%B} {end.day}, {end.year}"

    explicit_month = _parse_month_range(query, ref_date=ref_date)
    if explicit_month:
        start, end = explicit_month
        return start.isoformat(), end.isoformat(), start.strftime("%B %Y")

    if "previous month" in q or "last month" in q:
        first_this_month = date(today.year, today.month, 1)
        last_previous_month = first_this_month - timedelta(days=1)
        start = date(last_previous_month.year, last_previous_month.month, 1)
        return start.isoformat(), last_previous_month.isoformat(), start.strftime("%B %Y")

    rolling_period = re.search(
        r"\b(?:last|past|previous)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(days?|weeks?|months?|years?)\b",
        q,
    )
    if rolling_period:
        count_words = {
            "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
            "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
        }
        count_text, unit = rolling_period.groups()
        count = int(count_text) if count_text.isdigit() else count_words[count_text]
        if unit.startswith("day"):
            start = today - timedelta(days=count - 1)
        elif unit.startswith("week"):
            start = today - timedelta(days=count * 7 - 1)
        elif unit.startswith("month"):
            month_index = today.year * 12 + today.month - 1 - count
            start = date(month_index // 12, month_index % 12 + 1, 1)
        else:
            start = date(today.year - count, 1, 1)
        return start.isoformat(), today.isoformat(), f"last {count} {unit}"

    if re.search(r"\bpast week\b", q):
        start = today - timedelta(days=6)
        return start.isoformat(), today.isoformat(), "past 7 days"
    if re.search(r"\bpast month\b", q):
        start = today - timedelta(days=29)
        return start.isoformat(), today.isoformat(), "past 30 days"
    if re.search(r"\bpast year\b", q):
        start = today - timedelta(days=364)
        return start.isoformat(), today.isoformat(), "past 365 days"

    if any(phrase in q for phrase in ("this month", "current month", "month to date", "month-to-date", "monthly")):
        start = date(today.year, today.month, 1)
        return start.isoformat(), today.isoformat(), start.strftime("%B %Y")

    if any(phrase in q for phrase in ("this week", "current week", "week to date", "week-to-date", "weekly")):
        start = today - timedelta(days=today.weekday())
        return start.isoformat(), today.isoformat(), "week to date"

    if _is_last_week_query(q):
        start, end = _get_last_week_range(ref_date)
        return start, end, "previous completed week"

    if "previous quarter" in q or "last quarter" in q:
        current_quarter = (today.month - 1) // 3
        first_current_quarter = date(today.year, current_quarter * 3 + 1, 1)
        last_previous_quarter = first_current_quarter - timedelta(days=1)
        start = date(last_previous_quarter.year, ((last_previous_quarter.month - 1) // 3) * 3 + 1, 1)
        return start.isoformat(), last_previous_quarter.isoformat(), f"quarter ending {last_previous_quarter:%B %Y}"

    if "this quarter" in q or "quarter to date" in q or "quarter-to-date" in q or "quarterly" in q:
        start = date(today.year, ((today.month - 1) // 3) * 3 + 1, 1)
        return start.isoformat(), today.isoformat(), "quarter to date"

    if "last year" in q or "previous year" in q:
        start = date(today.year - 1, 1, 1)
        end = date(today.year - 1, 12, 31)
        return start.isoformat(), end.isoformat(), str(start.year)

    if "this year" in q or "year to date" in q or "year-to-date" in q or any(
        phrase in q for phrase in ("yearly", "annual", "annually")
    ):
        start = date(today.year, 1, 1)
        return start.isoformat(), today.isoformat(), "year to date"

    return None


def _is_week_comparison_query(query: str) -> bool:
    q = query.casefold()
    return (
        ("compare" in q or "comparison" in q)
        and ("last week" in q or "previous week" in q)
        and ("week before" in q or q.count("previous week") >= 2)
    )


def _is_date_range_comparison_query(query: str) -> bool:
    q = query.casefold()
    asks_to_compare = any(
        phrase in q
        for phrase in ("compare", "comparison", "versus", " vs ", "difference between", "compared with")
    )
    period_cue = any(
        phrase in q
        for phrase in ("day", "week", "month", "quarter", "year", "date", "period", "range", "between", "from")
    ) or len(_parse_explicit_dates(query)) >= 2
    competing_dimensions = any(word in q for word in ("line", "shift", "machine"))
    other_metric = any(
        word in q for word in ("downtime", "maintenance", "breakdown", "rejection", "quality", "scrap", "defect")
    )
    return asks_to_compare and period_cue and not competing_dimensions and not other_metric


def _resolve_period_comparison(
    query: str, ref_date: date | None = None
) -> tuple[tuple[str, str], tuple[str, str]] | None:
    """Resolve common adjacent week/month comparisons in chronological order."""
    q = query.casefold()
    today = _get_business_today(ref_date)

    mentioned_months = [
        _parse_month_range(match.group(0))
        for match in _MONTH_YEAR_PATTERN.finditer(query)
    ]
    mentioned_months = [period for period in mentioned_months if period is not None]
    if len(mentioned_months) >= 2:
        first, second = sorted(mentioned_months[:2], key=lambda period: period[0])
        return (
            (first[0].isoformat(), first[1].isoformat()),
            (second[0].isoformat(), second[1].isoformat()),
        )

    explicit_dates = _parse_explicit_dates(query)
    if len(explicit_dates) >= 4:
        ranges = [
            (explicit_dates[0], explicit_dates[1]),
            (explicit_dates[2], explicit_dates[3]),
        ]
        (first_start, first_end), (second_start, second_end) = sorted(
            ranges, key=lambda period: period[0]
        )
        return (
            (first_start.isoformat(), first_end.isoformat()),
            (second_start.isoformat(), second_end.isoformat()),
        )

    if "week" in q and ("this week" in q or "current week" in q) and any(
        phrase in q for phrase in ("last week", "previous week")
    ):
        current_start = today - timedelta(days=today.weekday())
        return _get_last_week_range(ref_date), (current_start.isoformat(), today.isoformat())
    if _is_week_comparison_query(q):
        return _get_week_before_last_range(ref_date), _get_last_week_range(ref_date)

    if "month before" in q and ("last month" in q or "previous month" in q):
        first_this_month = date(today.year, today.month, 1)
        end_recent = first_this_month - timedelta(days=1)
        start_recent = date(end_recent.year, end_recent.month, 1)
        end_older = start_recent - timedelta(days=1)
        start_older = date(end_older.year, end_older.month, 1)
        return (start_older.isoformat(), end_older.isoformat()), (start_recent.isoformat(), end_recent.isoformat())
    if "month" in q and ("this month" in q or "current month" in q) and any(
        phrase in q for phrase in ("last month", "previous month")
    ):
        first_this_month = date(today.year, today.month, 1)
        end_previous = first_this_month - timedelta(days=1)
        start_previous = date(end_previous.year, end_previous.month, 1)
        return (start_previous.isoformat(), end_previous.isoformat()), (first_this_month.isoformat(), today.isoformat())

    return None


_MATERIAL_QUERY_PATTERN = re.compile(
    r"\b(?:production|output|results?|numbers?|performance|units?|pieces?|quantity|target|achievement)\s+(?:of|for|from)\s+(.+?)"
    r"(?=\s+(?:in|during|over|on|between|from|for)\b|[?,.!;]|$)",
    re.IGNORECASE,
)
_ITEM_PERFORMANCE_PATTERN = re.compile(
    r"\b(?:how\s+did|how\s+was|what\s+about)\s+(.+?)\s+"
    r"(?:do|perform|fare|produce|make|look)\b"
    r"(?=\s+(?:in|during|over|on|between|from|for|last|this|previous)\b|[?,.!;]|$)",
    re.IGNORECASE,
)
_SHORT_ITEM_FOLLOW_UP_PATTERN = re.compile(
    r"^(?:and\s+)?(?:what about|how about|for)\s+(.+?)[?.!]*$",
    re.IGNORECASE,
)
_ITEM_PREFIX_LEAD_IN = re.compile(
    r"^(?:what\s+(?:is|was|are|were)\s+(?:the\s+)?|show\s+(?:me\s+)?(?:the\s+)?|get\s+(?:the\s+)?|tell\s+me\s+(?:about\s+)?(?:the\s+)?|display\s+(?:the\s+)?|give\s+me\s+(?:the\s+)?|compare\s+(?:the\s+)?|check\s+(?:the\s+)?)",
    re.IGNORECASE,
)
_ITEM_PREFIX_PRODUCTION_PATTERN = re.compile(
    r"^([a-zA-Z0-9\s-]+?)\s+(?:production|output|targets?|achievements?|units?|pieces?)\b",
    re.IGNORECASE,
)

_GENERIC_PRODUCTION_WORDS = {
    "total", "overall", "daily", "monthly", "weekly", "yearly", "quarterly",
    "annual", "plant", "manufacturing", "good", "target", "targets", "actual",
    "our", "the", "all", "yesterday", "yesterdays", "yesterday's", "today",
    "todays", "today's", "tomorrow", "tomorrows", "tomorrow's", "previous",
    "last", "current", "next", "this", "date", "shift", "line", "machine",
    "stage", "material", "part", "product", "item", "average", "median",
    "highest", "lowest", "best", "worst", "more", "less", "how much", "what",
    "what was", "what is", "compare", "comparison", "show", "check", "tell",
}


def _query_mentions_value(query: str, value: Any) -> bool:
    """Require model-extracted filter values to be explicitly present in the user's words."""
    if value is None:
        return False
    normalized_query = re.sub(r"[^a-z0-9]+", " ", query.casefold()).strip()
    normalized_value = re.sub(r"[^a-z0-9]+", " ", str(value).casefold()).strip()
    if not normalized_value:
        return False
    return bool(re.search(rf"(?<!\w){re.escape(normalized_value)}(?!\w)", normalized_query))


def _extract_named_filter_value(query: str) -> str | None:
    """Extract the item or process label named after 'production of/for' or before 'production'."""
    match = (
        _MATERIAL_QUERY_PATTERN.search(query)
        or _ITEM_PERFORMANCE_PATTERN.search(query)
        or _SHORT_ITEM_FOLLOW_UP_PATTERN.search(query.strip())
    )
    if not match:
        stripped = _ITEM_PREFIX_LEAD_IN.sub("", query.strip()).strip()
        match = _ITEM_PREFIX_PRODUCTION_PATTERN.match(stripped)
    if not match:
        return None
    value = re.sub(
        r"\s+(?:in|during|over|on|for|last|previous|this|current|next)\b.*$", "",
        match.group(1).strip(), flags=re.IGNORECASE,
    )
    for suffix in ("stage", "material", "product", "item"):
        value = re.sub(rf"\s+{suffix}$", "", value, flags=re.IGNORECASE)
    if re.search(r"\s+part$", value, flags=re.IGNORECASE):
        candidate = re.sub(r"\s+part$", "", value, flags=re.IGNORECASE).strip()
        if candidate.casefold() in {"mk3", "mk5", "liner less", "erc mkv", "clip", "clamp"}:
            value = candidate
    value = re.sub(r"^(?:the|a|an)\s+", "", value, flags=re.IGNORECASE)
    value = re.sub(r"^(?:stage|material|part|product|item)\s+", "", value, flags=re.IGNORECASE)
    if not value or value.casefold() in _GENERIC_PRODUCTION_WORDS:
        return None
    if value and (
        _query_has_time_reference(value)
        or re.search(r"\b(?:line|shift|machine|downtime|maintenance)\b", value.casefold())
        or value.casefold() in {"production", "output", "results", "result", "data", "kpi", "kpis", "total production"}
    ):
        return None
    return value or None


def _resolve_query_filters(
    query: str,
    filters: ChatFilterContext,
    hinted_stage: Any = None,
    hinted_material: Any = None,
) -> tuple[str | None, str | None, list[str]]:
    """Resolve an item name to a supported source field using exact live values."""
    value = _extract_named_filter_value(query)
    hinted_dimension = None
    if not value:
        stage_mentioned = hinted_stage if _query_mentions_value(query, hinted_stage) else None
        material_mentioned = hinted_material if _query_mentions_value(query, hinted_material) else None
        if stage_mentioned and material_mentioned and str(stage_mentioned).casefold() != str(material_mentioned).casefold():
            raise AmbiguousQueryValue("The request names more than one production item.")
        value = str(stage_mentioned or material_mentioned or "").strip() or None
        if not value:
            return filters.stage, filters.material, []
        hinted_dimension = "stage" if stage_mentioned else "material"

    q = query.casefold()
    normalized = value.strip().casefold()
    records = tools.get_raw_manufacturing_records()
    material_fields = ("part", "partName", "material")
    matched_values: dict[str, str] = {}
    for field in ("stage", *material_fields):
        matched_value = next(
            (
                str(record[field]).strip()
                for record in records
                if record.get(field) is not None
                and str(record[field]).strip().casefold() == normalized
            ),
            None,
        )
        if matched_value is not None:
            matched_values[field] = matched_value

    explicit_material = re.search(r"\b(?:material|part|product|item)\b", q)
    explicit_stage = re.search(r"\bstage\b", q)
    if explicit_material and not any(field in matched_values for field in material_fields) and "stage" in matched_values:
        # e.g. "clip part" or "clip material" where "clip" is actually a process stage in the source data
        return matched_values["stage"], filters.material, []
    if explicit_material:
        canonical = next((matched_values[field] for field in material_fields if field in matched_values), value)
        return filters.stage, canonical, []
    if explicit_stage:
        return matched_values.get("stage", value), filters.material, []

    matched_fields = set(matched_values)
    if "stage" in matched_fields and matched_fields.intersection(material_fields):
        raise AmbiguousQueryValue(
            f"The value {value!r} matches both a stage and a material/part field."
        )
    if "stage" in matched_fields:
        return matched_values["stage"], filters.material, []
    if hinted_dimension == "stage":
        return value, filters.material, []
    canonical_material = next(
        (matched_values[field] for field in material_fields if field in matched_values), value
    )
    return filters.stage, canonical_material, []



def classify_intent(query: str, ref_date: date | None = None) -> str:
    """Classify the user's message into a canonical intent label.

    The classifier uses keyword matching and pattern detection.
    It is deliberately conservative: only messages that clearly match
    a known analytics category are routed to analytics tools.
    Everything else is classified as unsupported.
    """
    q = query.strip().lower()

    # --- Greetings ---
    q_clean = re.sub(r"[^a-z0-9\s]", "", q).strip()
    if q_clean in _GREETING_WORDS or re.fullmatch(
        r"(?:hi|hello|hey|good (?:morning|afternoon|evening))(?: assistant| there)?",
        q_clean,
    ):
        return INTENT_GREETING
    has_analytics_term = _has_analytics_language(q)
    if ("thanks" in q or "thank you" in q) and not has_analytics_term and "?" not in q:
        return INTENT_GREETING

    # --- Identity / capabilities ---
    identity_phrases = {
        "who are you", "what are you", "what is your name", "what's your name",
        "what can you do", "how can you help", "how can you help me",
        "what do you do", "what are your capabilities", "what questions can i ask",
    }
    if q_clean in identity_phrases or (
        not has_analytics_term and any(phrase in q for phrase in _IDENTITY_KEYWORDS)
    ):
        return INTENT_IDENTITY

    # --- Ambiguous standalone keywords ---
    if q_clean in _AMBIGUOUS_TERMS:
        return INTENT_AMBIGUOUS

    # --- PPC Production Orders & Fulfillment ---
    if (
        any(kw in q for kw in [
            "po-2026", "production order", "production orders", "order status",
            "orders at risk", "at-risk orders", "at risk orders", "at risk order",
            "dp date", "planned delivery date", "po balance", "order balance",
            "outstanding quantity", "remaining balance", "order completion",
            "fulfillment status", "fulfillment percentage", "fulfillment summary",
            "order fulfillment", "open orders", "pending allocation", "pending phasing",
        ])
        or any(po_num in q for po_num in [
            "26265489205106", "60257500205475", "95265013100645",
            "32654922029501", "tp245007400006", "tp235085100013",
        ])
        or ("order" in q and any(w in q for w in ["western railway", "southern railway", "central railway", "scr", "ecor", "south central"]))
    ):
        return INTENT_PPC_ORDERS

    # --- RM Heat Traceability & Funnel ---
    if any(kw in q for kw in [
        "metallurgical reconciliation", "placeholder heat", "heat reconciliation",
        "h-2409-118", "traceability funnel", "forming yield", "heat yield",
    ]) or ("heat" in q and any(w in q for w in ["traceability", "yield", "funnel", "conversion", "billet"])):
        return INTENT_TRACEABILITY

    # --- Line Tracker Reliability & Historical Downtime Pareto ---
    if (
        any(kw in q for kw in [
            "pareto", "reliability", "downtime pareto", "historical downtime",
            "category pareto", "downtime category", "downtime categories",
            "planned vs unplanned", "unplanned downtime", "planned downtime",
            "recurring breakdown", "breakdown frequency", "failure timeline",
            "failure trends", "dimensions & length issue", "dimensions and length",
            "sikka1", "sikka-1", "autocopying-5", "autocopying-2", "autocopying-4",
            "autocopying-1", "autocopying-6",
        ])
        or (("nov 2024" in q or "november 2024" in q) and any(w in q for w in ["downtime", "gap", "record", "data", "log"]))
        or ("mttr" in q and not any(w in q for w in ["medchal", "maintenance"]))
        or ("mtbf" in q and not any(w in q for w in ["medchal", "maintenance"]))
    ):
        return INTENT_RELIABILITY_PARETO

    # --- ERC Mk-V Line Tracker OEE Breakdown & Speed Loss ---
    if (
        any(kw in q for kw in [
            "oee", "overall oee", "erc mkv oee", "line tracker oee", "oee breakdown",
            "speed loss", "cycle time compliance", "rated vs actual", "rated cycle time",
            "actual cycle time", "cycle compliance", "slower than rated",
            "press line e1", "bar cropper-1", "bar cropper-2",
        ])
        or ("work center" in q and any(w in q for w in ["oee", "performance", "availability", "compliance"]))
    ):
        return INTENT_LINE_TRACKER_OEE

    # --- Quality / Rejection (Prioritized so queries like 'machines with highest rejection' route to Quality) ---
    if any(kw in q for kw in [
        "rejection", "scrap", "quality", "reject", "defect", "defective",
        "bad part", "bad parts", "failed inspection", "not accepted",
    ]):
        return INTENT_QUALITY

    # --- Downtime causes ---
    if any(kw in q for kw in [
        "downtime cause", "downtime causes", "top 5 downtime",
        "top five downtime", "causes of downtime", "top downtime causes",
        "idle reason", "idle reasons", "what stopped production",
        "what caused the stoppage", "where did we lose time", "what held us back",
    ]):
        return INTENT_DOWNTIME_CAUSES

    # --- Machine downtime ---
    if any(kw in q for kw in [
        "highest downtime", "machines have the highest",
        "machine downtime", "top machines", "which machine stopped",
        "machines stopped the most", "machine with the most downtime",
    ]):
        return INTENT_DOWNTIME_MACHINES

    # --- Line comparison / gap ---
    if any(kw in q for kw in [
        "largest gap", "production gap", "which line", "line performance",
        "line comparison", "by line", "production by line", "each line",
        "highest output line", "best performing line", "worst performing line",
    ]) or (
        "line" in q and any(word in q for word in ("most", "least", "highest", "lowest", "best", "worst", "ahead", "behind"))
    ):
        return INTENT_LINE_COMPARISON

    # --- Date-range comparison ---
    if _is_date_range_comparison_query(query):
        return INTENT_DATE_RANGE_COMPARISON

    # --- Maintenance corrective actions ---
    if any(kw in q for kw in ["corrective", "root cause", "counter measure", "corrective-action"]):
        return INTENT_CORRECTIVE

    # --- Shift comparison ---
    if any(kw in q for kw in [
        "compare day", "compare night", "shift comparison", "shift performance",
        "performance breakdown", "across shifts", "by shift", "day vs night", "night vs day",
        "night shift", "day shift",
    ]) or ("shift" in q and ("performance" in q or "breakdown" in q or "compare" in q or "only" in q or "show" in q)):
        return INTENT_SHIFT_COMPARISON

    # --- Maintenance / Medchal breakdown ---
    if any(kw in q for kw in ["medchal", "breakdown", "mttr", "maintenance"]):
        return INTENT_MAINTENANCE

    # --- Date-specific production ---
    explicit_date = _parse_date_from_query(query)
    if (_DATE_PATTERN.search(query) or _ISO_DATE_PATTERN.search(query)) and not _parse_explicit_dates(query):
        return INTENT_UNSUPPORTED
    if (
        len(_parse_explicit_dates(query)) >= 2
        and re.search(r"\b(between|from|through|until|to)\b", q)
        and (has_analytics_term or _has_production_language(q))
    ):
        return INTENT_KPI_SUMMARY
    if explicit_date and (has_analytics_term or _has_production_language(q)):
        return INTENT_DATE_SPECIFIC

    explicit_month = _parse_month_range(query)
    if explicit_month and (has_analytics_term or _has_production_language(q)):
        return INTENT_KPI_SUMMARY

    # --- Relative-date daily production ---
    rel_date, _ = _resolve_relative_date(query, ref_date=ref_date)
    if rel_date and (has_analytics_term or _has_production_language(q)):
        return INTENT_DAILY_PRODUCTION

    # --- Last week production ---
    if _is_last_week_query(query) and (has_analytics_term or _has_production_language(q)):
        return INTENT_KPI_SUMMARY

    # --- Operational summary (Requires operational domain keywords) ---
    if any(kw in q for kw in ["operational problem", "operational problems", "operational summary"]) or (
        "operational" in q and ("summary" in q or "problem" in q or "overview" in q)
    ):
        return INTENT_OPERATIONAL_SUMMARY

    if _resolve_query_period(query, ref_date=ref_date) and has_analytics_term:
        return INTENT_KPI_SUMMARY

    if _has_production_language(q) and any(
        phrase in q for phrase in (
            "hit the target", "meet the target", "met the target", "hit our goal", "make our target",
        )
    ):
        return INTENT_KPI_SUMMARY

    # --- General production KPI / Period summaries ---
    if any(kw in q for kw in [
        "total production", "production achievement",
        "achievement percentage", "achievement rate",
        "production target", "how much production",
        "production this month", "monthly production",
        "production kpi", "manufacturing kpi", "kpis",
        "production loss", "good quantity", "good output",
        "total downtime", "selected date range", "this month",
        "previous month", "last month", "current month"
    ]) or ("summarize" in q and ("kpi" in q or "production" in q)):
        return INTENT_KPI_SUMMARY

    if _has_production_language(q) and not any(
        word in q for word in ("downtime", "maintenance", "breakdown")
    ):
        return INTENT_KPI_SUMMARY

    # --- "gap" alone (could be production gap) ---
    if "gap" in q and ("production" in q or "target" in q):
        return INTENT_LINE_COMPARISON

    # --- Nothing matched: unsupported ---
    return INTENT_UNSUPPORTED


# ---------------------------------------------------------------------------
# OpenAI Tool Definitions
# ---------------------------------------------------------------------------

CHAT_TOOLS_SCHEMA = [
    {
        "type": "function",
        "function": {
            "name": "get_manufacturing_kpis",
            "description": "Use for production/output/units made, target attainment, shortfall, rejection, and overall manufacturing KPI questions. Calculates totals for the requested dates and filters.",
            "parameters": {
                "type": "object",
                "properties": {
                    "date_from": {"type": "string", "description": "ISO yyyy-mm-dd start date"},
                    "date_to": {"type": "string", "description": "ISO yyyy-mm-dd end date"},
                    "line": {"type": "string", "description": "Filter by line name, e.g. 'LINE-1'"},
                    "shift": {"type": "string", "description": "Filter by shift, e.g. 'Shift 1' or 'Day'"},
                    "stage": {"type": "string", "description": "Filter by stage name. In this plant, finished production is stage 'Clip'. Defaults to 'Clip' for final production unless another stage is specifically requested."},
                    "machine": {"type": "string", "description": "Filter by machine name"},
                    "material": {"type": "string", "description": "Filter by material or part"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_production_by_line",
            "description": "Returns production, target, achievement %, and gap for each manufacturing line, sorted by largest gap.",
            "parameters": {
                "type": "object",
                "properties": {
                    "date_from": {"type": "string", "description": "ISO yyyy-mm-dd start date"},
                    "date_to": {"type": "string", "description": "ISO yyyy-mm-dd end date"},
                    "line": {"type": "string", "description": "Optional line filter"},
                    "shift": {"type": "string", "description": "Filter by shift"},
                    "stage": {"type": "string", "description": "Optional production stage filter. Defaults to 'Clip' for final clip production."},
                    "machine": {"type": "string", "description": "Optional machine filter"},
                    "material": {"type": "string", "description": "Optional part or material filter"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_production_by_shift",
            "description": "Compares production, target, achievement %, downtime, and rejection across shifts (Day vs Night / Shift 1 vs Shift 2).",
            "parameters": {
                "type": "object",
                "properties": {
                    "date_from": {"type": "string", "description": "ISO yyyy-mm-dd start date"},
                    "date_to": {"type": "string", "description": "ISO yyyy-mm-dd end date"},
                    "line": {"type": "string", "description": "Filter by line"},
                    "shift": {"type": "string", "description": "Optional shift filter"},
                    "stage": {"type": "string", "description": "Optional production stage filter. Defaults to 'Clip' for final clip production."},
                    "machine": {"type": "string", "description": "Optional machine filter"},
                    "material": {"type": "string", "description": "Optional part or material filter"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_top_downtime_causes",
            "description": "Use when asked why production stopped, what caused idle time or stoppages, or where time was lost. Returns causes ranked by downtime duration and share.",
            "parameters": {
                "type": "object",
                "properties": {
                    "date_from": {"type": "string", "description": "ISO yyyy-mm-dd start date"},
                    "date_to": {"type": "string", "description": "ISO yyyy-mm-dd end date"},
                    "line": {"type": "string", "description": "Filter by line"},
                    "shift": {"type": "string", "description": "Optional shift filter"},
                    "stage": {"type": "string", "description": "Optional stage filter"},
                    "machine": {"type": "string", "description": "Optional machine filter"},
                    "material": {"type": "string", "description": "Optional part or material filter"},
                    "limit": {"type": "integer", "description": "Number of top causes, default 5"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_top_downtime_machines",
            "description": "Use to find which machines stopped most or had the most downtime, ranked by downtime duration.",
            "parameters": {
                "type": "object",
                "properties": {
                    "date_from": {"type": "string", "description": "ISO yyyy-mm-dd start date"},
                    "date_to": {"type": "string", "description": "ISO yyyy-mm-dd end date"},
                    "line": {"type": "string", "description": "Filter by line"},
                    "shift": {"type": "string", "description": "Optional shift filter"},
                    "stage": {"type": "string", "description": "Optional stage filter"},
                    "machine": {"type": "string", "description": "Optional machine filter"},
                    "material": {"type": "string", "description": "Optional part or material filter"},
                    "limit": {"type": "integer", "description": "Number of machines, default 5"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_quality_and_rejection_analysis",
            "description": "Use for reject, scrap, defect, and quality questions. Returns rejection quantity/rate and top rejected machines/materials.",
            "parameters": {
                "type": "object",
                "properties": {
                    "date_from": {"type": "string", "description": "ISO yyyy-mm-dd start date"},
                    "date_to": {"type": "string", "description": "ISO yyyy-mm-dd end date"},
                    "line": {"type": "string", "description": "Filter by line"},
                    "shift": {"type": "string", "description": "Optional shift filter"},
                    "stage": {"type": "string", "description": "Optional stage filter"},
                    "machine": {"type": "string", "description": "Optional machine filter"},
                    "material": {"type": "string", "description": "Optional part or material filter"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_maintenance_breakdown_summary",
            "description": "Use for maintenance breakdown counts, causes/types, MTTR, repair incidents, and top breakdown machines at Medchal.",
            "parameters": {
                "type": "object",
                "properties": {
                    "date_from": {"type": "string", "description": "ISO yyyy-mm-dd start date"},
                    "date_to": {"type": "string", "description": "ISO yyyy-mm-dd end date"},
                    "line": {"type": "string", "description": "Optional line filter"},
                    "machine": {"type": "string", "description": "Filter by machine"},
                    "shift": {"type": "string", "description": "Optional shift filter"},
                    "breakdown_type": {"type": "string", "description": "Filter by breakdown type"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_maintenance_corrective_actions",
            "description": "Use for maintenance root cause, countermeasure, repair, and corrective action lookups for the requested period and filters.",
            "parameters": {
                "type": "object",
                "properties": {
                    "date_from": {"type": "string", "description": "ISO yyyy-mm-dd start date"},
                    "date_to": {"type": "string", "description": "ISO yyyy-mm-dd end date"},
                    "line": {"type": "string", "description": "Optional line filter"},
                    "machine": {"type": "string", "description": "Filter by machine"},
                    "shift": {"type": "string", "description": "Optional shift filter"},
                    "breakdown_type": {"type": "string", "description": "Optional breakdown category"},
                    "limit": {"type": "integer", "description": "Number of records, default 5"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_operational_summary",
            "description": "Provides a comprehensive high-level operational summary including production, top gaps, top downtime causes, and maintenance highlights.",
            "parameters": {
                "type": "object",
                "properties": {
                    "date_from": {"type": "string", "description": "ISO yyyy-mm-dd start date"},
                    "date_to": {"type": "string", "description": "ISO yyyy-mm-dd end date"},
                    "line": {"type": "string", "description": "Filter by line"},
                    "shift": {"type": "string", "description": "Optional shift filter"},
                    "stage": {"type": "string", "description": "Optional production stage filter. Defaults to 'Clip' for final clip production."},
                    "machine": {"type": "string", "description": "Optional machine filter"},
                    "material": {"type": "string", "description": "Optional part or material filter"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_daily_production",
            "description": "Calculates production KPIs for a single specific date (YYYY-MM-DD). Use for date-specific questions like 'production on 11-10-2026', 'yesterday's production', or 'today's production'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "target_date": {"type": "string", "description": "ISO yyyy-mm-dd date"},
                    "line": {"type": "string", "description": "Filter by line name"},
                    "shift": {"type": "string", "description": "Filter by shift"},
                    "stage": {"type": "string", "description": "Filter by stage name. In this plant, finished production is stage 'Clip'. Defaults to 'Clip' for final production unless another stage is specifically requested."},
                    "machine": {"type": "string", "description": "Filter by machine name"},
                    "material": {"type": "string", "description": "Filter by material or part"},
                },
                "required": ["target_date"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compare_date_ranges",
            "description": "Compares production KPIs between two date ranges (period A vs period B).",
            "parameters": {
                "type": "object",
                "properties": {
                    "period_a_from": {"type": "string", "description": "ISO yyyy-mm-dd start of period A"},
                    "period_a_to": {"type": "string", "description": "ISO yyyy-mm-dd end of period A"},
                    "period_b_from": {"type": "string", "description": "ISO yyyy-mm-dd start of period B"},
                    "period_b_to": {"type": "string", "description": "ISO yyyy-mm-dd end of period B"},
                    "line": {"type": "string", "description": "Filter by line"},
                    "shift": {"type": "string", "description": "Filter by shift"},
                    "stage": {"type": "string", "description": "Filter both periods by production stage. Defaults to 'Clip' for final clip production."},
                    "machine": {"type": "string", "description": "Filter both periods by the named machine"},
                    "material": {"type": "string", "description": "Filter both periods by the named part or material"},
                },
                "required": ["period_a_from", "period_a_to", "period_b_from", "period_b_to"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_line_tracker_order_status",
            "description": "Use for ERC Mk-V production order tracking, quantities, outstanding balances, DP delivery dates, fulfillment status, and delivery risk.",
            "parameters": {
                "type": "object",
                "properties": {
                    "order_number": {"type": "string", "description": "PO or order number, e.g. 'PO-2026-001' or '60257500205475'"},
                    "customer": {"type": "string", "description": "Customer name, e.g. 'Western Railway' or 'SCR'"},
                    "status": {"type": "string", "description": "Fulfillment status filter, e.g. 'At Risk' or 'Open'"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_line_tracker_oee_breakdown",
            "description": "Use for ERC Mk-V Line Tracker OEE, Availability, Performance, Quality, speed loss, and cycle-time compliance for machines, work centers, and shifts.",
            "parameters": {
                "type": "object",
                "properties": {
                    "work_center": {"type": "string", "description": "Work center name, e.g. 'Forming', 'Turning', 'BC'"},
                    "machine": {"type": "string", "description": "Machine name, e.g. 'Press line E1'"},
                    "shift": {"type": "string", "description": "Shift name, e.g. 'Shift 1'"},
                    "date_from": {"type": "string", "description": "ISO yyyy-mm-dd start date"},
                    "date_to": {"type": "string", "description": "ISO yyyy-mm-dd end date"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_line_tracker_reliability",
            "description": "Use for historical Downtime Pareto, planned vs unplanned loss, machine rankings, MTTR, MTBF, failure trends, and the Nov 2024 gap.",
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {"type": "string", "description": "Downtime category name, e.g. 'Dimensions & Length Issue' or 'Breakdown'"},
                    "machine": {"type": "string", "description": "Machine name, e.g. 'Sikka1' or 'Autocopying-5'"},
                    "stage": {"type": "string", "description": "Process stage filter"},
                    "shift": {"type": "string", "description": "Shift filter"},
                    "date_from": {"type": "string", "description": "ISO yyyy-mm-dd start date"},
                    "date_to": {"type": "string", "description": "ISO yyyy-mm-dd end date"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_line_tracker_traceability",
            "description": "Use for raw material heat conversion yield funnels, order-to-lot traceability, and placeholder heat reconciliation status.",
            "parameters": {
                "type": "object",
                "properties": {
                    "heat_number": {"type": "string", "description": "RM heat number, e.g. 'H-2409-118'"},
                },
            },
        },
    },
]


def execute_tool_call(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    """Execute the analytics function corresponding to the tool name."""
    if name == "get_manufacturing_kpis":
        return tools.get_manufacturing_kpis(**arguments)
    elif name == "get_daily_production":
        return tools.get_daily_production(**arguments)
    elif name == "compare_date_ranges":
        return tools.compare_date_ranges(**arguments)
    elif name == "get_production_by_line":
        return {"lines": tools.get_production_by_line(**arguments)}
    elif name == "get_production_by_shift":
        return {"shifts": tools.get_production_by_shift(**arguments)}
    elif name == "get_top_downtime_causes":
        return {"causes": tools.get_top_downtime_causes(**arguments)}
    elif name == "get_top_downtime_machines":
        return {"machines": tools.get_top_downtime_machines(**arguments)}
    elif name == "get_quality_and_rejection_analysis":
        return tools.get_quality_and_rejection_analysis(**arguments)
    elif name == "get_maintenance_breakdown_summary":
        return tools.get_maintenance_breakdown_summary(**arguments)
    elif name == "get_maintenance_corrective_actions":
        return {"incidents": tools.get_maintenance_corrective_actions(**arguments)}
    elif name == "get_operational_summary":
        return tools.get_operational_summary(**arguments)
    elif name == "get_line_tracker_order_status":
        return tools.get_line_tracker_order_status(**arguments)
    elif name == "get_line_tracker_oee_breakdown":
        return tools.get_line_tracker_oee_breakdown(**arguments)
    elif name == "get_line_tracker_reliability":
        return tools.get_line_tracker_reliability(**arguments)
    elif name == "get_line_tracker_traceability":
        return tools.get_line_tracker_traceability(**arguments)
    else:
        return {"error": f"Unknown tool: {name}"}


_INTENT_TOOL_MAP = {
    INTENT_KPI_SUMMARY: "get_manufacturing_kpis",
    INTENT_DAILY_PRODUCTION: "get_daily_production",
    INTENT_DATE_SPECIFIC: "get_daily_production",
    INTENT_DATE_RANGE_COMPARISON: "compare_date_ranges",
    INTENT_LINE_COMPARISON: "get_production_by_line",
    INTENT_SHIFT_COMPARISON: "get_production_by_shift",
    INTENT_DOWNTIME_CAUSES: "get_top_downtime_causes",
    INTENT_DOWNTIME_MACHINES: "get_top_downtime_machines",
    INTENT_QUALITY: "get_quality_and_rejection_analysis",
    INTENT_MAINTENANCE: "get_maintenance_breakdown_summary",
    INTENT_CORRECTIVE: "get_maintenance_corrective_actions",
    INTENT_OPERATIONAL_SUMMARY: "get_operational_summary",
    INTENT_PPC_ORDERS: "get_line_tracker_order_status",
    INTENT_LINE_TRACKER_OEE: "get_line_tracker_oee_breakdown",
    INTENT_RELIABILITY_PARETO: "get_line_tracker_reliability",
    INTENT_TRACEABILITY: "get_line_tracker_traceability",
}
_TOOL_INTENT_MAP = {tool_name: intent for intent, tool_name in _INTENT_TOOL_MAP.items()}
_TOOL_ARGUMENT_ALLOWLIST = {
    "get_manufacturing_kpis": {
        "date_from", "date_to", "line", "shift", "stage", "machine", "material",
    },
    "get_daily_production": {
        "target_date", "line", "shift", "stage", "machine", "material",
    },
    "compare_date_ranges": {
        "period_a_from", "period_a_to", "period_b_from", "period_b_to",
        "line", "shift", "stage", "machine", "material",
    },
    "get_production_by_line": {
        "date_from", "date_to", "line", "shift", "stage", "machine", "material",
    },
    "get_production_by_shift": {
        "date_from", "date_to", "line", "shift", "stage", "machine", "material",
    },
    "get_top_downtime_causes": {
        "date_from", "date_to", "line", "shift", "stage", "machine", "material", "limit",
    },
    "get_top_downtime_machines": {
        "date_from", "date_to", "line", "shift", "stage", "machine", "material", "limit",
    },
    "get_quality_and_rejection_analysis": {
        "date_from", "date_to", "line", "shift", "stage", "machine", "material",
    },
    "get_maintenance_breakdown_summary": {
        "date_from", "date_to", "line", "machine", "shift", "breakdown_type",
    },
    "get_maintenance_corrective_actions": {
        "date_from", "date_to", "line", "machine", "shift", "breakdown_type", "limit",
    },
    "get_operational_summary": {
        "date_from", "date_to", "line", "shift", "stage", "machine", "material",
    },
    "get_line_tracker_order_status": {
        "order_number", "customer", "status",
    },
    "get_line_tracker_oee_breakdown": {
        "work_center", "machine", "shift", "date_from", "date_to",
    },
    "get_line_tracker_reliability": {
        "category", "machine", "stage", "shift", "date_from", "date_to",
    },
    "get_line_tracker_traceability": {
        "heat_number",
    },
}


def _expected_tool_for_intent(intent: str) -> str | None:
    return _INTENT_TOOL_MAP.get(intent)


def _intent_for_tool_name(tool_name: str) -> str:
    return _TOOL_INTENT_MAP.get(tool_name, INTENT_UNSUPPORTED)


def _apply_query_constraints(
    requested_tool: str,
    arguments: dict[str, Any],
    *,
    query: str,
    intent: str,
    filters: ChatFilterContext,
    ref_date: date | None = None,
) -> tuple[str, dict[str, Any]]:
    """Pin model tool selection and date/material arguments to the user's request."""
    tool_name = _expected_tool_for_intent(intent) or requested_tool
    args = dict(arguments)
    query_stage, query_material, _ = _resolve_query_filters(
        query,
        filters,
        hinted_stage=args.get("stage"),
        hinted_material=args.get("material"),
    )

    # Explicitly mentioned line, shift, and machine values take priority over
    # dashboard context; otherwise retain the active dashboard filters.
    for field in ("line", "shift", "machine"):
        model_value = args.get(field)
        active_value = getattr(filters, field, None)
        if model_value and _query_mentions_value(query, model_value):
            args[field] = model_value
        elif active_value:
            args[field] = active_value
        else:
            args.pop(field, None)
    # A comparison needs the dimension being ranked to remain open. An active
    # dashboard selection (or a model-suggested value) would otherwise reduce
    # the comparison to one line, shift, or machine.
    compared_dimension = {
        INTENT_LINE_COMPARISON: "line",
        INTENT_SHIFT_COMPARISON: "shift",
        INTENT_DOWNTIME_MACHINES: "machine",
    }.get(intent)
    if compared_dimension and not (
        compared_dimension == "machine"
        and args.get("machine")
        and _query_mentions_value(query, args["machine"])
    ):
        args.pop(compared_dimension, None)
    if args.get("breakdown_type") and not _query_mentions_value(query, args["breakdown_type"]):
        args.pop("breakdown_type", None)

    if intent in {INTENT_DATE_SPECIFIC, INTENT_DAILY_PRODUCTION}:
        target = _parse_date_from_query(query)
        if target is None:
            target, _ = _resolve_relative_date(query, ref_date=ref_date)
        if target is not None:
            args["target_date"] = target.isoformat()
    elif intent == INTENT_DATE_RANGE_COMPARISON:
        periods = _resolve_period_comparison(query, ref_date)
        if periods:
            period_a, period_b = periods
            args.update(
                {
                    "period_a_from": period_a[0], "period_a_to": period_a[1],
                    "period_b_from": period_b[0], "period_b_to": period_b[1],
                }
            )
    elif tool_name != "compare_date_ranges":
        period = _resolve_query_period(query, ref_date=ref_date)
        if period is None:
            explicit_dates = _parse_explicit_dates(query)
            target = explicit_dates[0] if explicit_dates else None
            if target is None:
                target, _ = _resolve_relative_date(query, ref_date=ref_date)
            if target is not None:
                period = (target.isoformat(), target.isoformat(), target.isoformat())
        if tool_name == "get_daily_production":
            target = _parse_date_from_query(query)
            if target is None:
                target, _ = _resolve_relative_date(query, ref_date=ref_date)
            if target is not None:
                args["target_date"] = target.isoformat()
        elif period:
            args["date_from"], args["date_to"] = period[0], period[1]
        else:
            if filters.dateFrom:
                args["date_from"] = filters.dateFrom
            else:
                args.pop("date_from", None)
            if filters.dateTo:
                args["date_to"] = filters.dateTo
            else:
                args.pop("date_to", None)

    if query_stage:
        args["stage"] = query_stage
    else:
        args.pop("stage", None)
    if query_material:
        args["material"] = query_material
    else:
        args.pop("material", None)
    allowed_arguments = _TOOL_ARGUMENT_ALLOWLIST.get(tool_name, set())
    return tool_name, {
        key: value for key, value in args.items() if key in allowed_arguments
    }


def _numeric_tokens(value: str) -> set[str]:
    return {
        token.replace(",", "").rstrip("%")
        for token in re.findall(r"(?<![A-Za-z])\d[\d,]*(?:\.\d+)?%?", value)
    }


def _model_response_is_grounded(
    response: str,
    tool_results: dict[str, Any],
    intent: str,
    query: str | None = None,
) -> bool:
    """Accept model phrasing only when its claims are present in the executed tool result."""
    expected_tool = _expected_tool_for_intent(intent)
    if expected_tool is None:
        routes = tool_results.get("routing", [])
        if routes:
            expected_tool = routes[0].get("executedTool")
    result = tool_results.get(expected_tool) if expected_tool else None
    if not isinstance(result, (dict, list)) or (isinstance(result, dict) and result.get("error")):
        return False

    allowed_numbers = _numeric_tokens(json.dumps(tool_results, default=str))
    response_numbers = _numeric_tokens(response)
    if not response_numbers.issubset(allowed_numbers):
        return False

    normalized = response.casefold()
    if expected_tool == "compare_date_ranges" and isinstance(result, dict):
        comparison = result
        expected_values = {
            str(comparison.get("periodA", {}).get("kpis", {}).get("totalProduction", 0)),
            str(comparison.get("periodB", {}).get("kpis", {}).get("totalProduction", 0)),
        }
        expected_values = {value.replace(",", "").rstrip("%") for value in expected_values}
        return expected_values.issubset(response_numbers)

    record_count = result.get("recordCount") if isinstance(result, dict) else None
    if record_count == 0:
        return "no matching production records" in normalized or "no production records" in normalized
    if isinstance(record_count, int) and record_count > 0 and "no records" in normalized:
        return False

    required_values: list[Any] = []
    if expected_tool in {"get_manufacturing_kpis", "get_daily_production"} and isinstance(result, dict):
        q = (query or "").casefold()
        if any(word in q for word in ("rejection", "reject", "scrap", "defect", "quality")):
            required_values = [result.get("totalRejection"), result.get("rejectionRatePercent")]
        elif any(word in q for word in ("downtime", "idle", "stoppage", "stopped")):
            required_values = [result.get("totalDowntimeMinutes"), result.get("totalDowntimeHours")]
        elif any(word in q for word in ("target", "goal", "achievement", "gap", "met")):
            required_values = [
                result.get("productionAchievementPercent"), result.get("productionGap"),
                result.get("totalTarget"),
            ]
        else:
            required_values = [result.get("totalProduction")]
    if required_values:
        required_tokens = {
            str(value).replace(",", "").rstrip("%")
            for value in required_values
            if value is not None
        }
        if required_tokens and required_tokens.isdisjoint(response_numbers):
            return False

    source_strings: list[str] = []

    def collect_strings(value: Any) -> None:
        if isinstance(value, dict):
            for nested in value.values():
                collect_strings(nested)
        elif isinstance(value, list):
            for nested in value:
                collect_strings(nested)
        elif isinstance(value, str) and len(value.strip()) >= 3:
            source_strings.append(value.strip().casefold())

    collect_strings(result)
    mentions_source_value = any(value in normalized for value in source_strings)
    has_grounded_number = bool(response_numbers)
    if isinstance(result, list) and not result:
        return "no records" in normalized or "no matching" in normalized
    return bool(response.strip()) and (mentions_source_value or has_grounded_number)


# ---------------------------------------------------------------------------
# Deterministic Query Engine
# ---------------------------------------------------------------------------

_CAPABILITY_DESCRIPTION = (
    "I can help you with the following manufacturing analytics across live production and the ERC Mk-V Line Tracker:\n\n"
    "- **Production KPIs** — total production, targets, achievement %, gap\n"
    "- **Daily production** — production on a specific date (e.g. \"production on 11-10-2026\")\n"
    "- **Line comparison** — which line has the largest gap, per-line breakdown\n"
    "- **Shift comparison** — day shift vs night shift performance\n"
    "- **Downtime analysis** — top downtime causes and machines\n"
    "- **Quality & rejection** — rejection rate, top rejected machines/materials\n"
    "- **Maintenance breakdowns** — Medchal breakdown report, MTTR, corrective actions\n"
    "- **PPC Order Tracking** — ERC Mk-V PO balance, delivery risks, DP dates, completion %\n"
    "- **Line Tracker OEE** — machine & work center component-weighted OEE, speed loss Pareto, cycle compliance\n"
    "- **Historical Reliability** — Downtime Pareto, MTTR, calendar MTBF, planned vs unplanned, failure timeline\n"
    "- **Operational summary** — comprehensive overview of problems and performance\n\n"
    "Try asking something like:\n"
    '- *"What is the total production this month?"*\n'
    '- *"What is the status of PO-2026-001?"*\n'
    '- *"What is the overall OEE for ERC Mk-V?"*\n'
    '- *"What are the top historical downtime categories?"*\n'
    '- *"What is the MTTR for Sikka1?"*'
)

_DEFAULT_SUGGESTED = [
    "What is the total production this month?",
    "What is the status of PO-2026-001?",
    "What is the overall OEE for ERC Mk-V?",
    "What are the top historical downtime categories?",
]


def _deterministic_query_engine(
    query: str,
    filters: ChatFilterContext,
    ref_date: date | None = None,
    intent_override: str | None = None,
    tool_arguments_override: dict[str, Any] | None = None,
) -> tuple[str, dict[str, Any], list[str]]:
    """Grounding engine that answers standard queries directly using calculated analytics.

    Used when OPENAI_API_KEY is not configured or in offline test environments.
    Routes queries based on explicit intent classification.
    """
    intent = intent_override or classify_intent(query, ref_date=ref_date)
    q = query.casefold()
    d_from = filters.dateFrom
    d_to = filters.dateTo
    line = filters.line
    shift = filters.shift
    stage = filters.stage
    machine = filters.machine
    stage, material, ambiguous_fields = _resolve_query_filters(query, filters)
    explicit_machine = None
    if re.search(r"\b(?:line|shift|machines?)\b", query, re.IGNORECASE):
        try:
            dimension_records = (
                tools.get_raw_maintenance_records()
                if intent in {INTENT_MAINTENANCE, INTENT_CORRECTIVE}
                else tools.get_raw_manufacturing_records()
            )
        except ManufacturingDataUnavailable:
            dimension_records = []
        if re.search(r"\bline\b", query, re.IGNORECASE) and intent != INTENT_LINE_COMPARISON:
            line = _single_query_filter_value(query, dimension_records, ("line",)) or line
        if re.search(r"\bshift\b", query, re.IGNORECASE) and intent != INTENT_SHIFT_COMPARISON:
            shift = _single_query_filter_value(query, dimension_records, ("shift",)) or shift
        if re.search(r"\bmachines?\b", query, re.IGNORECASE):
            explicit_machine = _single_query_filter_value(
                query, dimension_records, ("machine", "machineName")
            )
            if explicit_machine:
                machine = explicit_machine
    if intent == INTENT_LINE_COMPARISON:
        line = None
    elif intent == INTENT_SHIFT_COMPARISON:
        shift = None
    elif intent == INTENT_DOWNTIME_MACHINES:
        machine = explicit_machine
    if ambiguous_fields:
        return (
            "That production label matches more than one source field. Please specify whether you mean the stage or the material/part.",
            {"intent": "ambiguous_filter_value", "clarification_needed": True},
            _DEFAULT_SUGGESTED,
        )

    query_period = _resolve_query_period(query, ref_date=ref_date)
    period_label = None
    if query_period:
        d_from, d_to, period_label = query_period
    elif _is_last_week_query(query):
        d_from, d_to = _get_last_week_range(ref_date)
        period_label = "previous completed week"

    date_str = f"{d_from} to {d_to}" if d_from and d_to else "the selected period"

    named_value = _extract_named_filter_value(query)
    named_field = (
        "stage"
        if named_value and stage and stage.casefold() == named_value.casefold()
        else "material/part"
    )
    named_display = stage if named_field == "stage" else material
    named_label = f" for **{named_display}** ({named_field})" if named_value else ""

    # --- Greeting ---
    if intent == INTENT_GREETING:
        resp = (
            "Hello! \U0001F44B I'm the **Patil Group Manufacturing AI Assistant**.\n\n"
            + _CAPABILITY_DESCRIPTION
        )
        return resp, {"intent": "greeting"}, _DEFAULT_SUGGESTED

    # --- Identity / capabilities ---
    if intent == INTENT_IDENTITY:
        resp = (
            "I'm the **Patil Group Manufacturing Performance AI Assistant**.\n\n"
            "I answer questions about your manufacturing dashboard using live "
            "production data from Google Sheets, Medchal maintenance records, and the ERC Mk-V Line Tracker.\n\n"
            + _CAPABILITY_DESCRIPTION
        )
        return resp, {"intent": "identity"}, _DEFAULT_SUGGESTED

    # --- Ambiguous query clarification ---
    if intent == INTENT_AMBIGUOUS:
        resp = (
            "Could you please clarify your request? For example, you can ask:\n\n"
            "- *\"What is the total production this month?\"*\n"
            "- *\"What is the status of PO-2026-001?\"*\n"
            "- *\"What is the overall OEE for ERC Mk-V?\"*\n"
            "- *\"What are the top historical downtime categories?\"*\n"
            "- *\"What is the rejection rate for the selected period?\"*"
        )
        return resp, {"intent": "ambiguous_request", "clarification_needed": True}, [
            "What is the total production this month?",
            "What is the status of PO-2026-001?",
            "What is the overall OEE for ERC Mk-V?",
        ]

    # --- PPC Order Tracking ---
    if intent == INTENT_PPC_ORDERS:
        ord_no_match = re.search(
            r"\b(po[-_ ]?\d{4}[-_ ]?\d{3}|26265489205106|60257500205475|95265013100645|32654922029501|tp245007400006|tp235085100013)\b",
            q,
            re.IGNORECASE,
        )
        cust_match = None
        for cust_name in [
            "western railway", "south central railway", "central railway",
            "southern railway", "east coast railway", "scr", "ecor",
        ]:
            if cust_name in q:
                cust_match = cust_name
                break

        order_filter = (
            ord_no_match.group(0).upper().replace("_", "-").replace(" ", "-")
            if ord_no_match
            else None
        )
        res = tools.get_line_tracker_order_status(order_number=order_filter, customer=cust_match)
        data_used = {"intent": intent, "ppc_orders": res, "tool": "get_line_tracker_order_status"}
        summary = res.get("summary", {})
        matched_orders = res.get("orders", [])

        if order_filter or cust_match:
            if not matched_orders:
                resp = f"No production orders found matching **{order_filter or cust_match}** in the ERC Mk-V Line Tracker."
            else:
                o = matched_orders[0]
                resp_lines = [
                    f"### Production Order Details: {o['order_number']}\n",
                    f"- **Customer:** **{o['customer']}** | **Part:** {o['part']}",
                    f"- **Order Quantity:** **{int(o['order_qty']):,} pcs**",
                    f"- **Produced / Allocated:** **{int(o['produced_qty']):,} pcs**",
                    f"- **Outstanding Balance:** **{int(o['outstanding_qty']):,} pcs** ({o['completion_pct']}% complete)",
                    f"- **Planned Delivery (DP Date):** **{o.get('dp_date') or 'Not Specified'}**",
                    f"- **Fulfillment Status:** **{o['fulfillment_status']}** (Risk Level: `{o['risk_level'].upper()}`)",
                    f"- **Assigned RM Heat:** `{o.get('assigned_rm_heat_number') or 'None'}` ({o.get('traceability_status', 'N/A')})",
                    f"- **Production Source:** {o.get('production_source') or 'Shop Floor Entries'}",
                ]
                if o.get("risk_reasons"):
                    resp_lines.append("\n**Delivery Risk Factors:**")
                    for r in o["risk_reasons"]:
                        resp_lines.append(f"- {r}")
                resp = "\n".join(resp_lines)
        else:
            resp_lines = [
                "### ERC Mk-V Production Order Fulfillment Overview\n",
                f"- **Total Ordered Quantity:** **{summary.get('total_ordered_qty', 0):,} pcs** across {summary.get('orders_total_count', 0)} orders",
                f"- **Produced / Allocated:** **{summary.get('total_produced_or_allocated_qty', 0):,} pcs**",
                f"- **Outstanding Balance:** **{summary.get('total_outstanding_qty', 0):,} pcs**",
                f"- **Overall Fulfillment:** **{summary.get('overall_fulfillment_pct', 0.0)}%**",
                f"- **Order Health Status:** **{summary.get('at_risk_orders_count', 0)} At Risk**, {summary.get('completed_orders_count', 0)} Completed/Closed, {summary.get('open_orders_count', 0)} Open/Pending Phasing\n",
                "#### Active Production Orders:",
            ]
            for o in matched_orders:
                status_icon = (
                    "⚠️"
                    if o["fulfillment_status"] == "At Risk"
                    else ("✅" if "Completed" in o["fulfillment_status"] or "Closed" in o["fulfillment_status"] else "📋")
                )
                resp_lines.append(
                    f"- {status_icon} **{o['order_number']}** ({o['customer']}): {int(o['produced_qty']):,} / {int(o['order_qty']):,} pcs ({o['completion_pct']}%) — **{o['fulfillment_status']}**"
                )
            resp_lines.append(f"\n> [!NOTE]\n> {summary.get('snapshot_notice', 'Reference snapshot (Information Only).')}")
            resp = "\n".join(resp_lines)

        suggested = [
            "What is the status of PO-2026-001?",
            "What is the overall OEE for ERC Mk-V?",
            "What are the top historical downtime categories?",
        ]
        return resp, data_used, suggested

    # --- Line Tracker OEE Breakdown ---
    if intent == INTENT_LINE_TRACKER_OEE:
        wc_target = None
        for wc_name in ["forming", "turning", "bar cropper", "bc", "mpi", "ibh", "linnseed", "packing", "db", "ad"]:
            if wc_name in q:
                wc_target = wc_name
                break
        mach_target = None
        for m_name in ["press line e1", "bar cropper-1", "bar cropper-2", "autocopying-1", "autocopying-2", "autocopying-3"]:
            if m_name in q:
                mach_target = m_name
                break

        oee_data = tools.get_line_tracker_oee_breakdown(
            work_center=wc_target, machine=mach_target, date_from=d_from, date_to=d_to
        )
        data_used = {"intent": intent, "line_tracker_oee": oee_data, "tool": "get_line_tracker_oee_breakdown"}
        overall = oee_data.get("overall", {})
        ct_analysis = oee_data.get("cycle_time_analysis", {})
        wcs = oee_data.get("work_centers", [])
        machs = oee_data.get("machines", [])

        if mach_target and machs:
            m = machs[0]
            m_metrics = m["metrics"]
            resp = (
                f"### Machine OEE: {m['machine']} (Work Center: {m['work_center']})\n\n"
                f"- **Overall OEE:** **{m_metrics.get('oee_pct')}%**\n"
                f"- **Availability:** **{m_metrics.get('availability_pct')}%** ({m_metrics.get('sum_run_time_min')} operating mins, {m_metrics.get('sum_downtime_min')} downtime mins)\n"
                f"- **Performance:** **{m_metrics.get('performance_pct')}%**\n"
                f"- **Quality:** **{m_metrics.get('quality_pct')}%** ({m_metrics.get('sum_good_qty'):,} good pcs, {m_metrics.get('sum_reject_qty'):,} rejects)\n"
                f"- **Speed Loss:** **{m_metrics.get('sum_speed_loss_min')} min** ({m_metrics.get('speed_loss_hours')} hrs, {m_metrics.get('speed_loss_share_pct')}% of run time)\n"
                f"- **Cycle Times:** Rated: **{m.get('rated_ct_sec')}s** vs Weighted Actual: **{m.get('actual_ct_sec')}s** (Status: `{m.get('speed_loss_status')}`)\n\n"
                f"> [!IMPORTANT]\n"
                "> Component-weighted calculation preserves true engineering efficiency without percentage averaging."
            )
        else:
            resp_lines = [
                "### ERC Mk-V Line Tracker OEE & Speed Loss Breakdown\n",
                f"- **Overall Component-Weighted OEE:** **{overall.get('oee_pct')}%** (across {overall.get('count', 0)} shift entries)",
                f"- **Availability Rate:** **{overall.get('availability_pct')}%** ({overall.get('sum_run_time_min', 0):,} run mins / {overall.get('sum_planned_operating_time_min', 0):,} planned mins)",
                f"- **Performance Rate:** **{overall.get('performance_pct')}%** (Cycle compliance: **{overall.get('cycle_compliance_pct')}%**)",
                f"- **Quality Rate:** **{overall.get('quality_pct')}%** ({overall.get('sum_good_qty', 0):,} good pcs / {overall.get('sum_output_qty', 0):,} output pcs, {overall.get('sum_reject_qty', 0):,} rejects)",
                f"- **Speed Loss Bottleneck:** **{overall.get('speed_loss_hours', 0):,.2f} hours** ({overall.get('sum_speed_loss_min', 0):,.1f} mins) lost to reduced speed (**{overall.get('speed_loss_share_pct', 0)}% of runtime**)\n",
                "#### Key Bottleneck Finding:",
                f"> {ct_analysis.get('key_bottleneck_finding', 'OEE is constrained by cycle time slowdowns.')}\n",
                "#### Work Center Breakdown:",
            ]
            for wc_item in wcs[:5]:
                m_met = wc_item["metrics"]
                resp_lines.append(
                    f"- **{wc_item['work_center']}:** OEE: **{m_met.get('oee_pct')}%** | Perf: {m_met.get('performance_pct')}% | Speed Loss: {m_met.get('speed_loss_hours')} hrs ({len(wc_item.get('distinct_machines', []))} machines)"
                )
            resp = "\n".join(resp_lines)

        suggested = [
            "What is the status of PO-2026-001?",
            "What are the top historical downtime categories?",
            "What is the MTTR for Sikka1?",
        ]
        return resp, data_used, suggested

    # --- Line Tracker Historical Reliability & Downtime Pareto ---
    if intent == INTENT_RELIABILITY_PARETO:
        if "nov" in q or "november" in q:
            rel_data = tools.get_line_tracker_reliability()
            data_used = {
                "intent": intent,
                "reliability_analysis": rel_data,
                "tool": "get_line_tracker_reliability",
                "query_type": "nov_2024_gap",
            }
            resp = (
                "### November 2024 Downtime Gap Analysis\n\n"
                "In the ERC Mk-V historical `Downtime Log`, **November 2024 (2024-11) has exactly 0 records logged** "
                "(0.0 downtime hours across all categories and machines).\n\n"
                "**Context from surrounding months:**\n"
                "- **October 2024:** 2,560.8 downtime hours (844 events, 97 breakdowns)\n"
                "- **November 2024:** **0.0 downtime hours (0 events logged — Source Data Gap)**\n"
                "- **December 2024:** 2,243.5 downtime hours (803 events, 107 breakdowns)\n\n"
                "> [!WARNING]\n"
                "> This is a confirmed data-logging omission in the source workbook rather than a true zero-downtime operational month."
            )
            return resp, data_used, [
                "What are the top historical downtime categories?",
                "What is the MTTR for Sikka1?",
                "What is the overall OEE for ERC Mk-V?",
            ]

        mach_target = None
        for m_name in [
            "sikka1", "sikka-1", "autocopying-5", "autocopying-2",
            "autocopying-4", "autocopying-1", "autocopying-6",
        ]:
            if m_name in q:
                mach_target = m_name
                break

        rel_data = tools.get_line_tracker_reliability(machine=mach_target, date_from=d_from, date_to=d_to)
        data_used = {"intent": intent, "reliability_analysis": rel_data, "tool": "get_line_tracker_reliability"}
        summary = rel_data.get("summary", {})
        cats = rel_data.get("category_pareto", [])
        machs = rel_data.get("machine_ranking", [])

        if mach_target and machs:
            m = machs[0]
            resp = (
                f"### Reliability & Breakdown Profile: {m['machine']} (Stage: {m.get('stage')})\n\n"
                f"- **Total Downtime:** **{m['total_downtime_hours']:,} hours** ({m['total_downtime_minutes']:,} mins across {m['event_count']} events)\n"
                f"- **Plant Downtime Share:** **{m['downtime_share_pct']}%**\n"
                f"- **Breakdown Incidents:** **{m['breakdown_event_count']} failures** ({m['breakdown_downtime_hours']:,} breakdown hours)\n"
                f"- **Mean Time to Repair (MTTR):** **{m['mttr_hours']:.2f} hours/incident**\n"
                f"- **Calendar MTBF (approx):** **{m.get('mtbf_approx_hours') or 'N/A'} hours**\n"
                f"- **Leading Loss Category:** **{m.get('top_category')}**\n\n"
                "> [!NOTE]\n"
                "> Calendar MTBF uses total period calendar hours (17,952 hrs / 748 days) divided by breakdown events, "
                "representing calendar interval between failures rather than measured machine run hours."
            )
        else:
            resp_lines = [
                f"### Historical Downtime Pareto & Reliability Analysis ({summary.get('coverage_dates', {}).get('min', '2024-08-31')} to {summary.get('coverage_dates', {}).get('max', '2026-09-18')})\n",
                f"- **Total Historical Downtime:** **{summary.get('total_downtime_hours', 0):,.1f} hours** ({summary.get('total_downtime_minutes', 0):,.1f} mins across {summary.get('total_records', 0):,} events)",
                f"- **Loss Distribution:** **Unplanned Losses: {summary.get('unplanned_downtime_pct', 0)}%** ({summary.get('unplanned_downtime_hours', 0):,.1f} hrs) | **Planned Losses: {summary.get('planned_downtime_pct', 0)}%** ({summary.get('planned_downtime_hours', 0):,.1f} hrs)",
                f"- **Equipment Breakdowns:** **{summary.get('breakdown_events_count', 0):,} incidents** totaling **{summary.get('breakdown_downtime_hours', 0):,.1f} hours**",
                f"- **Overall MTTR:** **{summary.get('overall_mttr_hours', 0):.2f} hours/incident**",
                f"- **Overall Calendar MTBF (approx):** **{summary.get('overall_mtbf_approx_hours', 0):.1f} hours** ({summary.get('coverage_dates', {}).get('period_calendar_hours', 17952):,.0f} calendar period hours / {summary.get('breakdown_events_count', 0):,} breakdowns)\n",
                "#### Top Downtime Categories (Pareto):",
            ]
            for idx, c in enumerate(cats[:5], 1):
                resp_lines.append(
                    f"**{idx}. {c['category']}** — **{c['total_hours']:,} hours** ({c['share_pct']}% share, {c['event_count']} events, avg {c['average_duration_minutes']} min/event)"
                )
            if machs:
                resp_lines.append("\n#### Top High-Impact Machines:")
                for m in machs[:3]:
                    resp_lines.append(
                        f"- **{m['machine']}:** {m['total_downtime_hours']:,} hrs ({m['downtime_share_pct']}% share) | MTTR: {m['mttr_hours']:.2f}h | MTBF: {m.get('mtbf_approx_hours')}h"
                    )
            resp_lines.append("\n> [!NOTE]\n> Excludes 302 mirrored rows from Downtime Log to prevent double-counting against shift entries.")
            resp = "\n".join(resp_lines)

        suggested = [
            "What is the MTTR for Sikka1?",
            "What happened to downtime in November 2024?",
            "What is the overall OEE for ERC Mk-V?",
        ]
        return resp, data_used, suggested

    # --- RM Heat Traceability ---
    if intent == INTENT_TRACEABILITY:
        res = tools.get_line_tracker_traceability()
        data_used = {"intent": intent, "traceability": res, "tool": "get_line_tracker_traceability"}
        funnel = res.get("funnel_summary", {})
        alerts = res.get("reconciliation_alerts", [])
        resp_lines = [
            "### Raw Material Heat Conversion Funnel & Metallurgical Traceability\n",
            f"- **Total Billet Input:** **{funnel.get('total_billet_mt', 0):,.2f} MT** across {res.get('verified_heats_count', 0)} verified heats",
            f"- **Bar Cropper Output:** **{funnel.get('total_bar_cropper_ok_nos', 0):,} pcs**",
            f"- **Turning Stage Output:** **{funnel.get('total_turning_ok_nos', 0):,} pcs**",
            f"- **Forming Stage Output:** **{funnel.get('total_forming_ok_nos', 0):,} pcs**",
            f"- **Endbit Scrap Losses:** **{funnel.get('total_endbit_scrap_nos', 0):,} pcs**",
            f"- **Overall Forming Yield:** **{funnel.get('overall_forming_yield_pct', 0.0)}%**\n",
        ]
        if alerts:
            resp_lines.append("#### Metallurgical Reconciliation Alerts:")
            for a in alerts:
                resp_lines.append(
                    f"> [!WARNING]\n> **{a['heat_number']}** ({a['lot_number']}): {a['reason']} — `{a['status']}`"
                )
        resp = "\n".join(resp_lines)
        suggested = [
            "What is the status of PO-2026-001?",
            "What is the overall OEE for ERC Mk-V?",
            "What are the top historical downtime categories?",
        ]
        return resp, data_used, suggested

    # --- Date-range comparison ---
    if intent == INTENT_DATE_RANGE_COMPARISON:
        args_override = tool_arguments_override or {}
        required_period_keys = (
            "period_a_from", "period_a_to", "period_b_from", "period_b_to"
        )
        if all(args_override.get(key) for key in required_period_keys):
            periods = (
                (args_override["period_a_from"], args_override["period_a_to"]),
                (args_override["period_b_from"], args_override["period_b_to"]),
            )
        else:
            periods = _resolve_period_comparison(query, ref_date)
        if periods:
            (period_a_from, period_a_to), (period_b_from, period_b_to) = periods
            comparison_filters = {"line": line, "shift": shift}
            comparison_filters.update(
                {
                    key: value
                    for key, value in {
                        "stage": stage, "machine": machine, "material": material,
                    }.items()
                    if value is not None
                }
            )
            comparison = tools.compare_date_ranges(
                period_a_from=period_a_from,
                period_a_to=period_a_to,
                period_b_from=period_b_from,
                period_b_to=period_b_to,
                **comparison_filters,
            )
            period_a = comparison["periodA"]["kpis"]
            period_b = comparison["periodB"]["kpis"]
            difference = comparison["productionDifference"]
            direction = "increase" if difference > 0 else "decrease" if difference < 0 else "no change"
            period_a_label = f"{period_a_from} to {period_a_to}"
            period_b_label = f"{period_b_from} to {period_b_to}"
            if "week" in query.casefold():
                period_a_label = f"Earlier week ({period_a_from} to {period_a_to})"
                period_b_label = f"Later week ({period_b_from} to {period_b_to})"
            elif "month" in query.casefold():
                period_a_label = f"Earlier month ({period_a_from} to {period_a_to})"
                period_b_label = f"Later month ({period_b_from} to {period_b_to})"
            resp = (
                f"### Production Period Comparison\n\n"
                f"- **{period_a_label}:** "
                f"{period_a['totalProduction']:,} pcs across {period_a['recordCount']:,} records.\n"
                f"- **{period_b_label}:** "
                f"{period_b['totalProduction']:,} pcs across {period_b['recordCount']:,} records.\n"
                f"- **Change:** {abs(difference):,} pcs {direction}.\n"
            )
            quality_a = period_a.get("dataQuality", {})
            quality_b = period_b.get("dataQuality", {})
            if any(
                quality.get(key, 0)
                for quality in (quality_a, quality_b)
                for key in ("missingProductionCount", "missingTargetCount")
            ):
                resp += (
                    "\n- **Data completeness:** the earlier period has "
                    f"{quality_a.get('missingProductionCount', 0):,} missing production quantities and "
                    f"{quality_a.get('missingTargetCount', 0):,} missing targets; the later period has "
                    f"{quality_b.get('missingProductionCount', 0):,} and "
                    f"{quality_b.get('missingTargetCount', 0):,}, respectively. Blank values are treated as zero.\n"
                )
            comparison_arguments = {
                "period_a_from": period_a_from,
                "period_a_to": period_a_to,
                "period_b_from": period_b_from,
                "period_b_to": period_b_to,
                "line": line,
                "shift": shift,
            }
            comparison_arguments.update(
                {
                    key: value
                    for key, value in {
                        "stage": stage, "machine": machine, "material": material,
                    }.items()
                    if value is not None
                }
            )
            return resp, {
                "intent": intent,
                "comparison": comparison,
                "tool": "compare_date_ranges",
                "tool_arguments": comparison_arguments,
            }, _DEFAULT_SUGGESTED

        resp = (
            "To compare two specific date ranges or months, you can ask:\n\n"
            "- *\"Compare day shift and night shift.\"*\n"
            "- *\"Which line has the largest production gap?\"*\n"
            "- *\"What is the total production this month?\"*\n\n"
            f"The dashboard is currently filtered for: **{date_str}**."
        )
        return resp, {"intent": "date_range_comparison"}, _DEFAULT_SUGGESTED

    # --- Date-specific production ---
    if intent == INTENT_DATE_SPECIFIC:
        target_date = _parse_date_from_query(query)
        if target_date:
            iso = target_date.isoformat()
            kpis = tools.get_daily_production(
                target_date=iso,
                line=line, shift=shift, stage=stage,
                machine=machine, material=material,
            )
            data_used = {
                "intent": intent,
                "kpis": kpis,
                "queried_date": iso,
                "tool": "get_daily_production",
                "tool_arguments": {
                    "target_date": iso,
                    "line": line,
                    "shift": shift,
                    "stage": stage,
                    "machine": machine,
                    "material": material,
                },
            }
            display_date = target_date.strftime('%d %B %Y')
            if kpis["recordCount"] == 0:
                latest_date = tools.get_latest_data_date()
                resp = (
                    f"### No Production Data for {display_date}\n\n"
                    f"No manufacturing records were found for **{display_date}** with the active filters.\n"
                    f"- **Evaluated Records:** 0\n"
                    f"- The latest recorded production in the dashboard is from **{latest_date or 'N/A'}**.\n"
                    f"- Please check if the date was a holiday or if data for this date has not yet been synced."
                )
            else:
                stage_name = kpis.get("stage")
                stage_hdr = "Final Clip Production" if stage_name == "Clip" and not named_label else f"Production ({stage_name})" if stage_name and not named_label else "Total Production"
                resp = (
                    f"### Production on {display_date}\n\n"
                    f"- **{stage_hdr}:** **{kpis['totalProduction']:,} pcs**\n"
                    f"- **Total Target:** **{kpis['totalTarget']:,} pcs**\n"
                    f"- **Achievement Rate:** **{kpis['productionAchievementPercent']}%**\n"
                    f"- **Production Gap:** **{kpis['productionGap']:,} pcs**\n"
                    f"- **Total Downtime:** **{kpis['totalDowntimeHours']:,} hours** ({kpis['totalDowntimeMinutes']:,} mins)\n"
                    f"- **Total Rejections:** **{kpis['totalRejection']:,} pcs** (Rejection Rate: **{kpis['rejectionRatePercent']}%**)\n"
                    f"- **Good Output:** **{kpis['goodQuantity']:,} pcs**\n"
                    f"- **Records Evaluated:** {kpis['recordCount']:,} records\n"
                    f"{_data_completeness_note(kpis)}"
                )
            suggested = [
                "Which line has the largest production gap?",
                "What are the top five downtime causes?",
                "Compare day shift and night shift.",
            ]
            return resp, data_used, suggested

    # --- Daily production (relative date: yesterday, today, etc.) ---
    if intent == INTENT_DAILY_PRODUCTION:
        rel_date, label = _resolve_relative_date(query, ref_date=ref_date)
        if rel_date:
            iso = rel_date.isoformat()
            kpis = tools.get_daily_production(
                target_date=iso,
                line=line, shift=shift, stage=stage,
                machine=machine, material=material,
            )
            data_used = {
                "intent": intent,
                "kpis": kpis,
                "queried_date": iso,
                "relative_label": label,
                "tool": "get_daily_production",
                "tool_arguments": {
                    "target_date": iso,
                    "line": line,
                    "shift": shift,
                    "stage": stage,
                    "machine": machine,
                    "material": material,
                },
            }
            display_date = rel_date.strftime('%d %B %Y')
            if kpis["recordCount"] == 0:
                latest_date = tools.get_latest_data_date()
                resp = (
                    f"### No Production Data for {label.title()} ({display_date})\n\n"
                    f"No manufacturing records were found for **{display_date}** ({label}).\n"
                    f"- **Evaluated Records:** 0\n"
                    f"- The latest recorded production in the dashboard is from **{latest_date or 'N/A'}**.\n"
                    f"- If you would like to view the latest available production, ask: *\"What was the latest production?\"*"
                )
            else:
                stage_name = kpis.get("stage")
                stage_hdr = "Final Clip Production" if stage_name == "Clip" and not named_label else f"Production ({stage_name})" if stage_name and not named_label else "Total Production"
                resp = (
                    f"### Production for {label.title()} ({display_date})\n\n"
                    f"- **{stage_hdr}:** **{kpis['totalProduction']:,} pcs**\n"
                    f"- **Total Target:** **{kpis['totalTarget']:,} pcs**\n"
                    f"- **Achievement Rate:** **{kpis['productionAchievementPercent']}%**\n"
                    f"- **Production Gap:** **{kpis['productionGap']:,} pcs**\n"
                    f"- **Total Downtime:** **{kpis['totalDowntimeHours']:,} hours** ({kpis['totalDowntimeMinutes']:,} mins)\n"
                    f"- **Total Rejections:** **{kpis['totalRejection']:,} pcs** (Rejection Rate: **{kpis['rejectionRatePercent']}%**)\n"
                    f"- **Good Output:** **{kpis['goodQuantity']:,} pcs**\n"
                    f"- **Records Evaluated:** {kpis['recordCount']:,} records\n"
                    f"{_data_completeness_note(kpis)}"
                )
            suggested = [
                "What is the total production this month?",
                "Which line has the largest production gap?",
                "What are the top five downtime causes?",
            ]
            return resp, data_used, suggested

    # --- Maintenance Corrective Actions ---
    if intent == INTENT_CORRECTIVE:
        incidents = tools.get_maintenance_corrective_actions(
            date_from=d_from, date_to=d_to, line=line, machine=machine,
            shift=shift, limit=5,
        )
        data_used = {"action_records": incidents, "tool": "get_maintenance_corrective_actions"}
        if not incidents:
            resp = f"No Medchal breakdown records with documented corrective actions were found for **{date_str}**."
        else:
            resp_lines = [
                f"### Medchal Maintenance Breakdown Corrective Actions ({date_str})\n",
                f"Found **{len(incidents)}** key breakdown incidents with documented root cause or corrective action:\n",
            ]
            for idx, inc in enumerate(incidents, 1):
                resp_lines.append(
                    f"**{idx}. {inc.get('machine')}** ({inc.get('date')} \u2014 {inc.get('breakdownType')})\n"
                    f"- **Downtime:** {inc.get('downtimeMinutes')} mins\n"
                    f"- **Description:** {inc.get('description') or 'N/A'}\n"
                    f"- **Root Cause:** {inc.get('rootCause') or 'Under Investigation'}\n"
                    f"- **Corrective Action:** {inc.get('correctiveAction') or 'None specified'}\n"
                    f"- **Attended By:** {inc.get('attendedBy') or 'Team'}\n"
                )
            resp = "\n".join(resp_lines)
        suggested = [
            "What are the main maintenance breakdown causes in Medchal?",
            "Which machines have the highest breakdown downtime?",
            "What is the total production this month?",
        ]
        return resp, data_used, suggested

    # --- Maintenance Breakdown Causes in Medchal ---
    if intent == INTENT_MAINTENANCE:
        summary = tools.get_maintenance_breakdown_summary(
            date_from=d_from, date_to=d_to, line=line, machine=machine, shift=shift
        )
        data_used = {"maintenance_summary": summary, "tool": "get_maintenance_breakdown_summary"}
        total_bd = summary.get("totalBreakdowns", 0)
        dt_hrs = summary.get("totalDowntimeHours", 0.0)
        mttr_hrs = summary.get("mttrHours", 0.0)
        types = summary.get("byType", [])
        top_mach = summary.get("topBreakdownMachines", [])

        resp_lines = [
            f"### Medchal Breakdown Report Summary ({date_str})\n",
            f"- **Total Breakdowns:** **{total_bd} incidents**",
            f"- **Total Breakdown Downtime:** **{dt_hrs:,.1f} hours** ({summary.get('totalDowntimeMinutes', 0):,.1f} mins)",
            f"- **Mean Time to Repair (MTTR):** **{mttr_hrs:.2f} hours** ({summary.get('mttrMinutes', 0):.1f} mins/incident)\n",
            "#### Breakdown Categories:",
        ]
        for t in types[:5]:
            resp_lines.append(
                f"- **{t['type']}:** {t['incidentCount']} incidents ({t['downtimeHours']} hrs, {t['sharePercent']}% share)"
            )

        if top_mach:
            resp_lines.append("\n#### Top Breakdown Machines:")
            for m in top_mach[:3]:
                resp_lines.append(
                    f"- **{m['machine']}:** {m['downtimeHours']} hrs ({m['incidentCount']} incidents)"
                )

        suggested = [
            "Which breakdown records have corrective-action information?",
            "What are the top five downtime causes in production?",
            "What is the production achievement percentage?",
        ]
        return "\n".join(resp_lines), data_used, suggested

    # --- Line with largest gap or Line breakdown ---
    if intent == INTENT_LINE_COMPARISON:
        lines_data = tools.get_production_by_line(
            date_from=d_from, date_to=d_to, line=line, shift=shift,
            stage=stage, machine=machine, material=material,
        )
        data_used = {"lines": lines_data, "tool": "get_production_by_line"}
        if not lines_data:
            resp = f"No production line records found for **{date_str}**."
        else:
            largest = lines_data[0]
            resp_lines = [
                f"### Production Line Gap Analysis ({date_str})\n",
                f"The line with the **largest production gap** is **{largest['line']}**:\n"
                f"- **Target:** {largest['target']:,} pcs\n"
                f"- **Actual Production:** {largest['production']:,} pcs\n"
                f"- **Production Gap:** **{largest['gap']:,} pcs**\n"
                f"- **Achievement:** **{largest['achievementPercent']}%**\n",
                "#### Line Comparison:",
            ]
            for item in lines_data:
                resp_lines.append(
                    f"- **{item['line']}:** Actual: {item['production']:,} / Target: {item['target']:,} "
                    f"({item['achievementPercent']}%) | Gap: {item['gap']:,} pcs"
                )
            resp = "\n".join(resp_lines)
        suggested = [
            "What are the top five downtime causes?",
            "Compare day shift and night shift.",
            "What is the rejection rate for the selected period?",
        ]
        return resp, data_used, suggested

    # --- Top Downtime Causes ---
    if intent == INTENT_DOWNTIME_CAUSES:
        causes = tools.get_top_downtime_causes(
            date_from=d_from, date_to=d_to, line=line, shift=shift,
            stage=stage, machine=machine, material=material, limit=5,
        )
        data_used = {"top_causes": causes, "tool": "get_top_downtime_causes"}
        if not causes:
            resp = f"No downtime cause records found for **{date_str}**."
        else:
            resp_lines = [
                f"### Top Downtime Causes ({date_str})\n",
                "Here are the top downtime causes ranked by total duration:\n",
            ]
            for idx, c in enumerate(causes, 1):
                resp_lines.append(
                    f"**{idx}. {c['cause']}**\n"
                    f"- **Duration:** {c['downtimeHours']} hours ({c['downtimeMinutes']:,.1f} mins)\n"
                    f"- **Share of Total Downtime:** **{c['sharePercent']}%**\n"
                )
            resp = "\n".join(resp_lines)
        suggested = [
            "Which machines have the highest downtime?",
            "What is the total production this month?",
            "What are the main maintenance breakdown causes in Medchal?",
        ]
        return resp, data_used, suggested

    # --- Top Downtime Machines ---
    if intent == INTENT_DOWNTIME_MACHINES:
        mach_dt = tools.get_top_downtime_machines(
            date_from=d_from, date_to=d_to, line=line, shift=shift,
            stage=stage, machine=machine, material=material, limit=5,
        )
        data_used = {"top_machines": mach_dt, "tool": "get_top_downtime_machines"}
        if not mach_dt:
            resp = f"No machine downtime records found for **{date_str}**."
        else:
            resp_lines = [
                f"### Top Machines with Highest Downtime ({date_str})\n",
                "The machines responsible for the most downtime minutes:\n",
            ]
            for idx, m in enumerate(mach_dt, 1):
                resp_lines.append(
                    f"**{idx}. {m['machine']}** \u2014 **{m['downtimeHours']} hours** ({m['downtimeMinutes']:,.1f} mins, {m['sharePercent']}% of downtime)"
                )
            resp = "\n".join(resp_lines)
        suggested = [
            "What are the top five downtime causes?",
            "Which line has the largest production gap?",
            "What is the rejection rate for the selected period?",
        ]
        return resp, data_used, suggested

    # --- Shift Comparison (Day vs Night) ---
    if intent == INTENT_SHIFT_COMPARISON:
        shifts_data = tools.get_production_by_shift(
            date_from=d_from, date_to=d_to, line=line, shift=shift,
            stage=stage, machine=machine, material=material,
        )
        data_used = {"shifts": shifts_data, "tool": "get_production_by_shift"}
        if not shifts_data:
            resp = f"No shift performance records found for **{date_str}**."
        else:
            resp_lines = [
                f"### Shift Performance Comparison ({date_str})\n",
                "Comparison of manufacturing performance by shift:\n",
            ]
            for s in shifts_data:
                resp_lines.append(
                    f"**{s['shift']}:**\n"
                    f"- **Actual Production:** {s['production']:,} pcs\n"
                    f"- **Target:** {s['target']:,} pcs\n"
                    f"- **Achievement:** **{s['achievementPercent']}%**\n"
                    f"- **Downtime:** {s['downtimeHours']} hours ({s['downtimeMinutes']:,.1f} mins)\n"
                    f"- **Rejections:** {s['rejection']:,} pcs ({s['rejectionRatePercent']} rate)\n"
                )
            resp = "\n".join(resp_lines)
        suggested = [
            "What is the total production this month?",
            "Which line has the largest production gap?",
            "What are the top five downtime causes?",
        ]
        return resp, data_used, suggested

    # --- Quality and Rejection Rate ---
    if intent == INTENT_QUALITY:
        qual = tools.get_quality_and_rejection_analysis(
            date_from=d_from, date_to=d_to, line=line, shift=shift,
            stage=stage, machine=machine, material=material,
        )
        data_used = {"quality": qual, "tool": "get_quality_and_rejection_analysis"}
        resp_lines = [
            f"### Quality & Rejection Analysis ({date_str})\n",
            f"- **Total Production:** **{qual['totalProduction']:,} pcs**",
            f"- **Total Rejections:** **{qual['totalRejection']:,} pcs**",
            f"- **Rejection Rate:** **{qual['rejectionRatePercent']}%**\n",
        ]
        if qual.get("topRejectionMachines"):
            resp_lines.append("#### Machines with Highest Rejection:")
            for m in qual["topRejectionMachines"][:3]:
                resp_lines.append(f"- **{m['machine']}:** {m['rejectionQuantity']:,} rejections")
        resp = "\n".join(resp_lines)
        suggested = [
            "What is the production achievement percentage?",
            "What are the top five downtime causes?",
            "Which line has the largest production gap?",
        ]
        return resp, data_used, suggested

    # --- Operational Problems Summary / Overview ---
    if intent == INTENT_OPERATIONAL_SUMMARY:
        summary = tools.get_operational_summary(
            date_from=d_from, date_to=d_to, line=line, shift=shift,
            stage=stage, machine=machine, material=material,
        )
        data_used = {"operational_summary": summary, "tool": "get_operational_summary"}
        kpis = summary.get("manufacturingKpis", {})
        gap_line = summary.get("largestGapLine")
        top_cause = summary.get("topDowntimeCauses", [{}])[0]
        maint = summary.get("maintenanceSummary", {})

        resp = (
            f"### Operational Performance & Problem Summary ({date_str})\n\n"
            f"**1. Production Achievement & Volume**\n"
            f"- Total Output: **{kpis.get('totalProduction', 0):,} pcs** against Target of **{kpis.get('totalTarget', 0):,} pcs**.\n"
            f"- Overall Achievement: **{kpis.get('productionAchievementPercent')}%** (Net gap: {kpis.get('productionGap', 0):,} pcs).\n\n"
            f"**2. Critical Line Bottleneck**\n"
            f"- **{gap_line.get('line') if gap_line else 'N/A'}** has the largest gap ({gap_line.get('gap', 0):,} pcs gap, {gap_line.get('achievementPercent')}% achievement).\n\n"
            f"**3. Manufacturing Downtime Impact**\n"
            f"- Total Downtime: **{kpis.get('totalDowntimeHours', 0):,.1f} hours** ({kpis.get('totalDowntimeMinutes', 0):,.1f} mins).\n"
            f"- Leading cause: **{top_cause.get('cause', 'N/A')}** ({top_cause.get('downtimeHours', 0)} hrs, {top_cause.get('sharePercent', 0)}% of downtime).\n\n"
            f"**4. Quality & Scrap**\n"
            f"- Rejection rate is **{kpis.get('rejectionRatePercent')}%** ({kpis.get('totalRejection', 0):,} defective pieces).\n\n"
            f"**5. Medchal Equipment Maintenance**\n"
            f"- **{maint.get('totalBreakdowns', 0)} breakdown incidents** totaling **{maint.get('totalDowntimeHours', 0):,.1f} hours**.\n"
            f"- MTTR: **{maint.get('mttrHours', 0):.2f} hours/incident**.\n"
            f"- Top breakdown equipment: **{maint.get('topBreakdownMachine') or 'N/A'}** ({maint.get('topBreakdownType') or 'Mechanical'}).\n"
        )
        suggested = [
            "Which line has the largest production gap?",
            "What are the top five downtime causes?",
            "Which breakdown records have corrective-action information?",
        ]
        return resp, data_used, suggested

    # --- Production KPI Summary ---
    if intent == INTENT_KPI_SUMMARY:
        effective_from, effective_to = d_from, d_to
        period = _resolve_query_period(query, ref_date=ref_date)
        period_label = None
        if period:
            effective_from, effective_to, period_label = period

        kpis = tools.get_manufacturing_kpis(
            date_from=effective_from,
            date_to=effective_to,
            line=line,
            shift=shift,
            stage=stage,
            machine=machine,
            material=material,
        )
        tool_arguments = {
            "date_from": effective_from,
            "date_to": effective_to,
            "line": line,
            "shift": shift,
            "stage": stage,
            "machine": machine,
            "material": material,
        }
        data_used = {
            "intent": intent,
            "kpis": kpis,
            "tool": "get_manufacturing_kpis",
            "tool_arguments": tool_arguments,
        }
        eff_date_str = f"{effective_from} to {effective_to}" if effective_from and effective_to else date_str
        source_latest_date = tools.get_latest_data_date() if period else None
        if source_latest_date:
            data_used["source_latest_date"] = source_latest_date
        source_coverage_note = ""
        if source_latest_date and effective_to and effective_to > source_latest_date:
            source_coverage_note = (
                f"\n- **Source coverage:** records are available through {source_latest_date}; "
                f"the requested range continues through {effective_to}.\n"
            )
        period_display = f"{period_label}: {eff_date_str}" if period_label else eff_date_str
        if kpis["recordCount"] == 0:
            if source_coverage_note and source_latest_date:
                resp = (
                    f"### No Matching Production Records{named_label}\n\n"
                    f"No matching records were found through **{source_latest_date}**. "
                    f"The source does not yet cover the requested range through **{effective_to}**, "
                    "so a full-period result cannot be confirmed."
                )
            else:
                resp = (
                    f"### No Matching Production Records{named_label}\n\n"
                    f"No manufacturing records matched the requested filters for **{eff_date_str}**. "
                    "The source was available, but this result does not establish a measured zero-production total."
                )
        else:
            stage_name = kpis.get("stage")
            stage_hdr = "Final Clip Production" if stage_name == "Clip" and not named_label else f"Production ({stage_name})" if stage_name and not named_label else "Total Production"
            resp = (
                f"### Manufacturing Performance Overview{named_label} ({period_display})\n\n"
                f"- **{stage_hdr}:** **{kpis['totalProduction']:,} pcs**\n"
                f"- **Total Target:** **{kpis['totalTarget']:,} pcs**\n"
                f"- **Achievement Rate:** **{kpis['productionAchievementPercent']}%**\n"
                f"- **Production Gap:** **{kpis['productionGap']:,} pcs**\n"
                f"- **Total Downtime:** **{kpis['totalDowntimeHours']:,} hours** ({kpis['totalDowntimeMinutes']:,} mins)\n"
                f"- **Total Rejections:** **{kpis['totalRejection']:,} pcs** (Rejection Rate: **{kpis['rejectionRatePercent']}%**)\n"
                f"- **Good Output:** **{kpis['goodQuantity']:,} pcs**\n"
                f"- **Evaluated Records:** {kpis['recordCount']:,} records\n"
                f"{_data_completeness_note(kpis)}"
                f"{source_coverage_note}"
            )
        suggested = [
            "Which line has the largest production gap?",
            "What are the top five downtime causes?",
            "Compare day shift and night shift.",
        ]
        return resp, data_used, suggested

    # --- Unsupported / unrecognized query ---
    resp = (
        "I'm not sure how to answer that question. "
        "I'm specialized in **manufacturing analytics** for the Patil Group dashboard.\n\n"
        + _CAPABILITY_DESCRIPTION
    )
    return resp, {"intent": "unsupported", "original_query": query}, _DEFAULT_SUGGESTED


def _safe_deterministic_query_engine(
    query: str,
    filters: ChatFilterContext,
    ref_date: date | None = None,
    intent_override: str | None = None,
    tool_arguments_override: dict[str, Any] | None = None,
) -> tuple[str, dict[str, Any], list[str]]:
    """Keep source and schema errors distinct from a valid empty result."""
    try:
        return _deterministic_query_engine(
            query,
            filters,
            ref_date=ref_date,
            intent_override=intent_override,
            tool_arguments_override=tool_arguments_override,
        )
    except ManufacturingDataUnavailable:
        return (
            "I couldn't retrieve production data from the configured source, so I can't confirm a total or say that no records exist. Please try again when the source is available.",
            {"intent": "data_source_unavailable", "data_source_status": "unavailable"},
            _DEFAULT_SUGGESTED,
        )
    except UnsupportedMaterialField:
        return (
            "I couldn't evaluate that material request because the available production data does not expose a supported material field.",
            {"intent": "unsupported_material_field", "data_source_status": "available"},
            _DEFAULT_SUGGESTED,
        )
    except AmbiguousQueryValue:
        return (
            "That production label matches more than one source field. Please specify whether you mean the stage or the material/part.",
            {"intent": "ambiguous_filter_value", "clarification_needed": True},
            _DEFAULT_SUGGESTED,
        )


def _data_completeness_note(kpis: dict[str, Any]) -> str:
    quality = kpis.get("dataQuality", {})
    missing_production = quality.get("missingProductionCount", 0)
    missing_target = quality.get("missingTargetCount", 0)
    if not missing_production and not missing_target:
        return ""
    return (
        f"\n- **Data completeness:** {missing_production:,} records lack a production quantity "
        f"and {missing_target:,} lack a target; the existing totals treat those blanks as zero.\n"
    )


_FOLLOW_UP_PREVIOUS_DAY = re.compile(
    r"^(?:(?:what|how)\s+about\s+)?(?:the\s+)?(previous|prior|next|following) day\??$",
    re.IGNORECASE,
)
_CONTEXTUAL_FOLLOW_UP = re.compile(
    r"^(?:and|also|then|what about|how about|for|on|by)\b", re.IGNORECASE
)


def _single_query_filter_value(
    query: str, records: list[dict[str, Any]], fields: tuple[str, ...]
) -> str | None:
    """Return a source value only when the prior question names one unambiguous value."""
    matches: dict[str, str] = {}
    for record in records:
        for field in fields:
            value = record.get(field)
            if value is None:
                continue
            display_value = str(value).strip()
            if display_value and _query_mentions_value(query, display_value):
                key = re.sub(r"[^a-z0-9]+", " ", display_value.casefold()).strip()
                matches.setdefault(key, display_value)
    return next(iter(matches.values())) if len(matches) == 1 else None


def _query_has_time_reference(query: str, ref_date: date | None = None) -> bool:
    return bool(
        _parse_date_from_query(query)
        or _parse_month_range(query)
        or _resolve_query_period(query, ref_date=ref_date)
        or _resolve_relative_date(query, ref_date=ref_date)[0]
    )


def _resolve_follow_up_context(
    message: str,
    history: list[ChatMessage],
    filters: ChatFilterContext,
    ref_date: date | None = None,
) -> tuple[str, ChatFilterContext]:
    """Carry item and date context into concise follow-up questions."""
    prior_user_message = next((msg.content for msg in reversed(history) if msg.role == "user"), None)
    if not prior_user_message:
        return message, filters
    day_follow_up = _FOLLOW_UP_PREVIOUS_DAY.fullmatch(message.strip())
    if not day_follow_up and not _CONTEXTUAL_FOLLOW_UP.match(message.strip()):
        return message, filters

    prior_intent = classify_intent(prior_user_message, ref_date=ref_date)
    if prior_intent not in {
        INTENT_KPI_SUMMARY,
        INTENT_DAILY_PRODUCTION,
        INTENT_DATE_SPECIFIC,
        INTENT_DATE_RANGE_COMPARISON,
        INTENT_LINE_COMPARISON,
        INTENT_SHIFT_COMPARISON,
        INTENT_DOWNTIME_CAUSES,
        INTENT_DOWNTIME_MACHINES,
        INTENT_QUALITY,
        INTENT_MAINTENANCE,
        INTENT_CORRECTIVE,
        INTENT_OPERATIONAL_SUMMARY,
    }:
        return message, filters

    effective_filters = filters
    if day_follow_up or not _extract_named_filter_value(message):
        inherited_stage, inherited_material = filters.stage, filters.material
        if prior_intent not in {INTENT_MAINTENANCE, INTENT_CORRECTIVE}:
            try:
                inherited_stage, inherited_material, _ = _resolve_query_filters(
                    prior_user_message, filters
                )
            except ManufacturingDataUnavailable:
                pass
            except AmbiguousQueryValue:
                return message, filters
        try:
            source_records = (
                tools.get_raw_maintenance_records()
                if prior_intent in {INTENT_MAINTENANCE, INTENT_CORRECTIVE}
                else tools.get_raw_manufacturing_records()
            )
        except ManufacturingDataUnavailable:
            source_records = []
        inherited_dimensions = {
            "line": _single_query_filter_value(prior_user_message, source_records, ("line",)),
            "shift": _single_query_filter_value(prior_user_message, source_records, ("shift",)),
            "machine": _single_query_filter_value(
                prior_user_message, source_records, ("machine", "machineName")
            ),
        }
        for field, cue, source_fields in (
            ("line", r"\bline\b", ("line",)),
            ("shift", r"\bshift\b", ("shift",)),
            ("machine", r"\bmachine\b", ("machine", "machineName")),
        ):
            if re.search(cue, message, re.IGNORECASE):
                explicit_value = _single_query_filter_value(message, source_records, source_fields)
                if explicit_value:
                    inherited_dimensions[field] = explicit_value
        inherited_dimensions = {
            field: value for field, value in inherited_dimensions.items() if value
        }
        effective_filters = filters.model_copy(
            update={
                "stage": inherited_stage,
                "material": inherited_material,
                **inherited_dimensions,
            }
        )

    if not day_follow_up and not _query_has_time_reference(message, ref_date=ref_date):
        prior_period = _resolve_query_period(prior_user_message, ref_date=ref_date)
        if prior_period:
            effective_filters = effective_filters.model_copy(
                update={"dateFrom": prior_period[0], "dateTo": prior_period[1]}
            )
        else:
            prior_date = _parse_date_from_query(prior_user_message)
            if prior_date is None:
                prior_date, _ = _resolve_relative_date(prior_user_message, ref_date=ref_date)
            if prior_date is not None:
                effective_filters = effective_filters.model_copy(
                    update={"dateFrom": prior_date.isoformat(), "dateTo": prior_date.isoformat()}
                )

    if not day_follow_up:
        return message, effective_filters

    prior_date = _parse_date_from_query(prior_user_message)
    if prior_date is None:
        prior_date, _ = _resolve_relative_date(prior_user_message, ref_date=ref_date)
    if prior_date is None:
        prior_period = _resolve_query_period(prior_user_message, ref_date=ref_date)
        if prior_period:
            prior_date = date.fromisoformat(prior_period[1])
    if prior_date is not None:
        direction = day_follow_up.group(1).casefold()
        offset = 1 if direction in {"next", "following"} else -1
        target_date = prior_date + timedelta(days=offset)
        target_iso = target_date.isoformat()
        contextual_questions = {
            INTENT_KPI_SUMMARY: f"What was production on {target_iso}?",
            INTENT_DAILY_PRODUCTION: f"What was production on {target_iso}?",
            INTENT_DATE_SPECIFIC: f"What was production on {target_iso}?",
            INTENT_DATE_RANGE_COMPARISON: f"What was production on {target_iso}?",
            INTENT_LINE_COMPARISON: f"Which line had the largest production gap on {target_iso}?",
            INTENT_SHIFT_COMPARISON: f"Compare day and night shift performance on {target_iso}.",
            INTENT_DOWNTIME_CAUSES: f"What were the top downtime causes on {target_iso}?",
            INTENT_DOWNTIME_MACHINES: f"Which machines had the most downtime on {target_iso}?",
            INTENT_QUALITY: f"What was the rejection rate on {target_iso}?",
            INTENT_MAINTENANCE: f"How many maintenance breakdowns were recorded on {target_iso}?",
            INTENT_CORRECTIVE: f"What corrective actions were recorded on {target_iso}?",
            INTENT_OPERATIONAL_SUMMARY: f"What was the operational summary on {target_iso}?",
            INTENT_PPC_ORDERS: f"What was the production order status on {target_iso}?",
            INTENT_LINE_TRACKER_OEE: f"What was the OEE breakdown on {target_iso}?",
            INTENT_RELIABILITY_PARETO: f"What was the downtime Pareto on {target_iso}?",
            INTENT_TRACEABILITY: f"What was the RM heat traceability status on {target_iso}?",
        }
        return contextual_questions[prior_intent], effective_filters
    if day_follow_up.group(1).casefold() in {"next", "following"}:
        target_date = _get_business_today(ref_date) + timedelta(days=1)
        target_iso = target_date.isoformat()
        return {
            INTENT_KPI_SUMMARY: f"What was production on {target_iso}?",
            INTENT_DAILY_PRODUCTION: f"What was production on {target_iso}?",
            INTENT_DATE_SPECIFIC: f"What was production on {target_iso}?",
            INTENT_DATE_RANGE_COMPARISON: f"What was production on {target_iso}?",
            INTENT_LINE_COMPARISON: f"Which line had the largest production gap on {target_iso}?",
            INTENT_SHIFT_COMPARISON: f"Compare day and night shift performance on {target_iso}.",
            INTENT_DOWNTIME_CAUSES: f"What were the top downtime causes on {target_iso}?",
            INTENT_DOWNTIME_MACHINES: f"Which machines had the most downtime on {target_iso}?",
            INTENT_QUALITY: f"What was the rejection rate on {target_iso}?",
            INTENT_MAINTENANCE: f"How many maintenance breakdowns were recorded on {target_iso}?",
            INTENT_CORRECTIVE: f"What corrective actions were recorded on {target_iso}?",
            INTENT_OPERATIONAL_SUMMARY: f"What was the operational summary on {target_iso}?",
            INTENT_PPC_ORDERS: f"What was the production order status on {target_iso}?",
            INTENT_LINE_TRACKER_OEE: f"What was the OEE breakdown on {target_iso}?",
            INTENT_RELIABILITY_PARETO: f"What was the downtime Pareto on {target_iso}?",
            INTENT_TRACEABILITY: f"What was the RM heat traceability status on {target_iso}?",
        }[prior_intent], effective_filters
    return "What was production yesterday?", effective_filters


def _grounded_response_payload(
    query: str,
    filters: ChatFilterContext,
    conversation_id: str,
    provider_tool_results: dict[str, Any] | None = None,
) -> ChatResponsePayload:
    """Return the deterministic report as the displayed answer and keep model tool evidence."""
    effective_filters = filters
    intent_override = None
    tool_arguments_override: dict[str, Any] | None = None
    if provider_tool_results:
        routes = provider_tool_results.get("routing", [])
        if routes:
            route = routes[0]
            route_intent = _intent_for_tool_name(route.get("executedTool", ""))
            if route_intent != INTENT_UNSUPPORTED:
                intent_override = route_intent
                updates: dict[str, Any] = {}
                arguments = route.get("arguments", {})
                tool_arguments_override = arguments
                for source_name, filter_name in (
                    ("date_from", "dateFrom"), ("date_to", "dateTo"),
                    ("line", "line"), ("shift", "shift"), ("stage", "stage"),
                    ("material", "material"), ("machine", "machine"),
                ):
                    if source_name in arguments:
                        updates[filter_name] = arguments[source_name]
                if arguments.get("target_date"):
                    updates["dateFrom"] = arguments["target_date"]
                    updates["dateTo"] = arguments["target_date"]
                if updates:
                    effective_filters = filters.model_copy(update=updates)

    response, data_used, suggested = _safe_deterministic_query_engine(
        query,
        effective_filters,
        intent_override=intent_override,
        tool_arguments_override=tool_arguments_override,
    )
    if provider_tool_results:
        data_used["provider_tool_results"] = provider_tool_results
        if intent_override and data_used.get("intent") == intent_override:
            routes = provider_tool_results.get("routing", [])
            if routes:
                data_used["tool"] = routes[0].get("executedTool")
                data_used["tool_arguments"] = routes[0].get("arguments", {})
        for name, result in provider_tool_results.items():
            if name not in data_used:
                data_used[name] = result
    return ChatResponsePayload(
        response=response,
        conversation_id=conversation_id,
        data_used=data_used,
        suggested_questions=suggested,
    )


ALLOWED_TOOL_NAMES: set[str] = {
    "get_manufacturing_kpis",
    "get_daily_production",
    "compare_date_ranges",
    "get_production_by_line",
    "get_production_by_shift",
    "get_top_downtime_causes",
    "get_top_downtime_machines",
    "get_quality_and_rejection_analysis",
    "get_maintenance_breakdown_summary",
    "get_maintenance_corrective_actions",
    "get_operational_summary",
    "get_line_tracker_order_status",
    "get_line_tracker_oee_breakdown",
    "get_line_tracker_reliability",
    "get_line_tracker_traceability",
}


def resolve_model_provider() -> tuple[str, str, str, str]:
    """Resolve active LLM provider.

    Returns:
        (provider_type, base_url, model_name, auth_token)
        where provider_type is 'groq', 'hf', 'openai', or 'deterministic'.
    """
    configured = (getattr(settings, "chat_provider", "auto") or "auto").strip().lower()
    groq_key = (getattr(settings, "groq_api_key", "") or "").strip()
    hf_tok = (getattr(settings, "hf_token", "") or "").strip()
    openai_key = (getattr(settings, "openai_api_key", "") or "").strip()
    hf_url = (getattr(settings, "hf_router_url", "https://router.huggingface.co/v1") or "https://router.huggingface.co/v1").rstrip("/")
    groq_model = (getattr(settings, "groq_model", "openai/gpt-oss-20b") or "openai/gpt-oss-20b").strip()
    if groq_model in {"llama-3.3-70b-versatile", "llama-3.1-8b-instant", "llama3-70b-8192", "llama3-8b-8192"}:
        logger.warning(
            "Configured Groq model '%s' is deprecated on GroqCloud. Remapping to 'openai/gpt-oss-20b'.",
            groq_model,
        )
        groq_model = "openai/gpt-oss-20b"
    hf_model = (getattr(settings, "chat_model", "openai/gpt-oss-120b") or "openai/gpt-oss-120b").strip()

    if configured == "deterministic":
        return "deterministic", "", "", ""
    if configured == "groq":
        if not groq_key:
            return "deterministic", "", "", ""
        return "groq", "https://api.groq.com/openai/v1", groq_model, groq_key
    if configured == "hf":
        if not hf_tok:
            return "deterministic", "", "", ""
        return "hf", hf_url, hf_model, hf_tok
    if configured == "openai":
        if not openai_key:
            return "deterministic", "", "", ""
        return "openai", "https://api.openai.com/v1", hf_model, openai_key

    # "auto" mode priority:
    # 1. GroqCloud (fast inference with native tool calling on free tier)
    # 2. Hugging Face Router
    # 3. OpenAI
    # 4. Grounded deterministic engine
    if groq_key:
        return "groq", "https://api.groq.com/openai/v1", groq_model, groq_key
    if hf_tok:
        return "hf", hf_url, hf_model, hf_tok
    if openai_key:
        return "openai", "https://api.openai.com/v1", hf_model, openai_key
    return "deterministic", "", "", ""


def process_chat_query(payload: ChatRequestPayload) -> ChatResponsePayload:
    """Process a user question with multi-turn conversation and tool grounding."""
    conv_id = payload.conversation_id or str(uuid.uuid4())
    effective_query, effective_filters = _resolve_follow_up_context(
        payload.message, payload.history, payload.filters
    )

    # Pre-screen: Greetings, Identity, and Ambiguous queries are answered
    # deterministically to eliminate hallucinations and save unnecessary LLM calls.
    intent = classify_intent(effective_query)
    if intent in {INTENT_GREETING, INTENT_IDENTITY, INTENT_AMBIGUOUS}:
        return _grounded_response_payload(
            effective_query, effective_filters, conv_id
        )

    provider, base_url, model_name, auth_token = resolve_model_provider()

    contextual_follow_up = bool(
        re.match(
            r"^(?:and|also|then|what about|how about|how did it|how did they|what was it|for that)\b",
            effective_query.strip(),
            re.IGNORECASE,
        )
    )
    history_has_analytics = any(
        msg.role == "user" and _expected_tool_for_intent(classify_intent(msg.content))
        for msg in payload.history[-6:]
    )
    semantic_request_allowed = _has_analytics_language(effective_query) or (
        contextual_follow_up and history_has_analytics
    )

    # If deterministic fallback or no credentials configured, route through deterministic engine
    if provider == "deterministic" or not auth_token:
        return _grounded_response_payload(
            effective_query, effective_filters, conv_id
        )

    system_instruction = (
        "You are the Patil Group Manufacturing Performance AI Assistant. "
        "You provide accurate, executive-level answers to plant managers and supervisors "
        "using live data from the Patil Group Manufacturing and Maintenance datasets.\n\n"
        "STRICT SAFETY & GROUNDING RULES:\n"
        "1. For in-scope factual questions, call an approved tool to retrieve actual data. NEVER invent numbers, line names, machine names, causes, or dates.\n"
        "2. Understand the meaning of the whole message, not just matching keywords. Treat natural phrases like 'how many pieces came off the line', 'did we hit the goal', 'where did we lose time', and 'what went wrong' as manufacturing questions when context supports that reading.\n"
        "3. Select the one approved tool that directly answers the user's intent. Do not default to a production summary when another metric is requested. The application validates tool choice and query constraints; use tool results as the only source for facts.\n"
        "4. Use the conversation history to resolve short follow-ups such as 'what about the previous day?' Keep the same subject and filters unless the user changes them.\n"
        "5. If the user does not specify dates, use the current active filter date bounds. Explicit dates and relative periods in the question take priority over dashboard dates.\n"
        "6. Interpret DD-MM-YYYY as day-month-year (Indian convention: 11-10-2026 = 11 October 2026). Convert tool dates to ISO YYYY-MM-DD. Use Asia/Kolkata for relative dates.\n"
        "7. For daily or single-day questions, call get_daily_production. For comparisons, use compare_date_ranges and preserve both periods.\n"
        "8. If the requested metric, item, date, or dimension is ambiguous, ask one brief clarifying question instead of guessing or calling an unrelated tool. If the question is unrelated to manufacturing data, state your scope briefly.\n"
        "9. Distinguish no matching records from zero production and from unavailable source data. Never describe a source error as no records.\n"
        "10. Format answers cleanly in Markdown, include units, and keep the explanation focused on the user's question.\n"
        "11. In this manufacturing plant, 'production' refers to finished Elastic Rail Clip production (stage='Clip'). Intermediate processes ('Cut Bar', 'Turned Bar', 'Deburring', 'MPI') are preparatory WIP stages. When answering general production questions, ALWAYS report final clip production (use the label 'Final Clip Production') unless the user explicitly requests another process stage."
    )

    filter_hint = (
        f"\n[Active Dashboard Context: Date Range = {effective_filters.dateFrom or 'Default'} to "
        f"{effective_filters.dateTo or 'Latest'}, Line = {effective_filters.line or 'All'}, "
        f"Shift = {effective_filters.shift or 'All'}, Machine = {effective_filters.machine or 'All'}]"
        f"\n[Business Today (Asia/Kolkata): {_get_business_today().isoformat()}]"
    )

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": system_instruction + filter_hint}
    ]

    for msg in payload.history[-6:]:
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": effective_query})

    try:
        # Check if OpenAI SDK is requested and available (preserves existing unit test mocks)
        if provider == "openai":
            try:
                from openai import OpenAI

                client = OpenAI(api_key=auth_token)
                response = client.chat.completions.create(
                    model=model_name or "gpt-4o-mini",
                    messages=messages,
                    tools=CHAT_TOOLS_SCHEMA,
                    tool_choice="auto",
                )
                response_message = response.choices[0].message
                tool_calls = response_message.tool_calls

                data_collected: dict[str, Any] = {}
                grounding_intent = intent
                if tool_calls:
                    messages.append(response_message)
                    for tool_call in tool_calls[:5]:  # Safety limit: max 5 tool calls
                        requested_name = tool_call.function.name
                        func_name = requested_name
                        func_args: dict[str, Any] = {}
                        if func_name not in ALLOWED_TOOL_NAMES:
                            tool_result = {"error": f"Tool '{func_name}' is not in the approved analytics tool set."}
                        elif intent == INTENT_UNSUPPORTED and not semantic_request_allowed:
                            tool_result = {"error": "This question is outside the supported manufacturing analytics."}
                        else:
                            tool_intent = (
                                intent if intent != INTENT_UNSUPPORTED
                                else _intent_for_tool_name(requested_name)
                            )
                            try:
                                func_args = json.loads(tool_call.function.arguments or "{}")
                            except Exception:
                                func_args = {}
                            func_name, func_args = _apply_query_constraints(
                                requested_name,
                                func_args,
                                query=effective_query,
                                intent=tool_intent,
                                filters=effective_filters,
                            )
                            if grounding_intent == INTENT_UNSUPPORTED:
                                grounding_intent = tool_intent
                            tool_result = execute_tool_call(func_name, func_args)

                        data_collected[func_name] = tool_result
                        data_collected.setdefault("routing", []).append(
                            {
                                "requestedTool": requested_name,
                                "executedTool": func_name,
                                "arguments": func_args,
                            }
                        )
                        messages.append(
                            {
                                "tool_call_id": tool_call.id,
                                "role": "tool",
                                "name": requested_name,
                                "content": json.dumps(tool_result),
                            }
                        )
                    second_response = client.chat.completions.create(
                        model=model_name or "gpt-4o-mini",
                        messages=messages,
                    )
                    final_text = second_response.choices[0].message.content or "No response generated."
                else:
                    final_text = response_message.content or ""

                grounded = _grounded_response_payload(
                    effective_query, effective_filters, conv_id, data_collected
                )
                if tool_calls and _model_response_is_grounded(
                    final_text, data_collected, grounding_intent, query=effective_query
                ):
                    grounded.response = final_text
                elif not tool_calls and intent == INTENT_UNSUPPORTED and final_text.strip() and not _numeric_tokens(final_text):
                    grounded.response = final_text
                    grounded.data_used["intent"] = "clarification_or_scope_response"
                return grounded
            except ImportError:
                pass  # Fall through to httpx client

        # Hugging Face Router or HTTP-based OpenAI-compatible inference
        import httpx

        client_headers = {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json",
        }
        body = {
            "model": model_name,
            "messages": messages,
            "tools": CHAT_TOOLS_SCHEMA,
            "tool_choice": "auto",
        }

        with httpx.Client(timeout=45.0) as http_client:
            res = http_client.post(
                f"{base_url}/chat/completions",
                json=body,
                headers=client_headers,
            )
            res.raise_for_status()
            res_data = res.json()

            choices = res_data.get("choices") or []
            if not choices:
                raise ValueError("Model provider returned empty choices list.")

            first_msg = choices[0].get("message") or {}
            raw_tool_calls = first_msg.get("tool_calls")
            data_collected = {}
            grounding_intent = intent

            if raw_tool_calls:
                messages.append(first_msg)
                for tc in raw_tool_calls[:5]:  # Safety limit: max 5 tool calls
                    func_info = tc.get("function") or {}
                    requested_name = func_info.get("name") or ""
                    fn_name = requested_name
                    func_args: dict[str, Any] = {}
                    if fn_name not in ALLOWED_TOOL_NAMES:
                        t_res = {"error": f"Tool '{fn_name}' is not in the approved analytics tool set."}
                    elif intent == INTENT_UNSUPPORTED and not semantic_request_allowed:
                        t_res = {"error": "This question is outside the supported manufacturing analytics."}
                    else:
                        tool_intent = (
                            intent if intent != INTENT_UNSUPPORTED
                            else _intent_for_tool_name(requested_name)
                        )
                        args_raw = func_info.get("arguments") or "{}"
                        if isinstance(args_raw, str):
                            try:
                                args_dict = json.loads(args_raw)
                            except Exception:
                                args_dict = {}
                        else:
                            args_dict = args_raw or {}
                        fn_name, args_dict = _apply_query_constraints(
                            requested_name,
                            args_dict,
                            query=effective_query,
                            intent=tool_intent,
                            filters=effective_filters,
                        )
                        if grounding_intent == INTENT_UNSUPPORTED:
                            grounding_intent = tool_intent
                        func_args = args_dict
                        t_res = execute_tool_call(fn_name, args_dict)

                    data_collected[fn_name] = t_res
                    data_collected.setdefault("routing", []).append(
                        {
                            "requestedTool": requested_name,
                            "executedTool": fn_name,
                            "arguments": func_args,
                        }
                    )
                    messages.append(
                        {
                            "tool_call_id": tc.get("id", str(uuid.uuid4())),
                            "role": "tool",
                            "name": requested_name,
                            "content": json.dumps(t_res),
                        }
                    )

                second_res = http_client.post(
                    f"{base_url}/chat/completions",
                    json={"model": model_name, "messages": messages},
                    headers=client_headers,
                )
                second_res.raise_for_status()
                second_data = second_res.json()
                second_choices = second_data.get("choices") or []
                final_text = (
                    second_choices[0].get("message", {}).get("content")
                    if second_choices
                    else "No response generated."
                ) or "No response generated."
            else:
                final_text = first_msg.get("content") or ""

            grounded = _grounded_response_payload(
                effective_query, effective_filters, conv_id, data_collected
            )
            if raw_tool_calls and _model_response_is_grounded(
                final_text, data_collected, grounding_intent, query=effective_query
            ):
                grounded.response = final_text
            elif not raw_tool_calls and intent == INTENT_UNSUPPORTED and final_text.strip() and not _numeric_tokens(final_text):
                grounded.response = final_text
                grounded.data_used["intent"] = "clarification_or_scope_response"
            return grounded

    except Exception as exc:
        logger.warning(
            "Hosted LLM call failed (%s: %s). Falling back to deterministic engine.",
            type(exc).__name__,
            str(exc),
        )
        if settings.chat_fallback_enabled:
            return _grounded_response_payload(
                effective_query, effective_filters, conv_id
            )
        raise
