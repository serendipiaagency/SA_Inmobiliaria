# Documentos y multimedia de la propiedad

Núcleo inmobiliario, bloque N7a: FASE 6 (legal y documental), FASE 7
(multimedia), FASE 25 (UX de la ficha) y FASE 26 (PropertySchemaRegistry).
Ver [`auditoria-nucleo-megaprompt.md`](./auditoria-nucleo-megaprompt.md).

**Sin migraciones nuevas y sin rutas nuevas.** Las tablas las creó la 0086
(`property_documents`, `property_document_access`, `property_media` y los
metadatos de `images` / `property_gallery_images`). Todo se sirve con el
motor CRUD genérico (`server/api/admin/[resource]/**`) y con endpoints que ya
existían, ampliados con parámetros.

## Documentos (FASE 6)

Paso **«Documentos»** del editor, igual en los dos catálogos
(`components/admin/property/PropertyDocumentsManager.vue`). Lógica en
`server/utils/properties/documents.ts`.

### Qué guarda cada documento

Tipo (escritura, nota simple, IBI, certificado energético, planos, contrato,
mandato, licencias, recibos, comunidad, otros), título, fechas de emisión y
caducidad, notas, visibilidad, y su fichero (PDF o imagen escaneada, hasta
20 MB). El fichero, su nombre, su tipo, su tamaño y el autor los fija el
servidor: no son campos editables.

### Quién lo ve

Cada nivel incluye a los anteriores (`documentAccessLevel` en
`utils/propertyMediaCatalog.ts`):

| Visibilidad | Quién puede descargarlo |
|---|---|
| Interno | Usuarios del panel de la agencia con lectura de propiedades (área `web`) |
| Propietario | + los contactos **propietario** o **copropietario** (vivos) de esa propiedad en `property_contacts` |
| Comprador autorizado | + los contactos con fila en `property_document_access` (se concede y revoca desde el panel) |
| Público | + cualquiera, **sólo** si la propiedad está publicada (`publishedAt`) y viva |

Los contactos no tienen cuenta en el panel: descargan desde **«Mi cuenta»**
(el portal de cliente que ya existía, `/mi-cuenta`), entrando con una cuenta
de rol «usuario» cuyo email coincide con el de su contacto en la agencia — el
mismo criterio que ya usaba ese portal para visitas y contratos.

Nunca se sirve:
- un documento en la papelera (tampoco al equipo);
- un documento de otra agencia (404, nunca 403);
- a un contacto o al público, un documento de una propiedad en la papelera
  (el equipo sí: es historia).

Un acceso concedido sólo cuenta mientras el documento sea «comprador
autorizado» o «público»; con «interno» o «propietario» se conserva y el panel
avisa de que no tiene efecto.

### API (sin rutas nuevas)

| Acción | Llamada |
|---|---|
| Subir (fichero + metadatos, una petición multipart) | `POST /api/admin/property-documents/private-upload` — la subida privada que ya existía para `team-member-documents`, ampliada a este recurso. Campos: `file`, `propertyKind`, `propertyId`, `docType`, `title`, `visibility`, `issuedAt`, `expiresAt`, `notes` |
| Listar | `GET /api/admin/property-documents?propertyKind=…&propertyId=…` (`&trashed=1` para la papelera). Cada fila trae etiquetas, `expiryState`, `downloadUrl`, `grants` y `createdByName` |
| Ver uno | `GET /api/admin/property-documents/:id` (con sus accesos concedidos) |
| Editar metadatos | `PUT /api/admin/property-documents/:id` (`docType`, `title`, `visibility`, `issuedAt`, `expiresAt`, `notes`). La propiedad no cambia (422) |
| Conceder / revocar | `PUT /api/admin/property-documents/:id` con `{ action: 'grant' \| 'revoke', contactId }` |
| Papelera / restaurar / borrar | `DELETE …/:id`, `POST …/:id/restore`, `DELETE …/:id?hard=1` |
| Descargar | `GET /api/media/<clave>` — ver abajo |

Un `POST /api/admin/property-documents` con JSON (sin fichero) responde 422:
un documento nace con su fichero.

### Validaciones

- Propiedad de la agencia (404) y viva para **crear** o **conceder** (422,
  «La propiedad está en la papelera: restáurala antes de…»). Editar
  metadatos de un documento existente se permite aunque la propiedad esté en
  la papelera; conceder sobre un documento en la papelera, no (422).
