-- 000006_remove_substage_recording: drop the Recording flag from the v1.9
-- substages feature so the Recording feature is fully removed end-to-end.
-- No data purge needed: is_recording_stage is a boolean flag, not an enum
-- (unlike consent_logs.consent_type / contents.file_type in 000005).

ALTER TABLE program_substages
  DROP COLUMN is_recording_stage;
