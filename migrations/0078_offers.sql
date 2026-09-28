-- Migration number: 0078    FASE 23 — Offer
--
-- Offer representa una PROPUESTA ECONÓMICA NEGOCIABLE. Referencia Contact
-- real para comprador y vendedor(es) — nunca una entidad Buyer/Seller
-- paralela (el encargo lo pide explícitamente). No existe una tabla
-- PropertyContact en este proyecto (auditado: ninguna FASE anterior la
-- creó), así que qué contactos son "vendedores" de una oferta concreta lo
-- decide quien la crea, fila a fila en `offer_sellers` — no una relación de
-- propiedad global del inmueble.
--
-- `current_amount`/`current_*` en `offers` son una PROYECCIÓN del estado
-- actual (para leer sin JOIN); el histórico real, inmutable, vive en
-- `offer_revisions` — nunca se sobrescribe una revisión pasada.
CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  property_id INTEGER NOT NULL,
  property_kind TEXT NOT NULL, -- agent | developer
  buyer_contact_id INTEGER NOT NULL,
  lead_id INTEGER,
  buyer_requirement_id INTEGER,
  match_id INTEGER,
  commercial_id INTEGER,
  current_amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'eur',
  current_conditions TEXT,
  current_finance_condition TEXT,
  expiration TEXT,
  status TEXT NOT NULL DEFAULT 'draft', -- draft | submitted | countered | accepted | rejected | withdrawn | expired
  current_revision_id INTEGER,
  created_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS offers_org_status ON offers (organization_id, status);
CREATE INDEX IF NOT EXISTS offers_property ON offers (property_id, property_kind);
CREATE INDEX IF NOT EXISTS offers_buyer_contact ON offers (buyer_contact_id);
CREATE INDEX IF NOT EXISTS offers_lead ON offers (lead_id);
CREATE INDEX IF NOT EXISTS offers_commercial ON offers (commercial_id);

CREATE TABLE IF NOT EXISTS offer_sellers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  offer_id INTEGER NOT NULL,
  contact_id INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS offer_sellers_unique ON offer_sellers (offer_id, contact_id);

-- Append-only: ningún código de este proyecto hace UPDATE ni DELETE sobre
-- esta tabla — es exactamente el requisito "nunca sobrescribir 620.000 →
-- 630.000 → 625.000 perdiendo las cantidades anteriores".
CREATE TABLE IF NOT EXISTS offer_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  offer_id INTEGER NOT NULL,
  type TEXT NOT NULL, -- created | submitted | countered | accepted | rejected | withdrawn | expired
  amount REAL NOT NULL,
  currency TEXT NOT NULL,
  conditions TEXT,
  finance_condition TEXT,
  expiration TEXT,
  actor_type TEXT NOT NULL, -- buyer | seller | user | system
  actor_id INTEGER,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS offer_revisions_offer ON offer_revisions (offer_id, created_at);
