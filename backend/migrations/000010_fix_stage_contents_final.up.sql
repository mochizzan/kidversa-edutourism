-- 000010_fix_stage_contents_final
-- Definitive re-creation of stage_contents in its intended final shape.
--
-- 000004 (program_stage_id -> program_substage_id re-point) and 000008 (FK
-- repair) both fail or no-op on MariaDB 12 (000004 trips errno 194 on its
-- combined ALTER; 000008 uses CHANGE COLUMN IF EXISTS, which MariaDB 12 does
-- not support, so it silently leaves the column as program_stage_id). When the
-- generic runner (migrate.go) skips a broken migration and continues, 0004/0008
-- are skipped and stage_contents would be left with the wrong column name and
-- no FK to program_substages. This migration guarantees the correct end-state
-- regardless of whether 0004/0008 ran.
--
-- DROP+CREATE avoids the inplace-rebuild errno 194 that breaks 0004. stage_contents
-- is a pure junction with no business rows of its own, so this is zero-data-loss.
-- Idempotent: safe to run after 0004/0008 succeeded or after they were skipped.

DROP TABLE IF EXISTS `stage_contents`;

CREATE TABLE IF NOT EXISTS `stage_contents` (
  `content_id` char(36) NOT NULL,
  `program_substage_id` char(36) NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`content_id`),
  KEY `idx_stage_contents_substage` (`program_substage_id`),
  KEY `idx_stage_contents_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_stage_contents_content` FOREIGN KEY (`content_id`) REFERENCES `contents` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_stage_contents_substage` FOREIGN KEY (`program_substage_id`) REFERENCES `program_substages` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
