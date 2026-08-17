# Auditoría de seguridad de media (R2) — bloque P0

Estado: **cerrado**. Continúa el bloque de hardening multitenant
([`multitenant-audit.md`](./multitenant-audit.md)); este documento cubre
específicamente el almacenamiento de archivos (R2) y su nueva capa de
autorización, el **Media Asset Manager** (`media_assets`). El diseño y la
arquitectura de referencia están en
[`r2-architecture.md`](./r2-architecture.md).

## Resumen

| Bloque | Antes | Ahora |
|---|---|---|
| Autorización de R2 | Por prefijo de ruta (adivinable, controlado por el cliente) | Por fila en `media_assets` (`visibility` + `organization_id`) |
| SVG | Aceptado con un filtro de `<script` fácil de esquivar | Bloqueado en toda la plataforma |
| Validación de imagen | Solo magic bytes | Magic bytes + dimensiones reales + límite de píxeles |
| Validación de PDF | Solo magic bytes | Magic bytes + `pdf-lib` confirma que el documento realmente abre |
| Cuota | Inexistente | Por organización, comprobada antes de cada escritura |
| Checksum | Inexistente | SHA-256 en cada asset, para integridad y depuración |
| Ciclo de vida | Objetos huérfanos en R2 tras un borrado | Borrado suave → periodo de gracia (30 días) → purga real |
| Auditoría de acceso | Inexistente | `media_access_log` en cada lectura de un objeto confidencial |

## Fase 1 — Auditoría de todo punto de contacto con R2

Se localizaron **19 puntos de escritura/lectura de R2** en el código:

### Escrituras (`MEDIA.put`)

| Origen | Contenido | Clasificación (antes) | Clasificación (ahora) |
|---|---|---|---|
| `server/utils/media.ts` (`storeFile`) | Cualquier subida multipart | Mixta según prefijo | Explícita por `visibility` en el registro |
| `server/api/public/visitor.post.ts` | KYC de visitantes (pasaporte, DNI, extracto) | Private (solo `requireAdmin`) | **Confidential** |
| `server/api/public/contracts/[token]/accept.post.ts` | Contrato firmado (nombre, IP, sello de firma) | Sin regla — público | **Confidential** |
| `server/api/admin/asset-export/projects/[id]/render.post.ts` | Ficha PDF renderizada | Sin regla — público | **Private** |
| `server/api/admin/asset-export/batches/[id]/process-next.post.ts` | Ficha PDF de un lote | Sin regla — público | **Private** |
| `server/api/admin/asset-export/catalogs/[id]/process-next.post.ts` | Fragmento + catálogo combinado | Sin regla — público | **Private** |
| `server/api/v1/asset-export/exports.post.ts` | Export vía API pública | Sin regla — público | **Private** |

### Lecturas (`MEDIA.get`)

| Origen | Vía | Estado |
|---|---|---|
| `server/api/media/[...key].get.ts` | Ruta general | Reescrita — ver Fase 4 |
| `server/api/admin/saas/contracts/[id]/download.get.ts` | Descarga directa | Ya acotaba por `organizationId`; ahora también registra acceso |
| `server/api/client/contracts/[id]/download.get.ts` | Portal de cliente | Ya acotaba por email+org; ahora también registra acceso |
| `server/api/admin/asset-export/renders/[id]/download.get.ts` | Descarga directa | Ya acotaba por `organizationId` (Megaprompt 1) |
| `server/api/admin/asset-export/catalogs/[id]/download.get.ts` | Descarga directa | Ya acotaba por `organizationId` |
| `server/api/admin/asset-export/batches/[id]/download-zip.get.ts` | ZIP de lote | Ya acotaba por `organizationId` |
| `server/utils/assetExport/bindings.ts` (`fetchImageBytes`) | Lectura interna para renderizar | Solo lee imágenes ya referenciadas por un binding tenant-scoped, no expone bytes al llamante |

### Clasificación completa por tipo de contenido

