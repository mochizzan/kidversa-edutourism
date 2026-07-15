-- 000005_normalize_fk.up.sql
-- Phase 5 of the database normalization plan: add the missing foreign-key
-- constraints (3NF referential integrity). All referenced parents exist and no
-- orphaned rows were present at migration time (verified in the pre-audit).

ALTER TABLE kiosk_tokens ADD CONSTRAINT fk_kiosk_session
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;

ALTER TABLE kiosk_tokens ADD CONSTRAINT fk_kiosk_tenant
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE reports ADD CONSTRAINT fk_reports_approved_by
  FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE recordings ADD CONSTRAINT fk_recordings_reviewed_by
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE assessments ADD CONSTRAINT fk_assessments_assessed_by
  FOREIGN KEY (assessed_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE timeline_events ADD CONSTRAINT fk_timeline_user
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE session_groups ADD CONSTRAINT fk_session_groups_current_stage
  FOREIGN KEY (current_session_stage_id) REFERENCES session_stages(id) ON DELETE SET NULL;
