-- 000008_consent_token.down.sql
DROP INDEX uq_consent_token ON consent_logs;

ALTER TABLE consent_logs
  DROP COLUMN consent_token,
  DROP COLUMN consumed_at,
  DROP COLUMN expires_at;
