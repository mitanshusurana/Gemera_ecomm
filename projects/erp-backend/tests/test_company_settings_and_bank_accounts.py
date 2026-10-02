"""Company settings, bank & cash accounts, and the runtime configuration view.

Offline: migration 0012 must parse and carry the agreed columns and
constraints; the company patch rules (GSTIN -> state and PAN) and the bank
account rules (code allocation, one default, no deactivating a funded
account) are pure functions; the runtime view must never carry a secret.
"""

from __future__ import annotations

import io
import json
import re
from decimal import Decimal
from pathlib import Path

import pytest
from pglast import parse_sql

from app.core import bank_accounts as ba
from app.core.company import (
    EDITABLE_COLUMNS,
    CompanyValidationError,
    bank_block,
    validate_company_patch,
)
from app.core.runtime_config import build_runtime_view, secret_presence
from app.tax.gstin import checksum_ok

ROOT = Path(__file__).resolve().parents[1]
SQL_FILE = ROOT / "migrations" / "sql" / "0012_bank_accounts_company_settings.sql"
PY_FILE = ROOT / "migrations" / "versions" / "0012_bank_accounts_company_settings.py"

_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def _valid_gstin(state: str, pan: str, entity: str = "1") -> str:
    """A GSTIN with a correct check digit for the given state and PAN."""
    prefix = f"{state}{pan}{entity}Z"
    return next(prefix + c for c in _ALPHABET if checksum_ok(prefix + c))


def _sql() -> str:
    return io.open(SQL_FILE, encoding="utf-8").read()


# ───────────────────────────────────────────────── migration 0012


def test_sql_twin_exists_and_parses():
    assert SQL_FILE.exists()
    assert len(parse_sql(_sql())) >= 6


def test_revision_chain():
    src = io.open(PY_FILE, encoding="utf-8").read()
    assert re.search(r'^revision\s*=\s*"0012"', src, re.M)
    assert re.search(r'^down_revision\s*=\s*"0011"', src, re.M)
    assert "0012_bank_accounts_company_settings.sql" in src


def test_accounts_gain_the_bank_columns_and_the_default_flag():
    sql = _sql()
    for col, typ in (
        ("bank_name", "VARCHAR(100)"), ("bank_branch", "VARCHAR(100)"),
        ("bank_account_no", "VARCHAR(34)"), ("bank_ifsc", "VARCHAR(11)"),
        ("upi_id", "VARCHAR(100)"),
    ):
        assert re.search(rf"ADD COLUMN IF NOT EXISTS {col}\s+{re.escape(typ)}", sql), col
    assert re.search(r"ADD COLUMN IF NOT EXISTS is_default_bank\s+BOOLEAN NOT NULL DEFAULT FALSE", sql)
    assert re.search(
        r"CREATE UNIQUE INDEX IF NOT EXISTS uq_accounts_default_bank\s+ON caratloop\.accounts\(company_id\) WHERE is_default_bank",
        sql,
    )


def test_account_ifsc_check_is_the_same_shape_as_the_company_one():
    sql = _sql()
    company_sql = io.open(ROOT / "migrations" / "sql" / "0004_payment_tracking.sql", encoding="utf-8").read()
    pattern = r"\^\[A-Z\]\{4\}0\[A-Z0-9\]\{6\}\$"
    assert re.search(rf"chk_account_ifsc\s+CHECK \(bank_ifsc IS NULL OR bank_ifsc ~ '{pattern}'\)", sql)
    assert re.search(rf"chk_company_ifsc\s+CHECK \(bank_ifsc IS NULL OR bank_ifsc ~ '{pattern}'\)", company_sql)
    # The pure validator and the CHECK agree.
    assert ba.IFSC_RE.match("HDFC0001234") and not ba.IFSC_RE.match("HDFC1001234")


def test_existing_companies_get_a_default_bank_without_renaming_anything():
    sql = _sql()
    backfill = sql[: sql.index("CREATE OR REPLACE FUNCTION")]
    assert "SET is_default_bank = TRUE" in backfill
    assert "account_type = 'Bank' AND is_active = TRUE" in backfill
    assert "ORDER BY company_id, code" in backfill
    assert "SET name" not in backfill


