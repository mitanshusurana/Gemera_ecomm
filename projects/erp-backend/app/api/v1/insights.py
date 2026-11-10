"""
Caratloop ERP — Business overview, analysis reports and global search.

The owner's questions are "who owes me, whom do I owe, how much cash is there,
where did the money go, who are my best customers". The statutory reports
answer the auditor; these answer the owner:

* ``GET /reports/business-overview``: receivables and payables split into
  current and overdue, cash and bank balances, the year's cash flow by month,
  income against expenses and the largest expense heads.
* ``GET /reports/analysis``: sales by customer / item, purchases by vendor /
  item, expenses by account, for a date range.
* ``GET /search``: one box over parties, items, invoices, bills and vouchers.

Everything is read-only and comes from the same tables the registers and the
ledger read, so a figure here can be traced to the report that owns it:
receivables and payables to the age-wise outstanding report, cash and bank to
the account ledgers, expenses and income to the profit and loss account.
"""
from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.balances import signed_opening
from app.core.database import get_db
from app.core.money import to_decimal
from app.core.security import get_current_user

router = APIRouter()
search_router = APIRouter()

ANALYSIS_REPORTS = (
    "sales_by_customer", "sales_by_item", "purchases_by_vendor", "purchases_by_item", "expenses_by_account",
)


def fiscal_year_start(on: date) -> date:
    """1 April of the financial year ``on`` falls in."""
    return date(on.year if on.month >= 4 else on.year - 1, 4, 1)


def month_series(start: date, end: date, rows: list[dict]) -> list[dict]:
    """One entry per calendar month from ``start`` to ``end`` inclusive.

    ``rows`` carry ``yr``, ``mo``, ``incoming`` and ``outgoing``; a month with
    no movement is still listed (as zeros) so the chart's axis is the year,
    not only the months something happened in.
    """
    by_month = {(int(r["yr"]), int(r["mo"])): r for r in rows}
    out, y, m = [], start.year, start.month
    while (y, m) <= (end.year, end.month):
        r = by_month.get((y, m), {})
        out.append({
            "name": date(y, m, 1).strftime("%b"),
            "month": f"{y:04d}-{m:02d}",
            "incoming": float(to_decimal(r.get("incoming"))),
            "outgoing": float(to_decimal(r.get("outgoing"))),
        })
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def split_dues(row: Optional[dict]) -> dict:
    """Receivable / payable totals with the overdue part separated."""
    row = row or {}
    total = to_decimal(row.get("total"))
    overdue = to_decimal(row.get("overdue"))
    return {
        "total": float(total),
        "overdue": float(overdue),
        "current": float(total - overdue),
        "open_count": int(row.get("open_count") or 0),
        "overdue_count": int(row.get("overdue_count") or 0),
    }


