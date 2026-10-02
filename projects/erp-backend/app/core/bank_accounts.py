"""Bank and cash accounts: the rules, without the database.

A bank account is a ledger account of account_type 'Bank' under the BANK
group (cash: 'Cash' under CASH). From migration 0012 the account row also
carries the bank's name, branch, account number, IFSC and UPI id, and one
account per company is flagged is_default_bank -- the one the tax invoice
prints and the storefront bridge settles into.

Everything here is pure so it can be tested without Postgres: the code
allocator, the detail validation and the default-flag plan. The endpoint in
app/api/v1/bank_accounts.py does the reading, locking and writing.
"""

from __future__ import annotations

import re
from decimal import Decimal
from typing import Any, Iterable, Mapping, Optional

from app.core.ledger import TOLERANCE

ACCOUNT_TYPE_BANK = "Bank"
ACCOUNT_TYPE_CASH = "Cash"
ACCOUNT_TYPES: frozenset[str] = frozenset({ACCOUNT_TYPE_BANK, ACCOUNT_TYPE_CASH})

# Code prefix and group per account type. The group codes are the ones
# fn_provision_company_accounts creates for every company.
CODE_PREFIX: dict[str, str] = {ACCOUNT_TYPE_BANK: "BNK", ACCOUNT_TYPE_CASH: "CSH"}
GROUP_CODE: dict[str, str] = {ACCOUNT_TYPE_BANK: "BANK", ACCOUNT_TYPE_CASH: "CASH"}

IFSC_RE = re.compile(r"^[A-Z]{4}0[A-Z0-9]{6}$")
ACCOUNT_NO_RE = re.compile(r"^[A-Za-z0-9]{6,34}$")
# VPA: handle@provider. Providers are letters; handles allow dots, hyphens
# and underscores (e.g. shop.name-01@okhdfcbank).
UPI_RE = re.compile(r"^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9]{1,30}$")


class BankAccountError(ValueError):
    def __init__(self, problems: list[str], status: int = 422):
        super().__init__("; ".join(problems))
        self.problems = problems
        self.status = status


def next_code(existing_codes: Iterable[str], account_type: str = ACCOUNT_TYPE_BANK) -> str:
    """The next free ``BNK-nnn`` (or ``CSH-nnn``) after the highest in use.

    Taken from the maximum, not from the count: a company that renamed or
    deactivated BNK-002 and has BNK-001 and BNK-003 must get BNK-004, not a
    collision with the inactive BNK-002. Codes of another shape (a hand-made
    'HDFC-CA') are ignored; they do not take part in the sequence.
    """
    prefix = CODE_PREFIX[account_type]
    pattern = re.compile(rf"^{prefix}-(\d+)$")
    highest = 0
    for code in existing_codes:
        m = pattern.match((code or "").strip().upper())
        if m:
            highest = max(highest, int(m.group(1)))
    return f"{prefix}-{highest + 1:03d}"


def _clean(value: Any, upper: bool = False) -> Optional[str]:
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    return s.upper() if upper else s


