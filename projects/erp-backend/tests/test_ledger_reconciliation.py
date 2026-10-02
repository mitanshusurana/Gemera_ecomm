"""The ledgers must reconcile with each other and with the documents.

Each test here is a defect found in the accounting audit of the books the
system produced ("ledgers are not maintainable, the values are not
reconciling"):

  * the balance sheet answered 500 (Decimal + float);
  * the P&L ignored its date range and status filter (LEFT JOIN condition);
  * the trial balance ignored opening_balance_type and left opening balances
    out of its totals;
  * ledgers restarted the running balance at zero on the first row of the
    range and showed a customer in credit as a negative receivable;
  * the voucher detail endpoint took a UUID for a BIGINT id;
  * a bridge credit note never settled its invoice, so the aging report kept
    showing money the ledger had already credited;
  * weight-priced purchase lines posted a 4dp stock debit against a 2dp
    creditor, so every such voucher was out by a fraction of a paisa.

They run against stub sessions (see conftest) and the pure helpers in
app.core.balances; no database.
"""

from __future__ import annotations

import ast
import io
import re
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.core.balances import (
    FAIL, INFO, OK, WARN, check, normal_side_balance, side_of, signed_opening, split_sides,
    status_for, with_running_balance,
)
from conftest import StubResult, StubSession

USER = {"company_id": "3dd45503-bb35-4243-a58d-a2efba8d9868", "id": "u1"}
ACC = "173a2a16-4743-4041-a6ff-43d2409b8099"
PARTY = "04732ce3-8692-43bd-9195-c713bb9482a5"
D = Decimal


class RoutedSession(StubSession):
    """A stub session that answers by the SQL it is asked, not by call order.

    The reconciliation endpoint runs two dozen statements; scripting them
    positionally would make the test a mirror of the implementation.
    """

    def __init__(self, routes):
        super().__init__()
        self._routes = routes  # list of (regex, StubResult)

    async def execute(self, statement, params=None):
        sql = str(statement)
        self.executed.append((sql, params or {}))
        for pattern, result in self._routes:
            if re.search(pattern, sql, re.S):
                return result
        return StubResult()


# ─── app.core.balances ────────────────────────────────────────────────────────

def test_opening_balance_is_read_with_its_own_side():
    debtor_in_credit = {"opening_balance": D("500"), "opening_balance_type": "C", "normal_balance": "D"}
    assert signed_opening(debtor_in_credit) == D("-500")
    # No type recorded: the account's normal side decides.
    assert signed_opening({"opening_balance": D("500"), "opening_balance_type": None, "normal_balance": "C"}) == D("-500")
    assert signed_opening({"opening_balance": D("500"), "opening_balance_type": None, "normal_balance": "D"}) == D("500")
    assert signed_opening({"opening_balance": 0, "opening_balance_type": "C", "normal_balance": "D"}) == 0


def test_sides_and_presentation():
    assert side_of(D("10")) == "Dr"
    assert side_of(D("-10")) == "Cr"
    assert side_of(0) == "Dr"
    assert split_sides(D("-25")) == (D("0"), D("25"))
    assert split_sides(D("25")) == (D("25"), D("0"))
    # A credit account's positive figure is a credit balance.
    assert normal_side_balance(D("-720"), "C") == D("720")
    assert normal_side_balance(D("-720"), "D") == D("-720")


def test_running_balance_starts_from_the_opening_and_keeps_order():
    rows = [{"debit": D("25750"), "credit": 0}, {"debit": 0, "credit": D("51168")}, {"debit": 0, "credit": D("5000")}]
    out = with_running_balance(D("1000"), rows)
    assert [r["running_balance"] for r in out] == [D("26750"), D("-24418"), D("-29418")]
    assert [r["running_side"] for r in out] == ["Dr", "Cr", "Cr"]
    assert out[-1]["running_abs"] == D("29418")
    # Never re-sorted: response order is ledger order.
    assert [r["debit"] for r in out] == [D("25750"), 0, 0]


