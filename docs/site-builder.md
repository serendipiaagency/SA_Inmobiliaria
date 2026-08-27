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
├─ draftJson            { blocks: SiteBlock[], seo: {title, description} }
├─ publishedJson         mismo shape, o null si nunca se publicó
├─ version               se incrementa en cada Publish
├─ publishedAt, publishedBy
└─ createdAt, updatedAt

site_page_versions      ← un snapshot por Publish (no por autoguardado)
├─ id, pageId, version, snapshotJson, publishedBy, createdAt
```

Un `SiteBlock` es `{ id, type, version, content, style?, visibility? }`. El
orden en el array ES el orden de la página — no hay un campo `order` que
mantener sincronizado. `visibility` es `{desktop?, tablet?, mobile?}`;
ausente = visible en todos.

No hay id-en-URL para `site_pages`: cada endpoint de `/api/admin/site-pages/*`
resuelve la fila únicamente a partir de `requireOrgScope()` (la sesión) más
`pageKey`. No existe una forma de pedir "la página de otro tenant" —
`test/unit/sitePages.crossTenant.test.ts` y el bloque de
`tests/e2e/cross-tenant.spec.ts` sobre el Constructor Web prueban esto contra
dos tenants reales.

## Bloques disponibles hoy

`hero`, `map-teaser`, `properties` (con `layout: row | dark-grid | ai-grid`),
`communities`, `property-types`, `mortgage-calculator`, `blog-list`, `text`,
`cta`. El catálogo — con su icono de categoría y su contenido por defecto —
vive en `composables/useSiteBuilderRegistry.ts` (`BLOCK_PRESETS`). Añadir un
bloque nuevo es: una entrada en `BLOCK_PRESETS`; un componente en
`components/site-builder/blocks/*.vue` (renderer, usado tal cual en
producción y en el lienzo); una rama en `SiteBlockRenderer.vue`; un
componente en `components/site-builder/inspectors/*.vue` (su propio Block
Inspector, ver más abajo) registrado en `BLOCK_INSPECTORS`. Nada más del
builder necesita tocarse — ese es el punto del registro.

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
- **Atajos de teclado**: Ctrl/Cmd+Z y Ctrl/Cmd+Shift+Z (también Ctrl+Y) para
  deshacer/rehacer, ignorados mientras el foco está en un `<input>`/
  `<textarea>` para no interferir con el undo nativo del navegador dentro de
  un campo de texto.

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
