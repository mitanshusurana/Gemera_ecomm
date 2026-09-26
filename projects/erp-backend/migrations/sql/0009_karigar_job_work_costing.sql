-- Karigar as a party type, making-charge bills on job-work receipts, costed
-- returns, and a usable bill of materials.
--
-- The party master could file an artisan only as a Vendor, so nothing could
-- tell a karigar (paid making charges for work on metal that stays ours) from
-- a bullion dealer (paid for the metal itself). Job-work receipts recorded the
-- making charges as a number and did nothing with them: no bill, no payable,
-- no GST or RCM, and the pieces came back into stock valued at the metal alone.
-- bom_headers and bom_lines existed since the baseline and were never read;
-- production orders created a one-line stub BOM per product and ignored it.

-- ─── parties: the Karigar type and what they make ────────────────────────────
-- A karigar is a Sundry Creditor like a Vendor; the type is distinct so the
-- job-work screens can list artisans without listing every metal supplier.
ALTER TABLE caratloop.parties
    DROP CONSTRAINT IF EXISTS chk_party_type;
ALTER TABLE caratloop.parties
    ADD CONSTRAINT chk_party_type CHECK (((party_type)::text = ANY ((ARRAY[
        'Customer'::character varying,
        'Vendor'::character varying,
        'Both'::character varying,
        'Karigar'::character varying
    ])::text[])));
-- Free text: "22K bangles, kundan setting, polishing".
ALTER TABLE caratloop.parties
    ADD COLUMN IF NOT EXISTS karigar_skills TEXT;

-- ─── job_work_receipts: the karigar's bill for this receipt ──────────────────
-- Set when making_charges > 0: the purchase invoice raised on the karigar
-- through the ordinary purchase path (payable, GST or RCM, ITC).
ALTER TABLE caratloop.job_work_receipts
    ADD COLUMN IF NOT EXISTS making_charge_bill_id UUID REFERENCES caratloop.purchase_invoices(id);
-- The karigar's own bill number, when they issue one.
ALTER TABLE caratloop.job_work_receipts
    ADD COLUMN IF NOT EXISTS karigar_bill_no VARCHAR(50);
CREATE INDEX IF NOT EXISTS ix_jwr_making_charge_bill
    ON caratloop.job_work_receipts(making_charge_bill_id);

-- ─── job_work_receipt_lines: what the returned pieces cost ───────────────────
-- unit_cost = (issued metal cost for the received and wasted quantity, plus
-- this line's share of the making charges) / quantity received. This is the
-- rate the Job_Work_In stock ledger row carries, kept here so the karigar
-- statement can show it without re-deriving it.
ALTER TABLE caratloop.job_work_receipt_lines
    ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(18,4);
ALTER TABLE caratloop.job_work_receipt_lines
    ADD COLUMN IF NOT EXISTS cost_amount NUMERIC(18,2);
ALTER TABLE caratloop.job_work_receipt_lines
    ADD COLUMN IF NOT EXISTS making_charge_share NUMERIC(18,2);

-- ─── bom_headers: a name and the finished material it produces ───────────────
-- product_id stays (the baseline made it NOT NULL); the output material is
-- what a production order's output line needs, and products.material_id was
-- never reliably that.
ALTER TABLE caratloop.bom_headers
    ADD COLUMN IF NOT EXISTS name VARCHAR(200);
ALTER TABLE caratloop.bom_headers
    ADD COLUMN IF NOT EXISTS output_material_id UUID REFERENCES caratloop.materials(id);
-- quantity_per_unit on the lines is per this many units of output; 1 unless
-- the BOM is written for a batch.
ALTER TABLE caratloop.bom_headers
    ADD COLUMN IF NOT EXISTS output_quantity NUMERIC(14,4) NOT NULL DEFAULT 1;
ALTER TABLE caratloop.bom_headers
    DROP CONSTRAINT IF EXISTS chk_bom_output_quantity;
ALTER TABLE caratloop.bom_headers
    ADD CONSTRAINT chk_bom_output_quantity CHECK (output_quantity > 0);
CREATE INDEX IF NOT EXISTS ix_bom_headers_company
    ON caratloop.bom_headers(company_id, is_active);
CREATE INDEX IF NOT EXISTS ix_bom_lines_bom
    ON caratloop.bom_lines(bom_id, sequence_no);

ALTER TABLE caratloop.bom_lines
    DROP CONSTRAINT IF EXISTS chk_bom_line_quantity;
ALTER TABLE caratloop.bom_lines
    ADD CONSTRAINT chk_bom_line_quantity CHECK (quantity_per_unit > 0);
ALTER TABLE caratloop.bom_lines
    DROP CONSTRAINT IF EXISTS chk_bom_line_loss_pct;
ALTER TABLE caratloop.bom_lines
    ADD CONSTRAINT chk_bom_line_loss_pct CHECK (standard_loss_pct >= 0 AND standard_loss_pct <= 100);

-- BOMs drive what gets consumed, so changes to them belong in the audit trail
-- like every other master that feeds a posting.
DROP TRIGGER IF EXISTS trg_audit_bom_headers ON caratloop.bom_headers;
CREATE TRIGGER trg_audit_bom_headers AFTER INSERT OR UPDATE OR DELETE ON caratloop.bom_headers FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();
DROP TRIGGER IF EXISTS trg_audit_bom_lines ON caratloop.bom_lines;
CREATE TRIGGER trg_audit_bom_lines AFTER INSERT OR UPDATE OR DELETE ON caratloop.bom_lines FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();
