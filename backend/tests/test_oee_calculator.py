"""Unit tests for Excel DPR_OEE row-level OEE calculator.

Fixtures for rows 5-6 match approved validation against PRIL_DPR_OEE.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.services.oee_calculator import (
    FORMULA_KEY,
    FORMULA_VERSION,
    calculate_oee_metrics,
)


# --- Approved Excel row fixtures (DPR_OEE validation) ---

ROW5 = {
    "shift_time_min": Decimal("720"),
    "planned_downtime_min": Decimal("60"),
    "produced_qty": Decimal("1200"),
    "cavity_count": Decimal("2"),
    "cycle_time_sec": Decimal("60"),
    "downtime_minutes": [Decimal("20")],  # M/c Under BD
    "rejection_qtys": [
        Decimal("1"),
        Decimal("2"),
        Decimal("3"),
        Decimal("5"),
        Decimal("4"),
    ],  # Short/Shrink/Silver/Flow/Weld = 15
}

ROW5_EXPECTED = {
    "shift_time_min": Decimal("720"),
    "target_qty_per_hr": Decimal("120"),
    "available_time_min": Decimal("660"),
    "total_idle_time_min": Decimal("20"),
    "run_time_min": Decimal("640"),
    "availability": Decimal("640") / Decimal("660"),
    "actual_qty_per_hr": Decimal("112.5"),
    "performance": Decimal("0.9375"),
    "machine_utilisation": Decimal("1200") / Decimal("1320"),
    "total_rejection_qty": Decimal("15"),
    "rejection_ppm": Decimal("12500"),
    "quality": Decimal("0.9875"),
    "oee": (Decimal("640") / Decimal("660"))
    * Decimal("0.9375")
    * Decimal("0.9875"),
}

ROW6 = {
    "shift_time_min": Decimal("720"),
    "planned_downtime_min": Decimal("30"),
    "produced_qty": Decimal("1100"),
    "cavity_count": Decimal("2"),
    "cycle_time_sec": Decimal("60"),
    "downtime_minutes": [Decimal("20")],  # Bin Shortage
    "rejection_qtys": [Decimal("4")],  # Dent Mark
}

ROW6_EXPECTED = {
    "shift_time_min": Decimal("720"),
    "target_qty_per_hr": Decimal("120"),
    "available_time_min": Decimal("690"),
    "total_idle_time_min": Decimal("20"),
    "run_time_min": Decimal("670"),
    "availability": Decimal("670") / Decimal("690"),
    "actual_qty_per_hr": Decimal("1100") / Decimal("670") * Decimal("60"),
    "performance": (Decimal("1100") / Decimal("670") * Decimal("60")) / Decimal("120"),
    "machine_utilisation": Decimal("1100")
    / ((Decimal("690") / Decimal("60")) * Decimal("120")),
    "total_rejection_qty": Decimal("4"),
    "rejection_ppm": Decimal("4") / Decimal("1100") * Decimal("1000000"),
    "quality": (Decimal("1100") - Decimal("4")) / Decimal("1100"),
    "oee": (Decimal("670") / Decimal("690"))
    * ((Decimal("1100") / Decimal("670") * Decimal("60")) / Decimal("120"))
    * ((Decimal("1100") - Decimal("4")) / Decimal("1100")),
}


def _assert_metrics(result, expected: dict) -> None:
    for key, value in expected.items():
        got = getattr(result, key)
        assert got == value, f"{key}: got {got!r} expected {value!r}"


def test_row5_excel_parity() -> None:
    result = calculate_oee_metrics(**ROW5)
    _assert_metrics(result, ROW5_EXPECTED)
    # Documented approx anchors from validation brief
    assert result.availability == pytest.approx(Decimal("0.9696969697"), abs=Decimal("1e-10"))
    assert result.machine_utilisation == pytest.approx(
        Decimal("0.9090909091"), abs=Decimal("1e-10")
    )
    assert result.oee == pytest.approx(Decimal("0.8977272727"), abs=Decimal("1e-10"))
    assert result.formula_key == FORMULA_KEY
    assert result.formula_version == FORMULA_VERSION


def test_row6_excel_parity() -> None:
    result = calculate_oee_metrics(**ROW6)
    _assert_metrics(result, ROW6_EXPECTED)


def test_oee_uses_af_not_ag() -> None:
    result = calculate_oee_metrics(**ROW5)
    assert result.performance != result.machine_utilisation
    af_path = result.availability * result.performance * result.quality
    ag_path = result.availability * result.machine_utilisation * result.quality
    assert result.oee == af_path
    assert result.oee != ag_path


def test_row5_from_start_stop_timestamps() -> None:
    """Same-day start/stop: (stop-start) minutes matches Excel (F-E)*24*60."""
    start = datetime(2024, 1, 15, 8, 30, tzinfo=timezone.utc)
    stop = start + timedelta(minutes=720)
    result = calculate_oee_metrics(
        start_at=start,
        stop_at=stop,
        cavity_count=ROW5["cavity_count"],
        cycle_time_sec=ROW5["cycle_time_sec"],
        produced_qty=ROW5["produced_qty"],
        planned_downtime_min=ROW5["planned_downtime_min"],
        downtime_minutes=ROW5["downtime_minutes"],
        rejection_qtys=ROW5["rejection_qtys"],
    )
    _assert_metrics(result, ROW5_EXPECTED)
    assert result.q1_midnight_unresolved is False


def test_produced_zero_quality_and_ppm_none() -> None:
    result = calculate_oee_metrics(
        shift_time_min=720,
        planned_downtime_min=60,
        produced_qty=0,
        cavity_count=2,
        cycle_time_sec=60,
        downtime_minutes=[20],
        rejection_qtys=[1],
    )
    assert result.rejection_ppm is None
    assert result.quality is None
    assert result.oee is None
    assert result.actual_qty_per_hr == Decimal("0")


def test_available_zero_availability_none() -> None:
    # shift == planned => available 0
    result = calculate_oee_metrics(
        shift_time_min=60,
        planned_downtime_min=60,
        produced_qty=100,
        cavity_count=2,
        cycle_time_sec=60,
        downtime_minutes=[0],
        rejection_qtys=[],
    )
    assert result.available_time_min == Decimal("0")
    assert result.availability is None
    assert result.machine_utilisation is None
    assert result.oee is None


def test_run_zero_actual_and_performance_none() -> None:
    # available 100, idle 100 => run 0
    result = calculate_oee_metrics(
        shift_time_min=160,
        planned_downtime_min=60,
        produced_qty=100,
        cavity_count=2,
        cycle_time_sec=60,
        downtime_minutes=[100],
        rejection_qtys=[0],
    )
    assert result.run_time_min == Decimal("0")
    assert result.actual_qty_per_hr is None
    assert result.performance is None
    assert result.availability == Decimal("0")
    assert result.oee is None


def test_blank_planned_downtime_treated_as_zero() -> None:
    result = calculate_oee_metrics(
        shift_time_min=720,
        planned_downtime_min=None,
        produced_qty=1200,
        cavity_count=2,
        cycle_time_sec=60,
        downtime_minutes=[20],
        rejection_qtys=[15],
    )
    assert result.available_time_min == Decimal("720")
    assert result.run_time_min == Decimal("700")


def test_blank_downtime_and_rejection_treated_as_zero() -> None:
    result = calculate_oee_metrics(
        shift_time_min=720,
        planned_downtime_min=60,
        produced_qty=1200,
        cavity_count=2,
        cycle_time_sec=60,
        downtime_minutes=[None, None],
        rejection_qtys=[None],
    )
    assert result.total_idle_time_min == Decimal("0")
    assert result.total_rejection_qty == Decimal("0")
    assert result.quality == Decimal("1")
    assert result.rejection_ppm == Decimal("0")


def test_empty_downtime_rejection_lists() -> None:
    result = calculate_oee_metrics(
        shift_time_min=720,
        planned_downtime_min=60,
        produced_qty=1200,
        cavity_count=2,
        cycle_time_sec=60,
        downtime_minutes=None,
        rejection_qtys=None,
    )
    assert result.total_idle_time_min == Decimal("0")
    assert result.total_rejection_qty == Decimal("0")


def test_zero_cavity_or_cycle_target_none() -> None:
    zc = calculate_oee_metrics(
        shift_time_min=720,
        planned_downtime_min=60,
        produced_qty=1200,
        cavity_count=0,
        cycle_time_sec=60,
        downtime_minutes=[20],
        rejection_qtys=[15],
    )
    assert zc.target_qty_per_hr is None
    assert zc.performance is None
    assert zc.machine_utilisation is None
    assert zc.oee is None

    zl = calculate_oee_metrics(
        shift_time_min=720,
        planned_downtime_min=60,
        produced_qty=1200,
        cavity_count=2,
        cycle_time_sec=0,
        downtime_minutes=[20],
        rejection_qtys=[15],
    )
    assert zl.target_qty_per_hr is None
    assert zl.oee is None


def test_rejection_greater_than_produced_no_clamp() -> None:
    result = calculate_oee_metrics(
        shift_time_min=720,
        planned_downtime_min=60,
        produced_qty=10,
        cavity_count=2,
        cycle_time_sec=60,
        downtime_minutes=[0],
        rejection_qtys=[15],
    )
    assert result.quality == (Decimal("10") - Decimal("15")) / Decimal("10")
    assert result.quality < 0
    assert result.rejection_ppm == Decimal("15") / Decimal("10") * Decimal("1000000")


def test_stop_before_start_q1_shift_derived_none() -> None:
    """Q1 TBC: do not invent +24h; shift-derived fields are None."""
    start = datetime(2024, 1, 15, 20, 0, tzinfo=timezone.utc)
    stop = datetime(2024, 1, 15, 8, 0, tzinfo=timezone.utc)  # earlier same day
    result = calculate_oee_metrics(
        start_at=start,
        stop_at=stop,
        cavity_count=2,
        cycle_time_sec=60,
        produced_qty=1200,
        planned_downtime_min=60,
        downtime_minutes=[20],
        rejection_qtys=[15],
    )
    assert result.q1_midnight_unresolved is True
    assert result.shift_time_min is None
    assert result.available_time_min is None
    assert result.run_time_min is None
    assert result.availability is None
    assert result.actual_qty_per_hr is None
    assert result.performance is None
    assert result.machine_utilisation is None
    assert result.oee is None
    # Non-time metrics still computed
    assert result.target_qty_per_hr == Decimal("120")
    assert result.total_idle_time_min == Decimal("20")
    assert result.total_rejection_qty == Decimal("15")
    assert result.quality == Decimal("0.9875")


def test_explicit_shift_time_overrides_q1_midnight() -> None:
    start = datetime(2024, 1, 15, 20, 0, tzinfo=timezone.utc)
    stop = datetime(2024, 1, 15, 8, 0, tzinfo=timezone.utc)
    result = calculate_oee_metrics(
        start_at=start,
        stop_at=stop,
        shift_time_min=720,  # approved explicit duration path
        cavity_count=2,
        cycle_time_sec=60,
        produced_qty=1200,
        planned_downtime_min=60,
        downtime_minutes=[20],
        rejection_qtys=[1, 2, 3, 5, 4],
    )
    assert result.q1_midnight_unresolved is False
    _assert_metrics(result, ROW5_EXPECTED)

