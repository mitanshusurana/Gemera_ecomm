from uuid import UUID
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
import httpx
import os

from app.core.database import get_db, set_audit_context
from app.core.security import get_current_user

router = APIRouter(tags=["Party Master"])

class CreatePartyRequest(BaseModel):
    party_type: str
    party_code: str
    name: str
    trade_name: Optional[str] = None
    gstin: Optional[str] = None
    pan: Optional[str] = None
    gst_reg_type: str = "Unregistered"
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state_code: Optional[str] = None
    state_name: Optional[str] = None
    pincode: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    is_old_gold_supplier: bool = False
    credit_limit: Optional[float] = None
    credit_days: int = 30
    reason: str = "Party creation"

class UpdatePartyRequest(BaseModel):
    name: Optional[str] = None
    trade_name: Optional[str] = None
    gstin: Optional[str] = None
    pan: Optional[str] = None
    aadhaar_no: Optional[str] = None
    kyc_documents: Optional[dict] = None
    gst_reg_type: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state_code: Optional[str] = None
    state_name: Optional[str] = None
    pincode: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    is_old_gold_supplier: Optional[bool] = None
    credit_limit: Optional[float] = None
    credit_days: Optional[int] = None
    reason: str = "Party update"

STATE_NAMES = {
    "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
    "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
    "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur",
    "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal",
    "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
    "27": "Maharashtra", "29": "Karnataka", "30": "Goa", "32": "Kerala", "33": "Tamil Nadu", "36": "Telangana", "37": "Andhra Pradesh"
}

async def fetch_gstin_from_surepass(gstin: str, token: str) -> dict:
    gstin = gstin.strip().upper()
    if len(gstin) != 15:
        raise HTTPException(status_code=400, detail="Invalid GSTIN length. Must be exactly 15 characters.")
        
    state_code = gstin[:2]
    pan = gstin[2:12]
    state_name = STATE_NAMES.get(state_code, "Rajasthan")

    # 1. Primary Official GSTIN API (www.gstinapi.in)
    # No default: a hardcoded key here was billable, shared and public.
    api_key = os.environ.get('GSTIN_API_KEY', '')
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f'https://www.gstinapi.in/v1/gstin/{gstin}',
                headers={'x-api-key': api_key},
                timeout=6.0
            )
            if resp.status_code == 200:
                body = resp.json()
                if body.get('success') and body.get('data'):
                    d = body['data']
                    addr_str = d.get('address') or ''
                    return {
                        'legal_name': d.get('legal_name', ''),
                        'trade_name': d.get('trade_name') or d.get('legal_name', ''),
                        'status': d.get('status', 'Active'),
                        'registration_type': d.get('taxpayer_type', 'Regular'),
                        'business_type': d.get('business_constitution') or 'Proprietorship',
                        'registration_date': d.get('registration_date', ''),
                        'state_code': d.get('state_code', state_code),
                        'state_name': STATE_NAMES.get(d.get('state_code', state_code), state_name),
                        'pan': pan,
                        'address': {
                            'building_no': addr_str,
                            'street': '',
                            'location': d.get('city', ''),
                            'city': d.get('city', 'Jaipur' if state_code == '08' else ''),
                            'pincode': d.get('pincode', '')
                        },
                        'einvoice_eligible': True
                    }
    except Exception as err:
        print("GSTINAPI fetch error:", err)

    # 2. Try Surepass token if configured
    if token:
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    'https://api.surepass.io/api/v1/gst/verify',
                    headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
                    params={'id_number': gstin},
                    timeout=8.0
                )
                if resp.status_code == 200:
                    data = resp.json().get('data', {})
                    if data and data.get('legal_name'):
                        addr = data.get('pradr', {}).get('addr', {})
                        return {
                            'legal_name': data.get('legal_name', ''),
                            'trade_name': data.get('trade_name', data.get('legal_name', '')),
                            'status': data.get('sts', 'Active'),
                            'registration_type': data.get('taxpayer_type', 'Regular'),
                            'business_type': data.get('constitution_of_business', 'Proprietorship'),
                            'registration_date': data.get('date_of_registration', ''),
                            'state_code': state_code,
                            'state_name': state_name,
                            'pan': pan,
                            'address': {
                                'building_no': addr.get('bno', addr.get('flno', '')),
                                'street': addr.get('st', addr.get('street', '')),
                                'location': addr.get('loc', ''),
                                'city': addr.get('dst', addr.get('city', 'Jaipur' if state_code == '08' else '')),
                                'pincode': addr.get('pncd', '')
                            },
                            'einvoice_eligible': data.get('einvoice_status', 'No') == 'Yes'
                        }
        except Exception as err:
            print("Surepass fetch error:", err)

    # Clean structure strictly based on GSTIN format (no dummy hardcoded text)
    return {
        'legal_name': '',
        'trade_name': '',
        'status': 'Active',
        'registration_type': 'Regular',
        'business_type': 'Proprietorship',
        'registration_date': '',
        'state_code': state_code,
        'state_name': state_name,
        'pan': pan,
        'address': {
            'building_no': '',
            'street': '',
            'city': 'Jaipur' if state_code == '08' else '',
            'pincode': ''
        },
        'einvoice_eligible': False
    }

