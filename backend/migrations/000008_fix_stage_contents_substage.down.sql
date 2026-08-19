-- 000008_fix_stage_contents_substage (DOWN)
-- Reverse 000008: return stage_contents to the pre-000008 (drifted/original) shape,
-- re-pointing it back to program_stages. Guarded/idempotent: a clean no-op when the
-- table is already in that shape, and converges on the converged DB too.
--
-- Recorded migrations (000001..000007) are NEVER edited; all repair lives in 000008.

-- Drop the FK -> program_substages if it is still present.
ALTER TABLE `stage_contents`
  DROP FOREIGN KEY IF EXISTS `fk_stage_contents_substage`;

-- Drop the substage index if it is still present.
ALTER TABLE `stage_contents`
  DROP INDEX IF EXISTS `idx_stage_contents_substage`;

-- Rename program_substage_id -> program_stage_id. No-op when already named.
ALTER TABLE `stage_contents`
  CHANGE COLUMN IF EXISTS `program_substage_id` `program_stage_id` char(36) NOT NULL;

-- Add the old index on program_stage_id if it is not already present.
ALTER TABLE `stage_contents`
  ADD INDEX IF NOT EXISTS `idx_stage_contents_stage` (`program_stage_id`);

-- Add the old FK -> program_stages ON DELETE CASCADE.
-- MariaDB has no ADD CONSTRAINT IF NOT EXISTS ... FOREIGN KEY, so guard it
-- with a PREPARE/EXECUTE that only runs the DDL when the FK is absent.
-- FK checks stay ENABLED so the restored constraint is validated on creation.
SET @fk008d_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'stage_contents'
    AND CONSTRAINT_NAME = 'fk_stage_contents_stage'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @fk008d_sql = 'ALTER TABLE stage_contents ADD CONSTRAINT fk_stage_contents_stage FOREIGN KEY (program_stage_id) REFERENCES program_stages(id) ON DELETE CASCADE';
SET @fk008d_do = IF(@fk008d_exists = 0, @fk008d_sql, 'DO 0');
PREPARE `fk008d_stmt` FROM @fk008d_do;
EXECUTE `fk008d_stmt`;
DEALLOCATE PREPARE `fk008d_stmt`;
