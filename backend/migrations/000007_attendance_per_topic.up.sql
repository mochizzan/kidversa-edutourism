-- 000007_attendance_per_topic
-- Kehadiran per-topik: satu baris per (peserta, sesi, topik/session_stages).
-- Kolom session_stage_id menunjuk session_stages (instansiasi Topik per sesi,
-- bukan program_stages template dan bukan session_substages leaf); selaras
-- dengan GroupPage selectedSessionStageId dan Group.current_session_stage_id.
-- Mapping ke assessment: assessment.session_substage_id ->
-- session_substages.session_stage_id = attendance.session_stage_id.
--
-- Strategi data lama (zero-downtime): kolom NOT NULL DEFAULT '' sehingga
-- baris pra-migrasi otomatis menjadi '' (session-wide fallback, bukan
-- per-topik); TIDAK ada backfill fabrikasi karena satu baris lama tidak bisa
-- dipecah menjadi N baris topik tanpa menebak kehadiran. UNIQUE lama
-- (participant, session) diganti UNIQUE baru (participant, session,
-- session_stage_id). Tanpa FK ke session_stages by design: sentinel '' tidak
-- punya parent dan stage bisa dihapus tanpa memblokir audit kehadiran.
-- Audit marked_at/marked_by terbelah per-topik (setiap baris topik punya
-- penanda sendiri). Konsumen: carryAttendance (remap stage via program_stage),
-- badge gate (scope current stage), reports gate (absent per-topik).
-- Promosi lanjutan (di luar migrasi ini): setelah klien menandai ulang
-- per-topik, baris '' sisa bisa dihapus operator.
--
-- Urutan FK-aman (Error 1553): UNIQUE baru ditambahkan DULU sehingga
-- fk_attendance_participant (participant_id -> participants.id, lih. 000001
-- :606) punya penopang alternatif berawalan participant_id; BARU kemudian
-- UNIQUE lama di-drop. DROP-tanpa-pengganti ditolak InnoDB (errno 1553)
-- karena UNIQUE lama adalah satu-satunya index berawalan participant_id.
-- Skema akhir identik dengan niat awal; hanya urutannya yang dibalik.
--
-- Idempotensi (retry parsial): semua DDL memakai IF NOT EXISTS / IF EXISTS
-- (didukung MariaDB 12, lih. compose.yml image mariadb:12) sehingga
-- percobaan ulang pasca-gagal (kolom/index baru sudah ada) tidak error.

ALTER TABLE `participant_attendance` ADD COLUMN IF NOT EXISTS `session_stage_id` CHAR(36) NOT NULL DEFAULT '' AFTER `session_id`;
ALTER TABLE `participant_attendance` ADD UNIQUE KEY IF NOT EXISTS `uq_attendance_participant_session_topic` (`participant_id`, `session_id`, `session_stage_id`);
ALTER TABLE `participant_attendance` DROP INDEX IF EXISTS `uq_attendance_participant_session`;
ALTER TABLE `participant_attendance` ADD KEY IF NOT EXISTS `idx_attendance_session_stage` (`session_id`, `session_stage_id`);
