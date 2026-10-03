-- 000008_drop_is_photo_stage (down)
-- Mengembalikan kolom persis definisi 000001_init_schema:
--   `is_photo_stage` tinyint(1) NOT NULL DEFAULT 0
-- pada tabel program_stages. AFTER `content_type` mempertahankan urutan kolom
-- 000001 (duration_minutes sudah di-drop oleh 000002, jadi tetangga kirinya
-- tetap content_type). Data TIDAK dikembalikan (default 0 mengikuti 000001).

ALTER TABLE `program_stages` ADD COLUMN `is_photo_stage` tinyint(1) NOT NULL DEFAULT 0 AFTER `content_type`;
