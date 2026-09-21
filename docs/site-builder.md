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
├─ pageKey             'home' hoy — el modelo admite más páginas, aún sin UI
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
`communities`, `property-types`, `mortgage-calculator`, `blog-list`, `team`
(con `layout: cards | compact`), `lead-form`, `book-visit`, `text`, `cta`. El
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
mismo tipo son indistinguibles entre sí. Debajo, la sección "Páginas" separa
visualmente la Estructura (los bloques de Inicio) de las páginas reales del
sitio; hoy solo Inicio es editable con el Constructor Web
(`server/utils/sitePages.ts` rechaza cualquier otro `pageKey`), así que el
resto se lista solo para orientar — deliberadamente sin un CRUD de páginas
que el backend no soporta todavía.

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

El lienzo pinta ahora `SiteHeader` y `SiteFooter` (con `tenantOverride`, la
marca de la organización que se edita, no la del host del panel) dentro de
`SiteGlobalZone.vue`, con `transparentHero` como la portada real: lo que se
ve es la página completa. Son **elementos globales** del sitio, no de Inicio:
pulsarlos los selecciona y el inspector (`GlobalZoneInspector.vue`) explica
que aparecen en todas las páginas y dónde se cambian (logo y nombre en
Sistema → Empresas; los datos legales en Privacidad). No se crea una copia
divergente para Inicio.

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