def test_provisioning_function_drops_the_named_banks_and_keeps_the_rest_of_the_chart():
    old = io.open(ROOT / "migrations" / "sql" / "0007_einvoice_tds_tcs.sql", encoding="utf-8").read()
    new = _sql()
    old_fn = old[old.index("CREATE OR REPLACE FUNCTION caratloop.fn_provision_company_accounts()"):]
    new_fn = new[new.index("CREATE OR REPLACE FUNCTION caratloop.fn_provision_company_accounts()"):]
    legacy_codes = set(re.findall(r"\('([A-Z]{3,4}-\d{3}[A-Z]?)',", old_fn))
    assert len(legacy_codes) >= 50
    expected = legacy_codes - {"BNK-002"}
    missing = sorted(c for c in expected if f"('{c}'," not in new_fn)
    assert not missing, f"accounts dropped from the provisioning function: {missing}"
    assert "('BNK-002'," not in new_fn
    assert "HDFC" not in new_fn and "SBI" not in new_fn
    assert "('BNK-001', 'Bank Account', 'BANK', 'D', 'Bank', TRUE)" in new_fn
    assert "('CSH-001', 'Cash in Hand', 'CASH', 'D', 'Cash', FALSE)" in new_fn
    assert new_fn.count("('DUTIES_TAXES', 'Duties & Taxes', 'Liabilities', 'LIAB')") == 2
    assert "is_default_bank" in new_fn


# ───────────────────────────────────────────────── company patch rules

RAJASTHAN_PAN = "AAACJ1234E"
MAHARASHTRA_PAN = "AAPFU0939F"
COMPANY = {
    "id": "c1", "name": "Caratloop", "legal_name": "Caratloop LLP", "gstin": None, "pan": None,
    "state_code": "08", "state_name": "Rajasthan", "pincode": "302001", "bank_ifsc": None,
    "bank_account_no": None,
}


def test_gstin_drives_state_and_fills_a_missing_pan():
    g = _valid_gstin("27", MAHARASHTRA_PAN)
    out = validate_company_patch(COMPANY, {"gstin": g.lower()})
    assert out["gstin"] == g
    assert out["state_code"] == "27"
    assert out["state_name"] == "Maharashtra"
    assert out["pan"] == MAHARASHTRA_PAN


def test_gstin_with_a_wrong_check_digit_is_refused():
    g = _valid_gstin("27", MAHARASHTRA_PAN)
    bad = g[:-1] + ("A" if g[-1] != "A" else "B")
    with pytest.raises(CompanyValidationError) as e:
        validate_company_patch(COMPANY, {"gstin": bad})
    assert "check digit" in str(e.value)


@pytest.mark.parametrize("value", ["NA", "27AAPFU0939F1Z", "9800000001", "27aapfu0939f1zvx"])
def test_a_gstin_that_is_not_shaped_is_refused(value):
    with pytest.raises(CompanyValidationError):
        validate_company_patch(COMPANY, {"gstin": value})


def test_pan_on_record_that_disagrees_with_the_new_gstin_is_refused():
    current = {**COMPANY, "pan": RAJASTHAN_PAN}
    g = _valid_gstin("27", MAHARASHTRA_PAN)
    with pytest.raises(CompanyValidationError) as e:
        validate_company_patch(current, {"gstin": g})
    assert "send the matching PAN" in str(e.value)
    # Sending the matching PAN alongside is accepted and the state follows.
    out = validate_company_patch(current, {"gstin": g, "pan": MAHARASHTRA_PAN})
    assert out["pan"] == MAHARASHTRA_PAN and out["state_code"] == "27"


def test_pan_sent_with_the_gstin_must_match_it():
    g = _valid_gstin("08", RAJASTHAN_PAN)
    with pytest.raises(CompanyValidationError) as e:
        validate_company_patch(COMPANY, {"gstin": g, "pan": MAHARASHTRA_PAN})
    assert "does not match the PAN inside the GSTIN" in str(e.value)


