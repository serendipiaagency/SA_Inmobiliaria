-- Migration number: 0028    Generic admin audit log
--
-- Every write through the admin CRUD chokepoint (server/api/admin/[resource]/*)
-- and every mutating Publication Scheduler action gets one row here: who did
-- what, to which record, when. Org-scoped like the data it describes — a
-- tenant's admin can see their own team's actions, not another tenant's.

CREATE TABLE admin_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER,
  user_id INTEGER NOT NULL,
  user_email TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id TEXT,
  detail TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX admin_audit_log_org_created ON admin_audit_log (organization_id, created_at);
CREATE INDEX admin_audit_log_resource ON admin_audit_log (resource, resource_id);
