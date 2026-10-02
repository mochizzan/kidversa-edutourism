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

ALTER TABLE `participant_attendance` ADD COLUMN `session_stage_id` CHAR(36) NOT NULL DEFAULT '' AFTER `session_id`;
ALTER TABLE `participant_attendance` DROP INDEX `uq_attendance_participant_session`;
ALTER TABLE `participant_attendance` ADD UNIQUE KEY `uq_attendance_participant_session_topic` (`participant_id`, `session_id`, `session_stage_id`);
ALTER TABLE `participant_attendance` ADD KEY `idx_attendance_session_stage` (`session_id`, `session_stage_id`);
