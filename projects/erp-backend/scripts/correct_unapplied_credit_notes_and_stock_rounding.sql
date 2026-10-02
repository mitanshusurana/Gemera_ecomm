-- One-off correction of books posted before two defects were fixed.
--
-- Found by the ledger audit of 2026-10-02 and fixed in the application in
-- the same change (see tests/test_ledger_reconciliation.py). The fixes stop
-- new documents from being posted this way; this script repairs the
-- documents that already were. Run it ONCE per database, inside the
-- transaction below, with psql:
--
--   docker compose -f docker-compose.erp.yml --env-file .env.erp exec -T erp-db \
--     psql -U caratloop -d caratloop_erp -v ON_ERROR_STOP=1 \
--       -v actor='<owner user uuid>' \
--     < projects/erp-backend/scripts/correct_unapplied_credit_notes_and_stock_rounding.sql
--
-- Every UPDATE is caught by the audit triggers (fn_audit_trigger) under the
-- reason set here, so the correction is on the audit trail like any other
-- change. Both parts are idempotent: a second run changes nothing.
--
-- Part A -- credit notes the storefront bridge never applied to their invoice
-- ------------------------------------------------------------------------
-- integrations.record_ecommerce_credit_note posted the CN/ journal (customer
-- credited, sales and output tax debited) but, unlike the manual credit-note
-- voucher, did not call settle_invoice. The customer's ledger therefore
-- showed nothing owed on the invoice while sales_invoices.amount_paid stayed
-- 0 and payment_status 'Unpaid', so the bill-wise aging report carried the
-- full invoice value as receivable. In the audited database: WEB/2026-27/
-- 00001, 00003, 00004, 00006 and 00008, 25,750 each, 1,28,750 in all.
--
-- The repair applies each invoice's Posted Credit_Note journals to the
-- invoice, capped at the invoice value, and derives payment_status the way
-- vouchers.settle_invoice does.
--
-- Part B -- weight-priced purchase lines posted to four decimals
-- ------------------------------------------------------------------------
-- purchases._line_values returned net_weight x rate unrounded; the stock
-- ledger stored it to the paisa (NUMERIC(18,2)) but journal_entry_lines is
-- NUMERIC(18,4), so each old-gold RCM bill debited STK-008 51,168.0004
-- against a 51,168.00 creditor. Five bills: the trial balance was out by
-- 0.002 and STK-008 disagreed with the stock register by the same. The
-- repair rounds every Posted line to the paisa and re-derives the headers.

BEGIN;

SELECT set_config('app.user_id', :'actor', true);
SELECT set_config('app.reason',
    'Audit correction 2026-10-02: apply bridge credit notes to their invoices; round 4dp purchase stock legs to the paisa',
    true);

-- ── Part A ───────────────────────────────────────────────────────────────────
WITH cn AS (
    SELECT je.reference_id AS invoice_id, SUM(je.total_credit) AS credit_notes
    FROM caratloop.journal_entries je
    WHERE je.entry_type = 'Credit_Note' AND je.status = 'Posted'
      AND je.reference_type = 'CreditNote' AND je.reference_id IS NOT NULL
    GROUP BY je.reference_id
),
fix AS (
    SELECT si.id,
           LEAST(si.grand_total, si.amount_paid + (cn.credit_notes - LEAST(cn.credit_notes, si.amount_paid))) AS new_paid
    FROM caratloop.sales_invoices si
    JOIN cn ON cn.invoice_id = si.id
    WHERE si.status <> 'Cancelled'
      AND cn.credit_notes > si.amount_paid + 0.005
)
UPDATE caratloop.sales_invoices si
SET amount_paid = fix.new_paid,
    payment_status = CASE
        WHEN fix.new_paid >= si.grand_total - 0.005 THEN 'Paid'
        WHEN fix.new_paid > 0 THEN 'Partial'
        ELSE 'Unpaid' END
FROM fix
WHERE si.id = fix.id;

-- ── Part B ───────────────────────────────────────────────────────────────────
UPDATE caratloop.journal_entry_lines jel
SET dr_amount = ROUND(jel.dr_amount, 2),
    cr_amount = ROUND(jel.cr_amount, 2)
FROM caratloop.journal_entries je
WHERE je.id = jel.journal_entry_id AND je.status = 'Posted'
  AND (jel.dr_amount <> ROUND(jel.dr_amount, 2) OR jel.cr_amount <> ROUND(jel.cr_amount, 2));

UPDATE caratloop.journal_entries je
SET total_debit = t.dr, total_credit = t.cr
FROM (
    SELECT journal_entry_id, SUM(dr_amount) AS dr, SUM(cr_amount) AS cr
    FROM caratloop.journal_entry_lines
    GROUP BY journal_entry_id
) t
WHERE t.journal_entry_id = je.id
  AND (je.total_debit <> t.dr OR je.total_credit <> t.cr);

-- ── Verify before committing ────────────────────────────────────────────────
-- Every Posted voucher balances and agrees with its header.
DO $$
DECLARE bad INTEGER;
BEGIN
    SELECT COUNT(*) INTO bad
    FROM (
        SELECT je.id
        FROM caratloop.journal_entries je
        JOIN caratloop.journal_entry_lines jel ON jel.journal_entry_id = je.id
        WHERE je.status = 'Posted'
        GROUP BY je.id
        HAVING SUM(jel.dr_amount) <> SUM(jel.cr_amount)
            OR je.total_debit <> SUM(jel.dr_amount)
            OR je.total_credit <> SUM(jel.cr_amount)
    ) x;
    IF bad > 0 THEN
        RAISE EXCEPTION 'correction left % unbalanced voucher(s); rolled back', bad;
    END IF;
END $$;

-- No invoice's credit notes exceed what is recorded as settled on it.
DO $$
DECLARE bad INTEGER;
BEGIN
    SELECT COUNT(*) INTO bad
    FROM caratloop.sales_invoices si
    JOIN (
        SELECT reference_id, SUM(total_credit) AS credit_notes
        FROM caratloop.journal_entries
        WHERE entry_type = 'Credit_Note' AND status = 'Posted' AND reference_type = 'CreditNote'
        GROUP BY reference_id
    ) cn ON cn.reference_id = si.id
    WHERE si.status <> 'Cancelled' AND cn.credit_notes > si.amount_paid + 0.005;
    IF bad > 0 THEN
        RAISE EXCEPTION '% invoice(s) still carry unapplied credit notes; rolled back', bad;
    END IF;
END $$;

COMMIT;
