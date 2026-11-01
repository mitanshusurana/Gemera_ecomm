"""Creating an account must file it under the group the user chose.

The New Account form offered only the five natures and the API, finding no
group of that name, fell back to the first group in the table: a "Shop
Rent" account landed under Current Assets.
"""

import io
from pathlib import Path

SRC = io.open(Path(__file__).resolve().parents[1] / "app" / "api" / "v1" / "accounting.py", encoding="utf-8").read()


def test_unknown_group_is_refused_not_guessed():
    body = SRC.split('@router.post("/accounts"')[1].split("@router.")[0]
    assert "WHERE company_id = :cid LIMIT 1" not in body
    assert "Account group not found" in body


def test_an_account_can_be_renamed_or_moved():
    assert '@router.patch("/accounts/{account_id}", ' in SRC
    body = SRC.split('@router.patch("/accounts/{account_id}", ')[1].split("@router.")[0]
    assert "group_id = CAST(:gid AS UUID)" in body
    assert "name = :name" in body
    assert "Nothing to update" in body
