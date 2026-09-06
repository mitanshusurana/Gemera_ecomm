"""The double-entry invariant.

Each test here corresponds to a defect found in the audit: an entry that
balanced only by accident, one whose credit legs silently vanished, and a
header that disagreed with its own lines.
"""

from decimal import Decimal

import pytest
from fastapi import HTTPException

from app.core.ledger import TOLERANCE, assert_journal_balanced
from conftest import StubResult, line_totals


@pytest.mark.asyncio
async def test_balanced_entry_passes(stub_session):
    stub_session.queue(line_totals(4, "125000.00", "125000.00"))

    dr, cr = await assert_journal_balanced(stub_session, 1)

    assert dr == Decimal("125000.00")
    assert cr == Decimal("125000.00")


@pytest.mark.asyncio
async def test_unbalanced_entry_is_refused(stub_session):
    """The other_charges defect: customer debited 500 more than was credited."""
    stub_session.queue(line_totals(3, "10500.00", "10000.00"))

    with pytest.raises(HTTPException) as exc:
        await assert_journal_balanced(stub_session, 2, context="sales invoice")

    assert exc.value.status_code == 500
    assert "do not equal" in exc.value.detail
    assert "sales invoice" in exc.value.detail
    assert "No data was saved" in exc.value.detail


@pytest.mark.asyncio
async def test_vanished_credit_legs_are_refused(stub_session):
    """INSERT...SELECT on a missing account code inserts zero rows silently.

    The entry is then single-sided, which must not be mistaken for balanced
    just because one side happens to be zero.
    """
    stub_session.queue(line_totals(1, "10000.00", "0"))

    with pytest.raises(HTTPException) as exc:
        await assert_journal_balanced(stub_session, 3)

    assert "only 1 ledger line" in exc.value.detail
    assert "chart of accounts" in exc.value.detail


@pytest.mark.asyncio
async def test_entry_with_no_lines_is_refused(stub_session):
    stub_session.queue(line_totals(0, "0", "0"))

    with pytest.raises(HTTPException):
        await assert_journal_balanced(stub_session, 4)


@pytest.mark.asyncio
async def test_zero_line_count_is_not_treated_as_balanced(stub_session):
    """0 == 0 must not pass. Both sides being zero is degenerate, not balanced."""
    stub_session.queue(line_totals(0, "0", "0"))

    with pytest.raises(HTTPException):
        await assert_journal_balanced(stub_session, 5)


@pytest.mark.asyncio
async def test_sub_paisa_noise_is_tolerated(stub_session):
    """Float call sites still exist upstream; half a paisa must not block a post."""
    stub_session.queue(line_totals(2, "10000.001", "10000.00"))

    dr, cr = await assert_journal_balanced(stub_session, 6)

    assert abs(dr - cr) <= TOLERANCE


@pytest.mark.asyncio
async def test_one_paisa_difference_is_refused(stub_session):
    """A real one-paisa imbalance is above tolerance and must fail."""
    stub_session.queue(line_totals(2, "10000.01", "10000.00"))

    with pytest.raises(HTTPException):
        await assert_journal_balanced(stub_session, 7)


@pytest.mark.asyncio
async def test_header_is_resynced_from_its_own_lines(stub_session):
    """production.py set the header from one component only; it must be re-derived."""
    stub_session.queue(line_totals(3, "75000.00", "75000.00"))

    await assert_journal_balanced(stub_session, 8)

    updates = [s for s in stub_session.statements() if "UPDATE caratloop.journal_entries" in s]
    assert len(updates) == 1, "header should be resynced exactly once"

    _, params = stub_session.executed[-1]
    assert params["dr"] == Decimal("75000.00")
    assert params["cr"] == Decimal("75000.00")


@pytest.mark.asyncio
async def test_header_sync_can_be_disabled(stub_session):
    stub_session.queue(line_totals(2, "100.00", "100.00"))

    await assert_journal_balanced(stub_session, 9, sync_header=False)

    assert not [s for s in stub_session.statements() if "UPDATE" in s]


@pytest.mark.asyncio
async def test_balance_check_is_scoped_to_one_entry(stub_session):
    """A missing WHERE would sum the whole table and appear to balance."""
    stub_session.queue(line_totals(2, "1.00", "1.00"))

    await assert_journal_balanced(stub_session, 10)

    select_sql = stub_session.statements()[0]
    assert "WHERE journal_entry_id = :je_id" in select_sql

    _, params = stub_session.executed[0]
    assert params["je_id"] == 10


@pytest.mark.asyncio
async def test_missing_accounts_are_reported_by_name(stub_session):
    from app.core.ledger import assert_accounts_exist

    stub_session.queue(StubResult([("SAL-001",)]))

    with pytest.raises(HTTPException) as exc:
        await assert_accounts_exist(stub_session, "co-1", ["SAL-001", "SAL-004", "GST-001"])

    assert exc.value.status_code == 400
    assert "SAL-004" in exc.value.detail
    assert "GST-001" in exc.value.detail
    assert "SAL-001" not in exc.value.detail.split("missing")[1]


@pytest.mark.asyncio
async def test_all_accounts_present_passes(stub_session):
    from app.core.ledger import assert_accounts_exist

    stub_session.queue(StubResult([("SAL-001",), ("SAL-004",)]))

    await assert_accounts_exist(stub_session, "co-1", ["SAL-001", "SAL-004"])


@pytest.mark.asyncio
async def test_an_entry_uuid_is_refused_rather_than_silently_coerced(stub_session):
    """int(UUID) returns the 128-bit value instead of raising.

    sales.py passed entry_uuid here. The coercion succeeded, Postgres received
    a number far outside bigint, and the whole sale rolled back with a driver
    error rather than a message naming the mistake.
    """
    from uuid import uuid4

    with pytest.raises(HTTPException) as exc:
        await assert_journal_balanced(stub_session, uuid4())
    assert "entry_uuid" in exc.value.detail
