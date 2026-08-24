# Migración de `/demo/*` a URLs limpias (Prompt 9)

Este documento cubre la migración de todas las rutas públicas del portal
inmobiliario, hasta ahora bajo el prefijo `/demo`, a URLs limpias en la raíz
del sitio — y todo lo que dependía de esas rutas (redirecciones, sitemap,
canonical/OG, datos estructurados, menús, widgets, emails, Stripe, QR de
Asset Export Studio) — junto con la separación de los datos demo de una
instalación productiva real.

## Por qué existía `/demo` en primer lugar

La migración 0033 movió el portal inmobiliario de `/` a `/demo/*` para dejar
sitio en `/` a una futura landing SaaS de la propia plataforma (para vender
la plataforma a inmobiliarias, no para mostrarla a los clientes finales de
una inmobiliaria). Esa landing ya existe (`pages/index.vue`). El problema:
`/demo` nunca debía ser una URL pública permanente — es un artefacto interno
de esa reestructuración, indexado por buscadores y grabado en QR codes/PDFs
generados desde entonces.

## Resolución del conflicto en "/"

`/` tiene ahora dos comportamientos según el dominio de la petición
(`server/api/public/tenant.get.ts` expone `isCustomDomain`,
`layouts/root.vue` decide el layout en tiempo de ejecución porque
`definePageMeta` no puede ser condicional):

- **Host primario** (`*.workers.dev`, `localhost`, `PRIMARY_DOMAIN`) → `/`
  sigue mostrando la landing SaaS de la plataforma, sin cambios.
- **Dominio propio de una organización** (`organizations.domain` resuelto por
  `server/middleware/00.tenant.ts`) → `/` muestra el portal inmobiliario de
  esa organización — antes solo disponible en `/demo`.

## Inventario de redirecciones

Todas las redirecciones son **301 (permanente)**, implementadas en
`server/middleware/00.legacy-demo-redirect.ts`. El middleware cubre **dos
generaciones** de URLs antiguas — las originales de antes de la migración
0033, y las `/demo/*` que esa migración introdujo — y las lleva directamente
a la URL limpia final en un solo salto (sin encadenar redirecciones).

| Ruta original (pre-0033) | Ruta `/demo/*` (0033 → hoy) | URL limpia nueva |
|---|---|---|
| `/properties` | `/demo/properties` | `/propiedades` |
| `/property-details/:slug` | `/demo/property-details/:slug` | `/propiedades/:slug` |
| `/blog` *(ya era `/blog`)* | `/demo/blog` | `/blog` |
| `/blog/:slug` | `/demo/blog/:slug` | `/blog/:slug` |
| — | `/demo/blog/autor/:slug` | `/blog/autor/:slug` |
| — | `/demo/blog/preview/:id` *(admin)* | `/admin/cms/articles/preview/:id` |
| `/leadership` | `/demo/leadership` | `/equipo` |
| `/leadership/:slug` | `/demo/leadership/:slug` | `/equipo/:slug` |
| `/mapa` *(ya era `/mapa`)* | `/demo/mapa` | `/mapa` |
| `/community/:id` | `/demo/community/:id` | `/zonas/:id` |
| `/project-community` | `/demo/project-community` | `/zonas` |
| `/developer-list` | `/demo/developer-list` | `/promotoras` |
| `/about-us` | `/demo/about-us` | `/nosotros` |
| `/contact-us` | `/demo/contact-us` | `/contacto` |
| `/compare` | `/demo/compare` | `/comparar` |
| `/favoritos` *(ya era `/favoritos`)* | `/demo/favoritos` | `/favoritos` |
| `/complain` | `/demo/complain` | `/reclamaciones` |
| `/visitor` | `/demo/visitor` | `/visitante` |
| `/vendors/registration` (y `/vendors`) | `/demo/vendors/registration` | `/proveedores/registro` |
| `/privacy` | `/demo/privacy` | `/privacidad` |
| `/terms` | `/demo/terms` | `/terminos` |
| — | `/demo/mi-cuenta` | `/mi-cuenta` |
| — | `/demo/referir/:code` | `/referir/:code` |
| — | `/demo` (raíz) | `/` *(según dominio — ver arriba)* |

Notas:

- Las tres rutas donde la ruta original pre-0033 **ya coincidía** con la URL
  limpia final (`/blog`, `/mapa`, `/favoritos`) están deliberadamente
  ausentes del middleware: no hay nada que redirigir, la página en vivo ya
  sirve exactamente esa URL.
- `/demo/blog/preview/:id` no es una URL pública — es una herramienta de
  vista previa para el editor de artículos, protegida por `middleware:
  'admin'`. Se ha movido junto a su editor
  (`pages/admin/cms/articles/[id].vue`) en vez de bajo `/blog`.

## Referencias internas actualizadas

Todo enlace interno que apuntaba a una ruta `/demo/*` se ha actualizado a la
URL limpia correspondiente:

- **Menús y navegación**: `components/site/SiteHeader.vue`,
  `components/site/SiteFooter.vue` (extraídos de `layouts/default.vue`),
  navegación móvil incluida.
- **Widgets embebibles**: `pages/embed.vue`,
  `components/EmbedMiniMap.client.vue` (esta última tenía además un bug
  preexistente — enlazaba a `/property-details/:slug` sin ningún prefijo en
  absoluto — corregido a `/propiedades/:slug`).
- **Emails y contenido generado por IA**: `server/utils/ai.ts` ya no firma
  contenido como "M&M Real Estate" fijo; usa el nombre real de la
  organización que generó la petición.
