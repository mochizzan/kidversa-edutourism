-- 000006_normalize_bonus.up.sql
-- Bonus hardening from the audit: program_stages.sequence_order had no uniqueness
-- guard, allowing two stages to share an order within a program. Add a composite
-- unique constraint (program_id, sequence_order) to prevent collisions.

ALTER TABLE program_stages ADD CONSTRAINT uq_program_stages_order UNIQUE (program_id, sequence_order);
