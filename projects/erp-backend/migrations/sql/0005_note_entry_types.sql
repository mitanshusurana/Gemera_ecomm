-- Credit and debit notes are their own voucher types.
--
-- vouchers.py posted them with entry_type 'Credit Note' and 'Debit Note'.
-- chk_je_type permits neither, so both endpoints failed at the database on
-- every call -- the value reached the CHECK as a bind parameter, which is why
-- the offline vocabulary test, which reads literals out of SQL text, did not
-- see it.
--
-- They are added to the vocabulary rather than folded into 'Journal' or
-- 'Reversal': a credit note is reported on its own line of GSTR-1 (Table 9B),
-- reduces a specific invoice's receivable, and an auditor filtering the
-- journal by type needs to find them. Underscore form, like RCM_Payment and
-- Stock_Adjustment already in the list.

ALTER TABLE caratloop.journal_entries DROP CONSTRAINT IF EXISTS chk_je_type;
ALTER TABLE caratloop.journal_entries ADD CONSTRAINT chk_je_type
    CHECK (((entry_type)::text = ANY ((ARRAY[
        'Sales'::character varying, 'Purchase'::character varying,
        'Receipt'::character varying, 'Payment'::character varying,
        'Contra'::character varying, 'Journal'::character varying,
        'Opening'::character varying, 'Closing'::character varying,
        'Depreciation'::character varying, 'RCM_Payment'::character varying,
        'ITC_Utilization'::character varying, 'Stock_Adjustment'::character varying,
        'Reversal'::character varying, 'Bank_Reconciliation'::character varying,
        'Credit_Note'::character varying, 'Debit_Note'::character varying
    ])::text[])));
