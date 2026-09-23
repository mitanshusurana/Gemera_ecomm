-- Track how much of an invoice has actually been paid.
--
-- A receipt or payment voucher of ANY amount flipped the whole invoice to
-- payment_status = 'Paid'. A one-rupee advance against a ten-lakh bullion bill
-- recorded the bill as settled, dropped it out of the outstanding report, and
-- hid it from the 180-day test in CGST s.16(2)(d) / Rule 37, under which input
-- tax credit on a supplier bill not paid in full within 180 days has to be
-- reversed with interest.
--
-- There was nowhere to record a partial amount: payment_status is a bare
-- varchar and no column held what had been received. amount_paid is that
-- column. Status is then derived from it -- Unpaid / Partial / Paid -- rather
-- than asserted by whichever voucher happened to run last.

ALTER TABLE caratloop.sales_invoices
    ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE caratloop.purchase_invoices
    ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(18,2) NOT NULL DEFAULT 0;

-- Paid can never exceed the bill. An over-payment is a real event (a customer
-- rounds up, a supplier is paid twice) but it belongs in an advance or a
-- refund voucher, not silently inside the invoice's own paid figure.
ALTER TABLE caratloop.sales_invoices
    DROP CONSTRAINT IF EXISTS chk_si_amount_paid;
ALTER TABLE caratloop.sales_invoices
    ADD CONSTRAINT chk_si_amount_paid
        CHECK (amount_paid >= 0 AND amount_paid <= grand_total);
ALTER TABLE caratloop.purchase_invoices
    DROP CONSTRAINT IF EXISTS chk_pi_amount_paid;
ALTER TABLE caratloop.purchase_invoices
    ADD CONSTRAINT chk_pi_amount_paid
        CHECK (amount_paid >= 0 AND amount_paid <= grand_total);

-- payment_status had no vocabulary; the application wrote whatever it liked.
-- Pin the three values the derivation produces so a fourth cannot creep in.
ALTER TABLE caratloop.sales_invoices
    DROP CONSTRAINT IF EXISTS chk_si_payment_status;
ALTER TABLE caratloop.sales_invoices
    ADD CONSTRAINT chk_si_payment_status
        CHECK (payment_status IN ('Unpaid', 'Partial', 'Paid'));
ALTER TABLE caratloop.purchase_invoices
    DROP CONSTRAINT IF EXISTS chk_pi_payment_status;
ALTER TABLE caratloop.purchase_invoices
    ADD CONSTRAINT chk_pi_payment_status
        CHECK (payment_status IN ('Unpaid', 'Partial', 'Paid'));

-- Any invoice already marked Paid was marked so by the old any-amount rule and
-- the real figure is unknown. Treat it as fully paid rather than reset it to
-- zero: reopening a bill someone has already reconciled is the more disruptive
-- error. The books in this database are test data, so this is moot here, but
-- the migration should still do the least-surprising thing.
UPDATE caratloop.sales_invoices
   SET amount_paid = grand_total
 WHERE payment_status = 'Paid' AND amount_paid = 0;
UPDATE caratloop.purchase_invoices
   SET amount_paid = grand_total
 WHERE payment_status = 'Paid' AND amount_paid = 0;

-- The outstanding report reads these two columns together for every open bill.
CREATE INDEX IF NOT EXISTS ix_si_open ON caratloop.sales_invoices(company_id, customer_id)
    WHERE payment_status <> 'Paid' AND status <> 'Cancelled';
CREATE INDEX IF NOT EXISTS ix_pi_open ON caratloop.purchase_invoices(company_id, vendor_id)
    WHERE payment_status <> 'Paid' AND status <> 'Cancelled';

-- ---------------------------------------------------------------------------
-- Remittance details on the company master
-- ---------------------------------------------------------------------------
-- The tax invoice printed "Bank Name: State Bank of India (Jaipur Main
-- Branch) / A/C No: 409988776611 / IFSC: SBIN0001234" on every invoice, from a
-- literal in the print component. Those are not this business's details; a
-- customer paying against them pays into nothing, or into someone else's
-- account. There was nowhere in the schema for the real ones -- bank accounts
-- exist only as chart-of-accounts rows, which carry no account number.
--
-- These are optional. An invoice prints the block only when they are set.
ALTER TABLE caratloop.companies
    ADD COLUMN IF NOT EXISTS bank_name        VARCHAR(100),
    ADD COLUMN IF NOT EXISTS bank_branch      VARCHAR(100),
    ADD COLUMN IF NOT EXISTS bank_account_no  VARCHAR(34),
    ADD COLUMN IF NOT EXISTS bank_ifsc        VARCHAR(11);

-- IFSC is four letters, a zero, and six alphanumerics. Catch the obvious typo
-- at entry rather than on a customer's failed transfer.
ALTER TABLE caratloop.companies
    DROP CONSTRAINT IF EXISTS chk_company_ifsc;
ALTER TABLE caratloop.companies
    ADD CONSTRAINT chk_company_ifsc
        CHECK (bank_ifsc IS NULL OR bank_ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$');
