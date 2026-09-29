-- 000005_drop_sync_status
-- Remove the offline sync-queue state machine: the app is online-only now.
-- No code references these columns anymore (same drop-column pattern as 000003).

ALTER TABLE `assessments` DROP COLUMN `sync_status`;
ALTER TABLE `smart_photos` DROP COLUMN `sync_status`;
