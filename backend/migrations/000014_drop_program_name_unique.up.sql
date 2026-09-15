-- Drop the unique constraint on (tenant_id, name) for programs.
-- This allows creating a new program with the same name as a soft-deleted one.
-- Programs are curriculum templates; name uniqueness per tenant is not a data
-- integrity requirement.
ALTER TABLE `programs` DROP INDEX `uq_programs_tenant_name`;
