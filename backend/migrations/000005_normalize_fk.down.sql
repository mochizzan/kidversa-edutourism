-- 000005_normalize_fk.down.sql
-- Rollback of 000005: drop the foreign-key constraints added.

ALTER TABLE kiosk_tokens DROP FOREIGN KEY fk_kiosk_session;
ALTER TABLE kiosk_tokens DROP FOREIGN KEY fk_kiosk_tenant;
ALTER TABLE reports DROP FOREIGN KEY fk_reports_approved_by;
ALTER TABLE recordings DROP FOREIGN KEY fk_recordings_reviewed_by;
ALTER TABLE assessments DROP FOREIGN KEY fk_assessments_assessed_by;
ALTER TABLE timeline_events DROP FOREIGN KEY fk_timeline_user;
ALTER TABLE session_groups DROP FOREIGN KEY fk_session_groups_current_stage;
