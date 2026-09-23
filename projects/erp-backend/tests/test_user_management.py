"""User management rules.

The rules that decide who may create or alter which account are pure
functions in app.core.user_policy, so every combination can be checked here
without a database. The last test scans app/api/v1/users.py itself: the
module writes password_hash and must never read it back into a response.
"""

from __future__ import annotations

import ast
import io
from pathlib import Path

import pytest

from app.core.roles import (
    ACCOUNTANT,
    ADMIN,
    ALL_ROLES,
    AUDITOR,
    OWNER,
    PRODUCTION_MANAGER,
    READ_ONLY,
    STORE_KEEPER,
)
from app.core.user_policy import (
    MIN_PASSWORD_LENGTH,
    can_assign_role,
    can_change_role_of,
    password_policy_errors,
)

USERS_PY = Path(__file__).resolve().parents[1] / "app" / "api" / "v1" / "users.py"
AUTH_PY = Path(__file__).resolve().parents[1] / "app" / "api" / "v1" / "auth.py"

NON_OWNER_ROLES = sorted(ALL_ROLES - {OWNER})
UNPRIVILEGED = (ACCOUNTANT, PRODUCTION_MANAGER, STORE_KEEPER, AUDITOR, READ_ONLY)


# ─── can_assign_role ─────────────────────────────────────────────────────────

@pytest.mark.parametrize("target", sorted(ALL_ROLES))
def test_an_owner_may_assign_every_role(target):
    assert can_assign_role(OWNER, target) is True


@pytest.mark.parametrize("target", NON_OWNER_ROLES)
def test_an_admin_may_assign_every_role_but_owner(target):
    assert can_assign_role(ADMIN, target) is True


def test_an_admin_may_not_create_an_owner():
    """Otherwise an admin promotes an accomplice and removes the proprietor."""
    assert can_assign_role(ADMIN, OWNER) is False


@pytest.mark.parametrize("actor", UNPRIVILEGED)
@pytest.mark.parametrize("target", sorted(ALL_ROLES))
def test_nobody_below_admin_assigns_any_role(actor, target):
    assert can_assign_role(actor, target) is False


@pytest.mark.parametrize("bad", ["superadmin", "viewer", "wizard", "", None])
def test_a_role_the_database_cannot_store_is_never_assignable(bad):
    assert can_assign_role(OWNER, bad) is False
    assert can_assign_role(ADMIN, bad) is False


def test_role_comparison_is_case_and_whitespace_insensitive():
    assert can_assign_role(" Owner ", "OWNER") is True
    assert can_assign_role("Admin", " Owner") is False


# ─── can_change_role_of ──────────────────────────────────────────────────────

@pytest.mark.parametrize("current", sorted(ALL_ROLES))
def test_an_owner_may_alter_anyone(current):
    assert can_change_role_of(OWNER, current) is True


@pytest.mark.parametrize("current", NON_OWNER_ROLES)
def test_an_admin_may_alter_any_non_owner(current):
    assert can_change_role_of(ADMIN, current) is True


def test_an_admin_may_not_alter_an_owner():
    assert can_change_role_of(ADMIN, OWNER) is False
    assert can_change_role_of("ADMIN", " owner ") is False


@pytest.mark.parametrize("actor", UNPRIVILEGED + (None, ""))
def test_nobody_below_admin_alters_anyone(actor):
    assert can_change_role_of(actor, READ_ONLY) is False


# ─── password_policy_errors ──────────────────────────────────────────────────

def test_a_good_password_has_no_errors():
    assert password_policy_errors("correct-horse-battery", "a@b.com") == []


def test_minimum_length_is_twelve():
    assert MIN_PASSWORD_LENGTH == 12
    assert password_policy_errors("x" * 11, "a@b.com")
    assert password_policy_errors("x" * 12, "a@b.com") == []


def test_password_equal_to_email_is_refused_regardless_of_case():
    errors = password_policy_errors("Ravi.Sharma@Example.com", "ravi.sharma@example.com")
    assert any("email" in e for e in errors)


