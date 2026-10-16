# Constructor Web

Arquitectura del editor visual del Portal Web (`/admin/site-builder`) y de
`site_pages`, la tabla que reemplaza la plantilla fija que era
`pages/demo/index.vue`.

## El principio de diseño

**Una sola fuente de renderizado.** `components/site-builder/SiteBlockRenderer.vue`
es el único componente que convierte un array de bloques en HTML. Lo usan,
sin fork, tanto la página pública (`pages/index.vue`, rama `isPortal`,
`mode="production"`) como el lienzo del builder (`pages/admin/site-builder/canvas.vue`,
`mode="builder"` o `"preview"`). Si un bloque se ve distinto en el builder que
en producción, es un bug de este componente, no un caso a soportar con dos
implementaciones.

**Los datos dinámicos nunca se guardan en el bloque.** Un bloque de
Propiedades no contiene propiedades — contiene un criterio (`dynamicFilter`,
`limit`, `layout`). Las filas reales de `developer_properties`,
`communities` y `blogs` se resuelven en cada render contra `/api/public/home`
(pública) o `/api/admin/site-pages/preview-data` (builder, con la sesión del
admin). Editar una propiedad en "Propiedades (web)" se refleja en la landing
al instante, sin volver a entrar al builder ni publicar — porque no hay nada
que republicar: el bloque nunca tuvo esos datos.

**Borrador y publicado son columnas independientes.** `site_pages.draft_json`
es lo que el builder edita y autoguarda. `site_pages.published_json` es lo
único que sirve el sitio público. Publicar es una copia explícita
(`POST .../publish`) — nunca implícita al guardar.

## El modelo de datos

```
site_pages
├─ id
├─ organizationId     ← el tenant dueño (tenantPolicy: direct, igual que el resto del CRUD)
├─ pageKey             una de utils/siteBuilder/pages.ts: home, propiedades, ficha-propiedad, nosotros, servicios, contacto, blog
├─ draftJson            { blocks: SiteBlock[], seo: {title, description}, styles?: {fontHeading, fontBody, buttonRadius} }
├─ publishedJson         mismo shape, o null si nunca se publicó
├─ version               se incrementa en cada Publish
├─ publishedAt, publishedBy
└─ createdAt, updatedAt

site_page_versions      ← un snapshot por Publish (no por autoguardado)
├─ id, pageId, version, snapshotJson, publishedBy, createdAt
```

`site_page_versions` **no tiene `organizationId` propio**: cuelga de
`page_id`. La frontera entre inquilinos en el historial es, por tanto,
`getOrCreateSitePage()`, que resuelve la fila desde la sesión; las versiones
se filtran después por el id de esa fila y nunca por nada que venga del
cliente. Importa porque los contadores de versión son por organización —
**todas las agencias tienen una "versión 1"**, así que una consulta que
olvidara el `pageId` devolvería la primera que encontrase.

Un `SiteBlock` es `{ id, type, version, content, style?, visibility?, nodeStyles? }`.
El orden en el array ES el orden de la página — no hay un campo `order` que
mantener sincronizado. `visibility` es `{desktop?, tablet?, mobile?}`;
ausente = visible en todos. `nodeStyles` son los estilos por elemento del
editor visual (ver «Edición directa» más abajo), saneados en el servidor.

No hay id-en-URL para `site_pages`: cada endpoint de `/api/admin/site-pages/*`
resuelve la fila únicamente a partir de `requireOrgScope()` (la sesión) más
`pageKey`. No existe una forma de pedir "la página de otro tenant" —
`test/unit/sitePages.crossTenant.test.ts` y el bloque de
`tests/e2e/cross-tenant.spec.ts` sobre el Constructor Web prueban esto contra
dos tenants reales.

## Bloques disponibles hoy

`hero`, `map-teaser`, `properties` (con `layout: row | dark-grid | ai-grid`),
`communities`, `property-types`, `mortgage-calculator`, `energy-efficiency`
(sólo en la Ficha de propiedad, ver «Ficha de propiedad: descripción,
«Atendido por», eficiencia energética y secciones sin datos»), `blog-list`,
`team` (con `layout: cards | compact | editorial`), `lead-form`, `book-visit`, `text`, `cta`,
y los corporativos `about-agency`, `trust-points` y `offices` (categoría
«Empresa», ver docs/home-corporativa.md): la inmobiliaria detrás del
catálogo, con cifras reales de la cuenta y las oficinas publicadas en vivo.

Un preset puede limitarse a unas páginas con `pages` (`presetsForPage()`): la
biblioteca sólo lo ofrece ahí.

El **chat de la web** (núcleo N8a) no es un bloque: es un ajuste por agencia
(Comunicaciones → Configuración) y aparece en todas las páginas de la web
pública, no sólo en la portada (`components/WebChatWidget.vue`, ver
docs/communications.md). El bloque `lead-form` envía `form: 'lead_form'` para
que su hilo de la bandeja se etiquete «Formulario de captación». El
catálogo — con su icono de categoría y su contenido por defecto — vive en
`composables/useSiteBuilderRegistry.ts` (`BLOCK_PRESETS`).

Añadir un bloque nuevo es: una entrada en `BLOCK_PRESETS`; un componente en
`components/site-builder/blocks/*.vue` (renderer, usado tal cual en
producción y en el lienzo); una rama en `SiteBlockRenderer.vue`; un
componente en `components/site-builder/inspectors/*.vue` (su propio Block
Inspector, ver más abajo) registrado en `BLOCK_INSPECTORS`; su etiqueta en
`BLOCK_TYPE_LABELS`, su caso en `blockSubtitle()` y su miniatura en
`SectionPreview.vue`. Nada más del builder necesita tocarse — ese es el punto
del registro.

**Ninguna de esas siete piezas da un error rojo si falta**: sin rama en el
renderizador el bloque sale como «Tipo de bloque desconocido»; sin inspector
el panel derecho se queda vacío; sin subtítulo dos bloques del mismo tipo son
indistinguibles en la lista de Estructura; sin miniatura la biblioteca enseña
un rectángulo gris. Por eso `test/unit/siteBuilderRegistry.test.ts` las exige
todas, y avisa además de componentes o inspectores huérfanos.

### Bloques con efecto real

`lead-form` y `book-visit` son los únicos que **escriben**: el primero crea un
lead en el CRM (vía `/api/public/contact`, el mismo camino ya limitado por IP
que usa la página de Contacto — no se añadió un endpoint nuevo), el segundo
reserva un hueco en la agenda de un comercial (vía `BookAppointmentModal`, el
mismo que usa su ficha pública).

Los dos reciben `mode` desde `SiteBlockRenderer` y **se bloquean fuera de
producción**. El lienzo ya intercepta el clic, pero **Vista previa dispara
handlers de verdad** — es exactamente para lo que existe—, así que sin ese
bloqueo revisar la portada antes de publicarla llenaría el CRM de leads
inventados y la agenda de citas falsas. El bloqueo corta la acción en el
handler, no sólo con un `disabled` en el botón: un formulario se envía también
con Enter desde un campo de texto.

Un bloque nuevo que haga POST/PUT/DELETE y no declare ese efecto rompe la
prueba del registro.

**Decisión de alcance: cabecera y pie de página quedan fuera de este bloque.**
`layouts/default.vue` los renderiza igual para *todas* las páginas del sitio
(no solo home) — off-plan, blog, contacto, etc. Convertirlos en bloques de la
página "home" habría sido una regresión arquitectónica (el resto de páginas
dejaría de tener cabecera/pie, o habría que duplicar el layout). Editar
cabecera/pie es una funcionalidad real y con demanda propia, pero es un
proyecto distinto — un "Site Settings" a nivel de tenant, no a nivel de
página — y se deja fuera deliberadamente en vez de forzarlo aquí a medias.

**Decisión de alcance: "fuente manual" de propiedades/comunidades ya tiene
UI.** El bloque de Propiedades y el de Comunidades exponen
`source: 'dynamic' | 'manual'` en su sección "Datos" — `manual` guarda
`manualIds: number[]` (nunca las filas), resueltas en vivo contra
`/api/admin/site-pages/preview-data` (builder) o `/api/public/home`
(pública), exactamente igual que `dynamicFilter`. El selector es una lista
con checkboxes sobre el catálogo real del tenant — sin buscador todavía; con
catálogos muy grandes eso sería la siguiente mejora natural.

**Decisión de alcance deliberadamente diferida: tipos de bloque con modelo de
datos propio.** Vídeo, Planos/Floor Plans, Redes sociales, Testimonios, FAQ,
Buscador de propiedades y un mapa interactivo real (con zoom/estilo/cluster
de una librería de mapas) no existen todavía como tipos de bloque. Cada uno
necesita su propio esquema de contenido, su propio renderer de producción y
—en el caso de planos/testimonios— su propia gestión de archivos, no solo un
inspector nuevo sobre algo que ya se renderiza. La arquitectura de este
capítulo (registro `BLOCK_PRESETS` + `BLOCK_INSPECTORS`, un `SiteBlock` por
tipo) está pensada exactamente para que añadir cada uno de estos sea trabajo
localizado — un preset, un renderer, un inspector — y no una reescritura,
pero se deja fuera de esta entrega para no enviar siete tipos de bloque a
medio verificar. Cabecera/pie como bloque tampoco se aborda aquí, por la
misma razón de alcance arquitectónico ya explicada arriba.

## El lienzo: por qué un `<iframe>` real

El requisito era "breakpoints reales", no "una vista de escritorio escalada
con CSS". `pages/admin/site-builder/canvas.vue` se carga dentro de un
`<iframe>` cuyo `width` en píxeles el shell fija exactamente al ancho
*lógico* del dispositivo elegido — `DEVICE_WIDTH` en
`pages/admin/site-builder/index.vue`: desktop 1440, tablet 768, mobile 390.
Un iframe abre su propio *browsing context* con su propio viewport — así que
las media queries de Tailwind evalúan de verdad contra ese ancho, no una
ilusión visual. Estos tres números no son arbitrarios: este proyecto no
sobreescribe `screens` en `tailwind.config.js`, así que usa los breakpoints
de serie de Tailwind (`sm` 640 / `md` 768 / `lg` 1024 / `xl` 1280 / `2xl`
1536) — tablet (768) es exactamente `md`; desktop (1440) cae por encima de
`lg`; mobile (390) cae muy por debajo de `sm`.

El shell (`pages/admin/site-builder/index.vue`) es dueño del array `blocks`
reactivo — la única fuente de verdad. Cada cambio se serializa y se manda al
iframe por `postMessage` (`source: 'sa-builder-shell'`); el iframe reporta
selección/hover hacia arriba (`source: 'sa-builder-canvas'`). Ambos lados
comprueban `event.origin === window.location.origin` antes de aceptar un
mensaje.

### Ajustar al área disponible + zoom

El ancho lógico del `<iframe>` (1440/768/390) nunca cambia — eso es lo que
mantiene los breakpoints reales. Lo que se adapta al espacio disponible es
la presentación *visual*: el `<main>` del canvas mide su propio tamaño con
un `ResizeObserver`, calcula una escala (`autoScale` = ancho disponible /
ancho lógico del dispositivo, acotada a [0.25, 1]) y la aplica con
`transform: scale()` sobre un contenedor cuyo tamaño real en el layout es el
del dispositivo (para que el iframe siga teniendo ese ancho lógico), envuelto
en una caja exterior del tamaño ya escalado (para que el `<main>` con
`overflow-auto` reserve el hueco correcto y centre el conjunto). El
`ResizeObserver` es lo único que dispara el recálculo — contraer/expandir
cualquiera de los dos paneles laterales (Estructura o Inspector, ambos
colapsables al mismo patrón: tira de `w-11` con un control para reabrir,
preferencia de sesión en `sessionStorage`, nunca se pierde la selección ni el
scroll) o redimensionar la ventana lo disparan solos, sin watchers
específicos para cada caso.

