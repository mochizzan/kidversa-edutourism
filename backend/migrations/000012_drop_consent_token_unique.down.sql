-- 000012_drop_consent_token_unique.down.sql
-- Restore the UNIQUE constraint (for rollback safety).
-- NOTE: This will fail if there are multiple rows with consent_token = ''.
-- In practice the column is unused and the DB has zero consent_logs rows.
ALTER TABLE consent_logs ADD UNIQUE KEY uq_consent_token (consent_token);
