"""
Caratloop ERP — Purchase Invoices API
Gemstone, Bullion, & Jewelry Purchase Invoices with Multi-Rate GST, ITC Register, Stock Ledger, & Double-Entry Accounting [CGST-R56-4] [S44AA]
"""
from uuid import UUID
from datetime import date
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel

from app.core.database import get_db, set_audit_context
from app.core.ledger import assert_journal_balanced
from app.core.security import get_current_user

router = APIRouter(tags=["Purchases"])


class PurchaseLineRequest(BaseModel):
    material_id: Optional[str] = None
    description: Optional[str] = "Gemstone / Jewelry Item"
    quantity: float = 1.0
    gross_weight: Optional[float] = 0.0
    net_weight: Optional[float] = 0.0
    purity: Optional[float] = 1.0
    rate: float
    making_charges: Optional[float] = 0.0
    hsn_code: Optional[str] = "71131910"
    gst_rate: Optional[float] = 3.0


class CreatePurchaseInvoiceRequest(BaseModel):
    supplier_id: UUID
    invoice_date: date
    supplier_invoice_no: Optional[str] = "URD-BILL"
    vendor_invoice_date: Optional[date] = None
    place_of_supply: Optional[str] = "08"
    attachment_url: Optional[str] = None
    items: List[PurchaseLineRequest]
    is_rcm: bool = False
    reason: str = "Purchase invoice creation"


