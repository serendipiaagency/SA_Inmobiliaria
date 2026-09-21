-- Migration number: 0065    Centro de Comunicaciones (WhatsApp Business + llamadas)
--
-- Bandeja de conversaciones de WhatsApp por agencia, con el proveedor detrás
-- de una capa propia (server/utils/comms/): Meta WhatsApp Cloud API (mensajes
-- y, donde Meta lo permite, llamadas) o Twilio (mensajes). Cada tabla lleva
-- organization_id y se acota con requireOrgScope() como el resto del panel.
--
--   comms_settings        ajustes por agencia (prefijo por defecto, política
--                         con contactos desconocidos, avisos internos).
--   comms_channels        un número de WhatsApp conectado. Las credenciales
--                         (token de acceso / auth token, app secret) van
--                         CIFRADAS con COMMS_CREDENTIALS_ENCRYPTION_KEY, nunca
--                         en claro, igual que publication_channel_credentials.
--                         (provider, external_phone_id) es único: es la clave
--                         por la que un webhook entrante encuentra su agencia.
--   comms_contacts        el teléfono con el que se habla, normalizado a
--                         E.164, vinculado (o no) a un cliente o un lead.
--                         Guarda el consentimiento y el permiso de llamada
--                         (Meta: temporal 7 días o permanente).
--   comms_conversations   un hilo por (canal, contacto). Lleva el contador de
--                         no leídos y last_inbound_at, de donde sale la
--                         ventana de 24 h de atención al cliente de WhatsApp.
--   comms_messages        cada mensaje, entrante, saliente o nota interna
--                         (direction = note: nunca se envía). external_id es
--                         el id del proveedor (wamid.… / SM…) y es único
--                         cuando existe: un webhook repetido no duplica.
--   comms_calls           cada llamada (WhatsApp Calling o registrada a
--                         mano) con resultado, notas y la visita de
--                         seguimiento que se creó desde ella.
--   comms_templates       plantillas aprobadas del número (para escribir
--                         fuera de la ventana de 24 h). Se registran a mano o
--                         se sincronizan desde Meta.
--   comms_webhook_events  idempotencia de webhooks: (provider, event_key)
--                         único, mismo patrón que stripe_webhook_events.
--
-- Aditiva: sólo tablas nuevas. Ninguna fila existente cambia.

CREATE TABLE comms_settings (
  organization_id INTEGER PRIMARY KEY,
  default_country_prefix TEXT,
  unknown_contact_policy TEXT NOT NULL DEFAULT 'ask',
  notify_internal INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE comms_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  phone_e164 TEXT NOT NULL,
  external_phone_id TEXT NOT NULL,
  business_account_id TEXT,
  credentials_ciphertext TEXT NOT NULL,
  credentials_iv TEXT NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  is_default INTEGER NOT NULL DEFAULT 0,
  calling_status TEXT NOT NULL DEFAULT 'unknown',
  calling_checked_at TEXT,
  calling_note TEXT,
  last_error TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX comms_channels_provider_phone ON comms_channels (provider, external_phone_id);
CREATE INDEX comms_channels_org ON comms_channels (organization_id, status);

CREATE TABLE comms_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  phone_e164 TEXT NOT NULL,
  wa_id TEXT,
  display_name TEXT,
  client_id INTEGER,
  lead_id INTEGER,
  consent_status TEXT NOT NULL DEFAULT 'unknown',
  consent_source TEXT,
  consent_updated_at TEXT,
  call_permission_status TEXT NOT NULL DEFAULT 'unknown',
  call_permission_expires_at TEXT,
  call_permission_updated_at TEXT,
  last_inbound_at TEXT,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX comms_contacts_org_phone ON comms_contacts (organization_id, phone_e164);
CREATE INDEX comms_contacts_client ON comms_contacts (client_id);
CREATE INDEX comms_contacts_lead ON comms_contacts (lead_id);

CREATE TABLE comms_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  channel_id INTEGER NOT NULL,
  contact_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  assigned_agent_id INTEGER,
  property_id INTEGER,
  last_message_at TEXT,
  last_message_preview TEXT,
  last_inbound_at TEXT,
  unread_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX comms_conversations_channel_contact ON comms_conversations (channel_id, contact_id);
CREATE INDEX comms_conversations_org_last ON comms_conversations (organization_id, status, last_message_at);
CREATE INDEX comms_conversations_contact ON comms_conversations (contact_id);

CREATE TABLE comms_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  conversation_id INTEGER NOT NULL,
  direction TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  body TEXT,
  media_key TEXT,
  media_url TEXT,
  media_mime TEXT,
  media_filename TEXT,
  template_name TEXT,
  template_language TEXT,
  template_params_json TEXT,
  property_id INTEGER,
  external_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  error_code TEXT,
  error_message TEXT,
  sent_by_user_id INTEGER,
  provider_timestamp TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX comms_messages_external ON comms_messages (external_id);
CREATE INDEX comms_messages_conversation ON comms_messages (conversation_id, id);
CREATE INDEX comms_messages_org_created ON comms_messages (organization_id, created_at);

CREATE TABLE comms_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  channel_id INTEGER,
  contact_id INTEGER NOT NULL,
  conversation_id INTEGER,
  direction TEXT NOT NULL,
  provider TEXT NOT NULL,
  external_id TEXT,
  status TEXT NOT NULL DEFAULT 'initiated',
  outcome TEXT,
  notes TEXT,
  agent_id INTEGER,
  user_id INTEGER,
  property_id INTEGER,
  follow_up_visit_id INTEGER,
  started_at TEXT,
  answered_at TEXT,
  ended_at TEXT,
  duration_seconds INTEGER,
  error_message TEXT,
  session_json TEXT,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX comms_calls_external ON comms_calls (external_id);
CREATE INDEX comms_calls_org_created ON comms_calls (organization_id, created_at);
CREATE INDEX comms_calls_contact ON comms_calls (contact_id, created_at);
CREATE INDEX comms_calls_channel_status ON comms_calls (channel_id, status);

CREATE TABLE comms_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  channel_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'es',
  category TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unknown',
  external_id TEXT,
  synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX comms_templates_channel_name_lang ON comms_templates (channel_id, name, language);
CREATE INDEX comms_templates_org ON comms_templates (organization_id);

CREATE TABLE comms_webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  event_key TEXT NOT NULL,
  organization_id INTEGER,
  channel_id INTEGER,
  payload_json TEXT NOT NULL,
  processed_ok INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  received_at TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX comms_webhook_events_key ON comms_webhook_events (provider, event_key);
CREATE INDEX comms_webhook_events_org ON comms_webhook_events (organization_id, received_at);
