"""Party ledgers and outstanding balances.

A party's ledger is the ledger of its account (parties.account_id) plus any
line tagged with its party_id on a control account (a supplier with no
account of its own is posted to CRD-001 with the party on the line). Both
match the same line when the party has its own account, so the OR does not
double count.

What every reader here now agrees on (and did not, before this audit):

  * only Posted entries count, and 'Opening' journals never do in a
    cumulative figure (app.core.periods);
  * the opening balance as at the first day of the range is shown and the
    running balance starts from it, in voucher order;
  * a balance is an absolute amount with a Dr/Cr side. A customer who paid an
    advance has a credit balance; it is not a negative receivable and it is
    not a payable of the same amount.
"""

from uuid import UUID
from datetime import date
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.core.balances import side_of, signed_opening, split_sides, with_running_balance
from app.core.database import get_db
from app.core.money import to_decimal
from app.core.security import get_current_user

router = APIRouter(tags=["Ledger & Outstanding"])


PARTY_OPENING_SQL = """
    SELECT
        a.id AS account_id, a.code AS account_code, a.name AS account_name, a.normal_balance,
        COALESCE(a.opening_balance, 0) AS opening_balance, a.opening_balance_type,
        COALESCE(t.dr, 0) AS prior_dr, COALESCE(t.cr, 0) AS prior_cr
    FROM caratloop.accounts a
    LEFT JOIN (
        SELECT SUM(jel.dr_amount) AS dr, SUM(jel.cr_amount) AS cr
        FROM caratloop.journal_entry_lines jel
        JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
        WHERE je.company_id = CAST(:cid AS UUID) AND je.status = 'Posted'
          AND je.entry_type <> 'Opening'
          AND (jel.party_id = CAST(:pid AS UUID) OR jel.account_id = CAST(:acc_id AS UUID))
          AND (CAST(:from_date AS DATE) IS NOT NULL AND je.entry_date < CAST(:from_date AS DATE))
    ) t ON TRUE
    WHERE a.id = CAST(:acc_id AS UUID) AND a.company_id = CAST(:cid AS UUID)
"""

PARTY_LINES_SQL = """
    SELECT
        je.id AS journal_entry_id, je.entry_uuid, je.sequence_no AS entry_sequence,
        je.entry_date AS date, je.entry_type AS voucher_type, je.entry_no AS voucher_no,
        je.status, je.narration AS entry_narration,
        je.reference_no AS bill_ref, je.reference_type, je.reference_id,
        jel.id AS line_id, jel.sequence_no AS line_sequence,
        jel.narration AS particulars, jel.dr_amount AS debit, jel.cr_amount AS credit,
        NULL AS due_date
    FROM caratloop.journal_entry_lines jel
    JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
    WHERE je.company_id = CAST(:cid AS UUID)
      AND je.status = 'Posted'
      AND je.entry_type <> 'Opening'
      AND (jel.party_id = CAST(:pid AS UUID) OR jel.account_id = CAST(:acc_id AS UUID))
      AND (CAST(:from_date AS DATE) IS NULL OR je.entry_date >= CAST(:from_date AS DATE))
      AND (CAST(:to_date AS DATE) IS NULL OR je.entry_date <= CAST(:to_date AS DATE))
    ORDER BY je.entry_date ASC, je.sequence_no ASC, je.id ASC, jel.sequence_no ASC, jel.id ASC
"""


