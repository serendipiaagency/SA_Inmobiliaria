# Arquitectura de almacenamiento (R2 + Media Asset Manager)

Referencia de diseño para el bucket `sa-inmobiliaria-media` y la capa de
metadatos que lo autoriza (`media_assets`). El informe de vulnerabilidades
encontradas y corregidas está en
[`media-security-audit.md`](./media-security-audit.md); este documento es el
"cómo funciona", pensado para orientarse rápido al tocar código de media.

## El principio de diseño

**R2 guarda bytes. D1 decide quién puede leerlos.**

La clave de un objeto en R2 (`tenants/2/documents/9f2a….pdf`) es una
dirección de almacenamiento, no una credencial. Antes de este bloque, la
única forma de decidir si servir un objeto era mirar el prefijo de su ruta —
lo cual es exactamente lo que un atacante controla al construir o adivinar
una URL. Ahora, toda decisión de acceso a un objeto no público pasa primero
por una fila de `media_assets`: su `visibility` y su `organization_id`, no su
ruta, son la fuente de verdad.

```
Petición GET /api/media/<key>
        │
        ▼
 ¿Existe fila en media_assets para <key>?
        │
   ┌────┴─────┐
   │ Sí        │ No
   ▼           ▼
 visibility   ¿Prefijo históricamente sensible?
   │           (visitor-docs/, contracts/,
   │            asset-export-renders/,
   │            asset-export-catalogs/)
   │               │
   │          ┌────┴────┐
   │          │ Sí       │ No
   │          ▼          ▼
   │     comprobación   contenido
   │     legacy por      público
   │     tabla real       heredado
   │          │
   ▼          ▼
 pública?   sesión admin
   │        + organizationId
   │        coincide?
  sí          │
   │      ┌───┴───┐
   ▼      │ sí     │ no
 servir   ▼        ▼
 cacheable servir  404
           (log)   (log)
```

## Componentes

| Archivo | Responsabilidad |
|---|---|
| `server/db/schema.ts` | Tablas `media_assets`, `media_access_log`; columnas `storage_bytes_used`/`storage_bytes_limit` en `organizations` |
| `migrations/0039_media_assets.sql` | Crea las tablas, añade las columnas de cuota, hace *backfill* de los objetos privados/confidenciales preexistentes |
| `server/utils/checksum.ts` | SHA-256 de un buffer (`sha256Hex`) |
| `server/utils/imageValidation.ts` | Parseo real de dimensiones (PNG/JPEG/GIF/WebP) y límites de tamaño |
| `server/utils/pdfValidation.ts` | Confirma que un PDF realmente abre, vía `pdf-lib` |
| `server/utils/mediaAssets.ts` | CRUD de `media_assets`: registrar, buscar por propiedad, borrar/restaurar en periodo de gracia |
| `server/utils/mediaQuota.ts` | Comprobación de cuota antes de escribir, reconciliación del contador |
| `server/utils/mediaAccessLog.ts` | Registro de accesos a media confidencial |
| `server/utils/media.ts` | Validación de subida (magic bytes + estructura), claves estructuradas, `storeAndRegisterFile` (subida completa) |
| `server/utils/mediaAccess.ts` | *Solo* el mecanismo legacy de respaldo por prefijo — ver más abajo |
| `server/api/media/[...key].get.ts` | El único punto de lectura de R2 accesible por URL |
| `server/tasks/system/media-lifecycle.ts` | Cron diario: purga tras el periodo de gracia + reconciliación de cuota |

## El modelo de datos

```
media_assets
├─ id
├─ organizationId       ← el tenant dueño (NUNCA se infiere de la clave)
├─ r2Key                ← UNIQUE — una fila por objeto real
├─ originalFilename
├─ mimeType, extension, sizeBytes, checksum
├─ visibility            public | private | confidential
├─ category              property-photo | logo | blog-image | kyc-document
│                        | contract | export | catalog | upload
├─ entityType, entityId  ← qué fila "posee" este archivo (opcional)
├─ createdBy
├─ createdAt, updatedAt
├─ deletedAt              ← borrado suave: inicia el periodo de gracia
├─ purgedAt                ← el job de purga marcó el R2.delete() como hecho
└─ metadata                ← JSON libre (p. ej. {width, height})

media_access_log
├─ organizationId, userId, userEmail
├─ mediaAssetId, r2Key
├─ action                 download | denied
├─ visibility
├─ ip, userAgent, createdAt
```

