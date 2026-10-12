# Home corporativa: la inmobiliaria detrás del catálogo

Bloques del Constructor Web con los que la portada de cada inmobiliaria deja
de ser un portal genérico de viviendas y cuenta quién está detrás: la agencia,
sus argumentos, su equipo y sus oficinas. Todo se configura por inmobiliaria
desde el Constructor (activar, textos, imágenes, orden, cifras, comerciales y
oficinas destacados, CTAs y enlaces) y nada se inventa: las cifras salen de
los datos reales de la cuenta y una oficina sin horario o sin coordenadas
simplemente no enseña horario ni mapa.

## Modelo: oficinas en la web (migración 0096)

La tabla `offices` (migraciones 0086 y 0090) tenía nombre, código, contacto,
dirección, zona horaria, estado y foto, pero nada de lo que una web necesita
para presentar una oficina. La migración `0096_oficinas_en_la_web.sql` **sólo
añade** columnas:

| Columna | Qué guarda |
|---|---|
| `description` | Presentación corta de la oficina. `NULL` = no se enseña. |
| `opening_hours` | Horario de atención, texto libre («L-V 9:30-18:30 · S 10:00-14:00»). `NULL` = no se enseña. |
| `lat`, `lng` | Centro del mapa de la oficina. Sin coordenadas no hay mapa ni `geo` en los datos estructurados; la dirección sigue enlazando a un mapa externo. |
| `is_main` | `1` en la oficina principal (una por inmobiliaria). |
| `show_on_web` | `0` retira la oficina de la web sin tocar el CRM. Por defecto `1`. |
| `sort_order` | Orden en la web (menor primero). |

Ninguna fila existente cambia de comportamiento: los textos y coordenadas
quedan en `NULL`, `is_main` en 0, `show_on_web` en 1 (toda oficina activa ya
salía en el pie de página) y `sort_order` en 0.

## Los bloques (Constructor Web, categoría «Empresa»)

| Bloque | Qué pinta | Qué guarda el bloque | Qué llega en vivo |
|---|---|---|---|
| `about-agency` «Conoce nuestra inmobiliaria» (`AboutAgencyBlock.vue`) | Composición editorial: texto y botón, fotografía corporativa grande y, si las hay, hasta cuatro cifras en columna. | `eyebrow`, `title`, `text`, `cta`/`ctaTo`, `image`/`imageAlt`, `stats` (claves ordenadas), `label<Clave>` (texto propio de una cifra en vivo), `customValue1…4`/`customLabel1…4` (cifras propias). | `homeData.company.stats`: recuentos reales (`server/utils/publicCompany.ts`). Una cifra en vivo a 0 no se pinta; sin cifras, la foto ocupa su sitio. |
| `trust-points` «Nuestra experiencia, tu tranquilidad» (`TrustPointsBlock.vue`) | Tres o cuatro argumentos numerados con filete (sin iconos), introducción y fotografía opcional. | `eyebrow`, `title`, `text`, `image`/`imageAlt`, `count` (3 o 4), `point1…4Title/Text`. | Nada: los argumentos los escribe la agencia. |
| `offices` «Nuestras oficinas» (`OfficesBlock.vue`) | Con una oficina o `layout: editorial`: foto, ficha (nombre, «Oficina principal», presentación, dirección, teléfono, email, horario, «Cómo llegar») y mapa; con varias, cuadrícula adaptable. | `eyebrow`, `title`, `text`, `cta`/`ctaTo`, `source` (`dynamic`/`manual`), `manualIds`, `limit`, `layout` (`auto`/`editorial`/`grid`), `cardFields`. | `homeData.offices`: la proyección pública (`server/utils/publicOffices.ts`), la principal primero. Sin horario, foto o coordenadas, ese dato no se enseña. |
| `team` con `layout: editorial` (`TeamBlock.vue`) | «Conoce a nuestro equipo»: texto y botón a la izquierda, retratos verticales con nombre, puesto, una línea de la presentación y «Ver perfil» hacia `/equipo/<slug>`. | Lo de siempre más `text` y `cardFields.description`. No hay un segundo bloque de equipo: es un diseño más del existente (`cards` y `compact` siguen igual). | `homeData.team` (proyección pública de comerciales). |

