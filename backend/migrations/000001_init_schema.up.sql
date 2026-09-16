-- 000001_init_schema
-- Consolidated schema: all 28 tables for Kidversa EduTourism platform.
-- Generated from GORM models — single migration, no incremental ALTERs.

SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;
SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO';

-- ---------------------------------------------------------------------------
-- 1. tenants
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tenants` (
  `id` char(36) NOT NULL,
  `name` varchar(200) NOT NULL,
  `slug` varchar(200) NOT NULL,
  `settings_json` json DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tenants_slug` (`slug`),
  KEY `idx_tenants_deleted_at` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 2. users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) DEFAULT NULL,
  `email` varchar(200) NOT NULL,
  `password_hash` varchar(200) NOT NULL,
  `name` varchar(200) NOT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `avatar_url` varchar(512) DEFAULT NULL,
  `role` varchar(30) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `approval_status` varchar(20) NOT NULL DEFAULT 'pending',
  `approved_at` datetime(3) DEFAULT NULL,
  `approved_by` char(36) DEFAULT NULL,
  `rejected_at` datetime(3) DEFAULT NULL,
  `rejected_by` char(36) DEFAULT NULL,
  `rejection_reason` varchar(500) DEFAULT NULL,
  `must_change_password` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  KEY `idx_users_tenant` (`tenant_id`),
  KEY `idx_users_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_users_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 3. programs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `programs` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) DEFAULT NULL,
  `name` varchar(200) NOT NULL,
  `description` text DEFAULT NULL,
  `thumbnail_url` varchar(512) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `final_badge_name` varchar(160) DEFAULT NULL,
  `final_badge_image_url` varchar(512) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_programs_tenant` (`tenant_id`),
  KEY `idx_programs_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_programs_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 4. program_stages (SubTopik)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `program_stages` (
  `id` char(36) NOT NULL,
  `program_id` char(36) NOT NULL,
  `sequence_order` int(11) NOT NULL DEFAULT 0,
  `name` varchar(200) NOT NULL,
  `description` text DEFAULT NULL,
  `content_type` varchar(30) NOT NULL DEFAULT 'VIDEO',
  `duration_minutes` int(11) NOT NULL DEFAULT 0,
  `is_photo_stage` tinyint(1) NOT NULL DEFAULT 0,
  `badge_name` varchar(160) DEFAULT NULL,
  `badge_image_url` varchar(512) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_program_stages_program` (`program_id`),
  KEY `idx_program_stages_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_program_stages_program` FOREIGN KEY (`program_id`) REFERENCES `programs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 5. program_substages (Kegiatan — assessed leaf under SubTopik)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `program_substages` (
  `id` char(36) NOT NULL,
  `program_stage_id` char(36) NOT NULL,
  `sequence_order` int(11) NOT NULL DEFAULT 0,
  `name` varchar(160) NOT NULL,
  `description` text DEFAULT NULL,
  `duration_minutes` int(11) NOT NULL DEFAULT 0,
  `is_photo_stage` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_program_substages_stage` (`program_stage_id`),
  KEY `idx_program_substages_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_program_substages_stage` FOREIGN KEY (`program_stage_id`) REFERENCES `program_stages` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 6. contents (hard-delete, tenant-scoped)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `contents` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `title` varchar(200) NOT NULL,
  `file_url` varchar(512) NOT NULL,
  `youtube_url` varchar(512) DEFAULT NULL,
  `file_type` enum('VIDEO','IMAGE','AUDIO','GAME_BUNDLE') NOT NULL,
  `duration_seconds` int(11) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `idx_contents_tenant` (`tenant_id`),
  CONSTRAINT `fk_contents_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 7. stage_contents (junction: content <-> program_substage)
--    PK is content_id (NOT a separate UUID).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `stage_contents` (
  `content_id` char(36) NOT NULL,
  `program_substage_id` char(36) NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`content_id`),
  KEY `idx_stage_contents_substage` (`program_substage_id`),
  KEY `idx_stage_contents_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_stage_contents_content` FOREIGN KEY (`content_id`) REFERENCES `contents` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_stage_contents_substage` FOREIGN KEY (`program_substage_id`) REFERENCES `program_substages` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 8. sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `sessions` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) DEFAULT NULL,
  `program_id` char(36) NOT NULL,
  `name` varchar(200) NOT NULL,
  `session_date` date DEFAULT NULL,
  `start_time` varchar(10) DEFAULT NULL,
  `end_time` varchar(10) DEFAULT NULL,
  `location` varchar(200) NOT NULL DEFAULT '',
  `status` varchar(20) NOT NULL DEFAULT 'DRAFT',
  `notes` text DEFAULT NULL,
  `program_name` varchar(200) NOT NULL DEFAULT '',
  `created_by` char(36) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sessions_tenant` (`tenant_id`),
  KEY `idx_sessions_program` (`program_id`),
  KEY `idx_sessions_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_sessions_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sessions_program` FOREIGN KEY (`program_id`) REFERENCES `programs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 9. session_stages (instantiation of a SubTopik within a session)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `session_stages` (
  `id` char(36) NOT NULL,
  `session_id` char(36) NOT NULL,
  `program_stage_id` char(36) NOT NULL,
  `program_stage_name` varchar(200) NOT NULL DEFAULT '',
  `facilitator_id` char(36) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'WAITING',
  `started_at` datetime(3) DEFAULT NULL,
  `completed_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_session_stages_session` (`session_id`),
  KEY `idx_session_stages_program_stage` (`program_stage_id`),
  KEY `idx_session_stages_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_session_stages_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_session_stages_program_stage` FOREIGN KEY (`program_stage_id`) REFERENCES `program_stages` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 10. session_substages (instantiation of a Kegiatan within a session)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `session_substages` (
  `id` char(36) NOT NULL,
  `session_id` char(36) NOT NULL,
  `session_stage_id` char(36) NOT NULL,
  `program_substage_id` char(36) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'WAITING',
  `started_at` datetime(3) DEFAULT NULL,
  `completed_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_session_substages_unique` (`session_id`,`program_substage_id`),
  KEY `idx_session_substages_session` (`session_id`),
  KEY `idx_session_substages_session_stage` (`session_stage_id`),
  KEY `idx_session_substages_program_substage` (`program_substage_id`),
  KEY `idx_session_substages_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_session_substages_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_session_substages_session_stage` FOREIGN KEY (`session_stage_id`) REFERENCES `session_stages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_session_substages_program_substage` FOREIGN KEY (`program_substage_id`) REFERENCES `program_substages` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 11. session_groups
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `session_groups` (
  `id` char(36) NOT NULL,
  `session_id` char(36) NOT NULL,
  `name` varchar(200) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'WAITING',
  `current_session_stage_id` char(36) DEFAULT NULL,
  `facilitator_id` char(36) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_session_groups_session` (`session_id`),
  KEY `idx_session_groups_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_session_groups_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 12. group_stage_progress
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `group_stage_progress` (
  `id` char(36) NOT NULL,
  `group_id` char(36) NOT NULL,
  `session_substage_id` char(36) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'LOCKED',
  `entered_at` datetime(3) DEFAULT NULL,
  `completed_at` datetime(3) DEFAULT NULL,
  `unlocked_by` char(36) DEFAULT NULL,
  `unlock_reason` text DEFAULT NULL,
  `locked_by` char(36) DEFAULT NULL,
  `locked_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_group_substage` (`group_id`,`session_substage_id`),
  KEY `idx_group_stage_progress_group` (`group_id`),
  KEY `idx_group_stage_progress_substage` (`session_substage_id`),
  KEY `idx_group_stage_progress_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_group_stage_progress_group` FOREIGN KEY (`group_id`) REFERENCES `session_groups` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_group_stage_progress_substage` FOREIGN KEY (`session_substage_id`) REFERENCES `session_substages` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 13. group_stage_progress_history (append-only audit trail)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `group_stage_progress_history` (
  `id` char(36) NOT NULL,
  `group_id` char(36) NOT NULL,
  `session_id` char(36) NOT NULL,
  `session_substage_id` char(36) NOT NULL,
  `from_status` varchar(20) DEFAULT NULL,
  `to_status` varchar(20) NOT NULL,
  `actor_id` char(36) DEFAULT NULL,
  `reason` varchar(255) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_groupprogresshist_group` (`group_id`),
  KEY `idx_groupprogresshist_session` (`session_id`),
  KEY `idx_groupprogresshist_substage` (`session_substage_id`),
  KEY `idx_groupprogresshist_created` (`created_at`),
  KEY `idx_groupprogresshist_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_groupprogresshist_group` FOREIGN KEY (`group_id`) REFERENCES `session_groups` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_groupprogresshist_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_groupprogresshist_substage` FOREIGN KEY (`session_substage_id`) REFERENCES `session_substages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_groupprogresshist_actor` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 14. participants
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `participants` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) DEFAULT NULL,
  `session_id` char(36) DEFAULT NULL,
  `group_id` char(36) DEFAULT NULL,
  `child_name` varchar(200) NOT NULL,
  `child_age` int(11) NOT NULL DEFAULT 0,
  `school_name` varchar(200) DEFAULT NULL,
  `parent_name` varchar(200) NOT NULL DEFAULT '',
  `parent_phone` varchar(50) NOT NULL DEFAULT '',
  `parent_email` varchar(200) DEFAULT NULL,
  `session_name` varchar(200) NOT NULL DEFAULT '',
  `consent_photo` tinyint(1) NOT NULL DEFAULT 0,
  `consent_at` datetime(3) DEFAULT NULL,
  `consent_combined_token` varchar(200) DEFAULT NULL,
  `consent_combined_token_expires_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_participants_tenant` (`tenant_id`),
  KEY `idx_participants_session` (`session_id`),
  KEY `idx_participants_group` (`group_id`),
  KEY `idx_participants_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_participants_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_participants_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_participants_group` FOREIGN KEY (`group_id`) REFERENCES `session_groups` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 15. assessments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `assessments` (
  `id` char(36) NOT NULL,
  `participant_id` char(36) NOT NULL,
  `session_id` char(36) NOT NULL,
  `session_substage_id` char(36) DEFAULT NULL,
  `star_rating` int(11) NOT NULL DEFAULT 0,
  `comment` text DEFAULT NULL,
  `assessed_by` char(36) DEFAULT NULL,
  `participant_name` varchar(200) NOT NULL DEFAULT '',
  `kegiatan_name` varchar(160) NOT NULL DEFAULT '',
  `assessed_at` datetime(3) DEFAULT NULL,
  `sync_status` enum('LOCAL','UPLOADING','SYNCED','FAILED') NOT NULL DEFAULT 'LOCAL',
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_assessments_participant_substage` (`participant_id`,`session_substage_id`),
  KEY `idx_assessments_participant` (`participant_id`),
  KEY `idx_assessments_session` (`session_id`),
  KEY `idx_assessments_session_substage` (`session_substage_id`),
  KEY `idx_assessments_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_assessments_participant` FOREIGN KEY (`participant_id`) REFERENCES `participants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_assessments_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_assessments_session_substage` FOREIGN KEY (`session_substage_id`) REFERENCES `session_substages` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_assessments_assessed_by` FOREIGN KEY (`assessed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 16. smart_photos
-- ---------------------------------------------------------------------------
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
  `sync_status` varchar(20) NOT NULL DEFAULT 'LOCAL',
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_smart_photos_participant` (`participant_id`),
  KEY `idx_smart_photos_session` (`session_id`),
  KEY `idx_smart_photos_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_smart_photos_participant` FOREIGN KEY (`participant_id`) REFERENCES `participants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_smart_photos_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 17. reports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reports` (
  `id` char(36) NOT NULL,
  `participant_id` char(36) NOT NULL,
  `session_id` char(36) NOT NULL,
  `program_stage_id` char(36) DEFAULT NULL,
  `ai_narrative_draft` text DEFAULT NULL,
  `ai_narrative_final` text DEFAULT NULL,
  `report_pdf_url` varchar(512) DEFAULT NULL,
  `parent_access_token` varchar(200) DEFAULT NULL,
  `parent_token_expires_at` datetime(3) DEFAULT NULL,
  `parent_token_revoked` tinyint(1) NOT NULL DEFAULT 0,
  `status` varchar(30) NOT NULL DEFAULT 'DRAFT',
  `generated_at` datetime(3) DEFAULT NULL,
  `sent_at` datetime(3) DEFAULT NULL,
  `approved_by` char(36) DEFAULT NULL,
  `gallery_access_token` varchar(200) DEFAULT NULL,
  `gallery_token_expires_at` datetime(3) DEFAULT NULL,
  `gallery_token_revoked` tinyint(1) NOT NULL DEFAULT 0,
  `group_name` varchar(200) NOT NULL DEFAULT '',
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_reports_participant` (`participant_id`),
  KEY `idx_reports_session` (`session_id`),
  KEY `idx_reports_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_reports_participant` FOREIGN KEY (`participant_id`) REFERENCES `participants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_reports_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 18. participant_missions
-- ---------------------------------------------------------------------------
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
  KEY `idx_participant_missions_report` (`report_id`),
  KEY `idx_participant_missions_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_participant_missions_report` FOREIGN KEY (`report_id`) REFERENCES `reports` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 19. mission_banks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `mission_banks` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) DEFAULT NULL,
  `program_id` char(36) NOT NULL,
  `title` varchar(200) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_mission_banks_tenant` (`tenant_id`),
  KEY `idx_mission_banks_program` (`program_id`),
  KEY `idx_mission_banks_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_mission_banks_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_mission_banks_program` FOREIGN KEY (`program_id`) REFERENCES `programs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 20. mission_bank_stages (pure junction, no audit columns)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `mission_bank_stages` (
  `mission_bank_id` char(36) NOT NULL,
  `program_stage_id` char(36) NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`mission_bank_id`,`program_stage_id`),
  CONSTRAINT `fk_mbs_mission_bank` FOREIGN KEY (`mission_bank_id`) REFERENCES `mission_banks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mbs_program_stage` FOREIGN KEY (`program_stage_id`) REFERENCES `program_stages` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 21. photo_frames
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `photo_frames` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) DEFAULT NULL,
  `program_id` char(36) DEFAULT NULL,
  `name` varchar(200) NOT NULL,
  `file_url` varchar(512) NOT NULL,
  `thumbnail_url` varchar(512) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_photo_frames_tenant` (`tenant_id`),
  KEY `idx_photo_frames_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_photo_frames_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 22. timeline_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `timeline_events` (
  `id` char(36) NOT NULL,
  `session_id` char(36) NOT NULL,
  `group_id` char(36) NOT NULL,
  `type` enum('group:progress','group:completed','stage:unlock','stage:lock','override') NOT NULL,
  `message` text NOT NULL,
  `user_id` char(36) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_timeline_events_session` (`session_id`),
  KEY `idx_timeline_events_group` (`group_id`),
  KEY `idx_timeline_events_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_timeline_events_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_timeline_events_group` FOREIGN KEY (`group_id`) REFERENCES `session_groups` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 23. consent_logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `consent_logs` (
  `id` char(36) NOT NULL,
  `participant_id` char(36) NOT NULL,
  `session_id` char(36) NOT NULL,
  `consent_type` enum('PHOTO') NOT NULL,
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

-- ---------------------------------------------------------------------------
-- 24. gallery_tokens
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `gallery_tokens` (
  `id` char(36) NOT NULL,
  `report_id` char(36) NOT NULL,
  `participant_id` char(36) NOT NULL,
  `session_id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `token` varchar(200) NOT NULL,
  `expires_at` datetime(3) NOT NULL,
  `revoked` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_gallery_tokens_report` (`report_id`),
  KEY `idx_gallery_tokens_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_gallery_tokens_report` FOREIGN KEY (`report_id`) REFERENCES `reports` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 25. participant_badges
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `participant_badges` (
  `id` char(36) NOT NULL,
  `participant_id` char(36) NOT NULL,
  `program_id` char(36) NOT NULL,
  `program_stage_id` char(36) DEFAULT NULL,
  `badge_type` enum('SUBTOPIK','FINAL') NOT NULL,
  `badge_name` varchar(160) NOT NULL,
  `badge_image_url` varchar(512) DEFAULT NULL,
  `awarded_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_participant_subtopik_badge` (`participant_id`,`program_stage_id`),
  KEY `idx_participant_badges_participant` (`participant_id`),
  KEY `idx_participant_badges_program` (`program_id`),
  KEY `idx_participant_badges_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_participant_badges_participant` FOREIGN KEY (`participant_id`) REFERENCES `participants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_participant_badges_program` FOREIGN KEY (`program_id`) REFERENCES `programs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_participant_badges_program_stage` FOREIGN KEY (`program_stage_id`) REFERENCES `program_stages` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 26. participant_attendance
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `participant_attendance` (
  `id` char(36) NOT NULL,
  `participant_id` char(36) NOT NULL,
  `session_id` char(36) NOT NULL,
  `is_present` tinyint(1) NOT NULL DEFAULT 0,
  `marked_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `marked_by` char(36) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_attendance_participant_session` (`participant_id`,`session_id`),
  KEY `idx_attendance_session` (`session_id`),
  KEY `idx_attendance_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_attendance_participant` FOREIGN KEY (`participant_id`) REFERENCES `participants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_attendance_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_attendance_marked_by` FOREIGN KEY (`marked_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 27. notifications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) DEFAULT NULL,
  `recipient_user_id` char(36) NOT NULL,
  `type` varchar(50) NOT NULL,
  `ref_id` varchar(100) DEFAULT NULL,
  `message` text DEFAULT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_notifications_recipient` (`recipient_user_id`),
  KEY `idx_notifications_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_notifications_recipient` FOREIGN KEY (`recipient_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 28. refresh_tokens
-- ---------------------------------------------------------------------------
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
  KEY `idx_refresh_tokens_user` (`user_id`),
  KEY `idx_refresh_tokens_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_refresh_tokens_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 29. schema_migrations (golang-migrate version tracking)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `schema_migrations` (
  `version` bigint(20) NOT NULL,
  `dirty` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;
SET SQL_MODE=@OLD_SQL_MODE;
