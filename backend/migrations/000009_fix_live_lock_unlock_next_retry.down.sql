-- 000009_fix_live_lock_unlock_next_retry (down)
-- Reverts 000009. Pure drop / reverse of additive changes.
--
-- NOTE: the SKIPPED -> LOCKED status backfill is intentionally NOT reversed
-- (the values remain valid LOCKED rows); matches 000007's down contract.

-- 1. timeline_events.type enum: remove 'stage:lock'.
ALTER TABLE `timeline_events`
  MODIFY COLUMN `type` enum('group:progress','group:completed','stage:unlock','override') NOT NULL;

-- 2. Drop the history table.
DROP TABLE IF EXISTS `group_stage_progress_history`;

-- 3. Drop lock audit columns + FK from group_stage_progress.
-- (0009.up DROP+CREATEs the table including these; down removes only the
-- additive lock-audit parts so the 0001 base table remains.)
ALTER TABLE `group_stage_progress`
  DROP FOREIGN KEY `fk_group_stage_progress_locked_by`,
  DROP KEY `fk_group_stage_progress_locked_by`,
  DROP COLUMN `locked_at`,
  DROP COLUMN `locked_by`;
