-- Migration number: 0100    Newsletter: plantillas y campañas de cada inmobiliaria
--
-- SOLO AÑADE: dos tablas nuevas, vacías, y sus índices. Ninguna fila existente
-- se reescribe ni se borra. Se despliega ANTES que el código que las usa (el
-- módulo «Newsletter» del panel, dentro de «Comunicación y mensajes»), por la
-- lección del 2026-09-15: el esquema primero, el código que lo lee después.
--
-- Son el borrador y la plantilla de un boletín: el texto y los bloques que la
-- agencia redacta con el editor, con su marca. NO envían nada por sí mismas:
-- el envío masivo real no existe todavía (decisión del propietario); una
-- campaña se redacta, se previsualiza y se EXPORTA (su HTML y la lista de
-- suscriptores) para enviarla con la herramienta de la agencia. Los
-- suscriptores viven en `newsletter_subscriptions` (migración 0093); aquí sólo
-- se guarda lo que se escribe, nunca a quién ni un envío.
--
-- `content_json` es el mismo formato de bloques del editor del CMS. Multi-tenant
-- por `organization_id`, como el resto.

CREATE TABLE newsletter_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '', -- asunto sugerido del email
  content_json TEXT NOT NULL DEFAULT '[]', -- bloques del editor (mismo formato que el CMS)
  created_by INTEGER, -- usuario que la creó (users.id) | NULL
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX newsletter_templates_org ON newsletter_templates (organization_id, updated_at);

CREATE TABLE newsletter_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  name TEXT NOT NULL, -- nombre interno de la campaña
  subject TEXT NOT NULL DEFAULT '', -- asunto del email
  content_json TEXT NOT NULL DEFAULT '[]', -- bloques del editor
  status TEXT NOT NULL DEFAULT 'draft', -- draft | ready | exported
  segment TEXT NOT NULL DEFAULT 'subscribed', -- a quién va (hoy, los suscritos)
  recipient_count INTEGER, -- nº de suscriptores en la última exportación | NULL
  last_exported_at TEXT, -- cuándo se exportó por última vez | NULL
  created_by INTEGER, -- users.id | NULL
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX newsletter_campaigns_org_status ON newsletter_campaigns (organization_id, status, created_at);
