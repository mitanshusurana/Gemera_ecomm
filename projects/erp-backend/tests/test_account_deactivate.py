"""Unused accounts can be deactivated; anything with postings stays in the books."""

import io
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ACC = io.open(ROOT / "app" / "api" / "v1" / "accounting.py", encoding="utf-8").read()


def test_update_accepts_is_active_and_refuses_accounts_in_use():
    assert "is_active: Optional[bool] = None" in ACC
    body = ACC.split('@router.patch("/accounts/{account_id}", dependencies')[1].split("@router.")[0]
    assert "has_postings" in body and "has_party" in body and "has_item" in body
    assert "has postings or an opening balance; it stays in the books" in body
    assert 'sets.append("is_active = :active")' in body


def test_readers_keep_inactive_accounts_that_carry_balances():
    # The trial balance and the chart hide an inactive account only while it
    # has no postings and no opening balance; a stray posting brings it back.
    rule = "a.is_active = TRUE OR t.account_id IS NOT NULL OR COALESCE(a.opening_balance, 0) <> 0"
    tb = ACC.split('@router.get("/trial-balance")')[1].split("@router.")[0]
    coa = ACC.split('@router.get("/accounts")')[1].split("@router.")[0]
    assert rule in tb
    assert rule in coa and "include_inactive: bool = False" in coa
    assert "AND a.is_active = TRUE" not in tb and "AND a.is_active = TRUE" not in coa
