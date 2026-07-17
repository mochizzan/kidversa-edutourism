ALTER TABLE participants
  ADD COLUMN consent_combined_token VARCHAR(255) DEFAULT NULL AFTER consent_at,
  ADD COLUMN consent_combined_token_expires_at DATETIME(3) DEFAULT NULL AFTER consent_combined_token;

CREATE UNIQUE INDEX idx_participants_consent_combined_token ON participants (consent_combined_token);