`visibility` es la única palanca de autorización. `category` es metadato de
producto (agrupar en la UI, elegir el prefijo de clave al subir) — nunca se
lee para decidir si servir un archivo.

## `visibility`: las tres clases

| Clase | Quién puede leerla | Caché | Ejemplos |
|---|---|---|---|
| `public` | Cualquiera, sin sesión | `public, max-age=31536000, immutable` | Fotos de catálogo, logos, imágenes de blog |
| `private` | Admin de la organización dueña | `private, no-store` | Exports y catálogos del Asset Export Studio |
| `confidential` | Admin de la organización dueña, con acceso auditado | `no-store` | Documentos KYC, contratos firmados |

`private` vs. `confidential` no cambian la regla de autorización (ambas
exigen sesión + `organizationId` coincidente) — la diferencia es que
`confidential` además escribe en `media_access_log` en cada lectura, éxito o
denegación (Fase 5 del encargo). Se reservó ese coste de auditoría para datos
personales reales (identidad, firma), no para PDF operativos internos.

## El ciclo de vida de un archivo

### Subida por un usuario (KYC, logo, imagen de blog…)

```ts
const stored = await storeAndRegisterFile(event, db, filePart, {
  organizationId: orgId,
  visibility: 'confidential',   // o 'public' / 'private' según el endpoint
  category: 'kyc-document',
  entityType: 'visitor_submissions',
})
```

`storeAndRegisterFile` (en `server/utils/media.ts`) hace, en este orden:

1. `assertQuotaAvailable` — rechaza antes de gastar CPU o almacenamiento si
   la organización ya está en su límite.
2. Magic bytes (`contentMatchesType`) — el tipo declarado debe coincidir con
   el contenido real.
3. Validación estructural — dimensiones reales para imágenes
   (`validateImageIntegrity`), apertura real para PDF
   (`validatePdfIntegrity`).
4. Checksum SHA-256.
5. `MEDIA.put()` bajo una clave estructurada (`buildStructuredKey`).
6. `registerMediaAsset` — inserta la fila y aplica el tamaño a la cuota de
   la organización, en un único `db.batch()` (atómico en D1 real).

### Archivo generado por el propio servidor (contrato firmado, PDF de export…)

No hay subida multipart que validar — los bytes salen de `pdf-lib`, ya
confiables. El único paso que sí aplica es el de cuota y registro:

```ts
await assertQuotaAvailable(db, orgId, pdfBytes.byteLength)
const r2Key = buildStructuredKey(orgId, 'contract', 'pdf')
await cfEnv(event).MEDIA.put(r2Key, pdfBytes, { httpMetadata: { contentType: 'application/pdf' } })
await registerGeneratedFile(db, { organizationId: orgId, r2Key, bytes: pdfBytes, mimeType: 'application/pdf', extension: 'pdf', visibility: 'confidential', category: 'contract', entityType: 'contracts', entityId: contract.id })
```

### Borrado

```
softDeleteMediaAsset(id)          ← deletedAt = ahora; libera la cuota YA
        │  (30 días de gracia)
        ▼
media-lifecycle.ts (cron diario)  ← R2.delete() real; purgedAt = ahora
```

`softDeleteMediaAssetByKey` es la variante para el caso, frecuente en este
código, de que el R2 delete ya ocurrió de forma síncrona (una Papelera con
`?hard=1`, la limpieza de fragmentos al ensamblar un catálogo): el borrado
suave solo actualiza el libro de contabilidad, y el cron encontrará más
tarde un objeto que ya no está — `R2.delete()` sobre una clave inexistente no
falla, así que esto no duplica trabajo ni genera error.

