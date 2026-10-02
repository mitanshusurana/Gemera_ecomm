-- Seed the first ERP company and its owner user on an EMPTY caratloop_erp database.
--
-- Nothing in the ERP creates these rows: the Alembic migrations only install the
-- schema, ADMIN_EMAIL / ADMIN_PASSWORD in .env.erp are read solely by
-- settings.validate_runtime() (projects/erp-backend/app/core/config.py), and
-- POST /api/v1/users needs an already-signed-in owner. The AFTER INSERT trigger
-- trg_provision_company_accounts on caratloop.companies (migrations/sql/0003_...,
-- redefined in 0007_...) then provisions the account groups, the chart of accounts
-- (BNK-001, SAL-001, GST-001.., STK-.., COGS-.., RCM-.., ITC-..), the stock
-- locations and the current + next fiscal year for the new company.
--
-- Usage (values come from psql variables so the password never sits in the file):
--   docker compose -f docker-compose.erp.yml --env-file .env.erp exec -T erp-db \
--     psql -U caratloop -d caratloop_erp -v ON_ERROR_STOP=1 \
--       -v email="'erp-admin@example.com'" -v password="'ChangeMe-12345!'" \
--       -v company_name="'Caratloop'" -v legal_name="'Caratloop Jewels'" \
--       -v gstin="'08AAAAA0000A1Z5'" < scripts/erp-seed-first-company.sql
--
-- Idempotent: re-running with the same e-mail does nothing.
-- Password hashing uses pgcrypto's bcrypt ($2a$), which app/api/v1/auth.py accepts.
-- The e-mail is stored lower-cased because the login lower-cases it before lookup.

\set ON_ERROR_STOP on

-- psql does not expand :'var' inside a dollar-quoted DO body, so pass the
-- values through session settings (output suppressed: it would echo the password).
\o /dev/null
SELECT set_config('seed.email',        :'email',        false),
       set_config('seed.password',     :'password',     false),
       set_config('seed.company_name', :'company_name', false),
       set_config('seed.legal_name',   :'legal_name',   false),
       set_config('seed.gstin',        :'gstin',        false);
\o

DO $seed$
DECLARE
    v_company_id uuid;
    v_email      text := lower(current_setting('seed.email'));
BEGIN
    IF EXISTS (SELECT 1 FROM caratloop.users WHERE lower(email) = v_email) THEN
        RAISE NOTICE 'ERP user % already exists; nothing to do', v_email;
        RETURN;
    END IF;

    SELECT id INTO v_company_id
      FROM caratloop.companies
     WHERE is_active
     ORDER BY created_at
     LIMIT 1;

    IF v_company_id IS NULL THEN
        INSERT INTO caratloop.companies (name, legal_name, gstin, state_code, state_name,
                                         address_line1, city, pincode)
        VALUES (current_setting('seed.company_name'), current_setting('seed.legal_name'),
                NULLIF(current_setting('seed.gstin'), ''), '08', 'Rajasthan',
                'S149 Mahaveer Nagar', 'Jaipur', '302018')
        RETURNING id INTO v_company_id;
        RAISE NOTICE 'Created company % (%)', current_setting('seed.company_name'), v_company_id;
    END IF;

    INSERT INTO caratloop.users (company_id, full_name, email, password_hash, role, is_active)
    VALUES (v_company_id, 'ERP Owner', v_email,
            public.crypt(current_setting('seed.password'), public.gen_salt('bf', 12)), 'owner', TRUE);
    RAISE NOTICE 'Created owner user % for company %', v_email, v_company_id;
END
$seed$;

SELECT c.id AS company_id, c.name, c.gstin,
       (SELECT count(*) FROM caratloop.accounts a WHERE a.company_id = c.id) AS accounts,
       (SELECT count(*) FROM caratloop.fiscal_years f WHERE f.company_id = c.id) AS fiscal_years
  FROM caratloop.companies c
 WHERE c.is_active;
