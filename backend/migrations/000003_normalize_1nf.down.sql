-- 000003_normalize_1nf.down.sql
-- Rollback of 000003: re-add the JSON columns and drop the junction tables.
-- (Migrated junction data is NOT restored to JSON — acceptable for a rollback.)

ALTER TABLE mission_banks ADD COLUMN related_stage_ids longtext NULL;
ALTER TABLE recordings ADD COLUMN emotion_tags_json longtext NULL;
ALTER TABLE reports ADD COLUMN mission_ids_json longtext NULL;

DROP TABLE IF EXISTS mission_bank_stages;
DROP TABLE IF EXISTS recording_emotion_tags;