@router.get("/party/{party_id}")
async def get_party_ledger(
    party_id: UUID,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    [S44AA] Party ledger statement: opening balance as at ``from_date``,
    every Posted voucher in the range in date and voucher order, a running
    balance that starts from the opening figure, and the closing balance.
    """
    company_id = current_user["company_id"]

    party_res = await db.execute(
        text("SELECT id, name, party_type, account_id FROM caratloop.parties WHERE id = :pid AND company_id = :cid"),
        {"pid": str(party_id), "cid": company_id}
    )
    party = party_res.mappings().first()
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")
    if not party["account_id"]:
        raise HTTPException(status_code=409, detail="This party is not linked to a ledger account.")

    params = {
        "pid": str(party_id),
        "acc_id": str(party["account_id"]),
        "cid": str(company_id),
        # Real dates: asyncpg types CAST(:p AS DATE) as a date and refuses a str.
        "from_date": from_date,
        "to_date": to_date,
    }
    op_res = await db.execute(text(PARTY_OPENING_SQL), params)
    acc = op_res.mappings().first()
    if acc is None:
        raise HTTPException(status_code=409, detail="The party's ledger account does not exist.")
    opening = signed_opening(acc) + to_decimal(acc["prior_dr"]) - to_decimal(acc["prior_cr"])

    result = await db.execute(text(PARTY_LINES_SQL), params)
    rows = []
    for r in result.mappings().all():
        d = dict(r)
        for k in ("entry_uuid", "reference_id"):
            if d.get(k) is not None:
                d[k] = str(d[k])
        d["debit"] = to_decimal(d["debit"])
        d["credit"] = to_decimal(d["credit"])
        rows.append(d)
    entries = with_running_balance(opening, rows)
    closing = entries[-1]["running_balance"] if entries else opening
    opening_dr, opening_cr = split_sides(opening)
    closing_dr, closing_cr = split_sides(closing)
    return {
        "party": {
            "id": str(party["id"]), "name": party["name"], "party_type": party["party_type"],
            "account_id": str(acc["account_id"]), "account_code": acc["account_code"],
            "account_name": acc["account_name"], "normal_balance": acc["normal_balance"],
        },
        "from_date": str(from_date) if from_date else None,
        "to_date": str(to_date) if to_date else None,
        "opening_balance": opening,
        "opening_abs": abs(opening),
        "opening_side": side_of(opening),
        "opening_debit": opening_dr,
        "opening_credit": opening_cr,
        "entries": entries,
        "total_debit": sum((e["debit"] for e in entries), Decimal("0")),
        "total_credit": sum((e["credit"] for e in entries), Decimal("0")),
        "closing_balance": closing,
        "closing_abs": abs(closing),
        "closing_side": side_of(closing),
        "closing_debit": closing_dr,
        "closing_credit": closing_cr,
    }


# Every party's ledger balance as at a date: the account's opening balance
# (on its own side) plus every Posted, non-'Opening' posting. The old query
# left-joined the lines with no status test and put the date test in the
# WHERE clause, which both counted unposted entries and dropped parties
# with no postings. Signed, debit positive; the side is decided in Python.
PARTY_BALANCES_SQL = """
    SELECT
        p.id AS party_id, p.name AS party_name, p.party_type, p.gstin, p.phone,
        p.credit_limit, p.credit_days,
        a.id AS account_id, a.code AS account_code, a.normal_balance,
        COALESCE(a.opening_balance, 0) AS opening_balance, a.opening_balance_type,
        COALESCE(t.dr, 0) AS total_dr, COALESCE(t.cr, 0) AS total_cr
    FROM caratloop.parties p
    LEFT JOIN caratloop.accounts a ON a.id = p.account_id
    LEFT JOIN (
        SELECT COALESCE(jel.party_id, pa.id) AS party_id,
               SUM(jel.dr_amount) AS dr, SUM(jel.cr_amount) AS cr
        FROM caratloop.journal_entry_lines jel
        JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
        LEFT JOIN caratloop.parties pa ON pa.account_id = jel.account_id AND pa.company_id = je.company_id
        WHERE je.company_id = CAST(:cid AS UUID) AND je.status = 'Posted'
          AND je.entry_type <> 'Opening'
          AND je.entry_date <= CAST(:as_of AS DATE)
          AND (jel.party_id IS NOT NULL OR pa.id IS NOT NULL)
        GROUP BY COALESCE(jel.party_id, pa.id)
    ) t ON t.party_id = p.id
    WHERE p.company_id = CAST(:cid AS UUID)
    ORDER BY p.name
"""


async def party_balances(db: AsyncSession, company_id, as_of: date) -> list[dict]:
    """Signed ledger balance per party as at ``as_of`` (shared with reports)."""
    res = await db.execute(text(PARTY_BALANCES_SQL), {"cid": str(company_id), "as_of": _as_of(as_of)})
    out = []
    for r in res.mappings().all():
        d = dict(r)
        signed = signed_opening(r) + to_decimal(r["total_dr"]) - to_decimal(r["total_cr"])
        d["party_id"] = str(d["party_id"])
        d["account_id"] = str(d["account_id"]) if d.get("account_id") else None
        d["balance_signed"] = signed
        d["balance_abs"] = abs(signed)
        d["balance_side"] = side_of(signed)
        out.append(d)
    return out


def _as_of(value) -> date:
    if not value:
        return date.today()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))


def _outstanding_rows(balances: list[dict], *, receivable: bool) -> list[dict]:
    """Parties whose ledger balance sits on the asked side, with the amount.

    A party in credit is not a negative receivable: it belongs on the
    payables side (an advance we hold, or a supplier bill), and vice versa.
    Both lists therefore show only positive figures and a party appears in
    at most one of them.
    """
    rows = []
    for b in balances:
        signed = b["balance_signed"]
        if receivable and signed <= 0:
            continue
        if not receivable and signed >= 0:
            continue
        rows.append({
            "party_id": b["party_id"], "party_name": b["party_name"], "party_type": b["party_type"],
            "gstin": b["gstin"], "phone": b.get("phone"),
            "account_code": b.get("account_code"),
            "total_outstanding": abs(signed),
            "balance_side": b["balance_side"],
            "overdue_amount": 0,
        })
    rows.sort(key=lambda r: -r["total_outstanding"])
    return rows


@router.get("/outstanding/receivables")
async def get_receivables(
    as_of_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Parties with a debit ledger balance as at the date (money owed to us)."""
    balances = await party_balances(db, current_user["company_id"], _as_of(as_of_date))
    return _outstanding_rows(balances, receivable=True)


@router.get("/outstanding/payables")
async def get_payables(
    as_of_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Parties with a credit ledger balance as at the date (money we owe, or hold)."""
    balances = await party_balances(db, current_user["company_id"], _as_of(as_of_date))
    return _outstanding_rows(balances, receivable=False)


@router.get("/outstanding/age-wise")
async def get_age_wise_outstanding(
    party_type: Optional[str] = "Customer",
    as_of_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    [Section 44AA] Age-wise outstanding from the ledger: the net movement of
    each party's account in each bucket (0-30, 31-60, 61-90, >90 days), for
    parties whose balance sits on the asked side. Bill-wise aging, which
    ages each invoice by its own date and knows what has been applied to
    it, is GET /reports/outstanding-aging; this view ages the ledger.
    """
    company_id = current_user["company_id"]
    as_of = _as_of(as_of_date)
    is_cust = (party_type or "Customer") in ('Customer', 'Debtor', 'Receivable', 'Receivables')

    res = await db.execute(
        text("""
            SELECT
                COALESCE(jel.party_id, pa.id) AS party_id,
                COALESCE(SUM(CASE WHEN (CAST(:as_of_date AS DATE) - je.entry_date) <= 30
                                  THEN jel.dr_amount - jel.cr_amount ELSE 0 END), 0) AS d0_30,
                COALESCE(SUM(CASE WHEN (CAST(:as_of_date AS DATE) - je.entry_date) BETWEEN 31 AND 60
                                  THEN jel.dr_amount - jel.cr_amount ELSE 0 END), 0) AS d31_60,
                COALESCE(SUM(CASE WHEN (CAST(:as_of_date AS DATE) - je.entry_date) BETWEEN 61 AND 90
                                  THEN jel.dr_amount - jel.cr_amount ELSE 0 END), 0) AS d61_90,
                COALESCE(SUM(CASE WHEN (CAST(:as_of_date AS DATE) - je.entry_date) > 90
                                  THEN jel.dr_amount - jel.cr_amount ELSE 0 END), 0) AS d90_plus
            FROM caratloop.journal_entry_lines jel
            JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
            LEFT JOIN caratloop.parties pa ON pa.account_id = jel.account_id AND pa.company_id = je.company_id
            WHERE je.company_id = CAST(:cid AS UUID) AND je.status = 'Posted'
              AND je.entry_type <> 'Opening'
              AND je.entry_date <= CAST(:as_of_date AS DATE)
              AND (jel.party_id IS NOT NULL OR pa.id IS NOT NULL)
            GROUP BY COALESCE(jel.party_id, pa.id)
        """),
        {"cid": str(company_id), "as_of_date": as_of},
    )
    buckets = {str(r["party_id"]): dict(r) for r in res.mappings().all()}
    balances = await party_balances(db, company_id, as_of)

    sign = Decimal("1") if is_cust else Decimal("-1")
    formatted = []
    for b in balances:
        signed = b["balance_signed"] * sign
        if signed <= 0:
            continue
        bk = buckets.get(b["party_id"], {})
        # The opening balance (inception) is older than any voucher.
        opening = signed_opening(b) * sign
        d90 = to_decimal(bk.get("d90_plus")) * sign + opening
        item = {
            "party_id": b["party_id"],
            "party_name": b["party_name"],
            "gstin": b["gstin"] or "Unregistered",
            "phone": b.get("phone"),
            "balance_side": b["balance_side"],
            "total_outstanding": signed,
            "d0_30": to_decimal(bk.get("d0_30")) * sign,
            "d31_60": to_decimal(bk.get("d31_60")) * sign,
            "d61_90": to_decimal(bk.get("d61_90")) * sign,
            "d90_plus": d90,
        }
        item["total"] = item["total_outstanding"]
        formatted.append(item)
    formatted.sort(key=lambda r: -r["total_outstanding"])
    return formatted