def test_status_words():
    assert status_for(0) == OK
    assert status_for(D("0.002")) == WARN
    assert status_for(D("0.002"), strict=True) == FAIL
    assert status_for(D("0.01")) == FAIL
    row = check("x", "label", D("255840.00"), D("255840.002"))
    assert row["difference"] == D("0.002") and row["status"] == WARN


# ─── Trial balance ─────────────────────────────────────────────────────────────

def _tb_row(code, nb, opening, otype, dr, cr):
    return {
        "account_id": ACC, "code": code, "account_name": code, "group_name": "g", "nature": "Assets",
        "normal_balance": nb, "opening_balance": D(opening), "opening_balance_type": otype,
        "period_debit": D(dr), "period_credit": D(cr),
    }


@pytest.mark.asyncio
async def test_trial_balance_counts_opening_balances_on_their_own_side():
    from app.api.v1.accounting import get_trial_balance

    # A debtor whose opening balance was entered as a CREDIT, a bank account
    # with a debit opening, and postings that balance on their own.
    db = StubSession([StubResult([
        _tb_row("ACC-CUST-0001", "D", "1000", "C", "500", "0"),
        _tb_row("BNK-001", "D", "1000", "D", "0", "500"),
    ])])
    out = await get_trial_balance(as_of_date=date(2026, 10, 2), db=db, current_user=USER)
    cust, bank = out["accounts"]
    assert cust["opening_credit"] == D("1000") and cust["opening_debit"] == 0
    assert cust["closing_signed"] == D("-500") and cust["closing_side"] == "Cr"
    assert cust["closing_credit"] == D("500")
    # The old SQL added the opening on the normal side: it would have said 1500 Dr.
    assert cust["closing_balance"] == D("-500")
    assert bank["closing_debit"] == D("500")
    t = out["totals"]
    assert t["total_debit"] == t["total_credit"] == D("500")
    assert t["opening_debit"] == t["opening_credit"] == D("1000")
    assert t["closing_debit"] == t["closing_credit"] == D("500")
    assert t["is_balanced"] is True


@pytest.mark.asyncio
async def test_trial_balance_is_not_balanced_when_opening_balances_are_one_sided():
    from app.api.v1.accounting import get_trial_balance

    db = StubSession([StubResult([
        _tb_row("BNK-001", "D", "1000", "D", "0", "0"),   # opening entered on one account only
    ])])
    out = await get_trial_balance(as_of_date=None, db=db, current_user=USER)
    t = out["totals"]
    # Postings are trivially balanced (there are none)...
    assert t["total_debit"] == t["total_credit"] == 0
    # ...but the books are not: the closing columns differ by the opening figure.
    assert t["closing_difference"] == D("1000")
    assert t["is_balanced"] is False


# ─── General ledger and party ledger ───────────────────────────────────────────

def _opening_acc(**over):
    row = {
        "id": ACC, "code": "ACC-CUST-0001", "name": "Asha Verma", "normal_balance": "D", "account_type": "Debtor",
        "opening_balance": D("0"), "opening_balance_type": None, "group_name": "Sundry Debtors", "nature": "Assets",
        "prior_dr": D("0"), "prior_cr": D("0"),
        "account_id": ACC, "account_code": "ACC-CUST-0001", "account_name": "Asha Verma",
    }
    row.update(over)
    return row


def _line(entry_no, dr, cr, day=2, **over):
    row = {
        "journal_entry_id": 1, "entry_uuid": None, "entry_sequence": 1, "entry_date": date(2026, 10, day),
        "date": date(2026, 10, day), "entry_no": entry_no, "voucher_no": entry_no, "entry_type": "Sales",
        "voucher_type": "Sales", "status": "Posted", "narration": "n", "entry_narration": "n",
        "reference_no": None, "bill_ref": None, "reference_type": "SalesInvoice", "reference_id": None,
        "line_id": 1, "line_sequence": 1, "party_id": None, "dr_amount": D(dr), "cr_amount": D(cr),
        "line_narration": "x", "particulars": "x", "debit": D(dr), "credit": D(cr), "due_date": None,
    }
    row.update(over)
    return row


