-- Restore the unique constraint on (tenant_id, name) for programs.
-- WARNING: this will fail if there are duplicate active names per tenant.
ALTER TABLE `programs` ADD UNIQUE KEY `uq_programs_tenant_name` (`tenant_id`, `name`);
