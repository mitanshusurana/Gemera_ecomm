"""Test fixtures.

These tests deliberately avoid a live database. The schema does not exist in
this repository (``database/schema.sql`` is referenced by docker-compose but
absent, and there is no Alembic setup), so there is nothing to migrate a test
database from. The ledger guard is therefore exercised against a stub session
that records the SQL it is given and returns scripted rows.

When the schema is authored, these should be supplemented with integration
tests against a real Postgres.
"""

from __future__ import annotations

import os
import sys
from decimal import Decimal
from pathlib import Path

import pytest

# Make the application package importable without installing it.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Settings are a module-level singleton built on first import of
# app.core.config, and validate_runtime() rejects an empty JWT secret. pytest
# imports conftest before any test module, so this is the only place the
# environment can be set early enough -- doing it inside a test module meant
# whichever module imported app.core.config first won, and the secret was "".
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://u:p@localhost:5432/testdb")
os.environ.setdefault("SYNC_DATABASE_URL", "postgresql://u:p@localhost:5432/testdb")
os.environ.setdefault("JWT_SECRET", "t" * 48)
os.environ.setdefault("ENVIRONMENT", "test")


class StubResult:
    """Mimics the slice of SQLAlchemy's Result that the code under test uses."""

    def __init__(self, rows=None, rowcount=0):
        self._rows = rows or []
        self.rowcount = rowcount

    def mappings(self):
        return self

    def first(self):
        return self._rows[0] if self._rows else None

    def fetchall(self):
        return self._rows

    def scalar(self):
        if not self._rows:
            return None
        row = self._rows[0]
        if isinstance(row, dict):
            return next(iter(row.values()))
        if isinstance(row, (list, tuple)):
            return row[0]
        return row


class StubSession:
    """Records executed statements and replays queued results in order."""

    def __init__(self, results=None):
        self._results = list(results or [])
        self.executed = []

    def queue(self, result):
        self._results.append(result)

    async def execute(self, statement, params=None):
        self.executed.append((str(statement), params or {}))
        if self._results:
            return self._results.pop(0)
        return StubResult()

    def statements(self):
        return [sql for sql, _ in self.executed]


@pytest.fixture
def stub_session():
    return StubSession()


def line_totals(count: int, debit, credit) -> StubResult:
    """Build the row shape assert_journal_balanced expects."""
    return StubResult(
        [{
            "line_count": count,
            "total_dr": Decimal(str(debit)),
            "total_cr": Decimal(str(credit)),
        }]
    )