El zoom manual (50/60/75/90/100/125 %, más "Ajustar" = automático) solo
cambia qué número alimenta esa misma fórmula de escala — nunca toca el ancho
lógico del iframe ni el CSS que ve la web publicada. Por diseño, un zoom
manual por encima del que cabría automáticamente puede producir scroll
horizontal dentro del `<main>`: es la única situación en la que aparece, y es
intencional (el usuario pidió verlo más grande).

## Panel "Estructura", biblioteca de secciones y edición desde el lienzo

El panel izquierdo (`pages/admin/site-builder/index.vue`) muestra una tarjeta
por bloque — número, nombre y un subtítulo real generado por
`blockSubtitle()` (`composables/useSiteBuilderRegistry.ts`, p. ej. "4
propiedades · Fila") — en vez de una lista plana donde varios bloques del
mismo tipo son indistinguibles entre sí. Debajo, la lista "Páginas" abre
cada página de la web en el editor (ver «Páginas» más abajo); la Estructura
es siempre la de la página abierta.

**"+ Añadir sección aquí"** aparece tanto entre las tarjetas de la Estructura
como entre los bloques renderizados en el propio lienzo
(`SiteBlockRenderer.vue`, solo en `mode="builder"`) — ambas vías insertan en
la posición exacta señalada, vía `insertAtIndex` en el shell, no "después de
la selección actual" ni "al final". El hueco entre bloques usa un margen
negativo para no ocupar espacio en el layout cuando no está en hover; eso lo
deja geométricamente superpuesto con el bloque vecino, así que necesita un
`z-index` explícito — sin él, el bloque (pintado después en el DOM) se queda
con los eventos de puntero y el hover nunca llega al botón de insertar.

**Toolbar flotante sobre el bloque seleccionado**: en el lienzo, seleccionar
un bloque muestra una barra flotante (subir/bajar/añadir debajo/duplicar/
ocultar/eliminar) anclada a su esquina superior derecha —
`[data-block-toolbar]` dentro del mismo `<div>` envolvente que ya bloquea la
navegación (ver más abajo). Como ese wrapper intercepta el clic en fase de
*captura* antes de que llegue a sus hijos, el propio toolbar necesita una
excepción explícita en `wrapperAttrs()`: si el clic viene de dentro de
`[data-block-toolbar]`, el interceptor no hace nada y deja que el botón
reciba su propio evento con normalidad — sin esa excepción, ninguno de sus
botones sería clicable.

Estas acciones del lienzo (insertar, mover, duplicar, ocultar, eliminar)
viajan al shell por el mismo canal `postMessage` que ya existía para
selección/hover — `pages/admin/site-builder/canvas.vue` las reenvía tal
cual, y el shell (dueño único de `blocks`) ejecuta la mutación real y vuelve
a mandar el estado. Insertar un bloque nuevo también dispara un mensaje
`scroll-to` dedicado hacia el iframe para llevarlo a la vista, además de
hacer scroll al mismo elemento dentro de la lista de Estructura — así
añadir una sección no solo la inserta, la deja visible y seleccionada de
inmediato, lista para editar.

**Biblioteca de secciones**: un panel lateral que ocupa el hueco del
Inspector (mutuamente excluyente con él, nunca los dos abiertos a la vez),
no un modal a pantalla completa — la Estructura y el lienzo siguen visibles
mientras se elige qué añadir. Busca por texto o filtra por categoría
(`BLOCK_CATEGORIES` del registro, más un "Recomendados" curado a mano vía
`RECOMMENDED_PRESET_IDS`), y guarda "Usados recientemente" y "Favoritos" en
`localStorage` — una preferencia de este navegador, no un dato de la
organización, así que no tiene API ni columna propia. Cada tarjeta
(`components/site-builder/shell/SectionCard.vue`) muestra una miniatura real
de la disposición (`SectionPreview.vue`: rectángulos abstractos fieles al
`type`/`layout` del preset, no una foto ni una captura inventada) en vez de
solo icono y texto.

**Deliberadamente no se amplió `BLOCK_PRESETS`** a un catálogo mucho más
grande solo para llenar la biblioteca visualmente — el catálogo real (9
tipos, ver más abajo) es el que existe hoy; los tipos con modelo de datos
propio (Testimonios, FAQ, Vídeo, etc.) siguen en la lista de "Decisión de
alcance deliberadamente diferida" de más arriba.

## Páginas

El catálogo vive en `utils/siteBuilder/pages.ts` (`SITE_PAGES`) y es la
única lista: la usan el panel «Páginas» del editor, `requireValidPageKey()`
(cualquier otra clave es un 404) y las páginas públicas. Cada página es una
fila propia de `site_pages` (`organizationId` + `pageKey`), con su borrador,
su publicación y su historial — lo mismo que ya tenía Inicio.

| Clave | Página | Dirección | Clase |
|---|---|---|---|
| `home` | Inicio | `/` | portada (sólo secciones) |
| `propiedades` | Propiedades | `/propiedades` | funcional · `properties-listing` |
| `ficha-propiedad` | Ficha de propiedad | `/propiedades/:slug` | funcional · `property-detail` |
| `nosotros` | Nosotros | `/nosotros` | contenido |
| `servicios` | Servicios | `/servicios` | contenido (nueva) |
| `contacto` | Contacto | `/contacto` | contenido |
| `blog` | Blog | `/blog` | funcional · `blog-index` |

**Siembra.** La primera vez que se abre una página, `getOrCreateSitePage()`
crea su borrador con `seedPageBlocks()`: lo que la web ya enseña en esa
dirección hecho secciones (Nosotros: los textos de `i18n/messages.ts` en un
bloque Texto y sus dos botones en una Llamada a la acción; Contacto: el
formulario como Formulario de captación, que crea un lead real igual que el
de antes). Servicios no existía y empieza con una estructura de ejemplo.
Inicio sigue empezando vacía.

**Zona dinámica.** Las páginas funcionales llevan un bloque `page-core`
(`{ core: 'properties-listing' | 'property-detail' | 'blog-index' }`): el
núcleo que se rellena solo. `validatePageDocument(doc, pageKey)` exige
exactamente uno, el de esa página, y le quita estilo, visibilidad y
`nodeStyles` (no hay nada que editar en él); en el resto de páginas no puede
haber ninguno. En el editor sólo se mueve: el lienzo, la Estructura, los
atajos y la barra flotante no lo duplican, ocultan ni borran. En el lienzo
lo pinta `PageCoreBlock.vue` —una vista previa con datos reales de la
empresa (`preview-data`) y sin nodos editables—; en la web publicada
`SiteBlockRenderer` pinta en su lugar el slot `core`, que es la página real.

**Web pública.** `composables/useSitePage.ts` pide
`/api/public/site-pages/<clave>` (ahora con `published: boolean`) y
`components/site/SitePageLayout.vue` decide: con versión publicada, las
secciones con la página real en el hueco de la zona dinámica; sin ella, la
página de siempre tal cual. Así nada cambia en ninguna web hasta que alguien
publique esa página. `SiteBlockRenderer` se importa de forma estática: con
`defineAsyncComponent` el SSR no pintaba las secciones y la página llegaba
vacía hasta hidratar (e2e `web-ssr-movil.spec.ts`). `/servicios` es un 404 hasta que se publica. El SEO de
la página (título y descripción) sustituye al de siempre al publicar, salvo
en la Ficha, que conserva el SEO de cada propiedad.

**Volver a la original.** `DELETE /api/admin/site-pages/<clave>`
(`resetSitePage()`): borrador = siembra y `publishedJson = null`, así que la
web vuelve a la página de siempre. Las versiones se conservan y se pueden
restaurar; ninguna figura como «actual» mientras no se publique. Inicio no
lo admite (422): sin versión publicada se quedaría en blanco.

**Editor.** La página abierta va en la URL (`?pagina=nosotros`). Cambiar de
página guarda antes lo pendiente (si no se puede guardar, no se cambia) y
carga la otra sin selección ni historial de deshacer. El `GET` de cada
página trae además `pages`: el estado de todas para la lista («Publicada»,
«Cambios», «Original», «Sin publicar»), calculado sin crear filas. El
lienzo recibe `pageKey` para poner la cabecera superpuesta sólo en Inicio.

Restablecer es un `DELETE` y el estado va dentro del `GET`. Se hizo así
cuando cada ruta nueva rompía el typecheck (TS2589); desde #155
(`scripts/patch-nitro-route-types.mjs`) ese límite ya no existe.

**Menú de la cabecera.** `utils/siteNav.ts` (`PUBLIC_NAV`) es la única
lista del menú principal: la usan la cabecera de escritorio, el menú del
móvil y el lienzo (que pinta el mismo `SiteHeader.vue`). Comprar Propiedad
lleva a `/propiedades?operacion=venta` (lo que no está en alquiler,
`server/api/public/properties.get.ts`); Vender Propiedad a `/vender`, una
página `content` del catálogo que, a diferencia de Servicios, se enseña
desde el primer día con su siembra (`pages/vender.vue`). Su formulario es el
bloque `seller-valuation` (ver más abajo; las páginas ya publicadas con un
`lead-form` con `purpose: 'seller'` siguen igual) → `form: 'seller'`: lead de captación
(«Vender propiedad»), rol `seller` en el Contact y sin juntarse con un lead
de comprador de la misma persona (`reuse: 'same_source_detail'`).

**Catálogo de Propiedades (#109).** La zona `properties-listing` es
`pages/propiedades/index.vue`: barra (`SmartSearch`, orden, Galería / Mapa
con `vista=mapa`), panel de filtros a la izquierda
(`components/catalog/CatalogFilters.vue`, 335 px, ocho grupos con Ubicación
abierto) y rejilla de `ProjectCard variant="catalog"` en 3 columnas (2 en
tablet, 1 en el móvil, donde el panel va en un cajón). Todo filtro vive en la
URL y lo resuelve `/api/public/properties` contra el catálogo real del tenant;
las opciones de Ubicación, Tipo y Estado salen de `facets=filters` (sólo lo
publicado). Los chips de filtros activos los genera `utils/catalogChips.ts`.
«Más filtros» abre el `FiltersModal` de siempre (eficiencia, orientación, año,
radio…), así que no se pierde ningún criterio anterior. En el lienzo,
`PageCoreBlock.vue` pinta la misma composición con datos reales e inerte
(sin `SITE_BLOCK_KEY` los nodos no se seleccionan). El orden y la
visibilidad de los grupos del panel son la opción `filters` de la zona
(ver «Filtros del catálogo» más abajo).

**Opciones de una zona dinámica.** La zona no tiene datos que editar, pero
`PAGE_CORE_OPTIONS` (`utils/siteBuilder/pages.ts`) admite unas pocas
opciones por zona, que `validatePageDocument` guarda y valida (lo demás se
descarta). Hoy, la ficha: `showFeatured` y `featuredTitle` para la sección
«Propiedades destacadas» bajo las similares (las propiedades marcadas
`isExclusive`, sin la actual ni las similares; vienen en
`/api/public/properties/<slug>/similar` como `featured`). Se editan en
`PageCoreInspector.vue` y la ficha publicada las lee de su zona.

**Secciones de la ficha (#110).** La tercera opción de la ficha es
`sections` (tipo `'sections'`): la lista ordenada `{ key, visible }` de las
secciones que se pueden mover u ocultar (`FICHA_SECTIONS`, con su orden de
partida). `normalizeFichaSections` la deja siempre completa: descarta claves
desconocidas o repetidas y añade al final, visibles, las que falten (una
sección nueva del código aparece sola). La ficha (`pages/propiedades/[slug].vue`)
la convierte con `fichaSectionLayout` en un `order` CSS por sección dentro
de una columna flex (la cabecera siempre primera) y un `v-if` para las
ocultas; la barra de secciones se ordena y filtra igual. La galería, la
cabecera, el contacto y las similares no se mueven, y una sección sin datos
no sale aunque esté visible: el Constructor decide la presentación y Property
Core los datos. En el inspector, flechas ↑/↓, una casilla por sección y
«Volver al orden de partida» (quita la opción). Como el resto de opciones,
llega a la web al publicar.

**Filtros del catálogo.** La zona de Propiedades tiene una opción,
`filters` (tipo `'filters'`): la misma lista ordenada `{ key, visible }` que
las secciones de la ficha, sobre los grupos del panel de filtros
(`CATALOG_FILTER_GROUPS`: Ubicación, Precio, Superficie, Habitaciones,
Baños, Tipo de propiedad, Estado y Características, en el orden de la
referencia de #109). `normalizeCatalogFilters` la completa igual que
`normalizeFichaSections` (comparten `normalizeOrderedList`: un grupo nuevo
del código aparece solo, visible, al final) y `catalogFilterKeys` da las
claves visibles en su orden. `pages/propiedades/index.vue` las pasa a
`CatalogFilters` (`groupKeys`) en el panel de escritorio y en el cajón del
móvil, sólo con la página publicada; el lienzo las pinta igual antes de
publicar y dice cuántos grupos están ocultos. Ocultar un grupo sólo lo quita
del panel: un filtro que ya venga en la URL se sigue aplicando y se quita
desde su chip. Si se oculta Ubicación, se abre de partida el primer grupo
visible. En el inspector, la misma lista con flechas y casillas que la
ficha (`page-core-filters`) y «Volver al orden de partida».

Todas estas rutas caen bajo el patrón `site-pages` de
`server/utils/adminRouteMatrix.ts` (área `web`), igual que las que ya había:
no cambia ningún permiso.

## Autoguardado, deshacer/rehacer, Publicar

- **Autoguardado**: un `watch` con debounce de 1s sobre `blocks`+`seo` hace
  `PUT /api/admin/site-pages/home`. El estado real ("Guardando…" /
  "Guardado" / error) viene de la promesa del `$fetch`, nunca de un
  `setTimeout` que simula progreso.
- **Deshacer/rehacer**: pila en memoria, de sesión (no se persiste). Se
  empuja un snapshot antes de cada operación estructural (añadir, duplicar,
  borrar, reordenar, cambiar visibilidad) y una vez por "ráfaga" de edición
  en el panel contextual (`onPanelFocusIn`/`onPanelFocusOut`) — nunca por
  cada pulsación de tecla.
- **Publicar**: vacía cualquier autoguardado pendiente primero (para no
  publicar un borrador desactualizado), luego `POST .../publish`, que copia
  `draftJson` → `publishedJson`, incrementa `version` y escribe una fila en
  `site_page_versions`. El botón lleva un tooltip explícito "Cambios sin
  publicar" (además de cambiar de texto y mostrar un punto de aviso) cuando
  `hasUnpublishedChanges` es real — nunca se muestra ese estado si el borrador
  y lo publicado coinciden.
- **Historial y restauración**: `GET .../versions` lista las últimas
  `VERSION_HISTORY_LIMIT` (50) publicaciones — versión, fecha, quién publicó,
  cuántos bloques y el título SEO, todo resumido **en SQL** (`json_array_length`
  / `json_extract`) porque un snapshot llega a `MAX_JSON_BYTES` y el listado
  sólo necesita distinguirlas, no leerlas. `POST .../restore` con `{version}`
  copia ese snapshot **sobre el borrador, nunca sobre lo publicado**: restaurar
  no es republicar, y hasta que alguien pulse Publicar los visitantes siguen
  viendo lo de antes (incluida la versión rota de la que se está saliendo).
  Se registra en auditoría con `action: 'restore'`, porque sobrescribe el
  borrador — los cambios sin publicar que hubiera se pierden, recuperables
  sólo con el deshacer en memoria del editor, que es justo por lo que el
  cliente hace `pushUndo()` antes de aplicar lo restaurado.
- **Atajos de teclado**: Ctrl/Cmd+Z y Ctrl/Cmd+Shift+Z (también Ctrl+Y) para
  deshacer/rehacer, ignorados mientras el foco está en un `<input>`/
  `<textarea>` para no interferir con el undo nativo del navegador dentro de
  un campo de texto.

## Edición directa: nodos, selección y estilos por elemento

Desde el editor visual directo (2026-09-21), el lienzo no es "una preview con
un panel al lado": es un **canvas editable**. Ver → pulsar → seleccionar →
editar → ver el cambio. Un clic sobre un título selecciona *ese título*, no la
sección; el inspector de la derecha cambia a "Propiedades del texto"; doble
clic (o Enter) lo edita ahí mismo. Lo mismo con párrafos, etiquetas, botones,
enlaces, imágenes, tarjetas y sus elementos internos. En **Vista previa**
nada de esto existe: los clics navegan, exactamente como en la web publicada.

### El modelo: un bloque, muchos nodos

Un `SiteBlock` sigue siendo la unidad de la página (se añade, ordena,
duplica, oculta y publica igual que antes). Dentro de él, cada elemento
editable es un **nodo**, identificado por el bloque y un campo:
`hero-abc:title1`, `props-xyz:card.name`. El registro de tipos de nodo y sus
capacidades vive en `utils/siteBuilder/nodes.ts` (`NODE_KINDS`): un
`heading` tiene texto, tipografía, color, alineación y espaciado; una `image`
tiene medios, ajuste, radio y opacidad; un `button` tiene además enlace, fondo
y borde. **El inspector se construye a partir de esas capacidades, no de un
`switch` por bloque** (`components/site-builder/inspector/NodeInspector.vue`).

Los bloques exponen sus nodos con cinco componentes
(`components/site-builder/nodes/`): `SbText` (cualquier etiqueta de texto),
`SbLink` (un `NuxtLink` con el texto editable y el destino en `linkField`),
`SbButton` (un `<button>` real), `SbImage` (un `<img>`) y `SbBox` (un
contenedor: tarjeta, formulario, mapa). Son **el mismo elemento de siempre**
—misma etiqueta, mismas clases— con un atributo `data-sb-node` de gancho; no
envuelven nada, así que la semántica (`h2`, `a`, `button`, `img` con `alt`) y
el layout se conservan. `test/unit/siteBuilderRegistry.test.ts` exige que
todo bloque use al menos un nodo y que ningún título se pinte fuera de uno.

### Selección: un solo modelo, tres niveles

El shell (`pages/admin/site-builder/index.vue`) es el Selection Manager:
`selectedBlockId` (sección), `selectedNode` (elemento dentro de ella) y
`selectedGlobal` (cabecera/pie). El lienzo reporta qué hay bajo el puntero y
el shell decide; lienzo, Estructura, miga de pan e inspector enseñan siempre
la misma selección porque la reciben del mismo sitio (`sendState`).

En el lienzo, `SiteBlockFrame.vue` (el `<div>` envolvente de cada bloque,
antes parte de `SiteBlockRenderer`) intercepta el clic en fase de captura
—igual que antes, para que nada navegue— y resuelve el **nodo más interno**
bajo el puntero con `closest('[data-sb-node]')`: el título de una tarjeta
selecciona el título; el hueco de la tarjeta, la tarjeta; el fondo de la
sección, la sección. Esa es la respuesta a los elementos superpuestos, junto
con la miga de pan del inspector (`Sección › Elemento`, pulsable para subir) y
Esc, que sube de nivel: edición → elemento → sección → nada. El nodo
seleccionado lleva una barra contextual (`canvas/NodeToolbar.vue`): tipo,
"Editar"/"Cambiar imagen" y "↑ Sección".

Un nodo no sabe nada de todo esto: `useSbNode()`
(`composables/useSiteEditor.ts`) le da los atributos según el contexto que
`SiteBlockRenderer` provee (modo, selección) y el que `SiteBlockFrame` provee
(id de bloque). Sin contexto de bloque —`ProjectCard` en `/propiedades`— no
añade nada. En producción sólo quedan `data-sb-node` y `data-sb-kind`, los
ganchos de la hoja de estilos; las marcas de selección, las etiquetas y los
contornos existen únicamente bajo `.sb-editing`, que sólo pone el lienzo.

### Edición inline

`useInlineText()` pone `contenteditable="plaintext-only"` sobre el propio
elemento: lo que se pega entra como texto plano y lo que se escribe sale con
`innerText` — **nunca HTML**, y el modelo sigue siendo `content[campo]`. Cada
tecla manda `edit-node` al shell, que actualiza el bloque; el inspector lo ve
por reactividad (sincronización bidireccional sin dos estados). Mientras se
edita, el nodo ignora el eco que vuelve por `set-state` (movería el cursor).
Escape devuelve el texto original; Enter confirma (Ctrl/Cmd+Enter en textos
de varias líneas); perder el foco confirma. `edit-start` deja un punto de
deshacer por edición, no por tecla.

Los dos `<button>` reales (enviar formulario, reservar visita) no llevan
`disabled` en el lienzo —un botón deshabilitado no recibe clics y no se
podría seleccionar—; ahí protegen la intercepción del clic y el
`if (locked) return` del handler, y el botón lo declara con `aria-disabled`.
En Vista previa y en producción vuelven a estar deshabilitados de verdad.

### Estilos estructurados, nunca CSS libre; el DOM nunca es la verdad

La presentación de un nodo se guarda en `block.nodeStyles[campo]` como
propiedades con nombre y rango (`NodeStyle`: `fontSize` en px, `fontWeight`
numérico, `color` hex, `align`, `marginTop`, `objectFit`…), con overrides por
dispositivo en `responsive.tablet` / `responsive.mobile`. Llegan al servidor
por el mismo `PUT` del borrador y **se sanean contra la lista cerrada**
`STYLE_SPECS` (`sanitizeNodeStyles`): clave desconocida, valor fuera de rango,
fuente fuera del catálogo o color que no sea hex se descartan. Lo que no se
puede convertir a CSS no se guarda.

La única traducción a CSS es `buildNodeStylesCss()`: una regla
`[data-site-page] [data-sb-node="bloque:campo"]{…!important}` por nodo, más
una `@media (max-width: …)` por breakpoint con override. Móvil hereda de
tablet y tablet de escritorio, como en CSS. `SiteBlockRenderer` la inyecta con
`useHead` en los tres modos —en el lienzo se recalcula con cada cambio; en
producción se sirve en el SSR desde lo publicado—, así que **lo que se ve
editando es exactamente la hoja de estilos que se publica**. `!important` es
deliberado: es la elección explícita de quien edita y tiene que ganar a las
utilidades del bloque (incluidas las que ya llevan `!`, como el color de las
etiquetas sobre fondo oscuro); la especificidad (raíz + atributo) hace que un
nodo gane además a los estilos globales.

**Estilos globales** (`utils/siteBuilder/globalStyles.ts`, panel "Estilos
globales" de la barra superior): tipografía de títulos, de texto y radio de los
botones, en `SitePageDocument.styles`, acotados a `[data-site-page]` (no tocan
cabecera ni pie). Un nodo hereda de ahí; "Restablecer" en el inspector lo
devuelve al global. Fuentes: catálogo cerrado en `utils/siteBuilder/fonts.ts`
(Google Fonts); `pageFontsHref()` compone el único `<link>` que la página
necesita, y el lienzo y la web lo cargan igual.

**Dispositivo**: con Tablet o Móvil elegidos en la barra, cualquier propiedad
que se cambie es un override de ese dispositivo (`withNodeProp`); el inspector
lo dice ("Editando la vista Móvil…"), marca con un punto lo que tiene valor
propio, enseña lo heredado como placeholder y ofrece quitar los overrides del
dispositivo o restablecer todo el elemento.

**Brand Kit**: si la organización tiene uno, sus colores salen primero en
cada selector de color y sus fuentes (las del catálogo) primero en cada
selector de tipografía. Sin Brand Kit, los controles funcionan igual.

### Contenido estático vs dinámico

Un nodo que pinta un dato real —el nombre de una propiedad, la foto de un
comercial, el título de un artículo— lleva `dynamic="Propiedades (web) →
Nombre"` y `sourceHref` (`utils/siteBuilder/sources.ts`). El inspector
enseña "Contenido dinámico", dice de dónde procede y ofrece "Editar en
Propiedades (web)"; **no hay campo de texto, y el doble clic no lo edita**.
Lo que sí se puede cambiar es su presentación (tipografía, color, tamaño…),
que se guarda bajo el campo de plantilla (`card.name`) y se aplica a todas
las tarjetas del bloque. Por convención, todo campo `card.*` o `agent.*`
tiene que ser dinámico — la prueba del registro lo vigila. El principio de
siempre sigue en pie: PROPIEDADES = DATOS, CONSTRUCTOR = PRESENTACIÓN.

### Cabecera y pie: elementos globales en el lienzo

El lienzo pinta `SiteHeader` y `SiteFooter` (con `tenantOverride`, la marca
de la organización que se edita, no la del host del panel) dentro de
`SiteGlobalZone.vue`, con `transparentHero` como la portada real: lo que se
ve es la página completa. Son **elementos globales** del sitio, no de Inicio.
La cabecera no se edita aquí: pulsarla la selecciona y el inspector
(`GlobalZoneInspector.vue`) explica que aparece en todas las páginas y dónde
se cambia (logo y nombre en Sistema → Empresas). El pie sí se edita: ver la
sección siguiente.

## El pie global: cinco columnas, newsletter real, contacto, paisaje y barra inferior

El pie (`components/site/SiteFooter.vue`) es uno para toda la web y se edita
en el Constructor pulsándolo en el lienzo (`FooterInspector.vue`, con las
tres pestañas Contenido / Diseño / Avanzado). Su modelo, los valores de
partida y la normalización están en **`utils/siteFooter.ts`**, compartido por
servidor, web y editor: nada llega a la web sin pasar por
`normalizeFooterConfig()` (textos con tope, colores `#rrggbb`, enlaces
externos sólo `http(s)`/`mailto:`/`tel:`, redes sólo hacia el dominio de su
red).

**Dónde se guarda.** Como un documento más de `site_pages`, con la clave
reservada `footer` (`FOOTER_PAGE_KEY`), que no es una página: no está en
`SITE_PAGES`, `requireValidPageKey` la rechaza y no sale en la lista de
páginas. Así tiene borrador, versión publicada e historial igual que las
páginas, sin migración. El JSON es `{ "footer": FooterConfig }`
(`server/utils/siteFooter.ts`: `getFooterDraft`, `saveFooterDraft`,
`publishFooter`, `getPublishedFooter`). Sin fila o sin publicar, la web pinta
`defaultFooterConfig()`: el pie de siempre, ordenado en cinco columnas, con
enlaces a páginas que existen (Comprar, Alquilar, Mapa, Obra nueva,
Comunidades / Sobre nosotros, Nuestro equipo, Blog, Servicios / Solicitar
visita, Vender propiedad, Área de clientes, Registro de proveedor,
Reclamaciones, Contacto). Nada de lo que había se pierde: logo y nombre
siguen siendo los de la empresa, los legales y «Configurar cookies» siguen
en la barra inferior (mismo `data-testid="footer-cookie-settings"`).

**Rutas.** Panel: `GET/PUT /api/admin/site-footer` (borrador, datos de la
empresa y páginas publicadas; `requireOrgScope(event, 'web', …)`) y
`POST /api/admin/site-footer/publish` (con fila de auditoría). Web:
`GET /api/public/site-footer` (sólo lo publicado, nunca el borrador). El
shell (`pages/admin/site-builder/index.vue`) carga el pie al abrir, lo
autoguarda aparte de la página (`footerConfig` / `flushFooterSave`) y
«Publicar» publica la página y, si el pie tiene cambios, también el pie;
`sendState` manda el borrador al lienzo (`footer`, `footerMeta`) y
`canvas.vue` se lo pasa a `SiteFooter` como `config`/`meta`.

**Enlaces internos con identificador estable.** Un enlace a una página se
guarda como `{ kind: 'page', target: 'buy' }`, nunca como ruta escrita a
mano: `FOOTER_TARGETS` traduce el id a su dirección y a su texto en el idioma
del visitante. Un destino que deja de existir se conserva en lo guardado y el
editor lo marca («Esta página ya no existe…»); la web no lo enseña
(`footerLinkProblem`). «Servicios» lleva `requiresPublished: 'servicios'`:
sale sólo si esa página del Constructor está publicada
(`loadFooterAvailability`). Un enlace externo pasa por `safeExternalUrl` y se
abre con `rel="noopener noreferrer"`.

**Nada inventado.** Teléfono, ubicación y redes salen, si no se escriben, de
la empresa (`loadFooterProfile`: teléfono del Brand Kit → teléfono legal →
oficina principal; ciudad y provincia de la primera oficina activa; redes del
Brand Kit con URL válida). Si no hay, el bloque no se enseña. El horario sólo
sale si se escribe. «Ver en el mapa» abre Google Maps con la dirección de la
oficina. Los colores de partida son blanco cálido, etiquetas melocotón y el
color de marca (oscurecido hasta contraste AA con texto blanco:
`footerPalette`) en el botón, los iconos y la barra inferior.

**Newsletter.** `FooterNewsletter.vue` → `POST /api/public/newsletter`
(`server/utils/newsletter.ts`, tabla `newsletter_subscriptions` de la
migración 0093): email normalizado, `privacyAccepted` obligatorio, límite por
IP, campo trampa, una fila por empresa y email (quien repite no se duplica y
no recibe un token nuevo). **No se envía ningún email.** El alta devuelve
una sola vez el token de baja (`/newsletter/baja?token=…`, que exige pulsar
«Confirmar la baja»); en la base de datos sólo está su SHA-256. El doble
opt-in está preparado (`doubleOptIn`, `confirmSubscription`, estado
`pending`) y no se usa hasta que exista el email de confirmación. El panel
lo lista en Portal Web → Suscriptores (`/api/admin/newsletter`: filtro,
búsqueda, CSV, baja y supresión); la exportación y la supresión RGPD por
email incluyen la tabla. En el lienzo del Constructor (`sandbox`) el
formulario no guarda nada.

**Paisaje y «volver arriba».** `FooterLandscape.vue` pinta uno de cuatro SVG
(costa con faro, montañas, ciudad, campo) o una imagen propia, con opacidad
y altura ajustables y fundido arriba; de partida, ninguno. El botón circular
blanco de la barra inferior hace scroll suave (respeta
`prefers-reduced-motion`) y, mientras se ve, el botón flotante
`ScrollTop.vue` se esconde (`useState('site-footer-top-visible')`): nunca
dos a la vez.

**Responsive.** Escritorio (≥1024): las columnas visibles en una fila con
anchuras `1.55fr / 1fr / 1fr / 1fr / 1.5fr`. Tableta (640–1023): identidad y
newsletter arriba, las tres columnas de enlaces debajo. Móvil: una columna;
Explorar/Empresa/Servicios plegadas bajo su título (`mobileAccordions`) y lo
marcado en `hideOnMobile` no se enseña; la barra inferior en vertical.

### Rendimiento

El hover es CSS puro (`:hover`), sin estado. El shell manda la página entera
en cada cambio, pero el lienzo (`applyBlocks` en `canvas.vue`) conserva el
objeto de cada bloque cuyo JSON no ha cambiado, así que sólo el bloque tocado
vuelve a pintarse — también mientras se escribe inline. La hoja de estilos es
un `computed` sobre los bloques.

### Atajos

Doble clic / Enter: editar el texto seleccionado · Esc: salir de la edición,
luego subir de nivel · Supr: eliminar la sección seleccionada (con
confirmación) · Ctrl/Cmd+D: duplicar · Ctrl/Cmd+Z, Ctrl/Cmd+Mayús+Z
(Ctrl+Y): deshacer/rehacer — cubren texto, color, fuente, imagen, espaciado,
estilos globales y estructura, con un punto por "ráfaga" de cambios, no por
tecla. Funcionan con el foco en el lienzo (lo maneja `canvas.vue` y llegan al
shell como `command`) y en el shell.

## Fondo del Hero: bucle de imágenes o imagen fija

`HeroInspector.vue` › Multimedia › «Fondo» guarda `content.backgroundMode`:

- **`slideshow` (o ausente: todo lo guardado antes):** `content.slides` en
  bucle, una cada `HERO_SLIDE_SECONDS` (7 s), con fundido y un zoom lento.
- **`static`:** una sola imagen quieta, `content.backgroundImage`. Si está
  vacía, se usa la primera del bucle. `content.slides` no se toca, así que
  volver al bucle recupera sus imágenes.

`utils/siteBuilder/heroMedia.ts` (`heroFrames`) decide qué imágenes pinta
`HeroSearch.vue`. La imagen visible del bucle la marca JS (`is-active` cada
7 s), no una animación CSS de duración fija. La animación anterior (21 s)
estaba pensada para exactamente 3 imágenes:

- con 1, el fondo se quedaba negro 14 s de cada 21;
- con 2, había huecos;
- con 4 o más, se pisaban.

Ahora, con una sola imagen, el fondo queda fijo (`is-static`). Con
`prefers-reduced-motion`, ni rota ni hace zoom.

## Buscador del Hero: Comprar | Alquilar, cuatro campos, «Buscar» y «Más filtros»

El Hero no lleva botones propios (los antiguos `exploreCta` / `advisorCta` de un
contenido guardado se ignoran): la acción es el buscador
(`components/HeroSearch.vue`, opciones en `utils/heroSearch.ts`).

- **Comprar | Alquilar**: control segmentado blanco con iconos (casa, llave);
  el activo, con el color del botón (`operacion=venta|alquiler`). Al cambiar
  se quitan el precio y lo que sólo vale en la otra operación (inversión;
  modalidad y gastos de alquiler), como `operationSwitchPatch` del catálogo.
- **La barra**: sólo cuatro campos y «Buscar», en este orden de partida —
  Tipo de inmueble, Ubicación, Precio, Habitaciones—. Cada campo: icono,
  etiqueta, valor o «Cualquiera» y flecha. Un solo desplegable abierto a la
  vez; cambiar de campo no pierde lo elegido; Escape o un clic fuera lo cierran.
  - **Tipo de inmueble** (`components/search/PropertyTypePicker.vue`, el mismo
    en el panel de Propiedades): el catálogo ENTERO de Property Core
    (`PROPERTY_TYPE_GROUPS` de `utils/propertySheet.ts`: Viviendas —Pisos,
    Casas y chalets—, Inmuebles comerciales, Terrenos, Otros inmuebles), a la
    vista en cuanto se abre, sin desplegables: grupos con su casilla
    (todo/parte/nada), cada tipo con su casilla y sus subtipos en línea como
    pastillas. Todos los tipos se pueden elegir aunque la agencia no tenga
    ninguno publicado (el número junto a cada tipo son las propiedades reales,
    `facets.typeCounts`, y sólo informa). Varios a la vez (unión); resumido con
    `heroTypeSummary` («Viviendas», «Inmuebles comerciales», «Piso y ático»,
    «3 tipos seleccionados»). En escritorio, dos columnas; en móvil, una hoja
    inferior. Comprar y Alquilar comparten catálogo y conservan lo elegido.
  - **Ubicación** (`components/search/LocationAutocomplete.vue`, el mismo en
    el panel de Propiedades): autocompletado geográfico sobre ENTIDADES reales.
    `/api/public/location-suggest` funde tres fuentes: el catálogo de España
    (`public/geo/es.json`, generado por `scripts/geo/build-es.mjs` desde
    GeoNames, CC-BY 4.0: 19 comunidades, 52 provincias, 8.124 municipios con
    código INE, ~24.000 localidades y barrios y 11.150 códigos postales, con
    coordenadas; `server/utils/geo/catalog.ts` lo indexa una vez por aislado y
    busca por exacta > prefijo > prefijo de palabra > contiene > aproximada
    —Damerau-Levenshtein, una letra hasta 6, dos desde 7—, sin tildes y con las
    cooficiales: «xixon» → Gijón/Xixón), el inventario de la agencia
    (`locationIndex.ts`: cuántas propiedades hay en cada sitio; calles y
    nombres que sólo existen en sus fichas) y sus zonas publicadas
    (`server/utils/geo/suggest.ts`). El contexto de la agencia (sus municipios
    y provincias con inventario) sólo reordena, nunca excluye; los grupos van
    por su mejor coincidencia. Cada elegida es una entidad con id canónico
    (`es:ccaa:34`, `es:prov:33`, `es:mun:33024`, `es:loc:3108732`,
    `es:cp:33201`, `zone:12`) que va en la URL como `loc=` y filtra por su
    ámbito real (`server/utils/geo/locations.ts`: municipio por nombre,
    cooficiales, variantes guardadas o CP suyo; provincia por nombre, sus
    municipios o el prefijo del CP; comunidad por sus provincias y municipios;
    barrio por nombre dentro de su municipio; CP exacto; zona por lo que
    declara, sólo de la propia agencia); los textos de siempre
    (`municipality=Oviedo&neighborhood=Centro`) siguen valiendo. Varias a la
    vez (unión) como chips con icono por nivel; una contenida en otra elegida
    se avisa («dentro de Asturias») sin quitarla. Sin escribir: recientes del
    visitante (sólo su navegador), lo que más inventario tiene, las zonas y
    «Seleccionar en el mapa» / «Buscar alrededor de un punto» (van a la vista
    Mapa de Propiedades, donde están la zona del mapa y el radio). Estados:
    cargando, sin resultados («No encontramos esa ubicación. Prueba con otro
    nombre o selecciona una zona en el mapa.»), error de servicio. Debounce
    200 ms, abort + secuencia, caché por texto; los nombres de los ids de la
    URL los da `/api/public/location-resolve` (`composables/useLocationNames.ts`).
  - **Precio** (`components/search/PriceRangeSlider.vue`): dos extremos sobre
    la escala de cada operación (importes de venta o rentas mensuales) y dos
    campos editables, sincronizados; en la moneda base de la agencia.
  - **Habitaciones** (1+…5+): con sólo tipos que no las tienen (locales,
    garajes, terrenos…) el campo dice «No aplica» y no se abre.
- **Buscar**: botón rectangular grande (lupa, texto, flecha), con el color
  elegido en el Constructor o, sin él, el color de marca de la empresa
  (`tenant.brandColor`; en el lienzo, el de la empresa que se edita,
  `TENANT_BRANDING_OVERRIDE`). `heroButtonColors` lo oscurece (mismo tono)
  hasta que el texto blanco tiene contraste AA; sin color de marca, la tinta.
- **Más filtros (n)**: enlace discreto fuera de la barra; `n` es
  `countHeroExtraFilters` (sólo lo de dentro del panel; cada opción cuenta una
  y la superficie, una). El panel (debajo de la barra, también en el móvil)
  tiene baños, superficie (mín./máx., validada), estado (`estado=`), inversión
  (`minYield`, con Comprar) o modalidad y gastos (`rentalTerm`,
  `expensesIncluded`, con Alquilar), situación (`situacion`, sólo si la
  agencia anuncia alguna: `facets=filters`), las características por grupos
  (`FEATURE_GROUPS`), orientación, eficiencia mínima y «Ordenar por».
  «Aplicar» cierra sin perder nada; «Limpiar filtros» vacía sólo el panel.

**Constructor** (Hero › «Buscador», contenido del bloque): `searchFields`
(lista completa con `visible`, en orden), `searchButtonLabel`,
`showMoreFilters`, `defaultOperation` y, en Diseño, `searchButtonColor`
(#rrggbb) y `searchRadius` (`md` | `lg` | `pill`). Todo se normaliza al leer
(`heroSearchOptions`): lo desconocido se descarta y los campos que falten se
añaden visibles. Responsive: una fila en escritorio, dos columnas con el botón
debajo en tableta y apilado con el botón a todo el ancho en el móvil.

«Buscar» lleva a `/propiedades` con exactamente el mismo modelo de URL que lee
el listado (`utils/searchState.ts`); al volver a Inicio sin recargar, el Hero
recupera esa búsqueda (`useState('last-search')`). Los enlaces antiguos
(`obra=nueva|segunda`, `city`, `status`…) se siguen entendiendo.

## Listado de Propiedades: «Ordenar por», panel y opciones del Constructor

- **Ordenar por**: `Relevancia | Baratos | Recientes | Más ▾` (Precio más alto,
  Antiguos, Han bajado más, Baratos €/m², Caros €/m²) — ocho ordenaciones, todas
  en el servidor (`server/utils/properties/publicSearch.ts`,
  `publicSearchOrder`), con el id como desempate para que paginar no repita ni
  salte ninguna. Relevancia = exclusivas primero y después las publicadas más
  recientemente. Han bajado más = `(ref − precio) / ref`, con `ref` el mayor de
  `priceOld` y el histórico de precios, sólo si es mayor que el actual. €/m² =
  precio / superficie construida si ambos > 0; si no, al final. «Recomendado»
  ya no existe.
- **Panel** (`components/catalog/CatalogFilters.vue`): Comprar | Alquilar
  arriba; después Ubicación, Precio, Superficie, Habitaciones, Baños, Tipo
  (Viviendas › Pisos / Casas y chalets › tipo › subtipos, tri-estado), Estado
  (obra nueva / segunda mano y conservación), Situación de la vivienda (sólo
  `property_details.listing_situation`, lo que la agencia anuncia; nunca
  `occupancyStatus`), Tipo de alquiler (sólo con Alquilar: `rental_term`, sin
  indicar = larga estancia, y gastos incluidos) y Características por grupos.
  Un chip por valor; «Ver N resultados» es el total real; «Nueva búsqueda»
  vacía texto, filtros y orden.
- **Constructor** (zona dinámica de Propiedades › «Buscador del catálogo»):
  mostrar u ocultar el panel, Comprar | Alquilar, «Ordenar por» y «Nueva
  búsqueda», y la operación de partida; en «Filtros del catálogo», orden,
  visibilidad y «Abierto» al cargar de cada grupo. Sólo presentación: lo que
  se encuentra lo decide `buildPublicSearch`, el mismo que usan las alertas de
  búsquedas guardadas.

## «Tipo de inmueble» y «Ubicación» configurables por bloque

Las dos primeras celdas del buscador se ajustan en el Constructor con las
MISMAS claves en los dos bloques que las pintan (`utils/searchConfig.ts`,
validado al leer; inspector compartido
`components/site-builder/inspector/SearchFieldsInspector.vue`, dentro de
Hero › Buscador y de Propiedades › Buscador del catálogo):

| Clave | Qué ajusta | De partida |
| --- | --- | --- |
| `typePlaceholder` | Texto del campo «Tipo de inmueble» vacío (≤ 60) | «Cualquiera» en el idioma de la web |
| `typeShowCounts` | Número de propiedades junto a cada tipo | sí |
| `locationPlaceholder` | Texto del campo «Ubicación» vacío (≤ 60) | el de la web |
| `locationSuggestions` | Sugerencias como máximo: 8, 10, 14, 20 o 30 | 14 |
| `locationShowCounts` | Número de propiedades en cada sugerencia | sí |
| `locationFeatured` | Hasta 8 entidades del catálogo o zonas (`{ id, value, context }`), elegidas con el mismo autocompletado; salen primero con el campo vacío y **no limitan la búsqueda** (`featured=` en `/api/public/location-suggest` sólo reordena) | ninguna |
| `locationMapSelect` / `locationMapDraw` / `locationMapNearby` | Qué herramientas del mapa se ofrecen bajo las sugerencias | las tres |

El Hero las lee con `heroSearchOptions(content).type/.location`
(`utils/heroSearch.ts`); el panel de Propiedades con
`catalogDisplayOptions(content).type/.location` (`utils/siteBuilder/pages.ts`,
cuya `PAGE_CORE_OPTIONS['properties-listing']` admite estas claves y
`sanitizeCoreOptions` las sanea al guardar). Webs existentes sin claves
guardadas: todo se ofrece como hasta ahora. Sólo presentación: qué se
encuentra lo sigue decidiendo Property Search.

## Mapa del buscador: zona visible, radio, zona dibujada y áreas con propiedades

La vista Mapa de Propiedades (`pages/propiedades/index.vue`) y `/mapa`
(`pages/mapa.vue`) comparten `components/MapExplorer.client.vue` y cuatro
formas de acotar, todas en la URL y todas filtradas por el servidor sobre el
pin **que se publica** de cada propiedad (`server/utils/properties/geoSearch.ts`
› `publicCoordsSql`: redondeado si la ubicación es aproximada):

| Herramienta | URL | Dónde se decide |
| --- | --- | --- |
| Zona visible («Buscar en esta zona») | `north/south/east/west` | SQL (caja) |
| Radio («Buscar cerca de aquí») | `lat/lng/radiusKm` | SQL (caja + distancia equirectangular) |
| Zona dibujada («Dibujar zona») | `poly=lat,lng;lat,lng;…` | SQL acota por la caja; `publicSearch.ts › polygonIdsCond` decide punto a punto (trazado de rayo, `utils/maps/geo.ts`) |
| Áreas con propiedades | `loc=es:mun:33024,…` | Es «Ubicación»: la misma condición que el chip |

Zona visible, radio y zona dibujada **no se combinan**: elegir una quita
las otras, para que lo que se ve en el mapa sea exactamente lo que filtra.

**Dibujar zona.** El trazo se recoge sobre una capa propia del mapa (Leaflet
no arrastra mientras se dibuja), se simplifica (Douglas-Peucker, 4 px) y se
acota a `MAX_POLYGON_POINTS` (120) vértices con 5 decimales; un trazo sin
superficie avisa y se sigue dibujando. Un `poly` mal formado es un 422, nunca
«todas las propiedades». Desde «Ubicación» (Hero y panel), «Dibujar una zona
en el mapa» abre Propiedades en vista Mapa ya dibujando (la petición viaja en
`useState('map-draw-request')`).

**Áreas con propiedades.** Los municipios, barrios y zonas donde la agencia
tiene inventario (las sugerencias sin texto de `/api/public/location-suggest`,
`utils/maps/areas.ts`) se pintan como etiquetas pulsables con su número;
pulsar una la elige en «Ubicación» y pulsarla de nuevo la quita. No se pintan
límites administrativos: el catálogo (GeoNames) trae puntos, no polígonos, y
un contorno inventado engañaría.

`/api/public/location-suggest` (400 peticiones / 5 min por IP) y
`/api/public/location-resolve` (200 / 5 min) van tras el limitador de
`server/utils/rateLimit.ts`.
## Galería multimedia de la ficha (Cola 5)

La galería de la ficha pública (`components/property/GalleryBlock.vue`) va a
ancho completo **encima** de las dos columnas. Sale del modelo puro de
`utils/mediaGallery.ts` (`buildGalleryModel`), que se construye una sola vez
con lo que devuelve `/api/public/properties/<slug>`:

- **Mosaico** (`GalleryMosaic.vue`): la portada grande y hasta cuatro
  secundarias (`mosaicLayout`: 1, 2, 3, 4 o 5 con rejillas propias, sin
  huecos), contador real y «Ver todas las fotos (n)»; en el móvil, la
  principal y un carrusel. Portada con `fetchpriority=high` (LCP) y el resto
  `lazy`; las secundarias, categorías y cuadrícula usan la miniatura de cada
  foto (`thumb_key`) y el original sólo se descarga al ampliar.
- **Categorías**, siempre del backend y sólo si tienen contenido: Todas las
  fotos (portada + galería del editor, sin repetir), Vídeos (`videoUrl` y
  `property_media` vídeo), Planos (`floor_plans` + plano de la promoción),
  Vista 360° (`pano360`), Tour virtual (`virtual_tour` y el enlace de la
  ficha ampliada), Renders, Vista aérea, Nocturna, Antes y después,
  Decoración virtual y Redes. **Estancias** (`utils/mediaRooms.ts`, 19 claves)
  como filtro dentro de las fotos: sólo las que tienen fotos; una foto sin
  estancia sigue en «Todas». Las «Estancias» de Property Core
  (`developer_property_rooms`) son texto libre y describen la distribución de
  la vivienda: no se reutilizan.
- **Visor** (`GalleryViewer.client.vue`, `role=dialog`, foco atrapado,
  teclado en el documento): cabecera con volver, categorías (miniatura, icono
  y número), contador y cerrar; cuadrícula o elemento; vídeos con
  `ConsentGate` (YouTube y Vimeo sin cookies, Matterport —única plataforma de
  tour incrustada y añadida a `frame-src`—; cualquier otro proveedor, enlace
  que se abre aparte); planos con el visor de zoom existente y descarga;
  360° con `Pano360Viewer`. «Atrás» del navegador lo cierra y la ficha
  conserva su posición.
- **Constructor** (`PAGE_CORE_OPTIONS['property-detail'].gallery`,
  `normalizeGalleryOptions`): altura, separación, esquinas, contador, «Ver
  todas», categorías (etiquetas, tarjetas u ocultas), iconos, tipografía y
  color de acento. Sólo presentación; el lienzo pinta el mismo mosaico con
  la multimedia real de la propiedad de ejemplo.

Clasificación persistida (migración 0097, sólo añade columnas NULL):
`images` y `property_gallery_images` += `room`, `description`, `thumb_key`;
`property_media` += `thumb_key`, `room`. El servidor valida la estancia
contra el catálogo y exige que la miniatura sea un fichero de la agencia
(`assertOwnedThumbKey`); la API pública trae además el ancho y alto del
original (de `media_assets.metadata`). No hay servicio de variantes de
imagen en el Worker: las miniaturas WebP (640 px) se generan en el navegador
del panel (`utils/imageThumb.ts`) al subir o con «Generar miniaturas».
No hay IA de visión en la plataforma, así que la clasificación es manual.

## Ficha de propiedad: descripción, «Atendido por», eficiencia energética y secciones sin datos

La zona dinámica de la Ficha (`PAGE_CORE_OPTIONS['property-detail']`,
`fichaDisplayOptions()` en `utils/siteBuilder/pages.ts`) guarda, además de
destacadas y secciones, sólo presentación:

| Opción | De partida | Qué hace |
|---|---|---|
| `showReference` | sí | «Ref.» bajo la ubicación: el `commercialCode` de la ficha ampliada (público en el PropertySchemaRegistry), sólo si existe. Nunca el id ni las referencias internas o de portales. |
| `showDescription` | sí | La descripción dentro de la tarjeta principal, bajo título, ubicación y referencia, con «Ver más»/«Ver menos» (`aria-expanded`, `aria-controls`). Ya no es una sección de la lista: una web que tenía `descripcion` oculta en su orden guardado la sigue teniendo oculta (`legacyDescriptionHidden`) y, al guardar, pasa al interruptor. |
| `contactTone` | `brand` | Fondo de «Atendido por»: `brand` (color de marca de la empresa aclarado, `utils/contactTone.ts`; sin color, verde salvia), `white` o `#rrggbb`. Siempre se aclara hasta una luminancia mínima para el texto oscuro. |
| `energy` | — | Presentación de la tabla energética (`utils/energyCertificate.ts`, `EnergyDisplayOptions`): título, columnas, nota, tabla completa o compacta, fondo, borde, esquinas, espaciado, tamaño del título y anchura; además `collapsible` / `startOpen` (desplegable) e `images` / `imagesPosition` (imágenes del bloque). Se guarda compactada (sólo lo que difiere). |
| `hideEmpty` | sí | «Ocultar automáticamente si no hay datos». |

**Eficiencia energética.** `components/property/EnergyCard.vue`: tabla HTML
accesible (caption, `th` de fila y columna) con las siete flechas A–G (colores
fijos de la etiqueta, longitud creciente) y, sólo en la fila de la clase de la
vivienda, la letra y la cifra de consumo y de emisiones, más «Esta vivienda»
para lectores de pantalla. Los datos salen de Property Core
(`energyData(project, details)`: `energyRating` de la propiedad;
`energyConsumption`, `emissionsRating`, `emissionsValue` y
`energyCertificateExpiry` de la ficha ampliada); el Constructor nunca guarda
valores (`validatePageDocument` sanea el bloque `energy-efficiency` a sus
opciones). Sale como sección `energia` de la zona (anclada tras `datos` en los
órdenes ya guardados, `FICHA_SECTION_ANCHORS`) y como bloque de biblioteca
`energy-efficiency` (sólo en la Ficha, `pages: ['ficha-propiedad']`), que en la
web lee la propiedad de la ficha (`FICHA_PROPERTY_KEY`, provista por
`pages/propiedades/[slug].vue`) y, sin datos, `SiteBlockRenderer` lo quita
entero (también su marco).

*Desplegable.* Con `collapsible` (de partida sí) el título es un botón
(`h2 > button`, `aria-expanded` y `aria-controls`) que pliega y despliega el
cuerpo (`energy-body`); `startOpen` (de partida sí) decide cómo llega, de modo
que una web ya publicada se ve igual que antes con un chevrón más. Plegado, la
cabecera enseña las clases de la vivienda (`energy-glance`) y el cuerpo sale
del árbol de accesibilidad (`visibility: hidden`), pero sigue en el HTML. Al
imprimir siempre va desplegado; con `prefers-reduced-motion` no anima.

*Imágenes.* Hasta `MAX_ENERGY_IMAGES` (6), cada una con `src`, `alt` y `caption`,
encima, debajo o al lado de la tabla (`imagesPosition`). Se suben desde el
inspector (`ImageListField.vue`, `POST /api/admin/upload`) o se eligen de la
biblioteca. Son del bloque (salen en todas las fichas) y, como el resto de
opciones, las sanea `normalizeEnergyImages` también en el servidor
(`validatePageDocument` y `sanitizeCoreOptions`): sólo claves de la biblioteca,
rutas del propio sitio o `http(s)`; nunca `javascript:` ni `data:`. Las
imágenes no hacen visible una tarjeta sin datos.

*Letra sin cifra.* Si hay letra de consumo o de emisiones pero no su valor, la
celda dice «Valor no indicado» (`energy-no-value`): no se inventa ninguna cifra.

**Secciones sin datos.** `utils/fichaVisibility.ts` decide qué secciones
tienen datos (`fichaSectionHasData`) con lo que devuelve la ficha
(`fichaDataContext`, que cuenta con las mismas funciones que pintan cada
tarjeta) y con `availability`, que calcula el servidor
(`server/utils/properties/publicDetail.ts`: Score con nota, dos o más precios
en el historial, otras propiedades vivas para similares). El entorno y las
similares avisan al cargar si vienen vacíos (`@empty`). Con `hideEmpty`, una
sección sin datos desaparece entera —también su pestaña en la barra de
apartados—; sin la regla, salen con su aviso, salvo las que no tendrían nada
que pintar (`FICHA_NEEDS_DATA`). El lienzo usa la misma función con la
propiedad de ejemplo (`GET /api/admin/site-pages/ficha-sample`, misma carga
que la ficha pública, `requireOrgScope`): en modo edición marca la sección con
«Esta sección se ocultará en la web pública porque la propiedad no tiene datos
disponibles»; en Vista previa la quita.

**«Atendido por» fijo.** En escritorio la tarjeta va en un hueco
(`.ficha-contact-rail`, `flex: 1`) que ocupa el resto de la columna derecha y
es `position: sticky` con `top` = altura real de la cabecera (`[data-site-header]`,
medida) + 16 px; si es más alta que la pantalla, se desplaza por dentro con la
cabecera del comercial fija (`stickyHead`), sin bloquear el scroll de la
página. En móvil va en el flujo. La CTA fija aparte de escritorio
(`ficha-desktop-cta`) se quitó; «Solicitar visita» está dentro de la tarjeta
(sólo con agenda) y en la barra inferior del móvil. El formulario añade
«Asunto» opcional, prellenado con la propiedad, que `/api/public/contact` ya
guarda en el mensaje, las notas del lead y el hilo.

## Ficha de propiedad editable (Cola 7)

La página «Ficha de propiedad» ya no enseña una maqueta con candado: el lienzo
pinta **la ficha real** (`components/ficha/FichaView.vue`, la misma que la web)
con la propiedad de ejemplo de la empresa, y cada parte de ella es un **nodo**
del Constructor. Los datos siguen viniendo de Propiedades; la plantilla guarda
sólo presentación y textos propios.

**Un solo registro.** `utils/siteBuilder/fichaNodes.ts` (`FICHA_NODES`) lista los
nodos y es la única fuente de verdad para la web, el lienzo, «Estructura», el
inspector y el servidor. Tres papeles:

| Papel | Qué es | Qué se puede cambiar | Qué guarda |
|---|---|---|---|
| `block` | El contenedor de una parte: galería, tarjeta principal, cada sección, precio, «Atendido por»… (`b.*`, `s.<sección>`) | Fondo, borde, esquinas, espaciado, por tamaño; las secciones, además, orden y visibilidad | `nodeStyles[campo]` |
| `text` | Un texto fijo de la plantilla: el título de una sección, «Descripción» (`t.*`) | Tipografía, color, alineación, espaciado y **el propio texto** (doble clic en el lienzo o el campo del inspector) | `nodeStyles[campo]` y `content[campo]` |
| `data` | Un dato de Propiedades: título, estado, ubicación, descripción (`d.*`) | Sólo cómo se ve; nunca se escribe encima (el inspector dice de dónde viene y enlaza a Propiedades) | `nodeStyles[campo]` |

**Cómo se marca.** `composables/useFichaNodes.ts` (`attrs('b.price')`) pone en el
elemento real `data-sb-node="<id del bloque>:<campo>"` y `data-sb-kind`, con el
tipo y la etiqueta sacados del registro; la plantilla sólo dice QUÉ nodo es
(`v-bind="n('b.price')"`). Los textos fijos usan `SbText` (edición inline) y las
tarjetas de sección (`components/property/SectionCard.vue`) reciben
`title-field`. Las tarjetas que la ficha reutiliza de otras partes (las de las
propiedades similares) se envuelven en `FichaNoNodes`: no son nodos de la plantilla.

**En la web.** `SiteBlockRenderer` envuelve el slot `core` con
`SiteCoreContext`, que provee el id del bloque a sus nodos sin pintar nada: así la
web lleva el mismo `data-sb-node` y la hoja de estilos generada
(`utils/siteBuilder/nodes.ts` › `buildNodeStylesCss`, con `@media` de tableta y
móvil) llega a los mismos elementos que en el lienzo. Sin estilos ni textos
guardados, la ficha se ve exactamente como antes.

**Qué guarda el servidor.** `validatePageDocument` (sólo en `ficha-propiedad`)
conserva los `nodeStyles` de los nodos del registro, saneados con `sanitizeNodeStyles`,
y los textos de los nodos `text` (`sanitizeFichaTexts`: sin saltos ni caracteres de
control, hasta `FICHA_TEXT_MAX`). Cualquier otra clave se descarta: ni datos de la
propiedad, ni nodos que no existen. En las demás páginas con zona dinámica no se
guardan estilos de nodo.

**Estructura.** Bajo la fila «Ficha de propiedad» cuelga el árbol de sus bloques
(`data-testid="ficha-tree"`): pulsar uno lo selecciona en el lienzo (con
desplazamiento hasta él) y abre su inspector con Contenido / Diseño / Avanzado;
cada sección tiene «Subir», «Bajar» y «Ocultar / Mostrar», que escriben en la
misma lista `sections` que ya lee la web, con deshacer y rehacer. El contenedor
raíz no se puede borrar ni ocultar: es lo único que protege el candado.

**Efectos reales.** En el lienzo y en Vista previa la ficha no envía ni reserva:
`PropertyContactCard` recibe `readonly`, y la barra fija móvil, el modal de
reserva y el recuento de visita sólo existen en la web (`mode === 'production'`).

**Pruebas.** `test/unit/fichaNodes.test.ts` (registro, textos, estilos, lo que
guarda el servidor y la hoja generada) y `tests/e2e/ficha-editable.spec.ts`
(lienzo real, árbol, selección en ambos sentidos, datos no editables, estilo por
tamaño, texto fijo, ocultar y reordenar, deshacer, persistencia, publicación y
aislamiento entre dos inmobiliarias).

### Opciones propias de cada bloque (Cola 7, paso 2)

Con un bloque seleccionado, la pestaña «Contenido» enseña **sus** opciones de
presentación (`components/site-builder/inspector/FichaBlockOptions.vue`; con
la zona entera seleccionada salen todas seguidas). Cada control cambia algo que
la web ya lee de la plantilla: no hay controles sin efecto.

| Bloque | Opciones | Dónde se guardan |
|---|---|---|
| Tarjeta principal (`b.summary`) | «Ref.» y descripción visibles | `showReference`, `showDescription` |
| Descripción (`b.description`) | Líneas visibles antes de «Ver más» (3, 4, 6, 8, 12) | `descriptionLines` |
| Datos clave (`b.keyfacts`) | Columnas en escritorio: en fila (de siempre), 2, 3 o 4 | `factsColumns` |
| Galería (`b.gallery`) | Altura, separación, esquinas, contador, «Ver todas», categorías, iconos, tipografía, acento | `gallery` |
| Eficiencia energética (`s.energia`) | Título, qué se enseña, desplegable, imágenes, escala (`EnergyOptionsFields`) | `energy` |
| Ubicación (`s.ubicacion`) | Altura del mapa: baja, normal, alta | `mapHeight` |
| Atendido por (`b.contact`) | Fondo (marca, blanco, color) y los textos: etiqueta, título, frase y botón | `contactTone`, `t.contact.*` |
| Propiedades similares (`b.similar`) | Mostrar «Propiedades destacadas» y su título | `showFeatured`, `featuredTitle` |

Las opciones de lista cerrada (`descriptionLines`, `factsColumns`, `mapHeight`)
viven en `FICHA_CHOICES` (`utils/siteBuilder/pages.ts`): un valor fuera de la
lista se descarta y lo que es igual a lo de partida no se guarda, así que una
ficha sin personalizar no cambia ni un byte.

**Lo que no se toca.** El formulario de «Atendido por» conserva campos,
validaciones, consentimiento, campo trampa antispam, lead, enrutado y asociación
con la propiedad y la inmobiliaria: sólo se reescriben sus textos (etiqueta,
título, frase y botón; el texto legal y los mensajes de error no son nodos). El
mapa no tiene zoom editable: una propiedad con ubicación aproximada no debe
revelar la exacta. Un texto reescrito vale para todos los idiomas.

**Avanzado.** Una sección se oculta y se mueve desde su inspector («Visibilidad y
orden»), con la misma lista `sections` que el árbol. Lo que la ficha necesita
(`FICHA_REQUIRED_NODES`: migas, galería, tarjeta principal con el título,
barra de apartados, precio con la próxima visita y «Atendido por») no se oculta
ni se mueve; sólo cambia de aspecto.

### «Previsualizar con» y visibilidad por tamaño (Cola 7, paso 3)

**Previsualizar con.** En la barra superior de la página «Ficha de propiedad»
(`components/site-builder/shell/FichaPreviewPicker.vue`) se elige con qué
propiedad se pinta el lienzo; de partida, la más reciente de la empresa. Es una
preferencia de la sesión del editor (`sessionStorage`), no del borrador:
cambiarla no cambia la plantilla ni crea cambios pendientes. El shell la manda al
lienzo en `set-state` (`previewPropertyId`) y `useFichaSample()` vuelve a pedir
`/api/admin/site-pages/ficha-sample?propertyId=`; una elegida que ya no existe cae
a la más reciente.

**Multiempresa.** `ficha-properties.get.ts` (el listado, con búsqueda `q`) y
`ficha-sample.get.ts` filtran siempre por la empresa activa (`requireOrgScope`) y
excluyen la papelera. Un `propertyId` de otra empresa y uno inexistente dan el
mismo 404 (no se confirma que exista); uno inválido, 400. La búsqueda escapa los
comodines de `LIKE`.

**Visibilidad por tamaño.** Una propiedad más de los estilos de nodo
(`display: 'none'`, `utils/siteBuilder/nodes.ts`) sigue la herencia de siempre:
oculto en Escritorio, lo está en Tablet y Móvil; oculto en Tablet, también en
Móvil; oculto sólo en Móvil, se ve en los otros dos. Se activa en «Avanzado» →
«Visibilidad por tamaño» con la vista del tamaño elegido, y no está disponible para
`FICHA_REQUIRED_NODES`.

**Pruebas.** `test/unit/fichaOpciones.test.ts` (opciones de lista cerrada, textos de
«Atendido por», bloques con opciones), `tests/e2e/ficha-inspector.spec.ts` (cada
bloque: opciones, lienzo, borrador, web publicada y formulario) y
`tests/e2e/ficha-previsualizar.spec.ts` (selector, aislamiento, plantilla intacta,
visibilidad por tamaño, tablet).

## Vista previa de la web y aviso de cookies

La vista previa de una web sin dominio (`?vista_previa=<id>`,
`server/utils/sitePreview.ts`) ya no pinta franja: la web se ve tal cual.

El aviso de cookies (`components/CookieConsent.vue`) es un modal real con
categorías (`utils/cookieConsent.ts`): Necesarias, Analíticas, Contenido de
terceros y, si la agencia configuró un píxel, Publicidad. El estado vive en
`composables/useCookieConsent.ts`; lo que se carga o se bloquea, en
`plugins/consent-scripts.client.ts` (GA4, píxel de Meta, limpieza al retirar),
`components/ConsentGate.vue` (vídeos y redes incrustados),
`plugins/utm-capture.client.ts` (`sa_ft`), `useFavorites` y el recuento de
visitas de la ficha (sin consentimiento: `anon`, sin cookie). La decisión se
guarda en `localStorage` (`inmo_cookie_consent`) con la organización y la
versión de la política (`consentVersion`: base + proveedores + revisión); la
vista previa usa su propia clave y no carga analítica.

Los proveedores por agencia viven en `site_settings` (migración 0092) y se
editan en el Constructor (icono de la galleta → `CookieSettingsPanel.vue`,
«Privacidad, cookies y avisos», `/api/admin/site-settings`, área `web`). La CSP
sólo abre los orígenes de Google o Meta en las páginas de una web que los
configuró (`server/utils/siteSettings.ts` › `cspOriginsForProviders`). «Ver el
aviso en el lienzo» manda `cookie-preview` al lienzo, que pinta
`<CookieConsent sandbox>`: funciona igual, no guarda nada ni carga nada.

### Presentación configurable del aviso de cookies y aviso de demostración

El aspecto del aviso —no su lógica— es configurable por inmobiliaria
(`utils/siteConsent.ts`): textos por idioma (vacío = el de `i18n/messages.ts`
en ese idioma), logo (Brand Kit → isotipo → empresa, o uno propio), colores
(de partida blanco cálido y el color de marca oscurecido hasta que el blanco
se lea, `cookiePalette`), radio, sombra, forma de los botones, iconos discretos
por categoría (`CookieCategoryIcon.vue`), tipografía,
espacios, posición (`center` | `bottom-right` | `bottom-left` | `bottom`
banner), anchura y altura máximas, separación de los bordes, comportamiento en
el móvil (`sheet` | `full`) y animación (`fade` | `slide` | `none`; con
`prefers-reduced-motion`, ninguna). Lo que NO se puede configurar, a propósito:
los tres botones y su orden, nada premarcado ni cargado antes de decidir, los
enlaces legales, la X sólo con decisión. `consentVersion` no mira nada de esto:
cambiar el diseño no vuelve a preguntar a nadie.

Se guarda como el pie: un documento de `site_pages` con la clave reservada
`consent` (`{ consent: { cookie, demo } }`, `server/utils/siteConsent.ts`),
con borrador (`PUT /api/admin/site-consent`, autoguardado), publicación
(`POST /api/admin/site-consent/publish`, con «Publicar» del shell) e
historial; la web lee sólo lo publicado (`GET /api/public/site-consent`, con
el logo y el color de la empresa) una vez por página (`useSiteConsent`). Sin
migración.

En el Constructor, `CookieSettingsPanel.vue` tiene las dos entradas de la
configuración global: «Privacidad y cookies» (`CookieNoticeInspector.vue`) y
«Avisos y demostración» (`DemoNoticeInspector.vue`), que seleccionan las zonas
globales `cookie` y `demo` (como `footer`); también se abren pulsando la muestra
en el lienzo. El inspector manda al lienzo el estado de la muestra
(`cookie-preview` con `view: summary | settings | saved`) y el lienzo recibe el
borrador en `set-state` (`consent`, `consentMeta`).

El aviso de demostración (`components/DemoNotice.vue`) sólo existe en la web de
una cuenta demo (`tenant.isDemo`, decidido en el servidor): tarjeta compacta,
fija en una esquina (arriba se coloca debajo de la cabecera real, nunca encima
del menú; capa 60, entre el chat y el aviso de cookies), con título, texto
honesto, icono y cierre (recordado en `sessionStorage` o `localStorage`,
`demoNoticeStorageKey(org)`, o no recordado). La agencia puede desactivarlo:
no es un aviso legal.

## El Block Inspector: un componente por tipo de bloque, no un formulario genérico

El panel derecho (`components/site-builder/inspectors/*.vue`) es un registro,
no un componente gigante con condicionales por tipo. Cada tipo de bloque
tiene su propio archivo — `HeroInspector.vue`, `PropertiesInspector.vue`,
etc. — registrado en `BLOCK_INSPECTORS`
(`composables/useSiteBuilderRegistry.ts`). El shell solo hace
`<component :is="inspectorFor(selectedBlock.type)?.component" :content="..." />`;
no sabe ni le importa qué campos tiene cada bloque.

Cada inspector organiza sus propios campos en secciones plegables
(`components/site-builder/inspector/InspectorSection.vue`) usando nombres
como Contenido / Multimedia / Diseño / Datos / Responsive / Comportamiento —
un inspector simplemente no incluye la sección que no necesita, así que
nunca hay categorías vacías dentro de una sección. Los controles reutilizables
(texto, toggle, select, segmented, slider, selector de color limitado,
contador con `−`/`+` para cantidades pequeñas y acotadas, selector visual de
diseño con miniaturas, imagen con subir/sustituir/eliminar/biblioteca,
galería con reordenar por drag & drop) viven en
`components/site-builder/inspector/fields/` — están para componerse dentro
de cada inspector, no para sustituirlo por una lista de campos genérica.
Deliberadamente no hay ningún control de CSS, clases o JSON arbitrario en
todo este árbol: cada opción nueva es un control visual concreto o no se
añade.

**Pestañas Contenido / Diseño / Avanzado**: el panel no muestra todas las
secciones a la vez — el shell mantiene un `inspectorTab` reactivo
(`'content' | 'design' | 'advanced'`, se reinicia a `'content'` cada vez que
cambia la selección) y lo expone con `provide('inspectorTab', ...)`.
`InspectorSection.vue` lo consume con `inject` y solo se renderiza si su
prop `tab` (por defecto `'content'`) coincide con la pestaña activa — así
cada inspector solo necesita añadir `tab="design"` a la sección que
corresponda, sin que el shell tenga que conocer la estructura interna de
cada uno ni haga falta enhebrar una prop nueva por los 9 componentes. Los
inspectores sin opciones de diseño propias muestran un mensaje explícito en
esa pestaña en vez de quedar en blanco sin explicación. "Avanzado"
(`CommonBlockSettings`, ver abajo) vive en su propia pestaña, ya no como la
última sección colapsada de una lista larga.

`ImageField`/`GalleryField` (`components/site-builder/inspector/fields/`)
suben a través del mismo `POST /api/admin/upload` que el resto del admin
(carpeta `site-builder`, categoría `upload` en `media_assets`) o reutilizan
la Biblioteca de medios existente (`GET /api/admin/cms/media`, tabla
`cms_media` — un modelo de medios distinto y más antiguo que `media_assets`,
pensado para esto). Ninguno de los dos crea almacenamiento nuevo.

**Opciones comunes ("Avanzado")**: `CommonBlockSettings.vue` — ancla, fondo,
espacio extra arriba/abajo, visibilidad por dispositivo — se añade una sola
vez, por el shell, después del inspector específico de cada bloque, así que
todo tipo de bloque las tiene gratis sin que su propio inspector tenga que
declararlas. Se guardan en `block.style` (ya existía en el tipo `SiteBlock`,
sin usar hasta ahora) y las aplica `SiteBlockRenderer.vue` en el `<div>`
envolvente de cada bloque — en los tres modos (`production`, `builder`,
`preview`), porque son estilo publicado real, no una decoración del editor.
El espaciado extra es siempre *aditivo* sobre el padding propio de cada
bloque (nunca lo reemplaza), así que un bloque sin estas opciones tocadas
se ve exactamente igual que antes de que existieran.

**Editar sin navegar (`mode="builder"`)**: dentro del lienzo, un clic en
cualquier parte de un bloque debe *seleccionarlo*, nunca ejecutar su
comportamiento real — un enlace de propiedad, un botón de CTA, una tarjeta
clicable. `SiteBlockRenderer.vue` intercepta esto en `wrapperAttrs()` con un
`onClickCapture` (fase de captura, no burbuja) sobre el `<div>` envolvente de
cada bloque, llamando `preventDefault()` + `stopPropagation()` antes de que
el clic llegue al elemento real anidado (un `<NuxtLink>`, un botón con su
propio `@click`…) — así ningún tipo de bloque necesita su propio parche: la
intercepción es arquitectónica, a nivel del wrapper, no por componente. En
`mode="preview"` (y en `production`) `wrapperAttrs()` no añade ni el
`onClickCapture` ni el contorno de selección — el clic llega intacto al
elemento real, exactamente como en el sitio publicado. Al pasar el ratón
sobre un bloque en `builder` aparece además una etiqueta discreta con su
nombre (`blockLabel(block.type)`), solo para orientar, sin afectar al clic.
Cabecera/pie no están en este lienzo (ver más arriba), así que no hay nada
de navegación de menú que interceptar todavía; si se añaden aquí en el
futuro, heredan esta misma protección sin cambios, por ser el mismo `<div>`
envolvente de bloque.

**Añadir un tipo de bloque nuevo**: entrada en `BLOCK_PRESETS`
(`composables/useSiteBuilderRegistry.ts`) con su `createContent()` por
defecto; un componente en `components/site-builder/blocks/` que lo dibuje a
partir de `content` (y de `homeData` si necesita datos en vivo); una rama en
`SiteBlockRenderer.vue`; un componente en `components/site-builder/inspectors/`
con sus propias secciones, registrado en `BLOCK_INSPECTORS`. Nada en
`pages/admin/site-builder/index.vue` necesita cambiar.

**Nunca**: guardar filas de `developer_properties`/`communities`/`blogs`
dentro de `content` — solo criterios de selección. El patrón es
`dynamicFilter` (con sub-criterios como `dynamicCommunity`/`dynamicType`) o,
para selección manual, `manualIds: number[]` — ambos resueltos en vivo en el
renderer contra la tabla real, nunca guardados como snapshot.

`dynamicType` guarda la clave del catálogo común de tipos (`PROPERTY_TYPES`
en `utils/propertySheet.ts`: `Apartment`, `Studio`…), la misma que guarda la
propiedad. El inspector ofrece **todo** el catálogo con su rótulo en
castellano y el recuento actual (`propertyTypeOptions`), no sólo los tipos
que ya tienen propiedades. Antes listaba únicamente esos, con la clave en
inglés, y no se podía preparar una sección para un tipo todavía vacío.

## Formulario de valoración de propiedad («Vender Propiedad»)

Bloque `seller-valuation` (`components/site-builder/blocks/SellerValuationBlock.vue`,
inspector `SellerValuationInspector.vue`, reglas puras en
`utils/sellerValuation.ts`). Sólo se ofrece en la página `vender`, donde es el
contenido de partida en lugar del formulario de captación anterior (las páginas
ya publicadas con `lead-form` no cambian).

- **Seis pasos con progreso real**: tipo, ubicación, superficie y distribución,
  características y estado, información adicional y contacto. Un tipo sin
  preguntas en un paso (un terreno no tiene «características») no lo enseña y
  el contador lo refleja.
- **Sin segundo catálogo**: tipos, grupos y subtipos son `PROPERTY_TYPES`,
  `PROPERTY_TYPE_GROUPS` y `PROPERTY_SUBTYPES` (`utils/propertySheet.ts`); cada
  pregunta lleva el nombre del campo real de la ficha. Una prueba comprueba que
  cada tipo tiene preguntas y que cada una es un campo que el esquema de ese
  tipo declara en `server/utils/propertySchema/registry.ts` (en suelo, la
  superficie es `plotArea`, no `area`).
- **Ubicación**: el autocompletado geográfico de la plataforma
  (`LocationAutocomplete`, `/api/public/location-suggest`).
- **Lead real**: `POST /api/public/contact` con `form: 'seller'` y `valuation`.
  El servidor valida otra vez (`validateSellerValuation`), exige
  `privacyAccepted`, y el resumen fiel de lo contado es el mensaje original del
  lead y el cuerpo del hilo «Formulario web»; los campos van uno a uno en el
  hilo (`answer.<campo>`) con la fecha del consentimiento. El contacto recibe el
  rol `seller`. No se crea ninguna propiedad y no hay motor de valoración: la
  confirmación no lleva cifras. Antispam: campo trampa, límite de tasa por IP e
  identificador de envío (un doble clic no duplica).
- **Fotos opcionales**: `POST /api/public/contact?channel=seller-photo&submissionId=…`
  (una rama del endpoint, no una ruta nueva). Tipo por los bytes (JPG, PNG,
  WebP), 5 MB, 6 por envío, cuota de la agencia; privadas, registradas en
  `media_assets` y enlazadas al lead al enviar (`entity_type = 'lead'`). Sólo se
  enlazan las claves que ese envío subió a esa agencia.
- **Constructor**: textos editables en el lienzo; en el inspector, qué tipos se
  ofrecen, qué preguntas opcionales salen y cómo se llaman, y fotos sí/no. La
  superficie, el nombre, el email y la privacidad no se pueden quitar. En el
  lienzo y en Vista previa se recorren los pasos pero no se envía nada.
- **Eventos**: `inmo:seller-valuation` (paso y envío) sólo si el visitante dio
  su consentimiento de analítica.
- **Sin migración.** Pruebas: `test/unit/sellerValuation.test.ts` y
  `tests/e2e/vender-valoracion.spec.ts`.

## Exposición solar de la ficha

Sección `exposicion` de la ficha de propiedad (`FICHA_SECTIONS`, justo bajo la
ubicación también en las webs que ya guardaron su orden). La tarjeta es
`components/property/SolarExposureCard.vue`: SunScore 0–100 en un círculo
dorado (`#c6a667`), valoración con palabras (cinco tramos fijos de INMO), una
frase que sólo dice lo que dicen los datos, gráfico de junio y diciembre, enlace
«Ver simulación solar 3D» (pestaña nueva; sólo https y dominios del proveedor,
nunca incrustado) y atribución «Proporcionado por …».

- **Contrato y reglas puras**: `utils/solarExposure.ts` (`normalizeSolarExposure`
  descarta el dato entero si la puntuación no está en 0–100 o las horas no son doce
  valores de 0 a 24).
- **Servicio**: `server/utils/solar/service.ts`. Un proveedor sólo se llama con
  `access: 'ready'`. **Shadowmap no lo está**: su API «Sunscore for any building»
  se concede a socios en alta temprana y no publica endpoints ni autenticación, así
  que su adaptador no hace ninguna petición. Cuando haya licencia sólo cambia ese
  adaptador. Caché en memoria del Worker (24 h el acierto, 1 h la ausencia, por
  empresa y coordenadas redondeadas); un fallo no rompe la ficha y no se loguea
  el detalle. **Privacidad**: sólo coordenadas exactas (`locationPrivacy = exact`).
- **Sin dato real, la sección no sale** (`FICHA_NEEDS_DATA`), aunque «Ocultar si no
  hay datos» esté apagado; `GET /api/public/properties/<slug>` devuelve `solar: null`.
- **Constructor**: `ficha-sample` añade datos de DEMOSTRACIÓN (`demo: true`,
  rotulados) para poder diseñar la tarjeta; la web pública nunca los recibe. El
  inspector enseña el estado del proveedor y no permite editar la puntuación.
- **Sin migración.** Pruebas: `test/unit/solarExposure.test.ts` y
  `tests/e2e/exposicion-solar.spec.ts`.
