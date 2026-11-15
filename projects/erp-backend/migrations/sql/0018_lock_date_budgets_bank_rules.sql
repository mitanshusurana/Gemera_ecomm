-- Four smaller things an accountant asks for.
--
-- 1. Lock the books up to a date. Locking a whole fiscal year exists; the
--    month-end habit is "nothing before the 31st may change once the GST
--    return is filed". companies.books_locked_until is that date; every
--    posting path already asks periods.assert_period_open, which now refuses
--    a document dated on or before it.
--
-- 2. Budgets: an amount per income or expense ledger per fiscal year, read
--    against the actuals.
--
-- 3. Bank rules: "a statement line containing BESCOM is Electricity". The
--    rule only suggests the ledger or party when a statement line is being
--    booked; a person still confirms the entry.
--
-- 4. Salesperson on the sales invoice, for the sales-by-salesperson report.

ALTER TABLE caratloop.companies
    ADD COLUMN IF NOT EXISTS books_locked_until DATE;

ALTER TABLE caratloop.sales_invoices
    ADD COLUMN IF NOT EXISTS salesperson VARCHAR(80);

CREATE TABLE IF NOT EXISTS caratloop.budgets (
    id             UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    company_id     UUID NOT NULL REFERENCES caratloop.companies(id),
    fiscal_year_id UUID NOT NULL REFERENCES caratloop.fiscal_years(id),
    account_id     UUID NOT NULL REFERENCES caratloop.accounts(id),
    amount         NUMERIC(18,2) NOT NULL,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_by     UUID REFERENCES caratloop.users(id),
    CONSTRAINT uq_budget UNIQUE (company_id, fiscal_year_id, account_id),
    CONSTRAINT chk_budget_amount CHECK (amount >= 0)
);

CREATE TABLE IF NOT EXISTS caratloop.bank_rules (
    id          UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    company_id  UUID NOT NULL REFERENCES caratloop.companies(id),
    name        VARCHAR(120) NOT NULL,
    match_text  VARCHAR(120) NOT NULL,
    direction   VARCHAR(10) NOT NULL DEFAULT 'Any',
    account_id  UUID REFERENCES caratloop.accounts(id),
    party_id    UUID REFERENCES caratloop.parties(id),
    priority    INTEGER NOT NULL DEFAULT 100,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    created_by  UUID REFERENCES caratloop.users(id),
    CONSTRAINT chk_bank_rule_direction CHECK (((direction)::text = ANY ((ARRAY[
        'Any'::character varying,
        'Debit'::character varying,
        'Credit'::character varying
    ])::text[]))),
    CONSTRAINT chk_bank_rule_target CHECK (account_id IS NOT NULL OR party_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ix_bank_rules_company
    ON caratloop.bank_rules(company_id, is_active, priority);

DROP TRIGGER IF EXISTS trg_audit_budgets ON caratloop.budgets;
CREATE TRIGGER trg_audit_budgets AFTER INSERT OR UPDATE OR DELETE ON caratloop.budgets FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();
