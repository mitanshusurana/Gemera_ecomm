-- Caratloop ERP baseline schema.
--
-- This is the schema the application was actually written against, captured
-- from the running database (created 2026-08-02) and never previously version
-- controlled. It is the base of the merge because the app depends on columns
-- only it has: sales.py reads journal_entries.entry_uuid, which a
-- reconstruction from INSERT statements alone could not have discovered.
--
-- It also carries design the reconstruction lacked entirely -- e-invoicing
-- (IRN, acknowledgement, QR, status), e-way bill fields, hash-chained audit
-- rows (audit_log.prev_hash), fiscal-period locking, a hierarchical chart of
-- accounts, cost centres, and reversal tracking on journal entries.
--
-- Migration 0002 layers the integrity work on top: CHECK constraints, atomic
-- document numbering, broader audit coverage, and the job-work tables.
--
-- Generated with pg_dump --schema-only --no-owner --no-privileges;
-- session SET statements and psql meta-commands stripped.

CREATE SCHEMA IF NOT EXISTS caratloop;

-- Extensions the baseline depends on. pg_dump --schema-only does not emit
-- these, so a fresh database failed on uuid_generate_v4() at the first table.
-- Installed into public so the schema can be dropped and recreated without
-- taking the extensions with it.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "pgcrypto"  WITH SCHEMA public;

-- Name: caratloop; Type: SCHEMA; Schema: -; Owner: -


-- Name: fn_audit_trigger(); Type: FUNCTION; Schema: caratloop; Owner: -

CREATE FUNCTION caratloop.fn_audit_trigger() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_user_id   UUID;
    v_session_id BIGINT;
    v_ip_address INET;
    v_reason    TEXT;
    v_old_val   JSONB;
    v_new_val   JSONB;
    v_changed   TEXT[];
    v_row_hash  TEXT;
    v_prev_hash TEXT;
BEGIN
    BEGIN
        v_user_id    := current_setting('app.user_id')::UUID;
        v_session_id := current_setting('app.session_id')::BIGINT;
        v_ip_address := current_setting('app.ip_address')::INET;
        v_reason     := current_setting('app.reason');
    EXCEPTION WHEN OTHERS THEN
        v_user_id    := NULL;
        v_session_id := NULL;
        v_ip_address := NULL;
        v_reason     := 'System';
    END;

    IF TG_OP = 'INSERT' THEN
        v_new_val := to_jsonb(NEW);
        v_old_val := NULL;
    ELSIF TG_OP = 'UPDATE' THEN
        v_old_val := to_jsonb(OLD);
        v_new_val := to_jsonb(NEW);
        SELECT array_agg(key) INTO v_changed
        FROM jsonb_each(v_old_val) old_fields
        WHERE old_fields.value IS DISTINCT FROM (v_new_val -> old_fields.key);
    ELSIF TG_OP = 'DELETE' THEN
        v_old_val := to_jsonb(OLD);
        v_new_val := NULL;
    END IF;

    IF v_new_val IS NOT NULL THEN
        v_row_hash := encode(digest(v_new_val::TEXT, 'sha256'), 'hex');
    END IF;
    
    SELECT row_hash INTO v_prev_hash 
    FROM audit_log 
    WHERE table_name = TG_TABLE_NAME 
    ORDER BY id DESC LIMIT 1;

    INSERT INTO audit_log (
        company_id, user_id, session_id, action, table_name, record_id,
        old_value, new_value, changed_fields, reason, ip_address,
        server_timestamp, row_hash, prev_hash
    ) VALUES (
        COALESCE((v_new_val->>'company_id')::UUID, (v_old_val->>'company_id')::UUID),
        v_user_id,
        v_session_id,
        TG_OP,
        TG_TABLE_NAME,
        COALESCE((v_new_val->>'id')::TEXT, (v_old_val->>'id')::TEXT),
        v_old_val,
        v_new_val,
        v_changed,
        v_reason,
        v_ip_address,
        clock_timestamp(),      -- Server-side timestamp, cannot be manipulated [MCA-11g]
        v_row_hash,
        v_prev_hash
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Name: fn_calculate_jewelry_gst(numeric, numeric, character varying, character varying, numeric, numeric); Type: FUNCTION; Schema: caratloop; Owner: -

CREATE FUNCTION caratloop.fn_calculate_jewelry_gst(p_material_value numeric, p_making_charges numeric, p_seller_state_code character varying, p_buyer_state_code character varying, p_material_gst_rate numeric DEFAULT 3.00, p_making_gst_rate numeric DEFAULT 5.00) RETURNS TABLE(is_inter_state boolean, material_tax_amount numeric, making_tax_amount numeric, total_tax numeric, igst_material numeric, igst_making numeric, cgst_material numeric, sgst_material numeric, cgst_making numeric, sgst_making numeric)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_material_tax NUMERIC;
    v_making_tax   NUMERIC;
    v_inter_state  BOOLEAN;
BEGIN
    v_material_tax := ROUND(p_material_value * p_material_gst_rate / 100, 2);
    v_making_tax   := ROUND(p_making_charges * p_making_gst_rate / 100, 2);
    v_inter_state  := (p_seller_state_code != p_buyer_state_code);

    RETURN QUERY SELECT
        v_inter_state,
        v_material_tax,
        v_making_tax,
        v_material_tax + v_making_tax,
        CASE WHEN v_inter_state THEN v_material_tax ELSE 0 END,
        CASE WHEN v_inter_state THEN v_making_tax   ELSE 0 END,
        CASE WHEN NOT v_inter_state THEN ROUND(v_material_tax / 2, 2) ELSE 0 END,
        CASE WHEN NOT v_inter_state THEN ROUND(v_material_tax / 2, 2) ELSE 0 END,
        CASE WHEN NOT v_inter_state THEN ROUND(v_making_tax   / 2, 2) ELSE 0 END,
        CASE WHEN NOT v_inter_state THEN ROUND(v_making_tax   / 2, 2) ELSE 0 END;
END;
$$;

-- Name: fn_calculate_rcm_old_gold(numeric, boolean, character varying, character varying); Type: FUNCTION; Schema: caratloop; Owner: -

CREATE FUNCTION caratloop.fn_calculate_rcm_old_gold(p_purchase_value numeric, p_vendor_registered boolean, p_seller_state_code character varying DEFAULT '08'::character varying, p_buyer_state_code character varying DEFAULT '08'::character varying) RETURNS TABLE(is_rcm_applicable boolean, rcm_rate numeric, igst_rcm numeric, cgst_rcm numeric, sgst_rcm numeric, total_rcm numeric)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_rcm_amount NUMERIC;
    v_inter_state BOOLEAN;
    v_rcm_rate   NUMERIC := 3.00; -- 3% GST on old gold [Notif 13/2017-CT(Rate)]
BEGIN
    IF p_vendor_registered THEN
        RETURN QUERY SELECT FALSE, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
        RETURN;
    END IF;

    v_rcm_amount  := ROUND(p_purchase_value * v_rcm_rate / 100, 2);
    v_inter_state := (p_seller_state_code != p_buyer_state_code);

    RETURN QUERY SELECT
        TRUE,
        v_rcm_rate,
        CASE WHEN v_inter_state THEN v_rcm_amount ELSE 0 END,
        CASE WHEN NOT v_inter_state THEN ROUND(v_rcm_amount / 2, 2) ELSE 0 END,
        CASE WHEN NOT v_inter_state THEN ROUND(v_rcm_amount / 2, 2) ELSE 0 END,
        v_rcm_amount;
END;
$$;

-- Name: fn_get_stock_balance(uuid, uuid, date); Type: FUNCTION; Schema: caratloop; Owner: -

CREATE FUNCTION caratloop.fn_get_stock_balance(p_material_id uuid, p_location_id uuid DEFAULT NULL::uuid, p_as_of_date date DEFAULT CURRENT_DATE) RETURNS TABLE(material_id uuid, location_id uuid, closing_qty numeric, closing_weight numeric, valuation_rate numeric, total_value numeric)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        sle.material_id,
        sle.location_id,
        SUM(CASE WHEN sle.direction = 'I' THEN sle.quantity ELSE -sle.quantity END) AS closing_qty,
        SUM(CASE WHEN sle.direction = 'I' THEN COALESCE(sle.net_weight,0) ELSE -COALESCE(sle.net_weight,0) END) AS closing_weight,
        AVG(sle.rate) AS valuation_rate,
        SUM(CASE WHEN sle.direction = 'I' THEN COALESCE(sle.amount,0) ELSE -COALESCE(sle.amount,0) END) AS total_value
    FROM stock_ledger_entries sle
    WHERE sle.material_id = p_material_id
      AND (p_location_id IS NULL OR sle.location_id = p_location_id)
      AND sle.entry_date <= p_as_of_date
    GROUP BY sle.material_id, sle.location_id;
END;
$$;

-- Name: fn_validate_journal_balance(); Type: FUNCTION; Schema: caratloop; Owner: -

CREATE FUNCTION caratloop.fn_validate_journal_balance() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN NEW;
END;
$$;

-- Name: account_groups; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.account_groups (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    code character varying(20) NOT NULL,
    name character varying(100) NOT NULL,
    parent_id uuid,
    nature character varying(20) NOT NULL,
    affects_pl boolean DEFAULT false NOT NULL,
    CONSTRAINT chk_account_group_nature CHECK (((nature)::text = ANY ((ARRAY['Assets'::character varying, 'Liabilities'::character varying, 'Income'::character varying, 'Expenses'::character varying, 'Equity'::character varying])::text[])))
);

-- Name: accounts; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.accounts (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    group_id uuid NOT NULL,
    code character varying(20) NOT NULL,
    name character varying(200) NOT NULL,
    account_type character varying(50) NOT NULL,
    normal_balance character(1) NOT NULL,
    currency character varying(3) DEFAULT 'INR'::character varying NOT NULL,
    gstin character varying(15),
    opening_balance numeric(18,4) DEFAULT 0 NOT NULL,
    opening_balance_type character(1),
    is_system boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    created_by uuid,
    CONSTRAINT chk_account_type CHECK (((account_type)::text = ANY ((ARRAY['Bank'::character varying, 'Cash'::character varying, 'Debtor'::character varying, 'Creditor'::character varying, 'GST_Input'::character varying, 'GST_Output'::character varying, 'GST_RCM'::character varying, 'Income'::character varying, 'Expense'::character varying, 'Stock_Asset'::character varying, 'Fixed_Asset'::character varying, 'Capital'::character varying, 'Loan'::character varying, 'Provision'::character varying, 'Other'::character varying])::text[]))),
    CONSTRAINT chk_normal_balance CHECK ((normal_balance = ANY (ARRAY['D'::bpchar, 'C'::bpchar])))
);

-- Name: audit_log; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.audit_log (
    id bigint NOT NULL,
    log_uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid,
    user_id uuid,
    session_id bigint,
    action character varying(10) NOT NULL,
    table_name text NOT NULL,
    record_id text NOT NULL,
    old_value jsonb,
    new_value jsonb,
    changed_fields text[],
    reason text,
    ip_address inet,
    server_timestamp timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    application_version character varying(20),
    row_hash text,
    prev_hash text,
    sequence_no bigint NOT NULL,
    CONSTRAINT chk_audit_action CHECK (((action)::text = ANY ((ARRAY['INSERT'::character varying, 'UPDATE'::character varying, 'DELETE'::character varying])::text[])))
);

-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: caratloop; Owner: -

CREATE SEQUENCE caratloop.audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: caratloop; Owner: -

ALTER SEQUENCE caratloop.audit_log_id_seq OWNED BY caratloop.audit_log.id;

-- Name: audit_log_sequence_no_seq; Type: SEQUENCE; Schema: caratloop; Owner: -

CREATE SEQUENCE caratloop.audit_log_sequence_no_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: audit_log_sequence_no_seq; Type: SEQUENCE OWNED BY; Schema: caratloop; Owner: -

ALTER SEQUENCE caratloop.audit_log_sequence_no_seq OWNED BY caratloop.audit_log.sequence_no;

-- Name: bank_statement_lines; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.bank_statement_lines (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    bank_account_id uuid NOT NULL,
    import_batch_id uuid NOT NULL,
    txn_date date NOT NULL,
    value_date date,
    description text,
    ref_no character varying(100),
    debit numeric(15,2) DEFAULT 0,
    credit numeric(15,2) DEFAULT 0,
    balance numeric(15,2) DEFAULT 0,
    is_reconciled boolean DEFAULT false,
    reconciled_entry_id uuid,
    reconciled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);

-- Name: bom_headers; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.bom_headers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    product_id uuid NOT NULL,
    bom_version character varying(10) DEFAULT '1.0'::character varying NOT NULL,
    effective_from date NOT NULL,
    effective_to date,
    is_active boolean DEFAULT true NOT NULL,
    remarks text,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    created_by uuid
);

