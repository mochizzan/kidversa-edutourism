-- 000002_content_single_source
-- Model A: Content becomes a standalone, tenant-scoped, reusable entity that many
-- program stages can reference via the (repurposed) stage_contents junction table.
-- The DB is dev/empty (A7b), so this migration ALTERs an empty stage_contents table
-- and is safe to run. 000001 is left untouched.

-- ---------------------------------------------------------------------------
-- 1. Standalone contents table (hard-delete: no deleted_at).
--    `contents.id` is the ONLY media id used by the kiosk/learner (CRIT-1/7):
--    /api/media/kiosk/content/:id resolves to contents.id -> contents.file_url.
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
-- 2. Repurpose stage_contents into a junction (content <-> stage).
--    PK becomes content_id (NOT a separate auto UUID). sort_order + is_active
--    live ONLY on the junction (per-stage activation, A2b/D9a). Keep soft-delete
--    deleted_at for list filtering consistency.
-- ---------------------------------------------------------------------------

-- Drop the old surrogate PK, its index, and the stage FK so we can redefine the
-- table shape cleanly (empty table => no data loss under A7b).
ALTER TABLE `stage_contents`
  DROP FOREIGN KEY `fk_stage_contents_stage`,
  DROP PRIMARY KEY,
  DROP INDEX `idx_stage_contents_stage`,
  DROP INDEX `idx_stage_contents_deleted_at`,
  DROP COLUMN `id`,
  DROP COLUMN `title`,
  DROP COLUMN `file_url`,
  DROP COLUMN `youtube_url`,
  DROP COLUMN `file_type`,
  DROP COLUMN `duration_seconds`;

-- Add content_id as the new PK + FK -> contents (DELETE CASCADE, D10a/E3).
ALTER TABLE `stage_contents`
  ADD COLUMN `content_id` char(36) NOT NULL FIRST,
  ADD PRIMARY KEY (`content_id`),
  ADD CONSTRAINT `fk_stage_contents_content` FOREIGN KEY (`content_id`) REFERENCES `contents` (`id`) ON DELETE CASCADE,
  ADD KEY `idx_stage_contents_content` (`content_id`);

-- Re-add the stage FK (unchanged target, E4) and its index.
ALTER TABLE `stage_contents`
  ADD CONSTRAINT `fk_stage_contents_stage` FOREIGN KEY (`program_stage_id`) REFERENCES `program_stages` (`id`) ON DELETE CASCADE,
  ADD KEY `idx_stage_contents_stage` (`program_stage_id`);

-- `sort_order`, `is_active`, `created_at`, `updated_at`, `deleted_at` are retained
-- from the original DDL (no-op if present). Ensure they exist defensively.
ALTER TABLE `stage_contents`
  MODIFY COLUMN `sort_order` int(11) NOT NULL DEFAULT 0,
  MODIFY COLUMN `is_active` tinyint(1) NOT NULL DEFAULT 1,
  MODIFY COLUMN `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  MODIFY COLUMN `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  MODIFY COLUMN `deleted_at` datetime(3) DEFAULT NULL;