@pytest.mark.asyncio
async def test_general_ledger_opening_row_and_running_balance():
    from app.api.v1.accounting import get_general_ledger

    # Opening 50 Dr on the account, 100 Dr / 30 Cr posted before the range.
    db = StubSession([
        StubResult([_opening_acc(opening_balance=D("50"), opening_balance_type="D", prior_dr=D("100"), prior_cr=D("30"))]),
        StubResult([_line("JV/1", "10", "0"), _line("REC/2", "0", "200")]),
    ])
    out = await get_general_ledger(account_id=ACC, from_date=date(2026, 10, 1), to_date=date(2026, 10, 2), db=db, current_user=USER)
    assert out["opening_balance"] == D("120") and out["opening_side"] == "Dr"
    assert [e["running_balance"] for e in out["entries"]] == [D("130"), D("-70")]
    assert out["entries"][-1]["running_side"] == "Cr"
    assert out["closing_balance"] == D("-70") and out["closing_side"] == "Cr" and out["closing_abs"] == D("70")
    assert out["total_debit"] == D("10") and out["total_credit"] == D("200")

    opening_sql, lines_sql = db.statements()
    # Prior postings: Posted, not Opening, strictly before the range.
    assert "je.status = 'Posted'" in opening_sql and "je.entry_type <> 'Opening'" in opening_sql
    assert "je.entry_date < CAST(:from_date AS DATE)" in opening_sql
    # The range itself: Posted, Opening journals never listed (the opening row carries them).
    assert "je.status = 'Posted'" in lines_sql and "je.entry_type <> 'Opening'" in lines_sql
    assert "ORDER BY je.entry_date, je.sequence_no, je.id, jel.sequence_no" in lines_sql


@pytest.mark.asyncio
async def test_general_ledger_unknown_account_is_404():
    from app.api.v1.accounting import get_general_ledger

    db = StubSession([StubResult([])])
    with pytest.raises(HTTPException) as exc:
        await get_general_ledger(account_id=ACC, from_date=None, to_date=None, db=db, current_user=USER)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_party_ledger_reports_a_customer_in_credit_as_cr_not_negative():
    from app.api.v1.ledger import get_party_ledger

    db = StubSession([
        StubResult([{"id": PARTY, "name": "Asha Verma", "party_type": "Both", "account_id": ACC}]),
        StubResult([_opening_acc(prior_dr=D("185690"), prior_cr=D("417090"))]),
        StubResult([_line("JV/2026-27/00077", "12360", "0", voucher_type="Sales")]),
    ])
    out = await get_party_ledger(party_id=PARTY, from_date=date(2026, 10, 2), to_date=date(2026, 10, 2), db=db, current_user=USER)
    assert out["opening_balance"] == D("-231400")
    assert out["opening_side"] == "Cr" and out["opening_credit"] == D("231400") and out["opening_debit"] == 0
    assert out["entries"][0]["running_balance"] == D("-219040")
    assert out["entries"][0]["running_side"] == "Cr"
    assert out["closing_abs"] == D("219040") and out["closing_side"] == "Cr"
    assert out["party"]["account_code"] == "ACC-CUST-0001"

    _, opening_sql, lines_sql = db.statements()
    for sql in (opening_sql, lines_sql):
        assert "je.status = 'Posted'" in sql and "je.entry_type <> 'Opening'" in sql
    assert "ORDER BY je.entry_date ASC, je.sequence_no ASC, je.id ASC, jel.sequence_no ASC" in lines_sql


def _balance_row(pid, name, dr, cr, ptype="Both"):
    return {
        "party_id": pid, "party_name": name, "party_type": ptype, "gstin": None, "phone": None,
        "credit_limit": 0, "credit_days": 30, "account_id": ACC, "account_code": "X", "normal_balance": "D",
        "opening_balance": D("0"), "opening_balance_type": None, "total_dr": D(dr), "total_cr": D(cr),
    }