-- Name: bom_lines; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.bom_lines (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    bom_id uuid NOT NULL,
    sequence_no integer NOT NULL,
    material_id uuid NOT NULL,
    quantity_per_unit numeric(14,6) NOT NULL,
    uom_id uuid NOT NULL,
    standard_loss_pct numeric(5,2) DEFAULT 0 NOT NULL,
    loss_type character varying(30),
    notes text
);

-- Name: companies; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.companies (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(200) NOT NULL,
    legal_name character varying(200) NOT NULL,
    gstin character varying(15),
    pan character varying(10),
    cin character varying(21),
    tan character varying(10),
    msme_reg_no character varying(50),
    address_line1 character varying(255),
    address_line2 character varying(255),
    city character varying(100),
    state_code character varying(2) DEFAULT '08'::character varying NOT NULL,
    state_name character varying(100) DEFAULT 'Rajasthan'::character varying NOT NULL,
    pincode character varying(6),
    phone character varying(15),
    email character varying(255),
    website character varying(255),
    logo_url text,
    fiscal_year_start integer DEFAULT 4 NOT NULL,
    base_currency character varying(3) DEFAULT 'INR'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT chk_gstin_format CHECK (((gstin IS NULL) OR ((gstin)::text ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$'::text)))
);

-- Name: cost_centers; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.cost_centers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    code character varying(20) NOT NULL,
    name character varying(100) NOT NULL,
    parent_id uuid,
    is_active boolean DEFAULT true NOT NULL
);

-- Name: credit_notes; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.credit_notes (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    fiscal_year_id uuid NOT NULL,
    cn_no character varying(30) NOT NULL,
    cn_date date NOT NULL,
    original_invoice_id uuid NOT NULL,
    party_id uuid NOT NULL,
    reason text NOT NULL,
    amount numeric(18,2) NOT NULL,
    gst_reversal numeric(14,2) DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'Draft'::character varying NOT NULL,
    journal_entry_id uuid,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    created_by uuid NOT NULL
);

-- Name: debit_notes; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.debit_notes (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    fiscal_year_id uuid NOT NULL,
    dn_no character varying(30) NOT NULL,
    dn_date date NOT NULL,
    original_invoice_id uuid NOT NULL,
    party_id uuid NOT NULL,
    reason text NOT NULL,
    amount numeric(18,2) NOT NULL,
    gst_reversal numeric(14,2) DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'Draft'::character varying NOT NULL,
    journal_entry_id uuid,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    created_by uuid NOT NULL
);

-- Name: fiscal_years; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.fiscal_years (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    year_label character varying(10) NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    is_locked boolean DEFAULT false NOT NULL,
    locked_at timestamp with time zone,
    locked_by uuid,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT chk_fiscal_dates CHECK ((end_date > start_date))
);

-- Name: gst_output_tax_register; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.gst_output_tax_register (
    id bigint NOT NULL,
    entry_uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    fiscal_year_id uuid NOT NULL,
    return_period character(7) NOT NULL,
    invoice_id uuid,
    invoice_no character varying(30),
    invoice_date date NOT NULL,
    party_id uuid,
    party_gstin character varying(15),
    place_of_supply character varying(2) NOT NULL,
    is_inter_state boolean DEFAULT false NOT NULL,
    supply_type character varying(30) NOT NULL,
    hsn_material character varying(8),
    hsn_making character varying(8),
    taxable_material_value numeric(18,2) DEFAULT 0 NOT NULL,
    material_gst_rate numeric(5,2) DEFAULT 3.00 NOT NULL,
    taxable_making_value numeric(18,2) DEFAULT 0 NOT NULL,
    making_gst_rate numeric(5,2) DEFAULT 5.00 NOT NULL,
    igst_amount numeric(14,2) DEFAULT 0 NOT NULL,
    cgst_amount numeric(14,2) DEFAULT 0 NOT NULL,
    sgst_amount numeric(14,2) DEFAULT 0 NOT NULL,
    total_tax numeric(14,2) DEFAULT 0 NOT NULL,
    is_credit_note boolean DEFAULT false NOT NULL,
    credit_note_id uuid,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    created_by uuid NOT NULL
);

-- Name: gst_output_tax_register_id_seq; Type: SEQUENCE; Schema: caratloop; Owner: -

CREATE SEQUENCE caratloop.gst_output_tax_register_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: gst_output_tax_register_id_seq; Type: SEQUENCE OWNED BY; Schema: caratloop; Owner: -

ALTER SEQUENCE caratloop.gst_output_tax_register_id_seq OWNED BY caratloop.gst_output_tax_register.id;

-- Name: itc_register; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.itc_register (
    id bigint NOT NULL,
    entry_uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    fiscal_year_id uuid NOT NULL,
    return_period character(7) NOT NULL,
    invoice_id uuid,
    vendor_invoice_no character varying(50),
    invoice_date date NOT NULL,
    vendor_id uuid NOT NULL,
    vendor_gstin character varying(15),
    itc_type character varying(30) NOT NULL,
    igst_credit numeric(14,2) DEFAULT 0 NOT NULL,
    cgst_credit numeric(14,2) DEFAULT 0 NOT NULL,
    sgst_credit numeric(14,2) DEFAULT 0 NOT NULL,
    total_itc numeric(14,2) DEFAULT 0 NOT NULL,
    is_eligible boolean DEFAULT true NOT NULL,
    ineligibility_reason text,
    itc_availed_period character(7),
    is_provisional boolean DEFAULT false NOT NULL,
    gstr2b_matched boolean DEFAULT false NOT NULL,
    gstr2b_match_date date,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    created_by uuid NOT NULL
);

-- Name: itc_register_id_seq; Type: SEQUENCE; Schema: caratloop; Owner: -

CREATE SEQUENCE caratloop.itc_register_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: itc_register_id_seq; Type: SEQUENCE OWNED BY; Schema: caratloop; Owner: -

ALTER SEQUENCE caratloop.itc_register_id_seq OWNED BY caratloop.itc_register.id;

-- Name: job_work_orders; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.job_work_orders (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    production_order_id uuid,
    jw_order_no character varying(30) NOT NULL,
    order_date date NOT NULL,
    artisan_id uuid NOT NULL,
    is_artisan_registered boolean DEFAULT false NOT NULL,
    work_description text,
    material_issued_date date,
    material_received_date date,
    making_charges numeric(14,2),
    gst_on_making numeric(14,2),
    is_rcm boolean DEFAULT false NOT NULL,
    rcm_liability numeric(14,2),
    status character varying(20) DEFAULT 'Open'::character varying NOT NULL,
    completed_at timestamp with time zone,
    delivery_challan_no character varying(30),
    remarks text,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    created_by uuid NOT NULL
);

-- Name: journal_entries; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.journal_entries (
    id bigint NOT NULL,
    entry_uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    fiscal_year_id uuid NOT NULL,
    entry_no character varying(30) NOT NULL,
    entry_date date NOT NULL,
    entry_type character varying(30) NOT NULL,
    narration text NOT NULL,
    reference_no character varying(50),
    reference_type character varying(50),
    reference_id uuid,
    total_debit numeric(18,4) NOT NULL,
    total_credit numeric(18,4) NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    ip_address inet,
    session_id bigint,
    is_reversal boolean DEFAULT false NOT NULL,
    reversal_of_id bigint,
    reversal_reason text,
    sequence_no bigint NOT NULL,
    status character varying(20) DEFAULT 'Posted'::character varying NOT NULL,
    cost_center_id uuid,
    CONSTRAINT chk_double_entry CHECK ((abs((total_debit - total_credit)) < 0.01)),
    CONSTRAINT chk_je_status CHECK (((status)::text = ANY ((ARRAY['Posted'::character varying, 'Reversed'::character varying])::text[]))),
    CONSTRAINT chk_je_type CHECK (((entry_type)::text = ANY ((ARRAY['Sales'::character varying, 'Purchase'::character varying, 'Receipt'::character varying, 'Payment'::character varying, 'Contra'::character varying, 'Journal'::character varying, 'Opening'::character varying, 'Closing'::character varying, 'Depreciation'::character varying, 'RCM_Payment'::character varying, 'ITC_Utilization'::character varying, 'Stock_Adjustment'::character varying, 'Reversal'::character varying, 'Bank_Reconciliation'::character varying])::text[])))
);

-- Name: journal_entries_id_seq; Type: SEQUENCE; Schema: caratloop; Owner: -

CREATE SEQUENCE caratloop.journal_entries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: journal_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: caratloop; Owner: -

ALTER SEQUENCE caratloop.journal_entries_id_seq OWNED BY caratloop.journal_entries.id;

-- Name: journal_entry_lines; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.journal_entry_lines (
    id bigint NOT NULL,
    journal_entry_id bigint NOT NULL,
    sequence_no integer NOT NULL,
    account_id uuid NOT NULL,
    party_id uuid,
    dr_amount numeric(18,4) DEFAULT 0 NOT NULL,
    cr_amount numeric(18,4) DEFAULT 0 NOT NULL,
    narration text,
    cost_center_id uuid,
    is_reconciled boolean DEFAULT false NOT NULL,
    reconciled_at timestamp with time zone,
    reconciled_by uuid,
    CONSTRAINT chk_jel_debit_credit CHECK ((((dr_amount > (0)::numeric) AND (cr_amount = (0)::numeric)) OR ((cr_amount > (0)::numeric) AND (dr_amount = (0)::numeric))))
);

-- Name: journal_entry_lines_id_seq; Type: SEQUENCE; Schema: caratloop; Owner: -

CREATE SEQUENCE caratloop.journal_entry_lines_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: journal_entry_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: caratloop; Owner: -

ALTER SEQUENCE caratloop.journal_entry_lines_id_seq OWNED BY caratloop.journal_entry_lines.id;

-- Name: journal_entry_seq; Type: SEQUENCE; Schema: caratloop; Owner: -

CREATE SEQUENCE caratloop.journal_entry_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: materials; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.materials (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    code character varying(30) NOT NULL,
    name character varying(200) NOT NULL,
    category character varying(50) NOT NULL,
    hsn_code character varying(8),
    uom_id uuid NOT NULL,
    secondary_uom_id uuid,
    purity_standard character varying(20),
    gem_shape character varying(50),
    gem_size_mm numeric(5,2),
    gem_cut character varying(50),
    gem_quality character varying(20),
    is_raw_material boolean DEFAULT true NOT NULL,
    is_finished_good boolean DEFAULT false NOT NULL,
    reorder_level numeric(14,4),
    stock_account_id uuid,
    purchase_account_id uuid,
    sales_account_id uuid,
    gst_tax_rate numeric(5,2),
    is_active boolean DEFAULT true NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    created_by uuid
);

-- Name: parties; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.parties (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    account_id uuid NOT NULL,
    party_type character varying(10) NOT NULL,
    party_code character varying(20) NOT NULL,
    name character varying(200) NOT NULL,
    trade_name character varying(200),
    gstin character varying(15),
    pan character varying(10),
    gst_reg_type character varying(30) DEFAULT 'Unregistered'::character varying NOT NULL,
    address_line1 character varying(255),
    address_line2 character varying(255),
    city character varying(100),
    state_code character varying(2),
    state_name character varying(100),
    pincode character varying(6),
    phone character varying(15),
    email character varying(255),
    is_old_gold_supplier boolean DEFAULT false NOT NULL,
    credit_limit numeric(18,2),
    credit_days integer DEFAULT 30,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    created_by uuid,
    aadhaar_no character varying(20),
    kyc_documents jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT chk_gst_reg_type CHECK (((gst_reg_type)::text = ANY ((ARRAY['Regular'::character varying, 'Composition'::character varying, 'Unregistered'::character varying, 'Consumer'::character varying, 'SEZ'::character varying, 'Export'::character varying])::text[]))),
    CONSTRAINT chk_party_type CHECK (((party_type)::text = ANY ((ARRAY['Customer'::character varying, 'Vendor'::character varying, 'Both'::character varying])::text[])))
);

-- Name: payment_allocations; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.payment_allocations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    payment_id uuid NOT NULL,
    invoice_type character varying(20) NOT NULL,
    invoice_id uuid NOT NULL,
    allocated_amount numeric(18,2) NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);

-- Name: payment_receipts; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.payment_receipts (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    fiscal_year_id uuid NOT NULL,
    voucher_no character varying(30) NOT NULL,
    voucher_date date NOT NULL,
    voucher_type character varying(20) NOT NULL,
    party_id uuid NOT NULL,
    bank_account_id uuid NOT NULL,
    payment_mode character varying(20) NOT NULL,
    cheque_no character varying(30),
    cheque_date date,
    bank_ref_no character varying(50),
    amount numeric(18,2) NOT NULL,
    tds_deducted numeric(14,2) DEFAULT 0 NOT NULL,
    narration text,
    is_reconciled boolean DEFAULT false NOT NULL,
    reconciled_at timestamp with time zone,
    journal_entry_id bigint,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    created_by uuid NOT NULL,
    CONSTRAINT chk_payment_mode CHECK (((payment_mode)::text = ANY ((ARRAY['Cash'::character varying, 'Cheque'::character varying, 'NEFT'::character varying, 'RTGS'::character varying, 'UPI'::character varying, 'IMPS'::character varying, 'DD'::character varying, 'Online'::character varying])::text[]))),
    CONSTRAINT chk_voucher_type CHECK (((voucher_type)::text = ANY ((ARRAY['Receipt'::character varying, 'Payment'::character varying])::text[])))
);

-- Name: production_consumption_entries; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.production_consumption_entries (
    id bigint NOT NULL,
    entry_uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    production_order_id uuid NOT NULL,
    company_id uuid NOT NULL,
    entry_date date NOT NULL,
    material_id uuid NOT NULL,
    batch_no character varying(50),
    qty_issued numeric(14,4) NOT NULL,
    uom_id uuid NOT NULL,
    gross_weight numeric(10,4),
    net_weight numeric(10,4),
    purity numeric(5,4),
    fine_weight numeric(10,4),
    rate numeric(14,4),
    amount numeric(18,2),
    remarks text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    ip_address inet,
    is_reversal boolean DEFAULT false NOT NULL,
    reversal_of_id bigint,
    stock_ledger_entry_id bigint
);

-- Name: production_consumption_entries_id_seq; Type: SEQUENCE; Schema: caratloop; Owner: -

CREATE SEQUENCE caratloop.production_consumption_entries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: production_consumption_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: caratloop; Owner: -

ALTER SEQUENCE caratloop.production_consumption_entries_id_seq OWNED BY caratloop.production_consumption_entries.id;

-- Name: production_orders; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.production_orders (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    fiscal_year_id uuid NOT NULL,
    order_no character varying(30) NOT NULL,
    order_date date NOT NULL,
    product_id uuid NOT NULL,
    bom_id uuid NOT NULL,
    planned_qty numeric(10,3) NOT NULL,
    actual_qty numeric(10,3),
    status character varying(20) DEFAULT 'Draft'::character varying NOT NULL,
    production_location_id uuid,
    artisan_id uuid,
    job_work_type character varying(20),
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    month_year character(7),
    remarks text,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    created_by uuid NOT NULL,
    approved_by uuid,
    CONSTRAINT chk_po_status CHECK (((status)::text = ANY ((ARRAY['Draft'::character varying, 'Released'::character varying, 'In_Progress'::character varying, 'Completed'::character varying, 'Cancelled'::character varying])::text[])))
);

-- Name: production_output_entries; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.production_output_entries (
    id bigint NOT NULL,
    entry_uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    production_order_id uuid NOT NULL,
    company_id uuid NOT NULL,
    entry_date date NOT NULL,
    material_id uuid NOT NULL,
    qty_produced numeric(14,4) NOT NULL,
    uom_id uuid NOT NULL,
    gross_weight numeric(10,4),
    net_weight numeric(10,4),
    hallmark_no character varying(50),
    quality_grade character varying(10),
    valuation_rate numeric(14,4),
    remarks text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    ip_address inet,
    is_reversal boolean DEFAULT false NOT NULL,
    reversal_of_id bigint,
    stock_ledger_entry_id bigint
);

-- Name: production_output_entries_id_seq; Type: SEQUENCE; Schema: caratloop; Owner: -

CREATE SEQUENCE caratloop.production_output_entries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: production_output_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: caratloop; Owner: -

ALTER SEQUENCE caratloop.production_output_entries_id_seq OWNED BY caratloop.production_output_entries.id;

-- Name: production_wastage_entries; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.production_wastage_entries (
    id bigint NOT NULL,
    entry_uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    production_order_id uuid NOT NULL,
    company_id uuid NOT NULL,
    entry_date date NOT NULL,
    wastage_type character varying(30) NOT NULL,
    material_id uuid NOT NULL,
    qty_lost numeric(14,4) NOT NULL,
    uom_id uuid NOT NULL,
    loss_pct numeric(5,4),
    standard_loss_pct numeric(5,4),
    variance_qty numeric(14,4),
    recoverable_qty numeric(14,4) DEFAULT 0,
    rate numeric(14,4),
    amount numeric(18,2),
    remarks text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    ip_address inet,
    CONSTRAINT chk_wastage_type CHECK (((wastage_type)::text = ANY ((ARRAY['Melting_Loss'::character varying, 'Polishing_Loss'::character varying, 'Cutting_Loss'::character varying, 'Polishing_Dust'::character varying, 'Scrap_Recoverable'::character varying, 'Scrap_Non_Recoverable'::character varying, 'Stone_Chipping'::character varying])::text[])))
);

-- Name: production_wastage_entries_id_seq; Type: SEQUENCE; Schema: caratloop; Owner: -

CREATE SEQUENCE caratloop.production_wastage_entries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: production_wastage_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: caratloop; Owner: -

ALTER SEQUENCE caratloop.production_wastage_entries_id_seq OWNED BY caratloop.production_wastage_entries.id;

-- Name: products; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.products (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    material_id uuid NOT NULL,
    sku character varying(50) NOT NULL,
    name character varying(200) NOT NULL,
    collection_name character varying(100),
    product_type character varying(30) NOT NULL,
    design_no character varying(50),
    standard_weight numeric(8,4),
    standard_making_time_hrs numeric(6,2),
    description text,
    image_url text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);

-- Name: purchase_invoice_lines; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.purchase_invoice_lines (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    invoice_id uuid NOT NULL,
    sequence_no integer NOT NULL,
    material_id uuid NOT NULL,
    hsn_sac_code character varying(8) NOT NULL,
    description character varying(500),
    quantity numeric(10,4) NOT NULL,
    uom_id uuid NOT NULL,
    gross_weight numeric(10,4),
    net_weight numeric(10,4),
    purity numeric(5,4),
    fine_weight numeric(10,4),
    rate numeric(14,4) NOT NULL,
    material_value numeric(14,4) NOT NULL,
    is_rcm boolean DEFAULT false NOT NULL,
    gst_rate numeric(5,2) DEFAULT 3.00 NOT NULL,
    igst_amount numeric(14,2) DEFAULT 0 NOT NULL,
    cgst_amount numeric(14,2) DEFAULT 0 NOT NULL,
    sgst_amount numeric(14,2) DEFAULT 0 NOT NULL,
    rcm_igst numeric(14,2) DEFAULT 0 NOT NULL,
    rcm_cgst numeric(14,2) DEFAULT 0 NOT NULL,
    rcm_sgst numeric(14,2) DEFAULT 0 NOT NULL,
    line_total numeric(14,2) DEFAULT 0 NOT NULL,
    itc_eligible boolean DEFAULT true NOT NULL,
    batch_no character varying(50),
    stock_entry_id bigint
);

-- Name: purchase_invoices; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.purchase_invoices (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    fiscal_year_id uuid NOT NULL,
    bill_no character varying(30) NOT NULL,
    vendor_inv_no character varying(50),
    bill_date date NOT NULL,
    vendor_id uuid NOT NULL,
    vendor_gstin character varying(15),
    vendor_state_code character varying(2),
    place_of_supply character varying(2) NOT NULL,
    is_inter_state boolean DEFAULT false NOT NULL,
    is_old_gold_purchase boolean DEFAULT false NOT NULL,
    is_rcm_applicable boolean DEFAULT false NOT NULL,
    subtotal_value numeric(18,2) DEFAULT 0 NOT NULL,
    taxable_value numeric(18,2) DEFAULT 0 NOT NULL,
    igst_amount numeric(14,2) DEFAULT 0 NOT NULL,
    cgst_amount numeric(14,2) DEFAULT 0 NOT NULL,
    sgst_amount numeric(14,2) DEFAULT 0 NOT NULL,
    rcm_igst numeric(14,2) DEFAULT 0 NOT NULL,
    rcm_cgst numeric(14,2) DEFAULT 0 NOT NULL,
    rcm_sgst numeric(14,2) DEFAULT 0 NOT NULL,
    total_gst numeric(14,2) DEFAULT 0 NOT NULL,
    grand_total numeric(18,2) DEFAULT 0 NOT NULL,
    itc_eligible boolean DEFAULT true NOT NULL,
    itc_ineligible_reason text,
    payment_status character varying(20) DEFAULT 'Unpaid'::character varying NOT NULL,
    status character varying(20) DEFAULT 'Draft'::character varying NOT NULL,
    narration text,
    journal_entry_id uuid,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    created_by uuid NOT NULL,
    attachment_url text,
    vendor_invoice_date date,
    CONSTRAINT chk_pi_status CHECK (((status)::text = ANY ((ARRAY['Draft'::character varying, 'Approved'::character varying, 'Posted'::character varying, 'Cancelled'::character varying])::text[])))
);

-- Name: rcm_liability_register; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.rcm_liability_register (
    id bigint NOT NULL,
    entry_uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    fiscal_year_id uuid NOT NULL,
    return_period character(7) NOT NULL,
    transaction_date date NOT NULL,
    vendor_id uuid NOT NULL,
    vendor_name character varying(200) NOT NULL,
    vendor_pan character varying(10),
    purchase_invoice_id uuid,
    description character varying(500),
    purchase_value numeric(18,2) NOT NULL,
    rcm_rate numeric(5,2) DEFAULT 3.00 NOT NULL,
    igst_rcm numeric(14,2) DEFAULT 0 NOT NULL,
    cgst_rcm numeric(14,2) DEFAULT 0 NOT NULL,
    sgst_rcm numeric(14,2) DEFAULT 0 NOT NULL,
    total_rcm numeric(14,2) DEFAULT 0 NOT NULL,
    payment_period character(7),
    is_paid boolean DEFAULT false NOT NULL,
    paid_at timestamp with time zone,
    journal_entry_id bigint,
    itc_availed boolean DEFAULT false NOT NULL,
    itc_availed_period character(7),
    itc_register_id bigint,
    remarks text,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    created_by uuid NOT NULL
);

-- Name: rcm_liability_register_id_seq; Type: SEQUENCE; Schema: caratloop; Owner: -

CREATE SEQUENCE caratloop.rcm_liability_register_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: rcm_liability_register_id_seq; Type: SEQUENCE OWNED BY; Schema: caratloop; Owner: -

ALTER SEQUENCE caratloop.rcm_liability_register_id_seq OWNED BY caratloop.rcm_liability_register.id;

-- Name: reconciliation_matches; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.reconciliation_matches (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    book_entry_id uuid NOT NULL,
    bank_entry_id uuid NOT NULL,
    matched_at timestamp with time zone DEFAULT now(),
    matched_by uuid
);

-- Name: sales_invoice_lines; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.sales_invoice_lines (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    invoice_id uuid NOT NULL,
    sequence_no integer NOT NULL,
    product_id uuid,
    material_id uuid,
    hsn_sac_code character varying(8) NOT NULL,
    description character varying(500),
    quantity numeric(10,4) NOT NULL,
    uom_id uuid NOT NULL,
    gross_weight numeric(10,4),
    net_weight numeric(10,4),
    stone_weight numeric(10,4),
    gold_weight numeric(10,4),
    purity numeric(5,4),
    material_value numeric(14,4) DEFAULT 0 NOT NULL,
    making_charges numeric(14,4) DEFAULT 0 NOT NULL,
    other_charges numeric(14,4) DEFAULT 0 NOT NULL,
    discount_pct numeric(5,2) DEFAULT 0,
    discount_amount numeric(14,2) DEFAULT 0,
    taxable_material numeric(14,4) DEFAULT 0 NOT NULL,
    taxable_making numeric(14,4) DEFAULT 0 NOT NULL,
    material_gst_rate numeric(5,2) DEFAULT 3.00 NOT NULL,
    making_gst_rate numeric(5,2) DEFAULT 5.00 NOT NULL,
    igst_material numeric(14,2) DEFAULT 0 NOT NULL,
    igst_making numeric(14,2) DEFAULT 0 NOT NULL,
    cgst_material numeric(14,2) DEFAULT 0 NOT NULL,
    sgst_material numeric(14,2) DEFAULT 0 NOT NULL,
    cgst_making numeric(14,2) DEFAULT 0 NOT NULL,
    sgst_making numeric(14,2) DEFAULT 0 NOT NULL,
    line_total numeric(14,2) DEFAULT 0 NOT NULL,
    batch_no character varying(50),
    stock_entry_id bigint
);

-- Name: sales_invoice_seq; Type: SEQUENCE; Schema: caratloop; Owner: -

CREATE SEQUENCE caratloop.sales_invoice_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: sales_invoices; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.sales_invoices (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    fiscal_year_id uuid NOT NULL,
    invoice_no character varying(30) NOT NULL,
    invoice_date date NOT NULL,
    invoice_type character varying(20) DEFAULT 'Tax_Invoice'::character varying NOT NULL,
    customer_id uuid NOT NULL,
    customer_gstin character varying(15),
    customer_state_code character varying(2),
    place_of_supply character varying(2) NOT NULL,
    is_inter_state boolean DEFAULT false NOT NULL,
    currency character varying(3) DEFAULT 'INR'::character varying NOT NULL,
    exchange_rate numeric(10,4) DEFAULT 1.0,
    subtotal_material_value numeric(18,2) DEFAULT 0 NOT NULL,
    subtotal_making_charges numeric(18,2) DEFAULT 0 NOT NULL,
    subtotal_other_charges numeric(18,2) DEFAULT 0 NOT NULL,
    discount_amount numeric(18,2) DEFAULT 0 NOT NULL,
    taxable_material_value numeric(18,2) DEFAULT 0 NOT NULL,
    taxable_making_value numeric(18,2) DEFAULT 0 NOT NULL,
    igst_material numeric(14,2) DEFAULT 0 NOT NULL,
    igst_making numeric(14,2) DEFAULT 0 NOT NULL,
    cgst_material numeric(14,2) DEFAULT 0 NOT NULL,
    sgst_material numeric(14,2) DEFAULT 0 NOT NULL,
    cgst_making numeric(14,2) DEFAULT 0 NOT NULL,
    sgst_making numeric(14,2) DEFAULT 0 NOT NULL,
    total_gst numeric(14,2) DEFAULT 0 NOT NULL,
    grand_total numeric(18,2) DEFAULT 0 NOT NULL,
    round_off numeric(6,2) DEFAULT 0 NOT NULL,
    amount_in_words text,
    payment_terms character varying(50),
    due_date date,
    payment_status character varying(20) DEFAULT 'Unpaid'::character varying NOT NULL,
    e_invoice_irn character varying(64),
    e_invoice_ack_no character varying(20),
    e_invoice_ack_date timestamp with time zone,
    e_invoice_qr_code text,
    e_invoice_status character varying(20) DEFAULT 'Not_Generated'::character varying,
    eway_bill_no character varying(20),
    eway_bill_date timestamp with time zone,
    status character varying(20) DEFAULT 'Draft'::character varying NOT NULL,
    narration text,
    pdf_url text,
    journal_entry_id uuid,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    created_by uuid NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    posted_at timestamp with time zone,
    CONSTRAINT chk_invoice_status CHECK (((status)::text = ANY ((ARRAY['Draft'::character varying, 'Approved'::character varying, 'Posted'::character varying, 'Cancelled'::character varying])::text[]))),
    CONSTRAINT chk_invoice_type CHECK (((invoice_type)::text = ANY ((ARRAY['Tax_Invoice'::character varying, 'Bill_of_Supply'::character varying, 'Export_Invoice'::character varying, 'Credit_Note_Invoice'::character varying])::text[])))
);

-- Name: session_logs; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.session_logs (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    session_token text NOT NULL,
    login_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    logout_at timestamp with time zone,
    ip_address inet,
    user_agent text,
    device_id text,
    is_active boolean DEFAULT true NOT NULL
);

-- Name: session_logs_id_seq; Type: SEQUENCE; Schema: caratloop; Owner: -

CREATE SEQUENCE caratloop.session_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: session_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: caratloop; Owner: -

ALTER SEQUENCE caratloop.session_logs_id_seq OWNED BY caratloop.session_logs.id;

-- Name: stock_batches; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.stock_batches (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    material_id uuid NOT NULL,
    batch_no character varying(50) NOT NULL,
    manufacture_date date,
    expiry_date date,
    purity_tested numeric(5,4),
    certificate_no character varying(50),
    supplier_id uuid,
    purchase_date date,
    purchase_rate numeric(14,4),
    qty_received numeric(14,4) NOT NULL,
    remarks text,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    created_by uuid
);

-- Name: stock_ledger_entries; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.stock_ledger_entries (
    id bigint NOT NULL,
    entry_uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    fiscal_year_id uuid NOT NULL,
    entry_date date NOT NULL,
    entry_time timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    material_id uuid NOT NULL,
    location_id uuid NOT NULL,
    batch_no character varying(50),
    transaction_type character varying(30) NOT NULL,
    quantity numeric(14,4) NOT NULL,
    direction character(1) NOT NULL,
    rate numeric(14,4),
    amount numeric(18,2),
    gross_weight numeric(10,4),
    net_weight numeric(10,4),
    purity numeric(5,4),
    fine_weight numeric(10,4),
    source_document_type character varying(50),
    source_document_id uuid,
    source_document_no character varying(50),
    remarks text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    ip_address inet,
    session_id bigint,
    is_reversal boolean DEFAULT false NOT NULL,
    reversal_of_id bigint,
    sequence_no bigint NOT NULL,
    CONSTRAINT chk_sle_direction CHECK ((direction = ANY (ARRAY['I'::bpchar, 'O'::bpchar]))),
    CONSTRAINT chk_sle_quantity CHECK ((quantity > (0)::numeric)),
    CONSTRAINT chk_sle_transaction_type CHECK (((transaction_type)::text = ANY ((ARRAY['Opening'::character varying, 'Purchase_Receipt'::character varying, 'Production_Consumption'::character varying, 'Production_Output'::character varying, 'Sale_Delivery'::character varying, 'Stock_Transfer'::character varying, 'Adjustment_In'::character varying, 'Adjustment_Out'::character varying, 'Loss_Theft_Destruction'::character varying, 'Written_Off'::character varying, 'Return_Inward'::character varying, 'Return_Outward'::character varying, 'Job_Work_In'::character varying, 'Job_Work_Out'::character varying, 'Free_Sample'::character varying, 'Gift'::character varying, 'Melting_Loss'::character varying, 'Polishing_Loss'::character varying])::text[])))
);

-- Name: stock_ledger_entries_id_seq; Type: SEQUENCE; Schema: caratloop; Owner: -

CREATE SEQUENCE caratloop.stock_ledger_entries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Name: stock_ledger_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: caratloop; Owner: -

ALTER SEQUENCE caratloop.stock_ledger_entries_id_seq OWNED BY caratloop.stock_ledger_entries.id;

-- Name: stock_locations; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.stock_locations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    code character varying(20) NOT NULL,
    name character varying(100) NOT NULL,
    location_type character varying(30) DEFAULT 'Warehouse'::character varying NOT NULL,
    address text,
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT chk_location_type CHECK (((location_type)::text = ANY ((ARRAY['Vault'::character varying, 'Production_Floor'::character varying, 'Showroom'::character varying, 'Transit'::character varying, 'Godown'::character varying, 'Other'::character varying])::text[])))
);

