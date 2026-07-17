-- 000010_session_time_fields.up.sql
-- Add start_time/end_time to sessions and migrate session_date from VARCHAR(20) to DATE.
-- Existing VARCHAR dates are stored as 'YYYY-MM-DD' strings, so CAST works directly.

ALTER TABLE sessions
  MODIFY COLUMN session_date DATE NOT NULL,
  ADD COLUMN start_time TIME NULL AFTER session_date,
  ADD COLUMN end_time TIME NULL AFTER start_time;
