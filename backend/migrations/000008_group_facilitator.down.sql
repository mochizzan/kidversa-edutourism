-- 000008_group_facilitator.down.sql
-- Rollback: drop the group facilitator FK, index, and column.

ALTER TABLE session_groups
  DROP FOREIGN KEY fk_session_groups_facilitator,
  DROP KEY idx_session_groups_facilitator,
  DROP COLUMN facilitator_id;