-- Name: units_of_measure; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.units_of_measure (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    code character varying(10) NOT NULL,
    name character varying(50) NOT NULL,
    uqc_code character varying(10),
    decimal_places integer DEFAULT 3 NOT NULL
);

-- Name: users; Type: TABLE; Schema: caratloop; Owner: -

CREATE TABLE caratloop.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    employee_code character varying(20),
    full_name character varying(200) NOT NULL,
    email character varying(255) NOT NULL,
    phone character varying(15),
    password_hash text NOT NULL,
    role character varying(50) DEFAULT 'accountant'::character varying NOT NULL,
    department character varying(100),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    last_login_at timestamp with time zone,
    CONSTRAINT chk_user_role CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'owner'::character varying, 'accountant'::character varying, 'production_manager'::character varying, 'store_keeper'::character varying, 'auditor'::character varying, 'read_only'::character varying])::text[])))
);

-- Name: v_stock_register; Type: VIEW; Schema: caratloop; Owner: -

CREATE VIEW caratloop.v_stock_register AS
 SELECT m.code AS material_code,
    m.name AS material_name,
    m.category,
    m.gem_size_mm,
    uom.code AS uom,
    sl.name AS location,
    sum(
        CASE
            WHEN (sle.direction = 'I'::bpchar) THEN sle.quantity
            ELSE (- sle.quantity)
        END) AS stock_qty,
    sum(
        CASE
            WHEN (sle.direction = 'I'::bpchar) THEN COALESCE(sle.net_weight, (0)::numeric)
            ELSE (- COALESCE(sle.net_weight, (0)::numeric))
        END) AS stock_weight_gm,
    sum(
        CASE
            WHEN (sle.direction = 'I'::bpchar) THEN COALESCE(sle.amount, (0)::numeric)
            ELSE (- COALESCE(sle.amount, (0)::numeric))
        END) AS stock_value
   FROM (((caratloop.stock_ledger_entries sle
     JOIN caratloop.materials m ON ((m.id = sle.material_id)))
     JOIN caratloop.units_of_measure uom ON ((uom.id = m.uom_id)))
     JOIN caratloop.stock_locations sl ON ((sl.id = sle.location_id)))
  GROUP BY m.id, m.code, m.name, m.category, m.gem_size_mm, uom.code, sl.name;

