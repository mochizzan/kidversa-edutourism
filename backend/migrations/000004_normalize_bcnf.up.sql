-- 000004_normalize_bcnf.up.sql
-- Phase 4 of the database normalization plan: add the missing unique constraints
-- (candidate keys) and the two missing indexes (BCNF + performance).

-- programs: unique program name per tenant
ALTER TABLE programs ADD CONSTRAINT uq_programs_tenant_name UNIQUE (tenant_id, name);

-- session_stages: unique stage per session
ALTER TABLE session_stages ADD CONSTRAINT uq_session_stages_session_stage UNIQUE (session_id, program_stage_id);

-- session_groups: unique group name per session
ALTER TABLE session_groups ADD CONSTRAINT uq_session_groups_session_name UNIQUE (session_id, name);

-- participants: prevent duplicate child registration
ALTER TABLE participants ADD CONSTRAINT uq_participants_session_child UNIQUE (session_id, child_name, parent_phone);

-- assessments: one assessment per participant per stage
ALTER TABLE assessments ADD CONSTRAINT uq_assessments_participant_stage UNIQUE (participant_id, session_stage_id);

-- consent_logs: one consent per participant per session per type
ALTER TABLE consent_logs ADD CONSTRAINT uq_consent_logs_participant_session_type UNIQUE (participant_id, session_id, consent_type);

-- reports: parent_access_token must be unique for lookup (NULLs allowed)
ALTER TABLE reports ADD CONSTRAINT uq_reports_parent_token UNIQUE (parent_access_token);

-- Missing indexes
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_reports_parent_access_token ON reports(parent_access_token);
