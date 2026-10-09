-- Migration number: 0092    Ajustes de la web (cookies) y dos datos públicos del inmueble
--
-- SOLO AÑADE: una tabla nueva y dos columnas opcionales. Ninguna fila
-- existente se reescribe ni se borra: las columnas nuevas quedan en NULL y la
-- tabla nueva empieza vacía, que es exactamente lo que la web enseña hoy (sin
-- analítica ni píxel; sin situación ni modalidad de alquiler declaradas). Se
-- despliega ANTES que el código que la usa (lección del 2026-09-15).
--
-- 1) site_settings — ajustes de la web pública de cada inmobiliaria que no son
--    diseño (el diseño vive en site_pages / Brand Kit). De momento, los
--    proveedores sujetos a consentimiento de cookies: un ID de Google
--    Analytics 4 y un ID de píxel de Meta. Sin fila = sin proveedores. Son
--    identificadores públicos (acaban en el HTML del visitante), no secretos.
--    consent_revision sube cuando la agencia pide volver a solicitar el
--    consentimiento a quien ya decidió.

CREATE TABLE site_settings (
  organization_id INTEGER PRIMARY KEY,
  ga4_measurement_id TEXT, -- G-XXXXXXXXXX | NULL (sin Google Analytics)
  meta_pixel_id TEXT, -- sólo dígitos | NULL (sin píxel de Meta)
  consent_revision INTEGER NOT NULL DEFAULT 0,
  updated_by INTEGER,
  updated_at TEXT NOT NULL DEFAULT ''
);

-- 2) Situación de la vivienda que la agencia decide ANUNCIAR (filtro público
--    del catálogo). Es un dato distinto de property_legal_economics
--    .occupancy_status, que es interno y nunca sale a la web: aquí sólo hay lo
--    que la agencia marca expresamente para publicar.
ALTER TABLE property_details ADD COLUMN listing_situation TEXT; -- bare_ownership | rented | occupied | NULL (nada que anunciar)

-- 3) Modalidad de un alquiler (filtro «Tipo de alquiler» del catálogo).
ALTER TABLE property_details ADD COLUMN rental_term TEXT; -- long_term | seasonal | NULL (sin indicar)