-- Name: v_trial_balance; Type: VIEW; Schema: caratloop; Owner: -

CREATE VIEW caratloop.v_trial_balance AS
 SELECT a.code AS account_code,
    a.name AS account_name,
    ag.name AS group_name,
    a.normal_balance,
    a.opening_balance,
    a.opening_balance_type,
    COALESCE(sum(jel.dr_amount), (0)::numeric) AS period_debit,
    COALESCE(sum(jel.cr_amount), (0)::numeric) AS period_credit,
        CASE
            WHEN (a.normal_balance = 'D'::bpchar) THEN ((COALESCE(a.opening_balance, (0)::numeric) + COALESCE(sum(jel.dr_amount), (0)::numeric)) - COALESCE(sum(jel.cr_amount), (0)::numeric))
            ELSE ((COALESCE(a.opening_balance, (0)::numeric) + COALESCE(sum(jel.cr_amount), (0)::numeric)) - COALESCE(sum(jel.dr_amount), (0)::numeric))
        END AS closing_balance
   FROM (((caratloop.accounts a
     JOIN caratloop.account_groups ag ON ((a.group_id = ag.id)))
     LEFT JOIN caratloop.journal_entry_lines jel ON ((jel.account_id = a.id)))
     LEFT JOIN caratloop.journal_entries je ON (((je.id = jel.journal_entry_id) AND ((je.status)::text = 'Posted'::text))))
  WHERE (a.is_active = true)
  GROUP BY a.id, a.code, a.name, ag.name, a.normal_balance, a.opening_balance, a.opening_balance_type;

