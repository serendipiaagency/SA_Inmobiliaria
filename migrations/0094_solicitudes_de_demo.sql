-- Migration number: 0094    Solicitudes de demostración de la landing de INMO
--
-- SOLO AÑADE: una tabla nueva, vacía, y sus índices. Ninguna fila existente se
-- reescribe ni se borra. Se despliega ANTES que el código que la usa (el
-- formulario «Solicitar demo» de la landing comercial y su bandeja en
-- Sistema → Solicitudes de demo), por la lección del 2026-09-15.
--
-- Es una tabla DE PLATAFORMA, no de una inmobiliaria: hasta ahora las
-- solicitudes de demo de la landing acababan como leads en el CRM de la
-- organización 1 (la del host principal), sin registrar el consentimiento y
-- sin avisar a quien administra la plataforma. Por eso no lleva
-- organization_id: sólo la leen los super admins.

CREATE TABLE platform_demo_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL, -- normalizado: sin espacios y en minúsculas
  company TEXT NOT NULL,
  phone TEXT, -- opcional
  team_size TEXT, -- solo | 2-5 | 6-15 | 16+ | NULL (sin indicar)
  interest TEXT, -- qué quiere mejorar primero (texto corto, elegido de una lista)
  message TEXT, -- opcional
  locale TEXT, -- idioma de la landing al enviar (es, en, …)
  consent_at TEXT NOT NULL, -- cuándo aceptó que se usen sus datos para responder
  status TEXT NOT NULL DEFAULT 'new', -- new | contacted | closed
  notes TEXT, -- notas internas de quien atiende la solicitud
  request_id TEXT, -- id de la petición HTTP (trazabilidad con email_log)
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX platform_demo_requests_status ON platform_demo_requests (status, created_at);
CREATE INDEX platform_demo_requests_email ON platform_demo_requests (email);