- **Stripe**: `server/api/admin/saas/deposits.post.ts` (`successUrl`/
  `cancelUrl` de los checkouts de fianza) apunta a `/mi-cuenta`.
- **Asset Export Studio / códigos QR**: `server/utils/assetExport/bindings.ts`
  construye la URL de destino del QR con el dominio propio de la
  organización cuando lo tiene configurado (`tenant.website`), en vez de con
  el origin de la petición admin que generó el dossier.
- **Sitemap**: `server/routes/sitemap.xml.ts` — rutas estáticas y todos los
  builders dinámicos (propiedades, blog, equipo, zonas, autores) usan las
  URLs limpias.
- **Panel admin**: el enlace "Ver sitio público" (`layouts/admin.vue`) y el
  botón "Abrir sitio publicado" del constructor de sitios
  (`pages/admin/site-builder/index.vue`) ahora construyen la URL con el
  dominio propio de la organización activa (`organizations.domain`,
  expuesto por `/api/admin/active-org-info`) en vez de un `/demo` fijo — y
  se deshabilitan con una explicación cuando la organización todavía no
  tiene un dominio configurado.
- **Página de error/404** (`error.vue`): enlaces y `clearError({redirect})`
  apuntan a `/` (según dominio) y `/propiedades`; el título usa el nombre
  real de la organización en vez de uno fijo.

## Impacto en SEO

- **Redirecciones 301, no 302**: preservan el link equity acumulado por las
  URLs `/demo/*` ya indexadas por buscadores.
- **Un solo salto**: las URLs originales de antes de la migración 0033 (que
  todavía pueden estar en enlaces externos, marcadores o QR/PDF muy
  antiguos) redirigen directamente a la URL final limpia, sin pasar por
  `/demo/*` como paso intermedio.
- **Sitemap**: `server/routes/sitemap.xml.ts` solo emite URLs limpias.
  Nunca ha incluido rutas `/admin/*` ni privadas — eso no cambia con esta
  migración, pero se confirma explícitamente en `tests/e2e/domain-routing.spec.ts`.
- **Canonical / Open Graph / datos estructurados**: se generan a partir de
  `useRequestURL()`/rutas de página en tiempo de petición
  (`composables/useSeo.ts`, cada página con `seoHead()`), así que siguen
  automáticamente la URL limpia de cada página sin cambios adicionales — no
  había ninguna URL `/demo` hardcodeada en esa capa.
- **Títulos dinámicos por organización**: varias páginas (`/propiedades`,
  `/mapa`, `/comparar`, `/favoritos`, `/mi-cuenta`, `/embed`, `/login`,
  `/privacidad`, `/terminos`, `error.vue`) usaban "M&M Real Estate" fijo en
  el `<title>` — se han hecho dinámicos vía `useTenant()`, igual que
  `/privacidad` y `/terminos` ahora citan la empresa, CIF, dirección, email
  y teléfono reales de cada organización (`organizations.legal_*`, migración
  0045) en vez de datos de la organización demo.

## Separación de datos demo / productivos

**El seed demo no se ha tocado ni se toca automáticamente.** Las migraciones
0009, 0015, 0021, 0024, 0025 y 0040 crean la organización #2 ("Skyline
Estates") y datos de CRM ficticios (leads, clientes, visitas, citas) como
parte del ledger de migraciones compartido — una vez aplicada, una migración
no puede editarse retroactivamente sin romper la validación de checksums de
`wrangler d1 migrations apply` / `npm run migrations:check` en cualquier
entorno donde ya se haya aplicado.

En vez de eso:

- **`scripts/purge-demo-data.mjs`** — script nuevo, **de invocación manual
  únicamente**, nunca ejecutado por CI, por el deploy ni por ninguna
  migración. Introspecciona el esquema real de la base de datos (no una
  lista de tablas mantenida a mano, que quedaría desactualizada), cuenta las
  filas de la organización objetivo (por defecto la #2) en cada tabla, y
  solo borra algo si se invoca explícitamente con `--yes`. Por defecto
  apunta a la D1 local; requiere `--remote` explícito para tocar producción.
  Ver la cabecera del propio archivo para el uso completo.
- **Una instalación productiva realmente nueva** (solo migraciones
  aplicadas, sin haber corrido nunca los seeds de desarrollo) **no contiene
  clientes ni leads ficticios de la organización #1** — el catálogo base de
  propiedades que las migraciones 0004/0006/0011 referencian por slug nunca
  se inserta ahí; esas migraciones son `UPDATE`s sobre filas que no existen
  en una base nueva, así que no hacen nada. Los leads/clientes/citas
  ficticios solo existen para la organización demo #2, y solo si la cadena
  completa de migraciones de seed (0009 en adelante) se aplicó — que es
  exactamente lo que `scripts/purge-demo-data.mjs` permite revertir para un
  lanzamiento real.

## Seguido pendiente (no bloqueante)

- El copy de marketing de `i18n/messages.ts` fuera de los `<title>` de
  página (textos largos de secciones como "Nosotros") todavía puede
  contener frases redactadas pensando en el catálogo demo (Emiratos Árabes
  Unidos, AED como moneda de referencia en ejemplos). Los títulos de página
  y los textos legales ya son dinámicos por organización; una revisión más
  profunda del copy editorial por locale queda fuera del alcance de esta
  migración de URLs.
- Los títulos de las páginas del panel admin (`pages/admin/*.vue`, ~30
  páginas) todavía usan "M&M Real Estate" fijo en el `<title>` del navegador
  — de impacto bajo (solo lo ve el propio staff de cada organización en su
  pestaña del navegador, nunca es público ni indexable) pero pendiente de
  una pasada de branding dinámico igual que se hizo en las páginas públicas.
