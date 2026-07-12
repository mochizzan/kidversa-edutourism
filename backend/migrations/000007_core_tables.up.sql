-- 000007_core_tables.up.sql
-- Core child-facing tables (reports, participant_missions, smart_photos,
-- recordings, assessments, consent_logs). These GORM models exist but had no DDL.
-- Numbered 000007 (above the already-applied 000006) so it applies on both fresh
-- and live databases where schema_migrations is already at v6.
--
-- Column typing note: GORM entity timestamp fields (sent_at, responded_at,
-- taken_at, generated_at, sent_at, completed_at, assessed_at, reviewed_at,
-- consumed_at, expires_at, parent_token_expires_at) are Go string/*string that
-- store RFC3339 values with NO gorm `type:` override. GORM therefore creates them
-- as VARCHAR, so we do the same here to match the model exactly and accept RFC3339.
-- Conventions otherwise match 000001: plural snake_case, CHAR(36) UUID PKs,
-- soft-delete via deleted_at, FK checks disabled during the batch for forward ordering.

SET FOREIGN_KEY_CHECKS=0;

CREATE TABLE reports (
  id CHAR(36) NOT NULL,
  participant_id CHAR(36) NOT NULL,
  session_id CHAR(36) NOT NULL,
  ai_narrative_draft TEXT NULL,
  ai_narrative_final TEXT NULL,
  mission_ids_json JSON NULL,
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
  emotion_tags_json JSON NULL,
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
  created_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  updated_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_consent_participant (participant_id),
  KEY idx_consent_session (session_id),
  KEY idx_consent_deleted_at (deleted_at),
  CONSTRAINT fk_consent_participant FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
  CONSTRAINT fk_consent_session FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
