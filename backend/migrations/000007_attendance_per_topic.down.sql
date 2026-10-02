-- 000007_attendance_per_topic (down)
-- Baris per-topik tidak dapat direpresentasikan dalam skema lama (satu baris
-- per sesi): baris dengan session_stage_id non-kosong DIHAPUS. Data loss ini
-- eksplisit, mengikuti pola 000006 (down tidak preservasi data).
--
-- Urutan FK-aman (Error 1553, simetris dengan up): UNIQUE lama
-- ditambahkan DULU sehingga fk_attendance_participant punya penopang
-- alternatif berawalan participant_id; BARU kemudian UNIQUE 3-kolom di-drop.
-- Urutan balik (drop-dulu) ditolak InnoDB dengan errno 1553 karena UNIQUE
-- 3-kolom adalah satu-satunya index berawalan participant_id saat rollback.
-- DDL memakai IF NOT EXISTS / IF EXISTS (MariaDB 12) agar retry parsial aman.

DELETE FROM `participant_attendance` WHERE `session_stage_id` <> '';
ALTER TABLE `participant_attendance` ADD UNIQUE KEY IF NOT EXISTS `uq_attendance_participant_session` (`participant_id`, `session_id`);
ALTER TABLE `participant_attendance` DROP INDEX IF EXISTS `uq_attendance_participant_session_topic`;
ALTER TABLE `participant_attendance` DROP INDEX IF EXISTS `idx_attendance_session_stage`;
ALTER TABLE `participant_attendance` DROP COLUMN IF EXISTS `session_stage_id`;
