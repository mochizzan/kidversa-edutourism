-- 000001_init_schema.up.sql
-- Kidversa backend schema (MariaDB 12). utf8mb4, CHAR(36) UUID PKs, soft-delete via deleted_at.
-- Conventions: plural snake_case tables, <entity>_id FKs, BaseModel (id,created_at,updated_at,deleted_at).
-- FK checks are disabled during the batch to allow forward-ordered CREATE TABLEs.
--
-- This is the consolidated schema (consolidated from incremental 000001-000009 on
-- 2026-07-15). It matches the live database exactly (verified via introspection)
-- with the following GORM overrides corrected vs the original DDL:
--   * JSON columns (settings_json, related_stage_ids, mission_ids_json) are LONGTEXT
--     in the live DB because GORM does not emit MySQL JSON natively.
--   * mission_banks gained tenant_id + sort_order (was 000009).
--   * consent_logs gained consent_token (UNIQUE) + consumed_at + expires_at (was 000008).
--   * stage_contents gained youtube_url (NEW, this consolidation).

SET FOREIGN_KEY_CHECKS=0;

CREATE TABLE tenants (
  id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(120) NOT NULL,
  settings_json LONGTEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  updated_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  deleted_at DATETIME(3) NULL,
  active_uniq TINYINT AS (CASE WHEN deleted_at IS NULL THEN 1 ELSE NULL END) VIRTUAL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenants_slug (slug, active_uniq),
  KEY idx_tenants_deleted_at (deleted_at)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id CHAR(36) NOT NULL,
  tenant_id CHAR(36) NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('SUPER_ADMIN','ADMIN','KOORDINATOR','FASILITATOR') NOT NULL,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(40) NULL,
  avatar_url VARCHAR(512) NULL,
  is_active BOOLEAN NOT NULL DEFAULT 0,
  approval_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  approved_at DATETIME(3) NULL, approved_by CHAR(36) NULL,
  rejected_at DATETIME(3) NULL, rejected_by CHAR(36) NULL, rejection_reason VARCHAR(255) NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  updated_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_tenant (tenant_id),
  KEY idx_users_role (role),
  KEY idx_users_approval_status (approval_status),
  KEY idx_users_is_active (is_active),
  KEY idx_users_deleted_at (deleted_at),
  CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
  CONSTRAINT fk_users_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_users_rejected_by FOREIGN KEY (rejected_by) REFERENCES users(id) ON DELETE SET NULL
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE programs (
  id CHAR(36) NOT NULL, tenant_id CHAR(36) NOT NULL,
  name VARCHAR(160) NOT NULL, description TEXT NULL, thumbnail_url VARCHAR(512) NULL,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  updated_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_programs_tenant (tenant_id),
  KEY idx_programs_deleted_at (deleted_at),
  CONSTRAINT fk_programs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE program_stages (
  id CHAR(36) NOT NULL, program_id CHAR(36) NOT NULL,
  sequence_order INT NOT NULL DEFAULT 0, name VARCHAR(160) NOT NULL,
  description TEXT NULL, content_type ENUM('VIDEO','SLIDESHOW','GAME','MIXED') NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 0,
  is_recording_stage BOOLEAN NOT NULL DEFAULT 0, is_photo_stage BOOLEAN NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  updated_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_program_stages_program (program_id),
  KEY idx_program_stages_deleted_at (deleted_at),
  CONSTRAINT fk_program_stages_program FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE stage_contents (
  id CHAR(36) NOT NULL, program_stage_id CHAR(36) NOT NULL,
  title VARCHAR(200) NOT NULL, file_url VARCHAR(512) NOT NULL,
  youtube_url VARCHAR(512) NULL,
  file_type ENUM('VIDEO','IMAGE','AUDIO','GAME_BUNDLE') NOT NULL,
  duration_seconds INT NULL, sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  updated_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_stage_contents_stage (program_stage_id),
  KEY idx_stage_contents_deleted_at (deleted_at),
  CONSTRAINT fk_stage_contents_stage FOREIGN KEY (program_stage_id) REFERENCES program_stages(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE photo_frames (
  id CHAR(36) NOT NULL, tenant_id CHAR(36) NOT NULL, program_id CHAR(36) NULL,
  name VARCHAR(160) NOT NULL, file_url VARCHAR(512) NOT NULL, thumbnail_url VARCHAR(512) NULL,
  is_active BOOLEAN NOT NULL DEFAULT 1, sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  updated_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_photo_frames_tenant (tenant_id),
  KEY idx_photo_frames_program (program_id),
  KEY idx_photo_frames_deleted_at (deleted_at),
  CONSTRAINT fk_photo_frames_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
  CONSTRAINT fk_photo_frames_program FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE SET NULL
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE mission_banks (
  id CHAR(36) NOT NULL, tenant_id CHAR(36) NULL, program_id CHAR(36) NOT NULL,
  category ENUM('HOME','PARENT','SCHOOL') NOT NULL,
  title_child VARCHAR(200) NOT NULL, title_parent VARCHAR(200) NOT NULL,
  description_parent TEXT NULL, related_stage_ids LONGTEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  updated_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_mission_banks_program (program_id),
  KEY idx_mission_banks_category (category),
  KEY idx_mission_banks_tenant (tenant_id),
  KEY idx_mission_banks_deleted_at (deleted_at),
  CONSTRAINT fk_mission_banks_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
  CONSTRAINT fk_mission_banks_program FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sessions (
  id CHAR(36) NOT NULL, tenant_id CHAR(36) NOT NULL, program_id CHAR(36) NOT NULL,
  name VARCHAR(160) NOT NULL, session_date VARCHAR(20) NOT NULL, location VARCHAR(200) NOT NULL,
  status ENUM('DRAFT','ACTIVE','COMPLETED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  notes TEXT NULL, created_by CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  updated_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_sessions_tenant (tenant_id),
  KEY idx_sessions_program (program_id),
  KEY idx_sessions_status (status),
  KEY idx_sessions_date (session_date),
  KEY idx_sessions_created_by (created_by),
  KEY idx_sessions_deleted_at (deleted_at),
  CONSTRAINT fk_sessions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sessions_program FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sessions_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE session_stages (
  id CHAR(36) NOT NULL, session_id CHAR(36) NOT NULL, program_stage_id CHAR(36) NOT NULL,
  facilitator_id CHAR(36) NULL,
  status ENUM('WAITING','ACTIVE','COMPLETED') NOT NULL DEFAULT 'WAITING',
  started_at DATETIME(3) NULL, completed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  updated_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_session_stages_session (session_id),
  KEY idx_session_stages_program_stage (program_stage_id),
  KEY idx_session_stages_facilitator (facilitator_id),
  KEY idx_session_stages_deleted_at (deleted_at),
  CONSTRAINT fk_session_stages_session FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_session_stages_program_stage FOREIGN KEY (program_stage_id) REFERENCES program_stages(id) ON DELETE RESTRICT,
  CONSTRAINT fk_session_stages_facilitator FOREIGN KEY (facilitator_id) REFERENCES users(id) ON DELETE SET NULL
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE session_groups (
  id CHAR(36) NOT NULL, session_id CHAR(36) NOT NULL,
  name VARCHAR(160) NOT NULL,
  status ENUM('WAITING','IN_PROGRESS','COMPLETED') NOT NULL DEFAULT 'WAITING',
  current_session_stage_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  updated_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_session_groups_session (session_id),
  KEY idx_session_groups_deleted_at (deleted_at),
  CONSTRAINT fk_session_groups_session FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE group_stage_progress (
  id CHAR(36) NOT NULL, group_id CHAR(36) NOT NULL, session_stage_id CHAR(36) NOT NULL,
  status ENUM('LOCKED','UNLOCKED','IN_PROGRESS','COMPLETED','SKIPPED') NOT NULL DEFAULT 'LOCKED',
  entered_at DATETIME(3) NULL, completed_at DATETIME(3) NULL,
  unlocked_by CHAR(36) NULL, unlock_reason VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  updated_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_group_stage (group_id, session_stage_id),
  KEY idx_group_stage_progress_deleted_at (deleted_at),
  CONSTRAINT fk_group_stage_progress_group FOREIGN KEY (group_id) REFERENCES session_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_group_stage_progress_stage FOREIGN KEY (session_stage_id) REFERENCES session_stages(id) ON DELETE CASCADE,
  CONSTRAINT fk_group_stage_progress_unlocked_by FOREIGN KEY (unlocked_by) REFERENCES users(id) ON DELETE SET NULL
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE participants (
  id CHAR(36) NOT NULL, tenant_id CHAR(36) NULL, session_id CHAR(36) NULL, group_id CHAR(36) NULL,
  child_name VARCHAR(160) NOT NULL, child_age INT NOT NULL DEFAULT 0, school_name VARCHAR(160) NULL,
  parent_name VARCHAR(160) NOT NULL, parent_phone VARCHAR(40) NOT NULL, parent_email VARCHAR(255) NULL,
  consent_recording BOOLEAN NOT NULL DEFAULT 0, consent_photo BOOLEAN NOT NULL DEFAULT 0,
  consent_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  updated_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_participants_tenant (tenant_id),
  KEY idx_participants_session (session_id),
  KEY idx_participants_group (group_id),
  KEY idx_participants_deleted_at (deleted_at),
  CONSTRAINT fk_participants_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL,
  CONSTRAINT fk_participants_session FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_participants_group FOREIGN KEY (group_id) REFERENCES session_groups(id) ON DELETE SET NULL
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE timeline_events (
  id CHAR(36) NOT NULL, session_id CHAR(36) NOT NULL, group_id CHAR(36) NOT NULL,
  type VARCHAR(40) NOT NULL, message VARCHAR(512) NOT NULL, user_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  updated_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_timeline_session_created (session_id, created_at),
  KEY idx_timeline_group_created (group_id, created_at),
  KEY idx_timeline_deleted_at (deleted_at),
  CONSTRAINT fk_timeline_session FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_timeline_group FOREIGN KEY (group_id) REFERENCES session_groups(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE refresh_tokens (
  id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME(3) NOT NULL, revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  updated_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_refresh_user (user_id),
  KEY idx_refresh_deleted_at (deleted_at),
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notifications (
  id CHAR(36) NOT NULL, tenant_id CHAR(36) NOT NULL,
  recipient_user_id CHAR(36) NOT NULL, type VARCHAR(40) NOT NULL,
  ref_id VARCHAR(64) NULL, message VARCHAR(512) NULL, is_read BOOLEAN NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  updated_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_notif_tenant (tenant_id),
  KEY idx_notif_recipient (recipient_user_id, is_read),
  KEY idx_notif_created (created_at),
  KEY idx_notif_deleted_at (deleted_at),
  CONSTRAINT fk_notif_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_recipient FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE kiosk_tokens (
  id VARCHAR(36) NOT NULL,
  token VARCHAR(64) NOT NULL,
  session_id VARCHAR(36) NOT NULL,
  tenant_id VARCHAR(36) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  consumed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_kiosk_token (token),
  KEY idx_kiosk_session (session_id),
  KEY idx_kiosk_tenant (tenant_id)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE reports (
  id CHAR(36) NOT NULL,
  participant_id CHAR(36) NOT NULL,
  session_id CHAR(36) NOT NULL,
  ai_narrative_draft TEXT NULL,
  ai_narrative_final TEXT NULL,
  mission_ids_json LONGTEXT NULL,
  report_pdf_url VARCHAR(512) NULL,
  parent_access_token VARCHAR(64) NULL,
  parent_token_expires_at VARCHAR(64) NULL,
  parent_token_revoked BOOLEAN NOT NULL DEFAULT 0,
  status ENUM('DRAFT','PENDING_REVIEW','APPROVED','SENT') NOT NULL DEFAULT 'DRAFT',
  generated_at VARCHAR(64) NULL,
  sent_at VARCHAR(64) NULL,
  approved_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  updated_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reports_session_participant (session_id, participant_id),
  KEY idx_reports_participant (participant_id),
  KEY idx_reports_session (session_id),
  KEY idx_reports_status (status),
  KEY idx_reports_deleted_at (deleted_at),
  CONSTRAINT fk_reports_participant FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
  CONSTRAINT fk_reports_session FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE participant_missions (
  id CHAR(36) NOT NULL,
  participant_id CHAR(36) NOT NULL,
  report_id CHAR(36) NOT NULL,
  mission_bank_id CHAR(36) NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT 0,
  completed_at VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  updated_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_participant_mission (report_id, mission_bank_id),
  KEY idx_participant_missions_participant (participant_id),
  KEY idx_participant_missions_report (report_id),
  KEY idx_participant_missions_mission_bank (mission_bank_id),
  KEY idx_participant_missions_deleted_at (deleted_at),
  CONSTRAINT fk_participant_missions_participant FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
  CONSTRAINT fk_participant_missions_report FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
  CONSTRAINT fk_participant_missions_mission_bank FOREIGN KEY (mission_bank_id) REFERENCES mission_banks(id) ON DELETE RESTRICT
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE smart_photos (
  id CHAR(36) NOT NULL,
  participant_id CHAR(36) NOT NULL,
  session_id CHAR(36) NOT NULL,
  frame_id CHAR(36) NULL,
  original_file_url VARCHAR(512) NOT NULL,
  framed_file_url VARCHAR(512) NULL,
  is_report_photo BOOLEAN NOT NULL DEFAULT 0,
  taken_by CHAR(36) NULL,
  taken_at VARCHAR(64) NULL,
  sync_status ENUM('LOCAL','UPLOADING','SYNCED','FAILED') NOT NULL DEFAULT 'LOCAL',
  created_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  updated_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_smart_photos_participant (participant_id),
  KEY idx_smart_photos_session (session_id),
  KEY idx_smart_photos_frame (frame_id),
  KEY idx_smart_photos_report_photo (is_report_photo),
  KEY idx_smart_photos_deleted_at (deleted_at),
  CONSTRAINT fk_smart_photos_participant FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
  CONSTRAINT fk_smart_photos_session FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_smart_photos_frame FOREIGN KEY (frame_id) REFERENCES photo_frames(id) ON DELETE SET NULL
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE recordings (
  id CHAR(36) NOT NULL,
  participant_id CHAR(36) NOT NULL,
  session_id CHAR(36) NOT NULL,
  session_stage_id CHAR(36) NULL,
  file_url VARCHAR(512) NULL,
  duration_seconds INT NOT NULL DEFAULT 0,
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  transcript_text TEXT NULL,
  emotion_tags_json LONGTEXT NULL,
  review_status ENUM('PENDING','REVIEWED','SKIPPED') NOT NULL DEFAULT 'PENDING',
  reviewed_by CHAR(36) NULL,
  reviewed_at VARCHAR(64) NULL,
  sync_status ENUM('LOCAL','UPLOADING','SYNCED','FAILED') NOT NULL DEFAULT 'LOCAL',
  created_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  updated_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_recordings_participant (participant_id),
  KEY idx_recordings_session (session_id),
  KEY idx_recordings_session_stage (session_stage_id),
  KEY idx_recordings_review_status (review_status),
  KEY idx_recordings_deleted_at (deleted_at),
  CONSTRAINT fk_recordings_participant FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
  CONSTRAINT fk_recordings_session FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_recordings_session_stage FOREIGN KEY (session_stage_id) REFERENCES session_stages(id) ON DELETE SET NULL
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE assessments (
  id CHAR(36) NOT NULL,
  participant_id CHAR(36) NOT NULL,
  session_id CHAR(36) NOT NULL,
  session_stage_id CHAR(36) NULL,
  star_rating INT NOT NULL DEFAULT 0,
  comment TEXT NULL,
  assessed_by CHAR(36) NULL,
  assessed_at VARCHAR(64) NULL,
  sync_status ENUM('LOCAL','UPLOADING','SYNCED','FAILED') NOT NULL DEFAULT 'LOCAL',
  created_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  updated_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_assessments_participant (participant_id),
  KEY idx_assessments_session (session_id),
  KEY idx_assessments_session_stage (session_stage_id),
  KEY idx_assessments_deleted_at (deleted_at),
  CONSTRAINT fk_assessments_participant FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
  CONSTRAINT fk_assessments_session FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_assessments_session_stage FOREIGN KEY (session_stage_id) REFERENCES session_stages(id) ON DELETE SET NULL
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE consent_logs (
  id CHAR(36) NOT NULL,
  participant_id CHAR(36) NOT NULL,
  session_id CHAR(36) NOT NULL,
  consent_type ENUM('RECORDING','PHOTO') NOT NULL,
  value BOOLEAN NOT NULL DEFAULT 0,
  sent_at VARCHAR(64) NULL,
  responded_at VARCHAR(64) NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(512) NULL,
  consent_token VARCHAR(64) NULL,
  consumed_at VARCHAR(64) NULL,
  expires_at VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  updated_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_consent_participant (participant_id),
  KEY idx_consent_session (session_id),
  KEY idx_consent_deleted_at (deleted_at),
  CONSTRAINT fk_consent_participant FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
  CONSTRAINT fk_consent_session FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  UNIQUE KEY uq_consent_token (consent_token)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
