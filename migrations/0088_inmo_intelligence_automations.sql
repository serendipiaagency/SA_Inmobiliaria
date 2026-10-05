-- Migration number: 0088    Bloque N8b — INMO Intelligence (memoria, cerebros, conocimiento, workflows) y automatizaciones reales
--
-- SOLO AÑADE: tablas nuevas, columnas nuevas (opcionales o con valor por
-- defecto) e índices. Ninguna fila existente se reescribe ni se borra. Se
-- despliega ANTES que el código que la usa (lección del 2026-09-15).
--
-- Filas de demostración de `automations` (sembradas por 0009_seed_saas.sql:
-- «Bienvenida a nuevos leads», «Recordatorio de visita»…, con contadores
-- inventados): esta migración NO las toca. La columna nueva `engine` llega con
-- valor por defecto 'legacy', así que todas las filas que ya existen quedan
-- marcadas como heredadas por el propio ADD COLUMN, sin ningún UPDATE. El
-- motor nuevo sólo ejecuta filas con engine = 'v1' (las crea el panel), y el
-- panel no deja activar una heredada; borrarlas es una acción del panel
-- (borrado lógico, `deleted_at`), nunca de una migración.
--
-- Sin FTS5: la recuperación de conocimiento es léxica en código
-- (server/utils/knowledge/search.ts). Una tabla virtual FTS5 rompería
-- `wrangler d1 export`, que el pipeline ejecuta antes de cada migración en
-- producción (D1 no exporta bases con tablas virtuales). Ver docs/inmo.md.

-- ---------------------------------------------------------------------------
-- Automatizaciones: la tabla existente, ampliada (no se crea otra)
-- ---------------------------------------------------------------------------
ALTER TABLE automations ADD COLUMN engine TEXT NOT NULL DEFAULT 'legacy'; -- legacy (demo heredada, nunca se ejecuta) | v1
ALTER TABLE automations ADD COLUMN conditions_json TEXT;
ALTER TABLE automations ADD COLUMN action_config_json TEXT;
ALTER TABLE automations ADD COLUMN created_by INTEGER; -- users.id: las acciones se ejecutan con SU organización y SUS permisos
ALTER TABLE automations ADD COLUMN cursor_id INTEGER NOT NULL DEFAULT 0; -- último evento de origen ya visto
ALTER TABLE automations ADD COLUMN active_since TEXT; -- desde cuándo está activa (una activación no recupera lo anterior)
ALTER TABLE automations ADD COLUMN error_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE automations ADD COLUMN last_error TEXT;
ALTER TABLE automations ADD COLUMN updated_at TEXT;
ALTER TABLE automations ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS automations_org_engine ON automations (organization_id, engine, enabled);

-- Lectura incremental de eventos por tipo (motor de automatizaciones).
CREATE INDEX IF NOT EXISTS activities_org_event ON activities (organization_id, event_type, id);

-- ---------------------------------------------------------------------------
-- Registro de ejecuciones: automatizaciones y workflows guiados de INMO
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workflow_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  kind TEXT NOT NULL, -- automation | inmo_workflow
  automation_id INTEGER,
  workflow_key TEXT,
  trigger TEXT,
  event_key TEXT, -- qué lo disparó: activity:123, sla_alert:45, stage_history:9, task:67
  entity_type TEXT,
  entity_id INTEGER,
  executed_as INTEGER, -- users.id con cuyos permisos se ejecutó
  status TEXT NOT NULL, -- running | waiting | ok | error | skipped | cancelled
  current_step INTEGER NOT NULL DEFAULT 0,
  state_json TEXT,
  steps_json TEXT,
  error_code TEXT,
  message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT
);
-- Un evento dispara una automatización una sola vez (reclamar-y-procesar).
CREATE UNIQUE INDEX IF NOT EXISTS workflow_runs_automation_event ON workflow_runs (automation_id, event_key) WHERE automation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS workflow_runs_org ON workflow_runs (organization_id, kind, id);
CREATE INDEX IF NOT EXISTS workflow_runs_automation ON workflow_runs (automation_id, id);
CREATE INDEX IF NOT EXISTS workflow_runs_user ON workflow_runs (organization_id, executed_as, status);

-- ---------------------------------------------------------------------------
-- Memoria de INMO: conversaciones persistentes (de cada usuario, en su agencia)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inmo_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  brain_key TEXT,
  messages_json TEXT NOT NULL DEFAULT '[]',
  state_json TEXT NOT NULL DEFAULT '{}',
  turns_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- Borrar una conversación la borra de verdad (es el historial privado de
-- quien la tuvo, no un registro del negocio): sin papelera.
CREATE INDEX IF NOT EXISTS inmo_conversations_user ON inmo_conversations (organization_id, user_id, updated_at);

-- Hechos confirmados sobre una entidad: son notas (entidad Nota, FASE 0) con
-- su origen. NULL = escrita en el panel; inmo = confirmada desde INMO;
-- automation = creada por una automatización.
ALTER TABLE notes ADD COLUMN source TEXT;
CREATE INDEX IF NOT EXISTS notes_source ON notes (organization_id, source);

-- ---------------------------------------------------------------------------
-- Cerebros de INMO: ajustes por agencia sobre los perfiles del código
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inmo_brain_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  brain_key TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  instructions TEXT, -- se AÑADEN a las del perfil
  tools_json TEXT, -- subconjunto de las herramientas del perfil (nunca más)
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS inmo_brain_settings_org_key ON inmo_brain_settings (organization_id, brain_key);

-- ---------------------------------------------------------------------------
-- Base de conocimiento de cada agencia (documentos de texto)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS knowledge_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  tags TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active | archived
  search_text TEXT NOT NULL DEFAULT '', -- título + etiquetas + cuerpo, en minúsculas y sin tildes
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS knowledge_documents_org ON knowledge_documents (organization_id, status);
