"""Integration tests for row-level OEE metrics persistence.

Uses Compose Postgres (127.0.0.1:5433 / pril_analytics) inside a rolled-back
transaction so no temporary masters/production/metrics rows remain.

Migration 015: undefined-capable metric columns are nullable — calculator
None flushes as SQL NULL (never coerced to 0).
"""

from __future__ import annotations

import uuid
from datetime import datetime, time, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.session import get_engine
from app.models.downtime_event import DowntimeEvent
from app.models.downtime_reason import DowntimeReason
from app.models.machine import Machine
from app.models.machine_status import MachineStatus
from app.models.machine_type import MachineType
from app.models.part import Part
from app.models.plant import Plant
from app.models.production_record import ProductionRecord
from app.models.production_record_metrics import ProductionRecordMetrics
from app.models.rejection_event import RejectionEvent
from app.models.rejection_reason import RejectionReason
from app.models.shift import Shift
from app.services.oee_calculator import (
    FORMULA_KEY,
    FORMULA_VERSION,
    calculate_oee_metrics,
)
from app.services.oee_persistence import persist_production_record_metrics


# --- DPR_OEE approved fixtures (same as calculator tests) ---

ROW5 = {
    "planned_downtime_min": Decimal("60"),
    "produced_qty": Decimal("1200"),
    "cavity_count": Decimal("2"),
    "cycle_time_sec": Decimal("60"),
    "downtime_minutes": [Decimal("20")],
    "rejection_qtys": [
        Decimal("1"),
        Decimal("2"),
        Decimal("3"),
        Decimal("5"),
        Decimal("4"),
    ],
}

ROW6 = {
    "planned_downtime_min": Decimal("30"),
    "produced_qty": Decimal("1100"),
    "cavity_count": Decimal("2"),
    "cycle_time_sec": Decimal("60"),
    "downtime_minutes": [Decimal("20")],
    "rejection_qtys": [Decimal("4")],
}


@pytest.fixture
def db_session() -> Session:
    """Session bound to an outer transaction that always rolls back."""
    engine = get_engine()
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, autoflush=False, expire_on_commit=False)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


