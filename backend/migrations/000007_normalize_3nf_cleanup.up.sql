-- 000007_normalize_3nf_cleanup.up.sql
-- Phase 7 of the database normalization plan: remove two 3NF violations where a
-- column is transitively dependent on another (redundant), and harden one BCNF
-- concern by making a natural key unique.
--
-- Change 1: kiosk_tokens.tenant_id is derivable from session_id -> sessions.tenant_id.
-- Change 2: participant_missions.participant_id is derivable from report_id -> reports.participant_id.
-- Change 3: refresh_tokens.token_hash must be unique (BCNF — candidate key).

-- Change 1: drop the redundant tenant_id column (drop FK + index first).
ALTER TABLE kiosk_tokens DROP FOREIGN KEY fk_kiosk_tenant;
ALTER TABLE kiosk_tokens DROP COLUMN tenant_id;
ALTER TABLE kiosk_tokens DROP INDEX idx_kiosk_tenant;

-- Change 2: drop the redundant participant_id column (drop FK + index first).
ALTER TABLE participant_missions DROP FOREIGN KEY fk_participant_missions_participant;
ALTER TABLE participant_missions DROP COLUMN participant_id;
ALTER TABLE participant_missions DROP INDEX idx_participant_missions_participant;

-- Change 3: promote the non-unique token_hash index to a UNIQUE constraint.
ALTER TABLE refresh_tokens DROP INDEX idx_refresh_tokens_token_hash;
ALTER TABLE refresh_tokens ADD UNIQUE KEY uq_refresh_tokens_token_hash (token_hash);
