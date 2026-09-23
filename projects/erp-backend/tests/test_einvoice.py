"""e-Invoice: the payload builder, the fake provider, migration 0007, vocabularies.

Nothing here touches the network or a database. The builder is exercised on a
fixture shaped like the rows the endpoint loads; the fake provider stands in
for the GSP; the migration's SQL is parsed by PostgreSQL's own parser.
"""

from __future__ import annotations

import io
import json
import re
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import pytest
from pglast import parse_sql

from app.einvoice.fake_provider import FakeProvider, deterministic_irn
from app.einvoice.provider import IRN_CANCEL_REASONS, ProviderError, TransportDetails
from app.einvoice.schema import (
    EInvoiceValidationError,
    build_einvoice_payload,
    supply_type_for,
    validate_only,
)
from app.tax.job_work import JOB_WORK_SAC

ROOT = Path(__file__).resolve().parents[1]
SQL_FILE = ROOT / "migrations" / "sql" / "0007_einvoice_tds_tcs.sql"
VERSION_FILE = ROOT / "migrations" / "versions" / "0007_einvoice_tds_tcs.py"


# ─── Fixture ─────────────────────────────────────────────────────────────────

def company():
    return {
        "gstin": "08AAACC1234F1Z9", "legal_name": "Caratloop Manufacturing LLP", "trade_name": "Caratloop",
        "address_line1": "Plot 12, Sitapura Industrial Area", "address_line2": "Tonk Road", "city": "Jaipur",
        "state_code": "08", "state_name": "Rajasthan", "pincode": "302022",
        "phone": "0141-2771234", "email": "accounts@caratloop.example",
    }


def party(**over):
    base = {
        "gstin": "27AABCU9603R1ZM", "name": "Ratan Gems Pvt Ltd", "trade_name": "Ratan Gems",
        "address_line1": "Opera House", "address_line2": None, "city": "Mumbai",
        "state_code": "27", "pincode": "400004", "phone": "9820012345", "email": "buy@ratangems.example",
        "gst_reg_type": "Regular", "pan": "AABCU9603R",
    }
    base.update(over)
    return base


def invoice(**over):
    base = {
        "invoice_no": "CL/2026-27/00042", "invoice_date": date(2026, 9, 21), "place_of_supply": "27",
        "is_inter_state": True, "customer_gstin": "27AABCU9603R1ZM",
        "subtotal_other_charges": Decimal("0"), "round_off": Decimal("0"),
        # 100000 material @3% IGST = 3000; 10000 making @5% IGST = 500
        "total_gst": Decimal("3500.00"), "grand_total": Decimal("113500.00"), "tcs_amount": Decimal("0"),
    }
    base.update(over)
    return base


def lines():
    return [{
        "sequence_no": 1, "hsn_sac_code": "71131910", "description": "22K gold bangle pair",
        "quantity": Decimal("2"), "uom": "pcs",
        "material_value": Decimal("100000"), "making_charges": Decimal("10000"), "other_charges": Decimal("0"),
        "discount_pct": Decimal("0"), "taxable_material": Decimal("100000"), "taxable_making": Decimal("10000"),
        "material_gst_rate": Decimal("3.00"), "making_gst_rate": Decimal("5.00"),
        "igst_material": Decimal("3000"), "igst_making": Decimal("500"),
        "cgst_material": Decimal("0"), "sgst_material": Decimal("0"), "cgst_making": Decimal("0"), "sgst_making": Decimal("0"),
        "line_total": Decimal("113500"),
    }]


# ─── Builder ─────────────────────────────────────────────────────────────────

def test_payload_has_the_schema_1_1_blocks():
    p = build_einvoice_payload(company(), invoice(), lines(), party())
    assert p["Version"] == "1.1"
    assert set(p) == {"Version", "TranDtls", "DocDtls", "SellerDtls", "BuyerDtls", "ItemList", "ValDtls"}
    assert p["TranDtls"] == {"TaxSch": "GST", "SupTyp": "B2B", "RegRev": "N", "IgstOnIntra": "N"}
    assert p["DocDtls"] == {"Typ": "INV", "No": "CL/2026-27/00042", "Dt": "21/09/2026"}


