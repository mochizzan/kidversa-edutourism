-- 000003_remove_program_thumbnail
-- Remove the unused thumbnail_url column from programs.
-- The field was never displayed or consumed by the product.

ALTER TABLE `programs` DROP COLUMN `thumbnail_url`;
