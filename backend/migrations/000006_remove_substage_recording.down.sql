-- 000006_remove_substage_recording.down.sql: restore the substage recording flag
-- to the pre-000006 shape (NOT NULL DEFAULT 0, after duration_minutes).

ALTER TABLE program_substages
  ADD COLUMN is_recording_stage tinyint(1) NOT NULL DEFAULT 0 AFTER duration_minutes;