def test_pan_alone_must_agree_with_the_gstin_on_record():
    current = {**COMPANY, "gstin": _valid_gstin("08", RAJASTHAN_PAN), "pan": RAJASTHAN_PAN}
    with pytest.raises(CompanyValidationError):
        validate_company_patch(current, {"pan": MAHARASHTRA_PAN})
    with pytest.raises(CompanyValidationError):
        validate_company_patch(current, {"pan": "not-a-pan"})


def test_state_code_can_be_set_only_when_no_gstin_decides_it():
    out = validate_company_patch(COMPANY, {"state_code": "24"})
    assert out == {"state_code": "24", "state_name": "Gujarat"}
    with pytest.raises(CompanyValidationError):
        validate_company_patch(COMPANY, {"state_code": "99x"})
    with_gstin = {**COMPANY, "gstin": _valid_gstin("08", RAJASTHAN_PAN), "pan": RAJASTHAN_PAN}
    with pytest.raises(CompanyValidationError) as e:
        validate_company_patch(with_gstin, {"state_code": "27"})
    assert "change the GSTIN" in str(e.value)
    # Agreeing with the GSTIN is a no-op, not an error.
    assert validate_company_patch(with_gstin, {"state_code": "08"})["state_code"] == "08"


def test_explicit_state_that_contradicts_a_new_gstin_is_refused():
    g = _valid_gstin("27", MAHARASHTRA_PAN)
    with pytest.raises(CompanyValidationError):
        validate_company_patch(COMPANY, {"gstin": g, "state_code": "08"})


def test_an_address_only_patch_is_not_held_to_an_older_inconsistency():
    inconsistent = {**COMPANY, "gstin": _valid_gstin("27", MAHARASHTRA_PAN), "pan": RAJASTHAN_PAN}
    out = validate_company_patch(inconsistent, {"address_line1": " 12 Johari Bazaar ", "city": "Jaipur"})
    assert out == {"address_line1": "12 Johari Bazaar", "city": "Jaipur"}


def test_a_gstin_resent_unchanged_is_not_revalidated():
    """A seeded placeholder whose check digit does not compute must not block
    editing the address when a client re-sends the whole form."""
    placeholder = {**COMPANY, "gstin": "08AAAAA0000A1Z5", "pan": None}
    assert checksum_ok(placeholder["gstin"]) is False
    out = validate_company_patch(placeholder, {"gstin": "08AAAAA0000A1Z5", "city": "Jaipur"})
    assert out == {"city": "Jaipur"}
    # Changing it to another bad number is still refused.
    with pytest.raises(CompanyValidationError):
        validate_company_patch(placeholder, {"gstin": "08AAAAA0000A1Z6"})


def test_clearing_the_gstin_is_allowed_and_leaves_the_state():
    current = {**COMPANY, "gstin": _valid_gstin("08", RAJASTHAN_PAN), "pan": RAJASTHAN_PAN}
    out = validate_company_patch(current, {"gstin": None})
    assert out == {"gstin": None}


@pytest.mark.parametrize("field,value,fragment", [
    ("pincode", "30200", "six digits"),
    ("pincode", "3020011", "six digits"),
    ("bank_ifsc", "HDFC1001234", "IFSC"),
    ("bank_ifsc", "HDF0001234", "IFSC"),
    ("legal_name", "   ", "cannot be blank"),
    ("name", "", "cannot be blank"),
    ("email", "owner-at-example.com", "Email"),
    ("fiscal_year_start", 13, "1 to 12"),
    ("fiscal_year_start", 0, "1 to 12"),
    ("base_currency", "rupees", "three-letter"),
    ("tan", "JPR1234A", "TAN"),
    ("cin", "12345", "CIN"),
    ("bank_account_no", "12 34", "Bank account number"),
])
def test_field_rules(field, value, fragment):
    with pytest.raises(CompanyValidationError) as e:
        validate_company_patch(COMPANY, {field: value})
    assert fragment in str(e.value)


