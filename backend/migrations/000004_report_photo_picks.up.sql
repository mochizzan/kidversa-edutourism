-- 000004_report_photo_picks
-- Pilihan foto rapor per-topik: satu baris per participant+session+topic
-- (program_stage). ON DELETE CASCADE ke smart_photos; unique key adalah
-- inti kontrak "satu foto per topik". Tanpa kolom deleted_at (hapus keras).
CREATE TABLE IF NOT EXISTS `report_photo_picks` (
  `id` CHAR(36) NOT NULL,
  `participant_id` CHAR(36) NOT NULL,
  `session_id` CHAR(36) NOT NULL,
  `program_stage_id` CHAR(36) NOT NULL,
  `photo_id` CHAR(36) NOT NULL,
  `created_at` DATETIME(3) NULL,
  `updated_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_photo_pick` (`participant_id`, `session_id`, `program_stage_id`),
  CONSTRAINT `fk_picks_participant` FOREIGN KEY (`participant_id`) REFERENCES `participants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_picks_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_picks_photo` FOREIGN KEY (`photo_id`) REFERENCES `smart_photos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
