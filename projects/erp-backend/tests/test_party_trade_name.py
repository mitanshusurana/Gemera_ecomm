"""Parties are known by their trade name.

The business and the bank statement say "G Star Gems"; the GST portal says
the legal name. Search must find either, lists sort by the trade name, and
the party's ledger account is named after the trade name so vouchers and
the chart of accounts read the way the staff talk.
"""

import io
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PARTIES = io.open(ROOT / "app" / "api" / "v1" / "parties.py", encoding="utf-8").read()
ACCOUNTING = io.open(ROOT / "app" / "api" / "v1" / "accounting.py", encoding="utf-8").read()


def test_search_matches_trade_name_too():
    assert "p.trade_name ILIKE :q OR p.name ILIKE :q" in PARTIES


def test_list_orders_by_trade_name_with_legal_name_fallback():
    assert "ORDER BY COALESCE(NULLIF(p.trade_name, ''), p.name)" in PARTIES


def test_new_party_ledger_account_is_named_after_the_trade_name():
    # Both INSERT paths (default group and fallback group) use the same rule.
    assert PARTIES.count('"name": (payload.trade_name or "").strip() or payload.name,') == 2


def test_renaming_a_party_renames_its_ledger_account():
    body = PARTIES.split("async def update_party")[1]
    assert "UPDATE caratloop.accounts a" in body
    assert "SET name = COALESCE(NULLIF(p.trade_name, ''), p.name)" in body


def test_account_groups_can_be_listed_for_pickers():
    assert '@router.get("/account-groups")' in ACCOUNTING
    assert "FROM caratloop.account_groups g" in ACCOUNTING
