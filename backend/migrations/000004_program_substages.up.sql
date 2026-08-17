-- 000004_program_substages
-- Badge & Substage refactor (Topik / SubTopik / Kegiatan).
--
-- Hierarchy (verified v3 shape):
--   programs          = "Topik"
--   program_stages    = "SubTopik" (container)
--   stage_contents     = content junction (was on program_stage)
-- New leaves:
--   program_substages  = "Kegiatan" (assessed unit, child of program_stage)
--   session_substages  = instantiation of a Kegiatan within a session
--   participant_badges = awarded per-child badge rows
--
-- Dev DB is near-empty (schema_migrations=3). The FK re-pointing below is safe.
-- NEVER delete/rename a recorded migration (golang-migrate dirty-version rule).
--
-- Strategy: create new tables + rename re-pointed columns + seed/re-home existing
-- dev rows FIRST, THEN add the foreign keys once the data is consistent. Adding
-- the FKs before re-homing would fail the FK check on the existing dev rows.

-- ---------------------------------------------------------------------------
-- 1. program_stages: add SubTopik badge columns (Q9=A: name + image on the SubTopik).
-- ---------------------------------------------------------------------------
ALTER TABLE `program_stages`
  ADD COLUMN `badge_name` varchar(160) DEFAULT NULL AFTER `is_photo_stage`,
  ADD COLUMN `badge_image_url` varchar(512) DEFAULT NULL AFTER `badge_name`;

-- ---------------------------------------------------------------------------
-- 2. programs: add Final Program badge columns (cross-session accumulation).
-- ---------------------------------------------------------------------------
ALTER TABLE `programs`
  ADD COLUMN `final_badge_name` varchar(160) DEFAULT NULL AFTER `thumbnail_url`,
  ADD COLUMN `final_badge_image_url` varchar(512) DEFAULT NULL AFTER `final_badge_name`;

