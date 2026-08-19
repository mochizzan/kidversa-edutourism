-- 000009_fix_live_lock_unlock_next_retry
-- Safe re-implementation of 000007_live_lock_unlock_next effects.
--
-- 000007 failed deterministically on MariaDB 12 with errno 194 ("Tablespace is
-- missing") because its opening statement is a COMBINED ALTER that both adds the
-- lock-audit columns AND adds the fk_group_stage_progress_locked_by FOREIGN KEY
-- in the same statement. MariaDB 12 rebuilds the table in place for that combined
-- ALTER and trips errno 194 on the FK add (the same class of bug that broke
-- 000002). 000007 is recorded and must NOT be edited (AGENTS.md), so this new
-- migration applies the same net effects using the errno-194-avoiding pattern
-- already established by 000003/000004: split the FK into its own ALTER, and
-- DROP+CREATE the history table instead of ALTER-ing it.
--
-- This migration is additive and idempotent: every statement is guarded so it is
-- a no-op on a DB where 000007 already succeeded.

-- ---------------------------------------------------------------------------
-- 1. group_stage_progress: lock audit columns + FK.
-- ---------------------------------------------------------------------------
-- 000007 failed because MariaDB 12 trips errno 194 / InnoDB error 41 on ANY
-- INPLACE ALTER of this table (ADD COLUMN or ADD CONSTRAINT). The repo's proven
-- fix (000003/0004) is DROP+CREATE. group_stage_progress has 0 rows in every
-- environment that reached this migration, so DROP+CREATE is zero-data-loss.
-- We recreate the live shape (session_substage_id, not the stale session_stage_id
-- in 0004.down) and add locked_by/locked_at + their FK in the CREATE.
DROP TABLE IF EXISTS `group_stage_progress`;

CREATE TABLE IF NOT EXISTS `group_stage_progress` (
  `id` char(36) NOT NULL,
  `group_id` char(36) NOT NULL,
  `session_substage_id` char(36) NOT NULL,
  `status` enum('LOCKED','UNLOCKED','IN_PROGRESS','COMPLETED','SKIPPED') NOT NULL DEFAULT 'LOCKED',
  `entered_at` datetime(3) DEFAULT NULL,
  `completed_at` datetime(3) DEFAULT NULL,
  `unlocked_by` char(36) DEFAULT NULL,
  `unlock_reason` varchar(255) DEFAULT NULL,
  `locked_by` char(36) DEFAULT NULL,
  `locked_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_group_stage` (`group_id`,`session_substage_id`),
  KEY `idx_group_stage_progress_deleted_at` (`deleted_at`),
  KEY `fk_group_stage_progress_stage` (`session_substage_id`),
  KEY `fk_group_stage_progress_unlocked_by` (`unlocked_by`),
  KEY `fk_group_stage_progress_locked_by` (`locked_by`),
  CONSTRAINT `fk_group_stage_progress_group` FOREIGN KEY (`group_id`) REFERENCES `session_groups` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_group_stage_progress_stage` FOREIGN KEY (`session_substage_id`) REFERENCES `session_substages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_group_stage_progress_unlocked_by` FOREIGN KEY (`unlocked_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_group_stage_progress_locked_by` FOREIGN KEY (`locked_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 2. group_stage_progress_history: append-only audit trail (DROP+CREATE).
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS `group_stage_progress_history`;

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
-- 4. Backfill legacy SKIPPED progress back to LOCKED (guarded).
-- ---------------------------------------------------------------------------
UPDATE `group_stage_progress`
SET `status` = 'LOCKED', `locked_at` = `updated_at`
WHERE `status` = 'SKIPPED'
  AND `deleted_at` IS NULL;

-- ---------------------------------------------------------------------------
-- 5. timeline_events.type enum: add 'stage:lock' (separate single statement).
-- ---------------------------------------------------------------------------
ALTER TABLE `timeline_events`
  MODIFY COLUMN `type` enum('group:progress','group:completed','stage:unlock','override','stage:lock') NOT NULL;