@pytest.mark.asyncio
async def test_receivables_and_payables_each_show_one_side_only():
    from app.api.v1.ledger import get_payables, get_receivables

    rows = [_balance_row("p1", "Owes us", "1000", "250"), _balance_row("p2", "We owe", "100", "600")]
    recv = await get_receivables(as_of_date=date(2026, 10, 2), db=StubSession([StubResult(rows)]), current_user=USER)
    pay = await get_payables(as_of_date=date(2026, 10, 2), db=StubSession([StubResult(rows)]), current_user=USER)
    assert [(r["party_name"], r["total_outstanding"], r["balance_side"]) for r in recv] == [("Owes us", D("750"), "Dr")]
    assert [(r["party_name"], r["total_outstanding"], r["balance_side"]) for r in pay] == [("We owe", D("500"), "Cr")]
    assert all(r["total_outstanding"] > 0 for r in recv + pay)


@pytest.mark.asyncio
async def test_party_balances_sql_counts_only_posted_non_opening_entries_to_the_date():
    from app.api.v1.ledger import party_balances

    db = StubSession([StubResult([])])
    await party_balances(db, USER["company_id"], date(2026, 9, 30))
    sql, params = db.executed[0]
    assert "je.status = 'Posted'" in sql and "je.entry_type <> 'Opening'" in sql
    assert "je.entry_date <= CAST(:as_of AS DATE)" in sql
    assert params["as_of"] == date(2026, 9, 30), "a date, not a str: asyncpg types the CAST"


# ─── Books ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_cash_book_is_the_ledger_of_cash_accounts_with_an_opening_row():
    from app.api.v1.books import get_cashbook

    db = StubSession([
        StubResult([{"id": ACC, "code": "CSH-001", "name": "Cash in Hand", "account_type": "Cash", "normal_balance": "D",
                     "opening_balance": D("5000"), "opening_balance_type": "D", "prior_dr": D("0"), "prior_cr": D("1000")}]),
        StubResult([_line("REC/1", "1500", "0", voucher_type="Receipt", account_id=ACC, account_code="CSH-001",
                          account_name="Cash in Hand", instrument_no=None)]),
    ])
    out = await get_cashbook(from_date=date(2026, 10, 1), to_date=date(2026, 10, 2), account_id=None, db=db, current_user=USER)
    assert out["opening_balance"] == D("4000")
    assert out["entries"][0]["balance"] == D("5500") and out["entries"][0]["running_side"] == "Dr"
    assert out["closing_balance"] == D("5500")
    opening_sql, lines_sql = db.statements()
    # By account TYPE, never by name: "Cash Discount" is not a cash book.
    assert "ILIKE" not in lines_sql and "a.account_type = :account_type" in lines_sql
    assert "je.status = 'Posted'" in lines_sql and "je.entry_type <> 'Opening'" in lines_sql
    assert db.executed[1][1]["account_type"] == "Cash"


@pytest.mark.asyncio
async def test_day_book_lists_posted_vouchers_only():
    from app.api.v1.books import get_daybook

    db = StubSession([StubResult([])])
    await get_daybook(entry_date=date(2026, 10, 2), voucher_type=None, db=db, current_user=USER)
    assert "status = 'Posted'" in db.statements()[0]


# ─── Balance sheet and P&L ─────────────────────────────────────────────────────

def _bs_row(nature, code, nb, dr, cr, opening="0", otype=None):
    return {
        "nature": nature, "group_name": "g", "account_id": ACC, "code": code, "account_name": code,
        "normal_balance": nb, "opening_balance": D(opening), "opening_balance_type": otype,
        "total_dr": D(dr), "total_cr": D(cr),
    }