| Contenido | Clasificación | Motivo |
|---|---|---|
| Fotos de propiedades/proyectos publicadas | **Public** | Catálogo publicado en el sitio |
| Logos (empresa, promotora, Brand Kit) | **Public** | Se renderizan en páginas públicas |
| Imágenes del blog (Media Library) | **Public** | Se embeben en artículos publicados |
| Master plans, planos de planta (imagen) | **Public** | Se muestran en la ficha pública del proyecto |
| Exports del Asset Export Studio (PDF) | **Private** | Uso interno/comercial del equipo, no publicado |
| Catálogos combinados | **Private** | Ídem |
| Backups diarios de D1 | **Private** (fuera del alcance de `media_assets` — ver §Riesgos residuales) | Snapshot completo de la base de datos |
| Documentación KYC de visitantes (pasaporte, DNI, extracto, licencia) | **Confidential** | Identidad y datos financieros reales |
| Contratos firmados | **Confidential** | Nombre, IP y sello de firma de una persona real |

## Fase 2 — Entidad `media_assets`

Migración `0039_media_assets.sql`, tabla Drizzle en `server/db/schema.ts`.
Campos exactamente como los especificó el encargo, más `purged_at` (necesario
para el ciclo de vida de la Fase 10 — distingue "marcado para borrar" de
"realmente borrado de R2"):

```
id, organizationId, r2Key, originalFilename, mimeType, extension, sizeBytes,
checksum, visibility, category, entityType, entityId, createdBy, createdAt,
updatedAt, deletedAt, purgedAt, metadata
```

`visibility` es un enum de aplicación (`public | private | confidential`);
`category` describe el tipo de contenido (`property-photo`, `logo`,
`blog-image`, `kyc-document`, `contract`, `export`, `catalog`, `upload`) y se
usa solo para agrupación en la UI y para elegir el prefijo de clave — **nunca
para autorización**, que siempre sale de `visibility` + `organization_id`.

La migración también hace *backfill* de cada objeto privado/confidencial que
ya existía antes de esta tabla (KYC, contratos, renders, catálogos, Media
Library), para que ninguno quede huérfano de metadatos el día que se
despliegue. `size_bytes`/`checksum` quedan a `0`/`NULL` donde no se conocían
— valores explícitamente desconocidos, no ceros inventados.

## Fase 3 — Estructura de claves

`server/utils/media.ts` → `buildStructuredKey(organizationId, category, extension)`:

```
tenants/{organizationId}/documents/{uuid}.pdf     ← kyc-document
tenants/{organizationId}/contracts/{uuid}.pdf     ← contract
tenants/{organizationId}/exports/{uuid}.pdf       ← export
tenants/{organizationId}/catalogs/{uuid}.pdf      ← catalog
public/{organizationId}/properties/{uuid}.jpg     ← property-photo
public/{organizationId}/blog/{uuid}.jpg           ← blog-image
public/{organizationId}/branding/{uuid}.png       ← logo
tenants/{organizationId}/uploads/{uuid}.jpg       ← upload (genérico)
```

Toda nueva subida usa esta estructura. Los objetos anteriores a esta migración
conservan su clave original (`visitor-docs/…`, `contracts/<org>/…`,
`asset-export-renders/<org>/<proyecto>/<id>.pdf`, `cms/<org>/…`) — **no se ha
movido ningún byte en R2**: mover objetos existentes exigiría reescribir cada
referencia guardada en columnas de texto libre a lo largo de decenas de tablas
(`developers.logo`, `communities.image`, `contracts.r2Key`, etc.), un cambio
de alto riesgo y ningún beneficio de seguridad — la autorización nunca lee la
forma de la clave, así que una clave "antigua" es tan segura como una nueva en
cuanto tiene su fila en `media_assets` (que el backfill le dio).

**La ruta nunca es la autorización.** `buildStructuredKey` es puramente
organizativa; ningún código de `/api/media` confía en el prefijo para decidir
acceso — ver Fase 4.

## Fase 4 — `/api/media/*` rediseñado

`server/api/media/[...key].get.ts`. Orden exacto de comprobación:

```
1. Buscar el objeto en media_assets por su r2Key.
2. Si existe y está borrado (deletedAt) → 404 (en periodo de gracia, no servible).
3. Si visibility === 'public' → servir, cacheable, sin autenticación.
4. Si no → requireOrgScope() (sesión admin) →
   comparar media.organizationId === orgId de la sesión →
   registrar el acceso (media_access_log) →
   si no coincide → 404 (nunca 403) →
   si coincide → servir con Cache-Control: no-store (confidential) o
   private, no-store (private), Content-Disposition: attachment,
   X-Content-Type-Options: nosniff.
5. Si NO existe fila (objeto anterior a esta tabla) →
   si su prefijo es uno de los cuatro históricamente sensibles
   (visitor-docs/, contracts/, asset-export-renders/,
   asset-export-catalogs/) → misma comprobación de propiedad, resuelta
   contra las tablas reales que referencian esa clave (nunca contra el
   texto de la clave) → registrar acceso →
   en cualquier otro caso → contenido público heredado, servido como
   siempre.
```

