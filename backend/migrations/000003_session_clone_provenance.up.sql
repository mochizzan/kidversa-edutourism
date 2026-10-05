-- 000003_session_clone_provenance (Penelusuran asal klonaan LinkParticipant)
-- =============================================================================
-- LinkParticipant menyalin penilaian, kehadiran, dan rapor peserta dari sesi
-- sumber ke sesi target. Audit menuntut baris klonaan bisa dikenali dari sesi
-- asalnya, tetapi relasi asli (FK) TIDAK bisa dipakai: sesi sumber boleh
-- di-hard-delete, dan FK CASCADE ikut menghapus baris klonaan di sesi target
-- (bencana), sedangkan ON DELETE SET NULL justru menghapus bukti provenansinya.
-- Migrasi ini menambahkan kolom PROVENANS snapshot — nullable, TANPA FK, TANPA
-- index (tidak ada query DB yang membaca kolom ini; FE melakukan filter):
--   - reports               : source_session_id + source_session_name +
--                             source_session_status (SNAPSHOT nama+status sesi
--                             sumber SAAT klona dibuat — bertahan walau sesi
--                             sumber kemudian dihapus)
--   - assessments           : source_session_id
--   - participant_attendance: source_session_id
-- Baris non-klonaan (dibuat native di sesi) bernilai NULL (DEFAULT NULL).
--
-- AMAN UNTUK BIND MOUNT Windows/WSL2 (MDEV-24189 / MDEV-36911 / WSL#8443):
-- hanya ADD COLUMN dengan ALGORITHM bawaan (tanpa RENAME/CHANGE/upgrade
-- eksplisit) dan maksimal SATU statement ALTER per tabel — sesuai syarat
-- header 000001 (satu rebuild per tabel per run). Idempotent (IF NOT EXISTS)
-- agar aman diulang oleh upWithRecovery saat gagal di tengah jalan.
-- =============================================================================

--
-- Kolom provenans untuk penilaian yang di-klona LinkParticipant
--

ALTER TABLE `assessments`
  ADD COLUMN IF NOT EXISTS `source_session_id` char(36) DEFAULT NULL;

--
-- Kolom provenans snapshot untuk rapor yang di-klona LinkParticipant
-- (id + nama + status sesi sumber pada saat klona dibuat)
--

ALTER TABLE `reports`
  ADD COLUMN IF NOT EXISTS `source_session_id` char(36) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `source_session_name` varchar(200) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `source_session_status` varchar(20) DEFAULT NULL;

--
-- Kolom provenans untuk kehadiran yang dibawa LinkParticipant
--

ALTER TABLE `participant_attendance`
  ADD COLUMN IF NOT EXISTS `source_session_id` char(36) DEFAULT NULL;
