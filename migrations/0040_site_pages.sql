-- Migration number: 0040    Constructor Web — modelo de páginas por bloques
--
-- Hasta ahora `pages/demo/index.vue` era una plantilla fija: el mismo layout,
-- el mismo texto, las mismas imágenes de stock para cualquier tenant. Esta
-- migración introduce `site_pages`, la tabla que convierte esa plantilla en
-- contenido editable por bloques, uno por organización.
--
-- Dos columnas JSON deliberadamente separadas:
--   draft_json      lo que el Constructor Web edita
--   published_json  lo que sirve el sitio público (null = nunca publicada)
-- Publicar es copiar draft -> published + versión; nunca al revés. Los datos
-- dinámicos (propiedades, comunidades, blog) NUNCA viven en estas columnas —
-- los bloques solo guardan criterios de selección (ver server/utils/sitePages.ts),
-- así que un cambio en "Propiedades (web)" se refleja aquí sin re-publicar.

CREATE TABLE IF NOT EXISTS site_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  page_key TEXT NOT NULL DEFAULT 'home',
  draft_json TEXT NOT NULL DEFAULT '{"blocks":[],"seo":{}}',
  published_json TEXT,
  version INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  published_by INTEGER,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS site_pages_org_key ON site_pages (organization_id, page_key);

