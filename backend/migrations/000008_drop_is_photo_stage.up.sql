-- 000008_drop_is_photo_stage
-- Field photo-stage (is_photo_stage) terbukti tanpa logika fungsional: seluruh
-- konsumennya hanya rendering label visual + payload-plumbing + penyimpanan DB;
-- nol konsumen logika backend (validasi/filter/sort/perhitungan/gating).
-- Kolom ini dihapus total dari program_stages (entity/DTO/handler/repo sudah
-- menghapus referensinya pada perubahan yang sama).

ALTER TABLE `program_stages` DROP COLUMN `is_photo_stage`;
