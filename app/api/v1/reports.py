"""
Caratloop ERP — Reports API
Compliance reports for MCA, GST, and Income Tax
"""
from typing import Optional, List, Dict, Any
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.core.database import get_db
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
    if current_user["role"] not in ("admin", "owner", "auditor"):
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

    result = await db.execute(
        text("""
            SELECT
                ag.nature,
                ag.name AS group_name,
                a.code, a.name AS account_name,
                CASE
                    WHEN a.normal_balance = 'D' THEN
                        COALESCE(a.opening_balance, 0)
                        + COALESCE(SUM(jel.dr_amount), 0)
                        - COALESCE(SUM(jel.cr_amount), 0)
                    ELSE
                        COALESCE(a.opening_balance, 0)
                        + COALESCE(SUM(jel.cr_amount), 0)
                        - COALESCE(SUM(jel.dr_amount), 0)
                END AS balance
            FROM caratloop.accounts a
            JOIN caratloop.account_groups ag ON ag.id = a.group_id
            LEFT JOIN caratloop.journal_entry_lines jel ON jel.account_id = a.id
            LEFT JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
                AND je.status = 'Posted' AND je.entry_date <= :as_of_date
            WHERE a.company_id = :cid AND a.is_active = TRUE
            GROUP BY ag.nature, ag.name, a.id, a.code, a.name,
                     a.normal_balance, a.opening_balance
            ORDER BY ag.nature, ag.name, a.code
        """),
        {"as_of_date": as_of_date, "cid": current_user["company_id"]},
    )
    rows = [dict(r) for r in result.mappings().all()]

    def group_by_nature(nature, rows):
        return [r for r in rows if r["nature"] == nature]

    assets = group_by_nature("Assets", rows)
    liabilities = group_by_nature("Liabilities", rows)
    equity = group_by_nature("Equity", rows)

    # After computing equity accounts, also compute current year P&L
    pl_res = await db.execute(text("""
        SELECT 
            COALESCE(SUM(CASE WHEN ag.nature = 'Income' THEN jel.cr_amount - jel.dr_amount ELSE 0 END), 0) AS total_income,
            COALESCE(SUM(CASE WHEN ag.nature = 'Expenses' THEN jel.dr_amount - jel.cr_amount ELSE 0 END), 0) AS total_expenses
        FROM caratloop.journal_entry_lines jel
        JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
        JOIN caratloop.accounts a ON a.id = jel.account_id
        JOIN caratloop.account_groups ag ON ag.id = a.group_id
        WHERE je.company_id = :cid AND je.status = 'Posted' AND je.entry_date <= :as_of_date
    """), {"cid": current_user["company_id"], "as_of_date": as_of_date})
    pl_row = pl_res.mappings().first()
    net_profit = float(pl_row['total_income'] or 0) - float(pl_row['total_expenses'] or 0)

    # Add to equity section
    equity.append({
        "code": "CUR-YR-PL",
        "account_name": "Current Year Net Profit / (Loss)",
        "group_name": "Capital & Equity",
        "balance": net_profit
    })
    
    total_assets = sum(r["balance"] or 0 for r in assets)
    total_liab_equity = sum(r["balance"] or 0 for r in liabilities + equity)

    return {
        "as_of_date": str(as_of_date),
        "section_44aa": "Balance Sheet",
        "assets": assets,
        "liabilities": liabilities,
        "equity": equity,
        "total_assets": total_assets,
        "total_liabilities": sum(r["balance"] or 0 for r in liabilities),
        "totals": {
            "total_assets": total_assets,
            "total_liabilities_and_equity": total_liab_equity,
            "is_balanced": abs(total_assets - total_liab_equity) < 1.0,
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
    revenue_mtd = float(rev_row["revenue_mtd"] or 0)
    revenue_ytd = float(rev_row["revenue_ytd"] or 0)

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
        text("SELECT COALESCE(SUM(total_tax), 0) AS out_tax FROM caratloop.gst_output_tax_register WHERE company_id = :cid"),
        {"cid": cid},
    )
    itc_res = await db.execute(
        text("SELECT COALESCE(SUM(total_itc), 0) AS itc_tax FROM caratloop.itc_register WHERE company_id = :cid AND is_eligible = TRUE"),
        {"cid": cid},
    )
    rcm_res = await db.execute(
        text("SELECT COALESCE(SUM(total_rcm), 0) AS rcm_tax FROM caratloop.rcm_liability_register WHERE company_id = :cid"),
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
                COALESCE(SUM(CASE WHEN ag.nature = 'Revenue' THEN jel.cr_amount - jel.dr_amount ELSE 0 END), 0) AS revenue,
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
                rcm.total_rcm AS total_tax, rcm.is_paid AS tax_paid, rcm.itc_availed AS itc_claimed
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
    tot_output_tax = sum(float(r.get("total_tax_amount") or 0) for r in output_entries)
    tot_itc_tax = sum(float(r.get("cgst_itc", 0) + r.get("sgst_itc", 0) + r.get("igst_itc", 0)) for r in itc_entries if not r.get("is_ineligible"))
    tot_rcm_tax = sum(float(r.get("total_tax") or 0) for r in rcm_entries)

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

    res = await db.execute(
        text("""
            SELECT
                p.id AS party_id,
                p.name AS party_name,
                p.trade_name,
                p.gstin,
                p.phone,
                p.credit_limit,
                p.credit_days,
                COALESCE(SUM(CASE WHEN CAST(:as_of_date AS DATE) - si.invoice_date <= 30 THEN si.grand_total ELSE 0 END), 0) AS bucket_0_30,
                COALESCE(SUM(CASE WHEN CAST(:as_of_date AS DATE) - si.invoice_date BETWEEN 31 AND 60 THEN si.grand_total ELSE 0 END), 0) AS bucket_31_60,
                COALESCE(SUM(CASE WHEN CAST(:as_of_date AS DATE) - si.invoice_date BETWEEN 61 AND 90 THEN si.grand_total ELSE 0 END), 0) AS bucket_61_90,
                COALESCE(SUM(CASE WHEN CAST(:as_of_date AS DATE) - si.invoice_date > 90 THEN si.grand_total ELSE 0 END), 0) AS bucket_over_90,
                COALESCE(SUM(si.grand_total), 0) AS total_outstanding
            FROM caratloop.parties p
            JOIN caratloop.sales_invoices si ON si.customer_id = p.id
            WHERE p.company_id = :cid
              AND si.payment_status != 'Paid'
              AND si.status != 'Cancelled'
              AND si.invoice_date <= CAST(:as_of_date AS DATE)
            GROUP BY p.id, p.name, p.trade_name, p.gstin, p.phone, p.credit_limit, p.credit_days
            ORDER BY total_outstanding DESC
        """),
        {"cid": cid, "as_of_date": as_of_date},
    )
    receivables = [dict(r) for r in res.mappings().all()]

    return {
        "as_of_date": str(as_of_date),
        "party_type": party_type,
        "aging_report": receivables,
        "totals": {
            "bucket_0_30": sum(float(r["bucket_0_30"]) for r in receivables),
            "bucket_31_60": sum(float(r["bucket_31_60"]) for r in receivables),
            "bucket_61_90": sum(float(r["bucket_61_90"]) for r in receivables),
            "bucket_over_90": sum(float(r["bucket_over_90"]) for r in receivables),
            "total_outstanding": sum(float(r["total_outstanding"]) for r in receivables),
        }
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

    result = await db.execute(
        text("""
            SELECT
                ag.nature, ag.name AS group_name,
                a.code, a.name AS account_name,
                COALESCE(SUM(jel.dr_amount), 0) AS total_dr,
                COALESCE(SUM(jel.cr_amount), 0) AS total_cr
            FROM caratloop.accounts a
            JOIN caratloop.account_groups ag ON ag.id = a.group_id
            LEFT JOIN caratloop.journal_entry_lines jel ON jel.account_id = a.id
            LEFT JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
                AND je.status = 'Posted'
                AND je.entry_date BETWEEN :from_date AND :to_date
            WHERE a.company_id = :cid AND ag.nature IN ('Revenue', 'Expenses')
            GROUP BY ag.nature, ag.name, a.id, a.code, a.name
            ORDER BY ag.nature, a.code
        """),
        {"from_date": from_date, "to_date": to_date, "cid": current_user["company_id"]},
    )
    rows = [dict(r) for r in result.mappings().all()]
    revenue = [r for r in rows if r["nature"] == "Revenue"]
    expenses = [r for r in rows if r["nature"] == "Expenses"]

    total_revenue = sum(r["total_cr"] - r["total_dr"] for r in revenue)
    total_expenses = sum(r["total_dr"] - r["total_cr"] for r in expenses)
    net_profit = total_revenue - total_expenses

    return {
        "from_date": str(from_date),
        "to_date": str(to_date),
        "revenue": revenue,
        "expenses": expenses,
        "total_revenue": total_revenue,
        "total_expenses": total_expenses,
        "net_profit": net_profit
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
            COALESCE(SUM(CASE WHEN sle.direction = 'IN' THEN sle.quantity ELSE 0 END), 0) AS total_inward_qty,
            COALESCE(SUM(CASE WHEN sle.direction = 'OUT' THEN sle.quantity ELSE 0 END), 0) AS total_outward_qty,
            COALESCE(SUM(CASE WHEN sle.direction = 'IN' THEN sle.quantity ELSE -sle.quantity END), 0) AS closing_stock_qty
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
    total_val = 0.0
    for r in rows:
        item_dict = dict(r)
        qty = float(item_dict["closing_stock_qty"] or 0)
        mat_name = item_dict["material_name"].lower()
        rate = 7200.0 if 'gold' in mat_name else (85.0 if 'silver' in mat_name else (25000.0 if 'diamond' in mat_name else 5000.0))
        item_val = qty * rate
        item_dict["closing_stock"] = qty
        item_dict["valuation_rate"] = rate
        item_dict["valuation_amount"] = item_val
        total_val += item_val
        stock_items.append(item_dict)

    return {
        "as_of_date": str(as_of_date),
        "rule": "CGST Rule 56(2) Quantitative Stock Register",
        "items": stock_items,
        "total_valuation": total_val,
        "total_items": len(stock_items)
    }


