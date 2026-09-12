"""What can be known about a GSTIN from the number alone.

A GSTIN is fifteen characters: two state-code digits, the ten-character PAN,
an entity code, the letter Z, and a check digit computed over the first
fourteen. Three modules need to ask questions of it and each had its own
answer:

  purchases.py decided a supplier was registered if the string was non-empty
      and not one of four spellings of "unregistered" -- so "NA", "-", "Not
      registered" and any fifteen random characters all counted as registered,
      and from that one boolean flowed an ITC register row, a forward-charge
      GST posting and a GSTR-1 B2B line.
  sales.py classified an invoice B2B, which declares the buyer holds a live GST
      registration, on the same non-empty test.
  parties.py had the only real validation and kept it to itself.

One module, three questions, in increasing strictness:

  is_gstin_shaped   the right length and character classes -- the test the
                    other two modules should have been using instead of "is it
                    non-empty"
  checksum_ok       the check digit agrees with the first fourteen characters
  decode            the state code and PAN the number carries

The checksum is ADVISORY. It matches every published example it has been run
against, but it has not been run over a body of real supplier GSTINs. Nothing
here refuses on it and nothing should until it has been.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"

# 2 digits, 10-char PAN (5 letters, 4 digits, 1 letter), entity code, Z, check.
_SHAPE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")

# GST state codes. 26 and 25 are historical (Dadra & Nagar Haveli merged into
# 26 in 2020); 38 is Ladakh; 97 and 99 are for OIDAR / other territory.
STATE_NAMES: dict[str, str] = {
    "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab",
    "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana", "07": "Delhi",
    "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim",
    "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur",
    "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam",
    "19": "West Bengal", "20": "Jharkhand", "21": "Odisha",
    "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
    "26": "Dadra & Nagar Haveli and Daman & Diu", "27": "Maharashtra",
    "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala",
    "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman & Nicobar Islands",
    "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
    "97": "Other Territory", "99": "Centre Jurisdiction",
}


def normalise(gstin: str | None) -> str:
    return (gstin or "").strip().upper()


def is_gstin_shaped(gstin: str | None) -> bool:
    """The right length and character classes; nothing about validity.

    This is the test for "did the counterparty give us a GST number at all",
    which is what decides B2B against B2C and registered against unregistered.
    It does not say the number is real -- only checksum_ok and a lookup can --
    but it does rule out "NA", "-", "Unregistered" and a phone number.
    """
    return bool(_SHAPE.match(normalise(gstin)))


def checksum_ok(gstin: str | None) -> bool | None:
    """True/False if the check digit can be evaluated, None if it cannot.

    None, not False, for something that is not GSTIN-shaped: "we cannot tell"
    and "the digit is wrong" must stay distinguishable, or a caller will tell a
    user their good number is mistyped when the problem is a stray character.
    """
    g = normalise(gstin)
    if len(g) != 15 or any(c not in _ALPHABET for c in g):
        return None
    total = 0
    for i, ch in enumerate(g[:14]):
        product = _ALPHABET.index(ch) * (2 if i % 2 else 1)
        total += product // 36 + product % 36
    return _ALPHABET[(36 - total % 36) % 36] == g[14]


@dataclass(frozen=True)
class Decoded:
    gstin: str
    state_code: str
    state_name: str | None
    pan: str


def decode(gstin: str | None) -> Decoded | None:
    """The state and PAN a GSTIN carries, or None if it is not one.

    These are read out of the number, not looked up, so they hold with no
    provider configured -- which is exactly why a caller must be told they
    were decoded rather than verified.
    """
    g = normalise(gstin)
    if len(g) != 15:
        return None
    return Decoded(
        gstin=g,
        state_code=g[:2],
        state_name=STATE_NAMES.get(g[:2]),
        pan=g[2:12],
    )