@pytest.mark.asyncio
async def test_balance_sheet_is_decimal_throughout_and_balances():
    """Decimal + float raised TypeError and the endpoint answered 500."""
    from app.api.v1.reports import get_balance_sheet

    db = StubSession([
        StubResult([
            _bs_row("Assets", "BNK-001", "D", "32500", "0"),
            _bs_row("Assets", "ACC-CUST-0001", "D", "185690", "417090"),
            _bs_row("Liabilities", "GST-001", "C", "1875", "2595"),
            _bs_row("Equity", "CAP-001", "C", "0", "0"),
        ]),
        StubResult([{"total_income": D("54355.95"), "total_expenses": D("0")}]),
    ])
    out = await get_balance_sheet(as_of_date=date(2026, 10, 2), db=db, current_user=USER)
    assert isinstance(out["totals"]["total_assets"], Decimal)
    assert out["total_assets"] == D("32500") + D("185690") - D("417090")
    cur = [e for e in out["equity"] if e["code"] == "CUR-YR-PL"][0]
    assert cur["balance"] == D("54355.95") and isinstance(cur["balance"], Decimal)
    # A debtor in credit is a negative asset with its side spelled out.
    debtor = [a for a in out["assets"] if a["code"] == "ACC-CUST-0001"][0]
    assert debtor["balance"] == D("-231400") and debtor["balance_side"] == "Cr"
    # Liability shown credit-positive.
    assert out["liabilities"][0]["balance"] == D("720")
    assert out["totals"]["total_liabilities_and_equity"] == D("720") + D("54355.95")
    assert out["totals"]["is_balanced"] is False  # the stub books are deliberately short of a few accounts
    assert out["totals"]["difference"] == out["total_assets"] - out["totals"]["total_liabilities_and_equity"]


@pytest.mark.asyncio
async def test_balance_sheet_tolerance_is_the_posting_tolerance_not_one_rupee():
    from app.api.v1.reports import balance_sheet_figures

    db = StubSession([
        StubResult([_bs_row("Assets", "BNK-001", "D", "100.99", "0"), _bs_row("Liabilities", "L", "C", "0", "100")]),
        StubResult([{"total_income": D("0"), "total_expenses": D("0")}]),
    ])
    f = await balance_sheet_figures(db, USER["company_id"], date(2026, 10, 2))
    assert f["difference"] == D("0.99")
    assert f["is_balanced"] is False  # was `< 1.0`


@pytest.mark.asyncio
async def test_balance_sheet_reads_opening_balance_type():
    from app.api.v1.reports import balance_sheet_figures

    db = StubSession([
        StubResult([_bs_row("Assets", "ACC-CUST-0001", "D", "0", "0", opening="500", otype="C")]),
        StubResult([{"total_income": D("0"), "total_expenses": D("0")}]),
    ])
    f = await balance_sheet_figures(db, USER["company_id"], date(2026, 10, 2))
    assert f["assets"][0]["balance"] == D("-500")


@pytest.mark.asyncio
async def test_profit_and_loss_filters_postings_in_a_subquery():
    """The LEFT JOIN condition left every line summed: Oct-only P&L = all-time P&L."""
    from app.api.v1.reports import get_profit_and_loss

    db = StubSession([StubResult([
        {"nature": "Income", "group_name": "Sales", "account_id": ACC, "code": "SAL-001", "account_name": "Sales",
         "total_dr": D("125000"), "total_cr": D("173000")},
        {"nature": "Expenses", "group_name": "COGS", "account_id": ACC, "code": "COGS-001", "account_name": "COGS",
         "total_dr": D("1000"), "total_cr": D("0")},
    ])])
    out = await get_profit_and_loss(from_date=date(2026, 10, 1), to_date=date(2026, 10, 2), db=db, current_user=USER)
    assert out["total_revenue"] == D("48000") and out["total_expenses"] == D("1000") and out["net_profit"] == D("47000")
    assert out["revenue"][0]["balance"] == D("48000")

    sql, params = db.executed[0]
    assert "LEFT JOIN caratloop.journal_entries" not in sql, "status/date test must not live on a LEFT JOIN condition"
    sub = sql[sql.index("LEFT JOIN ("):sql.index(") t ON")]
    assert "je.status = 'Posted'" in sub and "je.entry_date BETWEEN :from_date AND :to_date" in sub
    assert "je.entry_type NOT IN ('Opening', 'Closing')" in sub
    assert params["from_date"] == date(2026, 10, 1) and params["to_date"] == date(2026, 10, 2)


