-- 000008_consent_token.up.sql
-- Add single-use consent token columns to consent_logs (plan B10).
-- The token gates the public respond-public flow; uq_consent_token enforces uniqueness.
-- Numbered 000008 (above the already-applied 000006) so it applies on both fresh
-- and live databases where schema_migrations is already at v6.
-- consent_token/consumed_at/expires_at are VARCHAR to match the Go string/*string
-- entity fields (RFC3339 values), consistent with 000007.
ALTER TABLE consent_logs
  ADD COLUMN consent_token VARCHAR(64) NULL,
  ADD COLUMN consumed_at VARCHAR(64) NULL,
  ADD COLUMN expires_at VARCHAR(64) NULL;

CREATE UNIQUE INDEX uq_consent_token ON consent_logs(consent_token);
