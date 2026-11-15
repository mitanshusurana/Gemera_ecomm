-- A record of every document e-mailed from the books: what was sent, to
-- whom, by whom, and whether the mail server accepted it. A failed attempt
-- is kept too, so a claim that something was sent can be checked.
CREATE TABLE IF NOT EXISTS caratloop.email_log (
    id             BIGSERIAL PRIMARY KEY,
    company_id     UUID NOT NULL REFERENCES caratloop.companies(id),
    kind           VARCHAR(20) NOT NULL,
    to_address     VARCHAR(500) NOT NULL,
    cc_address     VARCHAR(500),
    subject        VARCHAR(300) NOT NULL,
    reference_type VARCHAR(30),
    reference_id   VARCHAR(60),
    status         VARCHAR(10) NOT NULL,
    error          TEXT,
    sent_at        TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    sent_by        UUID REFERENCES caratloop.users(id),
    CONSTRAINT chk_email_log_status CHECK (((status)::text = ANY ((ARRAY[
        'Sent'::character varying,
        'Failed'::character varying
    ])::text[])))
);
CREATE INDEX IF NOT EXISTS ix_email_log_company_sent
    ON caratloop.email_log(company_id, sent_at DESC);
