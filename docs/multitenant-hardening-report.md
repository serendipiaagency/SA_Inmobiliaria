# Informe de hardening multitenant (bloque P0)

**Alcance**: auditoría completa del aislamiento entre inmobiliarias y
corrección de toda vía por la que un inquilino pudiera leer, modificar,
eliminar o crear datos de otro.

**Resultado**: 10 vulnerabilidades encontradas y corregidas — 4 críticas, 4
altas, 2 medias. 175 pruebas nuevas. Sin funcionalidad nueva.

La matriz por tabla está en [`multitenant-audit.md`](./multitenant-audit.md).

---

## Resumen

| ID | Severidad | Vulnerabilidad | Impacto |
|---|---|---|---|
| **V-01** | 🔴 Crítica | 5 recursos hijo con `orgScoped:false` → CRUD genérico **sin ningún filtro** | Lectura, modificación y borrado de planos, tipologías, galerías e imágenes de cualquier inmobiliaria |
| **V-02** | 🔴 Crítica | `syncTranslations()` borraba y reescribía por id sin comprobar propiedad | Destrucción y suplantación del contenido multiidioma de otra inmobiliaria |
| **V-03** | 🔴 Crítica | `invoices` sin `organization_id` y sin filtro | Toda la facturación de la plataforma visible y sumada en el panel de cada cliente |
| **V-04** | 🔴 Crítica | R2: documentos privados servidos a cualquier admin, o a cualquiera | Descarga de pasaportes, DNI, extractos bancarios y contratos firmados ajenos |
| **V-05** | 🟠 Alta | `/api/admin/stats` contaba toda la plataforma | Revelación agregada del volumen de negocio de la competencia |
| **V-06** | 🟠 Alta | 11 endpoints públicos resolvían slug/id sin filtro de tenant | Catálogo, métricas comerciales y datos de contacto de otras agencias |
| **V-07** | 🟠 Alta | Scheduler aceptaba `developerPropertyId` ajeno | Publicar el inmueble de otra agencia en los canales propios |
| **V-08** | 🟠 Alta | FKs sin validar en `deals` y `developer-properties` | Comisiones e ingresos imputados sobre entidades de otro inquilino |
| **V-09** | 🟡 Media | FKs sin validar en CMS (`authorId`, `categoryId`, `parentId`, `userId`, `folderId`) | Vínculos cruzados entre inquilinos, visibles en el blog público |
| **V-10** | 🟡 Media | Contadores derivados actualizados por id sin filtro | Manipulación del `comment_count` de artículos ajenos |

---

## V-01 · `orgScoped:false` anulaba el aislamiento en 5 recursos 🔴

**Archivos**: `server/utils/adminResources.ts`, `server/api/admin/[resource]/*`

El registro del CRUD genérico usaba un booleano `orgScoped` cuyo valor `false`
significaba dos cosas incompatibles:

1. "esta tabla es realmente global" (`organizations`, `error_logs`), y
2. "esta tabla no tiene `organization_id`; hereda el tenant de su padre"
   (`floor_plans`, `property_types`, `images`, `property_gallery_images`,
   `property_social_media`).