@router.post("/invoices")
async def create_purchase_invoice(
    payload: CreatePurchaseInvoiceRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Post Purchase Invoice with Stock Inward Ledger, Party Ledger, and ITC Register entries.
    Handles statutory distinction between Registered Suppliers (ITC Eligible) and Unregistered Dealers (No GST/ITC [CGST Sec 9(4)]).
    """
    user_id = str(current_user["id"])
    company_id = current_user["company_id"]
    ip_address = request.client.host if request.client else "0.0.0.0"
    session_id = current_user.get("session_id", "0")

    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)

    # Ownership guard. Every mutation below (one UPDATE and five DELETEs across
    # the ledger, stock and ITC tables) is addressed by invoice id alone, so the
    # caller's right to touch this invoice must be established up front.
    owner_res = await db.execute(
        text("SELECT company_id FROM caratloop.purchase_invoices WHERE id = :id LIMIT 1"),
        {"id": str(id)}
    )
    owner_company = owner_res.scalar()
    if owner_company is None or str(owner_company) != str(company_id):
        raise HTTPException(status_code=404, detail="Purchase invoice not found")

    try:
        fy_res = await db.execute(
            text("SELECT id, year_label FROM caratloop.fiscal_years WHERE company_id = :cid AND is_active = TRUE LIMIT 1"),
            {"cid": company_id}
        )
        fy = fy_res.mappings().first()
        if not fy:
            fy_res = await db.execute(text("SELECT id, year_label FROM caratloop.fiscal_years LIMIT 1"))
            fy = fy_res.mappings().first()

        supp_res = await db.execute(
            text("SELECT id, name, trade_name, gstin, state_code FROM caratloop.parties WHERE id = :id AND company_id = :cid LIMIT 1"),
            {"id": str(payload.supplier_id), "cid": company_id}
        )
        supplier = supp_res.mappings().first()
        if not supplier:
            raise HTTPException(status_code=400, detail="Supplier not found in master records.")

        supp_gstin = (supplier.get("gstin") or "").strip().upper()
        is_unregistered = not supp_gstin or supp_gstin in ["UNREGISTERED", "N/A", "NONE", ""]

        material_subtotal = sum(
            ((item.net_weight * item.rate) if (item.net_weight and item.net_weight > 0) else (item.quantity * item.rate))
            for item in payload.items
        )
        making_subtotal = sum((item.making_charges or 0.0) for item in payload.items)

        pos = payload.place_of_supply or supplier.get("state_code") or "08"
        is_inter_state = pos != "08"

        total_cgst, total_sgst, total_igst = 0.0, 0.0, 0.0
        rcm_cgst, rcm_sgst = 0.0, 0.0

        if not is_unregistered:
            # Registered Supplier: Forward Charge GST Calculation
            for item in payload.items:
                line_mat_val = (item.net_weight * item.rate) if (item.net_weight and item.net_weight > 0) else (item.quantity * item.rate)
                line_mak_val = item.making_charges or 0.0
                
                # Dynamic rate lookup from Item Master if rate is 0 or None
                gst_rate = float(item.gst_rate) if (item.gst_rate is not None and float(item.gst_rate) > 0) else None
                if gst_rate is None and item.material_id:
                    m_res = await db.execute(
                        text("SELECT gst_tax_rate FROM caratloop.materials WHERE id = :mid OR code = :mcode LIMIT 1"),
                        {"mid": str(item.material_id), "mcode": str(item.material_id)}
                    )
                    gst_rate = m_res.scalar()
                gst_rate = float(gst_rate) if (gst_rate is not None and float(gst_rate) > 0) else 0.0

                mat_gst = line_mat_val * (gst_rate / 100.0)
                mak_gst = line_mak_val * 0.05
                line_tax = mat_gst + mak_gst

                if is_inter_state:
                    total_igst += line_tax
                else:
                    total_cgst += line_tax / 2.0
                    total_sgst += line_tax / 2.0
        else:
            # Unregistered Supplier: No GST charged on forward bill [CGST Sec 9(4)]
            if payload.is_rcm:
                for item in payload.items:
                    line_mat_val = (item.net_weight * item.rate) if (item.net_weight and item.net_weight > 0) else (item.quantity * item.rate)
                    line_mak_val = item.making_charges or 0.0
                    gst_rate = item.gst_rate if item.gst_rate is not None else 3.0
                    line_tax = (line_mat_val * (gst_rate / 100.0)) + (line_mak_val * 0.05)

                    rcm_cgst += line_tax / 2.0
                    rcm_sgst += line_tax / 2.0

        total_gst = total_cgst + total_sgst + total_igst
        # Reverse charge under CGST s.9(4) applies to unregistered suppliers.
        # Honouring is_rcm for a REGISTERED supplier dropped the GST from the
        # payable while the forward-charge ITC debits were still posted, so the
        # entry was out of balance by exactly the tax.
        rcm_applicable = is_unregistered and bool(payload.is_rcm)
        grand_total = material_subtotal + making_subtotal + (0.0 if rcm_applicable else total_gst)

        bill_no_res = await db.execute(
            text("SELECT 'PI/' || :fy || '/' || LPAD(NEXTVAL('caratloop.journal_entry_seq')::TEXT, 5, '0')"),
            {"fy": fy['year_label']}
        )
        bill_no = bill_no_res.scalar()

        pi_res = await db.execute(
            text("""
                INSERT INTO caratloop.purchase_invoices (
                    company_id, fiscal_year_id, bill_no, vendor_inv_no, vendor_invoice_date, bill_date,
                    vendor_id, place_of_supply, attachment_url, is_old_gold_purchase, is_rcm_applicable,
                    subtotal_value, taxable_value, cgst_amount, sgst_amount, igst_amount,
                    rcm_cgst, rcm_sgst, total_gst, grand_total, created_by
                ) VALUES (
                    :cid, :fyid, :bill, :vinv, :vdate, :date, :vid, :pos, :attach, :rcm, :rcm,
                    :sub, :sub, :cgst, :sgst, :igst, :rcmc, :rcms, :tot_gst, :grand, :cb
                ) RETURNING id
            """),
            {
                "cid": company_id,
                "fyid": str(fy["id"]),
                "bill": bill_no,
                "vinv": payload.supplier_invoice_no or f"URD-{payload.invoice_date.strftime('%Y%m%d')}",
                "vdate": payload.vendor_invoice_date or payload.invoice_date,
                "date": payload.invoice_date,
                "vid": str(payload.supplier_id),
                "pos": pos,
                "attach": payload.attachment_url,
                "rcm": payload.is_rcm,
                "sub": material_subtotal + making_subtotal,
                "cgst": total_cgst,
                "sgst": total_sgst,
                "igst": total_igst,
                "rcmc": rcm_cgst,
                "rcms": rcm_sgst,
                "tot_gst": total_gst,
                "grand": grand_total,
                "cb": user_id
            }
        )
        invoice_id = pi_res.scalar()

        loc_res = await db.execute(
            text("SELECT id FROM caratloop.stock_locations WHERE company_id = :cid LIMIT 1"),
            {"cid": company_id}
        )
        loc_id = loc_res.scalar()
        if not loc_id:
            loc_res = await db.execute(text("SELECT id FROM caratloop.stock_locations LIMIT 1"))
            loc_id = loc_res.scalar()

        uom_res = await db.execute(text("SELECT id FROM caratloop.units_of_measure LIMIT 1"))
        uom_id = uom_res.scalar()

        seq_idx = 1
        for item in payload.items:
            mat_id = None
            if item.material_id and str(item.material_id).strip():
                mat_res = await db.execute(
                    text("SELECT id FROM caratloop.materials WHERE (id = :mid OR code = :mcode) AND company_id = :cid LIMIT 1"),
                    {"mid": str(item.material_id), "mcode": str(item.material_id), "cid": company_id}
                )
                mat_id = mat_res.scalar()

            if not mat_id:
                raise HTTPException(status_code=400, detail=f"Stock material '{item.material_id}' not found in master records.")

            line_mat_val = (item.net_weight * item.rate) if (item.net_weight and item.net_weight > 0) else (item.quantity * item.rate)
            line_total = line_mat_val + (item.making_charges or 0.0)

            await db.execute(
                text("""
                    INSERT INTO caratloop.purchase_invoice_lines (
                        invoice_id, sequence_no, material_id, hsn_sac_code, description,
                        quantity, uom_id, gross_weight, net_weight, purity, rate,
                        material_value, is_rcm, gst_rate, line_total
                    ) VALUES (
                        :pid, :seq, :mid, :hsn, :desc,
                        :qty, :uom, :gw, :nw, :purity, :rate,
                        :mval, :rcm, :gst_rate, :total
                    )
                """),
                {
                    "pid": invoice_id,
                    "seq": seq_idx,
                    "mid": mat_id,
                    "hsn": item.hsn_code or "71131910",
                    "desc": item.description or "Stock Material Purchase",
                    "qty": item.quantity,
                    "uom": uom_id,
                    "gw": item.gross_weight or 0.0,
                    "nw": item.net_weight or 0.0,
                    "purity": item.purity or 1.0,
                    "rate": item.rate,
                    "mval": line_mat_val,
                    "rcm": payload.is_rcm,
                    "gst_rate": gst_rate if not is_unregistered else 0.0,
                    "total": line_total
                }
            )
            seq_idx += 1

            if mat_id and loc_id:
                await db.execute(
                    text("""
                        INSERT INTO caratloop.stock_ledger_entries (
                            company_id, fiscal_year_id, entry_date, material_id, location_id,
                            transaction_type, quantity, direction, rate, amount, net_weight,
                            source_document_type, source_document_id, source_document_no, sequence_no, created_by
                        ) VALUES (
                            :cid, :fyid, :edate, :mid, :locid,
                            'Purchase_Receipt', :qty, 'I', :rate, :amt, :nw,
                            'PurchaseInvoice', :docid, :docno, NEXTVAL('caratloop.journal_entry_seq'), :cb
                        )
                    """),
                    {
                        "cid": company_id,
                        "fyid": str(fy["id"]),
                        "edate": payload.invoice_date,
                        "mid": mat_id,
                        "locid": loc_id,
                        "qty": item.quantity or 1.0,
                        "rate": item.rate,
                        "amt": line_mat_val,
                        "nw": item.net_weight or 0.0,
                        "docid": invoice_id,
                        "docno": bill_no,
                        "cb": user_id
                    }
                )

        je_no_res = await db.execute(
            text("SELECT 'PUR/' || :fy || '/' || LPAD(NEXTVAL('caratloop.journal_entry_seq')::TEXT, 5, '0')"),
            {"fy": fy['year_label']}
        )
        je_no = je_no_res.scalar()

        je_res = await db.execute(
            text("""
                INSERT INTO caratloop.journal_entries (
                    company_id, fiscal_year_id, entry_no, entry_date, entry_type,
                    narration, reference_no, reference_type, reference_id,
                    total_debit, total_credit, sequence_no, created_by
                ) VALUES (
                    :cid, :fyid, :eno, :edate, 'Purchase',
                    :narration, :refno, 'PurchaseInvoice', :refid,
                    :amt, :amt, NEXTVAL('caratloop.journal_entry_seq'), :cb
                ) RETURNING id
            """),
            {
                "cid": company_id,
                "fyid": str(fy["id"]),
                "eno": je_no,
                "edate": payload.invoice_date,
                "narration": f"Purchase Voucher {bill_no} from {supplier['name']} ({'Unregistered' if is_unregistered else 'Registered GST'})",
                "refno": bill_no,
                "refid": invoice_id,
                "amt": grand_total,
                "cb": user_id
            }
        )
        je_id = je_res.scalar()

        # Look up supplier account first
        supp_acc_res = await db.execute(text("SELECT account_id FROM caratloop.parties WHERE id = :vendor_id LIMIT 1"), {"vendor_id": str(payload.supplier_id)})
        supp_acc_val = supp_acc_res.scalar()
        if not supp_acc_val:
            fallback_supp = await db.execute(text("SELECT id FROM caratloop.accounts WHERE code = 'CRD-001' AND company_id = :cid LIMIT 1"), {"cid": company_id})
            supp_acc_val = fallback_supp.scalar()
        supp_acc_id = str(supp_acc_val)

        seq = 1
        for item in payload.items:
            line_val = (item.net_weight * item.rate) if (item.net_weight and item.net_weight > 0) else (item.quantity * item.rate)
            line_val += (item.making_charges or 0.0)
            
            stk_acc_id = None
            if item.material_id:
                mat_res = await db.execute(text("SELECT stock_account_id, category FROM caratloop.materials WHERE (id = :mid OR code = :mcode) AND company_id = :cid LIMIT 1"), {"mid": str(item.material_id), "mcode": str(item.material_id), "cid": company_id})
                mat_row = mat_res.mappings().first()
                if mat_row:
                    if mat_row['stock_account_id']:
                        stk_acc_id = str(mat_row['stock_account_id'])
                    else:
                        cat_map = {'Gold': 'STK-001', 'Silver': 'STK-003', 'Diamond': 'STK-004', 'Ruby': 'STK-005', 'Emerald': 'STK-006', 'Sapphire': 'STK-007'}
                        stk_code = cat_map.get(mat_row['category'], 'STK-008')
                        stk_code_res = await db.execute(text("SELECT id FROM caratloop.accounts WHERE code = :code AND company_id = :cid LIMIT 1"), {"code": stk_code, "cid": company_id})
                        stk_acc_id = str(stk_code_res.scalar())
            if not stk_acc_id:
                # fallback
                stk_code_res = await db.execute(text("SELECT id FROM caratloop.accounts WHERE code = 'STK-001' AND company_id = :cid LIMIT 1"), {"cid": company_id})
                stk_acc_id = str(stk_code_res.scalar())

            await db.execute(
                text("INSERT INTO caratloop.journal_entry_lines (journal_entry_id, sequence_no, account_id, dr_amount, cr_amount, narration) VALUES (:jid, :seq, :aid, :dr, 0, 'Inward Stock Material')"),
                {"jid": je_id, "seq": seq, "aid": stk_acc_id, "dr": line_val}
            )
            seq += 1

        if not is_unregistered:
            itc_cgst_res = await db.execute(text("SELECT id FROM caratloop.accounts WHERE code = 'ITC-001' AND company_id = :cid LIMIT 1"), {"cid": company_id})
            itc_cgst_id = str(itc_cgst_res.scalar())
            
            itc_sgst_res = await db.execute(text("SELECT id FROM caratloop.accounts WHERE code = 'ITC-002' AND company_id = :cid LIMIT 1"), {"cid": company_id})
            itc_sgst_id = str(itc_sgst_res.scalar())
            
            itc_igst_res = await db.execute(text("SELECT id FROM caratloop.accounts WHERE code = 'ITC-003' AND company_id = :cid LIMIT 1"), {"cid": company_id})
            itc_igst_id = str(itc_igst_res.scalar())

            if total_cgst > 0:
                await db.execute(
                    text("INSERT INTO caratloop.journal_entry_lines (journal_entry_id, sequence_no, account_id, dr_amount, cr_amount, narration) VALUES (:jid, :seq, :aid, :dr, 0, 'ITC CGST Credit')"),
                    {"jid": je_id, "seq": seq, "aid": itc_cgst_id, "dr": total_cgst}
                )
                seq += 1
            if total_sgst > 0:
                await db.execute(
                    text("INSERT INTO caratloop.journal_entry_lines (journal_entry_id, sequence_no, account_id, dr_amount, cr_amount, narration) VALUES (:jid, :seq, :aid, :dr, 0, 'ITC SGST Credit')"),
                    {"jid": je_id, "seq": seq, "aid": itc_sgst_id, "dr": total_sgst}
                )
                seq += 1
            if total_igst > 0:
                await db.execute(
                    text("INSERT INTO caratloop.journal_entry_lines (journal_entry_id, sequence_no, account_id, dr_amount, cr_amount, narration) VALUES (:jid, :seq, :aid, :dr, 0, 'ITC IGST Credit')"),
                    {"jid": je_id, "seq": seq, "aid": itc_igst_id, "dr": total_igst}
                )
                seq += 1

        await db.execute(
            text("INSERT INTO caratloop.journal_entry_lines (journal_entry_id, sequence_no, account_id, party_id, dr_amount, cr_amount, narration) VALUES (:jid, :seq, :aid, :pid, 0, :cr, 'Supplier Sundry Creditors Payable')"),
            {"jid": je_id, "seq": seq, "aid": supp_acc_id, "pid": str(payload.supplier_id), "cr": grand_total}
        )
        seq += 1

        if rcm_applicable and (rcm_cgst + rcm_sgst) > 0:
            rcm_itc_res = await db.execute(text("SELECT id FROM caratloop.accounts WHERE code = 'ITC-004' AND company_id = :cid LIMIT 1"), {"cid": company_id})
            rcm_itc_id = str(rcm_itc_res.scalar())
            rcm_cgst_acc_res = await db.execute(text("SELECT id FROM caratloop.accounts WHERE code = 'RCM-001' AND company_id = :cid LIMIT 1"), {"cid": company_id})
            rcm_cgst_acc_id = str(rcm_cgst_acc_res.scalar())
            rcm_sgst_acc_res = await db.execute(text("SELECT id FROM caratloop.accounts WHERE code = 'RCM-002' AND company_id = :cid LIMIT 1"), {"cid": company_id})
            rcm_sgst_acc_id = str(rcm_sgst_acc_res.scalar())
            
            await db.execute(text("INSERT INTO caratloop.journal_entry_lines (journal_entry_id, sequence_no, account_id, dr_amount, cr_amount, narration) VALUES (:jid, :seq, :aid, :dr, 0, 'RCM Self ITC')"),
                {"jid": je_id, "seq": seq, "aid": rcm_itc_id, "dr": rcm_cgst + rcm_sgst})
            seq += 1
            await db.execute(text("INSERT INTO caratloop.journal_entry_lines (journal_entry_id, sequence_no, account_id, dr_amount, cr_amount, narration) VALUES (:jid, :seq, :aid, 0, :cr, 'RCM CGST Liability')"),
                {"jid": je_id, "seq": seq, "aid": rcm_cgst_acc_id, "cr": rcm_cgst})
            seq += 1
            await db.execute(text("INSERT INTO caratloop.journal_entry_lines (journal_entry_id, sequence_no, account_id, dr_amount, cr_amount, narration) VALUES (:jid, :seq, :aid, 0, :cr, 'RCM SGST Liability')"),
                {"jid": je_id, "seq": seq, "aid": rcm_sgst_acc_id, "cr": rcm_sgst})
            seq += 1

        # ─── ITC REGISTER POSTING (ONLY REGISTERED SUPPLIERS) ────────────────────
        if not is_unregistered and not payload.is_rcm and total_gst > 0:
            return_period = payload.invoice_date.strftime("%Y-%m")
            await db.execute(
                text("""
                    INSERT INTO caratloop.itc_register (
                        company_id, fiscal_year_id, return_period,
                        invoice_id, vendor_id, vendor_gstin, vendor_invoice_no,
                        invoice_date, itc_type,
                        igst_credit, cgst_credit, sgst_credit, total_itc,
                        is_eligible, created_by
                    ) VALUES (
                        :cid, :fyid, :period,
                        :pid, :vid, :gstin, :inv_no,
                        :inv_date, 'ITC_3B',
                        :igst, :cgst, :sgst, :tot_itc,
                        TRUE, :cb
                    )
                """),
                {
                    "cid": company_id,
                    "fyid": str(fy["id"]),
                    "period": return_period,
                    "pid": invoice_id if isinstance(invoice_id, str) else str(invoice_id),
                    "vid": str(payload.supplier_id),
                    "gstin": supplier.get("gstin") if supplier else None,
                    "inv_no": bill_no,
                    "inv_date": payload.invoice_date,
                    "igst": total_igst,
                    "cgst": total_cgst,
                    "sgst": total_sgst,
                    "tot_itc": total_cgst + total_sgst + total_igst,
                    "cb": user_id
                }
            )

        # Catches the RCM case where ITC debit legs were posted while the
        # supplier credit excluded the tax.
        await assert_journal_balanced(db, je_id, context="purchase invoice journal entry")

        await db.commit()
        return {"status": "success", "bill_no": bill_no, "id": str(invoice_id)}

    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to record purchase invoice: {str(e)}")


@router.put("/invoices/{id}")
async def update_purchase_invoice(
    id: UUID,
    payload: CreatePurchaseInvoiceRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Update an existing purchase invoice with complete stock & ledger reversal & re-sync.
    Handles statutory distinction between Registered Suppliers and Unregistered Dealers.
    """
    user_id = str(current_user["id"])
    company_id = current_user["company_id"]
    ip_address = request.client.host if request.client else "0.0.0.0"
    session_id = current_user.get("session_id", "0")

    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)

    try:
        fy_res = await db.execute(
            text("SELECT id, year_label FROM caratloop.fiscal_years WHERE company_id = :cid AND is_active = TRUE LIMIT 1"),
            {"cid": company_id}
        )
        fy = fy_res.mappings().first()
        if not fy:
            fy_res = await db.execute(text("SELECT id, year_label FROM caratloop.fiscal_years LIMIT 1"))
            fy = fy_res.mappings().first()

        supp_res = await db.execute(
            text("SELECT id, name, trade_name, gstin, state_code FROM caratloop.parties WHERE id = :id LIMIT 1"),
            {"id": str(payload.supplier_id)}
        )
        supplier = supp_res.mappings().first()

        supp_gstin = (supplier.get("gstin") or "").strip().upper() if supplier else ""
        is_unregistered = not supp_gstin or supp_gstin in ["UNREGISTERED", "N/A", "NONE", ""]

        bill_res = await db.execute(
            text("SELECT bill_no FROM caratloop.purchase_invoices WHERE id = :id AND company_id = :cid LIMIT 1"),
            {"id": str(id), "cid": company_id}
        )
        bill_no = bill_res.scalar() or "PI-UPDATED"

        material_subtotal = sum(
            ((item.net_weight * item.rate) if (item.net_weight and item.net_weight > 0) else (item.quantity * item.rate))
            for item in payload.items
        )
        making_subtotal = sum((item.making_charges or 0.0) for item in payload.items)

        pos = payload.place_of_supply or (supplier.get("state_code") if supplier else "08") or "08"
        is_inter_state = pos != "08"

        total_cgst, total_sgst, total_igst = 0.0, 0.0, 0.0
        # Mirrors create_purchase_invoice: RCM totals must exist on this path too,
        # otherwise the RCM journal legs below raise NameError on every edit.
        rcm_cgst, rcm_sgst = 0.0, 0.0

        if not is_unregistered:
            for item in payload.items:
                line_mat_val = (item.net_weight * item.rate) if (item.net_weight and item.net_weight > 0) else (item.quantity * item.rate)
                line_mak_val = item.making_charges or 0.0

                # Dynamic rate lookup from Item Master if rate is 0 or None
                gst_rate = float(item.gst_rate) if (item.gst_rate is not None and float(item.gst_rate) > 0) else None
                if gst_rate is None and item.material_id:
                    m_res = await db.execute(
                        text("SELECT gst_tax_rate FROM caratloop.materials WHERE id = :mid OR code = :mcode LIMIT 1"),
                        {"mid": str(item.material_id), "mcode": str(item.material_id)}
                    )
                    gst_rate = m_res.scalar()
                gst_rate = float(gst_rate) if (gst_rate is not None and float(gst_rate) > 0) else 0.0

                line_tax = (line_mat_val * (gst_rate / 100.0)) + (line_mak_val * 0.05)

                if is_inter_state:
                    total_igst += line_tax
                else:
                    total_cgst += line_tax / 2.0
                    total_sgst += line_tax / 2.0
        else:
            # Unregistered supplier: no forward-charge GST [CGST Sec 9(4)]
            if payload.is_rcm:
                for item in payload.items:
                    line_mat_val = (item.net_weight * item.rate) if (item.net_weight and item.net_weight > 0) else (item.quantity * item.rate)
                    line_mak_val = item.making_charges or 0.0
                    gst_rate = item.gst_rate if item.gst_rate is not None else 3.0
                    line_tax = (line_mat_val * (gst_rate / 100.0)) + (line_mak_val * 0.05)

                    rcm_cgst += line_tax / 2.0
                    rcm_sgst += line_tax / 2.0

        total_gst = total_cgst + total_sgst + total_igst
        # Match create_purchase_invoice exactly, including the s.9(4) condition.
        rcm_applicable = is_unregistered and bool(payload.is_rcm)
        grand_total = material_subtotal + making_subtotal + (0.0 if rcm_applicable else total_gst)

        await db.execute(
            text("""
                UPDATE caratloop.purchase_invoices
                SET vendor_id = :vid,
                    vendor_inv_no = :vinv,
                    vendor_invoice_date = :vdate,
                    bill_date = :bdate,
                    place_of_supply = :pos,
                    attachment_url = :attach,
                    subtotal_value = :sub,
                    cgst_amount = :cgst,
                    sgst_amount = :sgst,
                    igst_amount = :igst,
                    total_gst = :tot_gst,
                    grand_total = :grand
                WHERE id = :id AND company_id = :cid
            """),
            {
                "id": str(id),
                "cid": company_id,
                "vid": str(payload.supplier_id),
                "vinv": payload.supplier_invoice_no,
                "vdate": payload.vendor_invoice_date or payload.invoice_date,
                "bdate": payload.invoice_date,
                "pos": pos,
                "attach": payload.attachment_url,
                "sub": material_subtotal + making_subtotal,
                "cgst": total_cgst,
                "sgst": total_sgst,
                "igst": total_igst,
                "tot_gst": total_gst,
                "grand": grand_total
            }
        )

        # ─── REVERSAL / CLEANUP PREVIOUS ENTRIES FOR THIS INVOICE ───────────────────
        await db.execute(text("DELETE FROM caratloop.purchase_invoice_lines WHERE invoice_id::text = :pid"), {"pid": str(id)})
        await db.execute(text("DELETE FROM caratloop.stock_ledger_entries WHERE source_document_id::text = :pid AND source_document_type = 'PurchaseInvoice'"), {"pid": str(id)})
        await db.execute(text("DELETE FROM caratloop.itc_register WHERE invoice_id::text = :pid"), {"pid": str(id)})

        # Delete previous double-entry journals
        await db.execute(text("DELETE FROM caratloop.journal_entry_lines WHERE journal_entry_id IN (SELECT id FROM caratloop.journal_entries WHERE reference_id::text = :pid AND reference_type = 'PurchaseInvoice')"), {"pid": str(id)})
        await db.execute(text("DELETE FROM caratloop.journal_entries WHERE reference_id::text = :pid AND reference_type = 'PurchaseInvoice'"), {"pid": str(id)})

        # ─── RE-POST UPDATED LINES & STOCK MOVEMENTS ──────────────────────────────
        loc_res = await db.execute(text("SELECT id FROM caratloop.stock_locations WHERE company_id = :cid LIMIT 1"), {"cid": company_id})
        loc_id = loc_res.scalar()
        if not loc_id:
            loc_res = await db.execute(text("SELECT id FROM caratloop.stock_locations LIMIT 1"))
            loc_id = loc_res.scalar()

        uom_res = await db.execute(text("SELECT id FROM caratloop.units_of_measure LIMIT 1"))
        uom_id = uom_res.scalar()

        seq_idx = 1
        for item in payload.items:
            mat_id = item.material_id
            if mat_id and str(mat_id).strip():
                mat_res = await db.execute(
                    text("SELECT id FROM caratloop.materials WHERE (id = :mid OR code = :mcode) AND company_id = :cid LIMIT 1"),
                    {"mid": str(mat_id), "mcode": str(mat_id), "cid": company_id}
                )
                mat_id = mat_res.scalar()

            if not mat_id:
                raise HTTPException(status_code=400, detail=f"Stock material '{item.material_id}' not found in master records.")

            line_mat_val = (item.net_weight * item.rate) if (item.net_weight and item.net_weight > 0) else (item.quantity * item.rate)
            line_total = line_mat_val + (item.making_charges or 0.0)

            await db.execute(
                text("""
                    INSERT INTO caratloop.purchase_invoice_lines (
                        invoice_id, sequence_no, material_id, hsn_sac_code, description,
                        quantity, uom_id, gross_weight, net_weight, purity, rate,
                        material_value, is_rcm, gst_rate, line_total
                    ) VALUES (
                        :pid, :seq, :mid, :hsn, :desc,
                        :qty, :uom, :gw, :nw, :purity, :rate,
                        :mval, :rcm, :gst_rate, :total
                    )
                """),
                {
                    "pid": str(id),
                    "seq": seq_idx,
                    "mid": mat_id,
                    "hsn": item.hsn_code or "71131910",
                    "desc": item.description or "Stock Material Purchase",
                    "qty": item.quantity,
                    "uom": uom_id,
                    "gw": item.gross_weight or 0.0,
                    "nw": item.net_weight or 0.0,
                    "purity": item.purity or 1.0,
                    "rate": item.rate,
                    "mval": line_mat_val,
                    "rcm": payload.is_rcm,
                    "gst_rate": gst_rate if not is_unregistered else 0.0,
                    "total": line_total
                }
            )
            seq_idx += 1

            if mat_id and loc_id:
                await db.execute(
                    text("""
                        INSERT INTO caratloop.stock_ledger_entries (
                            company_id, fiscal_year_id, entry_date, material_id, location_id,
                            transaction_type, quantity, direction, rate, amount, net_weight,
                            source_document_type, source_document_id, source_document_no, sequence_no, created_by
                        ) VALUES (
                            :cid, :fyid, :edate, :mid, :locid,
                            'Purchase_Receipt', :qty, 'I', :rate, :amt, :nw,
                            'PurchaseInvoice', :docid, :docno, NEXTVAL('caratloop.journal_entry_seq'), :cb
                        )
                    """),
                    {
                        "cid": company_id,
                        "fyid": str(fy["id"]),
                        "edate": payload.invoice_date,
                        "mid": mat_id,
                        "locid": loc_id,
                        "qty": item.quantity or 1.0,
                        "rate": item.rate,
                        "amt": line_mat_val,
                        "nw": item.net_weight or 0.0,
                        "docid": str(id),
                        "docno": bill_no,
                        "cb": user_id
                    }
                )

        # ─── RE-POST BALANCED DOUBLE-ENTRY JOURNALS ──────────────────────────────
        je_no_res = await db.execute(
            text("SELECT 'PUR/' || :fy || '/' || LPAD(NEXTVAL('caratloop.journal_entry_seq')::TEXT, 5, '0')"),
            {"fy": fy['year_label']}
        )
        je_no = je_no_res.scalar()

        je_res = await db.execute(
            text("""
                INSERT INTO caratloop.journal_entries (
                    company_id, fiscal_year_id, entry_no, entry_date, entry_type,
                    narration, reference_no, reference_type, reference_id,
                    total_debit, total_credit, sequence_no, created_by
                ) VALUES (
                    :cid, :fyid, :eno, :edate, 'Purchase',
                    :narration, :refno, 'PurchaseInvoice', :refid,
                    :amt, :amt, NEXTVAL('caratloop.journal_entry_seq'), :cb
                ) RETURNING id
            """),
            {
                "cid": company_id,
                "fyid": str(fy["id"]),
                "eno": je_no,
                "edate": payload.invoice_date,
                "narration": f"Updated Purchase Voucher {bill_no} ({'Unregistered' if is_unregistered else 'Registered GST'})",
                "refno": bill_no,
                "refid": str(id),
                "amt": grand_total,
                "cb": user_id
            }
        )
        je_id = je_res.scalar()

        # Look up supplier account first
        supp_acc_res = await db.execute(text("SELECT account_id FROM caratloop.parties WHERE id = :vendor_id LIMIT 1"), {"vendor_id": str(payload.supplier_id)})
        supp_acc_val = supp_acc_res.scalar()
        if not supp_acc_val:
            fallback_supp = await db.execute(text("SELECT id FROM caratloop.accounts WHERE code = 'CRD-001' AND company_id = :cid LIMIT 1"), {"cid": company_id})
            supp_acc_val = fallback_supp.scalar()
        supp_acc_id = str(supp_acc_val)

        seq = 1
        for item in payload.items:
            line_val = (item.net_weight * item.rate) if (item.net_weight and item.net_weight > 0) else (item.quantity * item.rate)
            line_val += (item.making_charges or 0.0)
            
            stk_acc_id = None
            if item.material_id:
                mat_res = await db.execute(text("SELECT stock_account_id, category FROM caratloop.materials WHERE (id = :mid OR code = :mcode) AND company_id = :cid LIMIT 1"), {"mid": str(item.material_id), "mcode": str(item.material_id), "cid": company_id})
                mat_row = mat_res.mappings().first()
                if mat_row:
                    if mat_row['stock_account_id']:
                        stk_acc_id = str(mat_row['stock_account_id'])
                    else:
                        cat_map = {'Gold': 'STK-001', 'Silver': 'STK-003', 'Diamond': 'STK-004', 'Ruby': 'STK-005', 'Emerald': 'STK-006', 'Sapphire': 'STK-007'}
                        stk_code = cat_map.get(mat_row['category'], 'STK-008')
                        stk_code_res = await db.execute(text("SELECT id FROM caratloop.accounts WHERE code = :code AND company_id = :cid LIMIT 1"), {"code": stk_code, "cid": company_id})
                        stk_acc_id = str(stk_code_res.scalar())
            if not stk_acc_id:
                # fallback
                stk_code_res = await db.execute(text("SELECT id FROM caratloop.accounts WHERE code = 'STK-001' AND company_id = :cid LIMIT 1"), {"cid": company_id})
                stk_acc_id = str(stk_code_res.scalar())

            await db.execute(
                text("INSERT INTO caratloop.journal_entry_lines (journal_entry_id, sequence_no, account_id, dr_amount, cr_amount, narration) VALUES (:jid, :seq, :aid, :dr, 0, 'Inward Stock Material')"),
                {"jid": je_id, "seq": seq, "aid": stk_acc_id, "dr": line_val}
            )
            seq += 1

        if not is_unregistered:
            itc_cgst_res = await db.execute(text("SELECT id FROM caratloop.accounts WHERE code = 'ITC-001' AND company_id = :cid LIMIT 1"), {"cid": company_id})
            itc_cgst_id = str(itc_cgst_res.scalar())
            
            itc_sgst_res = await db.execute(text("SELECT id FROM caratloop.accounts WHERE code = 'ITC-002' AND company_id = :cid LIMIT 1"), {"cid": company_id})
            itc_sgst_id = str(itc_sgst_res.scalar())
            
            itc_igst_res = await db.execute(text("SELECT id FROM caratloop.accounts WHERE code = 'ITC-003' AND company_id = :cid LIMIT 1"), {"cid": company_id})
            itc_igst_id = str(itc_igst_res.scalar())

            if total_cgst > 0:
                await db.execute(
                    text("INSERT INTO caratloop.journal_entry_lines (journal_entry_id, sequence_no, account_id, dr_amount, cr_amount, narration) VALUES (:jid, :seq, :aid, :dr, 0, 'ITC CGST Credit')"),
                    {"jid": je_id, "seq": seq, "aid": itc_cgst_id, "dr": total_cgst}
                )
                seq += 1
            if total_sgst > 0:
                await db.execute(
                    text("INSERT INTO caratloop.journal_entry_lines (journal_entry_id, sequence_no, account_id, dr_amount, cr_amount, narration) VALUES (:jid, :seq, :aid, :dr, 0, 'ITC SGST Credit')"),
                    {"jid": je_id, "seq": seq, "aid": itc_sgst_id, "dr": total_sgst}
                )
                seq += 1
            if total_igst > 0:
                await db.execute(
                    text("INSERT INTO caratloop.journal_entry_lines (journal_entry_id, sequence_no, account_id, dr_amount, cr_amount, narration) VALUES (:jid, :seq, :aid, :dr, 0, 'ITC IGST Credit')"),
                    {"jid": je_id, "seq": seq, "aid": itc_igst_id, "dr": total_igst}
                )
                seq += 1

        await db.execute(
            text("INSERT INTO caratloop.journal_entry_lines (journal_entry_id, sequence_no, account_id, party_id, dr_amount, cr_amount, narration) VALUES (:jid, :seq, :aid, :pid, 0, :cr, 'Supplier Sundry Creditors Payable')"),
            {"jid": je_id, "seq": seq, "aid": supp_acc_id, "pid": str(payload.supplier_id), "cr": grand_total}
        )
        seq += 1

        if rcm_applicable and (rcm_cgst + rcm_sgst) > 0:
            rcm_itc_res = await db.execute(text("SELECT id FROM caratloop.accounts WHERE code = 'ITC-004' AND company_id = :cid LIMIT 1"), {"cid": company_id})
            rcm_itc_id = str(rcm_itc_res.scalar())
            rcm_cgst_acc_res = await db.execute(text("SELECT id FROM caratloop.accounts WHERE code = 'RCM-001' AND company_id = :cid LIMIT 1"), {"cid": company_id})
            rcm_cgst_acc_id = str(rcm_cgst_acc_res.scalar())
            rcm_sgst_acc_res = await db.execute(text("SELECT id FROM caratloop.accounts WHERE code = 'RCM-002' AND company_id = :cid LIMIT 1"), {"cid": company_id})
            rcm_sgst_acc_id = str(rcm_sgst_acc_res.scalar())
            
            await db.execute(text("INSERT INTO caratloop.journal_entry_lines (journal_entry_id, sequence_no, account_id, dr_amount, cr_amount, narration) VALUES (:jid, :seq, :aid, :dr, 0, 'RCM Self ITC')"),
                {"jid": je_id, "seq": seq, "aid": rcm_itc_id, "dr": rcm_cgst + rcm_sgst})
            seq += 1
            await db.execute(text("INSERT INTO caratloop.journal_entry_lines (journal_entry_id, sequence_no, account_id, dr_amount, cr_amount, narration) VALUES (:jid, :seq, :aid, 0, :cr, 'RCM CGST Liability')"),
                {"jid": je_id, "seq": seq, "aid": rcm_cgst_acc_id, "cr": rcm_cgst})
            seq += 1
            await db.execute(text("INSERT INTO caratloop.journal_entry_lines (journal_entry_id, sequence_no, account_id, dr_amount, cr_amount, narration) VALUES (:jid, :seq, :aid, 0, :cr, 'RCM SGST Liability')"),
                {"jid": je_id, "seq": seq, "aid": rcm_sgst_acc_id, "cr": rcm_sgst})
            seq += 1

        # ─── RE-POST ITC REGISTER (ONLY REGISTERED SUPPLIERS) ────────────────────
        if not is_unregistered and not payload.is_rcm and total_gst > 0:
            return_period = payload.invoice_date.strftime("%Y-%m")
            await db.execute(
                text("""
                    INSERT INTO caratloop.itc_register (
                        company_id, fiscal_year_id, return_period,
                        invoice_id, vendor_id, vendor_gstin, vendor_invoice_no,
                        invoice_date, itc_type,
                        igst_credit, cgst_credit, sgst_credit, total_itc,
                        is_eligible, created_by
                    ) VALUES (
                        :cid, :fyid, :period,
                        :pid, :vid, :gstin, :inv_no,
                        :inv_date, 'ITC_3B',
                        :igst, :cgst, :sgst, :tot_itc,
                        TRUE, :cb
                    )
                """),
                {
                    "cid": company_id,
                    "fyid": str(fy["id"]),
                    "period": return_period,
                    "pid": str(id),
                    "vid": str(payload.supplier_id),
                    "gstin": supplier.get("gstin") if supplier else None,
                    "inv_no": bill_no,
                    "inv_date": payload.invoice_date,
                    "igst": total_igst,
                    "cgst": total_cgst,
                    "sgst": total_sgst,
                    "tot_itc": total_cgst + total_sgst + total_igst,
                    "cb": user_id
                }
            )

        await assert_journal_balanced(db, je_id, context="revised purchase invoice journal entry")

        await db.commit()
        return {"status": "success", "message": "Purchase invoice updated successfully"}

    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update purchase invoice: {str(e)}")