- Fichero: el de siempre (`storeAndRegisterFile`): bytes mágicos, PDF que
  abre (`pdfValidation.ts`), imagen con dimensiones reales
  (`imageValidation.ts`), tamaño y cuota de la agencia. Todo **antes** de
  escribir en R2.
- Fechas `AAAA-MM-DD`; la caducidad no puede ser anterior a la emisión.
- Contacto de la agencia y vivo para conceder (404 si no).

### Ficheros, papelera y borrado

El fichero va a R2 bajo `tenants/<org>/property-documents/<uuid>.<ext>` y se
registra en `media_assets` como `confidential`, categoría
`property-document`, `entityType = property_documents` y `entityId` = el
documento. Cada lectura con sesión queda en `media_access_log` (concedida o
denegada).

- **A la papelera**: el documento deja de servirse y su fichero deja de
  contar en la cuota (`softDeleteMediaAsset`). Si no se restaura en 30 días,
  el cron `media-lifecycle` borra el objeto de R2.
- **Restaurar**: devuelve el fichero (`restoreMediaAssetByKey`); si el cron
  ya lo purgó, 409 y el documento sigue en la papelera.
- **Eliminar definitivamente**: borra el objeto de R2 en el acto, sus
  accesos concedidos y la fila.
- **Borrar definitivamente la propiedad** se lleva sus documentos y ficheros.

### Descarga: el endpoint de media manda al documento

`server/api/media/[...key].get.ts`: si el fichero es de este gestor
(`entityType = property_documents`), no decide su `visibility` sino
`decideDocumentAccess()` con quien lo pide — equipo (organización activa y
lectura de propiedades), cliente de «Mi cuenta» (su email, dentro de su
agencia) o anónimo. Se sirve `no-store` y como descarga con el nombre del
fichero. Con `?ver=1` (#110), un PDF o una imagen (`INLINE_DOCUMENT_TYPES`:
pdf, jpeg, png, webp) se sirve `inline`, para el «Ver» de «Documentación
disponible» de la ficha pública; el permiso se decide igual. Otro tipo se
descarga siempre.

### Caducidad