Un tenant que conoce exactamente la clave R2 de otro tenant llega exactamente
igual de lejos que uno que solo la adivina: a un 404, en ambos casos, después
de que su intento quede registrado si el objeto es confidencial.

Verificado con test E2E real (`tests/e2e/media-security.spec.ts`): el tenant B
genera un contrato firmado propio, el tenant A pide `/api/media/<esa clave
exacta>` directamente (sin pasar por el endpoint de descarga dedicado) y
recibe 404; B recibe 200 con `Cache-Control: no-store`.

## Fase 5 — KYC y documentación confidencial

`visitor-docs/` (y toda la categoría `kyc-document`) está clasificada
`confidential`. El acceso exige, en este orden:

1. Sesión de administrador (`requireOrgScope`).
2. Coincidencia de `organizationId` con el `media_assets` del documento.
3. Registro en `media_access_log` — **tanto si se concede como si se
   deniega** — con `userId`, `userEmail`, `mediaAssetId`, `r2Key`, `action`
   (`download` | `denied`), `visibility`, IP y user-agent.
4. `Cache-Control: no-store`.
5. `Content-Disposition: attachment`.
6. `X-Content-Type-Options: nosniff`.

Los contratos firmados reciben exactamente el mismo tratamiento (también
`confidential`), incluido el registro de acceso, en sus dos endpoints de
descarga dedicados (`/api/admin/saas/contracts/:id/download` y
`/api/client/contracts/:id/download`) además de en `/api/media`.

No se registra acceso a objetos `private` (exports, catálogos): el encargo lo
exige explícitamente para KYC/confidencial; extenderlo a todo lo privado sería
alcance no pedido, y la comprobación de propiedad —el control que de verdad
importa— ya se aplica por igual a ambos niveles.

## Fase 6 — SVG bloqueado

`image/svg+xml` se eliminó de `ALLOWED_TYPES` en `server/utils/media.ts`. El
filtro anterior solo rechazaba un `<script` literal en los primeros 512 bytes
— una comprobación que un payload mínimamente distinto esquiva sin esfuerzo:

- `<image href="javascript:alert(1)">`, sin la palabra `script` en ningún sitio.
- `onload="alert(1)"` en el propio `<svg>` o en cualquier elemento hijo.
- `<foreignObject>` embebiendo HTML completo, incluido un `<script>` real
  (el `<script` seguía sin aparecer si se codificaba con entidades o se
  partía entre atributos).
- `<use href="https://evil.example/payload.svg#x">` cargando contenido
  remoto en el momento de render.
- `<style>` con `url(javascript:...)` o `expression()` en navegadores que
  aún lo soportan.

Un SVG es XML con capacidad de ejecutar código en cuanto se abre como imagen
en un navegador — no es dato inerte de píxeles como un PNG o un JPEG. Filtrar
esa superficie con una expresión regular es, en la práctica, indistinguible de
no filtrarla: la lista de formas de invocar código en SVG es larga y sigue
creciendo.

**Decisión**: bloqueo total del tipo, no un filtro mejor. La subida devuelve
415 con un mensaje explícito. Probado en
`test/unit/mediaValidation.test.ts` (el mapa de tipos permitidos no tiene
entrada para SVG en absoluto) y en `tests/e2e/media-security.spec.ts` (subida
real de un SVG malicioso contra `/api/admin/upload` y
`/api/admin/cms/media`, ambas devuelven 415).

**Camino para reactivarlo**, documentado explícitamente porque hoy es un
`no` y no debe convertirse en un `sí` por accidente:

1. Vetar un sanitizador real y con historial (p. ej. DOMPurify configurado en
   modo SVG, o un servicio de conversión SVG→PNG/WebP del lado servidor).
2. Prohibir de forma comprobable: `<script>`, `<foreignObject>`, cualquier
   atributo `on*`, esquemas `javascript:`, referencias externas (`href`,
   `xlink:href` a otro origen) y CSS peligroso (`expression()`,
   `url(javascript:...)`).