@router.get("/invoices")
async def list_purchases(
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    supplier_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    List purchase invoices with supplier details and embedded item lines.
    """
    query = """
        SELECT
            pi.id, pi.bill_no, pi.vendor_inv_no, pi.vendor_invoice_date, pi.bill_date,
            pi.vendor_id, pi.subtotal_value, pi.total_gst, pi.cgst_amount, pi.sgst_amount, pi.igst_amount,
            pi.grand_total, pi.place_of_supply, pi.attachment_url, pi.is_rcm_applicable,
            p.name AS vendor_name, p.trade_name AS vendor_trade_name, p.gstin AS vendor_gstin, p.address_line1, p.city
        FROM caratloop.purchase_invoices pi
        LEFT JOIN caratloop.parties p ON p.id = pi.vendor_id
        WHERE pi.company_id = :cid
    """
    params = {"cid": str(current_user["company_id"])}
    if from_date:
        query += " AND pi.bill_date >= :from_date"
        params["from_date"] = from_date
    if to_date:
        query += " AND pi.bill_date <= :to_date"
        params["to_date"] = to_date
    if supplier_id:
        query += " AND pi.vendor_id = :sid"
        params["sid"] = str(supplier_id)

    query += " ORDER BY pi.bill_date DESC, pi.created_at DESC"

    res = await db.execute(text(query), params)
    invoices = [dict(r) for r in res.mappings().all()]

    for inv in invoices:
        items_res = await db.execute(
            text("""
                SELECT pil.*, m.name AS material_name, m.code AS material_code, COALESCE(u.code, 'gm') AS unit
                FROM caratloop.purchase_invoice_lines pil
                LEFT JOIN caratloop.materials m ON m.id = pil.material_id
                LEFT JOIN caratloop.units_of_measure u ON u.id = m.uom_id
                WHERE pil.invoice_id = :pid
            """),
            {"pid": str(inv["id"])}
        )
        inv["items"] = [dict(i) for i in items_res.mappings().all()]

    return invoices


@router.get("/invoices/{id}")
async def get_purchase(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Fetch single purchase invoice detail.
    """
    res = await db.execute(
        text("""
            SELECT
                pi.*,
                p.name AS vendor_name, p.gstin AS vendor_gstin, p.address_line1, p.city
            FROM caratloop.purchase_invoices pi
            LEFT JOIN caratloop.parties p ON p.id = pi.vendor_id
            WHERE pi.id = :id AND pi.company_id = :cid
        """),
        {"id": str(id), "cid": str(current_user["company_id"])}
    )
    inv = res.mappings().first()
    if not inv:
        raise HTTPException(status_code=404, detail="Purchase invoice not found")

    items_res = await db.execute(
        text("""
            SELECT pil.*, m.name AS material_name, m.code AS material_code, COALESCE(u.code, 'gm') AS unit
            FROM caratloop.purchase_invoice_lines pil
            LEFT JOIN caratloop.materials m ON m.id = pil.material_id
            LEFT JOIN caratloop.units_of_measure u ON u.id = m.uom_id
            WHERE pil.invoice_id = :pid
        """),
        {"pid": str(id)}
    )

    inv_dict = dict(inv)
    inv_dict["items"] = [dict(i) for i in items_res.mappings().all()]
    return inv_dict
