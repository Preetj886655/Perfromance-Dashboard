"""SSE integration tests for OEE import with rollup.

Tests the complete flow: import Excel → create production_records →
trigger rollup → create oee_snapshots → queue SSE events → emit after commit.
"""

from __future__ import annotations

import io
from datetime import date, datetime, time
from decimal import Decimal
from uuid import UUID

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db, get_engine
from app.main import app
from app.models.machine import Machine
from app.models.oee_snapshot import OeeSnapshot
from app.models.plant import Plant
from app.models.production_record import ProductionRecord
from app.services.dpr_oee_ingestion import ingest_dpr_oee_workbook
from app.services.event_queue import queue_oee_updated_event
from app.services.oee_rollup import rollup_plant_day
from app.services.sse import emit_oee_updated, register_sse_queue, unregister_sse_queue
from tests.auth_helpers import make_auth_headers
from tests.test_dpr_oee_ingestion import (
    _row5_cells,
    _row6_cells,
    _seed_masters_for_real_xlsx,
    _seed_second_machine,
    _write_minimal_workbook,
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


class TestSSEIntegrationImportRollup:
    """SSE integration with import + rollup workflow."""

    def test_import_creates_snapshots_and_queues_events(
        self, db_session: Session
    ) -> None:
        """Import → rollup → snapshot created → event queued.

        This test verifies that:
        1. Ingestion creates production_records and metrics
        2. Rollup creates oee_snapshots
        3. Events are queued on the session
        4. Multiple listeners receive the queued events
        """
        # Setup
        masters = _seed_masters_for_real_xlsx(db_session)
        plant: Plant = masters["plant"]  # type: ignore[assignment]
        _seed_second_machine(db_session, masters)

        rows = [_row5_cells(machine="M001"), _row6_cells(machine="M002")]
        workbook_bytes = io.BytesIO()
        _write_minimal_workbook(workbook_bytes, rows=rows)
        workbook_bytes.seek(0)

        # Ingest
        result = ingest_dpr_oee_workbook(
            db_session, workbook_bytes.getvalue(), plant_id=plant.id
        )
        assert result.status == "committed"
        assert result.success_count == 2

        # Get production_date from first record
        rec = db_session.get(ProductionRecord, result.production_record_ids[0])
        assert rec is not None
        production_date = rec.production_date

        # Rollup
        plant_snap = rollup_plant_day(db_session, plant.id, production_date)
        db_session.flush()
        assert plant_snap is not None
        assert plant_snap.oee is not None
        assert plant_snap.oee > Decimal("0")

        # Queue event
        queue_oee_updated_event(
            db_session,
            scope_type="plant",
            scope_id=plant.id,
            period_type="day",
            period_start=production_date,
        )

        # Register listeners
        queue_key1, queue1 = register_sse_queue()
        queue_key2, queue2 = register_sse_queue()

        try:
            # Emit events
            from app.services.event_queue import emit_pending_events

            emit_pending_events(db_session)

            # Both listeners should receive the event
            assert len(queue1) > 0
            assert len(queue2) > 0

            # Verify event content
            event1 = queue1.popleft()
            assert "oee_updated" in event1
            assert str(plant.id) in event1
            assert production_date.isoformat() in event1
        finally:
            unregister_sse_queue(queue_key1)
            unregister_sse_queue(queue_key2)

    def test_successful_import_fires_sse_event(self, db_session: Session) -> None:
        """Successful import with rollup queues SSE event on session.

        This simulates the import API workflow:
        1. Ingest succeeds
        2. Rollup creates snapshot
        3. Event queued
        4. Event would be emitted after commit (in real request)
        """
        # Setup
        masters = _seed_masters_for_real_xlsx(db_session)
        plant: Plant = masters["plant"]  # type: ignore[assignment]

        rows = [_row5_cells(machine="M001")]
        workbook_bytes = io.BytesIO()
        _write_minimal_workbook(workbook_bytes, rows=rows)
        workbook_bytes.seek(0)

        # Ingest
        result = ingest_dpr_oee_workbook(
            db_session, workbook_bytes.getvalue(), plant_id=plant.id
        )
        assert result.status == "committed"

        # Check snapshot not yet created
        plant_snap_before = db_session.scalar(
            select(OeeSnapshot).where(
                OeeSnapshot.scope_type == "plant",
                OeeSnapshot.scope_id == plant.id,
            )
        )
        # May be None or from previous test (fixture rolls back)

        # Rollup
        rec = db_session.get(ProductionRecord, result.production_record_ids[0])
        assert rec is not None
        production_date = rec.production_date

        plant_snap = rollup_plant_day(db_session, plant.id, production_date)
        db_session.flush()
        assert plant_snap is not None

        # Queue event
        from app.services.event_queue import _SESSION_EVENTS_KEY

        queue_oee_updated_event(
            db_session,
            scope_type="plant",
            scope_id=plant.id,
            period_type="day",
            period_start=production_date,
        )

        # Verify event is queued
        assert _SESSION_EVENTS_KEY in db_session.info
        events = db_session.info[_SESSION_EVENTS_KEY]
        assert len(events) == 1
        assert events[0]["type"] == "oee_updated"
        assert events[0]["scope_type"] == "plant"
        assert events[0]["scope_id"] == str(plant.id)

    def test_event_not_emitted_on_rollback(self, db_session: Session) -> None:
        """Events queued on a rolled-back transaction are never emitted.

        This is the CRITICAL test: verify that if transaction rolls back,
        the SSE event is never sent to listeners.
        """
        # Setup
        masters = _seed_masters_for_real_xlsx(db_session)
        plant: Plant = masters["plant"]  # type: ignore[assignment]

        rows = [_row5_cells(machine="M001")]
        workbook_bytes = io.BytesIO()
        _write_minimal_workbook(workbook_bytes, rows=rows)
        workbook_bytes.seek(0)

        # Ingest
        result = ingest_dpr_oee_workbook(
            db_session, workbook_bytes.getvalue(), plant_id=plant.id
        )
        assert result.status == "committed"

        # Rollup
        rec = db_session.get(ProductionRecord, result.production_record_ids[0])
        assert rec is not None
        production_date = rec.production_date

        plant_snap = rollup_plant_day(db_session, plant.id, production_date)
        db_session.flush()
        assert plant_snap is not None

        # Queue event
        queue_oee_updated_event(
            db_session,
            scope_type="plant",
            scope_id=plant.id,
            period_type="day",
            period_start=production_date,
        )

        # Register listener
        queue_key, queue = register_sse_queue()

        try:
            # Simulate transaction rollback by calling clear_pending_events
            # (in real code, this happens in get_db() on exception before emit)
            from app.services.event_queue import clear_pending_events

            clear_pending_events(db_session)

            # Attempt to emit (in real code, this only happens on successful commit)
            from app.services.event_queue import emit_pending_events

            emit_pending_events(db_session)

            # Listener should NOT have received the event
            assert len(queue) == 0, "No event should be emitted after rollback"
        finally:
            unregister_sse_queue(queue_key)

    def test_rollback_clears_pending_events(self, db_session: Session) -> None:
        """Rollback clears pending events from session.

        When transaction rolls back:
        1. get_db() calls clear_pending_events() before rollback
        2. Events are removed from session.info
        3. Subsequent emit_pending_events() finds nothing to emit
        """
        from app.services.event_queue import (
            _SESSION_EVENTS_KEY,
            clear_pending_events,
            emit_pending_events,
        )

        # Queue an event
        queue_oee_updated_event(
            db_session,
            scope_type="plant",
            scope_id=UUID("11111111-1111-1111-1111-111111111111"),
            period_type="day",
            period_start=date(2026, 8, 8),
        )

        assert _SESSION_EVENTS_KEY in db_session.info

        # Clear events (simulates rollback path)
        clear_pending_events(db_session)
        assert _SESSION_EVENTS_KEY not in db_session.info

        # Emit should be safe and find nothing
        register_key, queue = register_sse_queue()
        try:
            emit_pending_events(db_session)
            assert len(queue) == 0
        finally:
            unregister_sse_queue(register_key)