def test_identifiers_are_upper_cased_and_blanks_become_null():
    out = validate_company_patch(COMPANY, {"bank_ifsc": " hdfc0001234 ", "website": "  ", "fiscal_year_start": 4, "base_currency": "inr"})
    assert out == {"bank_ifsc": "HDFC0001234", "website": None, "fiscal_year_start": 4, "base_currency": "INR"}


def test_unknown_or_protected_columns_are_refused():
    for field in ("is_active", "created_at", "id", "state_name", "nonsense"):
        with pytest.raises(CompanyValidationError) as e:
            validate_company_patch(COMPANY, {field: "x"})
        assert "Not editable" in str(e.value)


def test_the_patch_statement_covers_every_editable_column():
    """The static UPDATE in app/api/v1/company.py must name every column the
    validator can emit, or a field would validate and then silently not save."""
    from app.api.v1.company import _WRITABLE

    assert set(_WRITABLE) == EDITABLE_COLUMNS | {"state_name"}
    src = io.open(ROOT / "app" / "api" / "v1" / "company.py", encoding="utf-8").read()
    for col in _WRITABLE:
        assert re.search(rf"\b{col}\s*=\s*CASE WHEN :set_{col} THEN :{col} ELSE {col} END", src), col


# ───────────────────────────────────────────────── bank block on documents


def test_default_account_wins_over_the_company_columns():
    acct = {"id": "a1", "name": "HDFC Current", "bank_name": "HDFC Bank", "bank_branch": "MI Road",
            "bank_account_no": "50200012345678", "bank_ifsc": "HDFC0001234", "upi_id": "caratloop@hdfcbank"}
    company = {"bank_name": "SBI", "bank_account_no": "11112222", "bank_ifsc": "SBIN0001234"}
    block = bank_block(acct, company)
    assert block["account_no"] == "50200012345678" and block["source"] == "account"
    assert block["upi_id"] == "caratloop@hdfcbank" and block["account_id"] == "a1"


def test_company_columns_are_the_fallback_and_nothing_is_invented():
    company = {"bank_name": "SBI", "bank_branch": None, "bank_account_no": "11112222", "bank_ifsc": "SBIN0001234"}
    incomplete = {"id": "a1", "name": "Bank Account", "bank_account_no": None, "bank_ifsc": None}
    block = bank_block(incomplete, company)
    assert block["source"] == "company" and block["ifsc"] == "SBIN0001234" and block["upi_id"] is None
    assert bank_block(None, {"bank_account_no": None, "bank_ifsc": None}) is None
    assert bank_block(incomplete, {}) is None


# ───────────────────────────────────────────────── bank account rules


def test_next_code_starts_at_001_and_follows_the_maximum_not_the_count():
    assert ba.next_code([]) == "BNK-001"
    assert ba.next_code(["BNK-001", "BNK-002"]) == "BNK-003"
    # BNK-002 was deactivated or renamed away: still no collision.
    assert ba.next_code(["BNK-001", "BNK-003"]) == "BNK-004"
    # Other codes of the chart, and hand-made bank codes, do not take part.
    assert ba.next_code(["CSH-001", "HDFC-CA", "bnk-007", "BNK-X"]) == "BNK-008"
    assert ba.next_code(["BNK-001"], ba.ACCOUNT_TYPE_CASH) == "CSH-001"
    assert ba.next_code(["CSH-001", "CSH-002"], ba.ACCOUNT_TYPE_CASH) == "CSH-003"