-- Name: audit_log id; Type: DEFAULT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.audit_log ALTER COLUMN id SET DEFAULT nextval('caratloop.audit_log_id_seq'::regclass);

-- Name: audit_log sequence_no; Type: DEFAULT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.audit_log ALTER COLUMN sequence_no SET DEFAULT nextval('caratloop.audit_log_sequence_no_seq'::regclass);

-- Name: gst_output_tax_register id; Type: DEFAULT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.gst_output_tax_register ALTER COLUMN id SET DEFAULT nextval('caratloop.gst_output_tax_register_id_seq'::regclass);

-- Name: itc_register id; Type: DEFAULT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.itc_register ALTER COLUMN id SET DEFAULT nextval('caratloop.itc_register_id_seq'::regclass);

-- Name: journal_entries id; Type: DEFAULT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.journal_entries ALTER COLUMN id SET DEFAULT nextval('caratloop.journal_entries_id_seq'::regclass);

-- Name: journal_entry_lines id; Type: DEFAULT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.journal_entry_lines ALTER COLUMN id SET DEFAULT nextval('caratloop.journal_entry_lines_id_seq'::regclass);

-- Name: production_consumption_entries id; Type: DEFAULT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_consumption_entries ALTER COLUMN id SET DEFAULT nextval('caratloop.production_consumption_entries_id_seq'::regclass);

-- Name: production_output_entries id; Type: DEFAULT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_output_entries ALTER COLUMN id SET DEFAULT nextval('caratloop.production_output_entries_id_seq'::regclass);

-- Name: production_wastage_entries id; Type: DEFAULT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_wastage_entries ALTER COLUMN id SET DEFAULT nextval('caratloop.production_wastage_entries_id_seq'::regclass);

-- Name: rcm_liability_register id; Type: DEFAULT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.rcm_liability_register ALTER COLUMN id SET DEFAULT nextval('caratloop.rcm_liability_register_id_seq'::regclass);

-- Name: session_logs id; Type: DEFAULT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.session_logs ALTER COLUMN id SET DEFAULT nextval('caratloop.session_logs_id_seq'::regclass);

-- Name: stock_ledger_entries id; Type: DEFAULT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.stock_ledger_entries ALTER COLUMN id SET DEFAULT nextval('caratloop.stock_ledger_entries_id_seq'::regclass);

-- Name: account_groups account_groups_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.account_groups
    ADD CONSTRAINT account_groups_pkey PRIMARY KEY (id);

-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);

-- Name: audit_log audit_log_log_uuid_key; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.audit_log
    ADD CONSTRAINT audit_log_log_uuid_key UNIQUE (log_uuid);

-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);

-- Name: bank_statement_lines bank_statement_lines_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.bank_statement_lines
    ADD CONSTRAINT bank_statement_lines_pkey PRIMARY KEY (id);

-- Name: bom_headers bom_headers_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.bom_headers
    ADD CONSTRAINT bom_headers_pkey PRIMARY KEY (id);

-- Name: bom_lines bom_lines_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.bom_lines
    ADD CONSTRAINT bom_lines_pkey PRIMARY KEY (id);

-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);

-- Name: cost_centers cost_centers_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.cost_centers
    ADD CONSTRAINT cost_centers_pkey PRIMARY KEY (id);

-- Name: credit_notes credit_notes_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.credit_notes
    ADD CONSTRAINT credit_notes_pkey PRIMARY KEY (id);

-- Name: debit_notes debit_notes_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.debit_notes
    ADD CONSTRAINT debit_notes_pkey PRIMARY KEY (id);

-- Name: fiscal_years fiscal_years_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.fiscal_years
    ADD CONSTRAINT fiscal_years_pkey PRIMARY KEY (id);

-- Name: gst_output_tax_register gst_output_tax_register_entry_uuid_key; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.gst_output_tax_register
    ADD CONSTRAINT gst_output_tax_register_entry_uuid_key UNIQUE (entry_uuid);

-- Name: gst_output_tax_register gst_output_tax_register_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.gst_output_tax_register
    ADD CONSTRAINT gst_output_tax_register_pkey PRIMARY KEY (id);

-- Name: itc_register itc_register_entry_uuid_key; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.itc_register
    ADD CONSTRAINT itc_register_entry_uuid_key UNIQUE (entry_uuid);

-- Name: itc_register itc_register_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.itc_register
    ADD CONSTRAINT itc_register_pkey PRIMARY KEY (id);

-- Name: job_work_orders job_work_orders_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.job_work_orders
    ADD CONSTRAINT job_work_orders_pkey PRIMARY KEY (id);

-- Name: journal_entries journal_entries_entry_uuid_key; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.journal_entries
    ADD CONSTRAINT journal_entries_entry_uuid_key UNIQUE (entry_uuid);

-- Name: journal_entries journal_entries_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.journal_entries
    ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (id);

-- Name: journal_entry_lines journal_entry_lines_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.journal_entry_lines
    ADD CONSTRAINT journal_entry_lines_pkey PRIMARY KEY (id);

-- Name: materials materials_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.materials
    ADD CONSTRAINT materials_pkey PRIMARY KEY (id);

-- Name: parties parties_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.parties
    ADD CONSTRAINT parties_pkey PRIMARY KEY (id);

-- Name: payment_allocations payment_allocations_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.payment_allocations
    ADD CONSTRAINT payment_allocations_pkey PRIMARY KEY (id);

-- Name: payment_receipts payment_receipts_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.payment_receipts
    ADD CONSTRAINT payment_receipts_pkey PRIMARY KEY (id);

-- Name: production_consumption_entries production_consumption_entries_entry_uuid_key; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_consumption_entries
    ADD CONSTRAINT production_consumption_entries_entry_uuid_key UNIQUE (entry_uuid);

-- Name: production_consumption_entries production_consumption_entries_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_consumption_entries
    ADD CONSTRAINT production_consumption_entries_pkey PRIMARY KEY (id);

-- Name: production_orders production_orders_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_orders
    ADD CONSTRAINT production_orders_pkey PRIMARY KEY (id);

-- Name: production_output_entries production_output_entries_entry_uuid_key; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_output_entries
    ADD CONSTRAINT production_output_entries_entry_uuid_key UNIQUE (entry_uuid);

-- Name: production_output_entries production_output_entries_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_output_entries
    ADD CONSTRAINT production_output_entries_pkey PRIMARY KEY (id);

-- Name: production_wastage_entries production_wastage_entries_entry_uuid_key; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_wastage_entries
    ADD CONSTRAINT production_wastage_entries_entry_uuid_key UNIQUE (entry_uuid);

-- Name: production_wastage_entries production_wastage_entries_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_wastage_entries
    ADD CONSTRAINT production_wastage_entries_pkey PRIMARY KEY (id);

-- Name: products products_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);

-- Name: purchase_invoice_lines purchase_invoice_lines_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.purchase_invoice_lines
    ADD CONSTRAINT purchase_invoice_lines_pkey PRIMARY KEY (id);

-- Name: purchase_invoices purchase_invoices_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.purchase_invoices
    ADD CONSTRAINT purchase_invoices_pkey PRIMARY KEY (id);

-- Name: rcm_liability_register rcm_liability_register_entry_uuid_key; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.rcm_liability_register
    ADD CONSTRAINT rcm_liability_register_entry_uuid_key UNIQUE (entry_uuid);

-- Name: rcm_liability_register rcm_liability_register_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.rcm_liability_register
    ADD CONSTRAINT rcm_liability_register_pkey PRIMARY KEY (id);

-- Name: reconciliation_matches reconciliation_matches_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.reconciliation_matches
    ADD CONSTRAINT reconciliation_matches_pkey PRIMARY KEY (id);

-- Name: sales_invoice_lines sales_invoice_lines_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.sales_invoice_lines
    ADD CONSTRAINT sales_invoice_lines_pkey PRIMARY KEY (id);

-- Name: sales_invoices sales_invoices_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.sales_invoices
    ADD CONSTRAINT sales_invoices_pkey PRIMARY KEY (id);

-- Name: session_logs session_logs_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.session_logs
    ADD CONSTRAINT session_logs_pkey PRIMARY KEY (id);

-- Name: stock_batches stock_batches_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.stock_batches
    ADD CONSTRAINT stock_batches_pkey PRIMARY KEY (id);

-- Name: stock_ledger_entries stock_ledger_entries_entry_uuid_key; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.stock_ledger_entries
    ADD CONSTRAINT stock_ledger_entries_entry_uuid_key UNIQUE (entry_uuid);

-- Name: stock_ledger_entries stock_ledger_entries_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.stock_ledger_entries
    ADD CONSTRAINT stock_ledger_entries_pkey PRIMARY KEY (id);

