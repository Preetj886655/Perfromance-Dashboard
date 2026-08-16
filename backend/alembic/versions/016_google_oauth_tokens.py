"""016_google_oauth_tokens — historical compatibility placeholder.

This revision is present in the existing database state and is intentionally kept
as a no-op so the Phase 1 data architecture migration can extend the current
schema without introducing Google OAuth functionality in this work.
"""

from __future__ import annotations

from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = "016_google_oauth_tokens"
down_revision: Union[str, None] = "015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Compatibility placeholder; no-op to preserve the existing DB history."""
    return None


def downgrade() -> None:
    """Compatibility placeholder; no-op to preserve the existing DB history."""
    return None