def test_plan_default_clears_the_previous_flag_and_sets_exactly_one():
    accounts = [
        {"id": "a", "account_type": "Bank", "is_active": True, "is_default_bank": True},
        {"id": "b", "account_type": "Bank", "is_active": True, "is_default_bank": False},
        {"id": "c", "account_type": "Cash", "is_active": True, "is_default_bank": False},
        {"id": "d", "account_type": "Bank", "is_active": False, "is_default_bank": False},
    ]
    assert ba.plan_default_change(accounts, "b") == (["a"], "b")
    # Already the default: nothing to clear, still one flag.
    assert ba.plan_default_change(accounts, "a") == ([], "a")
    with pytest.raises(ba.BankAccountError) as e:
        ba.plan_default_change(accounts, "c")
    assert e.value.status == 409 and "Only a bank account" in str(e.value)
    with pytest.raises(ba.BankAccountError) as e:
        ba.plan_default_change(accounts, "d")
    assert "inactive" in str(e.value)
    with pytest.raises(ba.BankAccountError) as e:
        ba.plan_default_change(accounts, "zzz")
    assert e.value.status == 404


def test_deactivation_is_refused_for_the_default_or_a_funded_account():
    with pytest.raises(ba.BankAccountError) as e:
        ba.check_deactivation({"is_default_bank": True}, Decimal("0"))
    assert "default bank" in str(e.value) and e.value.status == 409
    with pytest.raises(ba.BankAccountError) as e:
        ba.check_deactivation({"is_default_bank": False}, Decimal("-1500.25"))
    assert "1,500.25" in str(e.value)
    ba.check_deactivation({"is_default_bank": False}, Decimal("0.004"))  # within tolerance


def test_details_are_cleaned_and_a_cash_box_has_no_bank_details():
    out = ba.validate_details(name=" HDFC Current A/c ", bank_ifsc="hdfc0001234", bank_account_no="50200012345678",
                              upi_id="caratloop@hdfcbank", bank_branch="")
    assert out == {"name": "HDFC Current A/c", "bank_ifsc": "HDFC0001234", "bank_account_no": "50200012345678",
                   "upi_id": "caratloop@hdfcbank", "bank_branch": None}
    with pytest.raises(ba.BankAccountError) as e:
        ba.validate_details(name="Cash", bank_ifsc="HDFC0001234", account_type=ba.ACCOUNT_TYPE_CASH)
    assert "cash account has no bank details" in str(e.value)
    with pytest.raises(ba.BankAccountError):
        ba.validate_details(name="x", upi_id="not a vpa")
    with pytest.raises(ba.BankAccountError):
        ba.validate_details(name="x", bank_ifsc="HDFC1001234")
    with pytest.raises(ba.BankAccountError):
        ba.validate_details(name="   ")
    with pytest.raises(ba.BankAccountError):
        ba.validate_details(name="x", account_type="Debtor")
    # Not given is distinct from cleared.
    assert ba.validate_details(bank_name=None) == {"bank_name": None}
    assert ba.validate_details() == {}


def test_opening_balance_is_unsigned_with_its_side():
    assert ba.opening_balance_columns(None) == (Decimal("0.00"), "D")
    assert ba.opening_balance_columns("125000.5") == (Decimal("125000.50"), "D")
    assert ba.opening_balance_columns(Decimal("-2500")) == (Decimal("2500.00"), "C")


# ───────────────────────────────────────────────── runtime view

SECRET_NAME = re.compile(r"\b[A-Z][A-Z0-9_]*(SECRET|PASSWORD|KEY|TOKEN)[A-Z0-9_]*\b")


def test_the_runtime_handler_names_no_secret_setting():
    src = io.open(ROOT / "app" / "api" / "v1" / "settings_view.py", encoding="utf-8").read()
    assert not SECRET_NAME.findall(src), SECRET_NAME.findall(src)
    assert "settings." in src  # it does read settings, just not those


