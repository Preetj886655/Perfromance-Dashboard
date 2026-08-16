"""Session-scoped event queue for transaction-safe SSE.

Events are queued during request processing and emitted only AFTER
session.commit() succeeds. Uses SQLAlchemy session metadata to avoid
cross-request leakage.

Pattern:

    In request/service handler:
        queue_oee_updated_event(session, scope_type, scope_id, period_type, period_start)

    After session.commit() succeeds (in get_db):
        emit_pending_events(session)
        session metadata is cleared
"""

from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.services.sse import emit_oee_updated

# Session metadata key for pending events
_SESSION_EVENTS_KEY = "_pending_sse_events"


def queue_oee_updated_event(
    session: Session,
    *,
    scope_type: str,
    scope_id: UUID,
    period_type: str,
    period_start: date,
) -> None:
    """Queue an oee_updated event on the session (no emit yet).

    Events are queued as session metadata and emitted only after
    successful commit. If transaction rolls back, events are discarded.

    Parameters
    ----------
    scope_type : str
        "plant", "line", or "machine"
    scope_id : UUID
        Target scope (plant/line/machine) UUID
    period_type : str
        "day", "week", or "month"
    period_start : date
        Period start date (YYYY-MM-DD)
    """
    if not hasattr(session, "info"):
        return  # Session doesn't support metadata; skip

    if _SESSION_EVENTS_KEY not in session.info:
        session.info[_SESSION_EVENTS_KEY] = []

    payload: dict[str, Any] = {
        "type": "oee_updated",
        "scope_type": scope_type,
        "scope_id": str(scope_id),
        "period_type": period_type,
        "period_start": period_start.isoformat(),
    }

    # Avoid duplicate events for same scope/period
    events: list[dict[str, Any]] = session.info[_SESSION_EVENTS_KEY]
    for existing in events:
        if (
            existing.get("scope_type") == scope_type
            and existing.get("scope_id") == str(scope_id)
            and existing.get("period_type") == period_type
            and existing.get("period_start") == period_start.isoformat()
        ):
            return  # Already queued

    events.append(payload)


def emit_pending_events(session: Session) -> None:
    """Emit all queued events and clear the queue.

    Called only after session.commit() succeeds. Safe to call multiple
    times (subsequent calls find empty queue).
    """
    if not hasattr(session, "info"):
        return

    events: list[dict[str, Any]] = session.info.pop(_SESSION_EVENTS_KEY, [])
    for payload in events:
        try:
            emit_oee_updated(payload)
        except Exception as exc:
            # Log but don't fail request on SSE emit error
            print(f"Warning: Failed to emit SSE event: {exc}")


def clear_pending_events(session: Session) -> None:
    """Clear all queued events (called on rollback)."""
    if hasattr(session, "info"):
        session.info.pop(_SESSION_EVENTS_KEY, None)


__all__ = [
    "clear_pending_events",
    "emit_pending_events",
    "queue_oee_updated_event",
]
