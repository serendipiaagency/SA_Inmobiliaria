-- Migration number: 0058    Granular per-admin permissions (P2, docs/production-hardening-audit.md)
--
-- Until now the only roles were super_admin/admin/user, and 'admin' meant
-- unconditional full access to every area of the org's panel — there was no
-- way to give one admin (e.g. a comercial) access to just CRM/Portal Web
-- without also handing them Facturación or Usuarios.
--
-- `permissions` is a nullable JSON array of "<area>:<action>" strings (see
-- server/utils/permissions.ts for the area list and check logic). NULL (the
-- default, and the value for every existing row after this migration) means
-- unrestricted — exactly today's behavior for every admin account. Only an
-- admin whose row gets an explicit, non-empty permissions array becomes
-- restricted to those areas. super_admin always bypasses this regardless of
-- the column's value.
--
-- Purely additive (ADD COLUMN, nullable) — no rebuild, no existing account
-- changes behavior.

ALTER TABLE users ADD COLUMN permissions TEXT;
