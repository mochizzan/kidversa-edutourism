-- 000013_topic_reports (UP)
-- Forward-only: 000001..000012 are NEVER edited (golang-migrate dirty rule).
--
-- Adds per-Topic scoping to `reports` so the invariant becomes
-- 1 Report = 1 Topic (program_stage) = 1 Participant.
--
-- Existing rows keep program_stage_id = NULL (legacy whole-session reports);
-- they are excluded from the new per-Topic generation and shown without a
-- Topic tab. No row cloning/backfill (avoids dirty-DB risk and public-token churn).
--
-- Style: one ALTER per statement; guards via PREPARE/EXECUTE so the file is
-- idempotent on column/FK/index (pattern proven in 000011.up). The re-key
-- uses DROP INDEX IF EXISTS (safe) + plain ADD (migrate never re-runs a
-- succeeded version).

-- 1. Add nullable program_stage_id column (guarded; own ALTER).
SET @a013_col = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports'
    AND COLUMN_NAME = 'program_stage_id');
SET @a013_sql1 = IF(@a013_col = 0,
  'ALTER TABLE reports ADD COLUMN program_stage_id char(36) DEFAULT NULL',
  'DO 0');
PREPARE a013_stmt1 FROM @a013_sql1;
EXECUTE a013_stmt1;
DEALLOCATE PREPARE a013_stmt1;

-- 2. Re-key the unique constraint: drop old (session_id, participant_id),
--    add (session_id, participant_id, program_stage_id).
--    DROP INDEX IF EXISTS is supported on MariaDB 12 (no-op if absent).
ALTER TABLE reports DROP INDEX IF EXISTS uq_reports_session_participant;
ALTER TABLE reports ADD UNIQUE KEY uq_reports_session_participant_topic (session_id, participant_id, program_stage_id);

-- 3. Add index on program_stage_id (guarded; own ALTER).
SET @a013_idx = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports'
    AND INDEX_NAME = 'idx_reports_topic');
SET @a013_sql3 = IF(@a013_idx = 0,
  'ALTER TABLE reports ADD INDEX idx_reports_topic (program_stage_id)',
  'DO 0');
PREPARE a013_stmt3 FROM @a013_sql3;
EXECUTE a013_stmt3;
DEALLOCATE PREPARE a013_stmt3;

-- 4. Add FK to program_stages (guarded on TABLE_CONSTRAINTS; own ALTER).
SET @a013_fk = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports'
    AND CONSTRAINT_NAME = 'fk_reports_program_stage'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @a013_sql4 = IF(@a013_fk = 0,
  'ALTER TABLE reports ADD CONSTRAINT fk_reports_program_stage FOREIGN KEY (program_stage_id) REFERENCES program_stages(id) ON DELETE CASCADE',
  'DO 0');
PREPARE a013_stmt4 FROM @a013_sql4;
EXECUTE a013_stmt4;
DEALLOCATE PREPARE a013_stmt4;
