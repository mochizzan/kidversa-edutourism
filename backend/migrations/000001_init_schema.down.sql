-- 000001_init_schema.down.sql
-- Drop all 28 tables in reverse dependency order.

SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;

DROP TABLE IF EXISTS `refresh_tokens`;
DROP TABLE IF EXISTS `notifications`;
DROP TABLE IF EXISTS `participant_attendance`;
DROP TABLE IF EXISTS `participant_badges`;
DROP TABLE IF EXISTS `gallery_tokens`;
DROP TABLE IF EXISTS `consent_logs`;
DROP TABLE IF EXISTS `timeline_events`;
DROP TABLE IF EXISTS `photo_frames`;
DROP TABLE IF EXISTS `mission_bank_stages`;
DROP TABLE IF EXISTS `mission_banks`;
DROP TABLE IF EXISTS `participant_missions`;
DROP TABLE IF EXISTS `reports`;
DROP TABLE IF EXISTS `smart_photos`;
DROP TABLE IF EXISTS `assessments`;
DROP TABLE IF EXISTS `participants`;
DROP TABLE IF EXISTS `group_stage_progress_history`;
DROP TABLE IF EXISTS `group_stage_progress`;
DROP TABLE IF EXISTS `session_groups`;
DROP TABLE IF EXISTS `session_substages`;
DROP TABLE IF EXISTS `session_stages`;
DROP TABLE IF EXISTS `sessions`;
DROP TABLE IF EXISTS `stage_contents`;
DROP TABLE IF EXISTS `contents`;
DROP TABLE IF EXISTS `program_substages`;
DROP TABLE IF EXISTS `program_stages`;
DROP TABLE IF EXISTS `programs`;
DROP TABLE IF EXISTS `users`;
DROP TABLE IF EXISTS `tenants`;

SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;
