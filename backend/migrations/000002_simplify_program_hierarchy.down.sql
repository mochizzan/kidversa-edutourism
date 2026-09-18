ALTER TABLE `program_stages` ADD COLUMN `duration_minutes` int(11) NOT NULL DEFAULT 0;
ALTER TABLE `program_substages` ADD COLUMN `duration_minutes` int(11) NOT NULL DEFAULT 0;
ALTER TABLE `program_substages` ADD COLUMN `is_photo_stage` tinyint(1) NOT NULL DEFAULT 0;
