-- 000001_init_schema.up.sql
-- Kidversa backend schema (MariaDB 12). utf8mb4, CHAR(36) UUID PKs, soft-delete via deleted_at.
-- Conventions: plural snake_case tables, <entity>_id FKs, BaseModel (id,created_at,updated_at,deleted_at).
-- FK checks are disabled during the batch to allow forward-ordered CREATE TABLEs.

SET FOREIGN_KEY_CHECKS=0;

CREATE TABLE tenants (
  id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(120) NOT NULL,
  settings_json JSON NULL,
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
  id CHAR(36) NOT NULL, program_id CHAR(36) NOT NULL,
  category ENUM('HOME','PARENT','SCHOOL') NOT NULL,
  title_child VARCHAR(200) NOT NULL, title_parent VARCHAR(200) NOT NULL,
  description_parent TEXT NULL, related_stage_ids JSON NULL,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  updated_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_mission_banks_program (program_id),
  KEY idx_mission_banks_category (category),
  KEY idx_mission_banks_deleted_at (deleted_at),
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
