-- 000006_smart_photo_file_size
-- Requirement K (sort gallery by photo size): record the byte size of the
-- uploaded file. Nullable — legacy rows predate size tracking and read as NULL
-- (serialized as "file_size": null in JSON). Populated from the multipart
-- header at upload; the stored file bytes are never re-encoded.

ALTER TABLE `smart_photos` ADD COLUMN `file_size` BIGINT NULL AFTER `taken_at`;
