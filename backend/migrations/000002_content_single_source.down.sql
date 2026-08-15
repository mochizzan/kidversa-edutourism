-- 000002_content_single_source DOWN
-- Best-effort reversal for dev/empty DB (A7b). Restores stage_contents to its
-- original single-source shape and drops the standalone contents table.

-- Undo stage_contents junction -> original 1-content-per-stage shape.
ALTER TABLE `stage_contents`
  DROP FOREIGN KEY `fk_stage_contents_content`,
  DROP FOREIGN KEY `fk_stage_contents_stage`,
  DROP PRIMARY KEY,
  DROP COLUMN `content_id`,
  DROP INDEX `idx_stage_contents_content`,
  DROP INDEX `idx_stage_contents_stage`;

ALTER TABLE `stage_contents`
  ADD COLUMN `id` char(36) NOT NULL FIRST,
  ADD COLUMN `title` varchar(200) NOT NULL DEFAULT '',
  ADD COLUMN `file_url` varchar(512) NOT NULL DEFAULT '',
  ADD COLUMN `youtube_url` varchar(512) DEFAULT NULL,
  ADD COLUMN `file_type` enum('VIDEO','IMAGE','AUDIO','GAME_BUNDLE') NOT NULL DEFAULT 'VIDEO',
  ADD COLUMN `duration_seconds` int(11) DEFAULT NULL,
  ADD PRIMARY KEY (`id`),
  ADD CONSTRAINT `fk_stage_contents_stage` FOREIGN KEY (`program_stage_id`) REFERENCES `program_stages` (`id`) ON DELETE CASCADE,
  ADD KEY `idx_stage_contents_stage` (`program_stage_id`),
  ADD KEY `idx_stage_contents_deleted_at` (`deleted_at`);

-- Drop the standalone contents table.
DROP TABLE IF EXISTS `contents`;