`documentExpiryState()`: caducado si la fecha ya pasó, «caduca pronto» en los
próximos 30 días, vigente o sin caducidad. La ficha lo avisa en el paso
«Documentos» y en el resumen de la cabecera. Un documento «Público» caducado
deja de salir en la ficha pública (`listPublicPropertyDocuments`, #110).

### Planos (#110)

Los planos son las filas del paso «Planos» del editor: `floor_plans` (obra
nueva) y `agent_property_floor_plans` (2ª mano). La migración 0091 les añade
`title`, `sort_order` e `is_public` (por defecto 1: los que ya había siguen
visibles, como ya lo eran por la API). `normalizeFloorPlan`
(`server/utils/properties/floorPlans.ts`, el `prepare` del recurso genérico)
recorta el título a 120 caracteres, deja el orden en un entero ≥ 0 y la
visibilidad en 0/1. Lo que no llega en un `PUT` no se toca. En el editor,
`ChildCardManager` ordena por `sortOrder` con flechas ← → y marca «Oculto en
la web».

La API pública (`listPublicFloorPlans`) devuelve sólo los visibles con
imagen, por `sort_order` e `id`, y sólo `id`, `title`, `image`, `sizes` y
`floorDetails`; antes devolvía la fila entera. El título que se lee es el
suyo, o la categoría, el tipo de unidad o «Plano N» (`floorPlanTitle`). La
ficha los pinta en «Plano de la vivienda» (`components/property/FloorPlans.vue`,
sin recortar) y en la pestaña «Plano» de la galería, con el mismo visor
(`FloorPlanViewer.vue`: zoom con botones, rueda, doble clic y pellizco,
arrastre, teclado y bloqueo del scroll). Es el mismo recurso, no una copia.

### Ficha del contacto y «Mi cuenta»

`GET /api/admin/saas/contacts/:id` → `documents`: lo que esa persona puede
ver y **por qué** (`accessVia`: propietario, concedido o público), más los
concedidos que hoy no dan acceso, marcados. Antes listaba todos los
documentos de cualquier propiedad en la que figurara (también como inquilino
o contacto) sin mirar la visibilidad, y su `IN (…)` no se troceaba. Ahora va
por `listContactDocuments()` con `selectInChunks`.

`GET /api/client/dashboard` → `documents`: lo mismo, sólo lo que da acceso y
sin la referencia interna de la propiedad.

## Multimedia (FASE 7)

### Fotos de galería

`images` (obra nueva, recurso `project-images`) y `property_gallery_images`
(2ª mano, `gallery-images`) tienen ahora en el panel **título, alt, pie,
idioma, publicable, privada y oculta** (`components/property-builder/GalleryManager.vue`
→ «Datos»), además del orden y la portada de siempre. Selección múltiple con
ocultar / mostrar, privadas, publicables, descargar y eliminar. La galería se
pide filtrada por la propiedad (`filterFields`), no 100 filas de toda la
agencia filtradas en el navegador.

### Vídeos, tours, renders, PDF, drone y 360

`property_media` (recurso `property-media`,
`components/admin/property/PropertyMediaManager.vue`, debajo de la galería en
el paso «Galería y multimedia»):

| Tipo | Fuente |
|---|---|
| Vídeo (los que hagan falta) | enlace `https://` o vídeo subido (MP4/WebM, subida por partes) |
| Tour virtual | enlace `https://` (Matterport, Kuula…) |
| Render | imagen subida o enlace |
| PDF | PDF subido |
| Drone | imagen o vídeo subidos, o enlace |
| Foto 360° | imagen subida (equirectangular) |

Cada recurso: título, alt, pie, idioma, principal (uno por tipo), publicable,
privado y oculto. Validado en `validatePropertyMedia()`: propiedad de la
agencia y viva para crear (422), fuente que el tipo admite, enlace `https://`,
y un fichero que exista en `media_assets` **de esta agencia** (404 si no) y
con el formato del tipo. Papelera con el mismo trato del fichero que los
documentos.

### Qué sale fuera del panel

Un recurso o una foto sale en la web y en los portales sólo si es
**publicable, no privado y no oculto** (`isPublicMediaRow`):

- ficha pública (`/api/public/properties/:slug`): `gallery` y `media`
  filtrados y en su orden, `documents` públicos y `details` (ver FASE 26);
- tarjetas, portada, listado, similares, widget, API v1 y vista previa del
  Constructor Web (`attachPhotos`);
- la condición «mínimo de fotos» de la publicación multicanal;
- lo que se entrega a un portal (`buildPortalListing`).

**Privado** además cambia el fichero: `media_assets.visibility` pasa a
`private` (sólo sesión del panel de la agencia) mientras todas sus
referencias vivas sean privadas; si la misma imagen es, por ejemplo, la
portada, sigue pública (`syncMediaKeyVisibility`).

En la web pública (`components/MediaGallery.vue`):
- **360°** sólo aparece con un tour virtual o una foto 360 reales. Antes
  simulaba el tour arrastrando la primera foto aunque no hubiera ninguno.
- **Vídeo**: todos los publicables (el `videoUrl` de siempre más los de
  `property_media`); un enlace externo se abre aparte (la CSP no permite
  incrustar YouTube/Vimeo), uno subido se reproduce.
- **Drone**: la foto aérea de siempre más las tomas de drone.
- **Renders**: pestaña propia si hay alguno.
- **Documentación**: los PDF publicables y los documentos públicos, con la
  propiedad publicada.

### Borrar una foto ya no deja huérfanos

Antes, borrar una foto (o un plano) eliminaba la fila y dejaba el objeto en
R2 y su `media_assets` vivos para siempre. Ahora el borrado genérico
(`[id].delete.ts`) llama a `releaseMediaKeyIfUnreferenced()`: si ninguna otra
ficha de la agencia usa esa clave (otra foto —una promoción duplicada
comparte las claves de su galería—, la portada, un plano o un recurso
multimedia), el `media_assets` se borra con el mecanismo de siempre
(`softDeleteMediaAsset`: deja de servirse y de contar en la cuota al
momento, y `media-lifecycle` borra el objeto de R2 al acabar la gracia). Lo
mismo al sustituir o quitar la imagen de una columna de la propiedad
(portada, foto aérea…) y al borrar definitivamente una propiedad. Nunca se
toca un fichero de otra agencia, un enlace externo ni una clave sin
registro.

## Resumen y portales (FASE 25)

- **Resumen** (`components/admin/property/PropertySummaryHeader.vue`, encima
  de los pasos al editar): estado (y estado comercial, exclusiva, reservada,
  operación), precio, canales, propietarios, compradores compatibles, ofertas,
  documentos (caducados y a punto de caducar), multimedia publicable y qué
  falta para publicar (registro de esquemas). Lo sirve
  `GET /api/admin/<recurso>/:id?view=summary`; lo de CRM sólo si la cuenta
  puede leer el CRM.
- **Portales** (paso propio, `PropertyPortalsPanel.vue`): la web propia y
  cada canal del sistema de publicación multicanal con el estado de su último
  trabajo (`publication_jobs`): publicada, programada, retirada, error,
  bloqueada o sin programar, y si el canal tiene integración real. Ninguno la
  tiene hoy (`docs/publication-channels.md`) y el panel lo dice. En 2ª mano
  no hay web pública ni programaciones, y también lo dice.
- **Defaults inteligentes** al crear (`GET /api/admin/<recurso>?view=defaults`):
  venta, ubicación exacta, el país y la localidad más habituales de la
  agencia y el comercial vinculado a la cuenta con su oficina y equipo. Sólo
  rellena lo vacío.
- **Validación inmediata por campo** (`utils/propertyFieldValidation.ts` en
  `PropertyBuilderField.vue`): obligatorio, rangos de la ficha ampliada,
  enteros, `https://` y fechas, dicho junto al campo mientras se escribe.
- **Campos condicionales en los dos catálogos**: el editor de obra nueva
  también filtra con el registro (ver abajo).

## PropertySchemaRegistry (FASE 26)

- `publicFields(schema)` / `portalFields(schema)` en
  `server/utils/propertySchema/registry.ts`.
- **Proyección pública** (`toPublicProperty`, `server/utils/propertyPrivacy.ts`):
  de lo que el registro declara para el catálogo sólo sale lo que está en
  `publicFields` del esquema resuelto (catálogo + tipo); la estructura de la
  fila que el registro no modela (id, slug, fotos, fechas) sigue pasando, y la
  lista `INTERNAL_ONLY_KEYS` se elimina siempre. `toPublicSheet` hace lo mismo
  con la ficha ampliada, pero **sólo** con lo declarado.
- **Portales / feeds** (`server/utils/publication/listing.ts`,
  `buildPortalListing`): sólo `portalFields`, con la privacidad de ubicación
  aplicada y la multimedia publicable. El dispatcher lo entrega al adaptador
  en `PublishContext.listing`; un adaptador real publicará eso, nunca la fila.
- **Los dos catálogos usan el registro en el editor**: obra nueva resuelve a
  `newDevelopment` o, si el tipo es suelo, local/oficina, nave o garaje, a su
  variante de obra nueva (identificación, construcción y multimedia del
  proyecto + superficies, estado, instalaciones y legal del tipo). La
  validación de publicar usa la misma variante.

## Autorización

Lo que cambia y hay que saber:

1. `/api/media/<clave>` tiene una rama nueva para los ficheros de documentos
   de propiedad: además del equipo de la agencia, puede servir a un cliente
   de «Mi cuenta» (rol `user`) cuyo email coincide con un contacto
   propietario o autorizado, y al público un documento público de una
   propiedad publicada y viva. Fuera de esa rama, el endpoint no cambia.
2. «Privado» en una foto o recurso cambia `media_assets.visibility` del
   fichero a `private`.
3. No cambia `requireOrgScope()`, ni la autenticación, ni la matriz RBAC: los
   recursos nuevos están en el área `web` (lectura para ver, escritura para
   cambiar) por el motor genérico y `adminRouteMatrix`.

## Pruebas

- `test/unit/nucleoN7a.test.ts`: permisos de descarga por visibilidad (ajeno
  y papelera incluidos), conceder/revocar, subida validada, caducidad,
  metadatos de multimedia y su efecto en lo público, privado de verdad,
  borrar fotos sin huérfanos (también con claves compartidas), borrado
  definitivo de la propiedad, `publicFields` / `portalFields`, variantes de
  obra nueva, resumen, defaults y validación por campo.
- `test/unit/multitenant.crossTenant.test.ts`: los dos recursos nuevos en la
  matriz de ataque entre agencias.
- `tests/e2e/nucleo-n7a.spec.ts` (sin ejecutar en este bloque).