def test_seller_comes_from_the_company_master_and_buyer_from_the_party():
    p = build_einvoice_payload(company(), invoice(), lines(), party())
    s, b = p["SellerDtls"], p["BuyerDtls"]
    assert s["Gstin"] == "08AAACC1234F1Z9" and s["LglNm"] == "Caratloop Manufacturing LLP"
    assert s["Pin"] == 302022 and s["Stcd"] == "08" and s["Loc"] == "Jaipur"
    assert s["Ph"] == "01412771234"
    assert b["Gstin"] == "27AABCU9603R1ZM" and b["Pos"] == "27" and b["Pin"] == 400004
    assert "Addr2" not in b  # None is dropped, not sent as null


def test_material_and_making_are_separate_items_at_their_own_rates():
    p = build_einvoice_payload(company(), invoice(), lines(), party())
    items = p["ItemList"]
    assert [i["SlNo"] for i in items] == ["1", "2"]
    goods, service = items
    assert goods["IsServc"] == "N" and goods["HsnCd"] == "71131910" and goods["Unit"] == "PCS"
    assert goods["Qty"] == 2.0 and goods["UnitPrice"] == 50000.0
    assert goods["AssAmt"] == 100000.0 and goods["GstRt"] == 3.0 and goods["IgstAmt"] == 3000.0
    assert goods["TotItemVal"] == 103000.0
    assert service["IsServc"] == "Y" and service["HsnCd"] == JOB_WORK_SAC
    assert service["AssAmt"] == 10000.0 and service["GstRt"] == 5.0 and service["IgstAmt"] == 500.0
    assert service["TotItemVal"] == 10500.0


def test_zero_making_charges_produce_a_single_item():
    ls = lines()
    ls[0].update(making_charges=Decimal("0"), taxable_making=Decimal("0"), igst_making=Decimal("0"))
    inv = invoice(total_gst=Decimal("3000"), grand_total=Decimal("103000"))
    p = build_einvoice_payload(company(), inv, ls, party())
    assert len(p["ItemList"]) == 1


def test_value_details_total_the_items_and_equal_the_invoice():
    p = build_einvoice_payload(company(), invoice(), lines(), party())
    v = p["ValDtls"]
    assert v["AssVal"] == 110000.0
    assert v["IgstVal"] == 3500.0 and v["CgstVal"] == 0.0 and v["SgstVal"] == 0.0
    assert v["TotInvVal"] == 113500.0


def test_tcs_travels_in_other_charges():
    inv = invoice(tcs_amount=Decimal("113.50"), grand_total=Decimal("113613.50"))
    p = build_einvoice_payload(company(), inv, lines(), party())
    assert p["ValDtls"]["OthChrg"] == 113.5
    assert p["ValDtls"]["TotInvVal"] == 113613.5


def test_intra_state_lines_carry_cgst_sgst():
    ls = lines()
    ls[0].update(igst_material=Decimal("0"), igst_making=Decimal("0"),
                 cgst_material=Decimal("1500"), sgst_material=Decimal("1500"),
                 cgst_making=Decimal("250"), sgst_making=Decimal("250"))
    inv = invoice(is_inter_state=False, place_of_supply="08", customer_gstin="08AABCU9603R1ZX")
    p = build_einvoice_payload(company(), inv, ls, party(gstin="08AABCU9603R1ZX", state_code="08", pincode="302001", city="Jaipur"))
    assert p["ValDtls"]["CgstVal"] == 1750.0 and p["ValDtls"]["SgstVal"] == 1750.0 and p["ValDtls"]["IgstVal"] == 0.0


def test_discounted_line_reports_gross_discount_and_assessable():
    ls = lines()
    ls[0].update(discount_pct=Decimal("10"), taxable_material=Decimal("90000"), taxable_making=Decimal("9000"),
                 igst_material=Decimal("2700"), igst_making=Decimal("450"))
    inv = invoice(total_gst=Decimal("3150"), grand_total=Decimal("102150"))
    p = build_einvoice_payload(company(), inv, ls, party())
    goods = p["ItemList"][0]
    assert goods["TotAmt"] == 100000.0 and goods["Discount"] == 10000.0 and goods["AssAmt"] == 90000.0