@router.get("/business-overview")
async def business_overview(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Receivables, payables, cash, cash flow and expenses at a glance."""
    cid = current_user["company_id"]
    today = date.today()
    fy_start = fiscal_year_start(today)
    params = {"cid": cid, "today": today, "fy_start": fy_start}

    # An invoice is overdue once its due date has passed; without one, the
    # party's credit days from the invoice date; without those, the invoice
    # date itself. Same open-bill rule as the age-wise outstanding report.
    recv_res = await db.execute(
        text("""
            SELECT
                COALESCE(SUM(si.grand_total - si.amount_paid), 0) AS total,
                COALESCE(SUM(CASE WHEN COALESCE(si.due_date, si.invoice_date + COALESCE(p.credit_days, 0)) < CAST(:today AS DATE)
                                  THEN si.grand_total - si.amount_paid ELSE 0 END), 0) AS overdue,
                COUNT(*) AS open_count,
                COUNT(CASE WHEN COALESCE(si.due_date, si.invoice_date + COALESCE(p.credit_days, 0)) < CAST(:today AS DATE) THEN 1 END) AS overdue_count
            FROM caratloop.sales_invoices si
            JOIN caratloop.parties p ON p.id = si.customer_id
            WHERE si.company_id = :cid
              AND si.payment_status != 'Paid'
              AND si.status != 'Cancelled'
              AND si.invoice_date <= CAST(:today AS DATE)
        """),
        params,
    )
    pay_res = await db.execute(
        text("""
            SELECT
                COALESCE(SUM(pi.grand_total - pi.amount_paid), 0) AS total,
                COALESCE(SUM(CASE WHEN pi.bill_date + COALESCE(p.credit_days, 0) < CAST(:today AS DATE)
                                  THEN pi.grand_total - pi.amount_paid ELSE 0 END), 0) AS overdue,
                COUNT(*) AS open_count,
                COUNT(CASE WHEN pi.bill_date + COALESCE(p.credit_days, 0) < CAST(:today AS DATE) THEN 1 END) AS overdue_count
            FROM caratloop.purchase_invoices pi
            JOIN caratloop.parties p ON p.id = pi.vendor_id
            WHERE pi.company_id = :cid
              AND pi.payment_status != 'Paid'
              AND pi.status NOT IN ('Cancelled', 'Amended')
              AND pi.bill_date <= CAST(:today AS DATE)
        """),
        params,
    )

    # Cash and bank ledgers: the opening balance on the account plus every
    # posted line except 'Opening' journals (which restate that balance).
    bank_res = await db.execute(
        text("""
            SELECT a.id, a.code, a.name, a.account_type, a.normal_balance,
                   a.opening_balance, a.opening_balance_type,
                   COALESCE(t.net, 0) AS net,
                   COALESCE(t.net_before_fy, 0) AS net_before_fy
            FROM caratloop.accounts a
            LEFT JOIN (
                SELECT jel.account_id,
                       SUM(jel.dr_amount - jel.cr_amount) AS net,
                       SUM(CASE WHEN je.entry_date < CAST(:fy_start AS DATE) THEN jel.dr_amount - jel.cr_amount ELSE 0 END) AS net_before_fy
                FROM caratloop.journal_entry_lines jel
                JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
                WHERE je.company_id = :cid AND je.status = 'Posted'
                  AND je.entry_type <> 'Opening'
                  AND je.entry_date <= CAST(:today AS DATE)
                GROUP BY jel.account_id
            ) t ON t.account_id = a.id
            WHERE a.company_id = :cid AND a.account_type IN ('Bank', 'Cash')
              AND (a.is_active = TRUE OR t.account_id IS NOT NULL OR COALESCE(a.opening_balance, 0) <> 0)
            ORDER BY a.account_type, a.code
        """),
        params,
    )
    accounts, cash_total, cash_at_fy_start = [], Decimal("0"), Decimal("0")
    for r in bank_res.mappings().all():
        opening = signed_opening(r)
        balance = opening + to_decimal(r["net"])
        cash_total += balance
        cash_at_fy_start += opening + to_decimal(r["net_before_fy"])
        accounts.append({
            "id": str(r["id"]), "code": r["code"], "name": r["name"],
            "account_type": r["account_type"], "balance": float(balance),
        })

    # Money in and out of the cash and bank ledgers, month by month. Contra
    # entries move money between those ledgers and are left out, or a cash
    # deposit would count once as money out and once as money in.
    flow_res = await db.execute(
        text("""
            SELECT EXTRACT(YEAR FROM je.entry_date) AS yr,
                   EXTRACT(MONTH FROM je.entry_date) AS mo,
                   COALESCE(SUM(jel.dr_amount), 0) AS incoming,
                   COALESCE(SUM(jel.cr_amount), 0) AS outgoing
            FROM caratloop.journal_entry_lines jel
            JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
            JOIN caratloop.accounts a ON a.id = jel.account_id
            WHERE je.company_id = :cid AND je.status = 'Posted'
              AND je.entry_type NOT IN ('Opening', 'Contra')
              AND a.account_type IN ('Bank', 'Cash')
              AND je.entry_date >= CAST(:fy_start AS DATE)
              AND je.entry_date <= CAST(:today AS DATE)
            GROUP BY 1, 2
            ORDER BY 1, 2
        """),
        params,
    )
    months = month_series(fy_start, today, [dict(r) for r in flow_res.mappings().all()])
    incoming = sum(m["incoming"] for m in months)
    outgoing = sum(m["outgoing"] for m in months)

    # Income and expenses for the year so far, as the profit and loss account
    # reads them: income and expense groups, without opening/closing entries.
    pl_res = await db.execute(
        text("""
            SELECT
                COALESCE(SUM(CASE WHEN ag.nature = 'Income' THEN jel.cr_amount - jel.dr_amount ELSE 0 END), 0) AS income,
                COALESCE(SUM(CASE WHEN ag.nature = 'Expenses' THEN jel.dr_amount - jel.cr_amount ELSE 0 END), 0) AS expenses
            FROM caratloop.journal_entry_lines jel
            JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
            JOIN caratloop.accounts a ON a.id = jel.account_id
            JOIN caratloop.account_groups ag ON ag.id = a.group_id
            WHERE je.company_id = :cid AND je.status = 'Posted'
              AND je.entry_type NOT IN ('Opening', 'Closing')
              AND je.entry_date >= CAST(:fy_start AS DATE)
              AND je.entry_date <= CAST(:today AS DATE)
        """),
        params,
    )
    pl = pl_res.mappings().first() or {}
    exp_res = await db.execute(
        text("""
            SELECT a.id AS account_id, a.code, a.name, ag.name AS group_name,
                   SUM(jel.dr_amount - jel.cr_amount) AS amount
            FROM caratloop.journal_entry_lines jel
            JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
            JOIN caratloop.accounts a ON a.id = jel.account_id
            JOIN caratloop.account_groups ag ON ag.id = a.group_id
            WHERE je.company_id = :cid AND je.status = 'Posted'
              AND je.entry_type NOT IN ('Opening', 'Closing')
              AND ag.nature = 'Expenses'
              AND je.entry_date >= CAST(:fy_start AS DATE)
              AND je.entry_date <= CAST(:today AS DATE)
            GROUP BY a.id, a.code, a.name, ag.name
            HAVING SUM(jel.dr_amount - jel.cr_amount) > 0
            ORDER BY amount DESC
            LIMIT 5
        """),
        params,
    )
    income, expenses = to_decimal(pl.get("income")), to_decimal(pl.get("expenses"))

    return {
        "as_of": today.isoformat(),
        "fy_start": fy_start.isoformat(),
        "receivables": split_dues(dict(recv_res.mappings().first() or {})),
        "payables": split_dues(dict(pay_res.mappings().first() or {})),
        "cash_bank": {"total": float(cash_total), "accounts": accounts},
        "cash_flow": {
            "opening": float(cash_at_fy_start),
            "incoming": incoming,
            "outgoing": outgoing,
            "closing": float(cash_total),
            "months": months,
        },
        "income_expense": {"income": float(income), "expenses": float(expenses), "net": float(income - expenses)},
        "top_expenses": {
            "total": float(expenses),
            "rows": [
                {"account_id": str(r["account_id"]), "code": r["code"], "name": r["name"],
                 "group_name": r["group_name"], "amount": float(to_decimal(r["amount"]))}
                for r in exp_res.mappings().all()
            ],
        },
    }


def _rows(result) -> list[dict]:
    out = []
    for r in result.mappings().all():
        d = {}
        for k, v in dict(r).items():
            d[k] = float(v) if isinstance(v, Decimal) else (str(v) if k.endswith("_id") and v is not None else v)
        out.append(d)
    return out


def _totals(rows: list[dict], keys: tuple[str, ...]) -> dict:
    return {k: round(sum(float(r.get(k) or 0) for r in rows), 2) for k in keys}


@router.get("/analysis")
async def analysis_report(
    report: str,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Sales by customer / item, purchases by vendor / item, expenses by account."""
    if report not in ANALYSIS_REPORTS:
        raise HTTPException(status_code=422, detail="report must be one of: " + ", ".join(ANALYSIS_REPORTS))
    cid = current_user["company_id"]
    to_date = to_date or date.today()
    from_date = from_date or fiscal_year_start(to_date)
    if from_date > to_date:
        raise HTTPException(status_code=422, detail="from_date is after to_date")
    params = {"cid": cid, "from_date": from_date, "to_date": to_date}

    note = None
    if report == "sales_by_customer":
        res = await db.execute(
            text("""
                SELECT p.id AS party_id, COALESCE(NULLIF(p.trade_name, ''), p.name) AS name, p.gstin,
                       COUNT(*) AS documents,
                       COALESCE(SUM(si.grand_total - si.total_gst), 0) AS taxable,
                       COALESCE(SUM(si.total_gst), 0) AS gst,
                       COALESCE(SUM(si.grand_total), 0) AS total,
                       COALESCE(SUM(si.grand_total - si.amount_paid), 0) AS outstanding
                FROM caratloop.sales_invoices si
                JOIN caratloop.parties p ON p.id = si.customer_id
                WHERE si.company_id = :cid AND si.status != 'Cancelled'
                  AND si.invoice_date >= CAST(:from_date AS DATE) AND si.invoice_date <= CAST(:to_date AS DATE)
                GROUP BY p.id, p.trade_name, p.name, p.gstin
                ORDER BY total DESC
            """),
            params,
        )
        rows = _rows(res)
        totals = _totals(rows, ("documents", "taxable", "gst", "total", "outstanding"))
        note = "Invoices raised in the period, cancelled ones left out. Credit notes are not netted here; the profit and loss account nets them."
    elif report == "sales_by_item":
        res = await db.execute(
            text("""
                SELECT COALESCE(pr.sku, m.code) AS code,
                       COALESCE(pr.name, m.name, sil.description, 'Unspecified') AS name,
                       m.category,
                       COUNT(DISTINCT si.id) AS documents,
                       COALESCE(SUM(sil.quantity), 0) AS quantity,
                       COALESCE(SUM(sil.net_weight), 0) AS net_weight,
                       COALESCE(SUM(COALESCE(sil.taxable_material, 0) + COALESCE(sil.taxable_making, 0)), 0) AS taxable,
                       COALESCE(SUM(sil.line_total), 0) AS total
                FROM caratloop.sales_invoice_lines sil
                JOIN caratloop.sales_invoices si ON si.id = sil.invoice_id
                LEFT JOIN caratloop.products pr ON pr.id = sil.product_id
                LEFT JOIN caratloop.materials m ON m.id = COALESCE(sil.material_id, pr.material_id)
                WHERE si.company_id = :cid AND si.status != 'Cancelled'
                  AND si.invoice_date >= CAST(:from_date AS DATE) AND si.invoice_date <= CAST(:to_date AS DATE)
                GROUP BY COALESCE(pr.sku, m.code), COALESCE(pr.name, m.name, sil.description, 'Unspecified'), m.category
                ORDER BY total DESC
            """),
            params,
        )
        rows = _rows(res)
        totals = _totals(rows, ("quantity", "net_weight", "taxable", "total"))
        note = "Invoice lines of the period, cancelled invoices left out."
    elif report == "purchases_by_vendor":
        res = await db.execute(
            text("""
                SELECT p.id AS party_id, COALESCE(NULLIF(p.trade_name, ''), p.name) AS name, p.gstin,
                       COUNT(*) AS documents,
                       COALESCE(SUM(pi.taxable_value), 0) AS taxable,
                       COALESCE(SUM(pi.total_gst), 0) AS gst,
                       COALESCE(SUM(pi.grand_total), 0) AS total,
                       COALESCE(SUM(pi.grand_total - pi.amount_paid), 0) AS outstanding
                FROM caratloop.purchase_invoices pi
                JOIN caratloop.parties p ON p.id = pi.vendor_id
                WHERE pi.company_id = :cid AND pi.status NOT IN ('Cancelled', 'Amended')
                  AND pi.bill_date >= CAST(:from_date AS DATE) AND pi.bill_date <= CAST(:to_date AS DATE)
                GROUP BY p.id, p.trade_name, p.name, p.gstin
                ORDER BY total DESC
            """),
            params,
        )
        rows = _rows(res)
        totals = _totals(rows, ("documents", "taxable", "gst", "total", "outstanding"))
        note = "Bills dated in the period; a bill that was amended counts once, as its latest version."
    elif report == "purchases_by_item":
        res = await db.execute(
            text("""
                SELECT m.code, COALESCE(m.name, pil.description, 'Unspecified') AS name, m.category,
                       COUNT(DISTINCT pi.id) AS documents,
                       COALESCE(SUM(pil.quantity), 0) AS quantity,
                       COALESCE(SUM(pil.net_weight), 0) AS net_weight,
                       COALESCE(SUM(pil.material_value), 0) AS taxable,
                       COALESCE(SUM(pil.line_total), 0) AS total
                FROM caratloop.purchase_invoice_lines pil
                JOIN caratloop.purchase_invoices pi ON pi.id = pil.invoice_id
                LEFT JOIN caratloop.materials m ON m.id = pil.material_id
                WHERE pi.company_id = :cid AND pi.status NOT IN ('Cancelled', 'Amended')
                  AND pi.bill_date >= CAST(:from_date AS DATE) AND pi.bill_date <= CAST(:to_date AS DATE)
                GROUP BY m.code, COALESCE(m.name, pil.description, 'Unspecified'), m.category
                ORDER BY total DESC
            """),
            params,
        )
        rows = _rows(res)
        totals = _totals(rows, ("quantity", "net_weight", "taxable", "total"))
        note = "Bill lines of the period; services (rent, fees) appear beside goods, with category Service."
    else:  # expenses_by_account
        res = await db.execute(
            text("""
                SELECT a.id AS account_id, a.code, a.name, ag.name AS group_name,
                       COUNT(DISTINCT je.id) AS documents,
                       COALESCE(SUM(jel.dr_amount - jel.cr_amount), 0) AS total
                FROM caratloop.journal_entry_lines jel
                JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
                JOIN caratloop.accounts a ON a.id = jel.account_id
                JOIN caratloop.account_groups ag ON ag.id = a.group_id
                WHERE je.company_id = :cid AND je.status = 'Posted'
                  AND je.entry_type NOT IN ('Opening', 'Closing')
                  AND ag.nature = 'Expenses'
                  AND je.entry_date >= CAST(:from_date AS DATE) AND je.entry_date <= CAST(:to_date AS DATE)
                GROUP BY a.id, a.code, a.name, ag.name
                HAVING SUM(jel.dr_amount - jel.cr_amount) <> 0
                ORDER BY total DESC
            """),
            params,
        )
        rows = _rows(res)
        totals = _totals(rows, ("total",))
        note = "Expense ledgers as the profit and loss account reads them, net of reversals."

    return {
        "report": report, "from_date": from_date.isoformat(), "to_date": to_date.isoformat(),
        "rows": rows, "totals": totals, "note": note,
    }


def like_pattern(term: str) -> str:
    """``%term%`` for ILIKE, with the term's own % and _ escaped so they match themselves."""
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _hit(kind: str, id_: Any, title: Any, subtitle: str, href: str, **extra) -> dict:
    return {"kind": kind, "id": str(id_), "title": str(title or ""), "subtitle": subtitle, "href": href, **extra}


def _money(v: Any) -> str:
    return f"₹{to_decimal(v):,.2f}"


@search_router.get("/search")
async def global_search(
    q: str = "",
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Parties, items, sales invoices, purchase bills and vouchers matching ``q``."""
    q = (q or "").strip()
    if len(q) < 2:
        return {"q": q, "results": []}
    cid = current_user["company_id"]
    params = {"cid": cid, "like": like_pattern(q)}
    results: list[dict] = []

    res = await db.execute(
        text("""
            SELECT id, name, trade_name, party_type, gstin, phone
            FROM caratloop.parties
            WHERE company_id = :cid
              AND (name ILIKE :like OR trade_name ILIKE :like OR gstin ILIKE :like
                   OR phone ILIKE :like OR party_code ILIKE :like)
            ORDER BY is_active DESC, name
            LIMIT 6
        """),
        params,
    )
    for r in res.mappings().all():
        sub = " · ".join(x for x in (r["party_type"], r["gstin"], r["phone"]) if x)
        results.append(_hit("party", r["id"], r["trade_name"] or r["name"], sub, f"/ledger?party={r['id']}"))

    res = await db.execute(
        text("""
            SELECT id, code, name, category
            FROM caratloop.materials
            WHERE company_id = :cid AND (name ILIKE :like OR code ILIKE :like)
            ORDER BY is_active DESC, name
            LIMIT 6
        """),
        params,
    )
    for r in res.mappings().all():
        results.append(_hit("item", r["id"], r["name"], " · ".join(x for x in (r["code"], r["category"]) if x), f"/inventory?item={r['id']}"))

    res = await db.execute(
        text("""
            SELECT si.id, si.invoice_no, si.invoice_date, si.grand_total, si.status,
                   COALESCE(NULLIF(p.trade_name, ''), p.name) AS party
            FROM caratloop.sales_invoices si
            JOIN caratloop.parties p ON p.id = si.customer_id
            WHERE si.company_id = :cid
              AND (si.invoice_no ILIKE :like OR p.name ILIKE :like OR p.trade_name ILIKE :like)
            ORDER BY si.invoice_date DESC
            LIMIT 6
        """),
        params,
    )
    for r in res.mappings().all():
        sub = f"Sales invoice · {r['party']} · {r['invoice_date']} · {_money(r['grand_total'])}"
        if r["status"] == "Cancelled":
            sub += " · Cancelled"
        results.append(_hit("sales_invoice", r["id"], r["invoice_no"], sub, f"/sales?q={r['invoice_no']}"))

    res = await db.execute(
        text("""
            SELECT pi.id, pi.bill_no, pi.vendor_inv_no, pi.bill_date, pi.grand_total, pi.status,
                   COALESCE(NULLIF(p.trade_name, ''), p.name) AS party
            FROM caratloop.purchase_invoices pi
            JOIN caratloop.parties p ON p.id = pi.vendor_id
            WHERE pi.company_id = :cid
              AND (pi.bill_no ILIKE :like OR pi.vendor_inv_no ILIKE :like OR p.name ILIKE :like OR p.trade_name ILIKE :like)
            ORDER BY pi.bill_date DESC
            LIMIT 6
        """),
        params,
    )
    for r in res.mappings().all():
        sub = f"Purchase bill · {r['party']} · inv {r['vendor_inv_no'] or '-'} · {r['bill_date']} · {_money(r['grand_total'])}"
        if r["status"] in ("Cancelled", "Amended"):
            sub += f" · {r['status']}"
        results.append(_hit("purchase_bill", r["id"], r["bill_no"], sub, f"/purchases?view_id={r['id']}"))

    res = await db.execute(
        text("""
            SELECT id, entry_no, entry_date, entry_type, narration, total_debit
            FROM caratloop.journal_entries
            WHERE company_id = :cid AND (entry_no ILIKE :like OR narration ILIKE :like)
            ORDER BY entry_date DESC, id DESC
            LIMIT 6
        """),
        params,
    )
    for r in res.mappings().all():
        sub = f"{r['entry_type']} voucher · {r['entry_date']} · {_money(r['total_debit'])} · {(r['narration'] or '')[:60]}"
        results.append(_hit("voucher", r["id"], r["entry_no"], sub, "", voucher_id=int(r["id"])))

    return {"q": q, "results": results}
