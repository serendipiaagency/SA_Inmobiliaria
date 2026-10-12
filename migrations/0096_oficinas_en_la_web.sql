-- Migration number: 0096    Oficinas en la web: descripción, horario, coordenadas, oficina principal, visibilidad y orden
--
-- SOLO AÑADE columnas a `offices`. Ninguna fila existente se reescribe ni se
-- borra: las de texto y las coordenadas quedan en NULL («sin dato») y las
-- numéricas toman un valor por defecto que no cambia nada de lo que hoy se
-- enseña (`is_main` 0, `show_on_web` 1 —toda oficina activa ya salía en el
-- pie—, `sort_order` 0). Se despliega ANTES que el código que la lee (lección
-- del 2026-09-15).
--
-- Para qué: el bloque «Nuestras oficinas» de la portada, la página /oficinas y
-- los datos estructurados de SEO local (RealEstateAgent / LocalBusiness) de la
-- web de cada inmobiliaria necesitan de cada oficina lo que hasta ahora no
-- tenía dónde guardarse: un texto de presentación, el horario de atención, el
-- centro del mapa, cuál es la oficina principal, si se publica en la web y en
-- qué orden. Nada de esto se inventa: si está en NULL, la web no lo enseña.

ALTER TABLE offices ADD COLUMN description TEXT;                         -- presentación corta de la oficina | NULL
ALTER TABLE offices ADD COLUMN opening_hours TEXT;                       -- horario de atención, texto libre («L-V 9:30-18:30 · S 10:00-14:00») | NULL
ALTER TABLE offices ADD COLUMN lat REAL;                                 -- latitud del centro del mapa | NULL (sin mapa)
ALTER TABLE offices ADD COLUMN lng REAL;                                 -- longitud del centro del mapa | NULL (sin mapa)
ALTER TABLE offices ADD COLUMN is_main INTEGER NOT NULL DEFAULT 0;       -- 1 = oficina principal (una por inmobiliaria)
ALTER TABLE offices ADD COLUMN show_on_web INTEGER NOT NULL DEFAULT 1;   -- 0 = no se publica en la web (sigue existiendo en el CRM)
ALTER TABLE offices ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;    -- orden en la web (menor primero)
