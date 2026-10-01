-- 000006_smart_photo_file_size (down)
-- Remove the file_size column. Data is NOT preserved.

ALTER TABLE `smart_photos` DROP COLUMN `file_size`;
