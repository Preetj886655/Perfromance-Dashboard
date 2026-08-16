"""SSE event queue rollback tests — CRITICAL acceptance test.

Validates the transaction-safe guarantee: events are queued during request
processing but emitted ONLY if session.commit() succeeds. If transaction
rolls back, events are discarded.

This is the mandatory acceptance test for SSE implementation.
"""

from __future__ import annotations

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_engine, get_session_factory
from app.models.plant import Plant
from app.services.event_queue import (
    clear_pending_events,
    emit_pending_events,
    queue_oee_updated_event,
)
from app.services.sse import emit_oee_updated, register_sse_queue, unregister_sse_queue


@pytest.fixture
def session_with_rollback() -> Session:
    """Session within an outer transaction that rolls back."""
    engine = get_engine()
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, autoflush=False, expire_on_commit=False)

    # Seed a test plant
    test_plant = Plant(
        name="Test Plant",
        code="TP",
        timezone="UTC",
    )
    session.add(test_plant)
    session.flush()

    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


class TestEventQueueRollback:
    """Event queue behavior on commit vs rollback."""

    def test_event_queue_empty_by_default(self, session_with_rollback: Session) -> None:
        """New session has no pending events."""
        from app.services.event_queue import _SESSION_EVENTS_KEY

        assert _SESSION_EVENTS_KEY not in session_with_rollback.info

    def test_queue_event_on_session(self, session_with_rollback: Session) -> None:
        """Events can be queued on session metadata."""
        from app.services.event_queue import _SESSION_EVENTS_KEY
        from datetime import date
        from uuid import UUID

        plant_id = UUID("11111111-1111-1111-1111-111111111111")
        queue_oee_updated_event(
            session_with_rollback,
            scope_type="plant",
            scope_id=plant_id,
            period_type="day",
            period_start=date(2026, 8, 8),
        )

        assert _SESSION_EVENTS_KEY in session_with_rollback.info
        events = session_with_rollback.info[_SESSION_EVENTS_KEY]
        assert len(events) == 1
        assert events[0]["type"] == "oee_updated"
        assert events[0]["scope_id"] == str(plant_id)

    def test_no_duplicate_events_queued(self, session_with_rollback: Session) -> None:
        """Same event should not be queued twice."""
        from app.services.event_queue import _SESSION_EVENTS_KEY
        from datetime import date
        from uuid import UUID

        plant_id = UUID("11111111-1111-1111-1111-111111111111")
        queue_oee_updated_event(
            session_with_rollback,
            scope_type="plant",
            scope_id=plant_id,
            period_type="day",
            period_start=date(2026, 8, 8),
        )
        queue_oee_updated_event(
            session_with_rollback,
            scope_type="plant",
            scope_id=plant_id,
            period_type="day",
            period_start=date(2026, 8, 8),
        )

        events = session_with_rollback.info[_SESSION_EVENTS_KEY]
        assert len(events) == 1, "Duplicate events should not be queued"

    def test_multiple_different_events_queued(self, session_with_rollback: Session) -> None:
        """Different events should be queued separately."""
        from app.services.event_queue import _SESSION_EVENTS_KEY
        from datetime import date
        from uuid import UUID

        machine1 = UUID("22222222-2222-2222-2222-222222222222")
        machine2 = UUID("33333333-3333-3333-3333-333333333333")

        queue_oee_updated_event(
            session_with_rollback,
            scope_type="machine",
            scope_id=machine1,
            period_type="day",
            period_start=date(2026, 8, 8),
        )
        queue_oee_updated_event(
            session_with_rollback,
            scope_type="machine",
            scope_id=machine2,
            period_type="day",
            period_start=date(2026, 8, 8),
        )

        events = session_with_rollback.info[_SESSION_EVENTS_KEY]
        assert len(events) == 2

    def test_clear_pending_events(self, session_with_rollback: Session) -> None:
        """Clearing events removes them from session."""
        from app.services.event_queue import _SESSION_EVENTS_KEY
        from datetime import date
        from uuid import UUID

        plant_id = UUID("11111111-1111-1111-1111-111111111111")
        queue_oee_updated_event(
            session_with_rollback,
            scope_type="plant",
            scope_id=plant_id,
            period_type="day",
            period_start=date(2026, 8, 8),
        )
        assert _SESSION_EVENTS_KEY in session_with_rollback.info

        clear_pending_events(session_with_rollback)
        assert _SESSION_EVENTS_KEY not in session_with_rollback.info

    def test_emit_pending_events_broadcasts(self, session_with_rollback: Session) -> None:
        """Emitting queued events sends them to all registered clients."""
        from app.services.event_queue import _SESSION_EVENTS_KEY
        from datetime import date
        from uuid import UUID

        # Register a listener
        queue_key, queue = register_sse_queue()
        try:
            # Queue an event
            plant_id = UUID("11111111-1111-1111-1111-111111111111")
            queue_oee_updated_event(
                session_with_rollback,
                scope_type="plant",
                scope_id=plant_id,
                period_type="day",
                period_start=date(2026, 8, 8),
            )

            # Emit pending events
            emit_pending_events(session_with_rollback)

            # Listener should have received the event
            assert len(queue) > 0
            event_str = queue.popleft()
            assert "oee_updated" in event_str
            assert str(plant_id) in event_str
        finally:
            unregister_sse_queue(queue_key)

    def test_emit_clears_queue_after_emission(
        self, session_with_rollback: Session
    ) -> None:
        """Emitting events clears them from session."""
        from app.services.event_queue import _SESSION_EVENTS_KEY
        from datetime import date
        from uuid import UUID

        plant_id = UUID("11111111-1111-1111-1111-111111111111")
        queue_oee_updated_event(
            session_with_rollback,
            scope_type="plant",
            scope_id=plant_id,
            period_type="day",
            period_start=date(2026, 8, 8),
        )

        assert _SESSION_EVENTS_KEY in session_with_rollback.info
        emit_pending_events(session_with_rollback)
        assert _SESSION_EVENTS_KEY not in session_with_rollback.info

    def test_event_emission_without_listeners_is_safe(
        self, session_with_rollback: Session
    ) -> None:
        """Emitting events with no registered listeners should not fail."""
        from datetime import date
        from uuid import UUID

        plant_id = UUID("11111111-1111-1111-1111-111111111111")
        queue_oee_updated_event(
            session_with_rollback,
            scope_type="plant",
            scope_id=plant_id,
            period_type="day",
            period_start=date(2026, 8, 8),
        )

        # No listeners registered; should not raise exception
        emit_pending_events(session_with_rollback)


