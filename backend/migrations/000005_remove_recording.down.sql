-- 000005_remove_recording.down.sql: restore the Recording feature schema.
-- Note: previously purged recording rows are NOT recovered (data loss on DROP is
-- expected); this rebuilds the empty tables/columns/enums to the pre-000005 shape.

CREATE TABLE `recordings` (
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

CREATE TABLE `recording_emotion_tags` (
  `recording_id` char(36) NOT NULL,
  `emotion_tag` varchar(40) NOT NULL,
  PRIMARY KEY (`recording_id`,`emotion_tag`),
  CONSTRAINT `fk_ret_recording` FOREIGN KEY (`recording_id`) REFERENCES `recordings` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE consent_logs
  MODIFY consent_type ENUM('RECORDING','PHOTO') NOT NULL;

ALTER TABLE contents
  MODIFY file_type ENUM('VIDEO','IMAGE','AUDIO','GAME_BUNDLE') NOT NULL;

ALTER TABLE participants
  ADD COLUMN consent_recording tinyint(1) NOT NULL DEFAULT 0 AFTER parent_email;

ALTER TABLE program_stages
  ADD COLUMN is_recording_stage tinyint(1) NOT NULL DEFAULT 0 AFTER is_photo_stage;
