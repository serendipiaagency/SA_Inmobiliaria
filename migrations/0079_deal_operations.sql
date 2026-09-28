-- Migration number: 0079    FASE 24 — Deal Operation
--
-- Deal representa la OPERACIÓN en ejecución/cierre — distinta de Lead
-- (oportunidad) y Offer (negociación). §94 del encargo es explícito: no se
-- crea automáticamente de forma irreversible; nace de una acción real
-- ("Crear operación") sobre una Offer ya `accepted`, una por oferta
-- (índice único sobre accepted_offer_id).
--
-- Tablas nombradas `deal_operations`/`deal_operation_*`, NO `deals`: ya
-- existe una tabla `deals` (migración anterior, junto a `valuations`) — el
-- apunte plano de una venta/alquiler YA CERRADA para comisiones
-- (`pages/admin/operaciones.vue`, `deals-revenue.get.ts`), con datos y
-- consumidores reales desde antes de esta FASE. Son dos entidades
-- distintas a propósito: aquélla es un registro contable histórico sin
-- pipeline; ésta es la operación completa con etapas, comprador/vendedor
-- reales y su oferta aceptada. Al cerrar una `deal_operations`, se crea un
-- apunte en la tabla legacy `deals` (server/utils/deals/service.ts →
-- `closeDeal()`) — así los informes de comisiones ya existentes ven
-- también lo cerrado por este pipeline nuevo, sin migrar ni tocar su
-- esquema. Ver docs/deals.md.
--
-- `agreedAmount`/`currency` se copian de la Offer aceptada al crear (§103:
-- "debe ser coherente con la Offer aceptada") y no se editan sueltos.
--
-- Mismo criterio que offer_sellers (FASE 23): sin tabla PropertyContact (no
-- existe en este proyecto), así que deal_operation_sellers es la relación
-- real de quién vende en esta operación concreta, copiada de la oferta al
-- crear.
CREATE TABLE IF NOT EXISTS deal_operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  property_id INTEGER NOT NULL,
  property_kind TEXT NOT NULL, -- agent | developer
  buyer_contact_id INTEGER NOT NULL,
  accepted_offer_id INTEGER NOT NULL,
  lead_id INTEGER,
  buyer_requirement_id INTEGER,
  commercial_id INTEGER,
  stage TEXT NOT NULL DEFAULT 'accepted_offer', -- accepted_offer | reservation | deposit_contract | financing | documentation | notary | signature | closed
  status TEXT NOT NULL DEFAULT 'active', -- active | closed | cancelled
  agreed_amount REAL NOT NULL,
  currency TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  cancelled_at TEXT,
  cancel_reason TEXT,
  legacy_deal_id INTEGER, -- el apunte que este cierre creó en la tabla legacy `deals`, si lo creó
  created_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS deal_operations_accepted_offer ON deal_operations (accepted_offer_id);
CREATE INDEX IF NOT EXISTS deal_operations_org_status ON deal_operations (organization_id, status);
CREATE INDEX IF NOT EXISTS deal_operations_property ON deal_operations (property_id, property_kind);
CREATE INDEX IF NOT EXISTS deal_operations_buyer_contact ON deal_operations (buyer_contact_id);
CREATE INDEX IF NOT EXISTS deal_operations_commercial ON deal_operations (commercial_id);
CREATE INDEX IF NOT EXISTS deal_operations_stage ON deal_operations (stage);

CREATE TABLE IF NOT EXISTS deal_operation_sellers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_operation_id INTEGER NOT NULL,
  contact_id INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS deal_operation_sellers_unique ON deal_operation_sellers (deal_operation_id, contact_id);

-- Append-only, mismo principio que lead_stage_history (FASE 13): nunca se
-- sobrescribe un movimiento de etapa anterior.
CREATE TABLE IF NOT EXISTS deal_operation_stage_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  deal_operation_id INTEGER NOT NULL,
  from_stage TEXT, -- NULL en la primera fila (creación)
  to_stage TEXT NOT NULL,
  actor_type TEXT NOT NULL, -- user | system
  actor_id INTEGER,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS deal_operation_stage_history_deal ON deal_operation_stage_history (deal_operation_id, created_at);

-- §109/§126: una cita de notaría/firma es una Appointment real, no un campo
-- suelto — y así aparece en Calendar automáticamente, sin un "DealCalendar"
-- aparte. Mismo nombre de columna que ya usa `tasks.deal_id` (FASE 22,
-- migración 0077, pensada desde entonces para esta FASE) — ambas apuntan a
-- `deal_operations`, nunca a la tabla legacy `deals`. Aditiva y nullable:
-- la inmensa mayoría de citas no son de una operación.
ALTER TABLE visits ADD COLUMN deal_id INTEGER;
