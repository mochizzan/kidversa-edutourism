DROP INDEX idx_participants_consent_combined_token ON participants;
ALTER TABLE participants
  DROP COLUMN consent_combined_token,
  DROP COLUMN consent_combined_token_expires_at;
