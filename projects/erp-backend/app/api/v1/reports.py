"""
Caratloop ERP — Reports API
Compliance reports for MCA, GST, and Income Tax
"""
from typing import Optional, List, Dict, Any
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.core.config import settings
from app.core.database import get_db
from decimal import Decimal

from app.api.v1.ledger import party_balances
from app.core.balances import OK, WARN, FAIL, INFO, check, side_of, signed_opening
from app.core.ledger import TOLERANCE
from app.core.periods import _as_date, load_fiscal_years
from app.core.money import round_money, to_decimal
from app.core.roles import CAN_READ_FULL_AUDIT, has_role
from app.core.security import get_current_user

router = APIRouter()


@router.get("/audit-trail")
async def get_audit_trail(
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    table_name: Optional[str] = None,
    user_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    [MCA Rule 11(g)] Immutable Audit Trail Report.
    """
    # Was compared against lowercase literals while the only role the system
    # issued was 'SuperAdmin', so the sole administrator was denied the full
    # trail. has_role() normalises case.
    if not has_role(current_user, CAN_READ_FULL_AUDIT):
        user_id = str(current_user["id"])

    query = """
        SELECT
            al.id, al.action, al.table_name, al.record_id,
            al.changed_fields, al.reason,
            al.old_value, al.new_value,
            al.ip_address, al.server_timestamp,
            al.sequence_no, al.row_hash,
            u.full_name AS user_name, u.email AS user_email
        FROM caratloop.audit_log al
        LEFT JOIN caratloop.users u ON u.id = al.user_id
        WHERE al.company_id = :cid
    """
    params = {"cid": current_user["company_id"]}
    if from_date:
        query += " AND al.server_timestamp >= :from_date"
        params["from_date"] = from_date
    if to_date:
        query += " AND al.server_timestamp <= :to_date"
        params["to_date"] = to_date
    if table_name:
        query += " AND al.table_name = :table_name"
        params["table_name"] = table_name
    if user_id:
        query += " AND al.user_id = :user_id"
        params["user_id"] = user_id
    query += " ORDER BY al.sequence_no DESC LIMIT 500"

    result = await db.execute(text(query), params)
    rows = result.mappings().all()

    return {
        "mca_rule": "11(g) Companies (Audit & Auditors) Rules 2014",
        "audit_trail": [dict(r) for r in rows],
        "note": "This log is IMMUTABLE. DELETE and UPDATE are blocked at database level.",
    }


@router.get("/trial-balance")
async def get_reports_trial_balance(
    as_of_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """[Section 44AA] Trial Balance Report proxy to Accounting module."""
    from app.api.v1.accounting import get_trial_balance
    res = await get_trial_balance(as_of_date=as_of_date, db=db, current_user=current_user)
    res["total_debit"] = res.get("totals", {}).get("total_debit", 0)
    res["total_credit"] = res.get("totals", {}).get("total_credit", 0)
    res["is_balanced"] = res.get("totals", {}).get("is_balanced", False)
    return res


BALANCE_SHEET_SQL = """
    SELECT
        ag.nature,
        ag.name AS group_name,
        a.id AS account_id, a.code, a.name AS account_name, a.normal_balance,
        COALESCE(a.opening_balance, 0) AS opening_balance, a.opening_balance_type,
        COALESCE(t.dr, 0) AS total_dr, COALESCE(t.cr, 0) AS total_cr
    FROM caratloop.accounts a
    JOIN caratloop.account_groups ag ON ag.id = a.group_id
    -- Postings filtered in a subquery: a date test in a LEFT JOIN's
    -- ON clause left every line summed regardless of as_of_date.
    -- 'Opening' journals restate balances already posted and are
    -- skipped in a from-inception total (app.core.periods).
    LEFT JOIN (
        SELECT jel.account_id, SUM(jel.dr_amount) AS dr, SUM(jel.cr_amount) AS cr
        FROM caratloop.journal_entry_lines jel
        JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
        WHERE je.company_id = :cid AND je.status = 'Posted'
          AND je.entry_date <= :as_of_date AND je.entry_type <> 'Opening'
        GROUP BY jel.account_id
    ) t ON t.account_id = a.id
    WHERE a.company_id = :cid AND a.is_active = TRUE
    ORDER BY ag.nature, ag.name, a.code
"""

# Profit or loss not yet transferred to Retained Earnings: every P&L
# posting since inception. A closed year's 'Closing' journal brings its
# accounts to zero and moves the net into CAP-002, so what remains here is
# exactly the unclosed years' result and nothing is counted twice.
UNCLOSED_PL_SQL = """
    SELECT
        COALESCE(SUM(CASE WHEN ag.nature = 'Income' THEN jel.cr_amount - jel.dr_amount ELSE 0 END), 0) AS total_income,
        COALESCE(SUM(CASE WHEN ag.nature = 'Expenses' THEN jel.dr_amount - jel.cr_amount ELSE 0 END), 0) AS total_expenses
    FROM caratloop.journal_entry_lines jel
    JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
    JOIN caratloop.accounts a ON a.id = jel.account_id
    JOIN caratloop.account_groups ag ON ag.id = a.group_id
    WHERE je.company_id = :cid AND je.status = 'Posted' AND je.entry_date <= :as_of_date
      AND je.entry_type <> 'Opening'
"""


async def balance_sheet_figures(db: AsyncSession, company_id, as_of_date: date) -> dict:
    """Balance sheet as Decimals, shared with the reconciliation panel."""
    result = await db.execute(text(BALANCE_SHEET_SQL), {"as_of_date": as_of_date, "cid": company_id})
    rows = []
    for r in result.mappings().all():
        d = dict(r)
        d["account_id"] = str(d["account_id"])
        signed = signed_opening(r) + to_decimal(r["total_dr"]) - to_decimal(r["total_cr"])
        # Shown on the side its group lives on: assets debit-positive,
        # liabilities and equity credit-positive. A flipped account (a debtor
        # in credit) is a negative figure under its own group, which is how
        # it nets to the right total; the side is spelled out as well.
        d["balance"] = signed if r["nature"] == "Assets" else -signed
        d["balance_signed"] = signed
        d["balance_side"] = side_of(signed)
        rows.append(d)

    def group_by_nature(nature):
        return [r for r in rows if r["nature"] == nature]

    assets = group_by_nature("Assets")
    liabilities = group_by_nature("Liabilities")
    equity = group_by_nature("Equity")

    pl_res = await db.execute(text(UNCLOSED_PL_SQL), {"cid": company_id, "as_of_date": as_of_date})
    pl_row = pl_res.mappings().first() or {}
    total_income = to_decimal(pl_row.get("total_income"))
    total_expenses = to_decimal(pl_row.get("total_expenses"))
    # Decimal throughout. This was a float added to Decimal balances, which
    # raised TypeError and made the whole report answer 500.
    net_profit = total_income - total_expenses

    equity.append({
        "code": "CUR-YR-PL",
        "account_name": "Net Profit / (Loss) not yet transferred to Retained Earnings",
        "group_name": "Capital & Equity",
        "nature": "Equity",
        "balance": net_profit,
        "balance_signed": -net_profit,
        "balance_side": side_of(-net_profit),
    })

    total_assets = sum((to_decimal(r["balance"]) for r in assets), Decimal("0"))
    total_liabilities = sum((to_decimal(r["balance"]) for r in liabilities), Decimal("0"))
    total_equity = sum((to_decimal(r["balance"]) for r in equity), Decimal("0"))
    total_liab_equity = total_liabilities + total_equity
    difference = total_assets - total_liab_equity
    return {
        "assets": assets,
        "liabilities": liabilities,
        "equity": equity,
        "total_assets": total_assets,
        "total_liabilities": total_liabilities,
        "total_equity": total_equity,
        "total_liabilities_and_equity": total_liab_equity,
        "unclosed_income": total_income,
        "unclosed_expenses": total_expenses,
        "net_profit": net_profit,
        "difference": difference,
        # The same tolerance as the posting guard; it was "< 1.0", which
        # would have called a balance sheet out by 99 paise balanced.
        "is_balanced": abs(difference) <= TOLERANCE,
    }


@router.get("/balance-sheet")
async def get_balance_sheet(
    as_of_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """[Section 44AA] Balance Sheet as at a given date."""
    if not as_of_date:
        as_of_date = date.today()
    elif isinstance(as_of_date, str):
        as_of_date = date.fromisoformat(as_of_date)

    f = await balance_sheet_figures(db, current_user["company_id"], as_of_date)
    return {
        "as_of_date": str(as_of_date),
        "section_44aa": "Balance Sheet",
        "assets": f["assets"],
        "liabilities": f["liabilities"],
        "equity": f["equity"],
        "total_assets": f["total_assets"],
        "total_liabilities": f["total_liabilities"],
        "total_equity": f["total_equity"],
        "net_profit": f["net_profit"],
        "totals": {
            "total_assets": f["total_assets"],
            "total_liabilities": f["total_liabilities"],
            "total_equity": f["total_equity"],
            "total_liabilities_and_equity": f["total_liabilities_and_equity"],
            "difference": f["difference"],
            "is_balanced": f["is_balanced"],
        },
    }


@router.get("/dashboard-stats")
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Real-time Live Executive Dashboard Statistics.
    Eliminates all hardcoded values and queries database tables.
    """
    cid = current_user["company_id"]
    today = date.today()
    mtd_start = date(today.year, today.month, 1)
    ytd_start = date(today.year if today.month >= 4 else today.year - 1, 4, 1)
    six_months_ago = today - timedelta(days=180)

    # 1. Total Revenue (MTD & YTD)
    rev_res = await db.execute(
        text("""
            SELECT
                COALESCE(SUM(CASE WHEN invoice_date >= :mtd_start THEN grand_total ELSE 0 END), 0) AS revenue_mtd,
                COALESCE(SUM(CASE WHEN invoice_date >= :ytd_start THEN grand_total ELSE 0 END), 0) AS revenue_ytd,
                COUNT(CASE WHEN invoice_date >= :mtd_start THEN 1 END) AS invoice_count_mtd
            FROM caratloop.sales_invoices
            WHERE company_id = :cid AND status != 'Cancelled'
        """),
        {"cid": cid, "mtd_start": mtd_start, "ytd_start": ytd_start},
    )
    rev_row = rev_res.mappings().first()
    # Gross invoicing (tax included, credit notes ignored): what was billed.
    invoiced_mtd = float(rev_row["revenue_mtd"] or 0)
    invoiced_ytd = float(rev_row["revenue_ytd"] or 0)

    # Revenue is what the P&L calls revenue: the income accounts, net of
    # credit notes and without GST. The tile used to show the invoice grand
    # totals above, so a month in which every sale was returned still showed
    # the full sales figure, inflated by the tax on it, and never agreed with
    # the P&L or with the chart beneath it (which already reads the ledger).
    pl_res = await db.execute(
        text("""
            SELECT
                COALESCE(SUM(CASE WHEN je.entry_date >= :mtd_start THEN jel.cr_amount - jel.dr_amount ELSE 0 END), 0) AS revenue_mtd,
                COALESCE(SUM(CASE WHEN je.entry_date >= :ytd_start THEN jel.cr_amount - jel.dr_amount ELSE 0 END), 0) AS revenue_ytd
            FROM caratloop.journal_entry_lines jel
            JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
            JOIN caratloop.accounts a ON a.id = jel.account_id
            JOIN caratloop.account_groups ag ON ag.id = a.group_id
            WHERE je.company_id = :cid AND je.status = 'Posted'
              AND je.entry_type NOT IN ('Opening', 'Closing')
              AND ag.nature = 'Income' AND je.entry_date <= :today
        """),
        {"cid": cid, "mtd_start": mtd_start, "ytd_start": ytd_start, "today": today},
    )
    pl_row = pl_res.mappings().first()
    revenue_mtd = float(pl_row["revenue_mtd"] or 0)
    revenue_ytd = float(pl_row["revenue_ytd"] or 0)

    # 2. Precious Metals Stock (Total Gold in Grams & Total Valuation)
    gold_res = await db.execute(
        text("""
            SELECT
                COALESCE(SUM(CASE WHEN sle.direction = 'I' THEN COALESCE(sle.net_weight, sle.quantity) ELSE -COALESCE(sle.net_weight, sle.quantity) END), 0) AS gold_weight_gm,
                COALESCE(SUM(CASE WHEN sle.direction = 'I' THEN COALESCE(sle.amount, 0) ELSE -COALESCE(sle.amount, 0) END), 0) AS gold_stock_value
            FROM caratloop.stock_ledger_entries sle
            JOIN caratloop.materials m ON m.id = sle.material_id
            WHERE sle.company_id = :cid AND m.category = 'Gold'
        """),
        {"cid": cid},
    )
    gold_row = gold_res.mappings().first()
    gold_weight_gm = float(gold_row["gold_weight_gm"] or 0)
    gold_stock_value = float(gold_row["gold_stock_value"] or 0)

    # 3. Active / Pending Production Orders
    po_res = await db.execute(
        text("""
            SELECT
                COUNT(CASE WHEN status IN ('Draft', 'Released', 'In_Progress') THEN 1 END) AS pending_orders_count,
                COUNT(CASE WHEN status = 'Completed' THEN 1 END) AS completed_orders_count,
                COALESCE(SUM(CASE WHEN status IN ('Draft', 'Released', 'In_Progress') THEN planned_qty ELSE 0 END), 0) AS pending_planned_qty
            FROM caratloop.production_orders
            WHERE company_id = :cid
        """),
        {"cid": cid},
    )
    po_row = po_res.mappings().first()
    pending_orders = int(po_row["pending_orders_count"] or 0)
    completed_orders = int(po_row["completed_orders_count"] or 0)

    # 4. Live Net GST Liability [CGST Rule 56(4)]
    gst_out_res = await db.execute(
        # Signed: a credit note reduces output tax. Summing every row counted a
        # cancelled sale twice -- once as the invoice, once as its credit note
        # -- and reported a liability that did not exist.
        text(
            "SELECT COALESCE(SUM(CASE WHEN is_credit_note THEN -total_tax ELSE total_tax END), 0) "
            "AS out_tax FROM caratloop.gst_output_tax_register WHERE company_id = :cid"
        ),
        {"cid": cid},
    )
    # Net of reversals: an amended bill leaves its original row and a
    # reversing row (is_reversal) in each register.
    itc_res = await db.execute(
        text("SELECT COALESCE(SUM(CASE WHEN is_reversal THEN -total_itc ELSE total_itc END), 0) AS itc_tax FROM caratloop.itc_register WHERE company_id = :cid AND is_eligible = TRUE"),
        {"cid": cid},
    )
    rcm_res = await db.execute(
        text("SELECT COALESCE(SUM(CASE WHEN is_reversal THEN -total_rcm ELSE total_rcm END), 0) AS rcm_tax FROM caratloop.rcm_liability_register WHERE company_id = :cid"),
        {"cid": cid},
    )
    output_tax = float(gst_out_res.scalar() or 0)
    itc_tax = float(itc_res.scalar() or 0)
    rcm_tax = float(rcm_res.scalar() or 0)
    net_gst_liability = max(0.0, output_tax - itc_tax) + rcm_tax

    # 5. Dynamic Revenue vs Expenses (Monthly historical curve for current FY / 6 months)
    chart_res = await db.execute(
        text("""
            SELECT
                TO_CHAR(je.entry_date, 'Mon') AS month_name,
                EXTRACT(YEAR FROM je.entry_date) AS yr,
                EXTRACT(MONTH FROM je.entry_date) AS mo,
                COALESCE(SUM(CASE WHEN ag.nature = 'Income' THEN jel.cr_amount - jel.dr_amount ELSE 0 END), 0) AS revenue,
                COALESCE(SUM(CASE WHEN ag.nature = 'Expenses' THEN jel.dr_amount - jel.cr_amount ELSE 0 END), 0) AS expenses
            FROM caratloop.journal_entries je
            JOIN caratloop.journal_entry_lines jel ON jel.journal_entry_id = je.id
            JOIN caratloop.accounts a ON a.id = jel.account_id
            JOIN caratloop.account_groups ag ON ag.id = a.group_id
            WHERE je.company_id = :cid AND je.status = 'Posted'
              AND je.entry_date >= :six_months_ago
            GROUP BY TO_CHAR(je.entry_date, 'Mon'), EXTRACT(YEAR FROM je.entry_date), EXTRACT(MONTH FROM je.entry_date)
            ORDER BY yr, mo
        """),
        {"cid": cid, "six_months_ago": six_months_ago},
    )
    revenue_chart_data = [
        {
            "name": r["month_name"],
            "revenue": float(r["revenue"] or 0),
            "expenses": float(r["expenses"] or 0),
        }
        for r in chart_res.mappings().all()
    ]
    # Fallback to current month if brand new database
    if not revenue_chart_data:
        revenue_chart_data = [
            {"name": today.strftime("%b"), "revenue": revenue_mtd, "expenses": 0.0}
        ]

    # 6. Category-Wise Stock Chart
    stock_chart_res = await db.execute(
        text("""
            SELECT
                CASE
                    WHEN m.category = 'Gold' AND m.purity_standard = '24K' THEN '24K Gold'
                    WHEN m.category = 'Gold' AND m.purity_standard = '22K' THEN '22K Gold'
                    WHEN m.category = 'Gold' AND m.purity_standard = '18K' THEN '18K Gold'
                    WHEN m.category = 'Gold' THEN 'Gold (General)'
                    WHEN m.category = 'Silver' THEN 'Silver'
                    WHEN m.category = 'Diamond' THEN 'Diamonds'
                    WHEN m.category = 'Ruby' THEN 'Ruby'
                    WHEN m.category = 'Emerald' THEN 'Emerald'
                    WHEN m.category = 'Sapphire' THEN 'Sapphire'
                    ELSE m.name
                END AS name,
                COALESCE(SUM(CASE WHEN sle.direction = 'I' THEN COALESCE(sle.net_weight, sle.quantity) ELSE -COALESCE(sle.net_weight, sle.quantity) END), 0) AS weight
            FROM caratloop.materials m
            LEFT JOIN caratloop.stock_ledger_entries sle ON sle.material_id = m.id AND sle.company_id = m.company_id
            WHERE m.company_id = :cid AND m.is_active = TRUE
            GROUP BY 1
            ORDER BY weight DESC
            LIMIT 6
        """),
        {"cid": cid},
    )
    stock_chart_data = [
        {"name": r["name"], "weight": round(float(r["weight"] or 0), 2)}
        for r in stock_chart_res.mappings().all()
    ]

    # 7. Recent Transactions (Live 6 journal entries)
    tx_res = await db.execute(
        text("""
            SELECT
                je.id, je.entry_no, je.entry_date, je.entry_type,
                je.narration, je.total_debit AS amount, je.status
            FROM caratloop.journal_entries je
            WHERE je.company_id = :cid
            ORDER BY je.id DESC
            LIMIT 6
        """),
        {"cid": cid},
    )
    recent_transactions = [
        {
            "id": r["entry_no"],
            "type": r["entry_type"],
            "entity": r["narration"],
            "date": str(r["entry_date"]),
            "amount": float(r["amount"] or 0),
            "status": r["status"],
        }
        for r in tx_res.mappings().all()
    ]

    # 8. Dynamic Statutory Alerts
    alerts = []
    # Check low stock materials
    low_stock_res = await db.execute(
        text("""
            SELECT m.name, uom.code AS unit,
                   COALESCE(SUM(CASE WHEN sle.direction = 'I' THEN sle.quantity ELSE -sle.quantity END), 0) AS stock
            FROM caratloop.materials m
            JOIN caratloop.units_of_measure uom ON uom.id = m.uom_id
            LEFT JOIN caratloop.stock_ledger_entries sle ON sle.material_id = m.id AND sle.company_id = m.company_id
            WHERE m.company_id = :cid AND m.is_active = TRUE
            GROUP BY m.id, m.name, uom.code
            HAVING COALESCE(SUM(CASE WHEN sle.direction = 'I' THEN sle.quantity ELSE -sle.quantity END), 0) <= 0
            LIMIT 3
        """),
        {"cid": cid},
    )
    for row in low_stock_res.mappings().all():
        alerts.append({
            "type": "warning",
            "title": f"Low Stock: {row['name']}",
            "desc": f"Current balance is {row['stock']} {row['unit']}. Replenish inventory."
        })

    # Statutory Compliance Deadlines
    next_month = (today.replace(day=1) + timedelta(days=32)).replace(day=1)
    gstr1_date = today.replace(day=11) if today.day <= 11 else next_month.replace(day=11)
    gstr3b_date = today.replace(day=20) if today.day <= 20 else next_month.replace(day=20)

    alerts.append({
        "type": "compliance",
        "title": "GSTR-1 Return Due",
        "desc": f"Statutory filing deadline: {gstr1_date.strftime('%d %b %Y')} ({max(0, (gstr1_date - today).days)} days remaining)."
    })
    alerts.append({
        "type": "compliance",
        "title": "GSTR-3B Tax Settlement Due",
        "desc": f"Statutory monthly filing deadline: {gstr3b_date.strftime('%d %b %Y')} ({max(0, (gstr3b_date - today).days)} days remaining)."
    })

    return {
        "stats": {
            "revenue": revenue_mtd,
            "revenue_ytd": revenue_ytd,
            "invoiced_mtd": invoiced_mtd,
            "invoiced_ytd": invoiced_ytd,
            "revenue_basis": "Income accounts in the ledger: net of credit notes, excluding GST",
            "stock_grams": gold_weight_gm,
            "stock_value": gold_stock_value,
            "pending_orders": pending_orders,
            "completed_orders": completed_orders,
            "gst_liability": net_gst_liability,
            "output_gst": output_tax,
            "itc_available": itc_tax,
        },
        "revenue_chart": revenue_chart_data,
        "stock_chart": stock_chart_data,
        "recent_transactions": recent_transactions,
        "alerts": alerts,
    }


@router.get("/production-account")
async def get_production_account(
    month_year: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    [CGST Rule 56(12)] Monthly Production Account for Manufacturers.
    Quantitative & Qualitative manufacturing reconciliation.
    """
    cid = current_user["company_id"]
    if not month_year:
        month_year = date.today().strftime("%Y-%m")

    # Fetch all production orders for this month
    po_res = await db.execute(
        text("""
            SELECT
                po.id, po.order_no, po.order_date AS start_date, po.order_date AS due_date, po.completed_at,
                po.status, po.planned_qty, po.actual_qty,
                p.name AS product_name, p.sku, p.collection_name,
                art.name AS artisan_name
            FROM caratloop.production_orders po
            JOIN caratloop.products p ON p.id = po.product_id
            LEFT JOIN caratloop.parties art ON art.id = po.artisan_id
            WHERE po.company_id = :cid
              AND (po.month_year = :month_year OR TO_CHAR(po.order_date, 'YYYY-MM') = :month_year)
            ORDER BY po.order_date DESC
        """),
        {"cid": cid, "month_year": month_year},
    )
    orders = [dict(r) for r in po_res.mappings().all()]

    # Fetch consumption lines
    cons_res = await db.execute(
        text("""
            SELECT
                pce.id, pce.production_order_id, pce.entry_date,
                m.code AS material_code, m.name AS material_name, m.category,
                uom.code AS uom, pce.qty_issued AS quantity_issued, pce.gross_weight,
                pce.net_weight, pce.purity, pce.rate, pce.amount
            FROM caratloop.production_consumption_entries pce
            JOIN caratloop.materials m ON m.id = pce.material_id
            JOIN caratloop.units_of_measure uom ON uom.id = pce.uom_id
            JOIN caratloop.production_orders po ON po.id = pce.production_order_id
            WHERE pce.company_id = :cid AND TO_CHAR(pce.entry_date, 'YYYY-MM') = :month_year
            ORDER BY pce.entry_date
        """),
        {"cid": cid, "month_year": month_year},
    )
    consumption = [dict(r) for r in cons_res.mappings().all()]

    # Fetch output entries
    out_res = await db.execute(
        text("""
            SELECT
                poe.id, poe.production_order_id, poe.entry_date,
                m.code AS material_code, m.name AS material_name,
                poe.qty_produced AS quantity_produced, poe.gross_weight, poe.net_weight,
                poe.hallmark_no, poe.valuation_rate,
                COALESCE(poe.valuation_rate * poe.qty_produced, 0) AS amount
            FROM caratloop.production_output_entries poe
            JOIN caratloop.materials m ON m.id = poe.material_id
            JOIN caratloop.production_orders po ON po.id = poe.production_order_id
            WHERE poe.company_id = :cid AND TO_CHAR(poe.entry_date, 'YYYY-MM') = :month_year
            ORDER BY poe.entry_date
        """),
        {"cid": cid, "month_year": month_year},
    )
    output = [dict(r) for r in out_res.mappings().all()]

    # Fetch wastage entries
    w_res = await db.execute(
        text("""
            SELECT
                pwe.id, pwe.production_order_id, pwe.entry_date,
                pwe.wastage_type, m.name AS material_name,
                pwe.qty_lost, pwe.loss_pct, pwe.recoverable_qty,
                pwe.rate, pwe.amount, pwe.remarks
            FROM caratloop.production_wastage_entries pwe
            JOIN caratloop.materials m ON m.id = pwe.material_id
            JOIN caratloop.production_orders po ON po.id = pwe.production_order_id
            WHERE pwe.company_id = :cid AND TO_CHAR(pwe.entry_date, 'YYYY-MM') = :month_year
            ORDER BY pwe.entry_date
        """),
        {"cid": cid, "month_year": month_year},
    )
    wastage = [dict(r) for r in w_res.mappings().all()]

    total_consumed_wt = sum(float(c.get("net_weight") or c.get("quantity_issued") or 0) for c in consumption)
    total_consumed_cost = sum(float(c.get("amount") or 0) for c in consumption)
    total_output_wt = sum(float(o.get("net_weight") or 0) for o in output)
    total_output_val = sum(float(o.get("amount") or 0) for o in output)
    total_lost_wt = sum(float(w.get("qty_lost") or 0) for w in wastage)
    total_lost_cost = sum(float(w.get("amount") or 0) for w in wastage)

    return {
        "month_year": month_year,
        "cgst_rule": "Rule 56(12) Monthly Production Account",
        "orders": orders,
        "consumption": consumption,
        "output": output,
        "wastage": wastage,
        "summary": {
            "total_orders": len(orders),
            "completed_orders": len([o for o in orders if o["status"] == "Completed"]),
            "total_consumed_wt_gm": total_consumed_wt,
            "total_consumed_cost": total_consumed_cost,
            "total_output_wt_gm": total_output_wt,
            "total_output_valuation": total_output_val,
            "total_wastage_wt_gm": total_lost_wt,
            "total_wastage_cost": total_lost_cost,
            "recovery_rate_pct": round((total_output_wt / total_consumed_wt * 100) if total_consumed_wt > 0 else 0, 2)
        }
    }


@router.get("/gst-tax-register")
async def get_gst_tax_register(
    period: Optional[str] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    [CGST Rule 56(4)] Dual-Rate GST Tax Register (Output, ITC & RCM).
    """
    cid = current_user["company_id"]
    if not to_date:
        to_date = date.today()
    elif isinstance(to_date, str):
        to_date = date.fromisoformat(to_date)

    if not from_date:
        from_date = date(to_date.year if to_date.month >= 4 else to_date.year - 1, 4, 1)
    elif isinstance(from_date, str):
        from_date = date.fromisoformat(from_date)

    # 1. Output Register (Sales Invoices & Credit Notes)
    out_res = await db.execute(
        text("""
            SELECT
                gtr.id, gtr.invoice_id, gtr.invoice_no, gtr.invoice_date,
                gtr.party_gstin AS buyer_gstin, gtr.place_of_supply AS buyer_state_code, gtr.is_inter_state,
                gtr.taxable_material_value AS material_taxable_value,
                gtr.taxable_making_value AS making_taxable_value,
                gtr.cgst_amount, gtr.sgst_amount, gtr.igst_amount,
                gtr.total_tax AS total_tax_amount,
                gtr.is_credit_note,
                (gtr.taxable_material_value + gtr.taxable_making_value + gtr.total_tax) AS grand_total,
                p.name AS customer_name
            FROM caratloop.gst_output_tax_register gtr
            LEFT JOIN caratloop.parties p ON p.id = gtr.party_id
            WHERE gtr.company_id = :cid
              AND gtr.invoice_date BETWEEN :from_date AND :to_date
            ORDER BY gtr.invoice_date DESC
        """),
        {"cid": cid, "from_date": from_date, "to_date": to_date},
    )
    output_entries = [dict(r) for r in out_res.mappings().all()]

    # 2. ITC Register (Purchases & Inward Supplies)
    itc_res = await db.execute(
        text("""
            SELECT
                ir.id, ir.invoice_id AS purchase_invoice_id, ir.vendor_invoice_no AS supplier_invoice_no, ir.invoice_date,
                ir.vendor_gstin AS supplier_gstin,
                COALESCE(pi.subtotal_value, 0) AS taxable_value,
                ir.cgst_credit AS cgst_itc, ir.sgst_credit AS sgst_itc, ir.igst_credit AS igst_itc,
                (NOT ir.is_eligible) AS is_ineligible, ir.ineligibility_reason,
                ir.is_reversal,
                p.name AS supplier_name
            FROM caratloop.itc_register ir
            LEFT JOIN caratloop.parties p ON p.id = ir.vendor_id
            LEFT JOIN caratloop.purchase_invoices pi ON pi.id = ir.invoice_id
            WHERE ir.company_id = :cid
              AND ir.invoice_date BETWEEN :from_date AND :to_date
            ORDER BY ir.invoice_date DESC
        """),
        {"cid": cid, "from_date": from_date, "to_date": to_date},
    )
    itc_entries = [dict(r) for r in itc_res.mappings().all()]

    # 3. RCM Register (Old Gold Purchases from Unregistered)
    rcm_res = await db.execute(
        text("""
            SELECT
                rcm.id, rcm.purchase_invoice_id, rcm.vendor_name AS unregistered_seller_name, rcm.vendor_pan AS seller_pan,
                rcm.transaction_date AS invoice_date, rcm.purchase_value,
                rcm.cgst_rcm AS rcm_cgst, rcm.sgst_rcm AS rcm_sgst, rcm.igst_rcm AS rcm_igst,
                rcm.total_rcm AS total_tax, rcm.is_paid AS tax_paid, rcm.itc_availed AS itc_claimed,
                rcm.is_reversal
            FROM caratloop.rcm_liability_register rcm
            WHERE rcm.company_id = :cid
              AND rcm.transaction_date BETWEEN :from_date AND :to_date
            ORDER BY rcm.transaction_date DESC
        """),
        {"cid": cid, "from_date": from_date, "to_date": to_date},
    )
    rcm_entries = [dict(r) for r in rcm_res.mappings().all()]

    tot_material_taxable = sum(float(r.get("material_taxable_value") or 0) for r in output_entries)
    tot_making_taxable = sum(float(r.get("making_taxable_value") or 0) for r in output_entries)
    # Credit notes are listed but subtracted, for the same reason as above.
    tot_output_tax = sum(
        (-1 if r.get("is_credit_note") else 1) * float(r.get("total_tax_amount") or 0)
        for r in output_entries
    )
    # Reversal rows (amended bills) are listed and netted off, like credit notes above.
    tot_itc_tax = sum(
        (-1 if r.get("is_reversal") else 1) * float(r.get("cgst_itc", 0) + r.get("sgst_itc", 0) + r.get("igst_itc", 0))
        for r in itc_entries if not r.get("is_ineligible")
    )
    tot_rcm_tax = sum((-1 if r.get("is_reversal") else 1) * float(r.get("total_tax") or 0) for r in rcm_entries)

    return {
        "from_date": str(from_date),
        "to_date": str(to_date),
        "cgst_rule": "Rule 56(4) Dual-Rate GST Register",
        "output_register": output_entries,
        "itc_register": itc_entries,
        "rcm_register": rcm_entries,
        "summary": {
            "total_material_taxable_3pct": tot_material_taxable,
            "total_making_taxable_5pct": tot_making_taxable,
            "total_output_gst": tot_output_tax,
            "total_itc_claimed": tot_itc_tax,
            "total_rcm_liability": tot_rcm_tax,
            "net_payable_cash": max(0.0, tot_output_tax - tot_itc_tax) + tot_rcm_tax
        }
    }


@router.get("/tds-tcs-register")
async def get_tds_tcs_register(
    kind: Optional[str] = Query(default=None, description="TDS or TCS; both when omitted"),
    from_date: Optional[date] = Query(default=None, alias="from"),
    to_date: Optional[date] = Query(default=None, alias="to"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Tax deducted on purchases (s.194Q) and collected on sales (s.206C(1H)).

    One row per document, with the party's PAN, so the quarterly Form 26Q
    (TDS) and 27EQ (TCS) can be prepared from it. Totals are by kind and by
    party. Dates default to the current financial year.
    """
    cid = current_user["company_id"]
    if not to_date:
        to_date = date.today()
    if not from_date:
        from_date = date(to_date.year if to_date.month >= 4 else to_date.year - 1, 4, 1)

    kind_filter = (kind or "").strip().upper() or None
    if kind_filter and kind_filter not in {"TDS", "TCS"}:
        raise HTTPException(status_code=422, detail="kind must be TDS or TCS")

    query = """
        SELECT
            r.id, r.kind, r.section, r.document_type, r.document_id, r.document_no, r.document_date,
            r.base_amount, r.rate, r.amount, r.pan, r.is_reversal,
            p.id AS party_id, p.name AS party_name, p.gstin AS party_gstin,
            p.tds_pan_verified, p.lower_deduction_pct,
            fy.year_label
        FROM caratloop.tds_tcs_register r
        JOIN caratloop.parties p ON p.id = r.party_id
        LEFT JOIN caratloop.fiscal_years fy ON fy.id = r.fiscal_year_id
        WHERE r.company_id = :cid
          AND r.document_date BETWEEN :from_date AND :to_date
    """
    params: Dict[str, Any] = {"cid": cid, "from_date": from_date, "to_date": to_date}
    if kind_filter:
        query += " AND r.kind = :kind"
        params["kind"] = kind_filter
    query += " ORDER BY r.document_date DESC, r.id DESC"

    res = await db.execute(text(query), params)
    rows = [dict(r) for r in res.mappings().all()]

    by_kind: Dict[str, Dict[str, Any]] = {}
    by_party: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        r["document_id"] = str(r["document_id"])
        r["party_id"] = str(r["party_id"])
        # A reversal row (an amended bill's original) is listed and netted
        # off; it is not a second document.
        sgn = -1 if r.get("is_reversal") else 1
        k = by_kind.setdefault(r["kind"], {"documents": 0, "base_amount": Decimal("0"), "amount": Decimal("0")})
        k["documents"] += sgn
        k["base_amount"] += sgn * to_decimal(r["base_amount"])
        k["amount"] += sgn * to_decimal(r["amount"])
        pk = f"{r['kind']}:{r['party_id']}"
        pp = by_party.setdefault(pk, {
            "kind": r["kind"], "party_id": r["party_id"], "party_name": r["party_name"],
            "pan": r["pan"], "documents": 0, "base_amount": Decimal("0"), "amount": Decimal("0"),
        })
        pp["documents"] += sgn
        pp["base_amount"] += sgn * to_decimal(r["base_amount"])
        pp["amount"] += sgn * to_decimal(r["amount"])

    return {
        "from_date": str(from_date),
        "to_date": str(to_date),
        "kind": kind_filter or "ALL",
        "entries": rows,
        "summary": {
            "by_kind": by_kind,
            "by_party": sorted(by_party.values(), key=lambda x: (x["kind"], -x["amount"])),
            "total_amount": sum(((-1 if r.get("is_reversal") else 1) * to_decimal(r["amount"]) for r in rows), Decimal("0")),
            "without_pan": sum(1 for r in rows if not r.get("pan")),
        },
        "settings": {
            "tds_194q_enabled": bool(settings.TDS_194Q_ENABLED),
            "tds_threshold": float(settings.TDS_194Q_THRESHOLD_INR),
            "tds_rate": float(settings.TDS_194Q_RATE),
            "tcs_206c1h_enabled": bool(settings.TCS_206C1H_ENABLED),
            "tcs_threshold": float(settings.TCS_206C1H_THRESHOLD_INR),
            "tcs_rate": float(settings.TCS_206C1H_RATE),
        },
    }


def normalise_party_type_for_aging(value: str | None) -> str:
    """Which side of the ledger the caller is asking about.

    The interface says "Supplier"; the schema stores "Vendor". Anything that is
    not recognisably a supplier is treated as the receivables side, which is
    the historical default.
    """
    v = (value or "").strip().lower()
    return "Vendor" if v in {"vendor", "supplier", "creditor", "payable", "payables"} else "Customer"


@router.get("/outstanding-aging")
async def get_outstanding_aging(
    as_of_date: Optional[date] = None,
    party_type: str = "Customer",
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    [Section 44AA] Age-Wise Outstanding Ledger (0-30, 31-60, 61-90, 90+ days).
    """
    cid = current_user["company_id"]
    if not as_of_date:
        as_of_date = date.today()
    elif isinstance(as_of_date, str):
        as_of_date = date.fromisoformat(as_of_date)

    # party_type was accepted, echoed back in the response, and then ignored:
    # the query always aggregated sales invoices. The Payables tab of the
    # outstanding report therefore showed receivables -- money owed TO the
    # business -- under the heading of money it owes. Both sides are now real.
    #
    # Two whole statements rather than one assembled from fragments: the join
    # and the date column both change, and building SQL by interpolation is
    # exactly what tests/test_sql_parses.py forbids -- rightly, because the
    # next person to add a "small" fragment may take it from the request.
    RECEIVABLES_AGING = """
        SELECT
            p.id AS party_id, p.name AS party_name, p.trade_name, p.gstin,
            p.phone, p.credit_limit, p.credit_days,
            COALESCE(SUM(CASE WHEN CAST(:as_of_date AS DATE) - si.invoice_date <= 30           THEN si.grand_total - si.amount_paid ELSE 0 END), 0) AS bucket_0_30,
            COALESCE(SUM(CASE WHEN CAST(:as_of_date AS DATE) - si.invoice_date BETWEEN 31 AND 60 THEN si.grand_total - si.amount_paid ELSE 0 END), 0) AS bucket_31_60,
            COALESCE(SUM(CASE WHEN CAST(:as_of_date AS DATE) - si.invoice_date BETWEEN 61 AND 90 THEN si.grand_total - si.amount_paid ELSE 0 END), 0) AS bucket_61_90,
            COALESCE(SUM(CASE WHEN CAST(:as_of_date AS DATE) - si.invoice_date > 90            THEN si.grand_total - si.amount_paid ELSE 0 END), 0) AS bucket_over_90,
            COALESCE(SUM(si.grand_total - si.amount_paid), 0) AS total_outstanding
        FROM caratloop.parties p
        JOIN caratloop.sales_invoices si
          ON si.customer_id = p.id AND si.company_id = p.company_id
        WHERE p.company_id = :cid
          AND si.payment_status != 'Paid'
          AND si.status != 'Cancelled'
          AND si.invoice_date <= CAST(:as_of_date AS DATE)
        GROUP BY p.id, p.name, p.trade_name, p.gstin, p.phone, p.credit_limit, p.credit_days
        ORDER BY total_outstanding DESC
    """

    PAYABLES_AGING = """
        SELECT
            p.id AS party_id, p.name AS party_name, p.trade_name, p.gstin,
            p.phone, p.credit_limit, p.credit_days,
            COALESCE(SUM(CASE WHEN CAST(:as_of_date AS DATE) - pi.bill_date <= 30            THEN pi.grand_total - pi.amount_paid ELSE 0 END), 0) AS bucket_0_30,
            COALESCE(SUM(CASE WHEN CAST(:as_of_date AS DATE) - pi.bill_date BETWEEN 31 AND 60 THEN pi.grand_total - pi.amount_paid ELSE 0 END), 0) AS bucket_31_60,
            COALESCE(SUM(CASE WHEN CAST(:as_of_date AS DATE) - pi.bill_date BETWEEN 61 AND 90 THEN pi.grand_total - pi.amount_paid ELSE 0 END), 0) AS bucket_61_90,
            COALESCE(SUM(CASE WHEN CAST(:as_of_date AS DATE) - pi.bill_date > 90             THEN pi.grand_total - pi.amount_paid ELSE 0 END), 0) AS bucket_over_90,
            COALESCE(SUM(pi.grand_total - pi.amount_paid), 0) AS total_outstanding
        FROM caratloop.parties p
        JOIN caratloop.purchase_invoices pi
          ON pi.vendor_id = p.id AND pi.company_id = p.company_id
        WHERE p.company_id = :cid
          AND pi.payment_status != 'Paid'
          AND pi.status NOT IN ('Cancelled', 'Amended')
          AND pi.bill_date <= CAST(:as_of_date AS DATE)
        GROUP BY p.id, p.name, p.trade_name, p.gstin, p.phone, p.credit_limit, p.credit_days
        ORDER BY total_outstanding DESC
    """

    is_payables = normalise_party_type_for_aging(party_type) == "Vendor"

    # Both sides are read so each row can be reconciled with the party's
    # ledger: a party's ledger balance is its receivable bills less its
    # payable bills less whatever sits on account (advances received,
    # credit notes and receipts not applied to a bill). That remainder is
    # reported per party as `unadjusted`, so the bill-wise report and the
    # ledger are always explained against each other instead of silently
    # disagreeing.
    recv_res = await db.execute(text(RECEIVABLES_AGING), {"cid": cid, "as_of_date": as_of_date})
    receivable_rows = {str(r["party_id"]): dict(r) for r in recv_res.mappings().all()}
    pay_res = await db.execute(text(PAYABLES_AGING), {"cid": cid, "as_of_date": as_of_date})
    payable_rows = {str(r["party_id"]): dict(r) for r in pay_res.mappings().all()}
    ledger = {b["party_id"]: b for b in await party_balances(db, cid, as_of_date)}

    rows = []
    for pid, r in (payable_rows if is_payables else receivable_rows).items():
        d = dict(r)
        d["party_id"] = pid
        for k in ("bucket_0_30", "bucket_31_60", "bucket_61_90", "bucket_over_90", "total_outstanding"):
            d[k] = to_decimal(d[k])
        bills_receivable = to_decimal(receivable_rows.get(pid, {}).get("total_outstanding"))
        bills_payable = to_decimal(payable_rows.get(pid, {}).get("total_outstanding"))
        bal = ledger.get(pid)
        ledger_balance = bal["balance_signed"] if bal else Decimal("0")
        d["bills_receivable"] = bills_receivable
        d["bills_payable"] = bills_payable
        d["ledger_balance"] = ledger_balance
        d["ledger_side"] = side_of(ledger_balance)
        # Debit-positive: positive means the ledger carries more than the
        # open bills explain (a debit on account); negative means credit
        # on account (an advance, an unapplied credit note or receipt).
        d["unadjusted"] = ledger_balance - (bills_receivable - bills_payable)
        rows.append(d)
    rows.sort(key=lambda r: -r["total_outstanding"])

    def total(key):
        return sum((to_decimal(r[key]) for r in rows), Decimal("0"))

    return {
        "as_of_date": str(as_of_date),
        "party_type": "Vendor" if is_payables else "Customer",
        "basis": "purchase_invoices" if is_payables else "sales_invoices",
        "aging_report": rows,
        "totals": {
            "bucket_0_30": total("bucket_0_30"),
            "bucket_31_60": total("bucket_31_60"),
            "bucket_61_90": total("bucket_61_90"),
            "bucket_over_90": total("bucket_over_90"),
            "total_outstanding": total("total_outstanding"),
            "unadjusted": total("unadjusted"),
        },
        "reconciliation": {
            "bills_receivable": sum((to_decimal(r["total_outstanding"]) for r in receivable_rows.values()), Decimal("0")),
            "bills_payable": sum((to_decimal(r["total_outstanding"]) for r in payable_rows.values()), Decimal("0")),
            "ledger_total": sum((b["balance_signed"] for b in ledger.values()), Decimal("0")),
        },
    }


@router.get("/profit-loss")
async def get_profit_and_loss(
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """[Section 44AA] Profit & Loss Statement."""
    if not to_date:
        to_date = date.today()
    elif isinstance(to_date, str):
        to_date = date.fromisoformat(to_date)

    if not from_date:
        from_date = date(to_date.year if to_date.month >= 4 else to_date.year - 1, 4, 1)
    elif isinstance(from_date, str):
        from_date = date.fromisoformat(from_date)

    f = await profit_and_loss_figures(db, current_user["company_id"], from_date, to_date)
    return {
        "from_date": str(from_date),
        "to_date": str(to_date),
        "revenue": f["revenue"],
        "expenses": f["expenses"],
        "total_revenue": f["total_revenue"],
        "total_expenses": f["total_expenses"],
        "net_profit": f["net_profit"],
    }


# Filtered in a subquery. The previous shape LEFT JOINed journal_entries
# with the status and date test in the ON clause: a line whose entry failed
# the test kept its row (with a NULL entry) and was still summed, so the
# P&L for any range was the P&L since inception, Draft and all. 'Closing'
# journals are the year-end transfer to Retained Earnings and are not
# income or expense of the period.
PROFIT_LOSS_SQL = """
    SELECT
        ag.nature, ag.name AS group_name,
        a.id AS account_id, a.code, a.name AS account_name,
        COALESCE(t.dr, 0) AS total_dr,
        COALESCE(t.cr, 0) AS total_cr
    FROM caratloop.accounts a
    JOIN caratloop.account_groups ag ON ag.id = a.group_id
    LEFT JOIN (
        SELECT jel.account_id, SUM(jel.dr_amount) AS dr, SUM(jel.cr_amount) AS cr
        FROM caratloop.journal_entry_lines jel
        JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
        WHERE je.company_id = :cid AND je.status = 'Posted'
          AND je.entry_date BETWEEN :from_date AND :to_date
          AND je.entry_type NOT IN ('Opening', 'Closing')
        GROUP BY jel.account_id
    ) t ON t.account_id = a.id
    WHERE a.company_id = :cid AND ag.nature IN ('Income', 'Expenses')
    ORDER BY ag.nature, a.code
"""


async def profit_and_loss_figures(db: AsyncSession, company_id, from_date: date, to_date: date) -> dict:
    result = await db.execute(
        text(PROFIT_LOSS_SQL),
        {"from_date": from_date, "to_date": to_date, "cid": company_id},
    )
    rows = []
    for r in result.mappings().all():
        d = dict(r)
        d["account_id"] = str(d["account_id"])
        d["total_dr"] = to_decimal(d["total_dr"])
        d["total_cr"] = to_decimal(d["total_cr"])
        d["balance"] = (d["total_cr"] - d["total_dr"]) if d["nature"] == "Income" else (d["total_dr"] - d["total_cr"])
        rows.append(d)
    revenue = [r for r in rows if r["nature"] == "Income"]
    expenses = [r for r in rows if r["nature"] == "Expenses"]
    total_revenue = sum((r["balance"] for r in revenue), Decimal("0"))
    total_expenses = sum((r["balance"] for r in expenses), Decimal("0"))
    return {
        "revenue": revenue,
        "expenses": expenses,
        "total_revenue": total_revenue,
        "total_expenses": total_expenses,
        "net_profit": total_revenue - total_expenses,
    }


@router.get("/stock-register")
async def get_stock_register(
    as_of_date: Optional[date] = None,
    category: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    [CGST Rule 56(2)] Quantitative Commodity Stock Register.
    Every registered person shall maintain a true and correct account of goods produced or manufactured,
    goods purchased and sold, and the stock of goods.
    """
    if not as_of_date:
        as_of_date = date.today()
    elif isinstance(as_of_date, str):
        as_of_date = date.fromisoformat(as_of_date)

    query = """
        SELECT 
            m.id,
            m.code AS material_code,
            m.name AS material_name,
            m.category,
            COALESCE(m.hsn_code, '71131910') AS hsn_code,
            COALESCE(u.code, 'gm') AS uom,
            COALESCE(m.gst_tax_rate, 3.0) AS gst_rate,
            COALESCE(SUM(CASE WHEN sle.direction = 'I' THEN sle.quantity ELSE 0 END), 0) AS total_inward_qty,
            COALESCE(SUM(CASE WHEN sle.direction = 'O' THEN sle.quantity ELSE 0 END), 0) AS total_outward_qty,
            COALESCE(SUM(CASE WHEN sle.direction = 'I' THEN sle.quantity ELSE -sle.quantity END), 0) AS closing_stock_qty,
            -- Weighted average cost of goods actually received. The rate was
            -- previously invented by substring-matching the material name
            -- (gold -> 7200, silver -> 85, anything else -> 5000) and fed
            -- straight into a statutory stock register.
            COALESCE(
                SUM(CASE WHEN sle.direction = 'I' THEN sle.amount ELSE 0 END)
                / NULLIF(SUM(CASE WHEN sle.direction = 'I' THEN sle.quantity ELSE 0 END), 0),
                0
            ) AS weighted_avg_rate
        FROM caratloop.materials m
        LEFT JOIN caratloop.units_of_measure u ON u.id = m.uom_id
        LEFT JOIN caratloop.stock_ledger_entries sle ON sle.material_id = m.id AND sle.entry_date <= CAST(:as_of_date AS DATE)
        WHERE m.company_id = :cid AND m.is_active = TRUE
    """
    params = {"cid": current_user["company_id"], "as_of_date": as_of_date}
    if category:
        query += " AND m.category = :category"
        params["category"] = category

    query += " GROUP BY m.id, m.code, m.name, m.category, m.hsn_code, u.code, m.gst_tax_rate ORDER BY m.category, m.name"

    result = await db.execute(text(query), params)
    rows = result.mappings().all()

    stock_items = []
    total_val = Decimal("0")
    unvalued = []
    for r in rows:
        item_dict = dict(r)
        qty = to_decimal(item_dict["closing_stock_qty"])
        rate = to_decimal(item_dict.get("weighted_avg_rate"))

        # No inward movement means no cost basis. Report it as unvalued rather
        # than substituting a number nobody can trace to a document.
        if rate <= 0 and qty != 0:
            unvalued.append(item_dict["material_name"])

        item_val = round_money(qty * rate)
        item_dict["closing_stock"] = qty
        item_dict["valuation_rate"] = round_money(rate)
        item_dict["valuation_amount"] = item_val
        item_dict["valuation_basis"] = "weighted_average_cost" if rate > 0 else "unvalued"
        total_val += item_val
        stock_items.append(item_dict)

    return {
        "as_of_date": str(as_of_date),
        "rule": "CGST Rule 56(2) Quantitative Stock Register",
        "valuation_basis": "weighted average cost of inward movements",
        "unvalued_materials": unvalued,
        "items": stock_items,
        "total_valuation": total_val,
        "total_items": len(stock_items)
    }


# ─── Reconciliation panel ────────────────────────────────────────────────────
#
# The checks an auditor runs by hand against a set of books, computed from
# the same tables the reports read, so the owner can see on one screen
# whether the ledgers agree with each other and with the documents. Each
# check is an expected figure, an actual figure, the difference and a
# status: ok, warn (a sub-paisa difference the posting guard tolerates but
# that should still be traced), fail (a real discrepancy) or info (a figure
# with no pass/fail meaning of its own).

GST_OUTPUT_COMPONENTS = {
    "cgst": ("GST-001", "GST-003"),
    "sgst": ("GST-002", "GST-004"),
    "igst": ("GST-005", "GST-006"),
}


def _count_check(name: str, label: str, offenders: list, *, detail: str, info: bool = False, **extra) -> dict:
    row = {
        "name": name, "label": label,
        "expected": Decimal("0"), "actual": Decimal(len(offenders)), "difference": Decimal(len(offenders)),
        "status": INFO if info else (OK if not offenders else FAIL),
        "detail": detail,
        "items": offenders[:25],
        "count": len(offenders),
    }
    row.update(extra)
    return row


def _stringify(row: dict, *keys: str) -> dict:
    d = dict(row)
    for k in keys:
        if d.get(k) is not None:
            d[k] = str(d[k])
    return d


@router.get("/reconciliation")
async def get_reconciliation(
    as_of_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Live reconciliation of the books as at a date.

    Trial balance, balance sheet against the P&L, GST registers against the
    postings that should have produced them, stock register against the
    stock accounts, cash and bank vouchers, documents against their
    journal entries, bill-wise outstanding against the party ledgers, and
    the year-end Opening journals. See the module comment above for the
    status words.
    """
    from app.api.v1.accounting import get_trial_balance

    cid = current_user["company_id"]
    as_of = as_of_date or date.today()
    if isinstance(as_of, str):
        as_of = date.fromisoformat(as_of)
    p = {"cid": cid, "as_of": as_of}
    checks: list[dict] = []

    # 1. Trial balance ------------------------------------------------------
    tb = await get_trial_balance(as_of_date=as_of, db=db, current_user=current_user)
    t = tb["totals"]
    checks.append(check(
        "trial_balance_postings", "Trial balance: total debits = total credits of Posted lines",
        t["total_credit"], t["total_debit"],
        detail="Every Posted journal line to the date, 'Opening' journals excluded (they restate carried balances).",
    ))
    checks.append(check(
        "trial_balance_closing", "Trial balance: closing debit balances = closing credit balances",
        t["closing_credit"], t["closing_debit"],
        detail="Opening balances (on their own side) plus postings, account by account.",
    ))

    # 2. Every voucher balances and its header agrees with its lines ----------
    res = await db.execute(
        text("""
            SELECT je.id, je.entry_no, je.entry_date, je.entry_type, je.total_debit, je.total_credit,
                   SUM(jel.dr_amount) AS line_dr, SUM(jel.cr_amount) AS line_cr, COUNT(*) AS line_count
            FROM caratloop.journal_entries je
            JOIN caratloop.journal_entry_lines jel ON jel.journal_entry_id = je.id
            WHERE je.company_id = :cid AND je.status = 'Posted' AND je.entry_date <= :as_of
            GROUP BY je.id
            HAVING SUM(jel.dr_amount) <> SUM(jel.cr_amount)
                OR je.total_debit <> SUM(jel.dr_amount)
                OR je.total_credit <> SUM(jel.cr_amount)
                OR COUNT(*) < 2
            ORDER BY je.entry_date, je.id
        """),
        p,
    )
    bad = []
    worst = Decimal("0")
    for r in res.mappings().all():
        d = _stringify(r, "entry_date")
        d["line_difference"] = to_decimal(d["line_dr"]) - to_decimal(d["line_cr"])
        worst = max(worst, abs(d["line_difference"]),
                    abs(to_decimal(d["total_debit"]) - to_decimal(d["line_dr"])),
                    abs(to_decimal(d["total_credit"]) - to_decimal(d["line_cr"])))
        bad.append(d)
    row = _count_check(
        "vouchers_balanced", "Every Posted voucher balances and its header equals its lines", bad,
        detail="Vouchers whose debit lines differ from their credit lines, whose header totals differ from the lines, or with a single line.",
    )
    if bad and worst <= TOLERANCE:
        row["status"] = WARN
    checks.append(row)

    # 3. Balance sheet --------------------------------------------------------
    bs = await balance_sheet_figures(db, cid, as_of)
    checks.append(check(
        "balance_sheet", "Balance sheet: assets = liabilities + equity + unclosed P&L",
        bs["total_liabilities_and_equity"], bs["total_assets"],
        detail=f"Assets {bs['total_assets']}; liabilities {bs['total_liabilities']}; equity incl. unclosed P&L {bs['total_equity']}.",
    ))

    # 4. Balance-sheet P&L figure = P&L report for the unclosed span ----------
    years = await load_fiscal_years(db, cid)
    open_years = sorted(
        (y for y in years if not y.get("is_closed") and _as_date(y["start_date"]) <= as_of),
        key=lambda y: y["start_date"],
    )
    pl_from = _as_date(open_years[0]["start_date"]) if open_years else date(1900, 1, 1)
    pl = await profit_and_loss_figures(db, cid, pl_from, as_of)
    checks.append(check(
        "pl_vs_balance_sheet", "P&L report net profit = balance-sheet unclosed P&L",
        bs["net_profit"], pl["net_profit"],
        detail=(
            f"P&L report from {pl_from} (first unclosed fiscal year) to {as_of}; the balance sheet carries "
            "every P&L posting not yet closed into Retained Earnings."
        ),
        pl_from=str(pl_from),
    ))

    # 5. GST output register vs output-tax postings ---------------------------
    reg = (await db.execute(
        text("""
            SELECT
                COALESCE(SUM(CASE WHEN is_credit_note THEN -cgst_amount ELSE cgst_amount END), 0) AS cgst,
                COALESCE(SUM(CASE WHEN is_credit_note THEN -sgst_amount ELSE sgst_amount END), 0) AS sgst,
                COALESCE(SUM(CASE WHEN is_credit_note THEN -igst_amount ELSE igst_amount END), 0) AS igst,
                COALESCE(SUM(CASE WHEN is_credit_note THEN -total_tax ELSE total_tax END), 0) AS total
            FROM caratloop.gst_output_tax_register
            WHERE company_id = :cid AND invoice_date <= :as_of
        """), p)).mappings().first()
    post = await db.execute(
        text("""
            SELECT a.code, COALESCE(SUM(jel.cr_amount - jel.dr_amount), 0) AS net_cr
            FROM caratloop.journal_entry_lines jel
            JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
            JOIN caratloop.accounts a ON a.id = jel.account_id
            WHERE je.company_id = :cid AND je.status = 'Posted' AND je.entry_date <= :as_of
              AND je.entry_type IN ('Sales', 'Credit_Note', 'Reversal')
              AND a.account_type = 'GST_Output'
            GROUP BY a.code
        """), p)
    posted_out = {r["code"]: to_decimal(r["net_cr"]) for r in post.mappings().all()}
    components = {}
    for comp, codes in GST_OUTPUT_COMPONENTS.items():
        components[comp] = {
            "register": to_decimal(reg[comp]) if reg else Decimal("0"),
            "posted": sum((posted_out.get(c, Decimal("0")) for c in codes), Decimal("0")),
            "accounts": list(codes),
        }
    posted_total = sum((v["posted"] for v in components.values()), Decimal("0"))
    checks.append(check(
        "gst_output_register", "GST output tax register = output tax posted by sales and credit-note vouchers",
        reg["total"] if reg else Decimal("0"), posted_total,
        detail=(
            "Register rows signed (credit notes negative) against the GST-001..006 legs of Sales, Credit_Note "
            "and Reversal vouchers. Settlement vouchers are on neither side."
        ),
        components=components,
    ))
    # The account balances themselves, for the record (they move when GST is paid).
    bal_res = await db.execute(
        text("""
            SELECT a.account_type, COALESCE(SUM(jel.cr_amount - jel.dr_amount), 0) AS net_cr
            FROM caratloop.journal_entry_lines jel
            JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
            JOIN caratloop.accounts a ON a.id = jel.account_id
            WHERE je.company_id = :cid AND je.status = 'Posted' AND je.entry_type <> 'Opening'
              AND je.entry_date <= :as_of
              AND a.account_type IN ('GST_Output', 'GST_Input', 'GST_RCM')
            GROUP BY a.account_type
        """), p)
    gst_balances = {r["account_type"]: to_decimal(r["net_cr"]) for r in bal_res.mappings().all()}

    # 6. ITC register vs ITC-001..003 postings --------------------------------
    itc_reg = (await db.execute(
        text("""
            SELECT COALESCE(SUM(CASE WHEN is_reversal THEN -total_itc ELSE total_itc END), 0) AS itc
            FROM caratloop.itc_register
            WHERE company_id = :cid AND is_eligible = TRUE AND invoice_date <= :as_of
        """), p)).scalar()
    itc_post = (await db.execute(
        text("""
            SELECT COALESCE(SUM(jel.dr_amount - jel.cr_amount), 0)
            FROM caratloop.journal_entry_lines jel
            JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
            JOIN caratloop.accounts a ON a.id = jel.account_id
            WHERE je.company_id = :cid AND je.status = 'Posted' AND je.entry_date <= :as_of
              AND je.entry_type IN ('Purchase', 'Reversal', 'Debit_Note')
              AND a.code IN ('ITC-001', 'ITC-002', 'ITC-003')
        """), p)).scalar()
    checks.append(check(
        "itc_register", "ITC register (eligible, net of reversals) = ITC-001..003 posted by purchase vouchers",
        itc_reg, itc_post,
        detail="Forward-charge input credit. RCM self-credit (ITC-004) is checked against the RCM register below.",
    ))

    # 7. RCM register vs RCM-001/002 and ITC-004 postings ---------------------
    rcm_reg = (await db.execute(
        text("""
            SELECT COALESCE(SUM(CASE WHEN is_reversal THEN -total_rcm ELSE total_rcm END), 0) AS rcm
            FROM caratloop.rcm_liability_register
            WHERE company_id = :cid AND transaction_date <= :as_of
        """), p)).scalar()
    rcm_rows = await db.execute(
        text("""
            SELECT a.account_type, COALESCE(SUM(CASE WHEN a.account_type = 'GST_RCM' THEN jel.cr_amount - jel.dr_amount
                                                     ELSE jel.dr_amount - jel.cr_amount END), 0) AS net
            FROM caratloop.journal_entry_lines jel
            JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
            JOIN caratloop.accounts a ON a.id = jel.account_id
            WHERE je.company_id = :cid AND je.status = 'Posted' AND je.entry_date <= :as_of
              AND je.entry_type IN ('Purchase', 'Reversal', 'Debit_Note')
              AND (a.account_type = 'GST_RCM' OR a.code = 'ITC-004')
            GROUP BY a.account_type
        """), p)
    rcm_posted = {r["account_type"]: to_decimal(r["net"]) for r in rcm_rows.mappings().all()}
    checks.append(check(
        "rcm_register", "RCM liability register = RCM-001/002 posted by purchase vouchers",
        rcm_reg, rcm_posted.get("GST_RCM", Decimal("0")),
        detail="Reverse charge on old-gold purchases from unregistered sellers.",
    ))
    checks.append(check(
        "rcm_self_itc", "RCM self-credit booked (ITC-004) = RCM liability register",
        rcm_reg, rcm_posted.get("GST_Input", Decimal("0")),
        detail="The credit is booked when the bill posts and becomes claimable once the RCM tax is paid in cash.",
    ))

    # 8. Stock register vs stock accounts -------------------------------------
    stock_reg = (await db.execute(
        text("""
            SELECT COALESCE(SUM(CASE WHEN direction = 'I' THEN amount ELSE -amount END), 0)
            FROM caratloop.stock_ledger_entries
            WHERE company_id = :cid AND entry_date <= :as_of
        """), p)).scalar()
    stock_acc = await db.execute(
        text("""
            SELECT a.code, a.name, a.normal_balance, COALESCE(a.opening_balance, 0) AS opening_balance,
                   a.opening_balance_type, COALESCE(t.dr, 0) AS dr, COALESCE(t.cr, 0) AS cr
            FROM caratloop.accounts a
            LEFT JOIN (
                SELECT jel.account_id, SUM(jel.dr_amount) AS dr, SUM(jel.cr_amount) AS cr
                FROM caratloop.journal_entry_lines jel
                JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
                WHERE je.company_id = :cid AND je.status = 'Posted' AND je.entry_type <> 'Opening'
                  AND je.entry_date <= :as_of
                GROUP BY jel.account_id
            ) t ON t.account_id = a.id
            WHERE a.company_id = :cid AND a.account_type = 'Stock_Asset' AND a.is_active = TRUE
            ORDER BY a.code
        """), p)
    stock_accounts = []
    stock_total = Decimal("0")
    for r in stock_acc.mappings().all():
        bal = signed_opening(r) + to_decimal(r["dr"]) - to_decimal(r["cr"])
        stock_total += bal
        if bal != 0:
            stock_accounts.append({"code": r["code"], "name": r["name"], "balance": bal})
    checks.append(check(
        "stock_vs_accounts", "Stock register value = stock asset accounts (STK-*)",
        stock_reg, stock_total,
        detail="Inward less outward amounts in the stock ledger against the Stock_Asset account balances.",
        accounts=stock_accounts,
    ))

    # 9. Cash and bank vouchers ------------------------------------------------
    cb = await db.execute(
        text("""
            SELECT je.id, je.entry_no, je.entry_date, je.entry_type, je.total_debit
            FROM caratloop.journal_entries je
            WHERE je.company_id = :cid AND je.status = 'Posted' AND je.entry_date <= :as_of
              AND je.entry_type IN ('Receipt', 'Payment', 'Contra')
              AND NOT EXISTS (
                  SELECT 1 FROM caratloop.journal_entry_lines jel
                  JOIN caratloop.accounts a ON a.id = jel.account_id
                  WHERE jel.journal_entry_id = je.id AND a.account_type IN ('Cash', 'Bank')
              )
            ORDER BY je.entry_date, je.id
        """), p)
    no_cash_leg = [_stringify(r, "entry_date") for r in cb.mappings().all()]
    cash_bank = await db.execute(
        text("""
            SELECT a.code, a.name, a.account_type, a.normal_balance, COALESCE(a.opening_balance, 0) AS opening_balance,
                   a.opening_balance_type, COALESCE(t.dr, 0) AS dr, COALESCE(t.cr, 0) AS cr
            FROM caratloop.accounts a
            LEFT JOIN (
                SELECT jel.account_id, SUM(jel.dr_amount) AS dr, SUM(jel.cr_amount) AS cr
                FROM caratloop.journal_entry_lines jel
                JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
                WHERE je.company_id = :cid AND je.status = 'Posted' AND je.entry_type <> 'Opening'
                  AND je.entry_date <= :as_of
                GROUP BY jel.account_id
            ) t ON t.account_id = a.id
            WHERE a.company_id = :cid AND a.account_type IN ('Cash', 'Bank') AND a.is_active = TRUE
            ORDER BY a.account_type, a.code
        """), p)
    books = []
    for r in cash_bank.mappings().all():
        bal = signed_opening(r) + to_decimal(r["dr"]) - to_decimal(r["cr"])
        books.append({"code": r["code"], "name": r["name"], "account_type": r["account_type"],
                      "balance": abs(bal), "side": side_of(bal)})
    checks.append(_count_check(
        "cash_bank_vouchers", "Every Receipt / Payment / Contra voucher has a Cash or Bank leg", no_cash_leg,
        detail="A receipt or payment that moves no cash or bank balance is a journal entry in disguise.",
        books=books,
    ))

    # 10. Documents vs journal --------------------------------------------------
    si_missing = await db.execute(
        text("""
            SELECT si.id, si.invoice_no, si.invoice_date, si.grand_total,
                   je.entry_no, je.total_debit AS journal_total,
                   COALESCE(pl.party_dr, 0) AS party_debit
            FROM caratloop.sales_invoices si
            LEFT JOIN caratloop.journal_entries je
              ON je.company_id = si.company_id AND je.reference_type = 'SalesInvoice'
             AND je.reference_id = si.id AND je.entry_type = 'Sales' AND je.status = 'Posted'
            LEFT JOIN (
                SELECT jel.journal_entry_id, SUM(jel.dr_amount - jel.cr_amount) AS party_dr
                FROM caratloop.journal_entry_lines jel WHERE jel.party_id IS NOT NULL
                GROUP BY jel.journal_entry_id
            ) pl ON pl.journal_entry_id = je.id
            WHERE si.company_id = :cid AND si.status NOT IN ('Cancelled', 'Draft') AND si.invoice_date <= :as_of
              AND (je.id IS NULL OR ABS(COALESCE(pl.party_dr, 0) - si.grand_total) > 0.005)
            ORDER BY si.invoice_date, si.invoice_no
        """), p)
    si_bad = [_stringify(r, "id", "invoice_date") for r in si_missing.mappings().all()]
    checks.append(_count_check(
        "sales_invoices_journalled",
        "Every sales invoice has a Posted Sales voucher debiting the customer for its grand total", si_bad,
        detail="Posted, non-cancelled invoices without a Sales voucher, or whose customer debit differs from the invoice.",
    ))
    pi_missing = await db.execute(
        text("""
            SELECT pi.id, pi.bill_no, pi.bill_date, pi.grand_total, COALESCE(pi.tds_amount, 0) AS tds_amount,
                   je.entry_no, COALESCE(pl.party_cr, 0) AS party_credit
            FROM caratloop.purchase_invoices pi
            LEFT JOIN caratloop.journal_entries je
              ON je.company_id = pi.company_id AND je.reference_type = 'PurchaseInvoice'
             AND je.reference_id = pi.id AND je.entry_type = 'Purchase' AND je.status = 'Posted'
            LEFT JOIN (
                SELECT jel.journal_entry_id, SUM(jel.cr_amount - jel.dr_amount) AS party_cr
                FROM caratloop.journal_entry_lines jel WHERE jel.party_id IS NOT NULL
                GROUP BY jel.journal_entry_id
            ) pl ON pl.journal_entry_id = je.id
            WHERE pi.company_id = :cid AND pi.status NOT IN ('Cancelled', 'Draft', 'Amended') AND pi.bill_date <= :as_of
              AND (je.id IS NULL OR ABS(COALESCE(pl.party_cr, 0) - (pi.grand_total - COALESCE(pi.tds_amount, 0))) > 0.005)
            ORDER BY pi.bill_date, pi.bill_no
        """), p)
    pi_bad = [_stringify(r, "id", "bill_date") for r in pi_missing.mappings().all()]
    checks.append(_count_check(
        "purchase_bills_journalled",
        "Every purchase bill has a Posted Purchase voucher crediting the supplier for its total less TDS", pi_bad,
        detail="Posted bills without a Purchase voucher, or whose supplier credit differs from the bill.",
    ))

    paid_bad = await db.execute(
        text("""
            SELECT 'sales' AS kind, invoice_no AS number, invoice_date AS doc_date, grand_total, amount_paid, payment_status
            FROM caratloop.sales_invoices
            WHERE company_id = :cid AND status <> 'Cancelled' AND invoice_date <= :as_of
              AND (amount_paid < 0 OR amount_paid > grand_total + 0.005
                   OR (payment_status = 'Paid' AND amount_paid < grand_total - 0.005)
                   OR (payment_status = 'Unpaid' AND amount_paid > 0.005)
                   OR (payment_status = 'Partial' AND (amount_paid <= 0 OR amount_paid >= grand_total - 0.005)))
            UNION ALL
            SELECT 'purchase', bill_no, bill_date, grand_total, amount_paid, payment_status
            FROM caratloop.purchase_invoices
            WHERE company_id = :cid AND status NOT IN ('Cancelled', 'Amended') AND bill_date <= :as_of
              AND (amount_paid < 0 OR amount_paid > grand_total + 0.005
                   OR (payment_status = 'Paid' AND amount_paid < grand_total - 0.005)
                   OR (payment_status = 'Unpaid' AND amount_paid > 0.005)
                   OR (payment_status = 'Partial' AND (amount_paid <= 0 OR amount_paid >= grand_total - 0.005)))
            ORDER BY 3, 2
        """), p)
    paid_rows = [_stringify(r, "doc_date") for r in paid_bad.mappings().all()]
    checks.append(_count_check(
        "payment_status_consistent", "amount_paid lies within each document and agrees with its payment status", paid_rows,
        detail="0 <= amount_paid <= grand total; Paid / Partial / Unpaid as the amount says.",
    ))

    cn_bad = await db.execute(
        text("""
            SELECT si.id, si.invoice_no, si.grand_total, si.amount_paid, si.payment_status,
                   SUM(je.total_credit) AS credit_notes
            FROM caratloop.sales_invoices si
            JOIN caratloop.journal_entries je
              ON je.company_id = si.company_id AND je.reference_type = 'CreditNote'
             AND je.reference_id = si.id AND je.entry_type = 'Credit_Note' AND je.status = 'Posted'
            WHERE si.company_id = :cid AND si.status <> 'Cancelled' AND je.entry_date <= :as_of
            GROUP BY si.id
            HAVING SUM(je.total_credit) > si.grand_total + 0.005
                OR SUM(je.total_credit) > si.amount_paid + 0.005
            ORDER BY si.invoice_no
        """), p)
    cn_rows = [_stringify(r, "id") for r in cn_bad.mappings().all()]
    checks.append(_count_check(
        "credit_notes_applied", "Credit notes against an invoice are within its value and applied to it", cn_rows,
        detail=(
            "An invoice whose credit notes exceed its value, or exceed what is recorded as settled on it: "
            "the ledger has the credit but the bill still shows it outstanding."
        ),
    ))

    # 11. Bill-wise outstanding vs party ledgers ------------------------------
    aging_r = await get_outstanding_aging(as_of_date=as_of, party_type="Customer", db=db, current_user=current_user)
    recon = aging_r["reconciliation"]
    bills_net = to_decimal(recon["bills_receivable"]) - to_decimal(recon["bills_payable"])
    ledger_total = to_decimal(recon["ledger_total"])
    unadjusted = ledger_total - bills_net
    on_account = await db.execute(
        text("""
            SELECT je.entry_type, COALESCE(SUM(jel.dr_amount - jel.cr_amount), 0) AS net_dr, COUNT(DISTINCT je.id) AS vouchers
            FROM caratloop.journal_entries je
            JOIN caratloop.journal_entry_lines jel ON jel.journal_entry_id = je.id
            JOIN caratloop.parties pa ON pa.account_id = jel.account_id AND pa.company_id = je.company_id
            WHERE je.company_id = :cid AND je.status = 'Posted' AND je.entry_date <= :as_of
              AND je.entry_type IN ('Receipt', 'Payment', 'Journal')
              AND (je.reference_type IS NULL OR je.reference_type NOT IN ('SalesInvoice', 'PurchaseInvoice'))
            GROUP BY je.entry_type
        """), p)
    on_account_rows = [dict(r) for r in on_account.mappings().all()]
    checks.append({
        "name": "outstanding_vs_ledgers",
        "label": "Bill-wise outstanding vs party ledgers: the difference is what sits on account",
        "expected": bills_net,
        "actual": ledger_total,
        "difference": unadjusted,
        "status": INFO,
        "detail": (
            f"Open sales bills {recon['bills_receivable']} less open purchase bills {recon['bills_payable']} = {bills_net}; "
            f"party ledgers total {ledger_total} (debit positive). The difference ({unadjusted}) is money on account: "
            "advances received, receipts and credit notes not applied to a bill. Each party's share is the "
            "'unadjusted' column of the aging report."
        ),
        "on_account_vouchers": on_account_rows,
    })

    # 12. Opening journals -----------------------------------------------------
    opn = await db.execute(
        text("""
            SELECT je.id, je.entry_no, je.entry_date, je.total_debit, fy.year_label, fy.start_date,
                   prev.year_label AS previous_year, prev.is_closed AS previous_closed,
                   (SELECT COUNT(*) FROM caratloop.journal_entries x
                     WHERE x.company_id = je.company_id AND x.entry_type = 'Opening' AND x.status = 'Posted'
                       AND x.fiscal_year_id = je.fiscal_year_id) AS openings_in_year
            FROM caratloop.journal_entries je
            JOIN caratloop.fiscal_years fy ON fy.id = je.fiscal_year_id
            LEFT JOIN caratloop.fiscal_years prev
              ON prev.company_id = fy.company_id AND prev.end_date = fy.start_date - 1
            WHERE je.company_id = :cid AND je.entry_type = 'Opening' AND je.status = 'Posted'
            ORDER BY je.entry_date
        """), {"cid": cid})
    openings = [_stringify(r, "entry_date", "start_date") for r in opn.mappings().all()]
    opening_problems = [
        o for o in openings
        if not o["previous_closed"] or o["openings_in_year"] > 1 or o["entry_date"] != o["start_date"]
    ]
    checks.append(_count_check(
        "opening_journals", "Opening journals: one per year, dated its first day, previous year closed", opening_problems,
        detail=(
            f"{len(openings)} Opening journal(s) on file. Cumulative reports exclude them (the carried balances are "
            "already in the earlier postings); ledgers show the carried balance as their computed opening row."
        ),
        openings=openings,
    ))

    summary = {
        "ok": sum(1 for c in checks if c["status"] == OK),
        "warn": sum(1 for c in checks if c["status"] == WARN),
        "fail": sum(1 for c in checks if c["status"] == FAIL),
        "info": sum(1 for c in checks if c["status"] == INFO),
    }
    summary["all_ok"] = summary["fail"] == 0 and summary["warn"] == 0
    return {
        "as_of_date": str(as_of),
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "summary": summary,
        "checks": checks,
        "gst_account_balances": gst_balances,
    }
