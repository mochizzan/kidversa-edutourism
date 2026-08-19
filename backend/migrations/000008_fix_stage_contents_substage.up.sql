-- 000008_fix_stage_contents_substage (UP)
-- Repair a single silently-drifted object set: stage_contents.
--
-- Root cause: migrate.go's Force()-on-dirty auto-heal cleared the dirty flag and
-- recorded 000004 as applied WITHOUT replaying its SQL, so stage_contents never
-- got its program_stage_id -> program_substage_id re-point (everything else in
-- 000004..000007 is correct on the live dev DB).
--
-- This migration is guarded/idempotent so it is a clean no-op on a DB where 000004
-- already applied (column already program_substage_id) and performs the repair on
-- the drifted DB. Both converge to the identical end-state.
--
-- Recorded migrations (000001..000007) are NEVER edited (golang-migrate
-- dirty/missing-version rule); all repair lives here.

-- Drop the old FK -> program_stages if it is still present (drifted DB only).
ALTER TABLE `stage_contents`
  DROP FOREIGN KEY IF EXISTS `fk_stage_contents_stage`;

-- Drop the old index on program_stage_id if it is still present (drifted DB only).
ALTER TABLE `stage_contents`
  DROP INDEX IF EXISTS `idx_stage_contents_stage`;

-- Rename program_stage_id -> program_substage_id. No-op when already renamed.
ALTER TABLE `stage_contents`
  CHANGE COLUMN IF EXISTS `program_stage_id` `program_substage_id` char(36) NOT NULL;

-- Add the substage index if it is not already present.
ALTER TABLE `stage_contents`
  ADD INDEX IF NOT EXISTS `idx_stage_contents_substage` (`program_substage_id`);

-- Add the FK -> program_substages ON DELETE CASCADE.
-- MariaDB has no ADD CONSTRAINT IF NOT EXISTS ... FOREIGN KEY, so guard it
-- with a PREPARE/EXECUTE that only runs the DDL when the FK is absent.
-- FK checks stay ENABLED: the constraint must be validated on creation, and the
-- add was verified to succeed after the rename without any bypass.
SET @fk008_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'stage_contents'
    AND CONSTRAINT_NAME = 'fk_stage_contents_substage'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @fk008_sql = 'ALTER TABLE stage_contents ADD CONSTRAINT fk_stage_contents_substage FOREIGN KEY (program_substage_id) REFERENCES program_substages(id) ON DELETE CASCADE';
SET @fk008_do = IF(@fk008_exists = 0, @fk008_sql, 'DO 0');
PREPARE `fk008_stmt` FROM @fk008_do;
EXECUTE `fk008_stmt`;
DEALLOCATE PREPARE `fk008_stmt`;