def test_the_runtime_view_reduces_every_secret_to_a_boolean():
    from app.core.config import Settings

    sentinel = "SENTINEL-DO-NOT-LEAK"
    s = Settings(
        DATABASE_URL="postgresql+asyncpg://u:" + sentinel + "@h/db", JWT_SECRET=sentinel * 3,
        ADMIN_PASSWORD=sentinel, R2_ACCESS_KEY=sentinel, R2_SECRET_KEY=sentinel, R2_BUCKET_NAME="docs",
        ECOMMERCE_API_KEY=sentinel, EINVOICE_PROVIDER="nic", EINVOICE_BASE_URL="https://gsp.example",
        EINVOICE_CLIENT_ID=sentinel, EINVOICE_CLIENT_SECRET=sentinel, EINVOICE_USERNAME=sentinel,
        EINVOICE_PASSWORD=sentinel, EINVOICE_GSTIN="08AAACJ1234E1ZP", TDS_194Q_ENABLED=True,
        ECOMMERCE_SETTLEMENT_ACCOUNT_CODE="",
    )
    view = build_runtime_view(
        s, company_state_code="27", company_state_name="Maharashtra",
        settlement_account={"id": "a1", "code": "BNK-001", "name": "Bank Account", "from": "default_bank"},
    )
    serialised = json.dumps(view, default=str)
    assert sentinel not in serialised
    assert view["einvoice"] == {
        "provider": "nic", "enabled": True, "base_url_present": True,
        "client_credentials_present": True, "user_credentials_present": True,
        "gstin_present": True, "threshold_inr": 0,
    }
    assert view["ecommerce_bridge"]["enabled"] is True
    assert view["ecommerce_bridge"]["settlement_account_code"] is None
    assert view["ecommerce_bridge"]["settlement_account"]["from"] == "default_bank"
    assert view["seller_state"] == {
        "in_use": "27", "in_use_name": "Maharashtra", "from": "company",
        "setting_default": "08", "setting_default_name": "Rajasthan",
    }
    assert view["tds_194q"]["enabled"] is True and view["tcs_206c1h"]["enabled"] is False
    assert view["document_storage"]["r2_configured"] is True
    # Only booleans come out of the presence map.
    assert set(secret_presence(s).values()) == {True}


def test_the_runtime_view_falls_back_to_the_setting_when_the_row_has_no_state():
    from app.core.config import settings

    view = build_runtime_view(settings, company_state_code=None, company_state_name=None, settlement_account=None)
    assert view["seller_state"]["from"] == "setting"
    assert view["seller_state"]["in_use"] == settings.COMPANY_STATE_CODE.zfill(2)
    assert view["einvoice"]["enabled"] is False
    assert view["ecommerce_bridge"]["settlement_account"] is None


# ───────────────────────────────────────────────── wiring


@pytest.mark.parametrize("module", ["sales.py", "integrations.py", "vouchers.py", "purchases.py"])
def test_the_seller_state_comes_from_the_company_row_not_the_setting(module):
    src = io.open(ROOT / "app" / "api" / "v1" / module, encoding="utf-8").read()
    assert "settings.COMPANY_STATE_CODE" not in src, f"{module} still taxes against the deployment setting"
    assert "company_seller_state(db, company_id)" in src


def test_the_bridge_settles_into_the_default_bank_when_the_setting_names_none():
    src = io.open(ROOT / "app" / "api" / "v1" / "integrations.py", encoding="utf-8").read()
    assert "_account_id(db, company_id, settings.ECOMMERCE_SETTLEMENT_ACCOUNT_CODE)" not in src
    assert src.count("await _settlement_account_id(db, company_id)") == 3
    assert "default_bank_account_id(db, company_id)" in src


def test_documents_read_the_company_row_and_the_default_bank():
    for module in ("auth.py", "sales.py"):
        src = io.open(ROOT / "app" / "api" / "v1" / module, encoding="utf-8").read()
        assert "fetch_default_bank_account(db" in src, module
        assert "public_company(" in src, module


def test_the_new_routers_are_mounted():
    src = io.open(ROOT / "app" / "api" / "v1" / "router.py", encoding="utf-8").read()
    assert "company.router" in src
    assert 'bank_accounts.router, prefix="/accounting"' in src
    assert "settings_view.router" in src
    from app.main import app

    # The included router is resolved lazily; the OpenAPI document forces it.
    paths = set(app.openapi()["paths"])
    for p in ("/company", "/accounting/bank-accounts", "/accounting/bank-accounts/{account_id}",
              "/accounting/bank-accounts/{account_id}/make-default", "/settings/runtime"):
        assert "/api/v1" + p in paths, p