-- ---------------------------------------------------------------------------
-- 3. program_substages ("Kegiatan"): the assessed leaf under a SubTopik.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `program_substages` (
  `id` char(36) NOT NULL,
  `program_stage_id` char(36) NOT NULL,
  `sequence_order` int(11) NOT NULL DEFAULT 0,
  `name` varchar(160) NOT NULL,
  `description` text DEFAULT NULL,
  `duration_minutes` int(11) NOT NULL DEFAULT 0,
  `is_recording_stage` tinyint(1) NOT NULL DEFAULT 0,
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
-- 4. session_substages: instantiation of a Kegiatan within a session.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `session_substages` (
  `id` char(36) NOT NULL,
  `session_id` char(36) NOT NULL,
  `session_stage_id` char(36) NOT NULL,
  `program_substage_id` char(36) NOT NULL,
  `status` enum('WAITING','ACTIVE','COMPLETED') NOT NULL DEFAULT 'WAITING',
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
-- 5. participant_badges: awarded per-child badge rows (Q10=B).
--    subtopic = 1 row per (participant, program_stage); final = 1 per program
--    (program_stage_id NULL for final rows).
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
-- 6. Rename re-pointed columns (NO new FK yet — added in step 9).
-- ---------------------------------------------------------------------------
-- stage_contents: program_stage_id -> program_substage_id.
ALTER TABLE `stage_contents`
  DROP FOREIGN KEY `fk_stage_contents_stage`,
  DROP KEY `idx_stage_contents_stage`,
  CHANGE COLUMN `program_stage_id` `program_substage_id` char(36) NOT NULL,
  ADD KEY `idx_stage_contents_substage` (`program_substage_id`);

-- assessments: session_stage_id -> session_substage_id; star DEFAULT 1, allow 0.
-- Keep uq_assessments_participant_stage (it auto-tracks the renamed column);
-- it is RENAMED to uq_assessments_participant_substage in step 8.
ALTER TABLE `assessments`
  DROP FOREIGN KEY `fk_assessments_session_stage`,
  DROP KEY `idx_assessments_session_stage`,
  CHANGE COLUMN `session_stage_id` `session_substage_id` char(36) DEFAULT NULL,
  ADD KEY `idx_assessments_session_substage` (`session_substage_id`),
  MODIFY COLUMN `star_rating` int(11) NOT NULL DEFAULT 1;

-- group_stage_progress: session_stage_id -> session_substage_id.
-- Keep uq_group_stage (auto-tracks the renamed column); RENAMED in step 8.
ALTER TABLE `group_stage_progress`
  DROP FOREIGN KEY `fk_group_stage_progress_stage`,
  DROP KEY `fk_group_stage_progress_stage`,
  CHANGE COLUMN `session_stage_id` `session_substage_id` char(36) NOT NULL,
  ADD KEY `fk_group_stage_progress_substage` (`session_substage_id`);

-- ---------------------------------------------------------------------------
-- 7. Migration bootstrap (dev-only, idempotent): seed the default Kegiatan
--    ("Kegiatan") per SubTopik that owns content or a session, then re-home the
--    existing stage_contents + assessments rows onto those leaves. Skipped
--    entirely when no content/sessions exist.
-- ---------------------------------------------------------------------------
INSERT INTO `program_substages` (`id`, `program_stage_id`, `sequence_order`, `name`, `created_at`, `updated_at`)
SELECT UUID(), ps.`id`, 0, CONCAT(ps.`name`, ' — Kegiatan'), NOW(3), NOW(3)
FROM `program_stages` ps
WHERE (
    EXISTS (SELECT 1 FROM `stage_contents` WHERE `program_substage_id` = ps.`id`)
    OR EXISTS (SELECT 1 FROM `session_stages` WHERE `program_stage_id` = ps.`id`)
  )
  AND NOT EXISTS (SELECT 1 FROM `program_substages` WHERE `program_stage_id` = ps.`id`);

-- Re-home stage_contents onto the default Kegiatan of their SubTopik.
UPDATE `stage_contents` sc
JOIN `program_stages` ps ON ps.`id` = sc.`program_substage_id`
JOIN `program_substages` psub ON psub.`program_stage_id` = ps.`id` AND psub.`sequence_order` = 0
SET sc.`program_substage_id` = psub.`id`
WHERE psub.`sequence_order` = 0;

-- Seed session_substages for the dev assessment's session so it has a real leaf.
INSERT INTO `session_substages` (`id`, `session_id`, `session_stage_id`, `program_substage_id`, `created_at`, `updated_at`)
SELECT UUID(), ss.`session_id`, ss.`id`, psub.`id`, NOW(3), NOW(3)
FROM `assessments` a
JOIN `session_stages` ss ON ss.`id` = a.`session_substage_id`
JOIN `program_substages` psub ON psub.`program_stage_id` = ss.`program_stage_id` AND psub.`sequence_order` = 0
WHERE a.`session_substage_id` IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `session_substages` ssub
    WHERE ssub.`session_id` = ss.`session_id`
      AND ssub.`program_substage_id` = psub.`id`
  );

-- Re-home the dev assessment row onto its cloned session_substage.
UPDATE `assessments` a
JOIN `session_stages` ss ON ss.`id` = a.`session_substage_id`
JOIN `program_substages` psub ON psub.`program_stage_id` = ss.`program_stage_id` AND psub.`sequence_order` = 0
JOIN `session_substages` ssub ON ssub.`session_id` = ss.`session_id`
  AND ssub.`program_substage_id` = psub.`id`
SET a.`session_substage_id` = ssub.`id`
WHERE a.`session_substage_id` IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 8. Rename the unique keys (they auto-tracked the renamed columns) and add the
--    foreign keys now that the data is consistent.
-- ---------------------------------------------------------------------------
ALTER TABLE `stage_contents`
  ADD CONSTRAINT `fk_stage_contents_substage` FOREIGN KEY (`program_substage_id`) REFERENCES `program_substages` (`id`) ON DELETE CASCADE;

ALTER TABLE `assessments`
  RENAME INDEX `uq_assessments_participant_stage` TO `uq_assessments_participant_substage`,
  ADD CONSTRAINT `fk_assessments_session_substage` FOREIGN KEY (`session_substage_id`) REFERENCES `session_substages` (`id`) ON DELETE SET NULL;

ALTER TABLE `group_stage_progress`
  RENAME INDEX `uq_group_stage` TO `uq_group_substage`,
  ADD CONSTRAINT `fk_group_stage_progress_substage` FOREIGN KEY (`session_substage_id`) REFERENCES `session_substages` (`id`) ON DELETE CASCADE;
