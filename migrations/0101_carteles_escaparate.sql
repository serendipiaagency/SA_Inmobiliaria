-- Migration number: 0101    Carteles de escaparate: plantillas, piezas y renders
--
-- SOLO AÑADE tres tablas nuevas, vacías, y sus índices. Ninguna fila existente
-- se reescribe ni se borra. Se despliega ANTES que el código que las usa (el
-- módulo «Carteles de escaparate» del panel), por la lección del 2026-09-15:
-- el esquema primero, el código que lo lee después.
--
-- Es un módulo INDEPENDIENTE (decisión del propietario, Cola 20) para componer
-- carteles de escaparate y folletos de una propiedad y exportarlos a PDF. Está
-- separado de Asset Export Studio aunque comparta el editor de bloques y el
-- renderizador pdf-lib como piezas de bajo nivel. Sólo PDF por ahora (la
-- exportación a imagen depende de activar Browser Rendering en Cloudflare).
--
-- `structure_json` es el mismo formato de documento del editor de bloques
-- (páginas con elementos posicionados y su binding a datos de Property Core).
-- `asset_kind` + `asset_id` apuntan a developer_properties o agent_properties
-- (dos tablas planas distintas), así que no puede ser una FK única.
-- Multi-tenant por `organization_id`, como el resto. `organization_id` NULL en
-- una plantilla = plantilla de sistema de sólo lectura (la agencia la duplica
-- para editarla).

CREATE TABLE poster_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER, -- NULL = plantilla de sistema (sólo lectura)
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'escaparate', -- estilo (escaparate | folleto | …)
  format_key TEXT NOT NULL, -- formato del cartel (p. ej. poster_a3_portrait)
  is_system INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft', -- draft | published
  structure_json TEXT NOT NULL DEFAULT '{"pages":[]}', -- documento del editor de bloques
  duplicated_from_id INTEGER, -- plantilla de sistema de la que se copió | NULL
  created_by INTEGER, -- users.id | NULL
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX poster_templates_org ON poster_templates (organization_id, updated_at);
CREATE INDEX poster_templates_format ON poster_templates (format_key);

-- Una pieza: una plantilla aplicada a una propiedad concreta.
CREATE TABLE poster_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  template_id INTEGER, -- poster_templates.id (de partida) | NULL
  asset_kind TEXT NOT NULL, -- 'developer' | 'agent'
  asset_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  format_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', -- draft | ready
  structure_json TEXT NOT NULL DEFAULT '{"pages":[]}',
  created_by INTEGER, -- users.id | NULL
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX poster_projects_org ON poster_projects (organization_id, updated_at);
CREATE INDEX poster_projects_asset ON poster_projects (asset_kind, asset_id);

-- Un render: el PDF generado de una pieza, guardado en R2.
CREATE TABLE poster_renders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  format_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'rendering', -- rendering | completed | failed
  r2_key TEXT, -- clave del PDF en R2 (MEDIA) | NULL mientras no está
  file_size_bytes INTEGER,
  error_message TEXT,
  validation_json TEXT, -- resultado de la validación post-render | NULL
  created_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX poster_renders_project ON poster_renders (project_id, created_at);
CREATE INDEX poster_renders_org ON poster_renders (organization_id, status);
