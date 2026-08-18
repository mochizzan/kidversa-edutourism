-- 000005_remove_recording: drop the Recording feature end-to-end.
-- Pre-conditions (enforced in Phase 0): recording_emotion_tags/recordings rows
-- purged, AUDIO content converted to VIDEO, RECORDING consent converted to PHOTO,
-- participants.consent_recording cleared. Those steps prevent ENUM coercion/drop.

DROP TABLE IF EXISTS recording_emotion_tags;
DROP TABLE IF EXISTS recordings;

ALTER TABLE consent_logs
  MODIFY consent_type ENUM('PHOTO') NOT NULL;

ALTER TABLE contents
  MODIFY file_type ENUM('VIDEO','IMAGE','GAME_BUNDLE') NOT NULL;

ALTER TABLE participants
  DROP COLUMN consent_recording;

ALTER TABLE program_stages
  DROP COLUMN is_recording_stage;
