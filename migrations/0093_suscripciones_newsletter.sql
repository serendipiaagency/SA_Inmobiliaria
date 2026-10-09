-- Migration number: 0093    Suscripciones al newsletter de cada inmobiliaria
--
-- SOLO AÑADE: una tabla nueva, vacía, y sus índices. Ninguna fila existente
-- se reescribe ni se borra. Se despliega ANTES que el código que la usa (el
-- formulario «Suscríbete» del pie de la web y el listado del panel), por la
-- lección del 2026-09-15: el esquema primero, el código que lo lee después.
--
-- Una fila por persona y empresa (índice único organization_id + email): quien
-- vuelve a apuntarse no se duplica, se reactiva. No hay envíos automáticos:
-- esto guarda quién quiere recibir novedades y con qué consentimiento; enviar
-- algo es otra cosa, que hoy no existe.
--
-- Estados:
--   subscribed   — apuntado, con la política de privacidad aceptada (consent_at).
--   pending      — doble opt-in: apuntado pero sin confirmar aún su correo. El
--                  esquema lo admite para cuando haya email de confirmación; hoy
--                  no se crea ninguna fila así.
--   unsubscribed — se dio de baja (o la empresa lo dio de baja a petición suya).
--
-- Tokens: nunca en claro. Sólo su SHA-256 (como password_reset_tokens). El de
-- baja va en el enlace «darse de baja»; el de confirmación, en el email del
-- doble opt-in. Quien lea la base de datos no puede dar de baja ni confirmar a
-- nadie con lo que hay aquí.

CREATE TABLE newsletter_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  email TEXT NOT NULL, -- normalizado: sin espacios y en minúsculas
  status TEXT NOT NULL DEFAULT 'subscribed', -- subscribed | pending | unsubscribed
  source TEXT NOT NULL DEFAULT 'footer', -- dónde se apuntó (hoy, el pie de la web)
  locale TEXT, -- idioma de la web cuando se apuntó (es, en, …)
  consent_at TEXT NOT NULL, -- cuándo aceptó la política de privacidad
  unsubscribe_token_hash TEXT, -- SHA-256 (hex) del token del enlace de baja
  confirm_token_hash TEXT, -- SHA-256 (hex) del token del email de confirmación (doble opt-in) | NULL
  confirm_expires_at TEXT, -- caducidad de ese token | NULL
  confirmed_at TEXT, -- cuándo confirmó su correo (doble opt-in) | NULL
  unsubscribed_at TEXT, -- cuándo se dio de baja | NULL
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX newsletter_subscriptions_org_email ON newsletter_subscriptions (organization_id, email);
CREATE INDEX newsletter_subscriptions_org_status ON newsletter_subscriptions (organization_id, status, created_at);
CREATE UNIQUE INDEX newsletter_subscriptions_unsubscribe_token ON newsletter_subscriptions (unsubscribe_token_hash);
CREATE UNIQUE INDEX newsletter_subscriptions_confirm_token ON newsletter_subscriptions (confirm_token_hash);
