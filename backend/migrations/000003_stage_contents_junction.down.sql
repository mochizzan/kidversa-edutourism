-- Revert stage_contents to its pre-junction shape (as defined by 000001, before
-- 000002's failed ALTER). Zero-data-loss: the table is a pure junction.
DROP TABLE IF EXISTS `stage_contents`;

CREATE TABLE IF NOT EXISTS `stage_contents` (
  `id` char(36) NOT NULL,
  `program_stage_id` char(36) NOT NULL,
  `title` varchar(200) NOT NULL,
  `file_url` varchar(512) NOT NULL,
  `youtube_url` varchar(512) DEFAULT NULL,
  `file_type` enum('VIDEO','IMAGE','AUDIO','GAME_BUNDLE') NOT NULL,
  `duration_seconds` int(11) DEFAULT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_stage_contents_stage` (`program_stage_id`),
  KEY `idx_stage_contents_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_stage_contents_stage` FOREIGN KEY (`program_stage_id`) REFERENCES `program_stages` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
