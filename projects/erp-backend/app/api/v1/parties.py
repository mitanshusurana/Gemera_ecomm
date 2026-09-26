import logging
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
from app.tax.gstin import STATE_NAMES, checksum_ok as gstin_checksum_ok, decode as decode_gstin, is_gstin_shaped

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Party Master"])

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
    # TDS s.194Q (we deduct on purchases from them) / TCS s.206C(1H) (we
    # collect on sales to them); a s.197 lower-deduction certificate rate;
    # whether their PAN has been verified.
    tds_applicable: Optional[bool] = None
    tcs_applicable: Optional[bool] = None
    lower_deduction_pct: Optional[float] = None
    tds_pan_verified: Optional[bool] = None
    # Karigar only: what they make ("22K bangles, kundan setting").
    karigar_skills: Optional[str] = None
    reason: str = "Party update"

async def fetch_gstin_from_surepass(gstin: str, token: str) -> dict:
    gstin = gstin.strip().upper()
    if len(gstin) != 15:
        raise HTTPException(status_code=400, detail="Invalid GSTIN length. Must be exactly 15 characters.")
        
    state_code = gstin[:2]
    pan = gstin[2:12]
    # An unrecognised state code is unrecognised, not Rajasthan.
    state_name = STATE_NAMES.get(state_code)

    # 1. Primary Official GSTIN API (www.gstinapi.in)
    # No default: a hardcoded key here was billable, shared and public.
    api_key = os.environ.get('GSTIN_API_KEY', '')
    # Set when the provider answered with something definite that is not a
    # record: "no such GSTIN" or "your key is rejected". Both are facts worth
    # more than a blank form, and both used to fall through to "the provider
    # did not answer".
    provider_verdict: dict | None = None
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f'https://www.gstinapi.in/v1/gstin/{gstin}',
                headers={'x-api-key': api_key},
                timeout=6.0
            )
            if resp.status_code == 404:
                # The provider checked GSTN and found no registration. That is
                # the answer a buyer most needs before claiming ITC against it.
                provider_verdict = {
                    'source': 'gstinapi.in',
                    'status': 'Not_Found',
                    'reason': (
                        'GSTN has no record of this GSTIN. The format is valid; check for a '
                        'typo. A registration issued in the last day may not have appeared yet.'
                    ),
                }
            elif resp.status_code in (401, 403):
                logger.error("GSTIN API rejected the key (HTTP %s): %s", resp.status_code, resp.text[:200])
                provider_verdict = {
                    'source': None,
                    'status': None,
                    'reason': 'The GSTIN lookup provider rejected the API key. Check GSTIN_API_KEY.',
                }
            elif resp.status_code == 429:
                logger.warning("GSTIN API rate-limited the lookup: %s", resp.text[:200])
                provider_verdict = {
                    'source': None, 'status': None,
                    'reason': 'The GSTIN lookup provider is rate-limiting requests. Try again shortly.',
                }
            elif resp.status_code != 200:
                logger.warning("GSTIN API answered HTTP %s: %s", resp.status_code, resp.text[:200])
            if resp.status_code == 200:
                body = resp.json()
                if body.get('success') and body.get('data'):
                    d = body['data']
                    addr_str = d.get('address') or ''
                    return {
                        'gstin': gstin,
                        'verified': True,
                        'source': 'gstinapi.in',
                        'checksum_valid': gstin_checksum_ok(gstin),
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
                            'city': d.get('city', ''),
                            'pincode': d.get('pincode', '')
                        },
                        'einvoice_eligible': True
                    }
    except Exception as err:
        logger.warning("GSTIN API lookup failed: %s", err)

    # 2. Try Surepass token if configured -- but not to second-guess a
    #    definite "not found": one authoritative miss is an answer.
    if token and not (provider_verdict and provider_verdict.get('status') == 'Not_Found'):
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
                            'gstin': gstin,
                            'verified': True,
                            'source': 'surepass',
                            'checksum_valid': gstin_checksum_ok(gstin),
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
                                'city': addr.get('dst', addr.get('city', '')),
                                'pincode': addr.get('pncd', '')
                            },
                            'einvoice_eligible': data.get('einvoice_status', 'No') == 'Yes'
                        }
        except Exception as err:
            logger.warning("Surepass lookup failed: %s", err)

    # Nothing verified this GSTIN.
    #
    # This used to return status='Active', registration_type='Regular' and
    # business_type='Proprietorship' regardless -- asserting the registration
    # was live when no provider had been reached. A supplier whose registration
    # is cancelled or suspended would have been recorded as Active, and input
    # tax credit claimed against them is not available. An unchecked field must
    # read as unchecked.
    #
    # state_code, state_name and pan are still returned: they are decoded from
    # the GSTIN string itself, not looked up, so they are true without any
    # provider. The caller is told which is which by 'verified'.
    if provider_verdict:
        reason = provider_verdict['reason']
        source = provider_verdict['source']
        status = provider_verdict['status']
    elif not api_key and not token:
        reason = ('GSTIN lookup is not configured: set GSTIN_API_KEY (or SUREPASS_TOKEN) '
                  'in .env and restart the backend.')
        source = status = None
    else:
        reason = 'The GSTIN lookup provider did not answer. Enter the details manually.'
        source = status = None

    return {
        'gstin': gstin,
        'verified': False,
        'source': source,
        'reason': reason,
        'checksum_valid': gstin_checksum_ok(gstin),
        'legal_name': '',
        'trade_name': '',
        'status': status,
        'registration_type': None,
        'business_type': None,
        'registration_date': '',
        'state_code': state_code,
        'state_name': state_name,
        'pan': pan,
        'address': {
            'building_no': '',
            'street': '',
            'city': '',
            'pincode': ''
        },
        'einvoice_eligible': None
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

# caratloop.parties.party_type is CHECK-constrained to Customer / Vendor /
# Both / Karigar (the last added by migration 0009). The whole user interface
# says "Supplier" -- which is the word the trade uses -- and sent it straight
# through, so creating a supplier failed with a 500 from the database, and the
# supplier dropdown, which filters on the same word, matched nothing that could
# ever have been stored. Accept the word the interface uses and store the one
# the schema permits.
#
# A Karigar is an artisan paid making charges for work on metal that stays
# ours (CGST s.143 job work). They are a Sundry Creditor like a Vendor, but a
# distinct type so the job-work screens can list artisans without listing
# every bullion dealer.
PARTY_TYPE_ALIASES = {
    "customer": "Customer",
    "debtor": "Customer",
    "vendor": "Vendor",
    "supplier": "Vendor",
    "creditor": "Vendor",
    "both": "Both",
    "karigar": "Karigar",
    "artisan": "Karigar",
    "job_worker": "Karigar",
    "jobworker": "Karigar",
}

# Party code prefix and ledger side per stored type.
PARTY_CODE_PREFIX = {"Customer": "CUST", "Vendor": "SUPP", "Both": "SUPP", "Karigar": "KAR"}
DEBTOR_TYPES = frozenset({"Customer", "Both"})


def normalise_party_types(value: str | None) -> list[str]:
    """A comma-separated list of party types, each normalised, in order.

    The job-work karigar picker wants "Karigar,Supplier": an artisan may
    have been filed as a Vendor before the Karigar type existed.
    """
    seen: list[str] = []
    for part in (value or "").split(","):
        if not part.strip():
            continue
        stored = normalise_party_type(part)
        if stored not in seen:
            seen.append(stored)
    return seen


def normalise_party_type(value: str | None) -> str:
    """Map an incoming party type onto the value the schema stores.

    Raises 422 rather than letting an unrecognised value reach the CHECK
    constraint, where it surfaced as an opaque 500.
    """
    stored = PARTY_TYPE_ALIASES.get((value or "").strip().lower())
    if stored is None:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Unknown party type '{value}'. Use Customer, Supplier, Karigar or Both."
            ),
        )
    return stored