def _uid(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _seed_masters(session: Session) -> dict[str, object]:
    """Minimal Plant/Machine/Shift/Part + reason catalogs for one test."""
    plant = Plant(
        code=_uid("PLT"),
        name="OEE Persist Test Plant",
        timezone="Asia/Kolkata",
        is_active=True,
    )
    session.add(plant)
    session.flush()

    mtype = MachineType(code=_uid("MT"), name="Test Type", is_active=True)
    mstatus = MachineStatus(code=_uid("MS"), name="Active", is_active=True)
    session.add_all([mtype, mstatus])
    session.flush()

    machine = Machine(
        plant_id=plant.id,
        code=_uid("MC"),
        name="Test Machine",
        machine_type_id=mtype.id,
        status_id=mstatus.id,
    )
    shift = Shift(
        plant_id=plant.id,
        code=_uid("SH"),
        name="A",
        start_time=time(8, 30),
        end_time=time(20, 30),
        crosses_midnight=False,
    )
    part = Part(code=_uid("PT"), name="Test Part")
    session.add_all([machine, shift, part])
    session.flush()

    return {
        "plant": plant,
        "machine": machine,
        "shift": shift,
        "part": part,
    }


def _make_production_record(
    session: Session,
    masters: dict[str, object],
    *,
    start_at: datetime,
    stop_at: datetime,
    cavity_count: Decimal,
    cycle_time_sec: Decimal,
    produced_qty: Decimal,
    planned_downtime_min: Decimal,
    downtime_minutes: list[Decimal],
    rejection_qtys: list[Decimal],
) -> ProductionRecord:
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    machine: Machine = masters["machine"]  # type: ignore[assignment]
    shift: Shift = masters["shift"]  # type: ignore[assignment]
    part: Part = masters["part"]  # type: ignore[assignment]

    record = ProductionRecord(
        plant_id=plant.id,
        machine_id=machine.id,
        shift_id=shift.id,
        part_id=part.id,
        production_date=start_at.date(),
        start_at=start_at,
        stop_at=stop_at,
        cavity_count=cavity_count,
        cycle_time_sec=cycle_time_sec,
        produced_qty=produced_qty,
        planned_downtime_min=planned_downtime_min,
        status="draft",
    )
    session.add(record)
    session.flush()

    for minutes in downtime_minutes:
        if minutes is None or minutes <= 0:
            continue
        reason = DowntimeReason(
            code=_uid("DT"),
            label="Test downtime",
            is_active=True,
        )
        session.add(reason)
        session.flush()
        session.add(
            DowntimeEvent(
                production_record_id=record.id,
                downtime_reason_id=reason.id,
                minutes=minutes,
            )
        )

    for qty in rejection_qtys:
        if qty is None or qty <= 0:
            continue
        reason = RejectionReason(
            code=_uid("RJ"),
            label="Test rejection",
            is_active=True,
        )
        session.add(reason)
        session.flush()
        session.add(
            RejectionEvent(
                production_record_id=record.id,
                rejection_reason_id=reason.id,
                qty=qty,
            )
        )

    session.flush()
    session.refresh(record)
    return record


def _count_metrics(session: Session, production_record_id: uuid.UUID) -> int:
    return int(
        session.scalar(
            select(func.count())
            .select_from(ProductionRecordMetrics)
            .where(
                ProductionRecordMetrics.production_record_id == production_record_id
            )
        )
        or 0
    )


def _sql_null_flags(
    session: Session, production_record_id: uuid.UUID, columns: list[str]
) -> dict[str, bool]:
    """Return whether each column is SQL NULL (True) via raw SELECT."""
    cols_sql = ", ".join(f"({c} IS NULL) AS {c}_is_null" for c in columns)
    row = session.execute(
        text(
            f"SELECT {cols_sql} FROM production_record_metrics "
            f"WHERE production_record_id = :pid"
        ),
        {"pid": production_record_id},
    ).mappings().one()
    return {c: bool(row[f"{c}_is_null"]) for c in columns}


# --- F regression: DPR_OEE row 5 / row 6 ---


def test_persist_row5_excel_parity(db_session: Session) -> None:
    masters = _seed_masters(db_session)
    start = datetime(2024, 1, 15, 8, 30, tzinfo=timezone.utc)
    stop = start + timedelta(minutes=720)
    record = _make_production_record(
        db_session,
        masters,
        start_at=start,
        stop_at=stop,
        **ROW5,
    )

    metrics = persist_production_record_metrics(db_session, record)
    db_session.flush()

    assert metrics.production_record_id == record.id
    assert metrics.oee == pytest.approx(Decimal("0.8977272727"), abs=Decimal("1e-8"))
    assert metrics.availability == pytest.approx(
        Decimal("0.9696969697"), abs=Decimal("1e-8")
    )
    assert metrics.performance == Decimal("0.9375")
    assert metrics.quality == Decimal("0.9875")
    assert metrics.machine_utilisation == pytest.approx(
        Decimal("0.9090909091"), abs=Decimal("1e-8")
    )
    assert metrics.formula_version == FORMULA_VERSION
    assert metrics.computed_at.tzinfo is not None


def test_persist_row6_excel_parity(db_session: Session) -> None:
    masters = _seed_masters(db_session)
    start = datetime(2024, 1, 16, 8, 30, tzinfo=timezone.utc)
    stop = start + timedelta(minutes=720)
    record = _make_production_record(
        db_session,
        masters,
        start_at=start,
        stop_at=stop,
        **ROW6,
    )

    metrics = persist_production_record_metrics(db_session, record)
    db_session.flush()

    expected = calculate_oee_metrics(
        shift_time_min=720,
        **ROW6,
    )
    assert metrics.oee == pytest.approx(Decimal("0.7942028985"), abs=Decimal("1e-8"))
    assert metrics.oee == pytest.approx(expected.oee, abs=Decimal("1e-10"))
    assert metrics.performance == pytest.approx(expected.performance, abs=Decimal("1e-10"))
    assert metrics.machine_utilisation == pytest.approx(
        expected.machine_utilisation, abs=Decimal("1e-10")
    )


def test_persist_af_ag_and_oee_product(db_session: Session) -> None:
    masters = _seed_masters(db_session)
    start = datetime(2024, 1, 17, 8, 30, tzinfo=timezone.utc)
    stop = start + timedelta(minutes=720)
    record = _make_production_record(
        db_session,
        masters,
        start_at=start,
        stop_at=stop,
        **ROW5,
    )
    metrics = persist_production_record_metrics(db_session, record)
    db_session.flush()

    assert metrics.performance != metrics.machine_utilisation
    af_path = metrics.availability * metrics.performance * metrics.quality
    ag_path = metrics.availability * metrics.machine_utilisation * metrics.quality
    assert metrics.oee == pytest.approx(af_path, abs=Decimal("1e-12"))
    assert metrics.oee != pytest.approx(ag_path, abs=Decimal("1e-12"))


def test_persist_idempotent_upsert(db_session: Session) -> None:
    masters = _seed_masters(db_session)
    start = datetime(2024, 1, 18, 8, 30, tzinfo=timezone.utc)
    stop = start + timedelta(minutes=720)
    record = _make_production_record(
        db_session,
        masters,
        start_at=start,
        stop_at=stop,
        **ROW5,
    )

    first = persist_production_record_metrics(db_session, record)
    db_session.flush()
    first_computed = first.computed_at
    assert _count_metrics(db_session, record.id) == 1

    # Change produced qty and re-persist — still one row, values refreshed.
    record.produced_qty = Decimal("1300")
    db_session.flush()
    second = persist_production_record_metrics(db_session, record)
    db_session.flush()

    assert _count_metrics(db_session, record.id) == 1
    assert second.production_record_id == first.production_record_id
    assert second.computed_at >= first_computed
    # Recalculated against new produced qty (not stale Row5 OEE).
    assert second.oee != pytest.approx(Decimal("0.8977272727"), abs=Decimal("1e-4"))


# --- A / B / C: null ratios not coerced to zero; flush succeeds ---


def test_null_ratios_not_coerced_to_zero(db_session: Session) -> None:
    """A/B/C: available=0 / run=0 / produced=0 → NULL persists (not 0)."""
    masters = _seed_masters(db_session)
    base = datetime(2024, 1, 20, 8, 0, tzinfo=timezone.utc)

    # A. available = 0
    rec_a = _make_production_record(
        db_session,
        masters,
        start_at=base,
        stop_at=base + timedelta(minutes=60),
        cavity_count=Decimal("2"),
        cycle_time_sec=Decimal("60"),
        produced_qty=Decimal("100"),
        planned_downtime_min=Decimal("60"),
        downtime_minutes=[],
        rejection_qtys=[],
    )
    metrics_a = persist_production_record_metrics(db_session, rec_a)
    db_session.flush()
    assert metrics_a.available_time_min == Decimal("0")
    assert metrics_a.availability is None
    assert metrics_a.machine_utilisation is None
    assert metrics_a.oee is None
    flags_a = _sql_null_flags(
        db_session,
        rec_a.id,
        ["availability", "machine_utilisation", "oee", "available_time_min"],
    )
    assert flags_a["availability"] is True
    assert flags_a["machine_utilisation"] is True
    assert flags_a["oee"] is True
    assert flags_a["available_time_min"] is False

    # B. run_time = 0 (available 100, idle 100)
    rec_b = _make_production_record(
        db_session,
        masters,
        start_at=base + timedelta(hours=2),
        stop_at=base + timedelta(hours=2, minutes=160),
        cavity_count=Decimal("2"),
        cycle_time_sec=Decimal("60"),
        produced_qty=Decimal("100"),
        planned_downtime_min=Decimal("60"),
        downtime_minutes=[Decimal("100")],
        rejection_qtys=[],
    )
    metrics_b = persist_production_record_metrics(db_session, rec_b)
    db_session.flush()
    assert metrics_b.run_time_min == Decimal("0")
    assert metrics_b.actual_qty_per_hr is None
    assert metrics_b.performance is None
    assert metrics_b.availability == Decimal("0")
    assert metrics_b.oee is None
    flags_b = _sql_null_flags(
        db_session,
        rec_b.id,
        ["actual_qty_per_hr", "performance", "oee", "availability"],
    )
    assert flags_b["actual_qty_per_hr"] is True
    assert flags_b["performance"] is True
    assert flags_b["oee"] is True
    assert flags_b["availability"] is False

    # C. produced_qty = 0
    rec_c = _make_production_record(
        db_session,
        masters,
        start_at=base + timedelta(hours=6),
        stop_at=base + timedelta(hours=6, minutes=720),
        cavity_count=Decimal("2"),
        cycle_time_sec=Decimal("60"),
        produced_qty=Decimal("0"),
        planned_downtime_min=Decimal("60"),
        downtime_minutes=[Decimal("20")],
        rejection_qtys=[Decimal("1")],
    )
    metrics_c = persist_production_record_metrics(db_session, rec_c)
    db_session.flush()
    assert metrics_c.rejection_ppm is None
    assert metrics_c.quality is None
    assert metrics_c.oee is None
    assert metrics_c.actual_qty_per_hr == Decimal("0")
    flags_c = _sql_null_flags(
        db_session,
        rec_c.id,
        ["rejection_ppm", "quality", "oee", "actual_qty_per_hr"],
    )
    assert flags_c["rejection_ppm"] is True
    assert flags_c["quality"] is True
    assert flags_c["oee"] is True
    assert flags_c["actual_qty_per_hr"] is False


# --- D: Q1 stop < start ---


def test_q1_stop_before_start_no_plus_24h(db_session: Session) -> None:
    masters = _seed_masters(db_session)
    start = datetime(2024, 1, 21, 20, 0, tzinfo=timezone.utc)
    stop = datetime(2024, 1, 21, 8, 0, tzinfo=timezone.utc)  # earlier same calendar day

    record = _make_production_record(
        db_session,
        masters,
        start_at=start,
        stop_at=stop,
        cavity_count=Decimal("2"),
        cycle_time_sec=Decimal("60"),
        produced_qty=Decimal("1200"),
        planned_downtime_min=Decimal("60"),
        downtime_minutes=[Decimal("20")],
        rejection_qtys=[Decimal("15")],
    )
    calc = calculate_oee_metrics(
        start_at=start,
        stop_at=stop,
        cavity_count=Decimal("2"),
        cycle_time_sec=Decimal("60"),
        produced_qty=Decimal("1200"),
        planned_downtime_min=Decimal("60"),
        downtime_minutes=[Decimal("20")],
        rejection_qtys=[Decimal("15")],
    )
    assert calc.q1_midnight_unresolved is True
    assert calc.shift_time_min is None
    # Absolute overnight duration would be 12h = 720 — must NOT appear.
    assert calc.shift_time_min != Decimal("720")

    metrics = persist_production_record_metrics(db_session, record)
    db_session.flush()
    assert metrics.shift_time_min is None
    assert metrics.available_time_min is None
    assert metrics.run_time_min is None
    assert metrics.availability is None
    assert metrics.performance is None
    assert metrics.machine_utilisation is None
    assert metrics.oee is None
    # Non-time fields still mapped from calculator.
    assert metrics.target_qty_per_hr == Decimal("120")
    assert metrics.total_idle_time_min == Decimal("20")
    assert metrics.total_rejection_qty == Decimal("15")
    assert metrics.quality == Decimal("0.9875")
    assert metrics.formula_version == FORMULA_VERSION

    flags = _sql_null_flags(
        db_session,
        record.id,
        [
            "shift_time_min",
            "available_time_min",
            "run_time_min",
            "availability",
            "performance",
            "machine_utilisation",
            "oee",
            "target_qty_per_hr",
            "quality",
        ],
    )
    for col in (
        "shift_time_min",
        "available_time_min",
        "run_time_min",
        "availability",
        "performance",
        "machine_utilisation",
        "oee",
    ):
        assert flags[col] is True
    assert flags["target_qty_per_hr"] is False
    assert flags["quality"] is False


# --- E: cavity = 0 or cycle_time = 0 ---


def test_zero_cavity_or_cycle_null_target(db_session: Session) -> None:
    masters = _seed_masters(db_session)
    base = datetime(2024, 1, 24, 8, 30, tzinfo=timezone.utc)
    stop = base + timedelta(minutes=720)

    # cavity = 0
    rec_cav = _make_production_record(
        db_session,
        masters,
        start_at=base,
        stop_at=stop,
        cavity_count=Decimal("0"),
        cycle_time_sec=Decimal("60"),
        produced_qty=Decimal("1200"),
        planned_downtime_min=Decimal("60"),
        downtime_minutes=[Decimal("20")],
        rejection_qtys=[Decimal("15")],
    )
    m_cav = persist_production_record_metrics(db_session, rec_cav)
    db_session.flush()
    assert m_cav.target_qty_per_hr is None
    assert m_cav.performance is None
    assert m_cav.machine_utilisation is None
    assert m_cav.oee is None
    assert m_cav.shift_time_min == Decimal("720")
    assert m_cav.availability is not None

    # cycle_time = 0
    rec_cyc = _make_production_record(
        db_session,
        masters,
        start_at=base + timedelta(days=1),
        stop_at=stop + timedelta(days=1),
        cavity_count=Decimal("2"),
        cycle_time_sec=Decimal("0"),
        produced_qty=Decimal("1200"),
        planned_downtime_min=Decimal("60"),
        downtime_minutes=[Decimal("20")],
        rejection_qtys=[Decimal("15")],
    )
    m_cyc = persist_production_record_metrics(db_session, rec_cyc)
    db_session.flush()
    assert m_cyc.target_qty_per_hr is None
    assert m_cyc.performance is None
    assert m_cyc.machine_utilisation is None
    assert m_cyc.oee is None


# --- G: round-trip NULL → Python None (never zero) ---


def test_null_round_trip_returns_python_none(db_session: Session) -> None:
    masters = _seed_masters(db_session)
    base = datetime(2024, 1, 25, 8, 0, tzinfo=timezone.utc)
    record = _make_production_record(
        db_session,
        masters,
        start_at=base,
        stop_at=base + timedelta(minutes=60),
        cavity_count=Decimal("2"),
        cycle_time_sec=Decimal("60"),
        produced_qty=Decimal("100"),
        planned_downtime_min=Decimal("60"),
        downtime_minutes=[],
        rejection_qtys=[],
    )
    persist_production_record_metrics(db_session, record)
    db_session.flush()
    db_session.expire_all()

    reloaded = db_session.get(ProductionRecordMetrics, record.id)
    assert reloaded is not None
    assert reloaded.availability is None
    assert reloaded.machine_utilisation is None
    assert reloaded.oee is None
    assert reloaded.available_time_min == Decimal("0")
    # Explicitly not zero for undefined ratios.
    assert reloaded.availability != Decimal("0")
    assert reloaded.oee != Decimal("0")


# --- H: upsert complete → undefined (NULL) without duplicate ---


def test_upsert_complete_to_undefined_nulls(db_session: Session) -> None:
    masters = _seed_masters(db_session)
    start = datetime(2024, 1, 26, 8, 30, tzinfo=timezone.utc)
    stop = start + timedelta(minutes=720)
    record = _make_production_record(
        db_session,
        masters,
        start_at=start,
        stop_at=stop,
        **ROW5,
    )
    first = persist_production_record_metrics(db_session, record)
    db_session.flush()
    assert first.oee is not None
    assert first.quality is not None
    assert _count_metrics(db_session, record.id) == 1

    # Make quality/PPM/OEE undefined by setting produced_qty = 0.
    record.produced_qty = Decimal("0")
    db_session.flush()
    second = persist_production_record_metrics(db_session, record)
    db_session.flush()

    assert _count_metrics(db_session, record.id) == 1
    assert second.production_record_id == first.production_record_id
    assert second.rejection_ppm is None
    assert second.quality is None
    assert second.oee is None
    assert second.actual_qty_per_hr == Decimal("0")
    flags = _sql_null_flags(
        db_session, record.id, ["rejection_ppm", "quality", "oee"]
    )
    assert flags["rejection_ppm"] is True
    assert flags["quality"] is True
    assert flags["oee"] is True


# --- I: rejection > produced — CHECK quality/oee >= 0 still blocks ---


def test_rejection_greater_than_produced_check_still_blocks(
    db_session: Session,
) -> None:
    """Document Migration 006 CHECK (quality >= 0) / (oee >= 0) behaviour.

    Calculator allows negative quality (no clamp). Migration 015 does NOT
    relax those CHECKs — flush still raises IntegrityError. Out of scope.
    """
    masters = _seed_masters(db_session)
    start = datetime(2024, 1, 27, 8, 30, tzinfo=timezone.utc)
    stop = start + timedelta(minutes=720)
    record = _make_production_record(
        db_session,
        masters,
        start_at=start,
        stop_at=stop,
        cavity_count=Decimal("2"),
        cycle_time_sec=Decimal("60"),
        produced_qty=Decimal("10"),
        planned_downtime_min=Decimal("60"),
        downtime_minutes=[Decimal("20")],
        rejection_qtys=[Decimal("25")],  # rejection > produced → quality < 0
    )
    calc = calculate_oee_metrics(
        shift_time_min=720,
        cavity_count=Decimal("2"),
        cycle_time_sec=Decimal("60"),
        produced_qty=Decimal("10"),
        planned_downtime_min=Decimal("60"),
        downtime_minutes=[Decimal("20")],
        rejection_qtys=[Decimal("25")],
    )
    assert calc.quality is not None and calc.quality < 0
    assert calc.oee is not None and calc.oee < 0

    with pytest.raises(IntegrityError):
        with db_session.begin_nested():
            metrics = persist_production_record_metrics(db_session, record)
            assert metrics.quality is not None and metrics.quality < 0
            db_session.flush()


def test_formula_metadata(db_session: Session) -> None:
    """formula_version=1 persisted; formula_key is service constant only (no column)."""
    masters = _seed_masters(db_session)
    start = datetime(2024, 1, 22, 8, 30, tzinfo=timezone.utc)
    stop = start + timedelta(minutes=720)
    record = _make_production_record(
        db_session,
        masters,
        start_at=start,
        stop_at=stop,
        **ROW5,
    )
    metrics = persist_production_record_metrics(db_session, record)
    db_session.flush()

    assert FORMULA_KEY == "dpr_oee_v1"
    assert metrics.formula_version == 1
    assert metrics.formula_version == FORMULA_VERSION
    # Migration 006: formula_key is not a DB column — registry string only.
    assert "formula_key" not in ProductionRecordMetrics.__table__.c


def test_no_leftover_rows_after_rollback(db_session: Session) -> None:
    """Sanity: counts inside the transaction are local; outer rollback cleans up."""
    masters = _seed_masters(db_session)
    start = datetime(2024, 1, 23, 8, 30, tzinfo=timezone.utc)
    stop = start + timedelta(minutes=720)
    record = _make_production_record(
        db_session,
        masters,
        start_at=start,
        stop_at=stop,
        **ROW5,
    )
    persist_production_record_metrics(db_session, record)
    db_session.flush()
    assert _count_metrics(db_session, record.id) == 1
    # Fixture rollback removes these — verified by separate post-suite check
    # in validation (no permanent production_records for test plant codes).
