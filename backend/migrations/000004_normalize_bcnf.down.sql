-- 000004_normalize_bcnf.down.sql
-- Rollback of 000004: drop the unique constraints and indexes added.

ALTER TABLE programs DROP INDEX uq_programs_tenant_name;
ALTER TABLE session_stages DROP INDEX uq_session_stages_session_stage;
ALTER TABLE session_groups DROP INDEX uq_session_groups_session_name;
ALTER TABLE participants DROP INDEX uq_participants_session_child;
ALTER TABLE assessments DROP INDEX uq_assessments_participant_stage;
ALTER TABLE consent_logs DROP INDEX uq_consent_logs_participant_session_type;
ALTER TABLE reports DROP INDEX uq_reports_parent_token;
DROP INDEX idx_refresh_tokens_token_hash ON refresh_tokens;
DROP INDEX idx_reports_parent_access_token ON reports;
