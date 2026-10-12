-- Migration number: 0095    Zonas (guías de municipios, localidades y barrios de la web pública)
--
-- SOLO AÑADE: una tabla nueva, vacía, y sus índices. Ninguna fila existente se
-- reescribe ni se borra. Se despliega ANTES que el código que la usa (el
-- directorio /zonas/<región>, las guías de municipio y barrio, el bloque
-- «Zonas» de la portada y el recurso Portal Web → Zonas del panel), por la
-- lección del 2026-09-15.
--
-- Qué es: la jerarquía geográfica EDITORIAL de cada inmobiliaria (región →
-- municipio → localidad/barrio), con su texto, su foto, su SEO y los valores
-- con los que enlaza con el catálogo (municipio y barrio de las propiedades).
-- No toca `communities` (residenciales) ni las tablas de propiedades: una
-- zona se relaciona con las propiedades por sus campos de ubicación, no por
-- una clave ajena. Multi-tenant estricto: todas las filas llevan
-- organization_id y se purgan con la organización.
CREATE TABLE zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  parent_id INTEGER REFERENCES zones(id),
  kind TEXT NOT NULL DEFAULT 'municipality',          -- region | municipality | locality | neighborhood
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  area TEXT,                                           -- agrupación en el directorio (p. ej. ciudades | oriente | centro | occidente)
  subtitle TEXT,
  intro TEXT,
  sections_json TEXT NOT NULL DEFAULT '[]',            -- [{ title, text }] «Cómo es vivir aquí»
  faq_json TEXT NOT NULL DEFAULT '[]',                 -- [{ q, a }]
  image TEXT,                                          -- clave de R2 (/api/media/<clave>) o ruta estática
  gallery_json TEXT NOT NULL DEFAULT '[]',             -- [claves o rutas]
  seo_title TEXT,
  seo_description TEXT,
  lat REAL,
  lng REAL,
  zoom INTEGER,
  match_municipality TEXT,                             -- municipio con el que se filtra el catálogo (?municipality=)
  match_neighborhood TEXT,                             -- barrio/localidad con el que se filtra el catálogo (?neighborhood=)
  home_priority INTEGER NOT NULL DEFAULT 0,            -- > 0: aparece en el bloque «Zonas» de la portada, de mayor a menor
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',                -- draft | published
  reviewed_at TEXT,                                    -- última revisión editorial (AAAA-MM-DD)
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  deleted_at TEXT
);
CREATE UNIQUE INDEX zones_org_parent_slug ON zones(organization_id, parent_id, slug);
CREATE INDEX zones_org_status ON zones(organization_id, status);
CREATE INDEX zones_org_parent ON zones(organization_id, parent_id);
