-- 000008_group_facilitator.up.sql
-- Adds a per-group facilitator so a session group (child cohort) can be assigned
-- its own fasilitator, independent of the per-stage facilitator. The column is
-- nullable (ON DELETE SET NULL) so clearing a facilitator keeps the group.

ALTER TABLE session_groups
  ADD COLUMN facilitator_id CHAR(36) NULL AFTER current_session_stage_id,
  ADD KEY idx_session_groups_facilitator (facilitator_id),
  ADD CONSTRAINT fk_session_groups_facilitator
    FOREIGN KEY (facilitator_id) REFERENCES users(id) ON DELETE SET NULL;