def test_payload_is_json_serialisable():
    p = build_einvoice_payload(company(), invoice(), lines(), party())
    json.dumps(p)


def test_supply_type_follows_the_buyer_registration():
    assert supply_type_for(party()) == "B2B"
    assert supply_type_for(party(gst_reg_type="SEZ")) == "SEZWP"
    assert supply_type_for(party(gst_reg_type="Export")) == "EXPWP"


# ─── Validation ──────────────────────────────────────────────────────────────

def test_b2c_invoice_is_refused_with_a_clear_message():
    with pytest.raises(EInvoiceValidationError) as exc:
        build_einvoice_payload(company(), invoice(customer_gstin=None), lines(), party(gstin=None))
    assert len(exc.value.errors) == 1
    assert "B2C" in exc.value.errors[0]
    assert "Rule 48(4)" in exc.value.errors[0]


def test_unregistered_marker_is_b2c_too():
    errors = validate_only(company(), invoice(customer_gstin="Unregistered"), lines(), party(gstin="Unregistered"))
    assert errors and "B2C" in errors[0]


def test_seller_defects_are_all_reported_together():
    c = company()
    c.update(gstin=None, address_line1="", pincode="30", state_code=None)
    errors = validate_only(c, invoice(), lines(), party())
    joined = " | ".join(errors)
    assert "Seller GSTIN" in joined
    assert "Seller address line 1" in joined
    assert "Seller pincode" in joined
    assert "Seller state code" in joined


def test_buyer_address_and_pincode_are_required_for_b2b():
    errors = validate_only(company(), invoice(), lines(), party(address_line1=None, pincode=None))
    assert any("Buyer address" in e for e in errors)
    assert any("Buyer pincode" in e for e in errors)


def test_gstin_state_must_match_the_recorded_state():
    errors = validate_only(company(), invoice(), lines(), party(state_code="08"))
    assert any("does not match" in e for e in errors)


def test_hsn_must_be_four_to_eight_digits():
    ls = lines()
    ls[0]["hsn_sac_code"] = "71"
    errors = validate_only(company(), invoice(), ls, party())
    assert any("HSN" in e for e in errors)


def test_a_total_that_disagrees_with_its_lines_is_refused():
    errors = validate_only(company(), invoice(grand_total=Decimal("99999")), lines(), party())
    assert any("does not agree" in e for e in errors)


def test_invoice_number_longer_than_sixteen_is_refused():
    errors = validate_only(company(), invoice(invoice_no="CL/2026-27/0000001"), lines(), party())
    assert any("invoice number" in e for e in errors)


def test_no_lines_is_refused():
    errors = validate_only(company(), invoice(grand_total=Decimal("0"), total_gst=Decimal("0")), [], party())
    assert any("no lines" in e for e in errors)


# ─── Fake provider ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_fake_provider_round_trip_is_deterministic():
    p = build_einvoice_payload(company(), invoice(), lines(), party())
    fixed = datetime(2026, 9, 21, 10, 0, tzinfo=timezone(timedelta(hours=5, minutes=30)))
    prov = FakeProvider(now=fixed)
    await prov.authenticate()
    a = await prov.generate_irn(p)
    b = await FakeProvider(now=fixed).generate_irn(p)
    assert a.irn == b.irn == deterministic_irn(p)
    assert len(a.irn) == 64 and re.fullmatch(r"[0-9a-f]{64}", a.irn)
    assert len(a.ack_no) == 15 and a.ack_no.isdigit()
    assert a.ack_date == fixed and a.status == "ACT"
    qr = json.loads(a.signed_qr)
    assert qr["Irn"] == a.irn and qr["DocNo"] == "CL/2026-27/00042" and qr["TotInvVal"] == 113500.0
    assert qr["SellerGstin"] == "08AAACC1234F1Z9" and qr["BuyerGstin"] == "27AABCU9603R1ZM"

    cancel = await prov.cancel_irn(a.irn, "2", "Data entry mistake")
    assert cancel.irn == a.irn

    ewb = await prov.generate_ewaybill_by_irn(a.irn, TransportDetails(transport_mode="1", vehicle_no="RJ14 GA 1234", distance_km=450))
    assert len(ewb.ewb_no) == 12 and ewb.ewb_no.isdigit()
    # Rule 138(10): 450 km is three days at one day per 200 km or part.
    assert ewb.valid_upto == fixed + timedelta(days=3)

    ewb_cancel = await prov.cancel_ewaybill(ewb.ewb_no, "2")
    assert ewb_cancel.ewb_no == ewb.ewb_no
    assert [name for name, _ in prov.calls] == [
        "authenticate", "generate_irn", "cancel_irn", "generate_ewaybill_by_irn", "cancel_ewaybill",
    ]