-- Name: stock_locations stock_locations_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.stock_locations
    ADD CONSTRAINT stock_locations_pkey PRIMARY KEY (id);

-- Name: units_of_measure units_of_measure_code_key; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.units_of_measure
    ADD CONSTRAINT units_of_measure_code_key UNIQUE (code);

-- Name: units_of_measure units_of_measure_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.units_of_measure
    ADD CONSTRAINT units_of_measure_pkey PRIMARY KEY (id);

-- Name: accounts uq_account_code; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.accounts
    ADD CONSTRAINT uq_account_code UNIQUE (company_id, code);

-- Name: stock_batches uq_batch_no; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.stock_batches
    ADD CONSTRAINT uq_batch_no UNIQUE (company_id, material_id, batch_no);

-- Name: credit_notes uq_cn_no; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.credit_notes
    ADD CONSTRAINT uq_cn_no UNIQUE (company_id, fiscal_year_id, cn_no);

-- Name: cost_centers uq_cost_center_code; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.cost_centers
    ADD CONSTRAINT uq_cost_center_code UNIQUE (company_id, code);

-- Name: debit_notes uq_dn_no; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.debit_notes
    ADD CONSTRAINT uq_dn_no UNIQUE (company_id, fiscal_year_id, dn_no);

-- Name: fiscal_years uq_fiscal_year_label; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.fiscal_years
    ADD CONSTRAINT uq_fiscal_year_label UNIQUE (company_id, year_label);

-- Name: journal_entries uq_journal_entry_no; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.journal_entries
    ADD CONSTRAINT uq_journal_entry_no UNIQUE (company_id, fiscal_year_id, entry_no);

-- Name: job_work_orders uq_jw_order_no; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.job_work_orders
    ADD CONSTRAINT uq_jw_order_no UNIQUE (company_id, jw_order_no);

-- Name: stock_locations uq_location_code; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.stock_locations
    ADD CONSTRAINT uq_location_code UNIQUE (company_id, code);

-- Name: materials uq_material_code; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.materials
    ADD CONSTRAINT uq_material_code UNIQUE (company_id, code);

-- Name: parties uq_party_code; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.parties
    ADD CONSTRAINT uq_party_code UNIQUE (company_id, party_code);

-- Name: products uq_product_sku; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.products
    ADD CONSTRAINT uq_product_sku UNIQUE (company_id, sku);

-- Name: production_orders uq_production_order_no; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_orders
    ADD CONSTRAINT uq_production_order_no UNIQUE (company_id, fiscal_year_id, order_no);

-- Name: purchase_invoices uq_purchase_bill_no; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.purchase_invoices
    ADD CONSTRAINT uq_purchase_bill_no UNIQUE (company_id, fiscal_year_id, bill_no);

-- Name: sales_invoices uq_sales_invoice_no; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.sales_invoices
    ADD CONSTRAINT uq_sales_invoice_no UNIQUE (company_id, fiscal_year_id, invoice_no);

-- Name: users uq_user_email; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.users
    ADD CONSTRAINT uq_user_email UNIQUE (company_id, email);

-- Name: payment_receipts uq_voucher_no; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.payment_receipts
    ADD CONSTRAINT uq_voucher_no UNIQUE (company_id, fiscal_year_id, voucher_no);

-- Name: users users_pkey; Type: CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

-- Name: audit_log audit_log_no_delete; Type: RULE; Schema: caratloop; Owner: -

CREATE RULE audit_log_no_delete AS
    ON DELETE TO caratloop.audit_log DO INSTEAD NOTHING;

-- Name: audit_log audit_log_no_update; Type: RULE; Schema: caratloop; Owner: -

CREATE RULE audit_log_no_update AS
    ON UPDATE TO caratloop.audit_log DO INSTEAD NOTHING;

-- Name: gst_output_tax_register trg_audit_gst_output; Type: TRIGGER; Schema: caratloop; Owner: -

CREATE TRIGGER trg_audit_gst_output AFTER INSERT ON caratloop.gst_output_tax_register FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

-- Name: itc_register trg_audit_itc_register; Type: TRIGGER; Schema: caratloop; Owner: -

CREATE TRIGGER trg_audit_itc_register AFTER INSERT ON caratloop.itc_register FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

-- Name: journal_entries trg_audit_journal_entries; Type: TRIGGER; Schema: caratloop; Owner: -

CREATE TRIGGER trg_audit_journal_entries AFTER INSERT OR UPDATE ON caratloop.journal_entries FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

-- Name: journal_entry_lines trg_audit_journal_entry_lines; Type: TRIGGER; Schema: caratloop; Owner: -

CREATE TRIGGER trg_audit_journal_entry_lines AFTER INSERT OR UPDATE ON caratloop.journal_entry_lines FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

-- Name: production_consumption_entries trg_audit_production_consumption; Type: TRIGGER; Schema: caratloop; Owner: -

CREATE TRIGGER trg_audit_production_consumption AFTER INSERT ON caratloop.production_consumption_entries FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

-- Name: production_output_entries trg_audit_production_output; Type: TRIGGER; Schema: caratloop; Owner: -

CREATE TRIGGER trg_audit_production_output AFTER INSERT ON caratloop.production_output_entries FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

-- Name: purchase_invoices trg_audit_purchase_invoices; Type: TRIGGER; Schema: caratloop; Owner: -

CREATE TRIGGER trg_audit_purchase_invoices AFTER INSERT OR UPDATE ON caratloop.purchase_invoices FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

-- Name: rcm_liability_register trg_audit_rcm_register; Type: TRIGGER; Schema: caratloop; Owner: -

CREATE TRIGGER trg_audit_rcm_register AFTER INSERT ON caratloop.rcm_liability_register FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

-- Name: sales_invoices trg_audit_sales_invoices; Type: TRIGGER; Schema: caratloop; Owner: -

CREATE TRIGGER trg_audit_sales_invoices AFTER INSERT OR UPDATE ON caratloop.sales_invoices FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

-- Name: stock_ledger_entries trg_audit_stock_ledger; Type: TRIGGER; Schema: caratloop; Owner: -

CREATE TRIGGER trg_audit_stock_ledger AFTER INSERT ON caratloop.stock_ledger_entries FOR EACH ROW EXECUTE FUNCTION caratloop.fn_audit_trigger();

-- Name: journal_entry_lines trg_validate_journal_balance; Type: TRIGGER; Schema: caratloop; Owner: -

CREATE CONSTRAINT TRIGGER trg_validate_journal_balance AFTER INSERT OR UPDATE ON caratloop.journal_entry_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION caratloop.fn_validate_journal_balance();

-- Name: account_groups account_groups_company_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.account_groups
    ADD CONSTRAINT account_groups_company_id_fkey FOREIGN KEY (company_id) REFERENCES caratloop.companies(id);

-- Name: account_groups account_groups_parent_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.account_groups
    ADD CONSTRAINT account_groups_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES caratloop.account_groups(id);

-- Name: accounts accounts_company_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.accounts
    ADD CONSTRAINT accounts_company_id_fkey FOREIGN KEY (company_id) REFERENCES caratloop.companies(id);

-- Name: accounts accounts_created_by_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.accounts
    ADD CONSTRAINT accounts_created_by_fkey FOREIGN KEY (created_by) REFERENCES caratloop.users(id);

-- Name: accounts accounts_group_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.accounts
    ADD CONSTRAINT accounts_group_id_fkey FOREIGN KEY (group_id) REFERENCES caratloop.account_groups(id);

-- Name: bom_headers bom_headers_company_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.bom_headers
    ADD CONSTRAINT bom_headers_company_id_fkey FOREIGN KEY (company_id) REFERENCES caratloop.companies(id);

-- Name: bom_headers bom_headers_created_by_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.bom_headers
    ADD CONSTRAINT bom_headers_created_by_fkey FOREIGN KEY (created_by) REFERENCES caratloop.users(id);

-- Name: bom_headers bom_headers_product_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.bom_headers
    ADD CONSTRAINT bom_headers_product_id_fkey FOREIGN KEY (product_id) REFERENCES caratloop.products(id);

-- Name: bom_lines bom_lines_bom_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.bom_lines
    ADD CONSTRAINT bom_lines_bom_id_fkey FOREIGN KEY (bom_id) REFERENCES caratloop.bom_headers(id);

-- Name: bom_lines bom_lines_material_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.bom_lines
    ADD CONSTRAINT bom_lines_material_id_fkey FOREIGN KEY (material_id) REFERENCES caratloop.materials(id);

-- Name: bom_lines bom_lines_uom_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.bom_lines
    ADD CONSTRAINT bom_lines_uom_id_fkey FOREIGN KEY (uom_id) REFERENCES caratloop.units_of_measure(id);

-- Name: cost_centers cost_centers_company_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.cost_centers
    ADD CONSTRAINT cost_centers_company_id_fkey FOREIGN KEY (company_id) REFERENCES caratloop.companies(id);

-- Name: cost_centers cost_centers_parent_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.cost_centers
    ADD CONSTRAINT cost_centers_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES caratloop.cost_centers(id);

-- Name: credit_notes credit_notes_company_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.credit_notes
    ADD CONSTRAINT credit_notes_company_id_fkey FOREIGN KEY (company_id) REFERENCES caratloop.companies(id);

-- Name: credit_notes credit_notes_created_by_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.credit_notes
    ADD CONSTRAINT credit_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES caratloop.users(id);

-- Name: credit_notes credit_notes_fiscal_year_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.credit_notes
    ADD CONSTRAINT credit_notes_fiscal_year_id_fkey FOREIGN KEY (fiscal_year_id) REFERENCES caratloop.fiscal_years(id);

-- Name: credit_notes credit_notes_original_invoice_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.credit_notes
    ADD CONSTRAINT credit_notes_original_invoice_id_fkey FOREIGN KEY (original_invoice_id) REFERENCES caratloop.sales_invoices(id);

-- Name: credit_notes credit_notes_party_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.credit_notes
    ADD CONSTRAINT credit_notes_party_id_fkey FOREIGN KEY (party_id) REFERENCES caratloop.parties(id);

-- Name: debit_notes debit_notes_company_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.debit_notes
    ADD CONSTRAINT debit_notes_company_id_fkey FOREIGN KEY (company_id) REFERENCES caratloop.companies(id);

-- Name: debit_notes debit_notes_created_by_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.debit_notes
    ADD CONSTRAINT debit_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES caratloop.users(id);

-- Name: debit_notes debit_notes_fiscal_year_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.debit_notes
    ADD CONSTRAINT debit_notes_fiscal_year_id_fkey FOREIGN KEY (fiscal_year_id) REFERENCES caratloop.fiscal_years(id);

-- Name: debit_notes debit_notes_original_invoice_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.debit_notes
    ADD CONSTRAINT debit_notes_original_invoice_id_fkey FOREIGN KEY (original_invoice_id) REFERENCES caratloop.purchase_invoices(id);

-- Name: debit_notes debit_notes_party_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.debit_notes
    ADD CONSTRAINT debit_notes_party_id_fkey FOREIGN KEY (party_id) REFERENCES caratloop.parties(id);

-- Name: fiscal_years fiscal_years_company_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.fiscal_years
    ADD CONSTRAINT fiscal_years_company_id_fkey FOREIGN KEY (company_id) REFERENCES caratloop.companies(id);

-- Name: gst_output_tax_register gst_output_tax_register_company_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.gst_output_tax_register
    ADD CONSTRAINT gst_output_tax_register_company_id_fkey FOREIGN KEY (company_id) REFERENCES caratloop.companies(id);

