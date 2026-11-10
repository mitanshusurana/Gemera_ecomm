-- Expenses: money paid out for a running cost (rent, electricity, courier,
-- bank charges) recorded in one step, without raising a purchase bill.
--
-- Until now the only routes were a payment voucher against a party (which
-- needs a party and posts to its ledger) or a purchase bill with a service
-- item. Neither suits "paid 1,180 for courier from the cash box". An expense
-- is Dr the expense ledger, Cr the cash or bank ledger, posted as a Payment
-- journal; this table keeps the document itself (who was paid, the
-- supplier's reference, the notes) and the journal it produced.
--
-- An expense carries no input tax credit. A cost on which GST credit is to
-- be claimed is a purchase bill (service item), which feeds the ITC register
-- and GSTR-2B reconciliation.
CREATE TABLE IF NOT EXISTS caratloop.expenses (
    id                      UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    company_id              UUID NOT NULL REFERENCES caratloop.companies(id),
    fiscal_year_id          UUID NOT NULL REFERENCES caratloop.fiscal_years(id),
    expense_no              VARCHAR(30) NOT NULL,
    expense_date            DATE NOT NULL,
    expense_account_id      UUID NOT NULL REFERENCES caratloop.accounts(id),
    paid_through_account_id UUID NOT NULL REFERENCES caratloop.accounts(id),
    vendor_id               UUID REFERENCES caratloop.parties(id),
    amount                  NUMERIC(18,2) NOT NULL,
    reference_no            VARCHAR(50),
    notes                   TEXT,
    journal_entry_id        BIGINT NOT NULL REFERENCES caratloop.journal_entries(id),
    reversal_entry_id       BIGINT REFERENCES caratloop.journal_entries(id),
    status                  VARCHAR(20) NOT NULL DEFAULT 'Posted',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    created_by              UUID REFERENCES caratloop.users(id),
    CONSTRAINT chk_expense_amount CHECK (amount > 0),
    CONSTRAINT chk_expense_status CHECK (((status)::text = ANY ((ARRAY[
        'Posted'::character varying,
        'Reversed'::character varying
    ])::text[]))),
    CONSTRAINT uq_expense_no UNIQUE (company_id, expense_no)
);
CREATE INDEX IF NOT EXISTS ix_expenses_company_date
    ON caratloop.expenses(company_id, expense_date);
CREATE INDEX IF NOT EXISTS ix_expenses_account
    ON caratloop.expenses(expense_account_id);

DROP TRIGGER IF EXISTS trg_audit_expenses ON caratloop.expenses;
CREATE TRIGGER trg_audit_expenses AFTER INSERT OR UPDATE OR DELETE ON caratloop.expenses FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();
