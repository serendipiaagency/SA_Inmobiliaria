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

## Rutas públicas

| Ruta | Qué enseña |
|---|---|
| `/zonas/<región>` | Directorio de la región (`components/zones/ZoneDirectory.vue`): intro editorial, buscador y filtro por área en el cliente, tarjetas fotográficas de municipios y localidades agrupadas por área, con el número **real** de viviendas publicadas de cada una. Una zona sin guía (sin `intro`) enlaza directamente al catálogo filtrado. Lo sirve `pages/zonas/[id].vue` cuando `id` no es numérico (los ids numéricos siguen siendo las comunidades/residenciales). |
| `/zonas/<región>/<municipio>` | Guía del municipio (`ZoneGuide.vue`): hero con foto, migas, subtítulo y CTA «Ver viviendas disponibles»; «Descubre la zona»; «Cómo es vivir aquí» (secciones); barrios y localidades con guía; viviendas disponibles (el catálogo real con el filtro de la zona, mismos componentes que `/propiedades`); mapa; preguntas frecuentes; zonas cercanas (las hermanas, primero las de la misma área); CTA final al catálogo filtrado. |
| `/zonas/<región>/<municipio>/<barrio>` | Guía del barrio o localidad, con la misma estructura; el catálogo se filtra por municipio **y** barrio (un «Centro» de Oviedo nunca enseña el «Centro» de Avilés). |

API (`server/api/public/zones/`): `index.get.ts` (`?region=` → región, grupos por área y total; sin región, las regiones), `[...path].get.ts` (la guía: zona, migas, hijas, cercanas, propiedades, enlace al catálogo) y `for-property.get.ts` (la guía que corresponde a una ubicación: barrio si tiene guía, si no municipio; lo usa el enlace «Descubre cómo es vivir en…» de la ficha pública, `components/zones/ZoneLink.vue`). Todas filtran por `organizationId` y sólo devuelven zonas `published` no borradas; lo demás es 404, también entre inmobiliarias.

La lógica compartida está en `server/utils/zones.ts`: árbol (`zoneTree`), rutas (`zonePath`, `resolveZonePath`), cruce con el catálogo (`zoneMatch`, `zoneCatalogUrl`), recuentos del índice de ubicaciones (`zoneCount`, nunca una cifra a mano), tarjetas (`toZoneCard`), guía de una ubicación (`zoneForLocation`), propiedades de la guía (`zoneProperties`, la misma búsqueda pública que el listado) y las zonas de la portada (`homeZones`).

## Portada, panel, SEO y demo

- **Bloque «Zonas» del Constructor Web** (`zones-grid`): las zonas publicadas con `home_priority > 0`, de mayor a menor (máx. 12), con foto, recuento real y enlace a su guía o al catálogo. Título, texto y número de tarjetas se editan en el inspector; los datos llegan en `homeData.zones` (`/api/public/home` y la vista previa del Constructor).
- **Panel**: Portal Web → Zonas (`/admin/zones`, recurso genérico `zones` en `server/utils/adminResources.ts`, con borrado suave y relación «Zona superior»). Crear una zona no requiere código. Ayuda in-app: entrada `zones`.
- **SEO**: title y meta propios o derivados del nombre, canonical absoluto, Open Graph con la foto, `BreadcrumbList` con las migas reales, un solo H1 y SSR. El sitemap (`server/routes/sitemap.xml.ts`) lista las regiones y las zonas con guía publicadas; los borradores y las zonas sin guía no entran.
- **Demo Norte Astur** (`server/demo/dataset/zonas.ts`, `zonasBarrios.ts`, evento `server/demo/events/zonas.ts`): la región Asturias, 21 municipios en cuatro áreas (ciudades, oriente, centro, occidente), seis con guía completa (Gijón, Oviedo, Avilés, Llanes, Ribadesella, Villaviciosa) y 15 barrios de Gijón y Oviedo con contenido propio. Reglas editoriales: enfoque residencial, sin precios medios, rentabilidades, demografía ni tiempos de trayecto; sin «lugar ideal», «ubicación privilegiada» ni «entorno inmejorable». Las comprueba `test/unit/zones.test.ts`; `tests/e2e/zonas.spec.ts` cubre directorio, guías, catálogo, portada, ficha, sitemap, móvil y aislamiento entre inmobiliarias.

## Despliegue

La migración `0095_zonas.sql` fue en su propio PR (#180) y se aplicó en
producción antes del código que lee la tabla (lección del 2026-09-15, ver
CLAUDE.md).