# ─── Outstanding aging vs ledger ───────────────────────────────────────────────

def _aging_row(pid, total):
    return {"party_id": pid, "party_name": "Asha Verma", "trade_name": None, "gstin": None, "phone": None,
            "credit_limit": 0, "credit_days": 30, "bucket_0_30": D(total), "bucket_31_60": D("0"),
            "bucket_61_90": D("0"), "bucket_over_90": D("0"), "total_outstanding": D(total)}


@pytest.mark.asyncio
async def test_outstanding_aging_explains_the_ledger_balance_per_party():
    from app.api.v1.reports import get_outstanding_aging

    db = RoutedSession([
        (r"JOIN caratloop\.sales_invoices si", StubResult([_aging_row(PARTY, "49440")])),
        (r"JOIN caratloop\.purchase_invoices pi", StubResult([_aging_row(PARTY, "255840")])),
        (r"FROM caratloop\.parties p\s+LEFT JOIN caratloop\.accounts a", StubResult([_balance_row(PARTY, "Asha Verma", "185690", "417090")])),
    ])
    out = await get_outstanding_aging(as_of_date=date(2026, 10, 2), party_type="Customer", db=db, current_user=USER)
    row = out["aging_report"][0]
    assert row["bills_receivable"] == D("49440") and row["bills_payable"] == D("255840")
    assert row["ledger_balance"] == D("-231400") and row["ledger_side"] == "Cr"
    # 49440 - 255840 = -206400 explained by bills; the remaining -25000 is the advances on account.
    assert row["unadjusted"] == D("-25000")
    assert out["totals"]["unadjusted"] == D("-25000")
    assert out["reconciliation"] == {"bills_receivable": D("49440"), "bills_payable": D("255840"), "ledger_total": D("-231400")}


# ─── Vouchers ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_voucher_detail_accepts_the_numeric_journal_id():
    """journal_entries.id is BIGINT; the path parameter was typed UUID (422 for '1')."""
    from app.api.v1.vouchers import get_voucher

    db = StubSession([
        StubResult([{"id": 1, "entry_no": "JV/2026-27/00001", "entry_uuid": None, "reference_type": None,
                     "reference_id": None, "reversal_of_id": None}]),
        StubResult([{"id": 10, "account_id": ACC, "party_id": None, "dr_amount": D("1"), "cr_amount": D("0"),
                     "account_code": "SAL-001", "account_name": "Sales", "normal_balance": "C", "party_name": None}]),
    ])
    out = await get_voucher("1", db=db, current_user=USER)
    assert out["entry_no"] == "JV/2026-27/00001"
    assert out["lines"][0]["account_code"] == "SAL-001"
    sql, params = db.executed[0]
    assert "WHERE id = :id" in sql and params["id"] == 1
    assert "ORDER BY jel.sequence_no" in db.statements()[1]


