-- Recurring documents: rent every month, a standing supplier bill, a
-- monthly invoice to a retainer customer.
--
-- A profile says what repeats, how often and when it is next due. An
-- expense profile may post itself on the due date (auto_post); a bill or an
-- invoice is never posted unattended, because each needs a supplier invoice
-- number or stock that only a person can confirm. Those show up as "due" and
-- open their form prefilled; saving the document advances the profile.
CREATE TABLE IF NOT EXISTS caratloop.recurring_profiles (
    id               UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    company_id       UUID NOT NULL REFERENCES caratloop.companies(id),
    kind             VARCHAR(20) NOT NULL,
    name             VARCHAR(120) NOT NULL,
    frequency        VARCHAR(12) NOT NULL,
    every_n          INTEGER NOT NULL DEFAULT 1,
    start_date       DATE NOT NULL,
    end_date         DATE,
    next_run_date    DATE NOT NULL,
    periods_done     INTEGER NOT NULL DEFAULT 0,
    auto_post        BOOLEAN NOT NULL DEFAULT FALSE,
    amount           NUMERIC(18,2) NOT NULL DEFAULT 0,
    template         JSONB NOT NULL,
    status           VARCHAR(12) NOT NULL DEFAULT 'Active',
    last_run_at      TIMESTAMPTZ,
    last_document_no VARCHAR(60),
    last_error       TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    created_by       UUID REFERENCES caratloop.users(id),
    CONSTRAINT chk_recurring_every CHECK (every_n >= 1 AND every_n <= 24),
    CONSTRAINT chk_recurring_kind CHECK (((kind)::text = ANY ((ARRAY[
        'Expense'::character varying,
        'PurchaseBill'::character varying,
        'SalesInvoice'::character varying
    ])::text[]))),
    CONSTRAINT chk_recurring_frequency CHECK (((frequency)::text = ANY ((ARRAY[
        'Weekly'::character varying,
        'Monthly'::character varying,
        'Quarterly'::character varying,
        'Yearly'::character varying
    ])::text[]))),
    CONSTRAINT chk_recurring_status CHECK (((status)::text = ANY ((ARRAY[
        'Active'::character varying,
        'Paused'::character varying,
        'Ended'::character varying
    ])::text[])))
);
CREATE INDEX IF NOT EXISTS ix_recurring_profiles_due
    ON caratloop.recurring_profiles(company_id, status, next_run_date);

DROP TRIGGER IF EXISTS trg_audit_recurring_profiles ON caratloop.recurring_profiles;
CREATE TRIGGER trg_audit_recurring_profiles AFTER INSERT OR UPDATE OR DELETE ON caratloop.recurring_profiles FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();
