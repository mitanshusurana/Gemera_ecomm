"""Inventory costing.

Before this existed the system posted no cost of goods sold at all, so gross
profit equalled revenue, and the stock ledger recorded the tax-inclusive
selling price on an outward movement -- which fed margin and GST back into any
average derived from that ledger.
"""

from decimal import Decimal

import pytest

from app.core.costing import (
    COSTING_METHOD,
    cost_of_goods_sold,
    resolve_stock_account,
    weighted_average_cost,
)
from conftest import StubResult


def inward(total_amount, total_qty):
    return StubResult(
        [{"total_amount": Decimal(str(total_amount)), "total_qty": Decimal(str(total_qty))}]
    )


@pytest.mark.asyncio
async def test_average_is_amount_over_quantity(stub_session):
    # 100 units costing 500,000 -> 5,000 each
    stub_session.queue(inward("500000", "100"))

    rate = await weighted_average_cost(stub_session, "co", "mat")

    assert rate == Decimal("5000")


@pytest.mark.asyncio
async def test_average_reads_inward_movements_only(stub_session):
    """An issue does not create cost; including outward rows folds the sale
    price back into the average."""
    stub_session.queue(inward("500000", "100"))

    await weighted_average_cost(stub_session, "co", "mat")

    sql = stub_session.statements()[0]
    assert "direction = 'I'" in sql
    assert "'O'" not in sql


@pytest.mark.asyncio
async def test_average_is_scoped_to_the_company(stub_session):
    stub_session.queue(inward("1", "1"))

    await weighted_average_cost(stub_session, "co-1", "mat")

    sql = stub_session.statements()[0]
    assert "company_id = :cid" in sql
    _, params = stub_session.executed[0]
    assert params["cid"] == "co-1"


@pytest.mark.asyncio
async def test_no_stock_history_yields_zero_not_a_division_error(stub_session):
    stub_session.queue(inward("0", "0"))

    assert await weighted_average_cost(stub_session, "co", "mat") == Decimal("0")


@pytest.mark.asyncio
async def test_missing_row_yields_zero(stub_session):
    stub_session.queue(StubResult([]))

    assert await weighted_average_cost(stub_session, "co", "mat") == Decimal("0")


@pytest.mark.asyncio
async def test_cogs_is_quantity_times_average(stub_session):
    stub_session.queue(inward("500000", "100"))

    cogs = await cost_of_goods_sold(stub_session, "co", "mat", Decimal("3"))

    assert cogs == Decimal("15000.00")


@pytest.mark.asyncio
async def test_cogs_rounds_to_paise(stub_session):
    # 1000 / 3 = 333.333... per unit; two units = 666.6666...
    stub_session.queue(inward("1000", "3"))

    cogs = await cost_of_goods_sold(stub_session, "co", "mat", Decimal("2"))

    assert cogs == Decimal("666.67")
    assert -cogs.as_tuple().exponent <= 2


@pytest.mark.asyncio
async def test_cogs_is_decimal_not_float(stub_session):
    stub_session.queue(inward("100", "3"))

    cogs = await cost_of_goods_sold(stub_session, "co", "mat", Decimal("1"))

    assert isinstance(cogs, Decimal)


@pytest.mark.asyncio
async def test_purchases_at_different_prices_average_out(stub_session):
    """The point of weighted average: two lots at different rates blend."""
    # 10 @ 6000 = 60,000 and 10 @ 7000 = 70,000 -> 130,000 / 20 = 6,500
    stub_session.queue(inward("130000", "20"))

    assert await weighted_average_cost(stub_session, "co", "mat") == Decimal("6500")


@pytest.mark.asyncio
async def test_stock_account_prefers_the_material_setting(stub_session):
    stub_session.queue(StubResult([{"stock_account_id": "acc-explicit", "fallback_id": "acc-default"}]))

    assert await resolve_stock_account(stub_session, "co", "mat") == "acc-explicit"


@pytest.mark.asyncio
async def test_stock_account_falls_back_to_the_category_default(stub_session):
    stub_session.queue(StubResult([{"stock_account_id": None, "fallback_id": "acc-default"}]))

    assert await resolve_stock_account(stub_session, "co", "mat") == "acc-default"


@pytest.mark.asyncio
async def test_stock_account_returns_none_when_nothing_resolves(stub_session):
    """The caller must fail loudly rather than debit COGS with no credit."""
    stub_session.queue(StubResult([{"stock_account_id": None, "fallback_id": None}]))

    assert await resolve_stock_account(stub_session, "co", "mat") is None


def test_the_costing_method_is_stated_explicitly():
    """AS 2 / Ind AS 2 require a consistently applied method; LIFO is barred."""
    assert COSTING_METHOD == "weighted_average"
