-- 000001_init_schema (KONSOLIDASI — skema final tunggal)
-- =============================================================================
-- Seluruh riwayat migrasi 000001–000010 sudah diterapkan langsung ke DDL di
-- bawah (29 tabel): timestamp lengkap, denormalisasi assessments, kunci unik
-- rapor, badge_type ENUM('TOPIK','SUBTOPIK','FINAL'), pemangkasan 11 FK, serta
-- lima indeks token. File migrasi lama 000001–000010 dipindahkan ke backups/
-- sebagai riwayat referensi; instalasi segar kini hanya memakai versi 1.
--
-- AMAN UNTUK BIND MOUNT Windows/WSL2 (MDEV-24189 / MDEV-36911 / WSL#8443):
-- file ini murni CREATE TABLE — NOL ALTER/rebuild tabel (rename .ibd), sehingga
-- tidak pernah menyentuh bug cache metadata drvfs (rebuild kedua atas tabel yang
-- sama dalam satu sesi mount selalu errno 194/41 di MariaDB). Perubahan skema
-- berikutnya = migrasi BARU bernomor 000002+; bila tak terhindari ada rebuild,
-- batasi maksimal satu rebuild per tabel per run.
--
-- Dihasilkan dari mariadb-dump --no-data atas DB hasil migrasi penuh
-- 000001–000010 (2026-10-04); baris header dump teknis dipertahankan di bawah.
-- =============================================================================
-- MariaDB dump 10.20-12.3.3-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: localhost    Database: kidversa
-- ------------------------------------------------------
-- Server version	12.3.3-MariaDB-ubu2404

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*M!100616 SET @OLD_NOTE_VERBOSITY=@@NOTE_VERBOSITY, NOTE_VERBOSITY=0 */;

--
-- Table structure for table `assessments`
--

DROP TABLE IF EXISTS `assessments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `assessments` (
  `id` char(36) NOT NULL,
  `participant_id` char(36) NOT NULL,
  `session_id` char(36) NOT NULL,
  `session_stage_id` char(36) NOT NULL DEFAULT '',
  `program_stage_id` char(36) NOT NULL DEFAULT '',
  `session_substage_id` char(36) DEFAULT NULL,
  `star_rating` int(11) NOT NULL DEFAULT 0,
  `comment` text DEFAULT NULL,
  `assessed_by` char(36) DEFAULT NULL,
  `participant_name` varchar(200) NOT NULL DEFAULT '',
  `kegiatan_name` varchar(160) NOT NULL DEFAULT '',
  `assessed_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_assessments_participant_substage` (`participant_id`,`session_substage_id`),
  KEY `idx_assessments_participant` (`participant_id`),
  KEY `idx_assessments_session` (`session_id`),
  KEY `idx_assessments_session_substage` (`session_substage_id`),
  KEY `idx_assessments_deleted_at` (`deleted_at`),
  KEY `fk_assessments_assessed_by` (`assessed_by`),
  KEY `idx_assessments_session_topic` (`participant_id`,`session_id`,`session_stage_id`),
  KEY `idx_assessments_topic` (`participant_id`,`session_id`,`program_stage_id`),
  CONSTRAINT `fk_assessments_participant` FOREIGN KEY (`participant_id`) REFERENCES `participants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_assessments_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_assessments_session_substage` FOREIGN KEY (`session_substage_id`) REFERENCES `session_substages` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `consent_logs`
--

DROP TABLE IF EXISTS `consent_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `consent_logs` (
  `id` char(36) NOT NULL,
  `participant_id` char(36) NOT NULL,
  `session_id` char(36) NOT NULL,
  `consent_type` enum('PHOTO') NOT NULL,
  `value` tinyint(1) NOT NULL DEFAULT 0,
  `sent_at` datetime(3) DEFAULT NULL,
  `responded_at` datetime(3) DEFAULT NULL,
  `ip_address` varchar(64) DEFAULT NULL,
  `user_agent` varchar(512) DEFAULT NULL,
  `responder_name` varchar(200) DEFAULT NULL,
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
  KEY `idx_consent_logs_token` (`consent_token`),
  CONSTRAINT `fk_consent_participant` FOREIGN KEY (`participant_id`) REFERENCES `participants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_consent_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `contents`
--

DROP TABLE IF EXISTS `contents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `contents` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `title` varchar(200) NOT NULL,
  `file_url` varchar(512) NOT NULL,
  `youtube_url` varchar(512) DEFAULT NULL,
  `file_type` enum('VIDEO','IMAGE','AUDIO','GAME_BUNDLE') NOT NULL,
  `duration_seconds` int(11) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_contents_tenant` (`tenant_id`),
  KEY `idx_contents_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_contents_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `gallery_tokens`
--

DROP TABLE IF EXISTS `gallery_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `gallery_tokens` (
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
  KEY `idx_gallery_tokens_token` (`token`),
  CONSTRAINT `fk_gallery_tokens_report` FOREIGN KEY (`report_id`) REFERENCES `reports` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `group_stage_progress`
--

DROP TABLE IF EXISTS `group_stage_progress`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `group_stage_progress` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `group_stage_progress_history`
--

DROP TABLE IF EXISTS `group_stage_progress_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `group_stage_progress_history` (
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
  KEY `fk_groupprogresshist_actor` (`actor_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `mission_bank_stages`
--

DROP TABLE IF EXISTS `mission_bank_stages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `mission_bank_stages` (
  `mission_bank_id` char(36) NOT NULL,
  `program_stage_id` char(36) NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`mission_bank_id`,`program_stage_id`),
  KEY `fk_mbs_program_stage` (`program_stage_id`),
  KEY `idx_mission_bank_stages_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_mbs_mission_bank` FOREIGN KEY (`mission_bank_id`) REFERENCES `mission_banks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mbs_program_stage` FOREIGN KEY (`program_stage_id`) REFERENCES `program_stages` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `mission_banks`
--

DROP TABLE IF EXISTS `mission_banks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `mission_banks` (
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
  CONSTRAINT `fk_mission_banks_program` FOREIGN KEY (`program_id`) REFERENCES `programs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mission_banks_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
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
  KEY `idx_notifications_deleted_at` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `participant_attendance`
--

DROP TABLE IF EXISTS `participant_attendance`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `participant_attendance` (
  `id` char(36) NOT NULL,
  `participant_id` char(36) NOT NULL,
  `session_id` char(36) NOT NULL,
  `session_stage_id` char(36) NOT NULL DEFAULT '',
  `is_present` tinyint(1) NOT NULL DEFAULT 0,
  `marked_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `marked_by` char(36) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_attendance_participant_session_topic` (`participant_id`,`session_id`,`session_stage_id`),
  KEY `idx_attendance_session` (`session_id`),
  KEY `idx_attendance_deleted_at` (`deleted_at`),
  KEY `fk_attendance_marked_by` (`marked_by`),
  KEY `idx_attendance_session_stage` (`session_id`,`session_stage_id`),
  CONSTRAINT `fk_attendance_participant` FOREIGN KEY (`participant_id`) REFERENCES `participants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_attendance_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `participant_badges`
--

DROP TABLE IF EXISTS `participant_badges`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `participant_badges` (
  `id` char(36) NOT NULL,
  `participant_id` char(36) NOT NULL,
  `program_id` char(36) NOT NULL,
  `program_stage_id` char(36) DEFAULT NULL,
  `badge_type` enum('TOPIK','SUBTOPIK','FINAL') NOT NULL,
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
  KEY `fk_participant_badges_program_stage` (`program_stage_id`),
  CONSTRAINT `fk_participant_badges_participant` FOREIGN KEY (`participant_id`) REFERENCES `participants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_participant_badges_program` FOREIGN KEY (`program_id`) REFERENCES `programs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_participant_badges_program_stage` FOREIGN KEY (`program_stage_id`) REFERENCES `program_stages` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `participant_missions`
--

DROP TABLE IF EXISTS `participant_missions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `participant_missions` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `participants`
--

DROP TABLE IF EXISTS `participants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `participants` (
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
  CONSTRAINT `fk_participants_group` FOREIGN KEY (`group_id`) REFERENCES `session_groups` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_participants_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `photo_frames`
--

DROP TABLE IF EXISTS `photo_frames`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `photo_frames` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `program_stages`
--

DROP TABLE IF EXISTS `program_stages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `program_stages` (
  `id` char(36) NOT NULL,
  `program_id` char(36) NOT NULL,
  `sequence_order` int(11) NOT NULL DEFAULT 0,
  `name` varchar(200) NOT NULL,
  `description` text DEFAULT NULL,
  `content_type` varchar(30) NOT NULL DEFAULT 'VIDEO',
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `program_substages`
--

DROP TABLE IF EXISTS `program_substages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `program_substages` (
  `id` char(36) NOT NULL,
  `program_stage_id` char(36) NOT NULL,
  `sequence_order` int(11) NOT NULL DEFAULT 0,
  `name` varchar(160) NOT NULL,
  `description` text DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_program_substages_stage` (`program_stage_id`),
  KEY `idx_program_substages_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_program_substages_stage` FOREIGN KEY (`program_stage_id`) REFERENCES `program_stages` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `programs`
--

DROP TABLE IF EXISTS `programs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `programs` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) DEFAULT NULL,
  `name` varchar(200) NOT NULL,
  `description` text DEFAULT NULL,
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `refresh_tokens`
--

DROP TABLE IF EXISTS `refresh_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `refresh_tokens` (
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
  KEY `idx_refresh_tokens_token_hash` (`token_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `report_photo_picks`
--

DROP TABLE IF EXISTS `report_photo_picks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `report_photo_picks` (
  `id` char(36) NOT NULL,
  `participant_id` char(36) NOT NULL,
  `session_id` char(36) NOT NULL,
  `program_stage_id` char(36) NOT NULL,
  `photo_id` char(36) NOT NULL,
  `created_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_photo_pick` (`participant_id`,`session_id`,`program_stage_id`),
  KEY `fk_picks_session` (`session_id`),
  KEY `fk_picks_photo` (`photo_id`),
  KEY `idx_report_photo_picks_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_picks_participant` FOREIGN KEY (`participant_id`) REFERENCES `participants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_picks_photo` FOREIGN KEY (`photo_id`) REFERENCES `smart_photos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_picks_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `reports`
--

DROP TABLE IF EXISTS `reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `reports` (
  `id` char(36) NOT NULL,
  `participant_id` char(36) NOT NULL,
  `session_id` char(36) NOT NULL,
  `program_stage_id` char(36) NOT NULL DEFAULT '',
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
  UNIQUE KEY `uq_reports_session_participant_topic` (`session_id`,`participant_id`,`program_stage_id`),
  KEY `idx_reports_participant` (`participant_id`),
  KEY `idx_reports_session` (`session_id`),
  KEY `idx_reports_deleted_at` (`deleted_at`),
  KEY `idx_reports_parent_token` (`parent_access_token`),
  KEY `idx_reports_gallery_token` (`gallery_access_token`),
  CONSTRAINT `fk_reports_participant` FOREIGN KEY (`participant_id`) REFERENCES `participants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_reports_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `session_groups`
--

DROP TABLE IF EXISTS `session_groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `session_groups` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `session_stages`
--

DROP TABLE IF EXISTS `session_stages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `session_stages` (
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
  CONSTRAINT `fk_session_stages_program_stage` FOREIGN KEY (`program_stage_id`) REFERENCES `program_stages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_session_stages_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `session_substages`
--

DROP TABLE IF EXISTS `session_substages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `session_substages` (
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
  CONSTRAINT `fk_session_substages_program_substage` FOREIGN KEY (`program_substage_id`) REFERENCES `program_substages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_session_substages_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_session_substages_session_stage` FOREIGN KEY (`session_stage_id`) REFERENCES `session_stages` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sessions`
--

DROP TABLE IF EXISTS `sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sessions` (
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
  CONSTRAINT `fk_sessions_program` FOREIGN KEY (`program_id`) REFERENCES `programs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sessions_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `smart_photos`
--

DROP TABLE IF EXISTS `smart_photos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `smart_photos` (
  `id` char(36) NOT NULL,
  `participant_id` char(36) NOT NULL,
  `session_id` char(36) NOT NULL,
  `session_stage_id` char(36) NOT NULL DEFAULT '',
  `frame_id` char(36) DEFAULT NULL,
  `original_file_url` varchar(512) NOT NULL,
  `framed_file_url` varchar(512) DEFAULT NULL,
  `is_report_photo` tinyint(1) NOT NULL DEFAULT 0,
  `taken_by` char(36) DEFAULT NULL,
  `taken_at` datetime(3) DEFAULT NULL,
  `file_size` bigint(20) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_smart_photos_participant` (`participant_id`),
  KEY `idx_smart_photos_session` (`session_id`),
  KEY `idx_smart_photos_deleted_at` (`deleted_at`),
  KEY `idx_smart_photos_topic` (`participant_id`,`session_id`,`session_stage_id`),
  CONSTRAINT `fk_smart_photos_participant` FOREIGN KEY (`participant_id`) REFERENCES `participants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_smart_photos_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `stage_contents`
--

DROP TABLE IF EXISTS `stage_contents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `stage_contents` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tenants`
--

DROP TABLE IF EXISTS `tenants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tenants` (
  `id` char(36) NOT NULL,
  `name` varchar(200) NOT NULL,
  `slug` varchar(200) NOT NULL,
  `settings_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`settings_json`)),
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tenants_slug` (`slug`),
  KEY `idx_tenants_deleted_at` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `timeline_events`
--

DROP TABLE IF EXISTS `timeline_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `timeline_events` (
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
  KEY `idx_timeline_events_deleted_at` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
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
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*M!100616 SET NOTE_VERBOSITY=@OLD_NOTE_VERBOSITY */;

-- Dump completed
