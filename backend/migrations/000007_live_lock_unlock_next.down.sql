-- 000007_live_lock_unlock_next (down)
-- Reverts 000007. Additive migration, so down is a pure drop.
--
-- * Drops the group_stage_progress_history table.
-- * Drops the locked_by / locked_at columns + their FK from group_stage_progress.
-- * Reverts the timeline_events.type enum to its pre-000007 values.
--
-- NOTE: the SKIPPED -> LOCKED status backfill is intentionally NOT reversed
-- (the values remain valid LOCKED rows). session_substage_id is left intact.

-- 1. timeline_events.type enum: remove 'stage:lock'.
ALTER TABLE `timeline_events`
  MODIFY COLUMN `type` enum('group:progress','group:completed','stage:unlock','override') NOT NULL;

-- 2. Drop the history table.
DROP TABLE IF EXISTS `group_stage_progress_history`;

-- 3. Drop lock audit columns + FK from group_stage_progress.
ALTER TABLE `group_stage_progress`
  DROP FOREIGN KEY `fk_group_stage_progress_locked_by`,
  DROP KEY `fk_group_stage_progress_locked_by`,
  DROP COLUMN `locked_at`,
  DROP COLUMN `locked_by`;