@pytest.mark.asyncio
async def test_a_different_payload_gets_a_different_irn():
    a = await FakeProvider().generate_irn(build_einvoice_payload(company(), invoice(), lines(), party()))
    b = await FakeProvider().generate_irn(build_einvoice_payload(company(), invoice(invoice_no="CL/2026-27/00043"), lines(), party()))
    assert a.irn != b.irn


@pytest.mark.asyncio
async def test_fake_provider_refuses_a_malformed_irn_on_cancel():
    with pytest.raises(ProviderError) as exc:
        await FakeProvider().cancel_irn("nope", "1", "x")
    assert exc.value.code == "2150"


def test_transport_details_map_to_nic_names():
    t = TransportDetails(transporter_id="27AAAAA0000A1Z5", transport_mode="1", vehicle_no="rj14 ga 1234", vehicle_type="R", distance_km=120)
    assert t.to_nic() == {"Distance": 120, "TransId": "27AAAAA0000A1Z5", "TransMode": "1", "VehNo": "RJ14GA1234", "VehType": "R"}


def test_provider_factory_honours_the_setting(monkeypatch):
    from app.core.config import settings
    from app.einvoice import get_provider
    from app.einvoice.provider import ProviderDisabled

    monkeypatch.setattr(settings, "EINVOICE_PROVIDER", "disabled")
    with pytest.raises(ProviderDisabled):
        get_provider()
    monkeypatch.setattr(settings, "EINVOICE_PROVIDER", "fake")
    assert get_provider().name == "fake"
    monkeypatch.setattr(settings, "EINVOICE_PROVIDER", "nic")
    assert get_provider().name == "nic"


# ─── NIC provider envelope parsing (no network) ──────────────────────────────

def test_nic_envelope_accepts_both_nic_and_gsp_shapes():
    from app.einvoice.nic_provider import _envelope

    ok, data, errors = _envelope({"Status": 1, "Data": {"Irn": "x"}})
    assert ok and data == {"Irn": "x"} and errors == []
    ok, data, errors = _envelope({"status_cd": "1", "data": {"AuthToken": "t"}})
    assert ok and data["AuthToken"] == "t"
    ok, _, errors = _envelope({"Status": 0, "ErrorDetails": [{"ErrorCode": "2150", "ErrorMessage": "Duplicate IRN"}]})
    assert not ok and errors[0]["ErrorCode"] == "2150"


def test_nic_config_names_the_missing_settings():
    from app.einvoice.nic_provider import NicConfig

    cfg = NicConfig(base_url="", client_id="c", client_secret="", username="u", password="p", gstin="")
    assert cfg.missing() == ["EINVOICE_BASE_URL", "EINVOICE_CLIENT_SECRET", "EINVOICE_GSTIN"]
    cfg2 = NicConfig(base_url="https://gsp.example/", client_id="c", client_secret="s", username="u", password="p", gstin="g")
    assert cfg2.url("generate_irn") == "https://gsp.example/eicore/v1.03/Invoice"


@pytest.mark.asyncio
async def test_nic_provider_refuses_to_authenticate_unconfigured():
    from app.einvoice.nic_provider import NicConfig, NicProvider

    prov = NicProvider(NicConfig(base_url="", client_id="", client_secret="", username="", password="", gstin=""))
    with pytest.raises(ProviderError) as exc:
        await prov.authenticate()
    assert "EINVOICE_BASE_URL" in str(exc.value)