-- Name: gst_output_tax_register gst_output_tax_register_created_by_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.gst_output_tax_register
    ADD CONSTRAINT gst_output_tax_register_created_by_fkey FOREIGN KEY (created_by) REFERENCES caratloop.users(id);

-- Name: gst_output_tax_register gst_output_tax_register_credit_note_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.gst_output_tax_register
    ADD CONSTRAINT gst_output_tax_register_credit_note_id_fkey FOREIGN KEY (credit_note_id) REFERENCES caratloop.credit_notes(id);

-- Name: gst_output_tax_register gst_output_tax_register_fiscal_year_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.gst_output_tax_register
    ADD CONSTRAINT gst_output_tax_register_fiscal_year_id_fkey FOREIGN KEY (fiscal_year_id) REFERENCES caratloop.fiscal_years(id);

-- Name: gst_output_tax_register gst_output_tax_register_party_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.gst_output_tax_register
    ADD CONSTRAINT gst_output_tax_register_party_id_fkey FOREIGN KEY (party_id) REFERENCES caratloop.parties(id);

-- Name: itc_register itc_register_company_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.itc_register
    ADD CONSTRAINT itc_register_company_id_fkey FOREIGN KEY (company_id) REFERENCES caratloop.companies(id);

-- Name: itc_register itc_register_created_by_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.itc_register
    ADD CONSTRAINT itc_register_created_by_fkey FOREIGN KEY (created_by) REFERENCES caratloop.users(id);

-- Name: itc_register itc_register_fiscal_year_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.itc_register
    ADD CONSTRAINT itc_register_fiscal_year_id_fkey FOREIGN KEY (fiscal_year_id) REFERENCES caratloop.fiscal_years(id);

-- Name: itc_register itc_register_vendor_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.itc_register
    ADD CONSTRAINT itc_register_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES caratloop.parties(id);

-- Name: job_work_orders job_work_orders_artisan_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.job_work_orders
    ADD CONSTRAINT job_work_orders_artisan_id_fkey FOREIGN KEY (artisan_id) REFERENCES caratloop.parties(id);

-- Name: job_work_orders job_work_orders_company_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.job_work_orders
    ADD CONSTRAINT job_work_orders_company_id_fkey FOREIGN KEY (company_id) REFERENCES caratloop.companies(id);

-- Name: job_work_orders job_work_orders_created_by_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.job_work_orders
    ADD CONSTRAINT job_work_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES caratloop.users(id);

-- Name: job_work_orders job_work_orders_production_order_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.job_work_orders
    ADD CONSTRAINT job_work_orders_production_order_id_fkey FOREIGN KEY (production_order_id) REFERENCES caratloop.production_orders(id);

-- Name: journal_entries journal_entries_company_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.journal_entries
    ADD CONSTRAINT journal_entries_company_id_fkey FOREIGN KEY (company_id) REFERENCES caratloop.companies(id);

-- Name: journal_entries journal_entries_cost_center_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.journal_entries
    ADD CONSTRAINT journal_entries_cost_center_id_fkey FOREIGN KEY (cost_center_id) REFERENCES caratloop.cost_centers(id);

-- Name: journal_entries journal_entries_created_by_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.journal_entries
    ADD CONSTRAINT journal_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES caratloop.users(id);

-- Name: journal_entries journal_entries_fiscal_year_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.journal_entries
    ADD CONSTRAINT journal_entries_fiscal_year_id_fkey FOREIGN KEY (fiscal_year_id) REFERENCES caratloop.fiscal_years(id);

-- Name: journal_entries journal_entries_reversal_of_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.journal_entries
    ADD CONSTRAINT journal_entries_reversal_of_id_fkey FOREIGN KEY (reversal_of_id) REFERENCES caratloop.journal_entries(id);

-- Name: journal_entries journal_entries_session_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.journal_entries
    ADD CONSTRAINT journal_entries_session_id_fkey FOREIGN KEY (session_id) REFERENCES caratloop.session_logs(id);

-- Name: journal_entry_lines journal_entry_lines_account_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.journal_entry_lines
    ADD CONSTRAINT journal_entry_lines_account_id_fkey FOREIGN KEY (account_id) REFERENCES caratloop.accounts(id);

-- Name: journal_entry_lines journal_entry_lines_cost_center_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.journal_entry_lines
    ADD CONSTRAINT journal_entry_lines_cost_center_id_fkey FOREIGN KEY (cost_center_id) REFERENCES caratloop.cost_centers(id);

-- Name: journal_entry_lines journal_entry_lines_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.journal_entry_lines
    ADD CONSTRAINT journal_entry_lines_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES caratloop.journal_entries(id);

-- Name: journal_entry_lines journal_entry_lines_party_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.journal_entry_lines
    ADD CONSTRAINT journal_entry_lines_party_id_fkey FOREIGN KEY (party_id) REFERENCES caratloop.parties(id);

-- Name: journal_entry_lines journal_entry_lines_reconciled_by_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.journal_entry_lines
    ADD CONSTRAINT journal_entry_lines_reconciled_by_fkey FOREIGN KEY (reconciled_by) REFERENCES caratloop.users(id);

-- Name: materials materials_company_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.materials
    ADD CONSTRAINT materials_company_id_fkey FOREIGN KEY (company_id) REFERENCES caratloop.companies(id);

-- Name: materials materials_created_by_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.materials
    ADD CONSTRAINT materials_created_by_fkey FOREIGN KEY (created_by) REFERENCES caratloop.users(id);

-- Name: materials materials_purchase_account_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.materials
    ADD CONSTRAINT materials_purchase_account_id_fkey FOREIGN KEY (purchase_account_id) REFERENCES caratloop.accounts(id);

-- Name: materials materials_sales_account_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.materials
    ADD CONSTRAINT materials_sales_account_id_fkey FOREIGN KEY (sales_account_id) REFERENCES caratloop.accounts(id);

-- Name: materials materials_secondary_uom_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.materials
    ADD CONSTRAINT materials_secondary_uom_id_fkey FOREIGN KEY (secondary_uom_id) REFERENCES caratloop.units_of_measure(id);

-- Name: materials materials_stock_account_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.materials
    ADD CONSTRAINT materials_stock_account_id_fkey FOREIGN KEY (stock_account_id) REFERENCES caratloop.accounts(id);

-- Name: materials materials_uom_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.materials
    ADD CONSTRAINT materials_uom_id_fkey FOREIGN KEY (uom_id) REFERENCES caratloop.units_of_measure(id);

-- Name: parties parties_account_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.parties
    ADD CONSTRAINT parties_account_id_fkey FOREIGN KEY (account_id) REFERENCES caratloop.accounts(id);

-- Name: parties parties_company_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.parties
    ADD CONSTRAINT parties_company_id_fkey FOREIGN KEY (company_id) REFERENCES caratloop.companies(id);

-- Name: parties parties_created_by_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.parties
    ADD CONSTRAINT parties_created_by_fkey FOREIGN KEY (created_by) REFERENCES caratloop.users(id);

-- Name: payment_allocations payment_allocations_payment_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.payment_allocations
    ADD CONSTRAINT payment_allocations_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES caratloop.payment_receipts(id);

-- Name: payment_receipts payment_receipts_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.payment_receipts
    ADD CONSTRAINT payment_receipts_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES caratloop.accounts(id);

-- Name: payment_receipts payment_receipts_company_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.payment_receipts
    ADD CONSTRAINT payment_receipts_company_id_fkey FOREIGN KEY (company_id) REFERENCES caratloop.companies(id);

-- Name: payment_receipts payment_receipts_created_by_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.payment_receipts
    ADD CONSTRAINT payment_receipts_created_by_fkey FOREIGN KEY (created_by) REFERENCES caratloop.users(id);

-- Name: payment_receipts payment_receipts_fiscal_year_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.payment_receipts
    ADD CONSTRAINT payment_receipts_fiscal_year_id_fkey FOREIGN KEY (fiscal_year_id) REFERENCES caratloop.fiscal_years(id);

-- Name: payment_receipts payment_receipts_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.payment_receipts
    ADD CONSTRAINT payment_receipts_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES caratloop.journal_entries(id);

-- Name: payment_receipts payment_receipts_party_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.payment_receipts
    ADD CONSTRAINT payment_receipts_party_id_fkey FOREIGN KEY (party_id) REFERENCES caratloop.parties(id);

-- Name: production_consumption_entries production_consumption_entries_company_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_consumption_entries
    ADD CONSTRAINT production_consumption_entries_company_id_fkey FOREIGN KEY (company_id) REFERENCES caratloop.companies(id);

-- Name: production_consumption_entries production_consumption_entries_created_by_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_consumption_entries
    ADD CONSTRAINT production_consumption_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES caratloop.users(id);

-- Name: production_consumption_entries production_consumption_entries_material_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_consumption_entries
    ADD CONSTRAINT production_consumption_entries_material_id_fkey FOREIGN KEY (material_id) REFERENCES caratloop.materials(id);

-- Name: production_consumption_entries production_consumption_entries_production_order_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_consumption_entries
    ADD CONSTRAINT production_consumption_entries_production_order_id_fkey FOREIGN KEY (production_order_id) REFERENCES caratloop.production_orders(id);

-- Name: production_consumption_entries production_consumption_entries_reversal_of_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_consumption_entries
    ADD CONSTRAINT production_consumption_entries_reversal_of_id_fkey FOREIGN KEY (reversal_of_id) REFERENCES caratloop.production_consumption_entries(id);

-- Name: production_consumption_entries production_consumption_entries_stock_ledger_entry_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_consumption_entries
    ADD CONSTRAINT production_consumption_entries_stock_ledger_entry_id_fkey FOREIGN KEY (stock_ledger_entry_id) REFERENCES caratloop.stock_ledger_entries(id);

-- Name: production_consumption_entries production_consumption_entries_uom_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_consumption_entries
    ADD CONSTRAINT production_consumption_entries_uom_id_fkey FOREIGN KEY (uom_id) REFERENCES caratloop.units_of_measure(id);

-- Name: production_orders production_orders_approved_by_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_orders
    ADD CONSTRAINT production_orders_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES caratloop.users(id);

-- Name: production_orders production_orders_artisan_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_orders
    ADD CONSTRAINT production_orders_artisan_id_fkey FOREIGN KEY (artisan_id) REFERENCES caratloop.parties(id);

-- Name: production_orders production_orders_bom_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_orders
    ADD CONSTRAINT production_orders_bom_id_fkey FOREIGN KEY (bom_id) REFERENCES caratloop.bom_headers(id);

-- Name: production_orders production_orders_company_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_orders
    ADD CONSTRAINT production_orders_company_id_fkey FOREIGN KEY (company_id) REFERENCES caratloop.companies(id);

-- Name: production_orders production_orders_created_by_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_orders
    ADD CONSTRAINT production_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES caratloop.users(id);

-- Name: production_orders production_orders_fiscal_year_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_orders
    ADD CONSTRAINT production_orders_fiscal_year_id_fkey FOREIGN KEY (fiscal_year_id) REFERENCES caratloop.fiscal_years(id);

-- Name: production_orders production_orders_product_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_orders
    ADD CONSTRAINT production_orders_product_id_fkey FOREIGN KEY (product_id) REFERENCES caratloop.products(id);

-- Name: production_orders production_orders_production_location_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_orders
    ADD CONSTRAINT production_orders_production_location_id_fkey FOREIGN KEY (production_location_id) REFERENCES caratloop.stock_locations(id);

-- Name: production_output_entries production_output_entries_company_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_output_entries
    ADD CONSTRAINT production_output_entries_company_id_fkey FOREIGN KEY (company_id) REFERENCES caratloop.companies(id);

