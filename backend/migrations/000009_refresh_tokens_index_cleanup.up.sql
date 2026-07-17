-- 000009_refresh_tokens_index_cleanup.up.sql
-- Fix slow revocation query: shrink token_hash, add composite indexes.
--
-- Root cause: Revoke() filters on (token_hash, revoked_at) but only the
-- UNIQUE index on token_hash exists. Without the composite, the planner
-- does a range scan + row fetch for the revoked_at filter.
-- Also: token_hash VARCHAR(255) stores a 64-char SHA-256 hex, bloating
-- the index by 4x (1022 bytes/entry vs 256 bytes/entry).

-- 1. Composite index for Revoke(): WHERE token_hash = ? AND revoked_at IS NULL
ALTER TABLE refresh_tokens
  ADD INDEX idx_refresh_hash_revoked (token_hash, revoked_at);

-- 2. Composite index for RevokeAllForUser(): WHERE user_id = ? AND revoked_at IS NULL
ALTER TABLE refresh_tokens
  ADD INDEX idx_refresh_user_revoked (user_id, revoked_at);

-- 3. Shrink token_hash from VARCHAR(255) to VARCHAR(64).
--    SHA-256 hex is exactly 64 chars. HashRefresh() in auth/jwt.go
--    always produces 64 chars (sha256Hex). No existing row can exceed this.
ALTER TABLE refresh_tokens
  MODIFY COLUMN token_hash VARCHAR(64) NOT NULL;
