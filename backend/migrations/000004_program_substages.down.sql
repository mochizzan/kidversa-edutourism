-- 000004_program_substages (DOWN)
-- Reverse of the up migration, applied in reverse order so every FK target
-- exists when its constraint is (re)added. Restores the exact v3 shape so the
-- migration can be replayed. NEVER delete this file (recorded -> dirty version).
--
-- MariaDB note: combined ALTER (DROP FK + CHANGE COLUMN + ADD CONSTRAINT) on
-- group_stage_progress / assessments trips errno 194 ("Tablespace is missing").
-- The v2/v3 migrations solved this identically by DROP + CREATE of the table
-- (the dev DB is empty, so this is zero-data-loss). The unique keys are restored
-- under their v3 names via the fresh DDL; the renamed column keeps its data.

-- 8 (reverse). Drop the awarded-badge table.
DROP TABLE IF EXISTS `participant_badges`;

-- 7 (reverse). group_stage_progress: rebuild with the v3 (session_stage_id) shape.
DROP TABLE IF EXISTS `group_stage_progress`;
CREATE TABLE `group_stage_progress` (
  `id` char(36) NOT NULL,
  `group_id` char(36) NOT NULL,
  `session_stage_id` char(36) NOT NULL,
  `status` enum('LOCKED','UNLOCKED','IN_PROGRESS','COMPLETED','SKIPPED') NOT NULL DEFAULT 'LOCKED',
  `entered_at` datetime(3) DEFAULT NULL,
  `completed_at` datetime(3) DEFAULT NULL,
  `unlocked_by` char(36) DEFAULT NULL,
  `unlock_reason` varchar(255) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_group_stage` (`group_id`,`session_stage_id`),
  KEY `idx_group_stage_progress_deleted_at` (`deleted_at`),
  KEY `fk_group_stage_progress_stage` (`session_stage_id`),
  KEY `fk_group_stage_progress_unlocked_by` (`unlocked_by`),
  CONSTRAINT `fk_group_stage_progress_group` FOREIGN KEY (`group_id`) REFERENCES `session_groups` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_group_stage_progress_stage` FOREIGN KEY (`session_stage_id`) REFERENCES `session_stages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_group_stage_progress_unlocked_by` FOREIGN KEY (`unlocked_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6 (reverse). assessments: rebuild with the v3 (session_stage_id) shape.
--    The dev seed row was re-homed onto a session_substage; move it back to its
--    session_stage (program_substage -> program_stage -> owning session_stage).
DROP TABLE IF EXISTS `assessments`;
CREATE TABLE `assessments` (
  `id` char(36) NOT NULL,
  `participant_id` char(36) NOT NULL,
  `session_id` char(36) NOT NULL,
  `session_stage_id` char(36) DEFAULT NULL,
  `star_rating` int(11) NOT NULL DEFAULT 0,
  `comment` text DEFAULT NULL,
  `assessed_by` char(36) DEFAULT NULL,
  `assessed_at` datetime(3) DEFAULT NULL,
  `sync_status` enum('LOCAL','UPLOADING','SYNCED','FAILED') NOT NULL DEFAULT 'LOCAL',
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_assessments_participant_stage` (`participant_id`,`session_stage_id`),
  KEY `idx_assessments_participant` (`participant_id`),
  KEY `idx_assessments_session` (`session_id`),
  KEY `idx_assessments_session_stage` (`session_stage_id`),
  KEY `idx_assessments_deleted_at` (`deleted_at`),
  KEY `fk_assessments_assessed_by` (`assessed_by`),
  CONSTRAINT `fk_assessments_assessed_by` FOREIGN KEY (`assessed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_assessments_participant` FOREIGN KEY (`participant_id`) REFERENCES `participants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_assessments_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_assessments_session_stage` FOREIGN KEY (`session_stage_id`) REFERENCES `session_stages` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5 (reverse). Drop session_substages AFTER assessments no longer references it.
DROP TABLE IF EXISTS `session_substages`;

-- 4 (reverse). stage_contents: rebuild with v3 (program_stage_id) shape.
DROP TABLE IF EXISTS `stage_contents`;
CREATE TABLE `stage_contents` (
  `content_id` char(36) NOT NULL,
  `program_stage_id` char(36) NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`content_id`),
  KEY `idx_stage_contents_stage` (`program_stage_id`),
  KEY `idx_stage_contents_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_stage_contents_stage` FOREIGN KEY (`program_stage_id`) REFERENCES `program_stages` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3 (reverse). Drop program_substages AFTER stage_contents no longer references it.
DROP TABLE IF EXISTS `program_substages`;

-- 2 (reverse). Drop Final Program badge columns (atomic DROP COLUMN each).
ALTER TABLE `programs` DROP COLUMN `final_badge_image_url`;
ALTER TABLE `programs` DROP COLUMN `final_badge_name`;

-- 1 (reverse). Drop SubTopik badge columns (atomic DROP COLUMN each).
ALTER TABLE `program_stages` DROP COLUMN `badge_image_url`;
ALTER TABLE `program_stages` DROP COLUMN `badge_name`;
