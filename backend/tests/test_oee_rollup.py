"""Tests for Q6 OEE ratio-of-sums rollup service.

Uses Compose Postgres (127.0.0.1:5433 / pril_analytics) inside a rolled-back
outer transaction so no temporary masters/production/snapshot rows remain.

Covers validation items 1–20 (+ leftover / department rejection). Prior suites
must remain green; Alembic head stays 015 (no schema changes).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.db.session import get_engine
from app.models.downtime_event import DowntimeEvent
from app.models.downtime_reason import DowntimeReason
from app.models.line import Line
from app.models.machine import Machine
from app.models.machine_status import MachineStatus
from app.models.machine_type import MachineType
from app.models.oee_snapshot import OeeSnapshot
from app.models.part import Part
from app.models.plant import Plant
from app.models.production_record import ProductionRecord
from app.models.production_record_metrics import ProductionRecordMetrics
from app.models.rejection_event import RejectionEvent
from app.models.rejection_reason import RejectionReason
from app.models.shift import Shift
from app.services.oee_calculator import FORMULA_VERSION, calculate_oee_metrics
from app.services.oee_persistence import persist_production_record_metrics
from app.services.oee_rollup import (
    AGGREGATION_RULE_KEY,
    AGGREGATION_RULE_VERSION,
    OeeRollupSourceRow,
    compute_oee_components,
    iso_week_period_start,
    month_period_start,
    period_date_bounds,
    period_start_for,
    rollup_for_period,
    rollup_line_day,
    rollup_machine_day,
    rollup_plant_day,
    upsert_oee_snapshot,
)

# --- DPR_OEE approved fixtures (rows 5–6) ---

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

# Approved Q6 design example (~84.48%)
ROWS_5_6_EXPECTED_OEE = (
    (Decimal("1310") / Decimal("1350"))
    * (Decimal("2300") / Decimal("2620"))
    * (Decimal("2281") / Decimal("2300"))
)


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


def _seed_masters(
    session: Session,
    *,
    with_line: bool = False,
) -> dict[str, object]:
    plant = Plant(
        code=_uid("PLT"),
        name="OEE Rollup Test Plant",
        timezone="Asia/Kolkata",
        is_active=True,
    )
    session.add(plant)
    session.flush()

    line: Line | None = None
    if with_line:
        line = Line(plant_id=plant.id, code=_uid("LN"), name="Line A")
        session.add(line)
        session.flush()

    mtype = MachineType(code=_uid("MT"), name="Test Type", is_active=True)
    mstatus = MachineStatus(code=_uid("MS"), name="Active", is_active=True)
    session.add_all([mtype, mstatus])
    session.flush()

    machine = Machine(
        plant_id=plant.id,
        line_id=line.id if line is not None else None,
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
        "line": line,
        "machine": machine,
        "shift": shift,
        "part": part,
        "mtype": mtype,
        "mstatus": mstatus,
    }


def _add_machine(
    session: Session,
    masters: dict[str, object],
    *,
    line_id: uuid.UUID | None = None,
    code: str | None = None,
) -> Machine:
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    mtype: MachineType = masters["mtype"]  # type: ignore[assignment]
    mstatus: MachineStatus = masters["mstatus"]  # type: ignore[assignment]
    machine = Machine(
        plant_id=plant.id,
        line_id=line_id,
        code=code or _uid("MC"),
        name="Extra Machine",
        machine_type_id=mtype.id,
        status_id=mstatus.id,
    )
    session.add(machine)
    session.flush()
    return machine


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
    machine: Machine | None = None,
    part: Part | None = None,
    production_date: date | None = None,
) -> ProductionRecord:
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    shift: Shift = masters["shift"]  # type: ignore[assignment]
    machine = machine or masters["machine"]  # type: ignore[assignment]
    part = part or masters["part"]  # type: ignore[assignment]

    record = ProductionRecord(
        plant_id=plant.id,
        machine_id=machine.id,
        shift_id=shift.id,
        part_id=part.id,
        production_date=production_date or start_at.date(),
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


def _persist_row(
    session: Session,
    masters: dict[str, object],
    fixture: dict,
    *,
    day: date,
    machine: Machine | None = None,
    start_hour: int = 8,
) -> ProductionRecord:
    start = datetime(day.year, day.month, day.day, start_hour, 30, tzinfo=timezone.utc)
    stop = start + timedelta(minutes=720)
    # Distinct part per record when same machine/shift/date/start would collide
    part = Part(code=_uid("PT"), name="Rollup Part")
    session.add(part)
    session.flush()
    record = _make_production_record(
        session,
        masters,
        start_at=start,
        stop_at=stop,
        machine=machine,
        part=part,
        production_date=day,
        **fixture,
    )
    persist_production_record_metrics(session, record)
    session.flush()
    return record


def _count_snapshots(session: Session) -> int:
    return int(session.scalar(select(func.count()).select_from(OeeSnapshot)) or 0)


def _source_from_metrics(
    record: ProductionRecord, metrics: ProductionRecordMetrics
) -> OeeRollupSourceRow:
    return OeeRollupSourceRow(
        run_time_min=metrics.run_time_min,
        available_time_min=metrics.available_time_min,
        target_qty_per_hr=metrics.target_qty_per_hr,
        produced_qty=record.produced_qty,
        total_rejection_qty=metrics.total_rejection_qty,
    )


# --- Pure compute (items 1–6, 20) ---


def test_1_rollup_oee_not_average_of_row_oee() -> None:
    """Item 1: ratio-of-sums OEE ≠ arithmetic mean of row OEE %."""
    r5 = calculate_oee_metrics(shift_time_min=720, **ROW5)
    r6 = calculate_oee_metrics(shift_time_min=720, **ROW6)
    assert r5.oee is not None and r6.oee is not None
    avg = (r5.oee + r6.oee) / Decimal("2")

    comps = compute_oee_components(
        [
            OeeRollupSourceRow(
                run_time_min=r5.run_time_min,
                available_time_min=r5.available_time_min,
                target_qty_per_hr=r5.target_qty_per_hr,
                produced_qty=ROW5["produced_qty"],
                total_rejection_qty=r5.total_rejection_qty,
            ),
            OeeRollupSourceRow(
                run_time_min=r6.run_time_min,
                available_time_min=r6.available_time_min,
                target_qty_per_hr=r6.target_qty_per_hr,
                produced_qty=ROW6["produced_qty"],
                total_rejection_qty=r6.total_rejection_qty,
            ),
        ]
    )
    assert comps is not None
    assert comps.oee == pytest.approx(ROWS_5_6_EXPECTED_OEE, abs=Decimal("1e-12"))
    assert comps.oee != pytest.approx(avg, abs=Decimal("1e-12"))
    # Design brief: average ≈ 0.845965 vs rollup ≈ 0.844815
    assert avg == pytest.approx(Decimal("0.845965"), abs=Decimal("1e-5"))


def test_2_3_af_runtime_performance_not_ag() -> None:
    """Items 2–3: P uses run-time capacity (AF); AG path differs."""
    r5 = calculate_oee_metrics(shift_time_min=720, **ROW5)
    r6 = calculate_oee_metrics(shift_time_min=720, **ROW6)
    comps = compute_oee_components(
        [
            OeeRollupSourceRow(
                run_time_min=r5.run_time_min,
                available_time_min=r5.available_time_min,
                target_qty_per_hr=r5.target_qty_per_hr,
                produced_qty=ROW5["produced_qty"],
                total_rejection_qty=r5.total_rejection_qty,
            ),
            OeeRollupSourceRow(
                run_time_min=r6.run_time_min,
                available_time_min=r6.available_time_min,
                target_qty_per_hr=r6.target_qty_per_hr,
                produced_qty=ROW6["produced_qty"],
                total_rejection_qty=r6.total_rejection_qty,
            ),
        ]
    )
    assert comps is not None
    assert comps.sum_run_based_capacity == Decimal("2620")
    assert comps.performance == Decimal("2300") / Decimal("2620")

    # AG-style available capacity: 1320 + 1380 = 2700
    ag_capacity = (Decimal("660") / Decimal("60") * Decimal("120")) + (
        Decimal("690") / Decimal("60") * Decimal("120")
    )
    assert ag_capacity == Decimal("2700")
    ag_p = Decimal("2300") / ag_capacity
    assert comps.performance != pytest.approx(ag_p, abs=Decimal("1e-12"))
    # OEE must use AF path product, not AG
    ag_oee = comps.availability * ag_p * comps.quality
    assert comps.oee != pytest.approx(ag_oee, abs=Decimal("1e-12"))
    assert AGGREGATION_RULE_KEY == "ratio_of_sums_runtime"


def test_4_5_6_20_ratio_of_sums_a_q_oee_sample_rows() -> None:
    """Items 4–6, 20: A/Q/OEE from sums; rows 5–6 ≈ 84.48%."""
    comps = compute_oee_components(
        [
            OeeRollupSourceRow(
                run_time_min=Decimal("640"),
                available_time_min=Decimal("660"),
                target_qty_per_hr=Decimal("120"),
                produced_qty=Decimal("1200"),
                total_rejection_qty=Decimal("15"),
            ),
            OeeRollupSourceRow(
                run_time_min=Decimal("670"),
                available_time_min=Decimal("690"),
                target_qty_per_hr=Decimal("120"),
                produced_qty=Decimal("1100"),
                total_rejection_qty=Decimal("4"),
            ),
        ]
    )
    assert comps is not None
    assert comps.sum_run_time_min == Decimal("1310")
    assert comps.sum_available_time_min == Decimal("1350")
    assert comps.sum_produced_qty == Decimal("2300")
    assert comps.sum_good_qty == Decimal("2281")
    assert comps.sum_rejection_qty == Decimal("19")
    assert comps.availability == Decimal("1310") / Decimal("1350")
    assert comps.quality == Decimal("2281") / Decimal("2300")
    assert comps.oee == pytest.approx(ROWS_5_6_EXPECTED_OEE, abs=Decimal("1e-12"))
    assert comps.oee == pytest.approx(Decimal("0.844815"), abs=Decimal("1e-6"))


def test_period_helpers_iso_week_and_month() -> None:
    """Week = ISO Monday (ASSUMED); month = 1st; day = date itself."""
    d = date(2024, 1, 17)  # Wednesday
    assert period_start_for(d, "day") == d
    assert iso_week_period_start(d) == date(2024, 1, 15)
    assert period_start_for(d, "week") == date(2024, 1, 15)
    assert month_period_start(d) == date(2024, 1, 1)
    assert period_start_for(d, "month") == date(2024, 1, 1)
    assert period_date_bounds("week", date(2024, 1, 15)) == (
        date(2024, 1, 15),
        date(2024, 1, 21),
    )
    assert period_date_bounds("month", date(2024, 1, 1)) == (
        date(2024, 1, 1),
        date(2024, 1, 31),
    )


# --- DB integration ---


def test_7_machine_day_rollup(db_session: Session) -> None:
    """Item 7: machine × day."""
    masters = _seed_masters(db_session)
    machine: Machine = masters["machine"]  # type: ignore[assignment]
    day = date(2024, 2, 5)
    _persist_row(db_session, masters, ROW5, day=day)
    _persist_row(db_session, masters, ROW6, day=day, start_hour=9)

    snap = rollup_machine_day(db_session, machine.id, day)
    db_session.flush()
    assert snap is not None
    assert snap.scope_type == "machine"
    assert snap.scope_id == machine.id
    assert snap.period_type == "day"
    assert snap.period_start == day
    assert snap.aggregation_rule_version == AGGREGATION_RULE_VERSION
    assert snap.oee == pytest.approx(ROWS_5_6_EXPECTED_OEE, abs=Decimal("1e-8"))


def test_8_machine_week_rollup(db_session: Session) -> None:
    """Item 8: machine × ISO week (Mon–Sun)."""
    masters = _seed_masters(db_session)
    machine: Machine = masters["machine"]  # type: ignore[assignment]
    mon = date(2024, 2, 5)  # Monday
    wed = date(2024, 2, 7)
    _persist_row(db_session, masters, ROW5, day=mon)
    _persist_row(db_session, masters, ROW6, day=wed)

    week_start = iso_week_period_start(wed)
    assert week_start == mon
    snap = rollup_for_period(
        db_session, "machine", machine.id, "week", week_start
    )
    db_session.flush()
    assert snap is not None
    assert snap.period_type == "week"
    assert snap.period_start == mon
    assert snap.oee == pytest.approx(ROWS_5_6_EXPECTED_OEE, abs=Decimal("1e-8"))


def test_9_machine_month_rollup(db_session: Session) -> None:
    """Item 9: machine × calendar month."""
    masters = _seed_masters(db_session)
    machine: Machine = masters["machine"]  # type: ignore[assignment]
    _persist_row(db_session, masters, ROW5, day=date(2024, 3, 2))
    _persist_row(db_session, masters, ROW6, day=date(2024, 3, 28))
    # Outside month — must not be included
    _persist_row(db_session, masters, ROW5, day=date(2024, 4, 1))

    snap = rollup_for_period(
        db_session, "machine", machine.id, "month", date(2024, 3, 1)
    )
    db_session.flush()
    assert snap is not None
    assert snap.period_start == date(2024, 3, 1)
    assert snap.sum_produced_qty == Decimal("2300")
    assert snap.oee == pytest.approx(ROWS_5_6_EXPECTED_OEE, abs=Decimal("1e-8"))


def test_10_plant_day_rollup(db_session: Session) -> None:
    """Item 10: plant sums across machines."""
    masters = _seed_masters(db_session)
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    m2 = _add_machine(db_session, masters)
    day = date(2024, 4, 10)
    _persist_row(db_session, masters, ROW5, day=day)
    _persist_row(db_session, masters, ROW6, day=day, machine=m2)

    snap = rollup_plant_day(db_session, plant.id, day)
    db_session.flush()
    assert snap is not None
    assert snap.scope_type == "plant"
    assert snap.scope_id == plant.id
    assert snap.oee == pytest.approx(ROWS_5_6_EXPECTED_OEE, abs=Decimal("1e-8"))


def test_11_12_line_mapped_only_excludes_unmapped(db_session: Session) -> None:
    """Items 11–12: line includes mapped machines; excludes null line_id."""
    masters = _seed_masters(db_session, with_line=True)
    line: Line = masters["line"]  # type: ignore[assignment]
    mapped: Machine = masters["machine"]  # type: ignore[assignment]
    unmapped = _add_machine(db_session, masters, line_id=None)
    day = date(2024, 5, 1)

    _persist_row(db_session, masters, ROW5, day=day, machine=mapped)
    _persist_row(db_session, masters, ROW6, day=day, machine=unmapped)

    line_snap = rollup_line_day(db_session, line.id, day)
    plant: Plant = masters["plant"]  # type: ignore[assignment]
    plant_snap = rollup_plant_day(db_session, plant.id, day)
    db_session.flush()

    assert line_snap is not None
    # Only ROW5 on the line
    assert line_snap.sum_produced_qty == Decimal("1200")
    assert line_snap.sum_run_time_min == Decimal("640")
    assert line_snap.oee == pytest.approx(
        Decimal("640")
        / Decimal("660")
        * Decimal("0.9375")
        * Decimal("0.9875"),
        abs=Decimal("1e-8"),
    )

    assert plant_snap is not None
    assert plant_snap.sum_produced_qty == Decimal("2300")
    assert plant_snap.oee == pytest.approx(ROWS_5_6_EXPECTED_OEE, abs=Decimal("1e-8"))


def test_13_null_incomplete_row_excluded(db_session: Session) -> None:
    """Item 13: NULL component rows excluded (all-or-nothing)."""
    masters = _seed_masters(db_session)
    machine: Machine = masters["machine"]  # type: ignore[assignment]
    day = date(2024, 6, 1)
    good = _persist_row(db_session, masters, ROW5, day=day)

    # Incomplete metrics row: NULL run/available/target
    part = Part(code=_uid("PT"), name="Incomplete")
    session = db_session
    session.add(part)
    session.flush()
    start = datetime(2024, 6, 1, 10, 0, tzinfo=timezone.utc)
    bad = ProductionRecord(
        plant_id=masters["plant"].id,  # type: ignore[union-attr]
        machine_id=machine.id,
        shift_id=masters["shift"].id,  # type: ignore[union-attr]
        part_id=part.id,
        production_date=day,
        start_at=start,
        stop_at=start + timedelta(minutes=60),
        cavity_count=Decimal("2"),
        cycle_time_sec=Decimal("60"),
        produced_qty=Decimal("999"),
        planned_downtime_min=Decimal("0"),
        status="draft",
    )
    session.add(bad)
    session.flush()
    session.add(
        ProductionRecordMetrics(
            production_record_id=bad.id,
            shift_time_min=None,
            available_time_min=None,
            total_idle_time_min=Decimal("0"),
            run_time_min=None,
            target_qty_per_hr=None,
            actual_qty_per_hr=None,
            availability=None,
            performance=None,
            machine_utilisation=None,
            total_rejection_qty=Decimal("0"),
            rejection_ppm=None,
            quality=None,
            oee=None,
            formula_version=FORMULA_VERSION,
            computed_at=datetime.now(timezone.utc),
        )
    )
    session.flush()

    snap = rollup_machine_day(db_session, machine.id, day)
    db_session.flush()
    assert snap is not None
    assert snap.sum_produced_qty == good.produced_qty
    assert snap.sum_produced_qty == Decimal("1200")


def test_14_q1_overnight_not_repaired(db_session: Session) -> None:
    """Item 14: stop_at < start_at → NULL metrics; not repaired; excluded."""
    masters = _seed_masters(db_session)
    machine: Machine = masters["machine"]  # type: ignore[assignment]
    day = date(2024, 7, 1)
    _persist_row(db_session, masters, ROW5, day=day)

    part = Part(code=_uid("PT"), name="Q1 overnight")
    db_session.add(part)
    db_session.flush()
    # Same calendar date but stop before start (Q1 TBC — calculator leaves NULL)
    start = datetime(2024, 7, 1, 22, 0, tzinfo=timezone.utc)
    stop = datetime(2024, 7, 1, 6, 0, tzinfo=timezone.utc)
    assert stop < start
    overnight = _make_production_record(
        db_session,
        masters,
        start_at=start,
        stop_at=stop,
        part=part,
        production_date=day,
        **ROW6,
    )
    metrics = persist_production_record_metrics(db_session, overnight)
    db_session.flush()
    # Calculator leaves time metrics NULL — rollup must not invent +24h
    assert metrics.run_time_min is None
    assert metrics.available_time_min is None
    assert metrics.target_qty_per_hr is not None  # cavity/cycle still defined
    # production_date unchanged (Q1 not resolved here)
    assert overnight.production_date == day

    snap = rollup_machine_day(db_session, machine.id, day)
    db_session.flush()
    assert snap is not None
    # Only ROW5 counted — overnight excluded, not +24h-repaired into ROW6 math
    assert snap.sum_produced_qty == Decimal("1200")
    assert snap.sum_run_time_min == Decimal("640")


def test_15_formula_version_isolation(db_session: Session) -> None:
    """Item 15: only mix matching formula_version."""
    masters = _seed_masters(db_session)
    machine: Machine = masters["machine"]  # type: ignore[assignment]
    day = date(2024, 8, 1)
    _persist_row(db_session, masters, ROW5, day=day)
    r6 = _persist_row(db_session, masters, ROW6, day=day, start_hour=9)

    # Re-tag ROW6 metrics as a different formula_version
    m6 = db_session.get(ProductionRecordMetrics, r6.id)
    assert m6 is not None
    m6.formula_version = 99
    db_session.flush()

    snap_v1 = rollup_for_period(
        db_session, "machine", machine.id, "day", day, formula_version=1
    )
    db_session.flush()
    assert snap_v1 is not None
    assert snap_v1.sum_produced_qty == Decimal("1200")
    v1_oee = snap_v1.oee

    # formula_version is a source filter — not part of snapshot uniqueness.
    # A rollup pinned to v99 only sees ROW6 and upserts the same key.
    snap_v99 = rollup_for_period(
        db_session, "machine", machine.id, "day", day, formula_version=99
    )
    db_session.flush()
    assert snap_v99 is not None
    assert snap_v99.id == snap_v1.id
    assert snap_v99.sum_produced_qty == Decimal("1100")
    assert snap_v99.oee != pytest.approx(v1_oee, abs=Decimal("1e-12"))


def test_16_aggregation_rule_version_constant(db_session: Session) -> None:
    """Item 16: aggregation_rule_version written from service constant."""
    masters = _seed_masters(db_session)
    machine: Machine = masters["machine"]  # type: ignore[assignment]
    day = date(2024, 9, 1)
    _persist_row(db_session, masters, ROW5, day=day)

    snap = rollup_machine_day(db_session, machine.id, day)
    db_session.flush()
    assert snap is not None
    assert AGGREGATION_RULE_VERSION == 1
    assert snap.aggregation_rule_version == AGGREGATION_RULE_VERSION
    assert AGGREGATION_RULE_KEY == "ratio_of_sums_runtime"


def test_17_idempotent_rerun(db_session: Session) -> None:
    """Item 17: rerun upserts same unique key — no duplicates."""
    masters = _seed_masters(db_session)
    machine: Machine = masters["machine"]  # type: ignore[assignment]
    day = date(2024, 10, 1)
    _persist_row(db_session, masters, ROW5, day=day)
    _persist_row(db_session, masters, ROW6, day=day, start_hour=9)

    first = rollup_machine_day(db_session, machine.id, day)
    db_session.flush()
    first_id = first.id  # type: ignore[union-attr]
    first_oee = first.oee  # type: ignore[union-attr]

    second = rollup_machine_day(db_session, machine.id, day)
    db_session.flush()

    assert second is not None
    assert second.id == first_id
    assert second.oee == first_oee
    count = db_session.scalar(
        select(func.count())
        .select_from(OeeSnapshot)
        .where(
            OeeSnapshot.scope_type == "machine",
            OeeSnapshot.scope_id == machine.id,
            OeeSnapshot.period_type == "day",
            OeeSnapshot.period_start == day,
            OeeSnapshot.aggregation_rule_version == AGGREGATION_RULE_VERSION,
        )
    )
    assert count == 1


def test_18_zero_denominators_skip_snapshot(db_session: Session) -> None:
    """Item 18: zero period denominators → no fabricated 0% snapshot."""
    # Pure: empty / zero capacity
    assert compute_oee_components([]) is None
    assert (
        compute_oee_components(
            [
                OeeRollupSourceRow(
                    run_time_min=Decimal("0"),
                    available_time_min=Decimal("0"),
                    target_qty_per_hr=Decimal("120"),
                    produced_qty=Decimal("100"),
                    total_rejection_qty=Decimal("0"),
                )
            ]
        )
        is None
    )
    assert (
        compute_oee_components(
            [
                OeeRollupSourceRow(
                    run_time_min=Decimal("60"),
                    available_time_min=Decimal("100"),
                    target_qty_per_hr=Decimal("120"),
                    produced_qty=Decimal("0"),
                    total_rejection_qty=Decimal("0"),
                )
            ]
        )
        is None
    )

    masters = _seed_masters(db_session)
    machine: Machine = masters["machine"]  # type: ignore[assignment]
    day = date(2024, 11, 1)
    # No rows at all
    before = _count_snapshots(db_session)
    snap = rollup_machine_day(db_session, machine.id, day)
    db_session.flush()
    assert snap is None
    assert _count_snapshots(db_session) == before


def test_19_no_department_snapshot(db_session: Session) -> None:
    """Item 19: department scope rejected (not on oee_snapshots)."""
    with pytest.raises(ValueError, match="department"):
        rollup_for_period(
            db_session,
            "department",
            uuid.uuid4(),
            "day",
            date(2024, 1, 1),
        )
    # Service also rejects unknown scopes
    with pytest.raises(ValueError, match="unsupported scope_type"):
        rollup_for_period(
            db_session,
            "area",
            uuid.uuid4(),
            "day",
            date(2024, 1, 1),
        )


def test_null_source_row_skipped_in_compute() -> None:
    """NULL any required field → exclude; remaining rows still roll up."""
    comps = compute_oee_components(
        [
            OeeRollupSourceRow(
                run_time_min=None,
                available_time_min=Decimal("660"),
                target_qty_per_hr=Decimal("120"),
                produced_qty=Decimal("1200"),
                total_rejection_qty=Decimal("15"),
            ),
            OeeRollupSourceRow(
                run_time_min=Decimal("640"),
                available_time_min=Decimal("660"),
                target_qty_per_hr=Decimal("120"),
                produced_qty=Decimal("1200"),
                total_rejection_qty=Decimal("15"),
            ),
        ]
    )
    assert comps is not None
    assert comps.row_count == 1
    assert comps.sum_produced_qty == Decimal("1200")


def test_upsert_writes_existing_columns_only(db_session: Session) -> None:
    masters = _seed_masters(db_session)
    comps = compute_oee_components(
        [
            OeeRollupSourceRow(
                run_time_min=Decimal("640"),
                available_time_min=Decimal("660"),
                target_qty_per_hr=Decimal("120"),
                produced_qty=Decimal("1200"),
                total_rejection_qty=Decimal("15"),
            )
        ]
    )
    assert comps is not None
    snap = upsert_oee_snapshot(
        db_session,
        scope_type="plant",
        scope_id=masters["plant"].id,  # type: ignore[union-attr]
        period_type="day",
        period_start=date(2024, 12, 1),
        components=comps,
    )
    db_session.flush()
    assert snap.availability == comps.availability
    assert snap.performance == comps.performance
    assert snap.quality == comps.quality
    assert snap.oee == comps.oee


def test_no_leftover_oee_snapshots_after_rollback(db_session: Session) -> None:
    """Leftover gate: live DB outside txn stays clean; local work rolls back."""
    masters = _seed_masters(db_session)
    machine: Machine = masters["machine"]  # type: ignore[assignment]
    day = date(2024, 12, 15)
    _persist_row(db_session, masters, ROW5, day=day)
    snap = rollup_machine_day(db_session, machine.id, day)
    db_session.flush()
    assert snap is not None
    assert _count_snapshots(db_session) >= 1

    # Separate connection must not see uncommitted rollup rows
    engine = get_engine()
    with engine.connect() as conn:
        for table in (
            "oee_snapshots",
            "production_records",
            "production_record_metrics",
        ):
            count = conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
            assert count == 0, f"expected 0 leftover rows in {table}, got {count}"