class CreatePartyRequest(BaseModel):
    party_type: str  # Customer, Supplier/Vendor, or Both
    party_code: Optional[str] = None
    name: str
    trade_name: Optional[str] = None
    gstin: Optional[str] = None
    pan: Optional[str] = None
    aadhaar_no: Optional[str] = None
    kyc_documents: Optional[dict] = None
    # None, then derived: a party with a GSTIN-shaped number is 'Regular'
    # unless told otherwise, one without is 'Unregistered'. The old default of
    # 'Regular' recorded every walk-in gold seller as a registered taxpayer.
    gst_reg_type: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    # No default city or state. "Jaipur, Rajasthan" was written onto every
    # party whose address was left blank, and from there onto the
    # place-of-supply line of their invoices.
    city: Optional[str] = None
    state_code: Optional[str] = None
    state_name: Optional[str] = None
    pincode: Optional[str] = None
    mobile: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    is_old_gold_supplier: bool = False
    credit_limit: Optional[float] = 0
    credit_days: int = 30
    opening_balance: Optional[float] = 0
    opening_bal_type: str = "Dr"
    tds_applicable: bool = False
    tcs_applicable: bool = False
    lower_deduction_pct: Optional[float] = None
    tds_pan_verified: bool = False
    karigar_skills: Optional[str] = None
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
        party_type = normalise_party_type(payload.party_type)

        # Registration type and state, when not given, are read from the GSTIN
        # -- the one thing a GSTIN reliably encodes without a lookup.
        gst_reg_type = payload.gst_reg_type
        state_code, state_name = payload.state_code, payload.state_name
        decoded = decode_gstin(payload.gstin) if is_gstin_shaped(payload.gstin) else None
        if not gst_reg_type:
            gst_reg_type = "Regular" if decoded else "Unregistered"
        if decoded and not state_code:
            state_code, state_name = decoded.state_code, decoded.state_name

        # Auto-generate party_code if omitted
        if not payload.party_code:
            prefix = PARTY_CODE_PREFIX.get(party_type, "SUPP")
            count_res = await db.execute(
                text("SELECT caratloop.next_document_number(:cid, NULL, :dtype)"),
                {"cid": company_id, "dtype": f"Party:{prefix}"}
            )
            cnt = count_res.scalar()
            party_code = f"{prefix}-{cnt:04d}"
        else:
            party_code = payload.party_code

        # Map Group Code to match account_groups table: 'DEBTORS' or 'CREDITORS'
        # A 'Both' party is filed under Sundry Debtors, so its account must be
        # a Debtor too. Branching on == "Customer" gave it a Creditor account
        # inside the Debtors group, which no trial balance could reconcile.
        is_debtor = party_type in DEBTOR_TYPES
        acc_group_code = "DEBTORS" if is_debtor else "CREDITORS"
        
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
                "acc_type": "Debtor" if is_debtor else "Creditor",
                "nb": "D" if is_debtor else "C",
                "gstin": payload.gstin,
                "op_bal": payload.opening_balance or 0,
                "op_type": payload.opening_bal_type[:1] if payload.opening_bal_type else 'D',
                "created_by": user_id
            }
        )
        account_id = acc_result.scalar()

        if not account_id:
            # Fall back to this company's own DEBTORS/CREDITORS group. Scoped to
            # :cid: an unscoped lookup filed the party under another
            # company's group, crossing the two companies' books.
            acc_result = await db.execute(
                text("""
                    INSERT INTO caratloop.accounts (
                        company_id, group_id, code, name, account_type, normal_balance, currency, gstin, created_by
                    ) VALUES (
                        :cid, (SELECT id FROM caratloop.account_groups
                                WHERE code = :group_code AND company_id = :cid LIMIT 1),
                        :code, :name, :acc_type, :nb, 'INR', :gstin, :created_by
                    ) RETURNING id
                """),
                {
                    "cid": company_id,
                    "group_code": acc_group_code,
                    "code": f"ACC-{party_code}",
                    "name": payload.name,
                    "acc_type": "Debtor" if is_debtor else "Creditor",
                    "nb": "D" if is_debtor else "C",
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
                    credit_limit, credit_days,
                    tds_applicable, tcs_applicable, lower_deduction_pct, tds_pan_verified,
                    karigar_skills, created_by
                ) VALUES (
                    :cid, :acc_id, :ptype, :pcode, :name, :tname, :gstin, :pan, :aadhaar, CAST(:kyc_docs AS JSONB),
                    :gst_reg, :addr1, :addr2, :city, :state_c, :state_n, :pin,
                    :phone, :email, :old_gold, :limit, :days,
                    :tds_applicable, :tcs_applicable, :lower_pct, :pan_verified,
                    :skills, :created_by
                ) RETURNING id
            """),
            {
                "cid": company_id, "acc_id": account_id, "ptype": party_type,
                "pcode": party_code, "name": payload.name, "tname": payload.trade_name,
                "gstin": payload.gstin, "pan": payload.pan or (decoded.pan if decoded else None),
                "aadhaar": payload.aadhaar_no, "kyc_docs": kyc_json,
                "gst_reg": gst_reg_type,
                "addr1": payload.address_line1, "addr2": payload.address_line2, "city": payload.city,
                "state_c": state_code, "state_n": state_name, "pin": payload.pincode,
                "phone": payload.mobile or payload.phone, "email": payload.email, "old_gold": payload.is_old_gold_supplier,
                "limit": payload.credit_limit or 0, "days": payload.credit_days or 30,
                "tds_applicable": bool(payload.tds_applicable), "tcs_applicable": bool(payload.tcs_applicable),
                "lower_pct": payload.lower_deduction_pct, "pan_verified": bool(payload.tds_pan_verified),
                "skills": (payload.karigar_skills or "").strip() or None,
                "created_by": user_id
            }
        )
        party_id = party_result.scalar()
        await db.commit()
        return {"status": "success", "id": str(party_id), "party_code": party_code}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Failed to create party")
        raise HTTPException(
            status_code=500,
            detail="Failed to create party. The operation was rolled back and nothing was saved.",
        ) from e


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
            p.karigar_skills, p.tds_applicable, p.tcs_applicable, p.lower_deduction_pct, p.tds_pan_verified,
            p.credit_days, p.is_old_gold_supplier,
            COALESCE((
                SELECT SUM(dr_amount - cr_amount) 
                FROM caratloop.journal_entry_lines 
                WHERE account_id = p.account_id
            ), 0) as outstanding,
            -- 'Complete' used to mean LENGTH(gstin) >= 15: any fifteen characters
            -- typed into the box earned a green "KYC Verified" badge with no
            -- document on file. Complete now means a GSTIN-shaped number AND at
            -- least one KYC document actually uploaded; an identifier alone is
            -- Partial.
            CASE
                WHEN p.gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'
                 AND EXISTS (
                     SELECT 1 FROM jsonb_each_text(COALESCE(p.kyc_documents, '{}'::jsonb)) d
                     WHERE d.value IS NOT NULL AND d.value <> ''
                 ) THEN 'Complete'
                WHEN p.gstin IS NOT NULL AND p.gstin <> ''
                  OR p.pan IS NOT NULL OR p.aadhaar_no IS NOT NULL THEN 'Partial'
                ELSE 'Unregistered'
            END as kyc
        FROM caratloop.parties p
        WHERE p.company_id = :cid
    """
    params = {"cid": current_user["company_id"], "limit": limit}

    if type:
        # Normalised for the same reason as on write: the interface asks for
        # "Supplier", which is stored as "Vendor". Several may be given
        # ("Karigar,Supplier"); a 'Both' party answers to Customer and Vendor
        # but is not an artisan.
        wanted = normalise_party_types(type)
        placeholders = []
        for i, t in enumerate(wanted):
            params[f"type{i}"] = t
            placeholders.append(f":type{i}")
        if set(wanted) & {"Customer", "Vendor"}:
            placeholders.append("'Both'")
        query += " AND p.party_type IN (" + ", ".join(placeholders) + ")"
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
    except HTTPException:
        # Deliberate 4xx responses (validation, authorisation,
        # insufficient stock, unbalanced entry) must not be
        # rewritten as a 500.
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Failed to update party")
        raise HTTPException(
            status_code=500,
            detail="Failed to update party. The operation was rolled back and nothing was saved.",
        ) from e
