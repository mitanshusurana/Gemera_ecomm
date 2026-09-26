"""GSTR-2B import, reconciliation and summary. Mounted under /gst.

The portal's GSTR-2B JSON is stored row by row in gstr2b_entries, matched
against itc_register by (supplier GSTIN, normalised invoice number, amounts
within a rupee), and the match written back to itc_register.gstr2b_matched --
the column GSTR-3B has always reported on and nothing ever set. The parsing
and matching themselves are pure (app.tax.gstr2b) and tested on fixtures.
"""
from __future__ import annotations

import json
import logging
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db, set_audit_context
from app.core.money import to_decimal
from app.core.roles import CAN_POST, require
from app.core.security import get_current_user
from app.tax.gstr2b import (
    MATCHED,
    MISMATCH,
    MISSING_IN_2B,
    MISSING_IN_BOOKS,
    match_entries,
    normalise_invoice_no,
    parse_gstr2b,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["GSTR-2B Reconciliation [s.16(2)(aa)]"])


def _period_ok(period: str) -> str:
    p = (period or "").strip()
    if len(p) != 7 or p[4] != "-" or not (p[:4] + p[5:]).isdigit():
        raise HTTPException(status_code=422, detail="period must be YYYY-MM")
    return p


@router.post("/gstr2b/import", dependencies=[Depends(require(*CAN_POST))])
async def import_gstr2b(
    request: Request,
    file: UploadFile = File(...),
    period: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Store the portal's GSTR-2B JSON for a return period.

    The period comes from the document's rtnprd; the form field overrides it
    (or supplies it when the wrapper was stripped). Re-importing the same
    period updates rows in place and clears their match so a reconcile run
    starts clean.
    """
    user_id = str(current_user["id"])
    company_id = current_user["company_id"]
    ip = request.client.host if request.client else "0.0.0.0"
    await set_audit_context(db, user_id, current_user.get("session_id", "0"), ip, "GSTR-2B import")

    try:
        raw = await file.read()
        try:
            doc = json.loads(raw.decode("utf-8-sig"))
        except (UnicodeDecodeError, json.JSONDecodeError) as e:
            raise HTTPException(status_code=422, detail="The file is not valid JSON. Upload the GSTR-2B JSON downloaded from the GST portal.") from e
        try:
            doc_period, entries = parse_gstr2b(doc)
        except ValueError as e:
            raise HTTPException(
                status_code=422,
                detail="Not a GSTR-2B document: no data.docdata.b2b[] section found. Upload the portal's GSTR-2B JSON.",
            ) from e
        target = _period_ok(period or doc_period or "")

        inserted = 0
        for e in entries:
            await db.execute(
                text("""
                    INSERT INTO caratloop.gstr2b_entries (
                        company_id, return_period, supplier_gstin, supplier_name, invoice_no, invoice_no_norm,
                        invoice_date, invoice_value, place_of_supply, is_reverse_charge,
                        taxable, igst, cgst, sgst, cess, itc_available, raw, imported_by
                    ) VALUES (
                        :cid, :period, :gstin, :sname, :inum, :inorm,
                        :idt, :val, :pos, :rev,
                        :txval, :igst, :cgst, :sgst, :cess, :itcavl, CAST(:raw AS JSONB), CAST(:uid AS UUID)
                    )
                    ON CONFLICT (company_id, return_period, supplier_gstin, invoice_no_norm) DO UPDATE SET
                        supplier_name = EXCLUDED.supplier_name, invoice_no = EXCLUDED.invoice_no,
                        invoice_date = EXCLUDED.invoice_date, invoice_value = EXCLUDED.invoice_value,
                        place_of_supply = EXCLUDED.place_of_supply, is_reverse_charge = EXCLUDED.is_reverse_charge,
                        taxable = EXCLUDED.taxable, igst = EXCLUDED.igst, cgst = EXCLUDED.cgst, sgst = EXCLUDED.sgst,
                        cess = EXCLUDED.cess, itc_available = EXCLUDED.itc_available, raw = EXCLUDED.raw,
                        imported_at = NOW(), imported_by = EXCLUDED.imported_by,
                        matched_itc_id = NULL, match_status = NULL, match_note = NULL, reconciled_at = NULL
                """),
                {
                    "cid": company_id, "period": target, "gstin": e.supplier_gstin, "sname": e.supplier_name,
                    "inum": e.invoice_no, "inorm": normalise_invoice_no(e.invoice_no), "idt": e.invoice_date,
                    "val": e.invoice_value, "pos": e.place_of_supply, "rev": e.reverse_charge,
                    "txval": e.taxable, "igst": e.igst, "cgst": e.cgst, "sgst": e.sgst, "cess": e.cess,
                    "itcavl": e.itc_available, "raw": json.dumps(e.raw, default=str), "uid": user_id,
                },
            )
            inserted += 1
        await db.commit()
        return {"status": "success", "period": target, "invoices": inserted,
                "suppliers": len({e.supplier_gstin for e in entries})}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("GSTR-2B import failed")
        raise HTTPException(status_code=500, detail="GSTR-2B import failed. Nothing was saved.") from e


async def _load_2b(db: AsyncSession, company_id, period: str) -> list[dict]:
    res = await db.execute(
        text("""
            SELECT g.id, g.supplier_gstin, g.supplier_name, g.invoice_no, g.invoice_no_norm, g.invoice_date,
                   g.invoice_value, g.taxable, g.igst, g.cgst, g.sgst, g.cess, g.itc_available, g.is_reverse_charge,
                   g.matched_itc_id, g.match_status, g.match_note, g.reconciled_at
            FROM caratloop.gstr2b_entries g
            WHERE g.company_id = :cid AND g.return_period = :period
            ORDER BY g.supplier_gstin, g.invoice_date, g.invoice_no
        """),
        {"cid": company_id, "period": period},
    )
    return [dict(r) for r in res.mappings().all()]


# Live ITC rows: not a reversal, and not reversed by a later row (an amended
# bill's original and its reversal are both on file; neither is a claim).
_LIVE_ITC = """
    FROM caratloop.itc_register ir
    LEFT JOIN caratloop.purchase_invoices pi ON pi.id = ir.invoice_id
    LEFT JOIN caratloop.parties p ON p.id = ir.vendor_id
    WHERE ir.company_id = :cid AND NOT ir.is_reversal AND ir.is_eligible
      AND NOT EXISTS (SELECT 1 FROM caratloop.itc_register x WHERE x.reversal_of_id = ir.id)
"""

_ITC_COLUMNS = """
    SELECT ir.id, ir.return_period, ir.invoice_date, ir.vendor_id, p.name AS vendor_name,
           COALESCE(NULLIF(ir.vendor_gstin, ''), p.gstin) AS vendor_gstin,
           COALESCE(pi.vendor_inv_no, ir.vendor_invoice_no) AS invoice_no,
           pi.bill_no, pi.subtotal_value AS taxable,
           ir.igst_credit, ir.cgst_credit, ir.sgst_credit, ir.total_itc,
           ir.gstr2b_matched, ir.gstr2b_match_date
"""


@router.post("/gstr2b/reconcile", dependencies=[Depends(require(*CAN_POST))])
async def reconcile_gstr2b(
    period: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Match the period's GSTR-2B rows against the ITC register and record it.

    Candidates on the books side are the period's own ITC rows plus any
    earlier row still unmatched (a supplier who filed late). A match sets
    itc_register.gstr2b_matched and gstr2b_match_date; the period's rows
    that find nothing are reset, so re-running is idempotent.
    """
    period = _period_ok(period)
    user_id = str(current_user["id"])
    company_id = current_user["company_id"]
    ip = request.client.host if request.client else "0.0.0.0"
    await set_audit_context(db, user_id, current_user.get("session_id", "0"), ip, f"GSTR-2B reconciliation {period}")

    try:
        entries_rows = await _load_2b(db, company_id, period)
        from app.tax.gstr2b import B2BInvoice  # local: keeps the module header short
        entries = [
            B2BInvoice(
                supplier_gstin=r["supplier_gstin"], supplier_name=r["supplier_name"], invoice_no=r["invoice_no"],
                invoice_date=r["invoice_date"], invoice_value=to_decimal(r["invoice_value"]),
                place_of_supply=None, reverse_charge=bool(r["is_reverse_charge"]), itc_available=bool(r["itc_available"]),
                taxable=to_decimal(r["taxable"]), igst=to_decimal(r["igst"]), cgst=to_decimal(r["cgst"]),
                sgst=to_decimal(r["sgst"]), cess=to_decimal(r["cess"]), raw={"id": r["id"]},
            )
            for r in entries_rows
        ]
        itc_res = await db.execute(
            text(_ITC_COLUMNS + _LIVE_ITC + " AND (ir.return_period = :period OR NOT ir.gstr2b_matched) ORDER BY ir.invoice_date, ir.id"),
            {"cid": company_id, "period": period},
        )
        itc_rows = [dict(r) for r in itc_res.mappings().all()]

        result = match_entries(entries, itc_rows)

        matched_ids = [int(itc["id"]) for _, itc in result.matched]
        # Reset the period's rows first, then set the matches: a row matched
        # last month that no longer matches loses its flag.
        await db.execute(
            text(
                "UPDATE caratloop.itc_register SET gstr2b_matched = FALSE, gstr2b_match_date = NULL "
                "WHERE company_id = :cid AND return_period = :period AND NOT is_reversal"
            ),
            {"cid": company_id, "period": period},
        )
        if matched_ids:
            await db.execute(
                text(
                    "UPDATE caratloop.itc_register SET gstr2b_matched = TRUE, gstr2b_match_date = CURRENT_DATE "
                    "WHERE company_id = :cid AND id = ANY(:ids)"
                ),
                {"cid": company_id, "ids": matched_ids},
            )

        async def mark(entry_id, status, itc_id=None, note=None):
            await db.execute(
                text(
                    "UPDATE caratloop.gstr2b_entries SET match_status = :st, matched_itc_id = :itc, "
                    "match_note = :note, reconciled_at = NOW() WHERE id = :id AND company_id = :cid"
                ),
                {"st": status, "itc": itc_id, "note": note, "id": entry_id, "cid": company_id},
            )

        for entry, itc in result.matched:
            await mark(entry.raw["id"], MATCHED, int(itc["id"]))
        for entry, itc, note in result.mismatch:
            await mark(entry.raw["id"], MISMATCH, int(itc["id"]), note)
        for entry in result.missing_in_books:
            await mark(entry.raw["id"], MISSING_IN_BOOKS, None, "No purchase bill with this supplier GSTIN and invoice number")

        await db.commit()
        missing_2b_this_period = [r for r in result.missing_in_2b if str(r["return_period"]).strip() == period]
        return {
            "status": "success",
            "period": period,
            "matched": len(result.matched),
            "mismatch": len(result.mismatch),
            "missing_in_books": len(result.missing_in_books),
            "missing_in_2b": len(missing_2b_this_period),
        }
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("GSTR-2B reconciliation failed")
        raise HTTPException(status_code=500, detail="GSTR-2B reconciliation failed. Nothing was saved.") from e


def _bucket(rows: list[dict], *, taxable_key="taxable", igst_key="igst", cgst_key="cgst", sgst_key="sgst") -> dict:
    def total(key):
        return sum((to_decimal(r.get(key)) for r in rows), Decimal("0"))
    igst, cgst, sgst = total(igst_key), total(cgst_key), total(sgst_key)
    return {
        "count": len(rows),
        "taxable": total(taxable_key),
        "igst": igst, "cgst": cgst, "sgst": sgst,
        "total_tax": igst + cgst + sgst,
        "rows": rows,
    }


@router.get("/gstr2b/summary")
async def gstr2b_summary(
    period: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """The four reconciliation buckets for a period, with amounts.

    Matched, Mismatch and Missing_In_Books come from gstr2b_entries as the
    last reconcile run left them; Missing_In_2B is every live ITC row of the
    period that is not matched. Before a reconcile run the 2B rows have no
    status and are reported under 'unreconciled'.
    """
    period = _period_ok(period)
    company_id = current_user["company_id"]
    entries = await _load_2b(db, company_id, period)

    # Book figures for the paired rows, so Mismatch rows can show both sides.
    itc_ids = [int(r["matched_itc_id"]) for r in entries if r["matched_itc_id"] is not None]
    books: dict[int, dict] = {}
    if itc_ids:
        res = await db.execute(
            text(_ITC_COLUMNS + " FROM caratloop.itc_register ir "
                 "LEFT JOIN caratloop.purchase_invoices pi ON pi.id = ir.invoice_id "
                 "LEFT JOIN caratloop.parties p ON p.id = ir.vendor_id "
                 "WHERE ir.company_id = :cid AND ir.id = ANY(:ids)"),
            {"cid": company_id, "ids": itc_ids},
        )
        books = {int(r["id"]): dict(r) for r in res.mappings().all()}

    def with_books(r: dict) -> dict:
        b = books.get(int(r["matched_itc_id"])) if r.get("matched_itc_id") is not None else None
        out = dict(r)
        out["books"] = (
            {"bill_no": b["bill_no"], "invoice_no": b["invoice_no"], "taxable": b["taxable"],
             "igst": b["igst_credit"], "cgst": b["cgst_credit"], "sgst": b["sgst_credit"], "vendor_name": b["vendor_name"]}
            if b else None
        )
        return out

    missing_res = await db.execute(
        text(_ITC_COLUMNS + _LIVE_ITC + " AND ir.return_period = :period AND NOT ir.gstr2b_matched ORDER BY ir.invoice_date, ir.id"),
        {"cid": company_id, "period": period},
    )
    missing_2b = [dict(r) for r in missing_res.mappings().all()]
    for r in missing_2b:
        r["match_status"] = MISSING_IN_2B

    counts = await db.execute(
        text(
            "SELECT COUNT(*) FILTER (WHERE gstr2b_matched) AS matched, COUNT(*) AS total "
            "FROM caratloop.itc_register WHERE company_id = :cid AND return_period = :period AND NOT is_reversal"
        ),
        {"cid": company_id, "period": period},
    )
    c = counts.mappings().first() or {}
    last = max((r["reconciled_at"] for r in entries if r["reconciled_at"]), default=None)

    return {
        "period": period,
        "imported_invoices": len(entries),
        "last_reconciled_at": last,
        "itc_rows_in_period": int(c.get("total") or 0),
        "itc_rows_matched": int(c.get("matched") or 0),
        "unreconciled": len([r for r in entries if not r["match_status"]]),
        "buckets": {
            MATCHED: _bucket([with_books(r) for r in entries if r["match_status"] == MATCHED]),
            MISMATCH: _bucket([with_books(r) for r in entries if r["match_status"] == MISMATCH]),
            MISSING_IN_BOOKS: _bucket([with_books(r) for r in entries if r["match_status"] == MISSING_IN_BOOKS]),
            MISSING_IN_2B: _bucket(missing_2b, igst_key="igst_credit", cgst_key="cgst_credit", sgst_key="sgst_credit"),
        },
    }