def test_password_equal_to_email_local_part_is_refused():
    errors = password_policy_errors("ravi.sharma.jaipur", "ravi.sharma.jaipur@example.com")
    assert any("before '@'" in e for e in errors)


def test_empty_and_whitespace_passwords_are_refused():
    assert password_policy_errors("", "a@b.com")
    assert password_policy_errors(None, "a@b.com")
    assert password_policy_errors(" " * 20, "a@b.com")
    assert password_policy_errors(" leading-space-pass", "a@b.com")


def test_passwords_beyond_bcrypt_limit_are_refused_not_truncated():
    """bcrypt reads 72 bytes; hash_password truncates silently."""
    assert password_policy_errors("x" * 73, "a@b.com")
    assert password_policy_errors("x" * 72, "a@b.com") == []
    # Multi-byte characters count in bytes, not characters.
    assert password_policy_errors("₹" * 25, "a@b.com")


def test_every_error_is_a_sentence_for_the_person_choosing():
    for e in password_policy_errors("short", "short@x.in"):
        assert e[0].isupper() and e.endswith(".")


# ─── users.py never reads password_hash back ─────────────────────────────────

def _text_calls(src: str):
    """(first_line, last_line, sql) for every text("...") with a constant body."""
    tree = ast.parse(src)
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        name = getattr(node.func, "id", None) or getattr(node.func, "attr", None)
        if name != "text" or not node.args:
            continue
        arg = node.args[0]
        if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
            yield arg.lineno, arg.end_lineno, arg.value


def test_users_module_only_writes_password_hash():
    src = io.open(USERS_PY, encoding="utf-8").read()
    calls = list(_text_calls(src))
    assert calls, "no SQL found in users.py; the scanner is broken"

    allowed_lines: set[int] = set()
    for first, last, sql in calls:
        if "password_hash" not in sql:
            continue
        head = sql.strip().split(None, 1)[0].upper()
        assert head in {"INSERT", "UPDATE"}, (
            f"users.py:{first} reads password_hash in a {head} statement:\n{sql.strip()[:200]}"
        )
        upper = sql.upper()
        if "RETURNING" in upper:
            returning = sql[upper.index("RETURNING"):]
            assert "password_hash" not in returning, (
                f"users.py:{first} returns password_hash to the client"
            )
        allowed_lines.update(range(first, last + 1))

    # Outside those statements the word may appear only in comments and
    # docstrings, and as the bind-parameter key whose value is hash_password().
    for lineno, line in enumerate(src.split("\n"), start=1):
        if "password_hash" not in line:
            continue
        stripped = line.strip()
        if lineno in allowed_lines:
            continue
        if stripped.startswith("#") or stripped.startswith('"""') or stripped.startswith("``"):
            continue
        if '"password_hash": hash_password(' in stripped:
            continue
        pytest.fail(f"users.py:{lineno} touches password_hash outside INSERT/UPDATE: {stripped}")


def test_users_select_statements_name_no_credential_column():
    """Every SELECT and RETURNING column list in users.py is explicit."""
    src = io.open(USERS_PY, encoding="utf-8").read()
    for first, _last, sql in _text_calls(src):
        head = sql.strip().split(None, 1)[0].upper()
        if head == "SELECT":
            assert "password_hash" not in sql, f"users.py:{first}"
            assert "SELECT *" not in sql.upper(), f"users.py:{first} uses SELECT *"


def test_auth_only_reads_password_hash_where_it_verifies_one():
    """auth.py may SELECT the hash to check a login or a current password;
    it must never place it in a response."""
    src = io.open(AUTH_PY, encoding="utf-8").read()
    for first, _last, sql in _text_calls(src):
        if "password_hash" in sql and sql.strip().upper().startswith("SELECT"):
            # The statements that read it are followed by verify_password().
            tail = src.split("\n")[first - 1 : first + 25]
            assert any("verify_password(" in l for l in tail), (
                f"auth.py:{first} reads password_hash without verifying it"
            )
    assert '"password_hash":' not in src.replace('{"password_hash": hash_password', "")
