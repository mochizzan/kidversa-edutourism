-- --------------------------------------------------------
-- Host:                         127.0.0.1
-- Server version:               12.3.2-MariaDB-ubu2404 - mariadb.org binary distribution
-- Server OS:                    debian-linux-gnu
-- HeidiSQL Version:             12.17.0.7270
-- --------------------------------------------------------

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8 */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;


-- Dumping database structure for kidversa
CREATE DATABASE IF NOT EXISTS `kidversa` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */;
USE `kidversa`;

-- Dumping structure for table kidversa.assessments
CREATE TABLE IF NOT EXISTS `assessments` (
  `id` char(36) NOT NULL,
  `participant_id` char(36) NOT NULL,
  `session_id` char(36) NOT NULL,
  `session_stage_id` char(36) DEFAULT NULL,
  `star_rating` int(11) NOT NULL DEFAULT 0,
  `comment` text DEFAULT NULL,
  `assessed_by` char(36) DEFAULT NULL,
  `assessed_at` datetime(3) DEFAULT NULL,
  `sync_status` enum('LOCAL','UPLOADING','SYNCED','FAILED') NOT NULL DEFAULT 'LOCAL',
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_assessments_participant_stage` (`participant_id`,`session_stage_id`),
  KEY `idx_assessments_participant` (`participant_id`),
  KEY `idx_assessments_session` (`session_id`),
  KEY `idx_assessments_session_stage` (`session_stage_id`),
  KEY `idx_assessments_deleted_at` (`deleted_at`),
  KEY `fk_assessments_assessed_by` (`assessed_by`),
  CONSTRAINT `fk_assessments_assessed_by` FOREIGN KEY (`assessed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_assessments_participant` FOREIGN KEY (`participant_id`) REFERENCES `participants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_assessments_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_assessments_session_stage` FOREIGN KEY (`session_stage_id`) REFERENCES `session_stages` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data exporting was unselected.

-- Dumping structure for table kidversa.consent_logs
CREATE TABLE IF NOT EXISTS `consent_logs` (
  `id` char(36) NOT NULL,
  `participant_id` char(36) NOT NULL,
  `session_id` char(36) NOT NULL,
  `consent_type` enum('RECORDING','PHOTO') NOT NULL,
  `value` tinyint(1) NOT NULL DEFAULT 0,
  `sent_at` datetime(3) DEFAULT NULL,
  `responded_at` datetime(3) DEFAULT NULL,
  `ip_address` varchar(64) DEFAULT NULL,
  `user_agent` varchar(512) DEFAULT NULL,
  `consent_token` varchar(64) DEFAULT NULL,
  `consumed_at` datetime(3) DEFAULT NULL,
  `expires_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_consent_logs_participant_session_type` (`participant_id`,`session_id`,`consent_type`),
  KEY `idx_consent_participant` (`participant_id`),
  KEY `idx_consent_session` (`session_id`),
  KEY `idx_consent_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_consent_participant` FOREIGN KEY (`participant_id`) REFERENCES `participants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_consent_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data exporting was unselected.

-- Dumping structure for table kidversa.group_stage_progress
CREATE TABLE IF NOT EXISTS `group_stage_progress` (
  `id` char(36) NOT NULL,
  `group_id` char(36) NOT NULL,
  `session_stage_id` char(36) NOT NULL,
  `status` enum('LOCKED','UNLOCKED','IN_PROGRESS','COMPLETED','SKIPPED') NOT NULL DEFAULT 'LOCKED',
  `entered_at` datetime(3) DEFAULT NULL,
  `completed_at` datetime(3) DEFAULT NULL,
  `unlocked_by` char(36) DEFAULT NULL,
  `unlock_reason` varchar(255) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_group_stage` (`group_id`,`session_stage_id`),
  KEY `idx_group_stage_progress_deleted_at` (`deleted_at`),
  KEY `fk_group_stage_progress_stage` (`session_stage_id`),
  KEY `fk_group_stage_progress_unlocked_by` (`unlocked_by`),
  CONSTRAINT `fk_group_stage_progress_group` FOREIGN KEY (`group_id`) REFERENCES `session_groups` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_group_stage_progress_stage` FOREIGN KEY (`session_stage_id`) REFERENCES `session_stages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_group_stage_progress_unlocked_by` FOREIGN KEY (`unlocked_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data exporting was unselected.

-- Dumping structure for table kidversa.kiosk_tokens
CREATE TABLE IF NOT EXISTS `kiosk_tokens` (
  `id` varchar(36) NOT NULL,
  `token` varchar(64) NOT NULL,
  `session_id` varchar(36) NOT NULL,
  `expires_at` datetime(3) NOT NULL,
  `consumed_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_kiosk_token` (`token`),
  KEY `idx_kiosk_session` (`session_id`),
  CONSTRAINT `fk_kiosk_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data exporting was unselected.

-- Dumping structure for table kidversa.mission_bank_stages
CREATE TABLE IF NOT EXISTS `mission_bank_stages` (
  `mission_bank_id` char(36) NOT NULL,
  `program_stage_id` char(36) NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`mission_bank_id`,`program_stage_id`),
  KEY `fk_mbs_program_stage` (`program_stage_id`),
  CONSTRAINT `fk_mbs_mission_bank` FOREIGN KEY (`mission_bank_id`) REFERENCES `mission_banks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mbs_program_stage` FOREIGN KEY (`program_stage_id`) REFERENCES `program_stages` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data exporting was unselected.

-- Dumping structure for table kidversa.mission_banks
CREATE TABLE IF NOT EXISTS `mission_banks` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) DEFAULT NULL,
  `program_id` char(36) NOT NULL,
  `category` enum('HOME','PARENT','SCHOOL') NOT NULL,
  `title_child` varchar(200) NOT NULL,
  `title_parent` varchar(200) NOT NULL,
  `description_parent` text DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_mission_banks_program` (`program_id`),
  KEY `idx_mission_banks_category` (`category`),
  KEY `idx_mission_banks_deleted_at` (`deleted_at`),
  KEY `idx_mission_banks_tenant` (`tenant_id`),
  CONSTRAINT `fk_mission_banks_program` FOREIGN KEY (`program_id`) REFERENCES `programs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mission_banks_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data exporting was unselected.

-- Dumping structure for table kidversa.notifications
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `recipient_user_id` char(36) NOT NULL,
  `type` varchar(40) NOT NULL,
  `ref_id` varchar(64) DEFAULT NULL,
  `message` varchar(512) DEFAULT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_notif_tenant` (`tenant_id`),
  KEY `idx_notif_recipient` (`recipient_user_id`,`is_read`),
  KEY `idx_notif_created` (`created_at`),
  KEY `idx_notif_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_notif_recipient` FOREIGN KEY (`recipient_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_notif_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_notif_type` CHECK (`type` = 'user_pending_approval')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data exporting was unselected.

-- Dumping structure for table kidversa.participant_missions
CREATE TABLE IF NOT EXISTS `participant_missions` (
  `id` char(36) NOT NULL,
  `report_id` char(36) NOT NULL,
  `mission_bank_id` char(36) NOT NULL,
  `is_completed` tinyint(1) NOT NULL DEFAULT 0,
  `completed_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_participant_mission` (`report_id`,`mission_bank_id`),
  KEY `idx_participant_missions_report` (`report_id`),
  KEY `idx_participant_missions_mission_bank` (`mission_bank_id`),
  KEY `idx_participant_missions_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_participant_missions_mission_bank` FOREIGN KEY (`mission_bank_id`) REFERENCES `mission_banks` (`id`),
  CONSTRAINT `fk_participant_missions_report` FOREIGN KEY (`report_id`) REFERENCES `reports` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data exporting was unselected.

-- Dumping structure for table kidversa.participants
CREATE TABLE IF NOT EXISTS `participants` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) DEFAULT NULL,
  `session_id` char(36) DEFAULT NULL,
  `group_id` char(36) DEFAULT NULL,
  `child_name` varchar(160) NOT NULL,
  `child_age` int(11) NOT NULL DEFAULT 0,
  `school_name` varchar(160) DEFAULT NULL,
  `parent_name` varchar(160) NOT NULL,
  `parent_phone` varchar(40) NOT NULL,
  `parent_email` varchar(255) DEFAULT NULL,
  `consent_recording` tinyint(1) NOT NULL DEFAULT 0,
  `consent_photo` tinyint(1) NOT NULL DEFAULT 0,
  `consent_at` datetime(3) DEFAULT NULL,
  `consent_combined_token` varchar(255) DEFAULT NULL,
  `consent_combined_token_expires_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_participants_session_child` (`session_id`,`child_name`,`parent_phone`),
  UNIQUE KEY `idx_participants_consent_combined_token` (`consent_combined_token`),
  KEY `idx_participants_tenant` (`tenant_id`),
  KEY `idx_participants_session` (`session_id`),
  KEY `idx_participants_group` (`group_id`),
  KEY `idx_participants_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_participants_group` FOREIGN KEY (`group_id`) REFERENCES `session_groups` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_participants_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_participants_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data exporting was unselected.

-- Dumping structure for table kidversa.photo_frames
CREATE TABLE IF NOT EXISTS `photo_frames` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `program_id` char(36) DEFAULT NULL,
  `name` varchar(160) NOT NULL,
  `file_url` varchar(512) NOT NULL,
  `thumbnail_url` varchar(512) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_photo_frames_tenant` (`tenant_id`),
  KEY `idx_photo_frames_program` (`program_id`),
  KEY `idx_photo_frames_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_photo_frames_program` FOREIGN KEY (`program_id`) REFERENCES `programs` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_photo_frames_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data exporting was unselected.

-- Dumping structure for table kidversa.program_stages
CREATE TABLE IF NOT EXISTS `program_stages` (
  `id` char(36) NOT NULL,
  `program_id` char(36) NOT NULL,
  `sequence_order` int(11) NOT NULL DEFAULT 0,
  `name` varchar(160) NOT NULL,
  `description` text DEFAULT NULL,
  `content_type` enum('VIDEO','SLIDESHOW','GAME','MIXED') NOT NULL,
  `duration_minutes` int(11) NOT NULL DEFAULT 0,
  `is_recording_stage` tinyint(1) NOT NULL DEFAULT 0,
  `is_photo_stage` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_program_stages_program` (`program_id`),
  KEY `idx_program_stages_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_program_stages_program` FOREIGN KEY (`program_id`) REFERENCES `programs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data exporting was unselected.

-- Dumping structure for table kidversa.programs
CREATE TABLE IF NOT EXISTS `programs` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `name` varchar(160) NOT NULL,
  `description` text DEFAULT NULL,
  `thumbnail_url` varchar(512) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_programs_tenant_name` (`tenant_id`,`name`),
  KEY `idx_programs_tenant` (`tenant_id`),
  KEY `idx_programs_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_programs_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data exporting was unselected.

-- Dumping structure for table kidversa.recording_emotion_tags
CREATE TABLE IF NOT EXISTS `recording_emotion_tags` (
  `recording_id` char(36) NOT NULL,
  `emotion_tag` varchar(40) NOT NULL,
  PRIMARY KEY (`recording_id`,`emotion_tag`),
  CONSTRAINT `fk_ret_recording` FOREIGN KEY (`recording_id`) REFERENCES `recordings` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data exporting was unselected.

-- Dumping structure for table kidversa.recordings
CREATE TABLE IF NOT EXISTS `recordings` (
  `id` char(36) NOT NULL,
  `participant_id` char(36) NOT NULL,
  `session_id` char(36) NOT NULL,
  `session_stage_id` char(36) DEFAULT NULL,
  `file_url` varchar(512) DEFAULT NULL,
  `duration_seconds` int(11) NOT NULL DEFAULT 0,
  `file_size_bytes` bigint(20) NOT NULL DEFAULT 0,
  `transcript_text` text DEFAULT NULL,
  `review_status` enum('PENDING','REVIEWED','SKIPPED') NOT NULL DEFAULT 'PENDING',
  `reviewed_by` char(36) DEFAULT NULL,
  `reviewed_at` datetime(3) DEFAULT NULL,
  `sync_status` enum('LOCAL','UPLOADING','SYNCED','FAILED') NOT NULL DEFAULT 'LOCAL',
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_recordings_participant` (`participant_id`),
  KEY `idx_recordings_session` (`session_id`),
  KEY `idx_recordings_session_stage` (`session_stage_id`),
  KEY `idx_recordings_review_status` (`review_status`),
  KEY `idx_recordings_deleted_at` (`deleted_at`),
  KEY `fk_recordings_reviewed_by` (`reviewed_by`),
  CONSTRAINT `fk_recordings_participant` FOREIGN KEY (`participant_id`) REFERENCES `participants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_recordings_reviewed_by` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_recordings_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_recordings_session_stage` FOREIGN KEY (`session_stage_id`) REFERENCES `session_stages` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data exporting was unselected.

-- Dumping structure for table kidversa.refresh_tokens
CREATE TABLE IF NOT EXISTS `refresh_tokens` (
  `id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `token_hash` varchar(64) NOT NULL,
  `expires_at` datetime(3) NOT NULL,
  `revoked_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_refresh_tokens_token_hash` (`token_hash`),
  KEY `idx_refresh_user` (`user_id`),
  KEY `idx_refresh_deleted_at` (`deleted_at`),
  KEY `idx_refresh_hash_revoked` (`token_hash`,`revoked_at`),
  KEY `idx_refresh_user_revoked` (`user_id`,`revoked_at`),
  CONSTRAINT `fk_refresh_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data exporting was unselected.

-- Dumping structure for table kidversa.reports
CREATE TABLE IF NOT EXISTS `reports` (
  `id` char(36) NOT NULL,
  `participant_id` char(36) NOT NULL,
  `session_id` char(36) NOT NULL,
  `ai_narrative_draft` text DEFAULT NULL,
  `ai_narrative_final` text DEFAULT NULL,
  `report_pdf_url` varchar(512) DEFAULT NULL,
  `parent_access_token` varchar(64) DEFAULT NULL,
  `parent_token_expires_at` datetime(3) DEFAULT NULL,
  `parent_token_revoked` tinyint(1) NOT NULL DEFAULT 0,
  `status` enum('DRAFT','PENDING_REVIEW','APPROVED','SENT') NOT NULL DEFAULT 'DRAFT',
  `generated_at` datetime(3) DEFAULT NULL,
  `sent_at` datetime(3) DEFAULT NULL,
  `approved_by` char(36) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_reports_session_participant` (`session_id`,`participant_id`),
  UNIQUE KEY `uq_reports_parent_token` (`parent_access_token`),
  KEY `idx_reports_participant` (`participant_id`),
  KEY `idx_reports_session` (`session_id`),
  KEY `idx_reports_status` (`status`),
  KEY `idx_reports_deleted_at` (`deleted_at`),
  KEY `idx_reports_parent_access_token` (`parent_access_token`),
  KEY `fk_reports_approved_by` (`approved_by`),
  CONSTRAINT `fk_reports_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_reports_participant` FOREIGN KEY (`participant_id`) REFERENCES `participants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_reports_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data exporting was unselected.

-- Dumping structure for table kidversa.schema_migrations
CREATE TABLE IF NOT EXISTS `schema_migrations` (
  `version` bigint(20) NOT NULL,
  `dirty` tinyint(1) NOT NULL,
  PRIMARY KEY (`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data exporting was unselected.

-- Dumping structure for table kidversa.session_groups
CREATE TABLE IF NOT EXISTS `session_groups` (
  `id` char(36) NOT NULL,
  `session_id` char(36) NOT NULL,
  `name` varchar(160) NOT NULL,
  `status` enum('WAITING','IN_PROGRESS','COMPLETED') NOT NULL DEFAULT 'WAITING',
  `current_session_stage_id` char(36) DEFAULT NULL,
  `facilitator_id` char(36) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_session_groups_session_name` (`session_id`,`name`),
  KEY `idx_session_groups_session` (`session_id`),
  KEY `idx_session_groups_deleted_at` (`deleted_at`),
  KEY `fk_session_groups_current_stage` (`current_session_stage_id`),
  KEY `idx_session_groups_facilitator` (`facilitator_id`),
  CONSTRAINT `fk_session_groups_current_stage` FOREIGN KEY (`current_session_stage_id`) REFERENCES `session_stages` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_session_groups_facilitator` FOREIGN KEY (`facilitator_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_session_groups_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data exporting was unselected.

-- Dumping structure for table kidversa.session_stages
CREATE TABLE IF NOT EXISTS `session_stages` (
  `id` char(36) NOT NULL,
  `session_id` char(36) NOT NULL,
  `program_stage_id` char(36) NOT NULL,
  `facilitator_id` char(36) DEFAULT NULL,
  `status` enum('WAITING','ACTIVE','COMPLETED') NOT NULL DEFAULT 'WAITING',
  `started_at` datetime(3) DEFAULT NULL,
  `completed_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_session_stages_session_stage` (`session_id`,`program_stage_id`),
  KEY `idx_session_stages_session` (`session_id`),
  KEY `idx_session_stages_program_stage` (`program_stage_id`),
  KEY `idx_session_stages_facilitator` (`facilitator_id`),
  KEY `idx_session_stages_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_session_stages_facilitator` FOREIGN KEY (`facilitator_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_session_stages_program_stage` FOREIGN KEY (`program_stage_id`) REFERENCES `program_stages` (`id`),
  CONSTRAINT `fk_session_stages_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data exporting was unselected.

-- Dumping structure for table kidversa.sessions
CREATE TABLE IF NOT EXISTS `sessions` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `program_id` char(36) NOT NULL,
  `name` varchar(160) NOT NULL,
  `session_date` date NOT NULL,
  `start_time` time DEFAULT NULL,
  `end_time` time DEFAULT NULL,
  `location` varchar(200) NOT NULL,
  `status` enum('DRAFT','ACTIVE','COMPLETED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `notes` text DEFAULT NULL,
  `created_by` char(36) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sessions_tenant` (`tenant_id`),
  KEY `idx_sessions_program` (`program_id`),
  KEY `idx_sessions_status` (`status`),
  KEY `idx_sessions_date` (`session_date`),
  KEY `idx_sessions_created_by` (`created_by`),
  KEY `idx_sessions_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_sessions_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_sessions_program` FOREIGN KEY (`program_id`) REFERENCES `programs` (`id`),
  CONSTRAINT `fk_sessions_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data exporting was unselected.

-- Dumping structure for table kidversa.smart_photos
CREATE TABLE IF NOT EXISTS `smart_photos` (
  `id` char(36) NOT NULL,
  `participant_id` char(36) NOT NULL,
  `session_id` char(36) NOT NULL,
  `frame_id` char(36) DEFAULT NULL,
  `original_file_url` varchar(512) NOT NULL,
  `framed_file_url` varchar(512) DEFAULT NULL,
  `is_report_photo` tinyint(1) NOT NULL DEFAULT 0,
  `taken_by` char(36) DEFAULT NULL,
  `taken_at` datetime(3) DEFAULT NULL,
  `sync_status` enum('LOCAL','UPLOADING','SYNCED','FAILED') NOT NULL DEFAULT 'LOCAL',
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_smart_photos_participant` (`participant_id`),
  KEY `idx_smart_photos_session` (`session_id`),
  KEY `idx_smart_photos_frame` (`frame_id`),
  KEY `idx_smart_photos_report_photo` (`is_report_photo`),
  KEY `idx_smart_photos_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_smart_photos_frame` FOREIGN KEY (`frame_id`) REFERENCES `photo_frames` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_smart_photos_participant` FOREIGN KEY (`participant_id`) REFERENCES `participants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_smart_photos_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data exporting was unselected.

-- Dumping structure for table kidversa.stage_contents
CREATE TABLE IF NOT EXISTS `stage_contents` (
  `id` char(36) NOT NULL,
  `program_stage_id` char(36) NOT NULL,
  `title` varchar(200) NOT NULL,
  `file_url` varchar(512) NOT NULL,
  `youtube_url` varchar(512) DEFAULT NULL,
  `file_type` enum('VIDEO','IMAGE','AUDIO','GAME_BUNDLE') NOT NULL,
  `duration_seconds` int(11) DEFAULT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_stage_contents_stage` (`program_stage_id`),
  KEY `idx_stage_contents_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_stage_contents_stage` FOREIGN KEY (`program_stage_id`) REFERENCES `program_stages` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data exporting was unselected.

-- Dumping structure for table kidversa.tenants
CREATE TABLE IF NOT EXISTS `tenants` (
  `id` char(36) NOT NULL,
  `name` varchar(120) NOT NULL,
  `slug` varchar(120) NOT NULL,
  `settings_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`settings_json`)),
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  `active_uniq` tinyint(4) GENERATED ALWAYS AS (case when `deleted_at` is null then 1 else NULL end) VIRTUAL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tenants_slug` (`slug`,`active_uniq`),
  KEY `idx_tenants_deleted_at` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data exporting was unselected.

-- Dumping structure for table kidversa.timeline_events
CREATE TABLE IF NOT EXISTS `timeline_events` (
  `id` char(36) NOT NULL,
  `session_id` char(36) NOT NULL,
  `group_id` char(36) NOT NULL,
  `type` enum('group:progress','group:completed','stage:unlock','override') NOT NULL,
  `message` varchar(512) NOT NULL,
  `user_id` char(36) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_timeline_session_created` (`session_id`,`created_at`),
  KEY `idx_timeline_group_created` (`group_id`,`created_at`),
  KEY `idx_timeline_deleted_at` (`deleted_at`),
  KEY `fk_timeline_user` (`user_id`),
  CONSTRAINT `fk_timeline_group` FOREIGN KEY (`group_id`) REFERENCES `session_groups` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_timeline_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_timeline_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data exporting was unselected.

-- Dumping structure for table kidversa.users
CREATE TABLE IF NOT EXISTS `users` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) DEFAULT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('SUPER_ADMIN','ADMIN','KOORDINATOR','FASILITATOR') NOT NULL,
  `name` varchar(120) NOT NULL,
  `phone` varchar(40) DEFAULT NULL,
  `avatar_url` varchar(512) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 0,
  `approval_status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `approved_at` datetime(3) DEFAULT NULL,
  `approved_by` char(36) DEFAULT NULL,
  `rejected_at` datetime(3) DEFAULT NULL,
  `rejected_by` char(36) DEFAULT NULL,
  `rejection_reason` varchar(255) DEFAULT NULL,
  `must_change_password` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  KEY `idx_users_tenant` (`tenant_id`),
  KEY `idx_users_role` (`role`),
  KEY `idx_users_approval_status` (`approval_status`),
  KEY `idx_users_is_active` (`is_active`),
  KEY `idx_users_deleted_at` (`deleted_at`),
  KEY `fk_users_approved_by` (`approved_by`),
  KEY `fk_users_rejected_by` (`rejected_by`),
  CONSTRAINT `fk_users_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_users_rejected_by` FOREIGN KEY (`rejected_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_users_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data exporting was unselected.

/*!40103 SET TIME_ZONE=IFNULL(@OLD_TIME_ZONE, 'system') */;
/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1) */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40111 SET SQL_NOTES=IFNULL(@OLD_SQL_NOTES, 1) */;