Las cifras en vivo (`utils/corporateBlocks.ts`, `LIVE_STAT_KEYS`): comerciales
publicados, oficinas publicadas, viviendas del catálogo público (la misma
búsqueda que `/propiedades` sin filtros), guías de zona publicadas e idiomas
del equipo. El bloque sólo guarda qué cifras enseñar y con qué texto; el
recuento se hace al servir la portada. Las cifras propias existen para datos
que la plataforma no puede contar (años de experiencia, operaciones) y las
escribe cada agencia bajo su responsabilidad; el preset no trae ninguna.

Todo es por inquilino: el contenido vive en la página `home` de cada
organización (`site_pages`), los recuentos y las oficinas se filtran por
`organizationId` y la demo sólo toca su propia portada.

## Datos públicos de la empresa y de las oficinas

- `server/utils/publicCompany.ts`: `publicCompanyProfile()` (nombre comercial,
  logotipo, teléfono, WhatsApp, email, web, dirección legal y redes, de
  `organizations` y del Brand Kit) y `companyStats()`.
- `server/utils/publicOffices.ts`: `PUBLIC_OFFICE_COLUMNS` /
  `NEVER_PUBLIC_OFFICE_COLUMNS` (toda columna clasificada, como en
  `publicTeam.ts`; lo exige `test/unit/publicOfficesProjection.test.ts`) y
  `publicOffices()`: activas, con `show_on_web`, no borradas; la principal
  primero, después por `sort_order` y nombre. Cada una lleva `mapsUrl`
  («Cómo llegar»: por coordenadas o, si no, por la dirección).
- Llegan en `/api/public/home` y en la vista previa del Constructor como
  `offices` y `company` (perfil + `stats`); `/api/public/offices` sirve la
  página `/oficinas`.

## Página /oficinas y SEO local

`pages/oficinas.vue`: todas las oficinas publicadas con foto, presentación,
dirección, horario, contacto, «Cómo llegar» y un mapa con todas las que tienen
coordenadas; canonical, Open Graph y entrada en el sitemap cuando hay alguna.

Datos estructurados (`utils/corporateSchema.ts`): la inmobiliaria como
`RealEstateAgent` (`@id` `…/#organization`, nombre, url, logo, teléfono,
email, `sameAs` con las redes del Brand Kit, dirección y `geo` de la oficina
principal) con cada oficina como `department` (otro `RealEstateAgent` con su
`PostalAddress`, teléfono, email, foto, descripción y `geo`). Se emite en la
portada y en `/oficinas`. En la ficha pública de un comercial, un `Person`
con `worksFor` y sólo lo que su ficha ya enseña. Nunca se emiten valoraciones,
reseñas, fecha de fundación ni horarios: el horario es texto libre y no se
puede convertir en `openingHoursSpecification` sin inventar.

## Panel

CRM → Oficinas (`adminResources.offices`) incorpora los campos de la web:
presentación, horario, latitud/longitud, oficina principal, mostrar en la web
y orden; `validateOfficeOrTeam` comprueba rangos y los interruptores 0/1.
Ayuda in-app: entradas `site-builder` y `oficinas`.

## Demo Norte Astur

`server/demo/dataset/company.ts` completa las tres oficinas (presentación,
horario, centro del municipio como coordenadas —las direcciones son de
demostración—, Oviedo Centro como principal) y `server/demo/events/web.ts`
reorganiza la portada: hero, promociones, **Conoce nuestra inmobiliaria**
(cifras en vivo: asesores, oficinas, viviendas publicadas), mapa, colección,
comunidades, servicios, zonas, **equipo (editorial)**, **oficinas**,
**experiencia**, hipoteca, formulario, blog y CTA. Ninguna sección existente
cambia de contenido; `test/unit/demoSeed.test.ts` fija el orden y comprueba
que las cifras de la demo son sólo en vivo.

## Pruebas

`test/unit/corporateBlocks.test.ts` (cifras, argumentos, presets sin cifras,
JSON-LD sin campos inventados), `test/unit/publicOfficesProjection.test.ts`,
`test/unit/siteBuilderRegistry.test.ts` (registro completo de los tres
bloques) y `tests/e2e/home-corporativa.spec.ts` (bloques en la portada de la
inmobiliaria A con una oficina real, cifras reales, enlaces a los perfiles,
`/oficinas`, datos estructurados, móvil y aislamiento).

## Despliegue

La migración `0096_oficinas_en_la_web.sql` fue en su propio PR y se aplicó en
producción antes del código que lee las columnas (lección del 2026-09-15, ver
CLAUDE.md).
