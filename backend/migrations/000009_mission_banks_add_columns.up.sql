-- 000009_mission_banks_add_columns.up.sql
-- Add tenant_id (required for tenant scoping, matching photo_frames pattern)
-- and sort_order (required by List ORDER BY) to mission_banks.

ALTER TABLE mission_banks
  ADD COLUMN tenant_id CHAR(36) NULL AFTER id,
  ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER is_active;

ALTER TABLE mission_banks
  ADD KEY idx_mission_banks_tenant (tenant_id),
  ADD CONSTRAINT fk_mission_banks_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;

-- Backfill existing rows (if any) with the first active tenant.
UPDATE mission_banks mb
  JOIN (SELECT id FROM tenants WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1) t
  SET mb.tenant_id = t.id
  WHERE mb.tenant_id IS NULL;
