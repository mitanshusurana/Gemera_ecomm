"""The company master: what it holds, how it is read, and what may change.

Until now caratloop.companies could only be edited by SQL. Every column that
a printed document, a GST return or the e-invoice payload reads is here, with
the rules a change must satisfy:

  gstin         fifteen characters, correct check digit. The state is read out
                of its first two characters and the PAN out of characters
                3-12, so changing it changes those too -- and a PAN on record
                that disagrees with the new GSTIN is refused rather than
                silently kept, because the two are printed side by side on
                every tax invoice.
  pan           ten characters; must agree with the GSTIN when there is one.
  state_code    may only be set explicitly when there is no GSTIN to derive it
                from; otherwise it is whatever the GSTIN says.
  pincode       six digits.
  bank_ifsc     the same shape as the CHECK on the column.

The seller's state used to be a deployment setting (COMPANY_STATE_CODE) that
the GST engine read for every invoice, credit note and purchase. It is now
read from the company row through seller_state_code(), with the setting as
the fallback for a row that has no state, so a company whose GSTIN moves to
another state is taxed as that state from the next document on.
"""

from __future__ import annotations

import re
from typing import Any, Mapping, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.tax.gstin import STATE_NAMES, checksum_ok, decode, is_gstin_shaped
from app.tax.gstin import normalise as normalise_gstin

# Every column of caratloop.companies a user may read. is_active and
# created_at are deliberately not editable.
COMPANY_COLUMNS: tuple[str, ...] = (
    "id", "name", "legal_name", "trade_name", "gstin", "pan", "cin", "tan", "msme_reg_no",
    "address_line1", "address_line2", "city", "state_code", "state_name", "pincode",
    "phone", "email", "website", "logo_url", "fiscal_year_start", "base_currency",
    "bank_name", "bank_branch", "bank_account_no", "bank_ifsc", "is_active", "created_at",
)

# What PATCH /company may change. state_name is derived, never sent on its own.
EDITABLE_COLUMNS: frozenset[str] = frozenset({
    "name", "legal_name", "trade_name", "gstin", "pan", "cin", "tan", "msme_reg_no",
    "address_line1", "address_line2", "city", "state_code", "pincode",
    "phone", "email", "website", "logo_url", "fiscal_year_start", "base_currency",
    "bank_name", "bank_branch", "bank_account_no", "bank_ifsc",
})

# Columns the database refuses NULL on.
REQUIRED_TEXT: frozenset[str] = frozenset({"name", "legal_name"})

PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
TAN_RE = re.compile(r"^[A-Z]{4}[0-9]{5}[A-Z]$")
CIN_RE = re.compile(r"^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$")
PINCODE_RE = re.compile(r"^[1-9][0-9]{5}$")
IFSC_RE = re.compile(r"^[A-Z]{4}0[A-Z0-9]{6}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
CURRENCY_RE = re.compile(r"^[A-Z]{3}$")

# Columns whose value is upper-cased before validation: identifiers, not prose.
_UPPER: frozenset[str] = frozenset({"gstin", "pan", "tan", "cin", "bank_ifsc", "base_currency"})

COMPANY_SELECT = (
    "SELECT " + ", ".join(COMPANY_COLUMNS) + " FROM caratloop.companies WHERE id = CAST(:cid AS UUID)"
)


class CompanyValidationError(ValueError):
    """One or more fields of a company patch are unacceptable."""

    def __init__(self, problems: list[str]):
        super().__init__("; ".join(problems))
        self.problems = problems


def _clean(column: str, value: Any) -> Any:
    """Trim strings, turn blanks into NULL, upper-case identifiers."""
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
        if value == "":
            return None
        if column in _UPPER:
            value = value.upper()
        return value
    return value


def validate_company_patch(current: Mapping[str, Any], changes: Mapping[str, Any]) -> dict[str, Any]:
    """The column values to write for ``changes`` applied to ``current``.

    Pure: no database. Raises CompanyValidationError listing every problem
    found rather than the first one, so the form can show them all.

    The result contains only columns that need writing, with the derived
    state_code/state_name/pan included when the GSTIN drives them.
    """
    problems: list[str] = []
    out: dict[str, Any] = {}

    unknown = sorted(k for k in changes if k not in EDITABLE_COLUMNS)
    if unknown:
        problems.append("Not editable: " + ", ".join(unknown) + ".")

    for col in EDITABLE_COLUMNS:
        if col in changes:
            out[col] = _clean(col, changes[col])

    for col in REQUIRED_TEXT:
        if col in out and out[col] is None:
            problems.append(f"{col} cannot be blank.")

    # Merged view: what the row will hold after the write.
    merged = {**dict(current), **out}

    gstin = merged.get("gstin")
    decoded = None
    # A GSTIN re-sent unchanged is not re-validated: a row seeded with a
    # number whose check digit does not compute (a placeholder) must still be
    # editable in every other field, and the UI sends only changed fields.
    if "gstin" in out and gstin == current.get("gstin"):
        out.pop("gstin")
    if "gstin" in out and gstin is not None:
        if not is_gstin_shaped(gstin):
            problems.append("GSTIN must be 15 characters: 2-digit state, 10-character PAN, entity code, 'Z', check digit.")
        elif checksum_ok(gstin) is not True:
            problems.append("GSTIN check digit does not match; the number is mistyped.")
        else:
            decoded = decode(gstin)
    elif gstin is not None and is_gstin_shaped(gstin):
        decoded = decode(gstin)

    # PAN: shape, then agreement with the GSTIN.
    pan = merged.get("pan")
    if "pan" in out and pan is not None and not PAN_RE.match(pan):
        problems.append("PAN must be 10 characters: 5 letters, 4 digits, 1 letter.")
    # Only when the patch touches one of the pair: an address-only change
    # must not be refused because of a disagreement that predates it.
    if decoded is not None and not problems and ("gstin" in out or "pan" in out):
        if pan is None:
            # Nothing on record: the GSTIN carries the PAN, so record it.
            out["pan"] = decoded.pan
        elif pan != decoded.pan:
            if "pan" in out:
                problems.append(
                    f"PAN {pan} does not match the PAN inside the GSTIN ({decoded.pan})."
                )
            else:
                problems.append(
                    f"The PAN on record ({pan}) does not match the new GSTIN's PAN ({decoded.pan}); "
                    "send the matching PAN with the GSTIN."
                )

    # State: from the GSTIN when there is one, explicit otherwise.
    if decoded is not None and "gstin" in out and not problems:
        if "state_code" in out and out["state_code"] is not None and out["state_code"] != decoded.state_code:
            problems.append(
                f"state_code {out['state_code']} disagrees with the GSTIN's state ({decoded.state_code})."
            )
        else:
            out["state_code"] = decoded.state_code
            out["state_name"] = decoded.state_name or merged.get("state_name") or decoded.state_code
    elif "state_code" in out:
        code = out["state_code"]
        if code is None:
            problems.append("state_code cannot be blank.")
        elif not re.match(r"^[0-9]{2}$", code) or code not in STATE_NAMES:
            problems.append(f"Unknown GST state code {code!r}.")
        elif decoded is not None and code != decoded.state_code:
            problems.append(
                f"state_code {code} disagrees with the GSTIN on record ({decoded.state_code}); change the GSTIN."
            )
        else:
            out["state_name"] = STATE_NAMES[code]

    if "pincode" in out and out["pincode"] is not None and not PINCODE_RE.match(str(out["pincode"])):
        problems.append("Pincode must be six digits.")
    if "bank_ifsc" in out and out["bank_ifsc"] is not None and not IFSC_RE.match(out["bank_ifsc"]):
        problems.append("IFSC must be four letters, a zero and six alphanumerics (e.g. HDFC0001234).")
    if "tan" in out and out["tan"] is not None and not TAN_RE.match(out["tan"]):
        problems.append("TAN must be 4 letters, 5 digits, 1 letter.")
    if "cin" in out and out["cin"] is not None and not CIN_RE.match(out["cin"]):
        problems.append("CIN must be 21 characters (e.g. U12345RJ2020PTC012345).")
    if "email" in out and out["email"] is not None and not EMAIL_RE.match(out["email"]):
        problems.append("Email address is not valid.")
    if "phone" in out and out["phone"] is not None and len(out["phone"]) > 15:
        problems.append("Phone must be at most 15 characters.")
    if "base_currency" in out and (out["base_currency"] is None or not CURRENCY_RE.match(out["base_currency"])):
        problems.append("base_currency must be a three-letter ISO code.")
    if "fiscal_year_start" in out:
        fy = out["fiscal_year_start"]
        if not isinstance(fy, int) or isinstance(fy, bool) or not 1 <= fy <= 12:
            problems.append("fiscal_year_start must be a month number from 1 to 12.")
    if "bank_account_no" in out and out["bank_account_no"] is not None:
        acc = str(out["bank_account_no"])
        if not re.match(r"^[A-Za-z0-9]{6,34}$", acc):
            problems.append("Bank account number must be 6 to 34 letters or digits.")

    if problems:
        raise CompanyValidationError(problems)
    return out


def bank_block(default_account: Optional[Mapping[str, Any]], company: Mapping[str, Any]) -> Optional[dict]:
    """The remittance block a document prints, or None when nothing is on record.

    The account flagged is_default_bank wins when it carries an account number
    and IFSC; otherwise the company's own bank_* columns (migration 0004) are
    used, so a company that has not yet detailed its accounts prints what it
    printed before. Nothing is invented: both halves missing means None and
    the invoice omits the block.
    """
    if default_account and default_account.get("bank_account_no") and default_account.get("bank_ifsc"):
        return {
            "account_id": str(default_account["id"]) if default_account.get("id") is not None else None,
            "account_name": default_account.get("name"),
            "bank_name": default_account.get("bank_name"),
            "bank_branch": default_account.get("bank_branch"),
            "account_no": default_account.get("bank_account_no"),
            "ifsc": default_account.get("bank_ifsc"),
            "upi_id": default_account.get("upi_id"),
            "source": "account",
        }
    if company.get("bank_account_no") and company.get("bank_ifsc"):
        return {
            "account_id": None,
            "account_name": None,
            "bank_name": company.get("bank_name"),
            "bank_branch": company.get("bank_branch"),
            "account_no": company.get("bank_account_no"),
            "ifsc": company.get("bank_ifsc"),
            "upi_id": None,
            "source": "company",
        }
    return None


def public_company(row: Mapping[str, Any], default_account: Optional[Mapping[str, Any]]) -> dict:
    """The company as the API returns it: every column, ids as strings, the
    bank block resolved, and the raw bank_* columns kept for the settings form."""
    c = dict(row)
    c["id"] = str(c["id"])
    if c.get("created_at") is not None:
        c["created_at"] = c["created_at"].isoformat() if hasattr(c["created_at"], "isoformat") else str(c["created_at"])
    c["bank"] = bank_block(default_account, c)
    c["default_bank_account_id"] = (
        str(default_account["id"]) if default_account and default_account.get("id") is not None else None
    )
    return c


# ─── Database reads ──────────────────────────────────────────────────────────

DEFAULT_BANK_SELECT = (
    "SELECT id, code, name, bank_name, bank_branch, bank_account_no, bank_ifsc, upi_id "
    "FROM caratloop.accounts "
    "WHERE company_id = CAST(:cid AS UUID) AND is_default_bank AND is_active = TRUE "
    "LIMIT 1"
)


async def fetch_company(db: AsyncSession, company_id: Any) -> Optional[dict]:
    res = await db.execute(text(COMPANY_SELECT), {"cid": str(company_id)})
    row = res.mappings().first()
    return dict(row) if row else None


async def fetch_default_bank_account(db: AsyncSession, company_id: Any) -> Optional[dict]:
    res = await db.execute(text(DEFAULT_BANK_SELECT), {"cid": str(company_id)})
    row = res.mappings().first()
    return dict(row) if row else None


async def default_bank_account_id(db: AsyncSession, company_id: Any) -> Optional[str]:
    row = await fetch_default_bank_account(db, company_id)
    return str(row["id"]) if row else None


async def seller_state_code(db: AsyncSession, company_id: Any) -> str:
    """The seller's GST state: the company row, else the deployment setting.

    Two digits, zero-padded, so "8" in the environment and "08" in the row
    compare equal to the engine.
    """
    res = await db.execute(
        text("SELECT state_code FROM caratloop.companies WHERE id = CAST(:cid AS UUID)"),
        {"cid": str(company_id)},
    )
    code = res.scalar()
    code = (str(code).strip() if code else "") or (settings.COMPANY_STATE_CODE or "").strip()
    return code.zfill(2) if code else code


__all__ = [
    "COMPANY_COLUMNS", "EDITABLE_COLUMNS", "CompanyValidationError", "validate_company_patch",
    "bank_block", "public_company", "fetch_company", "fetch_default_bank_account",
    "default_bank_account_id", "seller_state_code", "normalise_gstin",
]
