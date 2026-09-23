"""Job work (karigar) under CGST s.143 and Rule 45.

A jewellery manufacturer sends gold out to a karigar for making. The GST
treatment is specific and none of it existed:

  * Sending goods for job work is NOT a supply. It moves on a delivery challan
    under Rule 45, not a tax invoice, so no GST is charged on the dispatch.
  * The goods remain the principal's asset while they are out. Stock leaves the
    premises but not the books.
  * Inputs must return within ONE year of dispatch and capital goods within
    THREE (s.143(1)). If they do not, the dispatch is deemed a supply on the
    day it was sent -- retrospectively, with interest.
  * Movements both ways are declared in ITC-04.

``calculate_gst_for_job_work`` existed in the tax engine with zero callers and
nothing to call it about.

Revision ID: 0006
Revises: 0005
"""
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


DDL = """
CREATE TABLE caratloop.job_work_challans (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES caratloop.companies(id),
    fiscal_year_id      UUID REFERENCES caratloop.fiscal_years(id),
    job_worker_id       UUID NOT NULL REFERENCES caratloop.parties(id),
    challan_no          TEXT NOT NULL,
    challan_date        DATE NOT NULL,
    -- 'Input' returns within 1 year, 'CapitalGoods' within 3 (s.143(1)).
    goods_type          TEXT NOT NULL DEFAULT 'Input',
    -- Derived on insert from goods_type; the deadline the return is judged by.
    return_due_date     DATE NOT NULL,
    nature_of_work      TEXT,
    place_of_supply     VARCHAR(2),
    is_inter_state      BOOLEAN NOT NULL DEFAULT FALSE,
    status              TEXT NOT NULL DEFAULT 'Open',
    -- Set when the dispatch has been treated as a deemed supply because the
    -- deadline passed. Never cleared: the event happened.
    deemed_supply_at    TIMESTAMPTZ,
    deemed_supply_invoice_id UUID REFERENCES caratloop.sales_invoices(id),
    remarks             TEXT,
    created_by          UUID REFERENCES caratloop.users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT jw_challan_no_unique UNIQUE (company_id, fiscal_year_id, challan_no),
    CONSTRAINT jw_goods_type_known CHECK (goods_type IN ('Input', 'CapitalGoods')),
    CONSTRAINT jw_status_known
        CHECK (status IN ('Open', 'PartiallyReceived', 'Closed', 'DeemedSupply')),
    CONSTRAINT jw_due_after_dispatch CHECK (return_due_date > challan_date)
);
CREATE INDEX ix_jw_challan_company ON caratloop.job_work_challans(company_id, challan_date);
CREATE INDEX ix_jw_challan_worker  ON caratloop.job_work_challans(job_worker_id);
-- Finding what is overdue is the hot query; index the open ones by deadline.
CREATE INDEX ix_jw_challan_due ON caratloop.job_work_challans(company_id, return_due_date)
    WHERE status IN ('Open', 'PartiallyReceived');

CREATE TABLE caratloop.job_work_challan_lines (
    id              BIGSERIAL PRIMARY KEY,
    challan_id      UUID NOT NULL REFERENCES caratloop.job_work_challans(id) ON DELETE CASCADE,
    sequence_no     INTEGER,
    material_id     UUID NOT NULL REFERENCES caratloop.materials(id),
    uom_id          UUID REFERENCES caratloop.units_of_measure(id),
    description     TEXT,
    hsn_code        VARCHAR(8),
    quantity_sent   NUMERIC(14,3) NOT NULL DEFAULT 0,
    gross_weight    NUMERIC(14,3),
    net_weight      NUMERIC(14,3),
    purity          NUMERIC(6,4),
    -- Value for the challan and for ITC-04. Not a sale price: the goods are
    -- not being sold, so this is the principal's own cost.
    taxable_value   NUMERIC(18,2) NOT NULL DEFAULT 0,
    CONSTRAINT jwl_qty_positive CHECK (quantity_sent > 0),
    CONSTRAINT jwl_purity_is_fraction CHECK (purity IS NULL OR (purity > 0 AND purity <= 1)),
    CONSTRAINT jwl_weights_consistent
        CHECK (gross_weight IS NULL OR net_weight IS NULL OR net_weight <= gross_weight)
);
CREATE INDEX ix_jwl_challan ON caratloop.job_work_challan_lines(challan_id);

CREATE TABLE caratloop.job_work_receipts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES caratloop.companies(id),
    challan_id      UUID NOT NULL REFERENCES caratloop.job_work_challans(id),
    receipt_no      TEXT NOT NULL,
    receipt_date    DATE NOT NULL,
    -- Making charges the karigar bills; SAC 9988, taxed at 5% when registered.
    making_charges  NUMERIC(18,2) NOT NULL DEFAULT 0,
    remarks         TEXT,
    created_by      UUID REFERENCES caratloop.users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT jw_receipt_no_unique UNIQUE (company_id, receipt_no),
    CONSTRAINT jw_receipt_charges_non_negative CHECK (making_charges >= 0)
);
CREATE INDEX ix_jwr_challan ON caratloop.job_work_receipts(challan_id);

CREATE TABLE caratloop.job_work_receipt_lines (
    id                  BIGSERIAL PRIMARY KEY,
    receipt_id          UUID NOT NULL REFERENCES caratloop.job_work_receipts(id) ON DELETE CASCADE,
    challan_line_id     BIGINT NOT NULL REFERENCES caratloop.job_work_challan_lines(id),
    material_id         UUID NOT NULL REFERENCES caratloop.materials(id),
    quantity_received   NUMERIC(14,3) NOT NULL DEFAULT 0,
    -- Metal lost in melting/polishing. Normal in this trade, but it must be
    -- recorded rather than silently absorbed.
    quantity_wastage    NUMERIC(14,3) NOT NULL DEFAULT 0,
    gross_weight        NUMERIC(14,3),
    net_weight          NUMERIC(14,3),
    CONSTRAINT jwrl_quantities_non_negative
        CHECK (quantity_received >= 0 AND quantity_wastage >= 0)
);
CREATE INDEX ix_jwrl_receipt ON caratloop.job_work_receipt_lines(receipt_id);
CREATE INDEX ix_jwrl_challan_line ON caratloop.job_work_receipt_lines(challan_line_id);
"""

AUDITED = [
    "job_work_challans",
    "job_work_challan_lines",
    "job_work_receipts",
    "job_work_receipt_lines",
]


def upgrade() -> None:
    op.execute(DDL)
    for table in AUDITED:
        op.execute(
            f"""
            CREATE TRIGGER trg_audit_{table}
                AFTER INSERT OR UPDATE OR DELETE ON caratloop.{table}
                FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();
            """
        )


def downgrade() -> None:
    for table in AUDITED:
        op.execute(f"DROP TRIGGER IF EXISTS trg_audit_{table} ON caratloop.{table}")
    for table in reversed(
        [
            "job_work_receipt_lines",
            "job_work_receipts",
            "job_work_challan_lines",
            "job_work_challans",
        ][::-1]
    ):
        op.execute(f"DROP TABLE IF EXISTS caratloop.{table} CASCADE")
