-- 000002_participant_session_memberships.down.sql
-- =============================================================================
-- Membongkar tabel riwayat keanggotaan peserta ↔ sesi (migrasi 000002).
-- Hanya DROP TABLE atas tabel hasil migrasi ini; tabel lain tidak disentuh.
--
-- CATATAN bind mount Windows/WSL2 (MDEV-24189): DROP TABLE murni operasi
-- hapus-file (rename .ibd TIDAK dipakai), aman di drvfs/WSL2 — jangan diganti
-- dengan ALTER/rebuild apa pun.
-- =============================================================================

SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;

DROP TABLE IF EXISTS `participant_session_memberships`;

SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;