@router.get("/gstin/{gstin}")
async def fetch_gstin_details(
    gstin: str,
    current_user: dict = Depends(get_current_user),
):
    """Proxy a GSTIN lookup to the upstream provider.

    Authenticated: this spends a paid third-party quota and, left open, allowed
    anonymous GSTIN enumeration through our credentials.
    """
    token = os.environ.get("SUREPASS_TOKEN", "")
    return await fetch_gstin_from_surepass(gstin, token)

class CreatePartyRequest(BaseModel):
    party_type: str  # Customer, Supplier, Both, Vendor
    party_code: Optional[str] = None
    name: str
    trade_name: Optional[str] = None
    gstin: Optional[str] = None
    pan: Optional[str] = None
    aadhaar_no: Optional[str] = None
    kyc_documents: Optional[dict] = None
    gst_reg_type: str = "Regular"
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = "Jaipur"
    state_code: Optional[str] = "08"
    state_name: Optional[str] = "Rajasthan"
    pincode: Optional[str] = None
    mobile: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    is_old_gold_supplier: bool = False
    credit_limit: Optional[float] = 0
    credit_days: int = 30
    opening_balance: Optional[float] = 0
    opening_bal_type: str = "Dr"
    reason: str = "Party creation"

@router.post("")
async def create_party(
    payload: CreatePartyRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user_id = str(current_user["id"])
    company_id = current_user["company_id"]
    ip_address = request.client.host if request.client else "0.0.0.0"
    session_id = current_user.get("session_id", "0")

    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)

    try:
        # Auto-generate party_code if omitted
        if not payload.party_code:
            prefix = "CUST" if payload.party_type == "Customer" else "SUPP"
            count_res = await db.execute(
                text("SELECT COUNT(*) FROM caratloop.parties WHERE company_id = :cid"),
                {"cid": company_id}
            )
            cnt = (count_res.scalar() or 0) + 1
            party_code = f"{prefix}-{cnt:04d}"
        else:
            party_code = payload.party_code

        # Map Group Code to match account_groups table: 'DEBTORS' or 'CREDITORS'
        acc_group_code = "DEBTORS" if payload.party_type in ["Customer", "Both"] else "CREDITORS"
        
        acc_result = await db.execute(
            text("""
                INSERT INTO caratloop.accounts (
                    company_id, group_id, code, name, account_type, normal_balance,
                    currency, gstin, opening_balance, opening_balance_type, created_by
                ) VALUES (
                    :cid, (SELECT id FROM caratloop.account_groups WHERE company_id = :cid AND code = :group_code LIMIT 1),
                    :code, :name, :acc_type, :nb, 'INR', :gstin, :op_bal, :op_type, :created_by
                ) RETURNING id
            """),
            {
                "cid": company_id,
                "group_code": acc_group_code,
                "code": f"ACC-{party_code}",
                "name": payload.name,
                "acc_type": "Debtor" if payload.party_type == "Customer" else "Creditor",
                "nb": "D" if payload.party_type == "Customer" else "C",
                "gstin": payload.gstin,
                "op_bal": payload.opening_balance or 0,
                "op_type": payload.opening_bal_type[:1] if payload.opening_bal_type else 'D',
                "created_by": user_id
            }
        )
        account_id = acc_result.scalar()

        if not account_id:
            # Fallback if group matching failed, pick any DEBTORS/CREDITORS group
            acc_result = await db.execute(
                text("""
                    INSERT INTO caratloop.accounts (
                        company_id, group_id, code, name, account_type, normal_balance, currency, gstin, created_by
                    ) VALUES (
                        :cid, (SELECT id FROM caratloop.account_groups WHERE code = :group_code LIMIT 1),
                        :code, :name, :acc_type, :nb, 'INR', :gstin, :created_by
                    ) RETURNING id
                """),
                {
                    "cid": company_id,
                    "group_code": acc_group_code,
                    "code": f"ACC-{party_code}",
                    "name": payload.name,
                    "acc_type": "Debtor" if payload.party_type == "Customer" else "Creditor",
                    "nb": "D" if payload.party_type == "Customer" else "C",
                    "gstin": payload.gstin,
                    "created_by": user_id
                }
            )
            account_id = acc_result.scalar()

        # Create Party
        import json
        kyc_json = json.dumps(payload.kyc_documents) if payload.kyc_documents else '{}'
        party_result = await db.execute(
            text("""
                INSERT INTO caratloop.parties (
                    company_id, account_id, party_type, party_code, name, trade_name,
                    gstin, pan, aadhaar_no, kyc_documents, gst_reg_type, address_line1, address_line2, city,
                    state_code, state_name, pincode, phone, email, is_old_gold_supplier,
                    credit_limit, credit_days, created_by
                ) VALUES (
                    :cid, :acc_id, :ptype, :pcode, :name, :tname, :gstin, :pan, :aadhaar, CAST(:kyc_docs AS JSONB),
                    :gst_reg, :addr1, :addr2, :city, :state_c, :state_n, :pin,
                    :phone, :email, :old_gold, :limit, :days, :created_by
                ) RETURNING id
            """),
            {
                "cid": company_id, "acc_id": account_id, "ptype": payload.party_type,
                "pcode": party_code, "name": payload.name, "tname": payload.trade_name,
                "gstin": payload.gstin, "pan": payload.pan or (payload.gstin[2:12] if payload.gstin and len(payload.gstin)>=12 else None),
                "aadhaar": payload.aadhaar_no, "kyc_docs": kyc_json,
                "gst_reg": payload.gst_reg_type,
                "addr1": payload.address_line1, "addr2": payload.address_line2, "city": payload.city,
                "state_c": payload.state_code, "state_n": payload.state_name, "pin": payload.pincode,
                "phone": payload.mobile or payload.phone, "email": payload.email, "old_gold": payload.is_old_gold_supplier,
                "limit": payload.credit_limit or 0, "days": payload.credit_days or 30, "created_by": user_id
            }
        )
        party_id = party_result.scalar()
        await db.commit()
        return {"status": "success", "id": str(party_id), "party_code": party_code}
    except Exception as e:
        await db.rollback()
        print("Create Party Error:", e)
        raise HTTPException(status_code=500, detail=f"Failed to create party: {str(e)}")


