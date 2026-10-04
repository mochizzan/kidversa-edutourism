-- 000001_init_schema.down.sql (KONSOLIDASI)
-- =============================================================================
-- Membongkar seluruh skema aplikasi: 29 tabel, dengan
-- FOREIGN_KEY_CHECKS=0 sehingga urutan DROP tidak bergantung dependensi.
-- `schema_migrations` TIDAK dihapus — golang-migrate membutuhkannya untuk
-- menulis versi=0 setelah down selesai.
--
-- CATATAN bind mount Windows/WSL2 (MDEV-24189): DROP TABLE murni operasi
-- hapus-file (rename .ibd TIDAK dipakai), aman di drvfs/WSL2 — jangan diganti
-- dengan ALTER/rebuild apa pun.
-- =============================================================================

SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;

DROP TABLE IF EXISTS `assessments`;
DROP TABLE IF EXISTS `consent_logs`;
DROP TABLE IF EXISTS `contents`;
DROP TABLE IF EXISTS `gallery_tokens`;
DROP TABLE IF EXISTS `group_stage_progress`;
DROP TABLE IF EXISTS `group_stage_progress_history`;
DROP TABLE IF EXISTS `mission_bank_stages`;
DROP TABLE IF EXISTS `mission_banks`;
DROP TABLE IF EXISTS `notifications`;
DROP TABLE IF EXISTS `participant_attendance`;
DROP TABLE IF EXISTS `participant_badges`;
DROP TABLE IF EXISTS `participant_missions`;
DROP TABLE IF EXISTS `participants`;
DROP TABLE IF EXISTS `photo_frames`;
DROP TABLE IF EXISTS `program_stages`;
DROP TABLE IF EXISTS `program_substages`;
DROP TABLE IF EXISTS `programs`;
DROP TABLE IF EXISTS `refresh_tokens`;
DROP TABLE IF EXISTS `report_photo_picks`;
DROP TABLE IF EXISTS `reports`;
DROP TABLE IF EXISTS `session_groups`;
DROP TABLE IF EXISTS `session_stages`;
DROP TABLE IF EXISTS `session_substages`;
DROP TABLE IF EXISTS `sessions`;
DROP TABLE IF EXISTS `smart_photos`;
DROP TABLE IF EXISTS `stage_contents`;
DROP TABLE IF EXISTS `tenants`;
DROP TABLE IF EXISTS `timeline_events`;
DROP TABLE IF EXISTS `users`;

SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;
