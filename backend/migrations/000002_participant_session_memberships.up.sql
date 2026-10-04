-- 000002_participant_session_memberships (Riwayat keanggotaan peserta ↔ sesi)
-- =============================================================================
-- Keanggotaan peserta↔sesi sebelumnya hanya berupa pointer tunggal
-- `participants.session_id`/`group_id` (FK ON DELETE SET NULL), tanpa tabel
-- riwayat — sehingga riwayat per sesi musnah saat peserta dipindah ke sesi
-- lain. Migrasi ini membuat tabel riwayat `participant_session_memberships`
-- lalu melakukan backfill sekali dari pointer eksisting.
--
-- AMAN UNTUK BIND MOUNT Windows/WSL2 (MDEV-24189 / MDEV-36911 / WSL#8443):
-- file ini murni CREATE TABLE atas tabel BARU + satu INSERT..SELECT (backfill)
-- — NOL ALTER/RENAME/CHANGE/rebuild tabel lama, sesuai syarat header 000001.
-- =============================================================================

--
-- Table structure for table `participant_session_memberships`
--

CREATE TABLE `participant_session_memberships` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) DEFAULT NULL,
  `participant_id` char(36) NOT NULL,
  `session_id` char(36) NOT NULL,
  `group_id` char(36) DEFAULT NULL,
  `joined_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_membership_participant_session` (`participant_id`,`session_id`),
  KEY `idx_membership_session_group` (`session_id`,`group_id`),
  KEY `idx_membership_group` (`group_id`),
  CONSTRAINT `fk_participant_session_memberships_participant` FOREIGN KEY (`participant_id`) REFERENCES `participants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_participant_session_memberships_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_participant_session_memberships_group` FOREIGN KEY (`group_id`) REFERENCES `session_groups` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Backfill sekali: salin pointer keanggotaan eksisting ke tabel riwayat baru
-- (INSERT..SELECT ke tabel BARU — bukan ALTER tabel lama)
--

INSERT INTO `participant_session_memberships`
  (`id`, `tenant_id`, `participant_id`, `session_id`, `group_id`, `joined_at`)
SELECT
  UUID(),
  `tenant_id`,
  `id`,
  `session_id`,
  `group_id`,
  COALESCE(`created_at`, NOW())
FROM `participants`
WHERE `session_id` IS NOT NULL AND `deleted_at` IS NULL;