@pytest.mark.asyncio
async def test_voucher_detail_accepts_the_entry_uuid_and_rejects_garbage():
    from app.api.v1.vouchers import get_voucher

    db = StubSession([StubResult([])])
    with pytest.raises(HTTPException) as exc:
        await get_voucher("4d0b2c1e-6f4a-4b1e-9c1a-2b3c4d5e6f70", db=db, current_user=USER)
    assert exc.value.status_code == 404
    assert "entry_uuid = CAST(:id AS UUID)" in db.statements()[0]

    with pytest.raises(HTTPException) as exc:
        await get_voucher("not-an-id", db=StubSession(), current_user=USER)
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_voucher_detail_links_its_source_document():
    from app.api.v1.vouchers import get_voucher

    inv_id = "7a0b2c1e-6f4a-4b1e-9c1a-2b3c4d5e6f71"
    db = StubSession([
        StubResult([{"id": 1, "entry_no": "JV/1", "entry_uuid": None, "reference_type": "SalesInvoice",
                     "reference_id": inv_id, "reversal_of_id": None}]),
        StubResult([]),
        StubResult([{"invoice_no": "WEB/2026-27/00001", "invoice_date": date(2026, 9, 26), "grand_total": D("25750"),
                     "amount_paid": D("25750"), "payment_status": "Paid", "status": "Posted"}]),
    ])
    out = await get_voucher("1", db=db, current_user=USER)
    doc = out["source_document"]
    assert doc["number"] == "WEB/2026-27/00001" and doc["kind"] == "sales_invoice"
    assert doc["href"] == f"/sales?view_id={inv_id}"


@pytest.mark.asyncio
async def test_voucher_list_is_ordered():
    from app.api.v1.vouchers import list_vouchers
    from app.core.pagination import Page

    db = StubSession([StubResult([])])
    await list_vouchers(type=None, from_date=None, to_date=None, page=Page(limit=10, offset=0), db=db, current_user=USER)
    assert "ORDER BY entry_date DESC, sequence_no DESC, id DESC" in db.statements()[0]


# ─── Documents ────────────────────────────────────────────────────────────────

def test_bridge_credit_note_settles_the_invoice():
    """integrations.record_ecommerce_credit_note posted the ledger credit and
    left the invoice Unpaid, so the aging report kept the full value outstanding."""
    src = io.open(Path(__file__).resolve().parents[1] / "app" / "api" / "v1" / "integrations.py", encoding="utf-8").read()
    tree = ast.parse(src)
    fn = next(n for n in ast.walk(tree) if isinstance(n, ast.AsyncFunctionDef) and n.name == "record_ecommerce_credit_note")
    calls = [
        n for n in ast.walk(fn)
        if isinstance(n, ast.Call) and getattr(n.func, "id", None) == "settle_invoice"
    ]
    assert calls, "the bridge credit note must settle its invoice like the manual voucher does"
    kw = {k.arg for k in calls[0].keywords}
    assert {"invoice_id", "party_id"} <= kw
    assert "si.amount_paid" in src.split("async def record_ecommerce_credit_note")[1].split("dup = await")[0], \
        "the invoice row must carry amount_paid so the settlement can be capped at what is outstanding"


def test_purchase_line_values_are_rounded_to_the_paisa():
    """8.702 g x 5880.0005 posted a 4dp stock debit against a 2dp creditor."""
    from types import SimpleNamespace

    from app.api.v1.purchases import _line_values

    item = SimpleNamespace(quantity=D("1"), net_weight=D("8.7020"), rate=D("5880.0005"), making_charges=D("0"))
    mat, total = _line_values(item)
    # 8.7020 x 5880.0005 = 51167.764351: posted raw, the stock debit carried
    # four decimals while the creditor leg was rounded to two.
    assert mat == D("51167.76") and total == D("51167.76")
    assert mat.as_tuple().exponent == -2
    item = SimpleNamespace(quantity=D("3"), net_weight=D("0"), rate=D("33.333"), making_charges=D("0.005"))
    mat, total = _line_values(item)
    assert mat == D("100.00") and total == D("100.01")


