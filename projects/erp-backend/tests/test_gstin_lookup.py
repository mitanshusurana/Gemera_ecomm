"""The GSTIN lookup must not claim to have verified what it did not.

The endpoint auto-fills a new party ledger from a GST number, and it is the
fastest way to get a supplier onto the books. When the hardcoded provider key
was removed from source, nothing carried a replacement into the container, so
every lookup fell through to a hand-written default that still returned
status='Active' and registration_type='Regular'.

Two separate failures came out of that. The obvious one: the form populated
nothing and said nothing, because the response was HTTP 200 with blank names.
The dangerous one: a supplier whose GST registration is cancelled or suspended
was recorded as Active on the strength of a lookup that never ran, and input
tax credit claimed against a cancelled registration is not available.
"""

from __future__ import annotations

import pytest

from app.api.v1.parties import fetch_gstin_from_surepass, gstin_checksum_ok

# The check digit is the 15th character, computed over the first 14. These are
# GSTINs published in GST training material.
KNOWN_GOOD = ["27AAPFU0939F1ZV", "29AAGCB7383J1Z4", "24AAACC1206D1ZM"]


@pytest.mark.parametrize("gstin", KNOWN_GOOD)
def test_a_real_gstin_passes_its_check_digit(gstin):
    assert gstin_checksum_ok(gstin) is True


@pytest.mark.parametrize("gstin", [g[:14] + ("A" if g[14] != "A" else "B") for g in KNOWN_GOOD])
def test_a_corrupted_check_digit_is_caught(gstin):
    assert gstin_checksum_ok(gstin) is False


@pytest.mark.parametrize("bad", ["", "short", "27AAPFU0939F1Z", "27AAPFU0939F1ZVX", "27AAPFU0939F1Z*"])
def test_something_that_is_not_a_gstin_is_undecidable_not_false(bad):
    """None, not False: 'we cannot tell' and 'the digit is wrong' differ.

    A caller that treats them alike would tell a user their perfectly good
    number is mistyped when the real problem is a stray character.
    """
    assert gstin_checksum_ok(bad) is None


@pytest.mark.asyncio
async def test_an_unreachable_lookup_reports_itself_as_unverified(monkeypatch):
    monkeypatch.delenv("GSTIN_API_KEY", raising=False)
    out = await fetch_gstin_from_surepass("27AAPFU0939F1ZV", token="")

    assert out["verified"] is False
    assert out["source"] is None
    assert out["reason"], "an unverified result must say why"


@pytest.mark.asyncio
async def test_an_unverified_lookup_asserts_no_registration_facts(monkeypatch):
    """The bug that mattered: 'Active' returned without checking anything."""
    monkeypatch.delenv("GSTIN_API_KEY", raising=False)
    out = await fetch_gstin_from_surepass("27AAPFU0939F1ZV", token="")

    assert out["status"] is None, "claimed a registration status it never checked"
    assert out["registration_type"] is None
    assert out["business_type"] is None
    assert out["einvoice_eligible"] is None
    assert out["legal_name"] == ""
    assert out["trade_name"] == ""


@pytest.mark.asyncio
async def test_what_the_number_itself_encodes_is_still_returned(monkeypatch):
    """State and PAN are decoded, not looked up, so they hold with no provider.

    This is what makes the endpoint worth calling even unconfigured, and why it
    must be distinguishable from the fields that do need one.
    """
    monkeypatch.delenv("GSTIN_API_KEY", raising=False)
    out = await fetch_gstin_from_surepass("27AAPFU0939F1ZV", token="")

    assert out["state_code"] == "27"
    assert out["state_name"] == "Maharashtra"
    assert out["pan"] == "AAPFU0939F"
    assert out["checksum_valid"] is True


@pytest.mark.asyncio
async def test_a_wrong_length_gstin_is_refused_before_any_network_call(monkeypatch):
    from fastapi import HTTPException

    monkeypatch.delenv("GSTIN_API_KEY", raising=False)
    with pytest.raises(HTTPException) as exc:
        await fetch_gstin_from_surepass("27AAPFU", token="")
    assert exc.value.status_code == 400