def validate_details(
    *,
    name: Any = ...,
    bank_name: Any = ...,
    bank_branch: Any = ...,
    bank_account_no: Any = ...,
    bank_ifsc: Any = ...,
    upi_id: Any = ...,
    description: Any = ...,
    account_type: str = ACCOUNT_TYPE_BANK,
) -> dict[str, Any]:
    """Cleaned column values for the fields that were given (``...`` = not given).

    Raises BankAccountError listing every problem. A cash account carries no
    bank details: any that are sent for one are refused rather than stored
    on a ledger that is not a bank.
    """
    problems: list[str] = []
    out: dict[str, Any] = {}

    if account_type not in ACCOUNT_TYPES:
        problems.append(f"account_type must be one of {sorted(ACCOUNT_TYPES)}.")

    if name is not ...:
        n = _clean(name)
        if n is None:
            problems.append("Name is required.")
        elif len(n) > 200:
            problems.append("Name must be at most 200 characters.")
        else:
            out["name"] = n

    if bank_name is not ...:
        out["bank_name"] = _clean(bank_name)
        if out["bank_name"] and len(out["bank_name"]) > 100:
            problems.append("Bank name must be at most 100 characters.")
    if bank_branch is not ...:
        out["bank_branch"] = _clean(bank_branch)
        if out["bank_branch"] and len(out["bank_branch"]) > 100:
            problems.append("Branch must be at most 100 characters.")
    if bank_account_no is not ...:
        out["bank_account_no"] = _clean(bank_account_no)
        if out["bank_account_no"] and not ACCOUNT_NO_RE.match(out["bank_account_no"]):
            problems.append("Account number must be 6 to 34 letters or digits.")
    if bank_ifsc is not ...:
        out["bank_ifsc"] = _clean(bank_ifsc, upper=True)
        if out["bank_ifsc"] and not IFSC_RE.match(out["bank_ifsc"]):
            problems.append("IFSC must be four letters, a zero and six alphanumerics (e.g. HDFC0001234).")
    if upi_id is not ...:
        out["upi_id"] = _clean(upi_id)
        if out["upi_id"] and not UPI_RE.match(out["upi_id"]):
            problems.append("UPI id must look like handle@bank.")
    if description is not ...:
        out["description"] = _clean(description)

    if account_type == ACCOUNT_TYPE_CASH:
        bank_fields = [k for k in ("bank_name", "bank_branch", "bank_account_no", "bank_ifsc", "upi_id") if out.get(k)]
        if bank_fields:
            problems.append("A cash account has no bank details: " + ", ".join(bank_fields) + ".")

    if problems:
        raise BankAccountError(problems)
    return out


def opening_balance_columns(opening_balance: Any) -> tuple[Decimal, str]:
    """(opening_balance, opening_balance_type) for accounts.

    The chart stores an unsigned figure and its side. A bank balance is a
    debit; a negative figure means an overdraft, which is a credit opening.
    """
    amount = Decimal(str(opening_balance or 0)).quantize(Decimal("0.01"))
    if amount < 0:
        return -amount, "C"
    return amount, "D"


def plan_default_change(accounts: Iterable[Mapping[str, Any]], target_id: Any) -> tuple[list[str], str]:
    """(ids whose flag to clear, id to set) for making ``target_id`` the default.

    ``accounts`` is every Bank/Cash account of the company. The target must
    exist, be active and be a Bank account: the invoice prints remittance
    details, which a cash box has none of. Exactly one flag is set afterwards,
    which is what the partial unique index on (company_id) WHERE
    is_default_bank enforces -- this plan clears first so the insert of the
    new flag never collides with the old one.
    """
    target = None
    clear: list[str] = []
    for a in accounts:
        if str(a["id"]) == str(target_id):
            target = a
        elif a.get("is_default_bank"):
            clear.append(str(a["id"]))
    if target is None:
        raise BankAccountError(["Bank account not found."], status=404)
    if not target.get("is_active", True):
        raise BankAccountError(["An inactive account cannot be the default bank."], status=409)
    if target.get("account_type") != ACCOUNT_TYPE_BANK:
        raise BankAccountError(["Only a bank account can be the default for remittances."], status=409)
    return clear, str(target["id"])


def check_deactivation(account: Mapping[str, Any], balance_signed: Decimal) -> None:
    """Refuse deactivating an account that still holds money or is the default.

    A ledger with a balance is part of the balance sheet: hiding it from the
    chart would make the trial balance disagree with the ledgers, which is
    exactly what is_active = FALSE does to the listing queries. The default
    bank is what the invoice prints; make another account the default first.
    """
    problems: list[str] = []
    if account.get("is_default_bank"):
        problems.append("This is the default bank account; make another account the default before deactivating it.")
    if abs(Decimal(balance_signed)) > TOLERANCE:
        problems.append(
            f"The account still has a balance of {abs(Decimal(balance_signed)):,.2f}; "
            "transfer it out before deactivating."
        )
    if problems:
        raise BankAccountError(problems, status=409)


__all__ = [
    "ACCOUNT_TYPE_BANK", "ACCOUNT_TYPE_CASH", "ACCOUNT_TYPES", "CODE_PREFIX", "GROUP_CODE",
    "BankAccountError", "next_code", "validate_details", "opening_balance_columns",
    "plan_default_change", "check_deactivation",
]
