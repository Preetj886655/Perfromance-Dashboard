"""Dashboard read-only OEE API tests.

Uses Compose Postgres (127.0.0.1:5433 / pril_analytics) inside a rolled-back
outer transaction. Snapshots are seeded directly into ``oee_snapshots`` (no
schema invention; no permanent seeds).

Covers validation items 1–19. Prior suites must remain green; Alembic head 015.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.db.session import get_db, get_engine
from app.main import app
from app.models.line import Line
from app.models.machine import Machine
from app.models.machine_status import MachineStatus
from app.models.machine_type import MachineType
from app.models.oee_snapshot import OeeSnapshot
from app.models.plant import Plant
from app.services.oee_rollup import AGGREGATION_RULE_VERSION
from tests.auth_helpers import make_auth_headers


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


@pytest.fixture
def client(db_session: Session) -> TestClient:
    """TestClient with get_db overridden and a valid auth header for protected routes."""
    _, auth_headers = make_auth_headers(db_session, role_code="SUPER_ADMIN")

    def _override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as test_client:
        original_get = test_client.get
        original_post = test_client.post

        def _with_auth(method):
            def wrapped(url, *args, **kwargs):
                kwargs_headers = dict(kwargs.pop("headers", {}) or {})
                if not str(url).startswith("/api/v1/auth") and str(url) != "/api/v1/health":
                    kwargs_headers.setdefault("Authorization", auth_headers["Authorization"])
                kwargs["headers"] = kwargs_headers
                return method(url, *args, **kwargs)

            return wrapped

        test_client.get = _with_auth(original_get)
        test_client.post = _with_auth(original_post)
        yield test_client
    app.dependency_overrides.clear()


def _uid(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _seed_org(session: Session, *, with_line: bool = True) -> dict[str, object]:
    plant = Plant(
        code=_uid("PLT"),
        name="Dashboard Test Plant",
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

    mtype = MachineType(code=_uid("MT"), name="Type", is_active=True)
    mstatus = MachineStatus(code=_uid("MS"), name="Active", is_active=True)
    session.add_all([mtype, mstatus])
    session.flush()

    machine = Machine(
        plant_id=plant.id,
        line_id=line.id if line is not None else None,
        code=_uid("MC"),
        name="Machine A",
        machine_type_id=mtype.id,
        status_id=mstatus.id,
    )
    session.add(machine)
    session.flush()

    return {
        "plant": plant,
        "line": line,
        "machine": machine,
        "mtype": mtype,
        "mstatus": mstatus,
    }


def _snapshot(
    session: Session,
    *,
    scope_type: str,
    scope_id: uuid.UUID,
    period_type: str,
    period_start: date,
    availability: Decimal = Decimal("0.90000000"),
    performance: Decimal = Decimal("0.85000000"),
    quality: Decimal = Decimal("0.95000000"),
    oee: Decimal | None = None,
    aggregation_rule_version: int = AGGREGATION_RULE_VERSION,
    computed_at: datetime | None = None,
    sum_run_time_min: Decimal = Decimal("900"),
    sum_available_time_min: Decimal = Decimal("1000"),
    sum_produced_qty: Decimal = Decimal("1000"),
    sum_good_qty: Decimal = Decimal("950"),
    sum_rejection_qty: Decimal = Decimal("50"),
    sum_run_based_capacity: Decimal = Decimal("1176.4706"),
) -> OeeSnapshot:
    if oee is None:
        oee = availability * performance * quality
    row = OeeSnapshot(
        scope_type=scope_type,
        scope_id=scope_id,
        period_type=period_type,
        period_start=period_start,
        sum_run_time_min=sum_run_time_min,
        sum_available_time_min=sum_available_time_min,
        sum_produced_qty=sum_produced_qty,
        sum_good_qty=sum_good_qty,
        sum_rejection_qty=sum_rejection_qty,
        sum_run_based_capacity=sum_run_based_capacity,
        availability=availability,
        performance=performance,
        quality=quality,
        oee=oee,
        aggregation_rule_version=aggregation_rule_version,
        computed_at=computed_at
        or datetime(2026, 8, 11, 12, 0, 0, tzinfo=timezone.utc),
    )
    session.add(row)
    session.flush()
    return row


# --- 1–3: machine day / week / month ---


def test_dashboard_1_machine_day_oee(
    client: TestClient, db_session: Session
) -> None:
    org = _seed_org(db_session)
    machine: Machine = org["machine"]  # type: ignore[assignment]
    day = date(2026, 8, 10)
    snap = _snapshot(
        db_session,
        scope_type="machine",
        scope_id=machine.id,
        period_type="day",
        period_start=day,
        availability=Decimal("0.97037037"),
        performance=Decimal("0.87786260"),
        quality=Decimal("0.99173913"),
        oee=Decimal("0.84481500"),
    )
    response = client.get(
        "/api/v1/dashboard/oee",
        params={
            "scope_type": "machine",
            "scope_id": str(machine.id),
            "period_type": "day",
            "period_start": day.isoformat(),
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["scope_type"] == "machine"
    assert body["scope_id"] == str(machine.id)
    assert body["period_type"] == "day"
    assert body["period_start"] == day.isoformat()
    assert body["id"] == str(snap.id)
    assert abs(body["oee"] - 0.844815) < 1e-6


def test_dashboard_2_machine_week_oee(
    client: TestClient, db_session: Session
) -> None:
    org = _seed_org(db_session)
    machine: Machine = org["machine"]  # type: ignore[assignment]
    week_start = date(2026, 8, 10)  # Monday
    _snapshot(
        db_session,
        scope_type="machine",
        scope_id=machine.id,
        period_type="week",
        period_start=week_start,
        oee=Decimal("0.80000000"),
    )
    response = client.get(
        "/api/v1/dashboard/oee",
        params={
            "scope_type": "machine",
            "scope_id": str(machine.id),
            "period_type": "week",
            "period_start": week_start.isoformat(),
        },
    )
    assert response.status_code == 200
    assert response.json()["period_type"] == "week"
    assert abs(response.json()["oee"] - 0.8) < 1e-6


def test_dashboard_3_machine_month_oee(
    client: TestClient, db_session: Session
) -> None:
    org = _seed_org(db_session)
    machine: Machine = org["machine"]  # type: ignore[assignment]
    month_start = date(2026, 8, 1)
    _snapshot(
        db_session,
        scope_type="machine",
        scope_id=machine.id,
        period_type="month",
        period_start=month_start,
        oee=Decimal("0.75000000"),
    )
    response = client.get(
        "/api/v1/dashboard/oee",
        params={
            "scope_type": "machine",
            "scope_id": str(machine.id),
            "period_type": "month",
            "period_start": month_start.isoformat(),
        },
    )
    assert response.status_code == 200
    assert response.json()["period_type"] == "month"
    assert abs(response.json()["oee"] - 0.75) < 1e-6


# --- 4–5: line / plant ---


def test_dashboard_4_line_oee(client: TestClient, db_session: Session) -> None:
    org = _seed_org(db_session, with_line=True)
    line: Line = org["line"]  # type: ignore[assignment]
    day = date(2026, 8, 10)
    _snapshot(
        db_session,
        scope_type="line",
        scope_id=line.id,
        period_type="day",
        period_start=day,
        oee=Decimal("0.81000000"),
    )
    response = client.get(
        "/api/v1/dashboard/oee",
        params={
            "scope_type": "line",
            "scope_id": str(line.id),
            "period_type": "day",
            "period_start": day.isoformat(),
        },
    )
    assert response.status_code == 200
    assert response.json()["scope_type"] == "line"
    assert abs(response.json()["oee"] - 0.81) < 1e-6

    # plant lines list
    plant: Plant = org["plant"]  # type: ignore[assignment]
    listed = client.get(
        "/api/v1/dashboard/oee/lines",
        params={
            "plant_id": str(plant.id),
            "period_type": "day",
            "period_start": day.isoformat(),
        },
    )
    assert listed.status_code == 200
    assert listed.json()["count"] == 1
    assert listed.json()["items"][0]["scope_id"] == str(line.id)


def test_dashboard_5_plant_oee(client: TestClient, db_session: Session) -> None:
    org = _seed_org(db_session)
    plant: Plant = org["plant"]  # type: ignore[assignment]
    day = date(2026, 8, 10)
    _snapshot(
        db_session,
        scope_type="plant",
        scope_id=plant.id,
        period_type="day",
        period_start=day,
        oee=Decimal("0.82000000"),
    )
    response = client.get(
        "/api/v1/dashboard/oee",
        params={
            "scope_type": "plant",
            "scope_id": str(plant.id),
            "period_type": "day",
            "period_start": day.isoformat(),
        },
    )
    assert response.status_code == 200
    assert response.json()["scope_type"] == "plant"

    listed = client.get(
        "/api/v1/dashboard/oee/plants",
        params={"period_type": "day", "period_start": day.isoformat()},
    )
    assert listed.status_code == 200
    assert listed.json()["count"] >= 1
    assert any(i["scope_id"] == str(plant.id) for i in listed.json()["items"])

    filtered = client.get(
        "/api/v1/dashboard/oee/plants",
        params={
            "period_type": "day",
            "period_start": day.isoformat(),
            "plant_id": str(plant.id),
        },
    )
    assert filtered.status_code == 200
    assert filtered.json()["count"] == 1


# --- 6: A/P/Q/OEE values ---


def test_dashboard_6_apq_oee_values(
    client: TestClient, db_session: Session
) -> None:
    org = _seed_org(db_session)
    machine: Machine = org["machine"]  # type: ignore[assignment]
    day = date(2026, 8, 10)
    a, p, q = (
        Decimal("0.97037037"),
        Decimal("0.87786260"),
        Decimal("0.99173913"),
    )
    oee = a * p * q
    _snapshot(
        db_session,
        scope_type="machine",
        scope_id=machine.id,
        period_type="day",
        period_start=day,
        availability=a,
        performance=p,
        quality=q,
        oee=oee,
        sum_run_time_min=Decimal("1310"),
        sum_available_time_min=Decimal("1350"),
        sum_produced_qty=Decimal("2300"),
        sum_good_qty=Decimal("2281"),
        sum_rejection_qty=Decimal("19"),
        sum_run_based_capacity=Decimal("2620"),
    )
    body = client.get(
        "/api/v1/dashboard/oee/breakdown",
        params={
            "scope_type": "machine",
            "scope_id": str(machine.id),
            "period_type": "day",
            "period_start": day.isoformat(),
        },
    ).json()
    assert abs(body["availability"] - float(a)) < 1e-8
    assert abs(body["performance"] - float(p)) < 1e-8
    assert abs(body["quality"] - float(q)) < 1e-8
    assert abs(body["oee"] - float(oee)) < 1e-8
    assert body["sum_run_time_min"] == 1310.0
    assert body["sum_available_time_min"] == 1350.0
    assert body["sum_produced_qty"] == 2300.0
    assert body["sum_good_qty"] == 2281.0
    assert body["sum_run_based_capacity"] == 2620.0


# --- 7: AG / machine_utilisation separate (null on snapshots) ---


def test_dashboard_7_machine_utilisation_null_not_computed(
    client: TestClient, db_session: Session
) -> None:
    org = _seed_org(db_session)
    machine: Machine = org["machine"]  # type: ignore[assignment]
    day = date(2026, 8, 10)
    _snapshot(
        db_session,
        scope_type="machine",
        scope_id=machine.id,
        period_type="day",
        period_start=day,
    )
    body = client.get(
        "/api/v1/dashboard/oee",
        params={
            "scope_type": "machine",
            "scope_id": str(machine.id),
            "period_type": "day",
            "period_start": day.isoformat(),
        },
    ).json()
    assert "machine_utilisation" in body
    assert body["machine_utilisation"] is None
    # Confirm column does not exist on ORM / table mapping
    assert not hasattr(OeeSnapshot, "machine_utilisation")


# --- 8: empty result behavior ---


def test_dashboard_8_empty_results(
    client: TestClient, db_session: Session
) -> None:
    org = _seed_org(db_session)
    plant: Plant = org["plant"]  # type: ignore[assignment]
    machine: Machine = org["machine"]  # type: ignore[assignment]
    day = date(2099, 1, 1)

    missing = client.get(
        "/api/v1/dashboard/oee",
        params={
            "scope_type": "machine",
            "scope_id": str(machine.id),
            "period_type": "day",
            "period_start": day.isoformat(),
        },
    )
    assert missing.status_code == 404

    summary = client.get(
        "/api/v1/dashboard/oee/summary",
        params={
            "scope_type": "machine",
            "scope_id": str(machine.id),
        },
    )
    assert summary.status_code == 404

    trend = client.get(
        "/api/v1/dashboard/oee/trend",
        params={
            "scope_type": "machine",
            "scope_id": str(machine.id),
            "period_type": "day",
            "period_start_from": day.isoformat(),
            "period_start_to": day.isoformat(),
        },
    )
    assert trend.status_code == 200
    assert trend.json() == {"items": [], "count": 0}

    machines = client.get(
        "/api/v1/dashboard/oee/machines",
        params={
            "plant_id": str(plant.id),
            "period_type": "day",
            "period_start": day.isoformat(),
        },
    )
    assert machines.status_code == 200
    assert machines.json()["count"] == 0


# --- 9–10: invalid scope / period ---


def test_dashboard_9_invalid_scope_type(
    client: TestClient, db_session: Session
) -> None:
    _ = db_session
    response = client.get(
        "/api/v1/dashboard/oee",
        params={
            "scope_type": "department",
            "scope_id": str(uuid.uuid4()),
            "period_type": "day",
            "period_start": "2026-08-10",
        },
    )
    assert response.status_code == 422
    assert "scope_type" in response.json()["detail"].lower()


def test_dashboard_10_invalid_period_type(
    client: TestClient, db_session: Session
) -> None:
    _ = db_session
    response = client.get(
        "/api/v1/dashboard/oee",
        params={
            "scope_type": "machine",
            "scope_id": str(uuid.uuid4()),
            "period_type": "shift",
            "period_start": "2026-08-10",
        },
    )
    assert response.status_code == 422
    assert "period_type" in response.json()["detail"].lower()


# --- 11: nonexistent scope_id ---


def test_dashboard_11_nonexistent_scope_id(
    client: TestClient, db_session: Session
) -> None:
    _ = db_session
    response = client.get(
        "/api/v1/dashboard/oee",
        params={
            "scope_type": "machine",
            "scope_id": str(uuid.uuid4()),
            "period_type": "day",
            "period_start": "2026-08-10",
        },
    )
    assert response.status_code == 404


# --- 12–13: trend ordering + date filtering ---


def test_dashboard_12_13_trend_ordering_and_filter(
    client: TestClient, db_session: Session
) -> None:
    org = _seed_org(db_session)
    machine: Machine = org["machine"]  # type: ignore[assignment]
    d1, d2, d3 = date(2026, 8, 8), date(2026, 8, 9), date(2026, 8, 10)
    for d, oee in (
        (d3, Decimal("0.70")),
        (d1, Decimal("0.50")),
        (d2, Decimal("0.60")),
    ):
        _snapshot(
            db_session,
            scope_type="machine",
            scope_id=machine.id,
            period_type="day",
            period_start=d,
            oee=oee,
        )
    # Outside range
    _snapshot(
        db_session,
        scope_type="machine",
        scope_id=machine.id,
        period_type="day",
        period_start=date(2026, 8, 11),
        oee=Decimal("0.99"),
    )

    response = client.get(
        "/api/v1/dashboard/oee/trend",
        params={
            "scope_type": "machine",
            "scope_id": str(machine.id),
            "period_type": "day",
            "period_start_from": d1.isoformat(),
            "period_start_to": d3.isoformat(),
        },
    )
    assert response.status_code == 200
    items = response.json()["items"]
    assert response.json()["count"] == 3
    starts = [i["period_start"] for i in items]
    assert starts == [d1.isoformat(), d2.isoformat(), d3.isoformat()]
    assert items[0]["oee"] < items[1]["oee"] < items[2]["oee"]


# --- 14: NULL stays null (machine_utilisation) ---


def test_dashboard_14_null_values_remain_null(
    client: TestClient, db_session: Session
) -> None:
    org = _seed_org(db_session)
    machine: Machine = org["machine"]  # type: ignore[assignment]
    day = date(2026, 8, 10)
    _snapshot(
        db_session,
        scope_type="machine",
        scope_id=machine.id,
        period_type="day",
        period_start=day,
    )
    body = client.get(
        "/api/v1/dashboard/oee",
        params={
            "scope_type": "machine",
            "scope_id": str(machine.id),
            "period_type": "day",
            "period_start": day.isoformat(),
        },
    ).json()
    assert body["machine_utilisation"] is None
    # Stored ratios are NOT NULL on table — present as numbers
    assert body["availability"] is not None
    assert body["oee"] is not None


# --- 15: aggregation_rule_version ---


def test_dashboard_15_aggregation_rule_version(
    client: TestClient, db_session: Session
) -> None:
    org = _seed_org(db_session)
    machine: Machine = org["machine"]  # type: ignore[assignment]
    day = date(2026, 8, 10)
    _snapshot(
        db_session,
        scope_type="machine",
        scope_id=machine.id,
        period_type="day",
        period_start=day,
        aggregation_rule_version=1,
        oee=Decimal("0.84"),
    )
    _snapshot(
        db_session,
        scope_type="machine",
        scope_id=machine.id,
        period_type="day",
        period_start=day,
        aggregation_rule_version=99,
        oee=Decimal("0.10"),
    )
    default = client.get(
        "/api/v1/dashboard/oee",
        params={
            "scope_type": "machine",
            "scope_id": str(machine.id),
            "period_type": "day",
            "period_start": day.isoformat(),
        },
    )
    assert default.status_code == 200
    assert default.json()["aggregation_rule_version"] == AGGREGATION_RULE_VERSION
    assert abs(default.json()["oee"] - 0.84) < 1e-6

    other = client.get(
        "/api/v1/dashboard/oee",
        params={
            "scope_type": "machine",
            "scope_id": str(machine.id),
            "period_type": "day",
            "period_start": day.isoformat(),
            "aggregation_rule_version": 99,
        },
    )
    assert other.status_code == 200
    assert other.json()["aggregation_rule_version"] == 99
    assert abs(other.json()["oee"] - 0.10) < 1e-6


# --- 16: no department OEE endpoint ---


def test_dashboard_16_no_department_oee_endpoint(client: TestClient) -> None:
    assert (
        client.get("/api/v1/dashboard/oee/departments").status_code == 404
    )
    assert (
        client.get(
            "/api/v1/dashboard/oee",
            params={
                "scope_type": "department",
                "scope_id": str(uuid.uuid4()),
                "period_type": "day",
                "period_start": "2026-08-10",
            },
        ).status_code
        == 422
    )


# --- 17: API does not modify database ---


def test_dashboard_17_api_does_not_modify_database(
    client: TestClient, db_session: Session
) -> None:
    org = _seed_org(db_session)
    machine: Machine = org["machine"]  # type: ignore[assignment]
    day = date(2026, 8, 10)
    _snapshot(
        db_session,
        scope_type="machine",
        scope_id=machine.id,
        period_type="day",
        period_start=day,
    )
    before = db_session.scalar(select(func.count()).select_from(OeeSnapshot))
    assert before == 1

    client.get(
        "/api/v1/dashboard/oee",
        params={
            "scope_type": "machine",
            "scope_id": str(machine.id),
            "period_type": "day",
            "period_start": day.isoformat(),
        },
    )
    client.get(
        "/api/v1/dashboard/oee/summary",
        params={
            "scope_type": "machine",
            "scope_id": str(machine.id),
            "period_type": "day",
        },
    )
    client.get(
        "/api/v1/dashboard/oee/trend",
        params={
            "scope_type": "machine",
            "scope_id": str(machine.id),
            "period_type": "day",
            "period_start_from": day.isoformat(),
            "period_start_to": day.isoformat(),
        },
    )

    after = db_session.scalar(select(func.count()).select_from(OeeSnapshot))
    assert after == before == 1


# --- summary latest ---


def test_dashboard_summary_latest_by_period_start(
    client: TestClient, db_session: Session
) -> None:
    org = _seed_org(db_session)
    machine: Machine = org["machine"]  # type: ignore[assignment]
    _snapshot(
        db_session,
        scope_type="machine",
        scope_id=machine.id,
        period_type="day",
        period_start=date(2026, 8, 8),
        oee=Decimal("0.50"),
        computed_at=datetime(2026, 8, 8, 10, 0, tzinfo=timezone.utc),
    )
    latest = _snapshot(
        db_session,
        scope_type="machine",
        scope_id=machine.id,
        period_type="day",
        period_start=date(2026, 8, 10),
        oee=Decimal("0.90"),
        computed_at=datetime(2026, 8, 10, 10, 0, tzinfo=timezone.utc),
    )
    response = client.get(
        "/api/v1/dashboard/oee/summary",
        params={
            "scope_type": "machine",
            "scope_id": str(machine.id),
            "period_type": "day",
        },
    )
    assert response.status_code == 200
    assert response.json()["id"] == str(latest.id)
    assert response.json()["period_start"] == "2026-08-10"


# --- machines list for plant ---


def test_dashboard_machines_for_plant(
    client: TestClient, db_session: Session
) -> None:
    org = _seed_org(db_session)
    plant: Plant = org["plant"]  # type: ignore[assignment]
    machine: Machine = org["machine"]  # type: ignore[assignment]
    mtype: MachineType = org["mtype"]  # type: ignore[assignment]
    mstatus: MachineStatus = org["mstatus"]  # type: ignore[assignment]
    other = Machine(
        plant_id=plant.id,
        line_id=None,
        code=_uid("MC"),
        name="Machine B",
        machine_type_id=mtype.id,
        status_id=mstatus.id,
    )
    session_plant = Plant(
        code=_uid("PLT"),
        name="Other",
        timezone="Asia/Kolkata",
        is_active=True,
    )
    db_session.add_all([other, session_plant])
    db_session.flush()
    foreign = Machine(
        plant_id=session_plant.id,
        line_id=None,
        code=_uid("MC"),
        name="Foreign",
        machine_type_id=mtype.id,
        status_id=mstatus.id,
    )
    db_session.add(foreign)
    db_session.flush()

    day = date(2026, 8, 10)
    _snapshot(
        db_session,
        scope_type="machine",
        scope_id=machine.id,
        period_type="day",
        period_start=day,
    )
    _snapshot(
        db_session,
        scope_type="machine",
        scope_id=other.id,
        period_type="day",
        period_start=day,
    )
    _snapshot(
        db_session,
        scope_type="machine",
        scope_id=foreign.id,
        period_type="day",
        period_start=day,
    )

    response = client.get(
        "/api/v1/dashboard/oee/machines",
        params={
            "plant_id": str(plant.id),
            "period_type": "day",
            "period_start": day.isoformat(),
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 2
    ids = {i["scope_id"] for i in body["items"]}
    assert ids == {str(machine.id), str(other.id)}
    assert str(foreign.id) not in ids


# --- 18: existing APIs unaffected (smoke) ---


def test_dashboard_18_existing_apis_unaffected(client: TestClient) -> None:
    root = client.get("/")
    assert root.status_code == 200
    assert root.json()["health"] == "/api/v1/health"
    # OpenAPI still lists prior routes
    paths = client.get("/openapi.json").json()["paths"]
    assert "/api/v1/imports/dpr-oee" in paths
    assert "/api/v1/production-records/{production_record_id}" in paths
    assert "/api/v1/dashboard/oee" in paths


# --- 19 suite green is verified by full pytest run ---


def test_dashboard_19_security_development_internal(client: TestClient) -> None:
    root = client.get("/").json()
    assert "development/internal" in root.get("security", "").lower()


def test_dashboard_no_leftover_operational_rows_after_rollback(
    db_session: Session,
) -> None:
    _ = db_session
    engine = get_engine()
    with engine.connect() as conn:
        for table in (
            "oee_snapshots",
            "production_records",
            "production_record_metrics",
            "import_jobs",
            "import_job_rows",
        ):
            count = conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
            assert count == 0, f"expected 0 leftover rows in {table}, got {count}"
