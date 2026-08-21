-- 000011_fix_assessments_substage (UP)
-- Forward-only repair of the assessments table, completing the intent of
-- 000004_program_substages (step 6 rename + step 8 FK/unique rename) which was
-- Force-skipped by upWithRecovery after a combined-ALTER errno 194.
--
-- Why forward-only: 000001..000010 are NEVER edited (golang-migrate dirty rule).
-- Why no DROP+CREATE: assessments holds real business data (ratings + comments),
--   so repair is in-place (D4). 000004.down shows DROP+CREATE was only safe for
--   the data-less stage_contents / 0-row group_stage_progress.
-- Why one ALTER per statement: the combined ALTER in 000004 tripped MariaDB
--   errno 194 ("Tablespace is missing"); each object below is its own ALTER (D2).
-- Why information_schema guards (not CHANGE COLUMN IF EXISTS): that syntax is
--   unsupported on MariaDB 12 and fails silently (see 000010.up:6-7). The
--   PREPARE/EXECUTE guard here is the proven pattern from 000008.up:37-47 (D3).
--
-- Order matters (D5): rename column -> re-home rows -> NULL orphans -> add FK.
--   Existing assessments rows still hold a session_stages.id (000004's re-home
--   never ran), so the FK cannot be added before re-homing (error 1452).

-- 1. Rename session_stage_id -> session_substage_id (guarded; own ALTER).
SET @a011_col = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assessments'
    AND COLUMN_NAME = 'session_stage_id');
SET @a011_sql1 = IF(@a011_col > 0,
  'ALTER TABLE assessments CHANGE COLUMN session_stage_id session_substage_id char(36) DEFAULT NULL',
  'DO 0');
PREPARE a011_stmt1 FROM @a011_sql1;
EXECUTE a011_stmt1;
DEALLOCATE PREPARE a011_stmt1;

-- 2. Drop the stale FK + index on the old column name, if present (own ALTERs).
--    DROP FOREIGN KEY IF EXISTS / DROP INDEX IF EXISTS ARE supported on MariaDB 12.
ALTER TABLE assessments DROP FOREIGN KEY IF EXISTS fk_assessments_session_stage;
ALTER TABLE assessments DROP INDEX IF EXISTS idx_assessments_session_stage;

-- 3. Seed missing program_substages (seq 0) for any SubTopik that owns an
--    assessment (pattern: 000004.up:141-148).
INSERT INTO program_substages (id, program_stage_id, sequence_order, name, created_at, updated_at)
SELECT UUID(), ps.id, 0, CONCAT(ps.name, ' — Kegiatan'), NOW(3), NOW(3)
FROM program_stages ps
WHERE EXISTS (
    SELECT 1 FROM assessments a
    JOIN session_stages ss ON ss.id = a.session_substage_id
    WHERE ss.program_stage_id = ps.id)
  AND NOT EXISTS (SELECT 1 FROM program_substages WHERE program_stage_id = ps.id);

-- 4. Seed missing session_substages leaves for those SubTopiks
--    (pattern: 000004.up:158-168).
INSERT INTO session_substages (id, session_id, session_stage_id, program_substage_id, created_at, updated_at)
SELECT UUID(), ss.session_id, ss.id, psub.id, NOW(3), NOW(3)
FROM assessments a
JOIN session_stages ss ON ss.id = a.session_substage_id
JOIN program_substages psub ON psub.program_stage_id = ss.program_stage_id AND psub.sequence_order = 0
WHERE a.session_substage_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM session_substages ssub
    WHERE ssub.session_id = ss.session_id
      AND ssub.program_substage_id = psub.id);

-- 5. Re-home assessment rows onto their real session_substages leaf
--    (pattern: 000004.up:171-177).
UPDATE assessments a
JOIN session_stages ss ON ss.id = a.session_substage_id
JOIN program_substages psub ON psub.program_stage_id = ss.program_stage_id AND psub.sequence_order = 0
JOIN session_substages ssub ON ssub.session_id = ss.session_id
  AND ssub.program_substage_id = psub.id
SET a.session_substage_id = ssub.id
WHERE a.session_substage_id IS NOT NULL;

-- 6. Orphan rows (no resolvable leaf) keep star_rating/comment but lose the leaf
--    link (D6). Prevents error 1452 on the FK add below.
UPDATE assessments
SET session_substage_id = NULL
WHERE session_substage_id IS NOT NULL
  AND session_substage_id NOT IN (SELECT id FROM session_substages WHERE id IS NOT NULL);

-- 7. Add the leaf index (guarded; own ALTER).
SET @a011_idx = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assessments'
    AND INDEX_NAME = 'idx_assessments_session_substage');
SET @a011_sql7 = IF(@a011_idx = 0,
  'ALTER TABLE assessments ADD INDEX idx_assessments_session_substage (session_substage_id)',
  'DO 0');
PREPARE a011_stmt7 FROM @a011_sql7;
EXECUTE a011_stmt7;
DEALLOCATE PREPARE a011_stmt7;

-- 8. Add the FK to session_substages (guarded on TABLE_CONSTRAINTS; own ALTER).
SET @a011_fk = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assessments'
    AND CONSTRAINT_NAME = 'fk_assessments_session_substage'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @a011_sql8 = IF(@a011_fk = 0,
  'ALTER TABLE assessments ADD CONSTRAINT fk_assessments_session_substage FOREIGN KEY (session_substage_id) REFERENCES session_substages(id) ON DELETE SET NULL',
  'DO 0');
PREPARE a011_stmt8 FROM @a011_sql8;
EXECUTE a011_stmt8;
DEALLOCATE PREPARE a011_stmt8;

-- 9. Rename the unique key (guarded on STATISTICS; own ALTER).
SET @a011_uq = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assessments'
    AND INDEX_NAME = 'uq_assessments_participant_stage');
SET @a011_sql9 = IF(@a011_uq > 0,
  'ALTER TABLE assessments RENAME INDEX uq_assessments_participant_stage TO uq_assessments_participant_substage',
  'DO 0');
PREPARE a011_stmt9 FROM @a011_sql9;
EXECUTE a011_stmt9;
DEALLOCATE PREPARE a011_stmt9;

-- 10. star_rating DEFAULT 1 (allow explicit 0; the app always sends a value).
SET @a011_rat = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assessments'
    AND COLUMN_NAME = 'star_rating' AND COLUMN_DEFAULT = '0');
SET @a011_sql10 = IF(@a011_rat > 0,
  'ALTER TABLE assessments MODIFY COLUMN star_rating int(11) NOT NULL DEFAULT 1',
  'DO 0');
PREPARE a011_stmt10 FROM @a011_sql10;
EXECUTE a011_stmt10;
DEALLOCATE PREPARE a011_stmt10;
