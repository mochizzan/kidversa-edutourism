-- 000013_topic_reports (DOWN)
-- Reverse of 000013.up. Safe order: drop FK -> drop topic index ->
-- drop column -> restore legacy unique key (session_id, participant_id).
--
-- Note: down does NOT restore the legacy whole-session rows; it only removes
-- the schema additions. Idempotent-guarded like up.

-- 1. Drop the FK (guarded on TABLE_CONSTRAINTS; own ALTER).
SET @d013_fk = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports'
    AND CONSTRAINT_NAME = 'fk_reports_program_stage'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @d013_sql1 = IF(@d013_fk > 0,
  'ALTER TABLE reports DROP FOREIGN KEY fk_reports_program_stage',
  'DO 0');
PREPARE d013_stmt1 FROM @d013_sql1;
EXECUTE d013_stmt1;
DEALLOCATE PREPARE d013_stmt1;

-- 2. Drop the topic index (guarded; own ALTER).
SET @d013_idx = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports'
    AND INDEX_NAME = 'idx_reports_topic');
SET @d013_sql2 = IF(@d013_idx > 0,
  'ALTER TABLE reports DROP INDEX idx_reports_topic',
  'DO 0');
PREPARE d013_stmt2 FROM @d013_sql2;
EXECUTE d013_stmt2;
DEALLOCATE PREPARE d013_stmt2;

-- 3. Re-key back: drop the 3-col unique, restore legacy 2-col unique.
ALTER TABLE reports DROP INDEX IF EXISTS uq_reports_session_participant_topic;
ALTER TABLE reports ADD UNIQUE KEY uq_reports_session_participant (session_id, participant_id);

-- 4. Drop the column (guarded; own ALTER).
SET @d013_col = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports'
    AND COLUMN_NAME = 'program_stage_id');
SET @d013_sql4 = IF(@d013_col > 0,
  'ALTER TABLE reports DROP COLUMN program_stage_id',
  'DO 0');
PREPARE d013_stmt4 FROM @d013_sql4;
EXECUTE d013_stmt4;
DEALLOCATE PREPARE d013_stmt4;
