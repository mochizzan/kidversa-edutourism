-- 000009_refresh_tokens_index_cleanup.down.sql
-- Rollback: drop composite indexes, restore VARCHAR(255).

ALTER TABLE refresh_tokens DROP INDEX idx_refresh_hash_revoked;
ALTER TABLE refresh_tokens DROP INDEX idx_refresh_user_revoked;
ALTER TABLE refresh_tokens MODIFY COLUMN token_hash VARCHAR(255) NOT NULL;
