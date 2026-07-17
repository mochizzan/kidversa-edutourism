-- 000010_session_time_fields.down.sql
-- Reverse: drop time columns and revert session_date to VARCHAR(20).

ALTER TABLE sessions
  DROP COLUMN start_time,
  DROP COLUMN end_time,
  MODIFY COLUMN session_date VARCHAR(20) NOT NULL;