# ─── Dashboard ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_dashboard_revenue_is_income_net_of_credit_notes_not_gross_invoicing():
    from app.api.v1.reports import get_dashboard_stats

    db = RoutedSession([
        (r"FROM caratloop\.sales_invoices\s+WHERE company_id = :cid AND status != 'Cancelled'",
         StubResult([{"revenue_mtd": D("79220"), "revenue_ytd": D("185690"), "invoice_count_mtd": 6}])),
        (r"ag\.nature = 'Income' AND je\.entry_date <= :today",
         StubResult([{"revenue_mtd": D("26542.38"), "revenue_ytd": D("54355.95")}])),
        (r"sle\.company_id = :cid AND m\.category = 'Gold'", StubResult([{"gold_weight_gm": D("0"), "gold_stock_value": D("0")}])),
        (r"FROM caratloop\.production_orders",
         StubResult([{"pending_orders_count": 0, "completed_orders_count": 0, "pending_planned_qty": 0}])),
    ])
    out = await get_dashboard_stats(db=db, current_user=USER)
    assert out["stats"]["revenue"] == 26542.38 and out["stats"]["revenue_ytd"] == 54355.95
    assert out["stats"]["invoiced_mtd"] == 79220.0
    rev_sql = next(s for s in db.statements() if "ag.nature = 'Income' AND je.entry_date <= :today" in s)
    assert "je.status = 'Posted'" in rev_sql and "NOT IN ('Opening', 'Closing')" in rev_sql


# ─── Reconciliation panel ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_reconciliation_panel_flags_the_audit_findings():
    from app.api.v1.reports import get_reconciliation

    cn_row = {"id": PARTY, "invoice_no": "WEB/2026-27/00001", "grand_total": D("25750"), "amount_paid": D("0"),
              "payment_status": "Unpaid", "credit_notes": D("25750")}
    stk_row = {"code": "STK-008", "name": "Other Gemstones Stock", "normal_balance": "D", "opening_balance": D("0"),
               "opening_balance_type": None, "dr": D("255840.002"), "cr": D("0")}
    db = RoutedSession([
        (r"FROM caratloop\.stock_ledger_entries", StubResult([{"v": D("255840.00")}])),
        (r"a\.account_type = 'Stock_Asset'", StubResult([stk_row])),
        (r"je\.reference_type = 'CreditNote'", StubResult([cn_row])),
        (r"SELECT id, year_label, start_date, end_date, is_active, is_locked, is_closed",
         StubResult([{"id": "fy", "year_label": "2026-27", "start_date": date(2026, 4, 1), "end_date": date(2027, 3, 31),
                      "is_active": True, "is_locked": False, "is_closed": False}])),
    ])
    out = await get_reconciliation(as_of_date=date(2026, 10, 2), db=db, current_user=USER)
    by = {c["name"]: c for c in out["checks"]}

    assert by["stock_vs_accounts"]["status"] == WARN
    assert by["stock_vs_accounts"]["difference"] == D("0.002")
    assert by["credit_notes_applied"]["status"] == FAIL and by["credit_notes_applied"]["count"] == 1
    assert by["credit_notes_applied"]["items"][0]["invoice_no"] == "WEB/2026-27/00001"
    assert by["trial_balance_postings"]["status"] == OK
    assert by["balance_sheet"]["status"] == OK
    assert by["pl_vs_balance_sheet"]["pl_from"] == "2026-04-01"
    assert by["outstanding_vs_ledgers"]["status"] == INFO
    assert out["summary"]["fail"] == 1 and out["summary"]["warn"] == 1 and out["summary"]["all_ok"] is False
    assert {c["name"] for c in out["checks"]} >= {
        "trial_balance_postings", "trial_balance_closing", "vouchers_balanced", "balance_sheet", "pl_vs_balance_sheet",
        "gst_output_register", "itc_register", "rcm_register", "rcm_self_itc", "stock_vs_accounts",
        "cash_bank_vouchers", "sales_invoices_journalled", "purchase_bills_journalled", "payment_status_consistent",
        "credit_notes_applied", "outstanding_vs_ledgers", "opening_journals",
    }


@pytest.mark.asyncio
async def test_reconciliation_panel_is_all_green_on_consistent_books():
    from app.api.v1.reports import get_reconciliation

    out = await get_reconciliation(as_of_date=date(2026, 10, 2), db=RoutedSession([]), current_user=USER)
    assert out["summary"]["fail"] == 0 and out["summary"]["warn"] == 0 and out["summary"]["all_ok"] is True
    assert all(c["status"] in (OK, INFO) for c in out["checks"])
