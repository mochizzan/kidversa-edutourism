-- 000007_attendance_per_topic (down)
-- Baris per-topik tidak dapat direpresentasikan dalam skema lama (satu baris
-- per sesi): baris dengan session_stage_id non-kosong DIHAPUS. Data loss ini
-- eksplisit, mengikuti pola 000006 (down tidak preservasi data).

DELETE FROM `participant_attendance` WHERE `session_stage_id` <> '';
ALTER TABLE `participant_attendance` DROP INDEX `uq_attendance_participant_session_topic`;
ALTER TABLE `participant_attendance` DROP INDEX `idx_attendance_session_stage`;
ALTER TABLE `participant_attendance` DROP COLUMN `session_stage_id`;
ALTER TABLE `participant_attendance` ADD UNIQUE KEY `uq_attendance_participant_session` (`participant_id`, `session_id`);
