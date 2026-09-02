"""Audit trail [MCA Rule 11(g)] and posted-voucher immutability.

``app/core/audit.py`` sets four Postgres session variables and relies on a
``fn_audit_trigger()`` to consume them. That function lived only in a
``database/schema.sql`` that does not exist, so nothing was ever recorded: there
is no ``INSERT INTO audit_log`` anywhere in the Python source. Every claim in
the codebase about a non-disableable audit trail rested on this missing file.

This migration supplies it, and makes the log genuinely append-only by revoking
UPDATE and DELETE at the table level rather than relying on convention.

Revision ID: 0002
Revises: 0001
"""
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


AUDIT = """
CREATE TABLE caratloop.audit_log (
    id                BIGSERIAL PRIMARY KEY,
    sequence_no       BIGINT NOT NULL,
    company_id        UUID,
    table_name        TEXT NOT NULL,
    record_id         TEXT,
    action            TEXT NOT NULL,
    old_value         JSONB,
    new_value         JSONB,
    changed_fields    TEXT[],
    user_id           UUID,
    session_id        BIGINT,
    ip_address        INET,
    reason            TEXT,
    row_hash          TEXT NOT NULL,
    server_timestamp  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT audit_action_known CHECK (action IN ('INSERT','UPDATE','DELETE'))
);

CREATE SEQUENCE caratloop.audit_log_seq;
CREATE INDEX ix_audit_table_record ON caratloop.audit_log(table_name, record_id);
CREATE INDEX ix_audit_company_time ON caratloop.audit_log(company_id, server_timestamp);
CREATE INDEX ix_audit_user         ON caratloop.audit_log(user_id);

-- ─── Trigger ─────────────────────────────────────────────────────────────────
-- Reads the session variables set by set_audit_context()/audit_context().
-- current_setting(..., true) returns NULL rather than erroring when unset, so a
-- migration or manual fix still records, just without an attributed user.

CREATE OR REPLACE FUNCTION caratloop.fn_audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old        JSONB;
    v_new        JSONB;
    v_changed    TEXT[];
    v_record_id  TEXT;
    v_company    UUID;
    v_user       UUID;
    v_session    BIGINT;
    v_ip         INET;
    v_reason     TEXT;
    v_seq        BIGINT;
BEGIN
    v_seq := nextval('caratloop.audit_log_seq');

    IF (TG_OP = 'DELETE') THEN
        v_old := to_jsonb(OLD);
        v_new := NULL;
    ELSIF (TG_OP = 'UPDATE') THEN
        v_old := to_jsonb(OLD);
        v_new := to_jsonb(NEW);
        SELECT array_agg(key) INTO v_changed
        FROM jsonb_each(v_new)
        WHERE v_old -> key IS DISTINCT FROM v_new -> key;
    ELSE
        v_old := NULL;
        v_new := to_jsonb(NEW);
    END IF;

    v_record_id := COALESCE(v_new ->> 'id', v_old ->> 'id');

    BEGIN
        v_company := NULLIF(COALESCE(v_new ->> 'company_id', v_old ->> 'company_id'), '')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_company := NULL;
    END;

    BEGIN
        v_user := NULLIF(current_setting('app.user_id', true), '')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_user := NULL;
    END;

    BEGIN
        v_session := NULLIF(current_setting('app.session_id', true), '')::BIGINT;
    EXCEPTION WHEN OTHERS THEN
        v_session := NULL;
    END;

    BEGIN
        v_ip := NULLIF(current_setting('app.ip_address', true), '')::INET;
    EXCEPTION WHEN OTHERS THEN
        v_ip := NULL;
    END;

    v_reason := NULLIF(current_setting('app.reason', true), '');

    INSERT INTO caratloop.audit_log (
        sequence_no, company_id, table_name, record_id, action,
        old_value, new_value, changed_fields,
        user_id, session_id, ip_address, reason, row_hash
    ) VALUES (
        v_seq, v_company, TG_TABLE_NAME, v_record_id, TG_OP,
        v_old, v_new, v_changed,
        v_user, v_session, v_ip, v_reason,
        encode(digest(
            v_seq::TEXT || TG_TABLE_NAME || COALESCE(v_record_id,'') || TG_OP ||
            COALESCE(v_old::TEXT,'') || COALESCE(v_new::TEXT,''),
            'sha256'
        ), 'hex')
    );

    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

-- ─── Immutability ────────────────────────────────────────────────────────────
-- Convention is not enforcement. Block modification of the log itself.

CREATE OR REPLACE FUNCTION caratloop.fn_audit_log_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'caratloop.audit_log is append-only [MCA Rule 11(g)]: % is not permitted',
        TG_OP;
END;
$$;

CREATE TRIGGER trg_audit_log_no_update
    BEFORE UPDATE ON caratloop.audit_log
    FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_log_immutable();

CREATE TRIGGER trg_audit_log_no_delete
    BEFORE DELETE ON caratloop.audit_log
    FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_log_immutable();
"""

# Financial records whose every mutation must be attributable.
AUDITED_TABLES = [
    "companies",
    "users",
    "accounts",
    "parties",
    "materials",
    "journal_entries",
    "journal_entry_lines",
    "stock_ledger_entries",
    "sales_invoices",
    "sales_invoice_lines",
    "purchase_invoices",
    "purchase_invoice_lines",
    "gst_output_tax_register",
    "itc_register",
    "rcm_liability_register",
    "production_orders",
    "production_consumption_entries",
    "production_output_entries",
    "production_wastage_entries",
    "fiscal_years",
]


def upgrade() -> None:
    op.execute(AUDIT)
    for table in AUDITED_TABLES:
        op.execute(
            f"""
            CREATE TRIGGER trg_audit_{table}
                AFTER INSERT OR UPDATE OR DELETE ON caratloop.{table}
                FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();
            """
        )


def downgrade() -> None:
    for table in AUDITED_TABLES:
        op.execute(f"DROP TRIGGER IF EXISTS trg_audit_{table} ON caratloop.{table}")
    op.execute("DROP TRIGGER IF EXISTS trg_audit_log_no_update ON caratloop.audit_log")
    op.execute("DROP TRIGGER IF EXISTS trg_audit_log_no_delete ON caratloop.audit_log")
    op.execute("DROP FUNCTION IF EXISTS caratloop.fn_audit_log_immutable()")
    op.execute("DROP FUNCTION IF EXISTS caratloop.fn_audit_trigger()")
    op.execute("DROP TABLE IF EXISTS caratloop.audit_log")
    op.execute("DROP SEQUENCE IF EXISTS caratloop.audit_log_seq")
