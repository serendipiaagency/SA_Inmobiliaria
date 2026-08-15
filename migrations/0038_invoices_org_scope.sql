-- Migration number: 0038    Tenant-scope the invoices table (multitenant hardening P0)
--
-- 0021 left `invoices` global "by explicit decision". That decision doesn't
-- survive review: an invoice row carries a client name, a concept and real
-- amounts, and /admin/facturacion is a per-tenant admin page. With no
-- organization_id, every tenant's billing screen listed — and totalled —
-- every other tenant's invoices, and /api/admin/saas/overview reported
-- platform-wide outstanding balances as if they were the tenant's own.
--
-- Same additive pattern as 0021: ALTER TABLE ADD COLUMN with a DEFAULT,
-- backfilled to org 1 ("M&M Real Estate"), the pre-existing tenant that owns
-- every invoice created before multi-tenancy existed. App-level FK only —
-- D1/SQLite cannot add a real FK via ALTER.

ALTER TABLE invoices ADD COLUMN organization_id INTEGER NOT NULL DEFAULT 1;

UPDATE invoices SET organization_id = 1 WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS invoices_org ON invoices (organization_id, status);
