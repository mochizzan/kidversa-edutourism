-- 000003_remove_program_thumbnail (down)
-- Restore the original thumbnail_url column definition from 000001_init_schema.
-- Data is NOT restored (no historical values to preserve, per spec 4.3).

ALTER TABLE `programs` ADD COLUMN `thumbnail_url` varchar(512) DEFAULT NULL;
