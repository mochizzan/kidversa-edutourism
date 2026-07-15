-- 000006_normalize_bonus.down.sql
-- Rollback of 000006: drop the bonus unique constraint.

ALTER TABLE program_stages DROP INDEX uq_program_stages_order;
