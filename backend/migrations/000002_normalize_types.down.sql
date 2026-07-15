-- 000002_normalize_types.down.sql
-- Rollback of 000002: revert type conversions (best-effort; data may be truncated).

ALTER TABLE notifications DROP CONSTRAINT chk_notif_type;

ALTER TABLE timeline_events MODIFY COLUMN type varchar(40) NOT NULL;

ALTER TABLE sessions MODIFY COLUMN session_date varchar(20) NOT NULL;
ALTER TABLE assessments MODIFY COLUMN assessed_at varchar(64) NULL;
ALTER TABLE participant_missions MODIFY COLUMN completed_at varchar(64) NULL;
ALTER TABLE consent_logs
  MODIFY COLUMN sent_at varchar(64) NULL,
  MODIFY COLUMN responded_at varchar(64) NULL,
  MODIFY COLUMN consumed_at varchar(64) NULL,
  MODIFY COLUMN expires_at varchar(64) NULL;
ALTER TABLE recordings MODIFY COLUMN reviewed_at varchar(64) NULL;
ALTER TABLE reports
  MODIFY COLUMN parent_token_expires_at varchar(64) NULL,
  MODIFY COLUMN generated_at varchar(64) NULL,
  MODIFY COLUMN sent_at varchar(64) NULL;
ALTER TABLE smart_photos MODIFY COLUMN taken_at varchar(64) NULL;
