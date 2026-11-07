-- One statement line may settle several book lines (one NEFT paying three
-- bills). reconciliation_matches holds one row per pair; the unique index on
-- bank_entry_id allowed only one pair per statement line. It becomes a plain
-- index. The book-line side stays unique: a journal line clears once.
DROP INDEX IF EXISTS caratloop.ux_reconciliation_matches_bank_entry;
CREATE INDEX IF NOT EXISTS ix_reconciliation_matches_bank_entry
    ON caratloop.reconciliation_matches(bank_entry_id);