-- Un snapshot por cada Publish (no por cada autoguardado) — mismo patrón que
-- cms_article_versions. Base para el historial/restauración futuros.
CREATE TABLE IF NOT EXISTS site_page_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER NOT NULL REFERENCES site_pages (id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  published_by INTEGER,
  created_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS site_page_versions_page ON site_page_versions (page_id, version);

-- --------------------------------------------------------------------------
-- Seed: la página "home" de cada organización existente, reproduciendo 1:1
-- el diseño hardcodeado actual (pages/demo/index.vue) como bloques. draft y
-- published quedan idénticos en el momento de la migración — el sitio
-- público no cambia de aspecto hasta que alguien edite y publique.
-- --------------------------------------------------------------------------

INSERT INTO site_pages (organization_id, page_key, draft_json, published_json, version, published_at, published_by, created_at, updated_at)
SELECT
  id,
  'home',
  '{"blocks":[{"id":"hero","type":"hero","version":1,"content":{"eyebrow":"Real estate, elevated","title1":"Espacios que","title2":"merecen ser vividos.","subtitle":"Una selección curada de propiedades excepcionales. Comprar, alquilar o invertir, con la calma de quien elige bien.","slides":["https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=2400&q=80","https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=2400&q=80","https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=2400&q=80"],"exploreCta":"Explorar catálogo","exploreCtaTo":"/demo/properties","advisorCta":"Hablar con un asesor","advisorCtaTo":"/demo/contact-us"}},{"id":"map-teaser","type":"map-teaser","version":1,"content":{"eyebrow":"Explora por zona","title":"Encuentra tu barrio en el mapa","text":"Descubre las propiedades por ubicación, con transporte, colegios y servicios a un vistazo.","cta":"Abrir el mapa","ctaTo":"/demo/properties","pins":[{"label":"Marina","x":28,"y":42},{"label":"Downtown","x":58,"y":30},{"label":"Palm","x":44,"y":66},{"label":"Creek","x":72,"y":58}]}},{"id":"properties-featured","type":"properties","version":1,"content":{"eyebrow":"Selección","title":"Destacados","cta":"Ver selección","ctaTo":"/demo/properties","source":"dynamic","dynamicFilter":"featured","limit":4,"layout":"row"}},{"id":"properties-latest","type":"properties","version":1,"content":{"eyebrow":"Recién llegadas","title":"Últimas incorporaciones","cta":"Ver todas","ctaTo":"/demo/properties?sort=newest","source":"dynamic","dynamicFilter":"latest","limit":4,"layout":"row"}},{"id":"properties-premium","type":"properties","version":1,"content":{"eyebrow":"Colección exclusiva","title":"Propiedades Premium","cta":"Ver todas","ctaTo":"/demo/properties?sort=price_desc","source":"dynamic","dynamicFilter":"premium","limit":3,"layout":"dark-grid"}},{"id":"communities","type":"communities","version":1,"content":{"eyebrow":"Vive aquí","title":"Barrios destacados","source":"dynamic","limit":6}},{"id":"property-types","type":"property-types","version":1,"content":{"eyebrow":"Por tipo de propiedad","title":"Explora por tipo de vivienda","source":"dynamic"}},{"id":"mortgage","type":"mortgage-calculator","version":1,"content":{"eyebrow":"Planifica","title":"Calcula tu hipoteca","text":"Estima tu cuota mensual y los costes de compra en segundos."}},{"id":"properties-ai","type":"properties","version":1,"content":{"eyebrow":"Recomendado para ti","title":"La IA selecciona por rentabilidad y valor","cta":"","ctaTo":"","source":"dynamic","dynamicFilter":"recommended","limit":4,"layout":"ai-grid","badge":"IA"}},{"id":"blog-list","type":"blog-list","version":1,"content":{"eyebrow":"Journal","title":"Ideas e historias","cta":"Todos los artículos","ctaTo":"/demo/blog","source":"dynamic","limit":3}}],"seo":{"title":"M&M Real Estate — Propiedades excepcionales","description":"Marketplace curado de proyectos off-plan, ventas de segunda mano y comunidades residenciales en los Emiratos Árabes Unidos."}}',
  '{"blocks":[{"id":"hero","type":"hero","version":1,"content":{"eyebrow":"Real estate, elevated","title1":"Espacios que","title2":"merecen ser vividos.","subtitle":"Una selección curada de propiedades excepcionales. Comprar, alquilar o invertir, con la calma de quien elige bien.","slides":["https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=2400&q=80","https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=2400&q=80","https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=2400&q=80"],"exploreCta":"Explorar catálogo","exploreCtaTo":"/demo/properties","advisorCta":"Hablar con un asesor","advisorCtaTo":"/demo/contact-us"}},{"id":"map-teaser","type":"map-teaser","version":1,"content":{"eyebrow":"Explora por zona","title":"Encuentra tu barrio en el mapa","text":"Descubre las propiedades por ubicación, con transporte, colegios y servicios a un vistazo.","cta":"Abrir el mapa","ctaTo":"/demo/properties","pins":[{"label":"Marina","x":28,"y":42},{"label":"Downtown","x":58,"y":30},{"label":"Palm","x":44,"y":66},{"label":"Creek","x":72,"y":58}]}},{"id":"properties-featured","type":"properties","version":1,"content":{"eyebrow":"Selección","title":"Destacados","cta":"Ver selección","ctaTo":"/demo/properties","source":"dynamic","dynamicFilter":"featured","limit":4,"layout":"row"}},{"id":"properties-latest","type":"properties","version":1,"content":{"eyebrow":"Recién llegadas","title":"Últimas incorporaciones","cta":"Ver todas","ctaTo":"/demo/properties?sort=newest","source":"dynamic","dynamicFilter":"latest","limit":4,"layout":"row"}},{"id":"properties-premium","type":"properties","version":1,"content":{"eyebrow":"Colección exclusiva","title":"Propiedades Premium","cta":"Ver todas","ctaTo":"/demo/properties?sort=price_desc","source":"dynamic","dynamicFilter":"premium","limit":3,"layout":"dark-grid"}},{"id":"communities","type":"communities","version":1,"content":{"eyebrow":"Vive aquí","title":"Barrios destacados","source":"dynamic","limit":6}},{"id":"property-types","type":"property-types","version":1,"content":{"eyebrow":"Por tipo de propiedad","title":"Explora por tipo de vivienda","source":"dynamic"}},{"id":"mortgage","type":"mortgage-calculator","version":1,"content":{"eyebrow":"Planifica","title":"Calcula tu hipoteca","text":"Estima tu cuota mensual y los costes de compra en segundos."}},{"id":"properties-ai","type":"properties","version":1,"content":{"eyebrow":"Recomendado para ti","title":"La IA selecciona por rentabilidad y valor","cta":"","ctaTo":"","source":"dynamic","dynamicFilter":"recommended","limit":4,"layout":"ai-grid","badge":"IA"}},{"id":"blog-list","type":"blog-list","version":1,"content":{"eyebrow":"Journal","title":"Ideas e historias","cta":"Todos los artículos","ctaTo":"/demo/blog","source":"dynamic","limit":3}}],"seo":{"title":"M&M Real Estate — Propiedades excepcionales","description":"Marketplace curado de proyectos off-plan, ventas de segunda mano y comunidades residenciales en los Emiratos Árabes Unidos."}}',
  1,
  datetime('now'),
  NULL,
  datetime('now'),
  datetime('now')
FROM organizations;