Los cinco manejadores comprobaban `def.orgScoped !== false && orgId != null`
antes de añadir el filtro. Para el segundo grupo el filtro **nunca se
añadía**, y el comentario del campo describía justamente ese caso como si
estuviera resuelto ("child tables that inherit tenant scoping transitively
through their parent's FK").

El resultado, con una sesión de administrador de cualquier inmobiliaria:

```
GET    /api/admin/floor-plans            → planos de TODA la plataforma
GET    /api/admin/floor-plans/<id ajeno> → 200 con el plano de otra agencia
PUT    /api/admin/floor-plans/<id ajeno> → modificación aceptada
DELETE /api/admin/floor-plans/<id ajeno> → borrado efectivo
POST   /api/admin/floor-plans            → plano colgado del proyecto de otro
```

Lo mismo para tipologías de unidad, galería de proyecto, galería de propiedad y
enlaces de redes sociales. No hacía falta ningún truco: bastaba con recorrer
ids.

**Corrección** — se eliminó el booleano y se sustituyó por una política
explícita y obligatoria por recurso (`server/utils/tenantPolicy.ts`):

```ts
'floor-plans': {
  tenantPolicy: {
    type: 'parent',
    foreignKey: 'developerPropertyId',
    parentTable: schema.developerProperties,
    parentLabel: 'Proyecto',
  },
}
```

`buildTenantWhere()` traduce la política a SQL —igualdad para `direct`,
`EXISTS` correlacionado sobre el padre para `parent`— y es el **único** lugar
donde se decide la visibilidad. Ante una organización nula **falla cerrado**
(403) en vez de devolver "sin filtro", que es exactamente como el booleano
producía consultas sin acotar. `type: 'global'` exige un `reason` escrito y
`superAdminOnly`.

---

## V-02 · `syncTranslations()` escribía sobre registros ajenos 🔴

**Archivos**: `server/utils/adminResources.ts`,
`server/api/admin/[resource]/[id].put.ts`

La firma anterior era `syncTranslations(db, def, recordId, translations)` y su
cuerpo:

```ts
await db.delete(table).where(eq(table[foreignKey], recordId))   // sin tenant
for (const tr of translations) await db.insert(table).values({ ... })
```

`[id].put.ts` la llamaba **incondicionalmente** con el id de la URL, después de
su propio `UPDATE` acotado. Contra el id de otra inmobiliaria, el `UPDATE` no
tocaba nada (correcto) pero la sincronización sí se ejecutaba: borraba sus
traducciones y las sustituía por las del atacante. Una escritura no autorizada,
y destructiva.

**Corrección** — la función ya no acepta un id suelto, sino una capacidad
`AuthorizedRecord` que **solo** `authorizeRecord()` puede emitir, y que se
obtiene resolviendo la fila a través de su política de tenant. Además, la
propia escritura vuelve a derivar el guard del padre, de modo que ni siquiera
un llamante mal cableado puede tocar traducciones ajenas.

Se evaluaron las tres opciones del encargo:

| Opción | Valoración |
|---|---|
| **A** — contexto de recurso autorizado | Elegida. Convierte "he comprobado la propiedad" en algo que el tipo exige, no que el llamante recuerde. |
| **B** — query que verifica `parent.organizationId` | Elegida también, como defensa en profundidad sobre el propio `DELETE`/`INSERT`. |
| **C** — `organization_id` en las tablas de traducción | **Descartada.** Denormalizar el tenant en un hijo cuyo padre ya lo lleva crea una segunda copia que puede divergir: una fila re-parentada o mal sembrada tendría dos respuestas distintas a "¿de quién es esto?", y cualquier consulta que confiase en la equivocada sería una fuga. La columna del padre sigue siendo la única fuente de verdad. |

Aplicado a `property_translations` y `blog_translations`, es decir, a todo
recurso con `translations` en el registro.

---

## V-03 · Facturación global entre inquilinos 🔴

**Archivos**: `migrations/0038_invoices_org_scope.sql`, `server/db/schema.ts`,
`server/api/admin/saas/invoices.get.ts`, `server/api/admin/saas/overview.get.ts`

La migración 0021 dejó `invoices` sin `organization_id` "por decisión
explícita". `/api/admin/saas/invoices` corría bajo `requireAdmin` sin filtro
alguno, y su fila de agregados sumaba `amount + tax` de toda la tabla. Cada
cliente veía en `/admin/facturación` las facturas, nombres de cliente e
importes de todos los demás; `/api/admin/saas/overview` informaba del saldo
pendiente de la plataforma como si fuera el suyo.

Una factura lleva nombre de cliente, concepto e importes: es dato de inquilino,
no de plataforma. La decisión original no sobrevive a la revisión.

**Corrección** — migración **0038** añade `organization_id` (patrón aditivo de
0021: `ALTER TABLE … ADD COLUMN … DEFAULT 1`, backfill al inquilino
preexistente, índice `invoices_org`), y ambos endpoints pasan a
`requireOrgScope` con filtro en listado y en agregados.

---

## V-04 · Documentos privados accesibles en R2 🔴

**Archivos**: `server/api/media/[...key].get.ts` (nuevo
`server/utils/mediaAccess.ts`), `server/api/admin/upload.post.ts`

`/api/media/:key` servía **cualquier** clave del bucket. La única excepción era
el prefijo `visitor-docs/`, protegido con `requireAdmin` — es decir, con
*cualquier* sesión de administrador, de *cualquier* inmobiliaria.

Dos consecuencias:

- **Entre inquilinos**: el admin de una agencia podía descargar los documentos
  KYC de los clientes de otra —pasaporte, Emirates ID, extractos bancarios,
  licencia de actividad— conociendo o adivinando la clave.
- **Sin autenticación en absoluto**: `asset-export-renders/`,
  `asset-export-catalogs/` y `contracts/` no encajaban en ninguna regla. Los
  PDF generados y **los contratos firmados** (con nombre, DNI, IP y sello de
  tiempo de la firma) se servían a cualquiera que pidiese la URL, esquivando
  los endpoints de descarga que sí comprobaban el tenant.

**Corrección** — los cuatro prefijos se declaran privados y exigen sesión admin
**más** propiedad del objeto. La propiedad se resuelve **buscando la fila que
referencia esa clave exacta**, nunca parseando el `orgId` incrustado en la
ruta: esa ruta la controla íntegramente el llamante, así que confiar en ella
solo movería el fallo un nivel más abajo. Un objeto ajeno devuelve 404.

Las imágenes de catálogo y del blog siguen siendo públicas: son contenido
publicado y deben poder enlazarse desde el sitio.

Adicionalmente, `/api/admin/upload` tomaba el nombre de carpeta del cliente sin
restricción, de modo que un admin podía depositar un objeto controlado dentro
de un prefijo privado. Ahora esos cuatro prefijos están vetados en la subida.

---

## V-05 · Contadores del panel calculados sobre toda la plataforma 🟠

**Archivo**: `server/api/admin/stats.get.ts`

Nueve `count(*)` sin `WHERE`, bajo `requireAdmin`. El panel de cada cliente
mostraba el total de proyectos, propiedades, promotoras, agentes, comunidades,
artículos y bandeja de entrada **de todas las inmobiliarias**. Fuga agregada
del volumen de negocio de la competencia — y, de paso, cifras falsas para el
propio usuario.

**Corrección** — `requireOrgScope` y `eq(table.organizationId, orgId)` en cada
recuento.

---

## V-06 · Endpoints públicos resolviendo identificadores sin tenant 🟠

**Archivos**: `server/api/public/properties/[slug]/{analysis,engagement,`
`lifestyle,price-history,score,similar,view}.*`,
`server/api/public/communities/[id].get.ts`,
`server/api/public/team/[slug].get.ts`, `server/api/public/ask.post.ts`,
`server/api/public/favorite.post.ts`

El sitio público resuelve su inquilino por *hostname*
(`resolvePublicOrgId()`). La ficha principal de propiedad lo aplicaba; **once**
endpoints alrededor, no. Bastaba conocer un slug para leer, desde el sitio de
una agencia, datos de otra:

- `engagement` devolvía **número de leads y de visitas** de la propiedad —
  información comercial interna, no catálogo.
- `price-history` devolvía el histórico de precios.
- `similar` recomendaba propiedades de **otras agencias** en la ficha propia.
- `analysis`, `score`, `lifestyle` exponían el proyecto completo.
- `view` y `favorite` permitían inflar los contadores de un inmueble ajeno.
- `/api/public/communities/:id` leía la comunidad por id **y** devolvía su
  catálogo de proyectos por coincidencia de nombre.
- `/api/public/team/:slug` devolvía la ficha del agente con sus datos de
  contacto.
- `/api/public/ask` (asistente IA) citaba los datos reales del proyecto ajeno
  en su respuesta.

**Corrección** — filtro `organizationId = resolvePublicOrgId(event)` en cada
resolución de slug/id y en las consultas derivadas (leads, visitas, comodidades
y candidatos "similares").

---

## V-07 · El Scheduler aceptaba inmuebles de otro inquilino 🟠

**Archivos**: `server/api/admin/scheduler/create.post.ts`,
`server/api/admin/scheduler/duplicate.post.ts`

`create` comprobaba que el `developerPropertyId` **existiera**, no que fuera
propio:

```ts
.where(eq(schema.developerProperties.id, developerPropertyId))   // sin tenant
```

`duplicate` aceptaba un `developerPropertyId` de override sin comprobación
ninguna. Como el dispatcher publica de verdad en los canales configurados, esto
no era solo lectura: permitía **publicar el inmueble de otra agencia** —con sus
fotos, su precio y su descripción— en los portales y redes del atacante.

**Corrección** — ambos resuelven la propiedad con
`eq(organizationId, orgId)` / `assertOwnedReference()`. La búsqueda de plantilla
en `create` se consolidó además en una sola consulta acotada.

---

## V-08 · Claves foráneas sin validar en operaciones y catálogo 🟠

**Archivos**: `server/api/admin/saas/deals.post.ts`,
`server/utils/adminResources.ts` (`relations`)

`POST /api/admin/saas/deals` aceptaba `leadId`, `propertyId` y `agentId` del
cuerpo sin comprobación. Una operación cerrada es la única fuente de verdad de
ingresos y comisiones: se podía imputar una comisión contra el lead, el
inmueble o el agente de otra inmobiliaria, y esos ids aparecían después en los
informes de `/admin/ingresos` y en los webhooks `deal.closed`.

En el CRUD genérico, `developer-properties.developerId` tenía el mismo
problema: un proyecto propio colgado de la promotora de otro inquilino.

**Corrección** — validación explícita con `assertOwnedReference()` en `deals`, y
declaración `relations` en el registro para el CRUD genérico, verificada tanto
en creación como en actualización. Lo segundo importa igual: sin ello, un
`PUT` podía **re-parentar** una fila propia sobre un registro ajeno y cruzarla
de inquilino en un solo paso.

---

## V-09 · Claves foráneas sin validar en el CMS 🟡

**Archivos**: `server/api/admin/cms/articles/index.post.ts`,
`server/api/admin/cms/articles/[id].put.ts`,
`server/api/admin/cms/media/index.post.ts`,
`server/api/admin/cms/media/[id].patch.ts`, `server/utils/adminResources.ts`

`authorId` y `categoryId` (artículos), `folderId` (media), `parentId`
(categorías y carpetas) y `userId` (autores) se aceptaban tal cual. Un artículo
podía quedar firmado por el autor de otra agencia —y ese vínculo se renderiza
en el blog público—, un fichero podía moverse a la carpeta de otro inquilino
(desapareciendo de su biblioteca y apareciendo en la ajena), y un autor de CMS
podía vincularse a una cuenta de usuario de otra empresa.

**Corrección** — `assertOwnedReference()` en los endpoints propios del CMS y
`relations` declaradas para los recursos del CRUD genérico.

---

## V-10 · Contadores derivados actualizados sin filtro 🟡

**Archivos**: `server/api/admin/[resource]/[id].put.ts`,
`server/api/admin/[resource]/[id].delete.ts`

Al moderar o borrar un comentario, el `comment_count` del artículo se ajustaba
con `eq(cmsArticles.id, articleId)` sin condición de tenant. Encadenado con
V-09 (un comentario podía apuntar al artículo de otro inquilino), permitía
mover el contador de comentarios de un artículo ajeno.

**Corrección** — la actualización lleva `AND organization_id = ?`, y el borrado
resuelve primero la propiedad de la fila (`authorizeRecord`) antes de tocar
ningún contador o cualquier objeto en R2.

---

## Fase 6 · Super admin

Se mantiene la funcionalidad, separando explícitamente **contexto de
inquilino** de **acceso de plataforma**:

- `requireOrgScope()` devuelve siempre una organización concreta, también para
  un `super_admin` (la que haya elegido en el conmutador, vía cookie
  `sa_active_org`; la cookie solo cambia lo que ve, nunca amplía su acceso).
- Las operaciones con ámbito de inquilino usan **exactamente** esa
  organización. Ser `super_admin` ya no puede producir por accidente una
  consulta sin acotar: `buildTenantWhere()` lanza 403 si recibe una
  organización nula en un recurso con tenant, en lugar de omitir el filtro.
- Las operaciones realmente globales siguen exigiendo `requireSuperAdmin()`
  (`organizations`, `error-logs`, cambio de organización activa).

Un administrador de organización nunca puede cambiar de inquilino: su
`organizationId` sale de su propia fila de usuario y ninguna entrada del
cliente lo sobrescribe (cubierto por `test/unit/auth.orgScope.test.ts`).

---

## Pruebas creadas

| Archivo | Casos | Qué demuestra |
|---|---|---|
| `test/unit/helpers/tenantFixtures.ts` | — | Arranca **SQLite real** con **las migraciones reales** y siembra dos inquilinos completos |
| `test/unit/multitenant.crossTenant.test.ts` | **150** | Matriz de ataque sobre **los 26 recursos con tenant**: READ, LIST, UPDATE, DELETE, CREATE-con-padre-ajeno, CREATE-con-relación-ajena, `organizationId` inyectado en el cuerpo, y fallo-cerrado sin organización |
| `test/unit/multitenant.translations.test.ts` | **5** | Ataques a `syncTranslations`, incluida la reutilización de una autorización legítima apuntando a otro id |
| `test/unit/multitenant.mediaAccess.test.ts` | **9** | Propiedad de cada prefijo privado de R2, y que la propiedad no se decide por el `orgId` de la ruta |
| `tests/e2e/cross-tenant.spec.ts` | **11** | Los mismos ataques sobre **HTTP real**, con dos inquilinos, sesiones reales y D1 real |

Las unitarias corren sobre SQLite en proceso (`node:sqlite`) vía
`drizzle-orm/sqlite-proxy`, de modo que el **código de construcción de
consultas de producción se ejecuta sin modificar** contra el esquema real. Un
esquema de juguete no habría detectado ninguno de estos fallos: son errores de
`WHERE`, no de lógica de negocio.

Helper reutilizable `expectCrossTenantDenied()` (en ambas suites): comprueba
que la operación se rechaza **y** que lo hace con **404, no 403**. Un 403
confirmaría que el id existe en la plataforma.

**Validación de la propia suite**: se revirtió temporalmente `floor-plans` a
una política sin filtro y la suite falló en 4 aserciones, incluidas las de
registro. La matriz también se autoprotege — añadir un recurso sin *fixture*, o
declarar `global` sin justificación revisada, rompe la build.

---

## Resultado

| Comprobación | Antes | Después |
|---|---|---|
| `npm test` | 112 ✅ | **276 ✅** (16 → 19 ficheros) |
| `npm run test:e2e` | 19 ✅ | **30 ✅** (+11 cross-tenant) |
| `npm run build` | ✅ | ✅ |
| `npm run typecheck` | 43 errores preexistentes | **41** — ninguno nuevo |

Definition of Done, punto por punto:

- ✅ No existe `orgScoped:false` con significado ambiguo — el campo se eliminó.
- ✅ Todo recurso declara `tenantPolicy` explícita (obligatoria en el tipo).
- ✅ Todas las relaciones validan propiedad, en creación **y** actualización.
- ✅ Traducciones protegidas por capacidad + guard en la propia escritura.
- ✅ Todos los CRUD acotados por inquilino a través de `buildTenantWhere()`.
- ✅ Acciones masivas (listados, agregados, exportaciones) acotadas.
- ✅ Búsquedas acotadas (el filtro de tenant se aplica junto al `LIKE`).
- ✅ Jobs: de plataforma por diseño, cada escritura con el tenant de su fila.
- ✅ Webhooks acotados; las entregas verifican el endpoint padre.
- ✅ Los ataques de A contra B fallan, con 404.
- ✅ Sin regresiones.

---

## Riesgos residuales

Ninguno permite cruzar el límite entre inquilinos hoy. Se dejan documentados
porque son deuda real, no observaciones cosméticas.

**R-1 · Datos preexistentes mal parentados.** Las correcciones garantizan que
*a partir de ahora* ningún hijo puede colgar de un padre ajeno, pero no
reparan filas creadas antes por V-01/V-08/V-09. Con la política `parent` una
fila así queda invisible e ineditable para ambos inquilinos, que es el estado
seguro, pero conviene un script de conciliación antes del próximo despliegue a
producción. **No se ha ejecutado ninguna limpieza de datos** en este bloque.

**R-2 · `publication_history` con `scheduleId` no verificado.** `pause` y
`resume` por `scheduleId` escriben una fila de historial antes de comprobar que
la programación exista. La fila se graba con la organización **propia**, así que
no hay fuga ni escritura ajena: el efecto máximo es una entrada de historial
huérfana en el propio inquilino. Corrección menor, fuera del P0.

**R-3 · `settings` aislada por prefijo de clave.** La tabla no tiene
`organization_id`; el aislamiento es por prefijo `org:<id>:` sobre una clave
primaria de texto, y la organización 1 mantiene además un *fallback* a las
claves heredadas sin prefijo. Funciona y está acotado en ambos endpoints, pero
es aislamiento por convención de cadenas, no por columna. Migrar a
`(organization_id, key)` requiere recrear la tabla en D1 — candidato natural
para el siguiente bloque.

**R-4 · Tablas pivote sin superficie expuesta.**
`developer_property_master_plan` no tiene hoy ningún endpoint. Las demás
(`developer_property_location`, `amenity_developer_property`,
`amenity_community`) solo se leen a través de un padre ya acotado. Si alguna
recibe CRUD propio en el futuro, debe declarar su `tenantPolicy` — el registro
lo obliga, y el test de cobertura de la matriz lo detectaría.

**R-5 · Límite de login por IP y suites automatizadas.**
`/api/auth/login` permite 10 intentos por IP cada 10 minutos, contados también
los fallidos. Es correcto como defensa anti-fuerza bruta, pero penaliza a
oficinas tras NAT y obligó a que la suite E2E reutilice sesión
(`tests/e2e/global-setup.ts`) en vez de autenticarse por fichero. **No se ha
tocado el límite**: relajar una protección de fuerza bruta para acomodar al
banco de pruebas habría sido la solución equivocada. Revisar el diseño
(clave por IP **+** cuenta, con techo distinto para cada una) queda como tarea
propia.

**R-6 · Sin cabecera CSP con nonce.** Fuera del alcance de este bloque;
observación heredada de `server/middleware/security-headers.ts`.
