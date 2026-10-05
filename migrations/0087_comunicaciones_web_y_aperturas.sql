-- Migration number: 0087    Núcleo N8a — formularios y chat web como hilos, Contact guardado en el hilo, enlaces personales a fichas
--
-- Bloque N8a del megaprompt «Núcleo inmobiliario» (docs/auditoria-nucleo-megaprompt.md,
-- FASES 29 y 32). SOLO AÑADE: tres tablas nuevas, tres columnas opcionales o
-- con valor por defecto y sus índices. Ninguna fila existente se reescribe ni
-- se borra. Se despliega ANTES que el código que la usa (lección del
-- 2026-09-15): el código de N8a va en un commit posterior.

-- ---------------------------------------------------------------------------
-- FASE 29 — formularios y chat web como hilos de la bandeja de Comunicaciones
-- ---------------------------------------------------------------------------
-- Un hilo web no es un hilo de WhatsApp: no tiene número de la agencia
-- (comms_channels) ni teléfono obligatorio (comms_contacts), así que vive en
-- su propia tabla y la bandeja los lista juntos. Cada hilo guarda el Contact,
-- el Lead y la Property que se conocen al crearlo (vínculo guardado, nunca
-- deducido al leer).
CREATE TABLE comms_web_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  kind TEXT NOT NULL,                       -- form | chat
  status TEXT NOT NULL DEFAULT 'open',      -- open | pending | closed
  assigned_agent_id INTEGER,                -- team_members.id
  contact_id INTEGER,                       -- contacts.id
  lead_id INTEGER,                          -- leads.id
  property_id INTEGER,
  property_kind TEXT,                       -- agent | developer
  visitor_name TEXT,
  visitor_email TEXT,
  visitor_phone TEXT,
  form_type TEXT,                           -- último formulario: contact | lead_form | visit_request | visitor | referral
  page_url TEXT,
  session_token_hash TEXT,                  -- chat: SHA-256 del token opaco del visitante (el token nunca se guarda)
  session_expires_at TEXT,
  last_message_at TEXT,
  last_message_preview TEXT,
  last_inbound_at TEXT,
  unread_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX comms_web_threads_org_last ON comms_web_threads(organization_id, status, last_message_at);
CREATE INDEX comms_web_threads_org_updated ON comms_web_threads(organization_id, updated_at);
CREATE INDEX comms_web_threads_contact ON comms_web_threads(organization_id, contact_id);
CREATE INDEX comms_web_threads_lead ON comms_web_threads(organization_id, lead_id);
CREATE UNIQUE INDEX comms_web_threads_session ON comms_web_threads(session_token_hash) WHERE session_token_hash IS NOT NULL;

CREATE TABLE comms_web_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  thread_id INTEGER NOT NULL,
  direction TEXT NOT NULL,                  -- in | out | note
  via TEXT NOT NULL,                        -- form | chat | email | note
  body TEXT,
  fields_json TEXT,                         -- formulario: los campos de texto enviados (nunca ficheros)
  property_id INTEGER,                      -- ficha compartida en este mensaje
  property_kind TEXT,
  status TEXT NOT NULL DEFAULT 'received',  -- received | sent | queued | failed
  error_message TEXT,
  email_log_id INTEGER,                     -- respuesta por email: su fila de email_log (estado real de entrega)
  sent_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX comms_web_messages_thread ON comms_web_messages(thread_id, id);
CREATE INDEX comms_web_messages_org ON comms_web_messages(organization_id, created_at);

-- El Contact (contacts.id) de un hilo de WhatsApp, guardado cuando se conoce
-- (antes se deducía en cada lectura desde comms_contacts → leads/clients).
-- NULL en las filas existentes: se rellena la próxima vez que se abre o se
-- vincula el hilo; mientras tanto el código sigue deduciéndolo.
ALTER TABLE comms_conversations ADD COLUMN crm_contact_id INTEGER;
CREATE INDEX comms_conversations_crm_contact ON comms_conversations(organization_id, crm_contact_id);

-- Chat web en la web pública, activable por agencia (apagado por defecto).
ALTER TABLE comms_settings ADD COLUMN web_chat_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE comms_settings ADD COLUMN web_chat_greeting TEXT;

-- ---------------------------------------------------------------------------
-- FASE 32 — enlaces personales a una ficha (señal «abrió fichas» del Lead Score)
-- ---------------------------------------------------------------------------
-- Una ficha enviada por email o por el chat web lleva un enlace personal
-- (/propiedades/<slug>?f=<token>). Una apertura sólo cuenta si llega por ese
-- enlace y la registra el navegador al mostrar la ficha. Se guarda el hash
-- del token, nunca el token.
CREATE TABLE property_share_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL,
  property_kind TEXT NOT NULL,              -- developer (sólo obra nueva tiene ficha pública)
  property_id INTEGER NOT NULL,
  contact_id INTEGER,                       -- contacts.id de quien recibe el enlace
  lead_id INTEGER,
  channel TEXT NOT NULL,                    -- email | chat
  web_message_id INTEGER,                   -- comms_web_messages.id del envío
  created_by INTEGER,
  open_count INTEGER NOT NULL DEFAULT 0,
  first_opened_at TEXT,
  last_opened_at TEXT,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX property_share_links_token ON property_share_links(token_hash);
CREATE INDEX property_share_links_lead ON property_share_links(organization_id, lead_id);
CREATE INDEX property_share_links_contact ON property_share_links(organization_id, contact_id);