-- Name: production_output_entries production_output_entries_created_by_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_output_entries
    ADD CONSTRAINT production_output_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES caratloop.users(id);

-- Name: production_output_entries production_output_entries_material_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_output_entries
    ADD CONSTRAINT production_output_entries_material_id_fkey FOREIGN KEY (material_id) REFERENCES caratloop.materials(id);

-- Name: production_output_entries production_output_entries_production_order_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_output_entries
    ADD CONSTRAINT production_output_entries_production_order_id_fkey FOREIGN KEY (production_order_id) REFERENCES caratloop.production_orders(id);

-- Name: production_output_entries production_output_entries_reversal_of_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_output_entries
    ADD CONSTRAINT production_output_entries_reversal_of_id_fkey FOREIGN KEY (reversal_of_id) REFERENCES caratloop.production_output_entries(id);

-- Name: production_output_entries production_output_entries_stock_ledger_entry_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_output_entries
    ADD CONSTRAINT production_output_entries_stock_ledger_entry_id_fkey FOREIGN KEY (stock_ledger_entry_id) REFERENCES caratloop.stock_ledger_entries(id);

-- Name: production_output_entries production_output_entries_uom_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_output_entries
    ADD CONSTRAINT production_output_entries_uom_id_fkey FOREIGN KEY (uom_id) REFERENCES caratloop.units_of_measure(id);

-- Name: production_wastage_entries production_wastage_entries_company_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_wastage_entries
    ADD CONSTRAINT production_wastage_entries_company_id_fkey FOREIGN KEY (company_id) REFERENCES caratloop.companies(id);

-- Name: production_wastage_entries production_wastage_entries_created_by_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_wastage_entries
    ADD CONSTRAINT production_wastage_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES caratloop.users(id);

-- Name: production_wastage_entries production_wastage_entries_material_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_wastage_entries
    ADD CONSTRAINT production_wastage_entries_material_id_fkey FOREIGN KEY (material_id) REFERENCES caratloop.materials(id);

-- Name: production_wastage_entries production_wastage_entries_production_order_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_wastage_entries
    ADD CONSTRAINT production_wastage_entries_production_order_id_fkey FOREIGN KEY (production_order_id) REFERENCES caratloop.production_orders(id);

-- Name: production_wastage_entries production_wastage_entries_uom_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.production_wastage_entries
    ADD CONSTRAINT production_wastage_entries_uom_id_fkey FOREIGN KEY (uom_id) REFERENCES caratloop.units_of_measure(id);

-- Name: products products_company_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.products
    ADD CONSTRAINT products_company_id_fkey FOREIGN KEY (company_id) REFERENCES caratloop.companies(id);

-- Name: products products_material_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.products
    ADD CONSTRAINT products_material_id_fkey FOREIGN KEY (material_id) REFERENCES caratloop.materials(id);

-- Name: purchase_invoice_lines purchase_invoice_lines_invoice_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.purchase_invoice_lines
    ADD CONSTRAINT purchase_invoice_lines_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES caratloop.purchase_invoices(id);

-- Name: purchase_invoice_lines purchase_invoice_lines_material_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.purchase_invoice_lines
    ADD CONSTRAINT purchase_invoice_lines_material_id_fkey FOREIGN KEY (material_id) REFERENCES caratloop.materials(id);

-- Name: purchase_invoice_lines purchase_invoice_lines_stock_entry_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.purchase_invoice_lines
    ADD CONSTRAINT purchase_invoice_lines_stock_entry_id_fkey FOREIGN KEY (stock_entry_id) REFERENCES caratloop.stock_ledger_entries(id);

-- Name: purchase_invoice_lines purchase_invoice_lines_uom_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.purchase_invoice_lines
    ADD CONSTRAINT purchase_invoice_lines_uom_id_fkey FOREIGN KEY (uom_id) REFERENCES caratloop.units_of_measure(id);

-- Name: purchase_invoices purchase_invoices_company_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.purchase_invoices
    ADD CONSTRAINT purchase_invoices_company_id_fkey FOREIGN KEY (company_id) REFERENCES caratloop.companies(id);

-- Name: purchase_invoices purchase_invoices_created_by_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.purchase_invoices
    ADD CONSTRAINT purchase_invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES caratloop.users(id);

-- Name: purchase_invoices purchase_invoices_fiscal_year_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.purchase_invoices
    ADD CONSTRAINT purchase_invoices_fiscal_year_id_fkey FOREIGN KEY (fiscal_year_id) REFERENCES caratloop.fiscal_years(id);

-- Name: purchase_invoices purchase_invoices_vendor_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.purchase_invoices
    ADD CONSTRAINT purchase_invoices_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES caratloop.parties(id);

-- Name: rcm_liability_register rcm_liability_register_company_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.rcm_liability_register
    ADD CONSTRAINT rcm_liability_register_company_id_fkey FOREIGN KEY (company_id) REFERENCES caratloop.companies(id);

-- Name: rcm_liability_register rcm_liability_register_created_by_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.rcm_liability_register
    ADD CONSTRAINT rcm_liability_register_created_by_fkey FOREIGN KEY (created_by) REFERENCES caratloop.users(id);

-- Name: rcm_liability_register rcm_liability_register_fiscal_year_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.rcm_liability_register
    ADD CONSTRAINT rcm_liability_register_fiscal_year_id_fkey FOREIGN KEY (fiscal_year_id) REFERENCES caratloop.fiscal_years(id);

-- Name: rcm_liability_register rcm_liability_register_itc_register_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.rcm_liability_register
    ADD CONSTRAINT rcm_liability_register_itc_register_id_fkey FOREIGN KEY (itc_register_id) REFERENCES caratloop.itc_register(id);

-- Name: rcm_liability_register rcm_liability_register_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.rcm_liability_register
    ADD CONSTRAINT rcm_liability_register_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES caratloop.journal_entries(id);

-- Name: rcm_liability_register rcm_liability_register_purchase_invoice_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.rcm_liability_register
    ADD CONSTRAINT rcm_liability_register_purchase_invoice_id_fkey FOREIGN KEY (purchase_invoice_id) REFERENCES caratloop.purchase_invoices(id);

-- Name: rcm_liability_register rcm_liability_register_vendor_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.rcm_liability_register
    ADD CONSTRAINT rcm_liability_register_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES caratloop.parties(id);

-- Name: sales_invoice_lines sales_invoice_lines_invoice_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.sales_invoice_lines
    ADD CONSTRAINT sales_invoice_lines_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES caratloop.sales_invoices(id);

-- Name: sales_invoice_lines sales_invoice_lines_material_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.sales_invoice_lines
    ADD CONSTRAINT sales_invoice_lines_material_id_fkey FOREIGN KEY (material_id) REFERENCES caratloop.materials(id);

-- Name: sales_invoice_lines sales_invoice_lines_product_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.sales_invoice_lines
    ADD CONSTRAINT sales_invoice_lines_product_id_fkey FOREIGN KEY (product_id) REFERENCES caratloop.products(id);

-- Name: sales_invoice_lines sales_invoice_lines_stock_entry_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.sales_invoice_lines
    ADD CONSTRAINT sales_invoice_lines_stock_entry_id_fkey FOREIGN KEY (stock_entry_id) REFERENCES caratloop.stock_ledger_entries(id);

-- Name: sales_invoice_lines sales_invoice_lines_uom_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.sales_invoice_lines
    ADD CONSTRAINT sales_invoice_lines_uom_id_fkey FOREIGN KEY (uom_id) REFERENCES caratloop.units_of_measure(id);

-- Name: sales_invoices sales_invoices_approved_by_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.sales_invoices
    ADD CONSTRAINT sales_invoices_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES caratloop.users(id);

-- Name: sales_invoices sales_invoices_company_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.sales_invoices
    ADD CONSTRAINT sales_invoices_company_id_fkey FOREIGN KEY (company_id) REFERENCES caratloop.companies(id);

-- Name: sales_invoices sales_invoices_created_by_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.sales_invoices
    ADD CONSTRAINT sales_invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES caratloop.users(id);

-- Name: sales_invoices sales_invoices_customer_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.sales_invoices
    ADD CONSTRAINT sales_invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES caratloop.parties(id);

-- Name: sales_invoices sales_invoices_fiscal_year_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.sales_invoices
    ADD CONSTRAINT sales_invoices_fiscal_year_id_fkey FOREIGN KEY (fiscal_year_id) REFERENCES caratloop.fiscal_years(id);

-- Name: session_logs session_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.session_logs
    ADD CONSTRAINT session_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES caratloop.users(id);

-- Name: stock_batches stock_batches_company_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.stock_batches
    ADD CONSTRAINT stock_batches_company_id_fkey FOREIGN KEY (company_id) REFERENCES caratloop.companies(id);

-- Name: stock_batches stock_batches_created_by_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.stock_batches
    ADD CONSTRAINT stock_batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES caratloop.users(id);

-- Name: stock_batches stock_batches_material_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.stock_batches
    ADD CONSTRAINT stock_batches_material_id_fkey FOREIGN KEY (material_id) REFERENCES caratloop.materials(id);

-- Name: stock_batches stock_batches_supplier_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.stock_batches
    ADD CONSTRAINT stock_batches_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES caratloop.parties(id);

-- Name: stock_ledger_entries stock_ledger_entries_company_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.stock_ledger_entries
    ADD CONSTRAINT stock_ledger_entries_company_id_fkey FOREIGN KEY (company_id) REFERENCES caratloop.companies(id);

-- Name: stock_ledger_entries stock_ledger_entries_created_by_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.stock_ledger_entries
    ADD CONSTRAINT stock_ledger_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES caratloop.users(id);

-- Name: stock_ledger_entries stock_ledger_entries_fiscal_year_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.stock_ledger_entries
    ADD CONSTRAINT stock_ledger_entries_fiscal_year_id_fkey FOREIGN KEY (fiscal_year_id) REFERENCES caratloop.fiscal_years(id);

-- Name: stock_ledger_entries stock_ledger_entries_location_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.stock_ledger_entries
    ADD CONSTRAINT stock_ledger_entries_location_id_fkey FOREIGN KEY (location_id) REFERENCES caratloop.stock_locations(id);

-- Name: stock_ledger_entries stock_ledger_entries_material_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.stock_ledger_entries
    ADD CONSTRAINT stock_ledger_entries_material_id_fkey FOREIGN KEY (material_id) REFERENCES caratloop.materials(id);

-- Name: stock_ledger_entries stock_ledger_entries_reversal_of_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.stock_ledger_entries
    ADD CONSTRAINT stock_ledger_entries_reversal_of_id_fkey FOREIGN KEY (reversal_of_id) REFERENCES caratloop.stock_ledger_entries(id);

-- Name: stock_ledger_entries stock_ledger_entries_session_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.stock_ledger_entries
    ADD CONSTRAINT stock_ledger_entries_session_id_fkey FOREIGN KEY (session_id) REFERENCES caratloop.session_logs(id);

-- Name: stock_locations stock_locations_company_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.stock_locations
    ADD CONSTRAINT stock_locations_company_id_fkey FOREIGN KEY (company_id) REFERENCES caratloop.companies(id);

-- Name: users users_company_id_fkey; Type: FK CONSTRAINT; Schema: caratloop; Owner: -

ALTER TABLE ONLY caratloop.users
    ADD CONSTRAINT users_company_id_fkey FOREIGN KEY (company_id) REFERENCES caratloop.companies(id);

