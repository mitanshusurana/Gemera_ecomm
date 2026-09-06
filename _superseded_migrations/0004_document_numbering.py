"""Race-safe, gap-free document numbering.

Invoice, order and party numbers were derived with ``SELECT COUNT(*) + 1``.
Under the four uvicorn workers the image runs, two concurrent requests read the
same count and mint the same number. The UNIQUE constraint added in 0001 turns
that into a failed insert rather than a duplicate, but failing is not the goal.

``next_document_number`` allocates atomically. The INSERT ... ON CONFLICT DO
UPDATE takes a row lock, so concurrent callers for the same series serialise
rather than collide. Because the increment is part of the caller's transaction,
a rolled-back document releases its number too -- the series stays gap-free,
which is what CGST Rule 46 numbering requires.

Revision ID: 0004
Revises: 0003
"""
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


NIL_UUID = "00000000-0000-0000-0000-000000000000"

DDL = f"""
CREATE TABLE caratloop.document_counters (
    company_id      UUID NOT NULL REFERENCES caratloop.companies(id),
    -- The nil UUID stands for "not scoped to a financial year" (party codes),
    -- because a NULL cannot participate in a primary key.
    fiscal_year_id  UUID NOT NULL DEFAULT '{NIL_UUID}',
    doc_type        TEXT NOT NULL,
    last_value      BIGINT NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id, fiscal_year_id, doc_type),
    CONSTRAINT document_counters_non_negative CHECK (last_value >= 0)
);

CREATE OR REPLACE FUNCTION caratloop.next_document_number(
    p_company   UUID,
    p_fy        UUID,
    p_doc_type  TEXT
) RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    v_next BIGINT;
    v_fy   UUID := COALESCE(p_fy, '{NIL_UUID}'::UUID);
BEGIN
    INSERT INTO caratloop.document_counters (company_id, fiscal_year_id, doc_type, last_value)
    VALUES (p_company, v_fy, p_doc_type, 1)
    ON CONFLICT (company_id, fiscal_year_id, doc_type)
    DO UPDATE SET
        last_value = caratloop.document_counters.last_value + 1,
        updated_at = NOW()
    RETURNING last_value INTO v_next;

    RETURN v_next;
END;
$$;
"""


def upgrade() -> None:
    op.execute(DDL)


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS caratloop.next_document_number(UUID, UUID, TEXT)")
    op.execute("DROP TABLE IF EXISTS caratloop.document_counters")