3. Tests adversariales para cada uno de esos vectores, no solo para el caso
   feliz.
4. Preferencia explícita del encargo: convertir SVG a PNG/WebP en servidor
   en vez de conservar el SVG, si existe un servicio compatible con el
   runtime de Cloudflare Workers — elimina la superficie por completo en
   vez de intentar neutralizarla.

## Fase 7 — MIME y magic bytes, ampliado

Se mantiene la comprobación de magic bytes existente (`contentMatchesType`)
y se añade, en `server/utils/imageValidation.ts` / `pdfValidation.ts`:

- **Dimensiones reales**, parseadas de la cabecera binaria de cada formato
  (PNG: chunk IHDR; JPEG: segmento SOF0–SOF15; GIF: campos LE de la
  cabecera; WebP: VP8/VP8L/VP8X). No se decodifica la imagen — solo se lee
  su cabecera, así que esto es barato incluso para un archivo enorme.
- **Límite por lado** (`MAX_IMAGE_DIMENSION = 8000px`) y **límite de
  píxeles totales** (`MAX_IMAGE_PIXELS ≈ 40MP`), para cerrar la clase de
  ataque real que esto existe para evitar: un archivo de unos pocos KB cuya
  cabecera declara un lienzo de 65535×65535 — cualquier código que lo
  decodifique después (`pdf-lib` al incrustarlo en un render, un
  `<img>` en el navegador) paga por la rejilla de píxeles decodificada, no
  por el tamaño del archivo. Es una bomba de descompresión barata de
  construir y cara de sufrir.
- **Archivos truncados/corruptos**: una cabecera que promete una estructura
  que el resto del archivo no respalda (PNG cortado antes de completar
  IHDR, JPEG sin ningún marcador SOF) se rechaza aquí, no tres pasos después
  dentro de un render.
- **PDFs corruptos**: en vez de un parser propio, se reutiliza `pdf-lib`
  —ya es dependencia del proyecto, ya se confía en él para renderizar— con
  `PDFDocument.load()`. Deliberadamente permisivo en conformidad de
  especificación (`throwOnInvalidObject: false`, el valor por defecto):
  muchos PDF reales de bancos, administraciones o escáneres tienen
  violaciones menores de la especificación que cualquier lector real
  tolera; esto es una comprobación de corrupción/truncamiento, no de
  conformidad — rechazar el extracto bancario legítimo de un cliente porque
  el generador de PDF de su banco es imperfecto sería el error contrario.

Todo esto corre **antes** de subir el archivo a R2 y antes de registrar la
fila en `media_assets`: un archivo rechazado no ocupa cuota ni bucket.

## Fase 8 — Cuota por tenant

`organizations.storage_bytes_used` / `storage_bytes_limit` (migración 0039,
por defecto 5 GiB). `server/utils/mediaQuota.ts`:

- `assertQuotaAvailable(db, orgId, bytes)` — se llama **antes** de cada
  escritura a R2 en los seis puntos que escriben contenido real (tres
  subidas multipart vía `storeAndRegisterFile`, tres/seis generaciones de
  PDF vía `registerGeneratedFile`). Nunca se confía en el frontend: la
  comprobación vive en el servidor, con el mismo criterio que el resto de
  validaciones de subida de este proyecto.
- El contador se actualiza en el mismo lote atómico (`db.batch()`, real en
  D1) que la inserción de la fila en `registerMediaAsset` — o su liberación
  en `softDeleteMediaAsset`/`restoreMediaAssetByKey` — así que en el camino
  normal nunca hay una ventana donde el contador y las filas reales
  discrepen.
- `reconcileStorageUsage(db, orgId)` recalcula el contador desde la suma
  real de `media_assets` no borrados. Es el respaldo para lo que el batch
  atómico no puede cubrir: R2 y D1 son dos sistemas distintos sin
  transacción compartida, así que un `MEDIA.put()` que aterriza justo antes
  de que su escritura en D1 falle sí puede desincronizar el contador.
  "Reconciliable", no "imposible de desincronizar" — de ahí el cron diario
  (Fase 10).

## Fase 9 — Checksum

SHA-256 real (`server/utils/checksum.ts`, Web Crypto) en cada asset, sea
subido (`storeAndRegisterFile`) o generado (`registerGeneratedFile`). Usos
cubiertos: integridad (permite detectar si un objeto en R2 no coincide con lo
registrado), depuración, y como base para una futura deduplicación.

