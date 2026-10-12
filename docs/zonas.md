# Zonas: guías de municipios, localidades y barrios

Jerarquía geográfica **editorial** de cada inmobiliaria (región → municipio →
localidad/barrio) que la web pública enseña como guías de zona al estilo de
las *neighborhood guides*: un directorio por región (`/zonas/<región>`), una
página por municipio (`/zonas/<región>/<municipio>`) y, cuando hay contenido
propio, una por barrio (`/zonas/<región>/<municipio>/<barrio>`), además del
bloque «Zonas» de la portada del Constructor Web.

## Modelo (`zones`, migración 0095)

| Columna | Qué guarda |
|---|---|
| `organization_id` | Inmobiliaria propietaria. Multi-tenant estricto: cada consulta filtra por ella. |
| `parent_id` | Zona superior (región → municipio → barrio). `NULL` en la región. |
| `kind` | `region`, `municipality`, `locality` o `neighborhood`. Una localidad no es un municipio (Candás está en Carreño, Luanco en Gozón). |
| `slug`, `name` | URL y nombre. El slug es único dentro de su zona superior. |
| `area` | Agrupación del directorio (p. ej. `ciudades`, `oriente`, `centro`, `occidente`). |
| `subtitle`, `intro`, `sections_json`, `faq_json` | La guía: subtítulo del hero, «Descubre la zona», secciones de «Cómo es vivir aquí» (`[{ title, text }]`) y preguntas frecuentes (`[{ q, a }]`). |
| `image`, `gallery_json` | Foto principal (clave de R2 o ruta estática) y galería. |
| `seo_title`, `seo_description` | Cabecera SEO; si faltan, se derivan del nombre. |
| `lat`, `lng`, `zoom` | Centro del mapa de la zona. |
| `match_municipality`, `match_neighborhood` | Con qué valores se filtra el catálogo (`/propiedades?municipality=…&neighborhood=…`) y se cuentan las propiedades reales. |
| `home_priority`, `sort_order` | Posición en el bloque de la portada (0 = no sale) y en el directorio. |
| `status`, `reviewed_at` | `draft` o `published`; fecha de la última revisión editorial. |

No sustituye a `communities` (residenciales) ni añade columnas a las tablas
de propiedades: una zona se relaciona con las propiedades por sus campos de
ubicación (`city`/`municipality`, `community`/`neighborhood`), a través del
índice de ubicaciones del catálogo.

## Despliegue

La migración va en su propio PR y se aplica en producción antes del código
que lee la tabla (lección del 2026-09-15, ver CLAUDE.md). El resto (API
pública, páginas, bloque de la portada, recurso del panel, siembra de la demo)
se documenta aquí cuando se publique.
