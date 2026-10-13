# Blog editorial y guías de compra

Seis guías evergreen para quien quiere comprar una vivienda, con el blog
público rediseñado para leerlas: listado con guía principal destacada y
rejilla, ficha editorial (migas, índice fijo, progreso de lectura, portada
16:9, relacionados, propiedades reales) y bloques interactivos que funcionan
de verdad. Se publican en el blog del host principal (la organización por
defecto, cuya web vive junto a la landing de INMO) y en la cuenta demo
Norte Astur.

## Las seis guías

| Slug | Título | Interactivo principal |
|---|---|---|
| `guia-comprar-vivienda` | Guía paso a paso para comprar una vivienda en España | Línea temporal + checklist |
| `gastos-impuestos-comprar-vivienda` | Gastos e impuestos al comprar una vivienda | Calculadora por comunidad y tipo |
| `que-revisar-antes-comprar-casa` | Qué revisar antes de comprar una casa: 15 aspectos | Checklist por estancias (descargable e imprimible) |
| `como-saber-vivienda-bien-precio` | Cómo saber si una vivienda está bien de precio | Gráfico de factores (ilustrativo) |
| `obra-nueva-vs-segunda-mano` | Obra nueva o segunda mano | Tabla comparativa + módulo de prioridades |
| `preguntas-antes-comprar-vivienda` | Las preguntas que debes hacer antes de comprar | Preguntas por categorías en desplegables marcables |

Cada una: 1.800–3.000 palabras, intro directa, resumen («En resumen»),
H2/H3 con anclas, tablas, avisos, FAQ, conclusión, enlaces a las otras
guías y al catálogo, CTA temático y bloque de propiedades reales. El texto
cita la norma cuando la hay (Código Civil art. 1454, Ley 5/2019, Ley de
Propiedad Horizontal art. 9.1.e y f, LOE, RD 390/2021, Ley 11/2021) y no
inventa cifras: los ejemplos numéricos del artículo 4 y el gráfico de
factores están marcados como ilustrativos.

## Dónde vive el contenido

- `server/content/guiasCompra/*.ts`: una guía por fichero (metadatos SEO,
  fecha de revisión `reviewedAt`, portada, relacionados y bloques del CMS);
  `index.ts` las exporta en orden y aporta `guiaWordCount`, `guiaImages` y
  `guiaInternalLinks`; `images.ts` es el mapa de fotografías; `types.ts`
  tiene los helpers (`p`, `h2`, `table`, `faq`, `img`…).
- `utils/compraGastos.ts`: parámetros fiscales por comunidad (ITP por
  tramos, AJD, IVA/IGIC) con `REVIEWED_AT`, fuente y marca `verified`
  (`official` o `pending`). Lo pendiente se enseña como «pendiente de
  revisión editorial» en la calculadora: nunca se presenta como confirmado.
- Bloques nuevos del CMS (`components/cms/*`, pintados por
  `components/CmsBlockRenderer.vue` y editables como JSON en
  `components/admin/CmsBlockEditor.vue` → grupo «Guías»): `keypoints`,
  `timeline`, `checklist`, `cost_calculator`, `factors_chart`,
  `comparator`, `accordion`. El bloque `image` admite `wide`, `width`,
  `height` y `credit`.
- Formato en línea de los párrafos, avisos y respuestas de FAQ
  (`utils/cmsInline.ts`): `[texto](url)` y `**negrita**`. El texto se
  escapa antes de interpretar las marcas; sólo se admiten URL relativas,
  `http(s)` y `mailto`.

## Publicación

- **Host principal** (`server/utils/blog/buyerGuides.ts`): la primera
  petición a `/api/public/blogs` o `/api/public/blogs/:slug` de la
  organización por defecto publica las guías que falten (por slug), con la
  categoría «Guías» y sin autor (el publisher del `BlogPosting` es la
  empresa). Es idempotente: lo que ya existe no se toca, así que se pueden
  editar desde Blog & CMS. Las imágenes son ficheros estáticos
  (`/demo-assets/norte-astur/blog/*.webp`).
- **Cuenta demo** (`server/demo/events/web.ts` → `createGuia`): el seed
  sube la portada y las imágenes del cuerpo al R2 de la demo, con la autora
  y la categoría de la demo, en fechas escalonadas (la guía principal es la
  más reciente).

## Blog público

- `pages/blog/index.vue`: cabecera con filtros por categoría
  (`?categoria=<slug>`, contadores reales), guía principal destacada a todo
  el ancho y rejilla 3/2/1 con imagen 16:9, categoría, título, extracto,
  tiempo de lectura y fecha. Sin carruseles.
- `pages/blog/[slug].vue` (rama CMS): migas (visuales y `BreadcrumbList`),
  categoría, H1 único, subtítulo, autor o empresa, lectura, publicado y
  actualizado, portada 16:9 con dimensiones, índice fijo con sección activa
  (`components/cms/ArticleToc.vue`; desplegable en móvil), barra de
  progreso (`components/cms/ReadingProgress.vue`), anchura de lectura con
  bloques anchos, relacionados (los que declara la guía o los últimos de la
  categoría), comentarios. SEO: title con la empresa del tenant, meta,
  canonical, OG/Twitter, `article:*`, `BlogPosting` (publisher y logo del
  tenant, fechas, `inLanguage`). El acento de los bloques toma el color de
  marca del tenant (`--cms-accent`).
- API: `/api/public/blogs` devuelve `rows` (con `readingTime`, `category`,
  `publishedAt`), `categories` y acepta `?categoria=`; `/api/public/blogs/:slug`
  añade `related`.

## Imágenes

Fotografías CC0 (Wikimedia Commons / Unsplash de la época CC0, WordPress
Photos), convertidas a WebP (portadas 1600×900, cuerpo 1600 px de ancho) en
`public/demo-assets/norte-astur/blog/` y acreditadas en
`public/demo-assets/norte-astur/CREDITOS.md`. Ninguna se repite entre
artículos y ninguna es una vivienda real de Norte Astur. Si una imagen no
tiene fotografía elegida, su entrada en `images.ts` lleva `credit:
'pendiente'`: el bloque no se pinta y la prueba unitaria lo lista.

## Pruebas

- `test/unit/guiasCompra.test.ts`: seis guías, extensión, estructura
  (resumen, H2, tabla, aviso, FAQ, conclusión, CTA, propiedades),
  interactivo principal distinto en cada una, SEO, relacionados, enlaces
  internos válidos, imágenes (16:9, 3–6 por artículo, sin repetir, sin
  pendientes), publicación en el host principal, formato en línea y
  calculadora (escala por tramos, obra nueva, Madrid).
- `tests/e2e/blog-guias.spec.ts`: API (publicación idempotente, filtro,
  relacionados), imágenes servidas en WebP, sitemap, listado, ficha
  (cabecera, portada, índice, progreso, enlaces, relacionados, JSON-LD,
  canonical, un solo H1, sin errores de consola), checklist (progreso,
  persistencia, descarga), calculadora, comparador, desplegables, gráfico y
  móvil (sin desbordes, índice desplegable).

## Pendiente de revisión editorial

Los tipos marcados `pending` en `utils/compraGastos.ts` (escalas de
Asturias, Aragón, Baleares, Cataluña, Extremadura, Castilla y León, Navarra,
AJD de Castilla-La Mancha, Comunitat Valenciana y La Rioja, IPSI de Ceuta y
Melilla) proceden de fuentes secundarias y deben confirmarse en la agencia
tributaria de cada comunidad antes de darlos por buenos; la calculadora lo
avisa. No es asesoramiento fiscal.
