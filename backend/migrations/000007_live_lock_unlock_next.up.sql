-- 000007_live_lock_unlock_next
-- Live Monitor Lock/Unlock/Next refactor support.
--
-- * Adds lock audit columns (locked_by / locked_at) to group_stage_progress.
-- * Adds an append-only group_stage_progress_history table recording every
--   lock/unlock transition (no deleted_at — history is never soft-deleted).
-- * Bootstraps history rows for existing progress so the audit trail is not
--   empty for rows that predate this migration.
-- * Backfills legacy SKIPPED progress back to LOCKED (the new default topic
--   state when a session runs).
-- * Extends the timeline_events.type enum to include 'stage:lock'.
--
-- Strategy notes:
--   * NEVER rename session_substage_id (golang-migrate dirty-version rule +
--     the column is the natural key for all live writes). Only additive
--     columns + a new table here.
--   * Bootstrap history BEFORE the SKIPPED -> LOCKED backfill so a skipped
--     row's transition (SKIPPED -> LOCKED) is recorded as history.

-- ---------------------------------------------------------------------------
-- 1. group_stage_progress: lock audit columns (after unlock_reason).
-- ---------------------------------------------------------------------------
ALTER TABLE `group_stage_progress`
  ADD COLUMN `locked_by` char(36) DEFAULT NULL AFTER `unlock_reason`,
  ADD COLUMN `locked_at` datetime(3) DEFAULT NULL AFTER `locked_by`,
  ADD KEY `fk_group_stage_progress_locked_by` (`locked_by`),
  ADD CONSTRAINT `fk_group_stage_progress_locked_by` FOREIGN KEY (`locked_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 2. group_stage_progress_history: append-only audit trail (no deleted_at).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `group_stage_progress_history` (
  `id` char(36) NOT NULL,
  `group_id` char(36) NOT NULL,
  `session_id` char(36) NOT NULL,
  `session_substage_id` char(36) NOT NULL,
  `from_status` varchar(20) DEFAULT NULL,
  `to_status` varchar(20) NOT NULL,
  `actor_id` char(36) DEFAULT NULL,
  `reason` varchar(255) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `idx_groupprogresshist_group` (`group_id`),
  KEY `idx_groupprogresshist_session` (`session_id`),
  KEY `idx_groupprogresshist_substage` (`session_substage_id`),
  KEY `idx_groupprogresshist_created` (`created_at`),
  CONSTRAINT `fk_groupprogresshist_group` FOREIGN KEY (`group_id`) REFERENCES `session_groups` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_groupprogresshist_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_groupprogresshist_substage` FOREIGN KEY (`session_substage_id`) REFERENCES `session_substages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_groupprogresshist_actor` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 3. Bootstrap history rows for existing progress (idempotent).
--    Records each existing row as a LOCKED -> <current> transition so the
--    audit trail starts non-empty. Skipped when a matching history row exists.
-- ---------------------------------------------------------------------------
INSERT INTO `group_stage_progress_history`
  (`id`, `group_id`, `session_id`, `session_substage_id`, `from_status`, `to_status`, `actor_id`, `reason`, `created_at`)
SELECT
  UUID(),
  gsp.`group_id`,
  sg.`session_id`,
  gsp.`session_substage_id`,
  'LOCKED',
  gsp.`status`,
  gsp.`unlocked_by`,
  'migration_bootstrap',
  gsp.`created_at`
FROM `group_stage_progress` gsp
JOIN `session_groups` sg ON sg.`id` = gsp.`group_id`
WHERE gsp.`deleted_at` IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM `group_stage_progress_history` h
    WHERE h.`group_id` = gsp.`group_id`
      AND h.`session_substage_id` = gsp.`session_substage_id`
  );

-- ---------------------------------------------------------------------------
-- 4. Backfill legacy SKIPPED progress back to LOCKED (new default state).
--    Guarded by deleted_at IS NULL. Values remain valid; down migration does
--    NOT reverse this.
-- ---------------------------------------------------------------------------
UPDATE `group_stage_progress`
SET `status` = 'LOCKED', `locked_at` = `updated_at`
WHERE `status` = 'SKIPPED'
  AND `deleted_at` IS NULL;

-- ---------------------------------------------------------------------------
-- 5. timeline_events.type enum: add 'stage:lock'.
-- ---------------------------------------------------------------------------
ALTER TABLE `timeline_events`
  MODIFY COLUMN `type` enum('group:progress','group:completed','stage:unlock','override','stage:lock') NOT NULL;
