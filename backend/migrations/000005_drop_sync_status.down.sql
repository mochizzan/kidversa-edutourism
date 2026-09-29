-- 000005_drop_sync_status (down)
-- Restore the original column definitions from 000001_init_schema.
-- Data is NOT restored (the sync queue no longer exists).

ALTER TABLE `assessments` ADD COLUMN `sync_status` enum('LOCAL','UPLOADING','SYNCED','FAILED') NOT NULL DEFAULT 'LOCAL' AFTER `assessed_at`;
ALTER TABLE `smart_photos` ADD COLUMN `sync_status` varchar(20) NOT NULL DEFAULT 'LOCAL' AFTER `taken_at`;
