-- 000007_normalize_3nf_cleanup.down.sql
-- Rollback of 000007: re-add the redundant columns and revert the UNIQUE index.

-- Rollback Change 3: refresh_tokens.token_hash UNIQUE -> non-unique index.
ALTER TABLE refresh_tokens DROP INDEX uq_refresh_tokens_token_hash;
ALTER TABLE refresh_tokens ADD INDEX idx_refresh_tokens_token_hash (token_hash);

-- Rollback Change 2: re-add participant_missions.participant_id column + index + FK.
ALTER TABLE participant_missions ADD COLUMN participant_id CHAR(36) NOT NULL AFTER report_id;
ALTER TABLE participant_missions ADD INDEX idx_participant_missions_participant (participant_id);
ALTER TABLE participant_missions ADD CONSTRAINT fk_participant_missions_participant
  FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE;

-- Rollback Change 1: re-add kiosk_tokens.tenant_id column + index + FK.
ALTER TABLE kiosk_tokens ADD COLUMN tenant_id VARCHAR(36) NOT NULL AFTER session_id;
ALTER TABLE kiosk_tokens ADD INDEX idx_kiosk_tenant (tenant_id);
ALTER TABLE kiosk_tokens ADD CONSTRAINT fk_kiosk_tenant
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
