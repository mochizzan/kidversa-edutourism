-- 000006_kiosk_tokens.up.sql
-- Single-use kiosk access tokens for the public learner kiosk flow (plan B11).
-- A kiosk token binds a session + tenant and is consumed on first use.
CREATE TABLE kiosk_tokens (
  id VARCHAR(36) NOT NULL,
  token VARCHAR(64) NOT NULL,
  session_id VARCHAR(36) NOT NULL,
  tenant_id VARCHAR(36) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  consumed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT NOW(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_kiosk_token (token),
  KEY idx_kiosk_session (session_id),
  KEY idx_kiosk_tenant (tenant_id)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
