-- 000003_session_clone_provenance — rollback
-- =============================================================================
-- Menambahkan kolom kembali (ADD COLUMN nullable) adalah operasi inilah yang
-- aman diulang; rollback-nya menghapus kolom provenans tersebut. Satu statement
-- ALTER per tabel (maksimal satu rebuild per tabel — syarat header 000001),
-- IF EXISTS agar idempotent saat diulang.
-- =============================================================================

ALTER TABLE `assessments`
  DROP COLUMN IF EXISTS `source_session_id`;

ALTER TABLE `reports`
  DROP COLUMN IF EXISTS `source_session_id`,
  DROP COLUMN IF EXISTS `source_session_name`,
  DROP COLUMN IF EXISTS `source_session_status`;

ALTER TABLE `participant_attendance`
  DROP COLUMN IF EXISTS `source_session_id`;
