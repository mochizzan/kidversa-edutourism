-- =============================================================================
-- 000009_photos_per_topic (DOWN): lepas kunci topik dari smart_photos.
-- =============================================================================
--
-- Urutan kebalikan dari file UP (constraint dulu, kolom kemudian):
--   1. DROP KEY idx_smart_photos_topic — indeks harus dilepas sebelum
--      kolomnya dihapus agar MySQL/MariaDB tidak memproses indeks yang
--      sudah tidak ada.
--   2. DROP COLUMN session_stage_id — menghapus kolom kunci topik.
--
-- DATA:
--   Penurunan ini MENGHAPUS permanen atribusi topik (session_stage_id)
--   pada baris non-legacy — kolomnya sendiri yang dihapus, jadi tidak ada
--   yang bisa "dikembalikan"; baris smart_photos-nya sendiri TIDAK
--   dihapus, dan file upload tidak disentuh. Baris legacy ('') tidak
--   kehilangan apa pun (memang tanpa topik).
--
--   Tidak ada tabel/kolom lain yang diubah; idempoten (IF EXISTS)
--   mengikuti pola down 000006/000007.

ALTER TABLE `smart_photos` DROP KEY IF EXISTS `idx_smart_photos_topic`;

ALTER TABLE `smart_photos` DROP COLUMN IF EXISTS `session_stage_id`;
