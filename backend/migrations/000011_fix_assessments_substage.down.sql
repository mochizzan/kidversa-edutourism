-- 000011_fix_assessments_substage (DOWN)
-- Structural revert to the v3 shape (session_stage_id, uq_assessments_participant_stage,
-- star_rating DEFAULT 0). NOT a data revert: after the up migration re-homed
-- session_substage_id onto real session_substages leaves, the ORIGINAL
-- session_stages.id values cannot be reconstructed. Per D7 we best-effort map the
-- leaf back to its owning session_stage and NULL every row we cannot (zero data
-- loss of ratings/comments; only the stage link may be cleared).
--
-- One ALTER per statement; CHANGE/ADD COLUMN IF EXISTS avoided (unsupported on
-- MariaDB 12 — 000010.up:6-7). Guards use information_schema + PREPARE/EXECUTE
-- (proven pattern 000008.up:37-47).

-- 1. Drop the FK added by up (guarded on TABLE_CONSTRAINTS).
SET @d011_fk = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assessments'
    AND CONSTRAINT_NAME = 'fk_assessments_session_substage'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @d011_sql1 = IF(@d011_fk > 0,
  'ALTER TABLE assessments DROP FOREIGN KEY fk_assessments_session_substage',
  'DO 0');
PREPARE d011_stmt1 FROM @d011_sql1;
EXECUTE d011_stmt1;
DEALLOCATE PREPARE d011_stmt1;

-- 2. Drop the leaf index (guarded on STATISTICS).
SET @d011_idx = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assessments'
    AND INDEX_NAME = 'idx_assessments_session_substage');
SET @d011_sql2 = IF(@d011_idx > 0,
  'ALTER TABLE assessments DROP INDEX idx_assessments_session_substage',
  'DO 0');
PREPARE d011_stmt2 FROM @d011_sql2;
EXECUTE d011_stmt2;
DEALLOCATE PREPARE d011_stmt2;

-- 3. Rename the unique key back to its v3 name (guarded on STATISTICS).
SET @d011_uq = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assessments'
    AND INDEX_NAME = 'uq_assessments_participant_substage');
SET @d011_sql3 = IF(@d011_uq > 0,
  'ALTER TABLE assessments RENAME INDEX uq_assessments_participant_substage TO uq_assessments_participant_stage',
  'DO 0');
PREPARE d011_stmt3 FROM @d011_sql3;
EXECUTE d011_stmt3;
DEALLOCATE PREPARE d011_stmt3;

-- 4. Rename column session_substage_id -> session_stage_id (guarded).
SET @d011_col = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assessments'
    AND COLUMN_NAME = 'session_substage_id');
SET @d011_sql4 = IF(@d011_col > 0,
  'ALTER TABLE assessments CHANGE COLUMN session_substage_id session_stage_id char(36) DEFAULT NULL',
  'DO 0');
PREPARE d011_stmt4 FROM @d011_sql4;
EXECUTE d011_stmt4;
DEALLOCATE PREPARE d011_stmt4;

-- 5. Best-effort map the leaf link back to its owning session_stage (the up
--    migration overwrote the original session_stages.id with a session_substages
--    id, so this is the closest reconstruction possible). Rows with a leaf that
--    no longer resolves are left NULL (D7).
UPDATE assessments a
JOIN session_substages ssub ON ssub.id = a.session_stage_id
SET a.session_stage_id = ssub.session_stage_id
WHERE a.session_stage_id IS NOT NULL;

UPDATE assessments
SET session_stage_id = NULL
WHERE session_stage_id IS NOT NULL
  AND session_stage_id NOT IN (SELECT id FROM session_stages WHERE id IS NOT NULL);

-- 6. star_rating DEFAULT back to 0 (guarded).
SET @d011_rat = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assessments'
    AND COLUMN_NAME = 'star_rating' AND COLUMN_DEFAULT = '1');
SET @d011_sql6 = IF(@d011_rat > 0,
  'ALTER TABLE assessments MODIFY COLUMN star_rating int(11) NOT NULL DEFAULT 0',
  'DO 0');
PREPARE d011_stmt6 FROM @d011_sql6;
EXECUTE d011_stmt6;
DEALLOCATE PREPARE d011_stmt6;