@router.get("")
async def list_parties(
    type: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    query = """
        SELECT 
            p.id, p.party_type, p.party_type as type, p.party_code, p.party_code as code, 
            p.name, p.trade_name, p.gstin, p.pan, p.aadhaar_no, p.kyc_documents, p.gst_reg_type, p.phone, p.email, p.state_code, p.state_name, p.state_name as state,
            p.address_line1, p.address_line2, p.address_line1 as address, p.city, p.pincode,
            p.credit_limit, p.credit_limit as "creditLimit",
            COALESCE((
                SELECT SUM(dr_amount - cr_amount) 
                FROM caratloop.journal_entry_lines 
                WHERE account_id = p.account_id
            ), 0) as outstanding,
            CASE 
                WHEN p.gstin IS NOT NULL AND LENGTH(p.gstin) >= 15 THEN 'Complete'
                WHEN p.pan IS NOT NULL OR p.aadhaar_no IS NOT NULL THEN 'Partial'
                ELSE 'Unregistered'
            END as kyc
        FROM caratloop.parties p
        WHERE p.company_id = :cid
    """
    params = {"cid": current_user["company_id"], "limit": limit}

    if type:
        query += " AND (p.party_type = :type OR p.party_type = 'Both')"
        params["type"] = type
    if q:
        query += " AND (p.name ILIKE :q OR p.party_code ILIKE :q OR p.gstin ILIKE :q)"
        params["q"] = f"%{q}%"

    query += " ORDER BY p.name LIMIT :limit"

    result = await db.execute(text(query), params)
    return [dict(r) for r in result.mappings().all()]


@router.get("/{id}")
async def get_party(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    result = await db.execute(
        text("SELECT * FROM caratloop.parties WHERE id = :id AND company_id = :cid"),
        {"id": str(id), "cid": current_user["company_id"]}
    )
    party = result.mappings().first()
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")

    # Fetch outstanding balance via journal entries
    bal_result = await db.execute(
        text("""
            SELECT COALESCE(SUM(dr_amount - cr_amount), 0) as balance
            FROM caratloop.journal_entry_lines
            WHERE account_id = :acc_id
        """),
        {"acc_id": str(party["account_id"])}
    )
    balance = bal_result.scalar()
    party_dict = dict(party)
    party_dict["outstanding_balance"] = float(balance)
    return party_dict


@router.patch("/{id}")
async def update_party(
    id: UUID,
    payload: UpdatePartyRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user_id = str(current_user["id"])
    company_id = current_user["company_id"]
    ip_address = request.client.host if request.client else "0.0.0.0"
    session_id = current_user.get("session_id", "0")

    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)

    try:
        import json
        update_fields = []
        params = {"id": str(id), "cid": company_id}
        for field, value in payload.dict(exclude_unset=True).items():
            if field != "reason" and value is not None:
                if field == "kyc_documents":
                    update_fields.append("kyc_documents = CAST(:kyc_documents AS JSONB)")
                    params["kyc_documents"] = json.dumps(value)
                else:
                    update_fields.append(f"{field} = :{field}")
                    params[field] = value

        if update_fields:
            query = f"UPDATE caratloop.parties SET {', '.join(update_fields)} WHERE id = :id AND company_id = :cid RETURNING id"
            result = await db.execute(text(query), params)
            if not result.scalar():
                raise HTTPException(status_code=404, detail="Party not found")
            await db.commit()

        return {"status": "success"}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update party: {str(e)}")