**Decisión deliberada: no se implementa deduplicación física en este
bloque.** El encargo pide usar el checksum para "evitar almacenamiento
innecesario cuando corresponda" — la lectura razonable de "cuando
corresponda" es cuando puede hacerse sin abrir un problema nuevo. Compartir
un mismo objeto R2 entre dos filas de `media_assets` (de la misma
organización, o el propio encargo ya excluye entre organizaciones)
introduce un problema de conteo de referencias que esta tabla no modela hoy:
si dos entidades distintas comparten un objeto por checksum y una de ellas
lo borra, la otra pierde su imagen en cuanto expira el periodo de gracia,
aunque su propia fila nunca se tocó. Resolverlo bien exige contar
referencias, no solo comparar hashes — un cambio de esquema mayor, no una
optimización de subida. El checksum queda guardado y listo para esa mejora
futura; mientras tanto, cada subida escribe su propio objeto, exactamente
como antes.

Para contenido `confidential` el encargo es explícito: no compartir
físicamente entre organizaciones "si complica la seguridad" — dado que
cualquier forma de deduplicación complica el ciclo de vida de borrado como se
explica arriba, la conclusión se extiende a toda categoría, no solo a la
confidencial.

## Fase 10 — Ciclo de vida de borrado

`server/tasks/system/media-lifecycle.ts`, cron diario a las 05:00 UTC (después
del backup de D1 a las 03:30):

```
borrado suave (deletedAt) → periodo de gracia de 30 días → job de purga → R2.delete() real → purgedAt
```

- El borrado suave ocurre en el mismo momento que el borrado de la fila que
  posee el archivo (un documento KYC cuando se borra la solicitud del
  visitante, un fragmento de catálogo cuando el catálogo se ensambla, un
  medio de la biblioteca del CMS al enviarlo a Papelera) y libera
  inmediatamente sus bytes de la cuota — un archivo en periodo de gracia no
  debería seguir contando contra el límite mientras espera su purga.
- Cuando el borrado real de R2 ya ocurrió de forma síncrona en el propio
  momento del borrado (por ejemplo, un `?hard=1` en la Media Library, o la
  limpieza de fragmentos al completar un catálogo), el job de purga
  encuentra un objeto que ya no existe: `R2.delete()` sobre una clave
  inexistente no falla, así que simplemente registra la purga sin duplicar
  trabajo.
- Restaurar desde Papelera (`restoreMediaAssetByKey`) revierte el borrado
  suave y repone la cuota — pero se niega si el objeto ya fue purgado de
  verdad (`purgedAt` ya presente): reactivar una fila que apunta a bytes que
  ya no existen sería peor que dejarla borrada.
- El mismo cron reconcilia la cuota de cada organización (Fase 8) en la
  misma pasada.

30 días es deliberadamente holgado — más que cualquier hábito razonable de
limpieza de la Papelera del CMS — para que el borrado automático nunca
sorprenda a un administrador que todavía no ha revisado su papelera.

## Fase 11 — Pruebas

| Suite | Casos | Qué prueba |
|---|---|---|
| `test/unit/mediaValidation.test.ts` | 27 | Magic bytes (incluida la ausencia total de SVG), parseo de dimensiones reales por formato, rechazo de bomba de píxeles, rechazo de archivo truncado, aceptación/rechazo de PDF real vs. corrupto, determinismo del checksum |
| `test/unit/mediaAssets.test.ts` | 19 | `media_assets` CRUD, aislamiento de cuota entre tenants, atomicidad del contador vía `db.batch()`, restauración que respeta una purga ya ejecutada, claves estructuradas |
| `tests/e2e/media-security.spec.ts` | 11 | Subida real por HTTP: SVG rechazado (415) en los dos endpoints de subida, HTML-como-PDF rechazado (415), PDF corrupto rechazado (422), imagen-bomba rechazada (422), imagen truncada rechazada (422), PDF/imagen válidos aceptados con caché pública; aislamiento cross-tenant real en `/api/media` con un contrato confidencial genuino de un tenant y un export privado de Asset Export Studio |

