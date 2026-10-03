-- =============================================================================
-- 000009_photos_per_topic: ikat foto ke topik per (peserta, sesi, stage).
-- =============================================================================
--
-- FUNGSI:
--   Menambahkan kolom kunci topik pada tabel smart_photos:
--     session_stage_id CHAR(36) NOT NULL DEFAULT ''
--   ditambah indeks komposit idx_smart_photos_topic
--   (participant_id, session_id, session_stage_id).
--
--   Dengan kunci ini, "foto topik X milik peserta P pada sesi S" menjadi
--   satu equality check di indeks — untuk foto rapor per-topik, galeri
--   per-topik, dan filter GET /api/photos?session_stage_id=... — tanpa
--   menebak topik dari nama file atau menyaring topik di memara aplikasi.
--
-- STRATEGI DATA LAMA (tanpa fabrikasi, sama seperti 000007):
--   Tidak ada backfill. Foto yang di-upload sebelum migrasi ini TIDAK
--   pernah menyimpan topiknya; mengisi kolom baru dengan stage tertentu
--   berarti MENGARANG data topik. Sebagai gantinya dipakai sentinel
--   '' (string kosong) = "legacy / tanpa topik":
--     - baris smart_photos lama otomatis memakai DEFAULT '';
--     - bucket eksplisit `?session_stage_id=` (param ADA, nilai kosong)
--       pada ListPhotos memakai `session_stage_id = ''` persis.
--   '' bersifat query-friendly: satu equality `session_stage_id = ''`
--   memisahkan legacy dari foto per-topik tanpa kolom boolean tambahan.
--
--   NOT NULL DEFAULT '' membuat semua baris lama valid tanpa perubahan
--   query lama; filter participant+session yang lama tetap mencocokkan.
--
-- INDEKS (migrasi ini hanya menambah, tidak pernah mengubah/menghapus data):
--   idx_smart_photos_topic (participant_id, session_id, session_stage_id)
--   mendukung query per-(peserta, sesi, topik): equality pada ketiga kolom
--   indeks, langsung ke baris.
--
-- KONVENSI & IDEMPOTEN (mengikuti 000006/000007):
--   ADD COLUMN IF NOT EXISTS / ADD KEY IF NOT EXISTS — aman dijalankan
--   ulang tanpa gagal (migrasi ini TIDAK menyentuh tabel lain).
--
-- DOWN (000009_photos_per_topic.down.sql):
--   Urutan kebalikan: DROP KEY dulu, baru DROP COLUMN. Menurunkan kolom
--   menghapus atribusi topik pada baris non-legacy (hilang permanen —
--   tidak ada yang bisa dipalsukan ulang), tetapi TIDAK mengubah file,
--   baris lain, atau tabel lain.

ALTER TABLE `smart_photos`
  ADD COLUMN IF NOT EXISTS `session_stage_id` CHAR(36) NOT NULL DEFAULT '' AFTER `session_id`;

ALTER TABLE `smart_photos`
  ADD KEY IF NOT EXISTS `idx_smart_photos_topic` (`participant_id`, `session_id`, `session_stage_id`);
