-- Migration number: 0047    Ficha completa de Comercial (sobre team_members) + asignación de propiedades
--
-- 1. team_members gets the fields the new "Comerciales" profile needs, on
--    top of what already exists there (name/slug/email/phone/position/
--    description/experience/languages/specialties/image/socials/schedule
--    config) — all nullable or safely defaulted, so existing rows keep
--    working exactly as before with these empty.
--      - Laboral: employee_code, department, office_name, manager_id (self
--        FK, "reporta a"), hire_date, contract_type, employment_status
--        (defaults 'active' — every existing agent keeps showing as active).
--      - Comercial: zones, property_types — JSON arrays, same storage
--        pattern as developer_properties.payment_plan; specialties and
--        languages already existed as free text and are reused, not
--        duplicated under a new name.
--      - Contacto: whatsapp (email/phone already existed).
--      - Web: show_on_web defaults to 1 (true) specifically so every
--        existing agent keeps appearing on the public team page exactly as
--        it does today — this migration must not silently unpublish
--        anyone. sort_order defaults 0 (existing insertion order via id
--        still applies as the tiebreak).
--
-- 2. team_member_documents: internal-only file attachments (contracts,
--    certifications…) — a new, empty-by-default table, never exposed by
--    any public endpoint.
--
-- 3. agent_id on developer_properties and agent_properties: the property↔
--    commercial assignment relationship neither table had before. Nullable
--    — existing properties keep working unassigned.

ALTER TABLE team_members ADD COLUMN employee_code TEXT;
ALTER TABLE team_members ADD COLUMN department TEXT;
ALTER TABLE team_members ADD COLUMN office_name TEXT;
ALTER TABLE team_members ADD COLUMN manager_id INTEGER;
ALTER TABLE team_members ADD COLUMN hire_date TEXT;
ALTER TABLE team_members ADD COLUMN contract_type TEXT;
ALTER TABLE team_members ADD COLUMN employment_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE team_members ADD COLUMN working_hours TEXT;
ALTER TABLE team_members ADD COLUMN zones TEXT;
ALTER TABLE team_members ADD COLUMN property_types TEXT;
ALTER TABLE team_members ADD COLUMN whatsapp TEXT;
ALTER TABLE team_members ADD COLUMN show_on_web INTEGER NOT NULL DEFAULT 1;
ALTER TABLE team_members ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

CREATE TABLE team_member_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL DEFAULT 1,
  team_member_id INTEGER NOT NULL,
  file_key TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX team_member_documents_member ON team_member_documents (team_member_id);
CREATE INDEX team_member_documents_org ON team_member_documents (organization_id);

ALTER TABLE developer_properties ADD COLUMN agent_id INTEGER;
ALTER TABLE agent_properties ADD COLUMN agent_id INTEGER;