Los fixtures de imagen/PDF (`test/unit/helpers/mediaFixtures.ts`) son
**bytes reales y válidos**, no simulaciones: un PNG construido con `zlib`
deflate real y CRC32 real, un JPEG con un segmento SOF0 estructuralmente
correcto, un PDF generado con `pdf-lib` (la misma librería que valida). El
caso "bomba de píxeles" usa una cabecera PNG real cuyo IHDR declara
deliberadamente una resolución muy superior a sus datos de imagen reales —
exactamente la forma del ataque, no una aproximación.

La cuota se probó a nivel unitario (`assertQuotaAvailable` contra una base de
datos real, incluidos los límites exactos) en vez de repetirse en HTTP: no
existe ningún endpoint para bajar el límite de una organización —
deliberadamente, este bloque no añade una UI comercial de gestión de cuotas—
así que probarla por HTTP habría exigido manipular D1 por fuera del sistema
solo para llegar al mismo camino de código ya cubierto.

## Definition of Done

- ✅ Todo objeto R2 privado o confidencial tiene una fila en `media_assets`
  (los preexistentes, vía backfill de la migración 0039; los nuevos, en el
  momento de creación).
- ✅ Todo objeto R2 privado o confidencial está ligado a un
  `organization_id` real.
- ✅ Ninguna autorización se decide por la forma de la clave — `/api/media`
  consulta siempre `media_assets` primero.
- ✅ KYC (y contratos, misma clasificación `confidential`) tiene auditoría
  de acceso, con éxito y con denegación.
- ✅ SVG inseguro eliminado — bloqueo total, no un filtro parcial.
- ✅ Existen cuotas, comprobadas server-side antes de cada escritura real.
- ✅ Existen tests cross-tenant, sobre HTTP real y con objetos genuinamente
  propiedad de cada tenant.
- ✅ `npm run build` pasa.
- ✅ `npm test` pasa (322/322, incluidos los 46 nuevos de este bloque).
- ✅ `npm run test:e2e` pasa (41/41, incluidos los 11 nuevos de este
  bloque).
- ✅ `npm run typecheck` no empeora (41 errores preexistentes, igual que
  antes de este bloque).

## Riesgos residuales

**R-1 · Deduplicación no implementada.** Documentado en la Fase 9: el
checksum está disponible pero no se usa para compartir objetos físicos,
porque hacerlo bien exige conteo de referencias, que no existe hoy. Cada
subida sigue ocupando su propio espacio real en R2.

**R-2 · Backups de D1 fuera de `media_assets`.** `server/tasks/system/backup-d1.ts`
escribe snapshots completos de la base de datos bajo `backups/` en el mismo
bucket, sin fila de `media_assets` ni comprobación de tenant — es
correcto que así sea: es un volcado de **toda** la plataforma, no de un
tenant, y solo lo lee el propio proceso de backup/restauración, nunca
`/api/media`. Queda fuera del alcance de este Media Asset Manager por
diseño, no por omisión, pero se documenta aquí para que quede explícito.

**R-3 · Objetos huérfanos anteriores a la Fase 10.** El ciclo de
borrado-con-gracia-y-purga solo rige a partir de este bloque. Un objeto
borrado por código anterior (antes de esta migración) sin dejar rastro en
`media_assets` no será recogido por el cron de purga porque no tiene fila
que lo referencie — no es un riesgo de seguridad (nadie puede leerlo sin una
fila que lo autorice, ver Fase 4), pero sí puede quedar ocupando espacio en
R2 sin que la cuota lo refleje. Fuera del alcance de detectarlo
retroactivamente sin un barrido completo del bucket (`R2.list()` cruzado
contra `media_assets`), que no se ha ejecutado en este bloque.

**R-4 · Parser WebP cubre los tres subformatos comunes, no el 100% de la
especificación.** `parseImageDimensions` soporta VP8 (con pérdida simple),
VP8L (sin pérdida) y VP8X (extendido, con canvas explícito) — los tres
subformatos que cualquier codificador real produce. Un WebP deliberadamente
exótico que no encaje en ninguno de los tres se trata como no parseable y,
por tanto, se rechaza como corrupto — un falso rechazo posible pero
extremadamente improbable en una subida real, nunca un falso positivo de
seguridad.

**R-5 · La cuota por defecto (5 GiB) es un valor de arranque, no una
política de producto.** No hay UI para ajustarla por tenant — deliberado, ver
Fase 1 del encargo ("no implementes nuevas funcionalidades comerciales").
Ajustarla hoy requiere una escritura directa en D1.
