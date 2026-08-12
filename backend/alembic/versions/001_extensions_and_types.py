"""001_extensions_and_types - shared PostgreSQL extensions / helpers.

Scope (Stage A design): pgcrypto for UUID defaults (gen_random_uuid).
No tables. No PostgreSQL ENUMs for business-configurable classifiers.

Revision ID: 001
Revises:
Create Date: 2026-08-10

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # gen_random_uuid() for UUID primary-key defaults on later tables.
    # No business ENUM types — classifiers remain VARCHAR / lookup (Stage A).
    op.execute('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')


def downgrade() -> None:
    op.execute('DROP EXTENSION IF EXISTS "pgcrypto"')
