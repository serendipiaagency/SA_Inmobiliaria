-- Migration number: 0083    FASE 32 — Lead Score explicable: reglas por agencia, historial reproducible
--
-- Hasta ahora `leads.score` era un número mágico: upsertLead() le sumaba un
-- "bump" fijo (10, 25, 30…) cada vez que la persona volvía a escribir, con
-- tope en 100, sin decir nunca por qué. FASE 32 lo sustituye por una
-- puntuación basada en reglas deterministas sobre señales reales
-- (server/utils/leads/score.ts), con desglose y con historial.
--
-- Esta migración SÓLO AÑADE: no toca ni reescribe ninguna fila existente.
-- Los leads que ya tienen un `score` antiguo lo conservan tal cual; quedan
-- marcados como "sin desglose" (`score_computed_at` NULL) hasta que se
-- recalculen con las señales reales que existan en ese momento — nunca se
-- inventa un historial que no se guardó (§150).

-- Reglas por agencia (§56/§67). Sin filas = reglas por defecto del código;
-- una fila por criterio sólo cuando la agencia lo cambia (mismo patrón que
-- sla_settings). `criterion` es uno de un catálogo cerrado en código: nunca
-- una expresión libre.
CREATE TABLE IF NOT EXISTS lead_score_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  criterion TEXT NOT NULL,
  points INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 0,
  config_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS lead_score_rules_org_criterion ON lead_score_rules (organization_id, criterion);

-- Historial (§68-69): una fila sólo cuando cambia la puntuación o su
-- desglose. Guarda las reglas efectivas con las que se calculó, para que
-- "mismo lead + mismas señales + mismas reglas = mismo score" se pueda
-- comprobar después aunque la agencia haya cambiado sus reglas.
CREATE TABLE IF NOT EXISTS lead_score_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  breakdown_json TEXT NOT NULL,
  rules_json TEXT NOT NULL,
  engine_version INTEGER NOT NULL,
  reason TEXT NOT NULL, -- created | signal | rules | manual | expiry | legacy
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS lead_score_snapshots_lead ON lead_score_snapshots (organization_id, lead_id, created_at);

-- Proyección en el propio lead, para listar y ordenar sin consultas extra:
-- el desglose vigente, cuándo se calculó (NULL = puntuación heredada sin
-- desglose) y cuándo caduca la primera señal temporal ("respondió en las
-- últimas 24 h", "compra en los próximos 90 días") — el cron horario
-- recalcula sólo los que ya han caducado, nunca el tenant entero (§70).
ALTER TABLE leads ADD COLUMN score_breakdown_json TEXT;
ALTER TABLE leads ADD COLUMN score_computed_at TEXT;
ALTER TABLE leads ADD COLUMN score_expires_at TEXT;

CREATE INDEX IF NOT EXISTS leads_score_expires ON leads (score_expires_at);