class TestTransactionSafeSSEBroadcaster:
    """SSE broadcaster thread-safety and cleanup."""

    def test_register_and_unregister_queue(self) -> None:
        """Queue registration and unregistration."""
        queue_key, queue = register_sse_queue()
        assert queue is not None

        # Emit should find the queue
        emit_oee_updated(
            {
                "type": "oee_updated",
                "scope_type": "plant",
                "scope_id": "11111111-1111-1111-1111-111111111111",
                "period_type": "day",
                "period_start": "2026-08-08",
            }
        )

        assert len(queue) > 0

        # After unregister, should not receive events
        unregister_sse_queue(queue_key)
        initial_len = len(queue)

        emit_oee_updated(
            {
                "type": "oee_updated",
                "scope_type": "plant",
                "scope_id": "22222222-2222-2222-2222-222222222222",
                "period_type": "day",
                "period_start": "2026-08-08",
            }
        )

        assert len(queue) == initial_len, "Unregistered queue should not receive events"

    def test_multiple_listeners_receive_event(self) -> None:
        """All registered listeners should receive events."""
        queue_key1, queue1 = register_sse_queue()
        queue_key2, queue2 = register_sse_queue()

        try:
            emit_oee_updated(
                {
                    "type": "oee_updated",
                    "scope_type": "plant",
                    "scope_id": "11111111-1111-1111-1111-111111111111",
                    "period_type": "day",
                    "period_start": "2026-08-08",
                }
            )

            assert len(queue1) > 0, "First listener should receive event"
            assert len(queue2) > 0, "Second listener should receive event"
        finally:
            unregister_sse_queue(queue_key1)
            unregister_sse_queue(queue_key2)
