-- 000009_mission_banks_add_columns.down.sql
ALTER TABLE mission_banks
  DROP FOREIGN KEY fk_mission_banks_tenant,
  DROP INDEX idx_mission_banks_tenant,
  DROP COLUMN tenant_id,
  DROP COLUMN sort_order;
