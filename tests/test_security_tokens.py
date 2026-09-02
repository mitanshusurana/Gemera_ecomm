"""Token issuance and verification.

JWT handling moved from python-jose 3.3.0 -- a 2021 release, effectively
unmaintained, carrying algorithm-confusion advisories -- to PyJWT. These tests
pin the properties that matter, so the swap is verified behaviour rather than a
claim that it compiles.

The original ``validate_jwt_token`` equivalent in the sibling Java service used
a generic parse that would accept an unsigned token; the ``alg=none`` case
below is the same class of hole.
"""

from datetime import timedelta

import jwt as pyjwt
import pytest

# The test environment (including JWT_SECRET) is established in conftest.py,
# which pytest imports before any test module.
from app.core.config import settings
from app.core.security import create_access_token, hash_password, verify_password

ISSUER = "caratloop-erp"


def _decode(token: str, **kw):
    params = dict(
        key=settings.JWT_SECRET,
        algorithms=[settings.JWT_ALGORITHM],
        issuer=ISSUER,
    )
    params.update(kw)
    return pyjwt.decode(token, **params)


def test_a_valid_token_round_trips():
    token = create_access_token(
        {"sub": "u1", "email": "a@b.c", "role": "Admin", "company_id": "c1", "session_id": "7"}
    )
    claims = _decode(token)

    assert claims["sub"] == "u1"
    assert claims["role"] == "Admin"
    assert claims["session_id"] == "7"


def test_token_carries_exp_iat_and_issuer():
    claims = _decode(create_access_token({"sub": "u1"}))
    for required in ("exp", "iat", "iss"):
        assert required in claims, required
    assert claims["iss"] == ISSUER


def test_expired_token_is_rejected():
    token = create_access_token({"sub": "u1"}, expires_delta=timedelta(seconds=-10))
    with pytest.raises(pyjwt.ExpiredSignatureError):
        _decode(token)


def test_unsigned_token_is_rejected():
    """alg=none is the classic JWT bypass; pinning algorithms blocks it."""
    forged = pyjwt.encode({"sub": "u1", "iss": ISSUER}, key="", algorithm="none")
    with pytest.raises(pyjwt.InvalidAlgorithmError):
        _decode(forged)


def test_token_signed_with_another_key_is_rejected():
    # Long enough to avoid PyJWT's short-key warning; the point is the key
    # differs, not its length.
    other = pyjwt.encode({"sub": "u1", "iss": ISSUER}, "z" * 48, algorithm="HS256")
    with pytest.raises(pyjwt.InvalidSignatureError):
        _decode(other)


def test_token_from_another_issuer_is_rejected():
    foreign = pyjwt.encode(
        {"sub": "u1", "iss": "somebody-else"}, settings.JWT_SECRET, algorithm="HS256"
    )
    with pytest.raises(pyjwt.InvalidIssuerError):
        _decode(foreign)


def test_exp_is_timezone_aware_not_naive():
    """datetime.utcnow() is deprecated and naive; the exp claim must be unambiguous."""
    import datetime as dt

    claims = _decode(create_access_token({"sub": "u1"}))
    exp = dt.datetime.fromtimestamp(claims["exp"], tz=dt.timezone.utc)
    iat = dt.datetime.fromtimestamp(claims["iat"], tz=dt.timezone.utc)
    assert exp > iat
    # Default lifetime should match configuration, within a second of clock skew.
    delta = (exp - iat).total_seconds()
    assert abs(delta - settings.JWT_EXPIRE_MINUTES * 60) < 2


def test_password_hashing_round_trips():
    """bcrypt is now a declared dependency; passlib was declared but unused."""
    hashed = hash_password("correct horse battery staple")
    assert hashed.startswith("$2b$")
    assert verify_password("correct horse battery staple", hashed) is True
    assert verify_password("wrong password", hashed) is False


def test_password_verification_fails_closed_on_a_non_bcrypt_hash():
    assert verify_password("anything", "not-a-bcrypt-hash") is False
    assert verify_password("anything", "") is False
