-- 000002_bootstrap.up.sql
-- Bootstrap tenants + SUPER_ADMIN. Passwords are NOT stored here (bcrypt cannot be expressed in SQL).
-- The actual user/tenant creation (with bcrypt password) is performed in Go by cmd/migrate
-- (idempotent FirstOrCreate keyed on tenant.slug / user.email). This file is intentionally
-- minimal; it documents the bootstrap intent and can seed non-secret reference rows.

-- Tenants are created in Go to keep UUIDs stable and avoid hardcoding secrets.
-- (No-bootstrap-demo policy: only the two legacy tenants + 2 accounts are seeded, no demo data.)