`restoreMediaAssetByKey` revierte el borrado suave y repone la cuota — pero
se niega si `purgedAt` ya está puesto: no hay nada que restaurar si los
bytes reales ya se borraron de R2.

## El mecanismo legacy (`mediaAccess.ts`)

Antes de la migración 0039, la única forma de saber si un objeto era privado
era su prefijo de ruta (`visitor-docs/`, `contracts/`, etc.), comprobado
contra las tablas reales que lo referencian. La migración 0039 hace
*backfill* de una fila en `media_assets` para cada objeto que existía bajo
esos cuatro prefijos, así que en régimen normal ese código legacy nunca se
ejecuta: la fila ya existe y el flujo normal de la Fase 4 la encuentra.

Se mantiene como **red de seguridad**, no como mecanismo principal — por si
alguna fila del *backfill* faltara, o si en el futuro un `MEDIA.put()`
aterrizara sin su `registerMediaAsset` correspondiente (un fallo a mitad de
un `try/catch`, por ejemplo). Sin él, un objeto en esa situación quedaría
huérfano de metadatos y, con el diseño "la ausencia de fila no es
autorización" de la Fase 4, se serviría como público — el fallback legacy
existe precisamente para que ese escenario límite siga exigiendo prueba de
propiedad en vez de degradar silenciosamente a "abierto a cualquiera".

## Cuota

```
organizations.storage_bytes_used   ← mantenido por cada escritura/borrado
organizations.storage_bytes_limit  ← 5 GiB por defecto
```

`assertQuotaAvailable(db, orgId, bytesAdicionales)` se llama antes de **toda**
escritura real a R2 en este proyecto — las tres subidas de usuario y las
generaciones de PDF del servidor. Lanza 413 con el uso actual y el límite en
el mensaje, nunca un rechazo silencioso.

El contador se mantiene en el mismo `db.batch()` que cada
inserción/liberación (atómico), y se recalcula por completo cada noche
(`reconcileStorageUsage`, dentro de `media-lifecycle.ts`) desde la suma real
de `media_assets` no borrados — el respaldo para lo que un fallo a mitad de
camino entre R2 y D1 (dos sistemas sin transacción compartida) pudiera
desincronizar.

No existe hoy ninguna UI para cambiar el límite de una organización —
deliberado, fuera del alcance comercial de este bloque.

## Deduplicación: por qué no

El checksum SHA-256 se calcula y se guarda en cada fila, pero **no** se usa
todavía para evitar volver a almacenar contenido idéntico. Compartir un
mismo objeto R2 entre dos filas exige contar referencias — si dos entidades
comparten un objeto "por casualidad" de checksum y una de ellas se borra, la
otra no debe perder su archivo cuando expire el periodo de gracia de la
primera. `media_assets` no modela eso hoy (una fila = un objeto = un
propietario). Añadirlo es un cambio de esquema real, no una optimización de
subida, y se deja documentado como trabajo futuro en vez de implementado a
medias.

## Extender esto: guía rápida

**Añadir un nuevo tipo de subida de usuario** (un campo de archivo en un
formulario nuevo): usa `storeAndRegisterFile`, elige `visibility` según si el
resultado se publica en el sitio (`public`) o es interno (`private`/
`confidential` si contiene datos personales reales).

**Añadir un nuevo tipo de archivo generado por el servidor** (otro export,
otro documento): usa `buildStructuredKey` + `registerGeneratedFile`, con
`assertQuotaAvailable` antes del `MEDIA.put()`, exactamente como los seis
sitios existentes.

**Añadir un nuevo endpoint de descarga dedicado** (en vez de servir vía
`/api/media`): comprueba `organizationId` contra la sesión igual que los
existentes, y si el contenido es `confidential`, añade `logMediaAccess` —
mira `server/api/admin/saas/contracts/[id]/download.get.ts` como plantilla.

**Nunca**: derivar visibilidad o propietario de la forma de la clave R2. Si
un código nuevo necesita saber si algo es público, pregúntale a
`media_assets`, no al string de la ruta.
