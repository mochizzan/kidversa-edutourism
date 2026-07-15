-- 000002_normalize_types.up.sql
-- Phase 2 of the database normalization plan: fix data types (varchar timestamps
-- -> datetime(3), session_date varchar -> DATE) and constrain the timeline_events
-- type to its 4 allowed enum values. notifications.type keeps a CHECK constraint
-- because future types may be added by the backend.

-- Sessions: session_date varchar(20) -> DATE
ALTER TABLE sessions MODIFY COLUMN session_date DATE NOT NULL;

-- assessments.assessed_at varchar(64) -> datetime(3)
UPDATE assessments SET assessed_at = NULL WHERE assessed_at = '' OR assessed_at IS NULL;
ALTER TABLE assessments MODIFY COLUMN assessed_at datetime(3) NULL;

-- participant_missions.completed_at varchar(64) -> datetime(3)
UPDATE participant_missions SET completed_at = NULL WHERE completed_at = '' OR completed_at IS NULL;
ALTER TABLE participant_missions MODIFY COLUMN completed_at datetime(3) NULL;

-- consent_logs: 4 timestamp columns varchar(64) -> datetime(3)
UPDATE consent_logs SET sent_at = NULL WHERE sent_at = '' OR sent_at IS NULL;
UPDATE consent_logs SET responded_at = NULL WHERE responded_at = '' OR responded_at IS NULL;
UPDATE consent_logs SET consumed_at = NULL WHERE consumed_at = '' OR consumed_at IS NULL;
UPDATE consent_logs SET expires_at = NULL WHERE expires_at = '' OR expires_at IS NULL;
ALTER TABLE consent_logs
  MODIFY COLUMN sent_at datetime(3) NULL,
  MODIFY COLUMN responded_at datetime(3) NULL,
  MODIFY COLUMN consumed_at datetime(3) NULL,
  MODIFY COLUMN expires_at datetime(3) NULL;

-- recordings.reviewed_at varchar(64) -> datetime(3)
UPDATE recordings SET reviewed_at = NULL WHERE reviewed_at = '' OR reviewed_at IS NULL;
ALTER TABLE recordings MODIFY COLUMN reviewed_at datetime(3) NULL;

-- reports: 3 timestamp columns varchar(64) -> datetime(3)
UPDATE reports SET parent_token_expires_at = NULL WHERE parent_token_expires_at = '' OR parent_token_expires_at IS NULL;
UPDATE reports SET generated_at = NULL WHERE generated_at = '' OR generated_at IS NULL;
UPDATE reports SET sent_at = NULL WHERE sent_at = '' OR sent_at IS NULL;
ALTER TABLE reports
  MODIFY COLUMN parent_token_expires_at datetime(3) NULL,
  MODIFY COLUMN generated_at datetime(3) NULL,
  MODIFY COLUMN sent_at datetime(3) NULL;

-- smart_photos.taken_at varchar(64) -> datetime(3)
UPDATE smart_photos SET taken_at = NULL WHERE taken_at = '' OR taken_at IS NULL;
ALTER TABLE smart_photos MODIFY COLUMN taken_at datetime(3) NULL;

-- timeline_events.type varchar(40) -> enum (4 allowed values)
ALTER TABLE timeline_events MODIFY COLUMN type enum('group:progress','group:completed','stage:unlock','override') NOT NULL;

-- notifications.type: keep varchar but constrain with a CHECK (future-proof)
ALTER TABLE notifications ADD CONSTRAINT chk_notif_type CHECK (type IN ('user_pending_approval'));