# ─── Migration 0007 ──────────────────────────────────────────────────────────

def _sql() -> str:
    return io.open(SQL_FILE, encoding="utf-8").read()


def _all_sql() -> str:
    return "\n".join(io.open(f, encoding="utf-8").read() for f in sorted((ROOT / "migrations" / "sql").glob("*.sql")))


def _permitted(constraint: str) -> set[str]:
    m = re.search(rf"CONSTRAINT\s+{re.escape(constraint)}\s+CHECK\s*\((.*?)\)\s*\)\s*\)", _all_sql(), re.I | re.S)
    assert m, f"{constraint} is not in the migrations"
    return set(re.findall(r"'([A-Za-z_]+)'::character varying", m.group(1)))


def test_migration_sql_parses():
    statements = parse_sql(_sql())
    assert len(statements) >= 25


def test_version_file_chains_from_0006():
    src = io.open(VERSION_FILE, encoding="utf-8").read()
    assert 'revision = "0007"' in src
    assert 'down_revision = "0006"' in src
    assert "0007_einvoice_tds_tcs.sql" in src


def test_migration_adds_the_agreed_columns():
    sql = _sql()
    for col in ("eway_bill_valid_upto", "e_invoice_cancelled_at", "e_invoice_signed_invoice",
                "tcs_section", "tcs_rate", "tcs_base", "tcs_amount"):
        assert re.search(rf"ALTER TABLE caratloop\.sales_invoices\s+ADD COLUMN IF NOT EXISTS {col}\s", sql), col
    for col in ("tds_section", "tds_rate", "tds_base", "tds_amount"):
        assert re.search(rf"ALTER TABLE caratloop\.purchase_invoices\s+ADD COLUMN IF NOT EXISTS {col}\s", sql), col
    for col in ("tds_applicable", "tcs_applicable", "lower_deduction_pct", "tds_pan_verified"):
        assert re.search(rf"ALTER TABLE caratloop\.parties\s+ADD COLUMN IF NOT EXISTS {col}\s", sql), col
    assert re.search(r"CREATE TABLE caratloop\.einvoice_log\s*\(", sql)
    assert re.search(r"CREATE TABLE caratloop\.tds_tcs_register\s*\(", sql)
    assert "trg_audit_tds_tcs_register AFTER INSERT OR UPDATE OR DELETE" in sql


def test_log_vocabularies_match_the_checks():
    from app.api.v1.einvoice import LOG_ACTIONS, LOG_STATUSES

    assert _permitted("chk_einvoice_log_action") == LOG_ACTIONS
    assert _permitted("chk_einvoice_log_status") == LOG_STATUSES


def test_every_log_action_the_module_writes_is_permitted():
    src = io.open(ROOT / "app" / "api" / "v1" / "einvoice.py", encoding="utf-8").read()
    written = set(re.findall(r'action="([A-Za-z_]+)"', src))
    assert written == _permitted("chk_einvoice_log_action")
    statuses = set(re.findall(r'status="(Success|Failed)"', src))
    assert statuses == _permitted("chk_einvoice_log_status")


def test_router_mounts_the_module_under_gst_and_the_stub_is_gone():
    router = io.open(ROOT / "app" / "api" / "v1" / "router.py", encoding="utf-8").read()
    assert "einvoice.router" in router
    assert 'einvoice.router,   prefix="/gst"' in router
    gst = io.open(ROOT / "app" / "api" / "v1" / "gst.py", encoding="utf-8").read()
    assert '@router.post("/eway-bill"' not in gst, "the 501 stub must be removed so the real route wins"
    src = io.open(ROOT / "app" / "api" / "v1" / "einvoice.py", encoding="utf-8").read()
    for route in ('"/einvoice/{invoice_id}"', '"/einvoice/{invoice_id}/generate"',
                  '"/einvoice/{invoice_id}/cancel"', '"/eway-bill/{invoice_id}"'):
        assert route in src, route


def test_cancel_reasons_are_the_nic_codes():
    assert set(IRN_CANCEL_REASONS) == {"1", "2", "3", "4"}
