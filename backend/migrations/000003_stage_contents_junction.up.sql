-- 000003_stage_contents_junction
-- 000002 intended to repurpose stage_contents into a (content <-> stage) junction
-- with content_id as the PK, but its combined ALTER (DROP columns + ADD content_id
-- + ADD PRIMARY KEY + ADD FK in one statement) failed with MariaDB errno 194
-- ("Tablespace is missing for a table") and left the table in an intermediate
-- shape: no PK, no content_id, no FKs. The migration runner force-marked version 2
-- as applied, so this migration completes the junction shape.
--
-- stage_contents is a pure junction (no business rows of its own); it is empty in
-- every environment, so a DROP + CREATE is zero-data-loss and — unlike a multi-step
-- ALTER — avoids the in-place rename that triggered errno 194.

DROP TABLE IF EXISTS `stage_contents`;

CREATE TABLE IF NOT EXISTS `stage_contents` (
  `content_id` char(36) NOT NULL,
  `program_stage_id` char(36) NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `deleted_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`content_id`),
  KEY `idx_stage_contents_stage` (`program_stage_id`),
  KEY `idx_stage_contents_deleted_at` (`deleted_at`),
  CONSTRAINT `fk_stage_contents_content` FOREIGN KEY (`content_id`) REFERENCES `contents` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_stage_contents_stage` FOREIGN KEY (`program_stage_id`) REFERENCES `program_stages` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
