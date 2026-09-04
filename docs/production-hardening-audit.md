# Auditoría de producción y escala — FASE 0

Estado: **auditoría cerrada**, ejecución por fases en curso (ver `docs/production-readiness-report.md` cuando exista, para el resumen final).

Este documento es el resultado de la Fase 0 del bloque "Production & Scale
Hardening": una lectura completa del repositorio, sin tocar código, antes de
empezar a implementar. Complementa (no repite) dos auditorías ya cerradas y
remediadas en sesiones anteriores:

- [`multitenant-audit.md`](./multitenant-audit.md) — matriz tabla por tabla
  del aislamiento entre inquilinos (91 tablas, 216 endpoints).
- [`multitenant-hardening-report.md`](./multitenant-hardening-report.md) —
  10 vulnerabilidades de aislamiento cross-tenant encontradas y corregidas
  (4 críticas, 4 altas, 2 medias), con 175 tests.

Esa auditoría anterior es la referencia para "¿está aislado el cross-tenant
en general?" — la respuesta corta es que sí, de forma sólida, con tests que
lo demuestran (`test/unit/multitenant.*.test.ts`, `tests/e2e/cross-tenant.spec.ts`).
Esta Fase 0 busca específicamente los problemas del megaprompt de
"production & scale hardening" que **no** entraban en el alcance de esa
auditoría: concurrencia, idempotencia, colas/jobs, backups, sesiones,
observabilidad, rate limiting en capas, RBAC, etc.

### FASE 6 — segunda pasada de verificación (no repite la matriz de 91 tablas)

En vez de rehacer la auditoría tabla-por-tabla ya cerrada, la FASE 6 se
apoyó en la propia FASE 4: quitar `.default(1)` convirtió `organizationId`
en un campo obligatorio en el tipo de `insert().values()` para las 22
tablas tenant-scoped, así que `npm run typecheck` ahora es, en la práctica,
una verificación automática y permanente de que ningún insert nuevo (o ya
existente) omite el tenant — encontró el único hueco real
(`vendor-registration.post.ts`, corregido en FASE 4). Verificación
adicional dirigida, no exhaustiva:

- **Motor genérico de recursos admin** (`server/api/admin/[resource]/index.post.ts`,
  usado por los 216 endpoints de la matriz): `delete data.organizationId`
  antes de aplicar el payload, seguido de
  `data[...] = orgId` con el `orgId` resuelto en servidor — un
  `organizationId` en el body del cliente nunca sobrevive. Ya cubierto por
  `multitenant-hardening-report.md`, confirmado de nuevo aquí.
- **Inserts SQL crudos fuera de Drizzle** (`grep` de `.prepare(`/`db.run(`
  en `server/`): el único INSERT crudo tenant-scoped encontrado
  (`server/api/admin/saas/apikeys.post.ts`) ya fija `organization_id`
  explícitamente en la sentencia. El resto de coincidencias son lecturas
  (`.get.ts`) o updates, no inserts nuevos.
- **`syncTranslations()`** (tablas de traducción, hijas por FK) no necesita
  `organizationId` propio — es un recurso `nestedParent`, ya reforzado por
  el guard de `buildTenantWhere()` sobre el padre antes de escribir.

No se encontraron más huecos. La matriz completa de 91 tablas/216
endpoints de `multitenant-audit.md` sigue siendo la referencia autoritativa
y no se repite aquí.

## Arquitectura encontrada

- **Runtime**: Nuxt 3 + Nitro, preset `cloudflare_module`, desplegado como
  Cloudflare Worker (`sa-inmobiliaria`, ver `wrangler.toml`).
- **Datos**: un único D1 (`sa_inmobiliaria`) compartido por todos los
  tenants, Drizzle ORM, aislamiento por `organizationId` en cada tabla
  tenant-scoped (directo o transitivo vía FK a un padre).
- **Archivos**: un único bucket R2 (`sa-inmobiliaria-media`), con un modelo
  de visibilidad real (`public`/`private`/`confidential`) respaldado por la
  tabla `media_assets`, no por el nombre del objeto.
- **Jobs programados**: 5 cron triggers en `wrangler.toml` (horario, cada
  minuto, diario 03:30, diario 05:00, semanal), cada uno invocando
  directamente su módulo en `server/tasks/**` vía `scheduledTasks` de
  `nuxt.config.ts` — **no existe Cloudflare Queues** todavía (`[[queues]]`
  no aparece en `wrangler.toml`).
- **Sistema de jobs con reintentos que sí existe hoy**: el Publication
  Scheduler (`publication_jobs`/`publication_queue`/`publication_retries`/
  `publication_executions`, migraciones 0032+) — un patrón real de
  status/retryCount/maxRetries/lastError, pero específico de esa feature,
  no generalizado.
- **CI/CD**: un único workflow (`.github/workflows/ci.yml`): `validate`
  (typecheck, unit, build, `migrations:check`, e2e) → `deploy-staging` (en
  cada PR, D1/R2 propios) y `deploy-production` (en push a `main`: backup
  D1 → aplicar migraciones → deploy Worker → smoke test).
- **Riesgo de infraestructura ya conocido y documentado**: Cloudflare
  Workers Builds (la integración git nativa de Cloudflare) sigue activa en
  paralelo al pipeline de GitHub Actions — desplegó código de los PR #56 y
  #57 directamente a producción antes de que las migraciones correspondientes
  se aplicaran, por la misma vía que causó el incidente original de
  julio ("July schema-drift incident", documentado en `wrangler.toml:19-21`
  y `docs/deployment.md`). Sigue pendiente que el usuario lo desactive en el
  dashboard de Cloudflare — no es algo que el código pueda arreglar por sí
  solo.

## Problemas P0 (riesgo real de pérdida/corrupción de datos o cross-tenant)

### P0-1 — Doble reserva de citas (race condition real) — ✅ resuelto en FASE 8

`server/api/public/agents/[slug]/book.post.ts` hace
`isSlotAvailable()` (una lectura) y, si devuelve libre, `INSERT INTO visits`
— dos round-trips D1 independientes, sin transacción ni restricción única
a nivel de base de datos. Dos peticiones concurrentes para el mismo
agente/hora pueden pasar ambas la comprobación antes de que cualquiera
inserte. Es un endpoint público, sin autenticar, con rate limit débil
(8/10min por IP, no por slot). `hasOverlappingVisit()` (usado en el
reprogramado desde admin) tiene la misma carrera.

**Impacto**: doble reserva real y explotable con dos peticiones simultáneas.
**Plan**: Fase 8 de este bloque — restricción de unicidad a nivel de datos
(el modelo de citas usa slots discretos por agente/fecha/hora, así que una
`UNIQUE(agent_id, scheduled_at)` condicional es suficiente; no hace falta
Durable Object) + manejo del conflicto como 409, + test de concurrencia
(100 peticiones simultáneas → 1 reserva).

**Resuelto**: migración 0050 añade `visits_agent_slot_unique`, un índice
`UNIQUE(organization_id, agent_id, scheduled_at)` parcial
(`WHERE status != 'cancelled'`) — puramente aditivo (`CREATE INDEX`, sin
`DROP`/`RENAME`/rebuild de tabla), así que si ya existiera una colisión real
en producción la migración fallaría de forma limpia y atómica antes de
tocar el Worker, en vez de corromper datos en silencio (no se pudo
verificar contra la D1 real desde este entorno — sin credenciales de
Cloudflare aquí, ver "Requiere configuración manual externa"). Los cuatro
puntos de escritura sobre `visits` (`book.post.ts`,
`appointments/[token]/reschedule.post.ts`, y el reasignar/reprogramar desde
admin en `saas/visits/[id].patch.ts`) capturan la violación del índice
(`isUniqueConstraintError()`, nuevo en `server/utils/db.ts`, reutilizado
también en los webhooks de Stripe/Resend que ya usaban el mismo patrón) y
la traducen al mismo 409 amistoso que ya devolvía la comprobación previa —
la comprobación de disponibilidad sigue existiendo como respuesta rápida y
amigable, pero quien cierra la carrera de verdad es el índice. Test de
concurrencia real en `test/unit/visits.slotUnique.test.ts` (dos inserts en
paralelo para el mismo slot vía `Promise.all` — gana exactamente uno).

### P0-2 — `super_admin` sin organización activa cae en tenant 1 (fail-open) — ✅ resuelto en FASE 5

`resolveActiveOrgId()` en `server/utils/auth.ts` — si un `super_admin` no
tiene la cookie `sa_active_org`, **devuelve `1` en vez de fallar**. Esto
contradice el principio que el resto del código sigue explícitamente
(`buildTenantWhere`/`orgIdOrThrow` en `server/utils/tenantPolicy.ts` fallan
cerrado con 403 si `orgId` es nulo, documentado como corrección de un bug
real anterior). Un super_admin que abra el panel sin haber elegido
organización puede crear/editar datos en el tenant 1 creyendo que está en
otro sitio.

**Impacto**: bajo en probabilidad (requiere ser super_admin), pero rompe la
invariante de "nunca caer en tenant 1 en silencio" que el propio proyecto
ya se exige en todo lo demás.
**Plan**: Fase 5 — fallar cerrado (redirigir a selector de organización /
403 controlado), tests para las 6 combinaciones pedidas en el megaprompt.

**Resuelto** (con una corrección tras el primer intento — ver nota de
regresión más abajo): `resolveActiveOrgId()` ya no devuelve el `1`
hardcodeado cuando la cookie `sa_active_org` falta o es inválida. La
primera versión de este fix lanzaba 403 directamente ("fail closed"), pero
eso trataba como error de seguridad algo que no lo es: un super_admin ya
tiene visibilidad total por rol, así que a qué organización cae por
defecto una petición suya es una cuestión de UX, no de permisos — a
diferencia del `organizationId` de un admin normal, que sí controla acceso
real. La versión final resuelve, en su lugar, la organización de **id más
bajo verificada contra la propia DB** (nunca un id fijo que podría apuntar
a un tenant ya borrado) y solo lanza 403 si no existe ninguna organización
en toda la plataforma. `layouts/admin.vue` sigue auto-seleccionando y
persistiendo la primera organización real en su primer render, para que lo
que ve el switcher coincida con lo que el servidor está usando, pero ya no
es lo único que evita un 403. Tests en `test/unit/auth.orgScope.test.ts`.

**Regresión detectada y corregida durante FASE 8**: la primera versión
("fail closed" puro) rompió 10 tests e2e (9 en
`agents-comerciales-admin.spec.ts`, 1 en `appointments.spec.ts`, con 4 más
bloqueados en cascada) — `admin@sa-inmobiliaria.com`, la cuenta que el
propio e2e suite usa para autenticarse
(`tests/e2e/global-setup.ts`/`TENANT_A`), es en realidad `role='super_admin'`
con `organizationId` nulo (`migrations/0021_multi_tenant_orgs.sql:35`), y
el login del e2e es una llamada API directa (`POST /api/auth/login`) que
nunca visita `/admin` en un navegador — así que el bootstrap de cookie de
`layouts/admin.vue` nunca corre para ella, y todas sus llamadas a
endpoints org-scoped devolvían 403. Cualquier acceso API/programático
legítimo como super_admin (no solo este suite: una integración externa,
una herramienta de soporte) habría tenido el mismo problema. La lección: un
"fail closed" que asume que el único cliente es un navegador ejecutando el
layout de admin es una asunción frágil — la corrección con fallback
DB-verificado no depende de ningún bootstrap de UI para funcionar
correctamente.

### P0-3 — Idempotencia de operaciones críticas (pagos, contratos) — ✅ resuelto en FASE 9

La idempotencia de webhooks entrantes (Stripe/Resend) y de la reserva de
citas (P0-1) ya estaba/quedó resuelta. Investigación dirigida (no
indiscriminada — solo operaciones con consecuencia financiera/legal real)
encontró un hueco real sin cubrir:

- **`server/api/admin/saas/deposits.post.ts`**: llama a
  `createDepositCheckout()` (una llamada real a Stripe) y luego hace un
  `INSERT` en `deposit_payments` como dos pasos independientes, sin
  restricción de datos. Un doble clic o un reintento de red podía crear
  **dos sesiones de Checkout de Stripe reales y dos filas
  `deposit_payments`** para el mismo contrato — el cliente solo debe un
  depósito, pero quedaban dos enlaces de pago activos.

**Resuelto**: migración `0051_deposit_payments_contract_processing_unique.sql`
añade un índice único parcial `UNIQUE(contract_id) WHERE status =
'processing'` — solo bloquea mientras hay una sesión de Stripe realmente
activa (no `not_connected`/`failed`, que deben seguir siendo reintentables).
`deposits.post.ts` añade una comprobación previa rápida (evita gastar la
llamada a Stripe en el caso común) y captura la violación del índice
(`isUniqueConstraintError()`) como el cierre real de la carrera, devolviendo
409. Purely additive (`CREATE INDEX`), mismo patrón que
`visits_agent_slot_unique` (migración 0050).

También se encontraron y corrigieron dos carreras más baratas de cerrar,
sin cambio de esquema — ambas eran un `SELECT` + comprobación de estado
seguido de un `UPDATE` incondicional, donde dos envíos concurrentes podían
pasar la comprobación antes de que cualquiera escribiera:

- **`server/api/public/contracts/[token]/accept.post.ts`** (aceptación
  pública de un contrato, firma electrónica simple): dos aceptaciones
  concurrentes podían generar dos PDFs en R2 (consumiendo cuota dos veces)
  y disparar el webhook `contract.accepted` dos veces. El `UPDATE` ahora
  lleva `WHERE status = 'sent'` y comprueba si realmente actualizó una
  fila (`.returning()`); si no, 409 — el webhook y la notificación interna
  solo se disparan si esta petición ganó la carrera.
- **`server/api/admin/saas/contracts/[id]/send.post.ts`** (envío admin de
  un contrato al cliente): mismo patrón, `WHERE status = 'draft'`, cierra
  un doble email al cliente por doble clic.

No se tocó la creación de contratos (`contracts.post.ts`) — un doble clic
ahí solo produce un borrador duplicado, sin consecuencia financiera/legal
mientras no se envíe, y cerrarlo requeriría una clave de idempotencia
generada por el cliente (cambio de frontend, no solo de backend) — coste
desproporcionado al riesgo real, documentado aquí como hueco menor
conocido, no como pendiente urgente.

Tests reales contra SQLite en `test/unit/idempotency.criticalOps.test.ts`:
inserts en paralelo para el mismo contrato/estado (gana exactamente uno),
un intento fallido no bloquea un reintento, un depósito ya resuelto libera
el hueco para uno nuevo, dos contratos distintos no se bloquean entre sí,
y el mismo patrón de `UPDATE ... WHERE status = X` para
aceptar/enviar contratos.

### P0-4 — Tokens de sesión en claro en D1 (P1-3) — ✅ resuelto en FASE 19

`sessions.id` era el token de sesión en texto plano desde la migración
0001 — inconsistente con `password_reset_tokens.tokenHash`/`api_keys.keyHash`,
que este mismo proyecto ya hashea. Una fuga o un backup de D1 entregaría
cookies de sesión directamente reutilizables para cualquier usuario con
sesión activa.

**Resuelto** con compatibilidad hacia atrás, tal como pedía el propio
megaprompt (no invalidar sesiones activas de golpe): migración
`0052_sessions_token_hash.sql` añade una columna `token_hash` (nullable) y
un índice único parcial sobre ella — puramente aditiva. `createSession()`
ahora guarda solo el SHA-256 del token (mismo patrón que
`password_reset_tokens`), con `id` como un identificador interno opaco sin
relación con el token real. `getSessionUser()` busca por
`token_hash = hash(cookie) OR id = cookie` — el segundo término es la ruta
de compatibilidad para sesiones creadas antes de este cambio (`id` seguía
siendo el token en claro, `token_hash` nulo) — y si encuentra una sesión
por esa ruta legacy, la rota en el mismo request: nuevo `id` aleatorio +
`token_hash` real, sin invalidar la cookie del cliente (sigue siendo el
mismo token, solo que ahora se re-hashea en cada petición en vez de
compararse en claro). `destroySession()` borra por ambas rutas también.
Ninguna sesión existente se invalida; las que nunca vuelven a usarse
simplemente expiran de forma natural dentro de `SESSION_TTL_DAYS` (7 días
por defecto).

Tests en `test/unit/sessions.tokenHash.test.ts`: colisión real de
`token_hash` (rechazada), múltiples filas legacy con `token_hash` nulo
(coexisten, el índice parcial no las afecta), el flujo completo de
detección-y-rotación de una sesión legacy, y que ninguna fila conserva el
token en claro tras rotar.

### P1-4 — Webhooks salientes sin reintento ni dead-letter — ✅ resuelto

`dispatchWebhook()` hacía exactamente un intento por endpoint y marcaba
`'failed'` permanentemente si fallaba, pese a que `webhook_deliveries.attempts`
ya sugería que se había pensado en reintentos — a diferencia del email, que
sí tiene backoff real (`email_log.next_retry_at` +
`retry-email-queue.ts`).

**Resuelto** con exactamente el mismo patrón que el email, en vez de una
segunda implementación distinta: migración `0054_webhook_deliveries_retry.sql`
añade `next_retry_at` (aditiva, `ADD COLUMN`, sin rebuild). La lógica de un
intento se extrajo a `attemptWebhookDelivery(db, deliveryId)` — reutilizada
tanto por el envío inicial (`dispatchWebhook`) como por la nueva tarea cron
`server/tasks/notifications/retry-webhook-queue.ts` (horaria, mismo trigger
que `retry-email-queue.ts`), así que el comportamiento de reintento (backoff
2/10/30/120/360 min, 5 intentos y luego `'failed'` permanente) es idéntico
en ambos casos, no dos implementaciones a mantener sincronizadas. La
función re-obtiene la URL/secret del endpoint en cada intento (no los
guardados en el momento del envío original), así que un secreto rotado o
un endpoint desactivado/eliminado entre el envío y un reintento se respeta
— un endpoint ya no válido falla la entrega inmediatamente, sin gastar
reintentos en algo que nunca va a funcionar.

Tests en `test/unit/webhooks.retry.test.ts`: entrega exitosa limpia el
reintento programado, un error HTTP o de red encola con backoff, se agota
tras `MAX_WEBHOOK_ATTEMPTS` intentos, y un endpoint desactivado/eliminado
falla de inmediato sin reintentar.

### P1-5 — Backup diario de D1 sin streaming, todo en memoria — ✅ resuelto

`backup-d1.ts` hacía `SELECT *` completo por cada tabla, acumulaba **todas**
las tablas en un único objeto JS y solo entonces hacía un único
`JSON.stringify()` + gzip antes de subir a R2 — un riesgo real de doble
cara: agota la memoria del propio Worker al crecer los datos, y D1 tiene su
propio límite de tamaño de resultado por query que puede romper un
`.all()` sin paginar incluso antes de llegar a ese límite de memoria — no
es solo un problema de rendimiento, es un problema de escalabilidad.

**Resuelto**: la lógica se extrajo a `server/utils/backup.ts` (el archivo
de la tarea programada se queda fino, solo orquesta — mismo patrón que
`attemptSend()`/`attemptWebhookDelivery()` viviendo fuera de sus archivos
de tarea) con `buildBackupStream()`: cada tabla se lee en páginas de 500
filas vía paginación por `rowid` (el pseudo-columna nativo de SQLite,
presente en toda tabla no declarada `WITHOUT ROWID` — verificado que
ninguna migración usa esa cláusula, así que esto funciona sin necesitar
conocer el nombre de la columna PK real de cada tabla), y el JSON de
salida se construye de forma incremental (`ReadableStream` manual) en vez
de acumularse — nunca se mantiene en memoria más de una página de una
tabla a la vez. El stream se conecta directamente a
`CompressionStream('gzip')` y de ahí a `R2Bucket.put()` (que acepta un
`ReadableStream` como cuerpo), así que tampoco se materializa el archivo
comprimido completo antes de subirlo. El formato de salida es idéntico al
anterior (`{takenAt, tables: {nombre: filas[]}}`, un objeto gzip por día
en `backups/{día}.json.gz`) — no había ningún script de restore que
dependiera de la forma anterior (verificado, es el único sitio que produce
o consume este formato), así que no hacía falta cambiar nada aguas abajo.

Tests en `test/unit/backup.streaming.test.ts`, contra una D1 real (mismo
`node:sqlite` que el resto de la suite, con un adaptador mínimo con forma
de `D1Database`): el JSON producido en streaming es idéntico en contenido
al que produciría un dump completo en memoria, a través de varias páginas;
`stats.totalRows` coincide exactamente con lo emitido; una tabla vacía
produce un array vacío sin romper el JSON; y un nombre de tabla que no es
un identificador seguro se rechaza limpiamente.

### P1-6/P1-7 — Vistas y favoritos eran contadores manipulables por cualquiera — ✅ resueltos

Dos hallazgos con la misma raíz: el sitio público no tenía ningún concepto
de "visitante", así que ni `view.post.ts` ni `favorite.post.ts` podían
distinguir una petición legítima de un script repitiendo la misma llamada.
`favorite.post.ts` confiaba ciegamente en el booleano `on` del cliente para
incrementar/decrementar `developerProperties.favoriteCount` directamente —
cualquiera podía inflar o vaciar el contador de cualquier listado.
`view.post.ts` incrementaba `viewCount` sin rate limit ni deduplicación —
cualquier script podía inflar contadores o generar carga de escritura sin
límite.

**Resuelto**: `server/utils/visitor.ts` añade una cookie anónima de larga
duración (`sa_visitor`, `httpOnly`, 2 años) — sin datos personales, mismo
perfil de privacidad que cualquier cookie de sesión, pero para un sitio sin
cuentas. El frontend de favoritos (`composables/useFavorites.ts`) ya
llevaba su propio estado por-visitante en `localStorage` y no necesitó
ningún cambio — el arreglo es enteramente del lado del servidor:

- **Favoritos**: migración 0055 crea la tabla `favorites` con
  `UNIQUE(organization_id, developer_property_id, visitor_id)`. Marcar
  como favorito hace un `INSERT` real (idempotente — un duplicado por el
  mismo visitante no lanza error, simplemente no vuelve a incrementar el
  contador); quitarlo hace un `DELETE` real. `favoriteCount` sigue
  existiendo como agregado cacheado para lecturas rápidas, pero ahora solo
  se mueve ±1 cuando el `INSERT`/`DELETE` de este visitante concreto
  realmente tuvo efecto — nunca por la sola palabra del cliente.
- **Vistas**: `property_views` gana `visitor_id` (columna aditiva).
  `view.post.ts` añade `rateLimit()` (mismo patrón que el resto del
  proyecto) y deduplica: si este visitante ya tiene una vista registrada
  para esta propiedad en los últimos 30 minutos, no se cuenta de nuevo —
  una "vista" vuelve a significar una visita real, no cada recarga de
  página.

Tests en `test/unit/visitorIdentity.test.ts`: la cookie se respeta si ya
es válida, se genera una nueva si falta o está manipulada, dos peticiones
sin cookie obtienen ids distintos; y contra D1 real: el mismo visitante no
puede favoritear dos veces la misma propiedad (choque de unicidad),
visitantes distintos sí pueden coexistir, y quitar el favorito de uno no
afecta al de otro.

### P1-10 — Endpoints de health check — ✅ resuelto

No existían `/api/health/live` ni `/api/health/ready` — un monitor externo
(Cloudflare Health Checks, UptimeRobot, etc.) o el propio pipeline de
despliegue no tenían una superficie estándar y barata para preguntar "¿está
vivo?" separada de "¿está realmente listo?".

**Resuelto**: `/api/health/live` no comprueba ninguna dependencia — solo
confirma que el propio Worker responde; una sonda de liveness que dependiera
de D1/R2 sería una causa típica de falsos positivos (reinicios en bucle
cuando el problema es de una dependencia, no del proceso). `/api/health/ready`
sí comprueba D1 (`SELECT 1`) y R2 (`head()` sobre una clave que no
necesita existir — una respuesta `null` ya confirma que R2 contestó) vía
`server/utils/health.ts` (extraído para ser testable sin el runtime de
Workers), devolviendo 503 si alguna falla. Ambos son públicos y no
exponen datos de negocio, solo ok/error por dependencia.
`server/middleware/00.tenant.ts` añade `/api/health` a las rutas que no
pasan por la resolución de tenant por dominio — un monitor puede llegar
por IP o un hostname genérico nunca registrado como dominio de ningún
tenant, y no debe recibir un 404 de esa resolución antes de llegar
siquiera al chequeo. `scripts/smoke-test.mjs` los usa como primera
comprobación tras cada despliegue.

Tests en `test/unit/health.test.ts` para `checkDatabaseHealth()`/
`checkStorageHealth()`: éxito y fallo real con el mensaje de error
correcto en ambos casos.

### P1-12 — Request-ID de correlación — 🟡 resuelto parcialmente (`error_logs` + `webhook_deliveries`, `email_log` diferido)

Sin hilo conductor entre `error_logs`, `webhook_deliveries` y `email_log`
para una misma petición — un fallo de entrega de webhook y un error log
causados por la misma petición solo podían relacionarse a ojo, comparando
timestamps.

**Resuelto para `error_logs` y `webhook_deliveries`**:
`server/utils/requestId.ts` reutiliza la cabecera `cf-ray` de Cloudflare
(ya única por petición en el edge, gratis, sin infraestructura nueva) y
solo genera un id de repuesto donde `cf-ray` no está presente (`wrangler
dev` local, tests) — cacheado en `event.context` para que todas las
lecturas dentro de la misma petición coincidan. Migración 0056 añade
`request_id` (aditiva) a ambas tablas; `error-logging.ts` y
`dispatchWebhook()` lo fijan al crear cada fila — un reintento de webhook
no lo vuelve a derivar (es un job de fondo, no está atado a la petición
original que ya quedó registrada en la fila).

**Deliberadamente fuera de esta pasada: `email_log`.**
`sendTransactionalEmail()` no recibe el `event` — lo llaman ~9 archivos a
través de varias capas de utilidades intermedias (`notifyAppointment()`,
`upsertLead()`, el flujo de depósitos de Stripe, etc.). Enhebrar
`requestId` hasta ahí es mecánico pero amplio (tocar cada capa
intermedia para pasar un parámetro opcional) — desproporcionado frente al
valor diagnóstico marginal: un fallo de email ya es visible y trazable por
sí solo vía `email_log.status`/`errorMessage`, sin depender de
correlacionarlo con otra tabla para diagnosticarlo. Documentado aquí como
hueco menor conocido, no urgente — no silenciado.

Tests en `test/unit/requestId.test.ts`: reutiliza `cf-ray` cuando está
presente, genera un id de repuesto cuando no lo está, lo cachea dentro de
la misma petición, y dos peticiones distintas sin `cf-ray` obtienen ids
distintos.

### P1-9 — Tooling de lint (ESLint) — ✅ resuelto

No existía ni ESLint ni Biome configurado, ni `npm run lint` — el único
análisis estático era `typecheck`, que no detecta código muerto,
mutaciones de props, bloques `catch {}` sin contexto, ni un puñado de
otras clases de bug reales.

**Resuelto**: `@nuxt/eslint` (el módulo oficial de Nuxt 3) añadido a
`modules` en `nuxt.config.ts` — genera `.nuxt/eslint.config.mjs` a partir
de la estructura real del proyecto en cada `nuxt prepare`/`dev`/`build`
(ya disparado por `postinstall`, así que CI no necesita un paso extra).
`eslint.config.mjs` en la raíz lo importa y añade dos overrides
documentados: `@typescript-eslint/no-explicit-any` a `off` (este proyecto
usa `any` de forma justificada en varios sitios — ver CLAUDE.md) y
`vue/multi-word-component-names` a `off` (no encaja con páginas/layouts de
una sola palabra ya existentes, p.ej. `pages/index.vue`). `npm run lint`
(y `lint:fix`) añadidos a `package.json`; `.github/workflows/ci.yml`
ejecuta `npm run lint` en el job `validate`, justo después de `typecheck`.

**Triaje de las ~477 violaciones que salieron en la primera pasada**
(110 errores, 367 warnings):

- **Auto-fix seguro** (`eslint . --fix`): `vue/html-self-closing` (335),
  `vue/attributes-order` (4), `prefer-const` (3), `import/no-duplicates`
  (2) — puramente estilístico, sin cambio de comportamiento.
- **Bugs reales corregidos a mano** (imports/variables muertas,
  bloques vacíos, deletes dinámicos, expresiones sin efecto):
  - `server/utils/ai.ts`: función `facts()` completamente muerta (nunca
    llamada) — eliminada.
  - `components/admin/CmsSeoPanel.vue`: un ternario usado solo por su
    efecto secundario (`u.includes(...) ? internal++ : external++`) —
    reescrito como `if`/`else`, mismo comportamiento, más legible.
  - `server/api/admin/saas/webhooks/[id]/test.post.ts` y
    `server/utils/email/send.ts`: `let x: T[] = []` cuyo valor inicial
    nunca se leía (una rama try/catch lo sobrescribe siempre) — el `[]`
    inicial era ruido, no un bug, pero merecía limpiarse.
  - 6 bloques `catch {}` genuinamente vacíos (localStorage al guardar
    preferencia de vista, `navigator.share`/`clipboard` al compartir,
    `JSON.parse` de un plan de pagos con fallback) — todos son
    "best-effort, no hay nada que hacer si falla" legítimo, pero
    CLAUDE.md pide no silenciar sin contexto: se añadió un comentario de
    una línea a cada uno (ESLint no marca como vacío un bloque que
    contiene un comentario, así que esto también resuelve el lint).
  - 5 imports/variables no usadas (`now`, `and`, un parámetro de evento,
    un helper de test) — eliminadas. Verificado antes de borrar que
    `now` no correspondía a una columna `updated_at` olvidada sin
    actualizar (las tablas afectadas no tienen esa columna).
  - `test/unit/email.send.test.ts`: `stubFailingResend()` estaba
    definido pero nunca usado — resultó ser un hueco de cobertura real
    (existían tests para "sin API key" y "envío exitoso", pero ninguno
    para "Resend conectado mas rechaza el envío", un código de retorno
    distinto — `connected:true, ok:false` en vez de `connected:false`).
    Se añadió el test que faltaba en vez de solo borrar el import.
  - `pages/admin/[resource]/[id].vue`: `vue/no-deprecated-filter` marcaba
    `resource as 'developer-properties' | 'properties'` en el template —
    era un falso positivo (el `|` es un union type de TS, no un filtro de
    Vue 2), pero el fix real es extraer el cast a un `computed()` en el
    script, ya que mezclar sintaxis de tipos con expresiones de template
    es en sí mismo confuso.
  - `layouts/root.vue` y `pages/blog/[slug].vue`:
    `vue/no-multiple-template-root` señalaba un `<slot v-else />` desnudo
    como raíz y comentarios HTML como nodos raíz junto a elementos
    condicionales — relevante de verdad en este proyecto porque
    `nuxt.config.ts` tiene `pageTransition` activado, y `<Transition>`
    exige poder identificar sin ambigüedad exactamente un nodo raíz por
    render; un `<slot>` desnudo puede expandirse a 0 o varios nodos según
    lo que reciba. Envuelto en un `<div>`; comentarios movidos fuera de
    la raíz.
  - 3 warnings `vue/no-template-shadow`: variables de `v-for` (`t`, `p`)
    que tapaban un `t` (función de i18n) o `p` (computed del proyecto)
    del scope superior, ambos usados extensamente en el resto de esas
    plantillas. Sin bug activo hoy (ningún código dentro de esos bloques
    intentaba usar el binding tapado), pero sí una trampa real para una
    edición futura — variables de `v-for` renombradas.
- **Casi-error evitado**: `pages/admin/widgets.vue` tenía
  `` `<script ...><\/script>` `` (un embed code generado para copiar) con
  un escape `\/` que `no-useless-escape` marcaba como innecesario.
  Quitarlo mecánicamente **rompe el parseo del propio `.vue`** — el
  compilador de SFC de Vue localiza los límites de bloque con reglas de
  parseo HTML, no con reglas de sintaxis JS, así que un `</script>` sin
  escapar dentro de un string termina prematuramente el bloque
  `<script setup>` real del archivo (verificado directamente con
  `@vue/compiler-sfc`, que en efecto falla con "Invalid end tag" tras el
  cambio). Revertido; el escape se mantiene con un
  `eslint-disable-next-line` documentado explicando por qué.
- **`vue/no-mutating-props` (79 apariciones en ~13 archivos) — bajado a
  `warn`, no corregido en esta pasada.** Concentrado casi por completo en
  `components/site-builder/inspectors/*`,
  `components/site-builder/inspector/CommonBlockSettings.vue` y
  `components/property-builder/LocationSection.vue`: un patrón
  deliberado y consistente en todo un subsistema (mutar un prop `content`/
  `block`/`form` in-place en vez de un `v-model` basado en emits), no
  errores aislados. Funciona hoy porque el objeto pasado por el padre es
  reactivo y se muta por referencia. Migrar las ~79 apariciones a un
  patrón de emits es un refactor mecánico pero de blast radius amplio
  (~13 archivos) sin tests de componente que lo cubran — exactamente el
  tipo de cambio que el propio plan de hardening pide documentar y no
  lanzar sin red de seguridad. Bajado a warning (no desactivado) con el
  motivo documentado en `eslint.config.mjs`; código nuevo debería seguir
  prefiriendo emits.
- **`vue/no-v-html` (12 apariciones) — revisado, dejado como warning.**
  Las 12 renderizan un SVG inline desde una tabla de constantes cerrada
  indexada por una clave conocida en tiempo de desarrollo (`ICONS[...]`,
  `SOCIAL_ICONS[...]`, `meta(c.type).icon`) — nunca contenido externo ni
  introducido por el usuario. No es un vector XSS real; se deja como
  aviso legítimo pero no se actúa sobre él.
- **`vue/require-default-prop` (13 apariciones) — dejado como warning.**
  Cosmético (props opcionales sin `default` explícito); no vale la pena
  tocar 13 componentes por esto en esta pasada.

Resultado: `npm run lint` pasa con **0 errores** (105 warnings, todas
triadas y con motivo documentado arriba, no ignoradas a ciegas).

Verificación adicional (más allá de typecheck/test/build/migrations:check):
cada archivo `.vue` tocado se reparseó directamente con
`@vue/compiler-sfc` para confirmar 0 errores de parseo, y se levantó un
build real (`wrangler dev` contra `.output/`) para comprobar por HTTP que
`/`, `/blog` y `/propiedades` siguen respondiendo 200 y que la rama
`sa-landing` de `layouts/root.vue` (la que se modificó) sigue
renderizando.

### P1-8 — Subida de vídeo directa a R2 (chunked/multipart) — ✅ resuelto

Un vídeo (hasta 100MB) se subía en una sola petición al Worker —
`readMultipartFormData()` bufferea el cuerpo entero en memoria antes de que
`storeFile()` pudiera siquiera empezar a validarlo, exactamente la limitación
que el propio comentario junto a `MAX_VIDEO_UPLOAD_BYTES` documentaba.

**Resuelto**: rediseñado como subida chunked mediada por el Worker usando la
API de multipart de R2 (`createMultipartUpload`/`uploadPart`/`complete`/
`resumeMultipartUpload`/`abort` — expuesta directamente por el mismo binding
`MEDIA` que ya existía, sin credenciales ni recursos nuevos). Lógica en
`server/utils/mediaMultipart.ts`, 3 endpoints nuevos bajo
`server/api/admin/upload/multipart/` (`init` → `[uploadId]/part` →
`[uploadId]/complete`, más `[uploadId]/abort` para cancelación explícita),
consumidos por `components/property-builder/VideoField.vue` (única superficie
de subida de vídeo del proyecto). El vídeo se retiró por completo del
endpoint antiguo (`server/api/admin/upload.post.ts`) — no queda una segunda
ruta que siga aceptando 100MB en una sola petición.

Decisiones de diseño:
- **Tamaño de parte**: 10MB (`MULTIPART_PART_MAX_BYTES`) — por encima del
  mínimo de 5MB que exige R2/S3 para toda parte salvo la última (verificado
  en pruebas manuales: subir una parte de 1MB seguida de otra falla en
  `complete()` con un error real de R2, no simulado). Un vídeo de 100MB
  queda en ~10 partes, muy por debajo del límite de 10.000 de R2.
- **Validación de magic bytes**: solo en la parte 1 — todas las firmas de
  vídeo que reconoce `contentMatchesType()` viven en los primeros ~8 bytes
  del archivo, así que no hace falta esperar al archivo completo. Un
  rechazo en la parte 1 aborta la subida entera de inmediato (no tiene
  sentido dejar que el cliente siga mandando el resto).
- **Límite real de tamaño, no solo el declarado**: el cliente declara un
  `sizeBytes` en `init` (precheck de cuota, misma honestidad que
  `storeFile`), pero nada impide que mande más partes de las que declaró.
  `completeMultipartUpload()` vuelve a comprobar el tamaño **real**
  ensamblado (`R2Object.size`) contra el límite de 100MB y contra la cuota
  del tenant — si se excede, borra el objeto de R2, marca la subida
  `aborted` y nunca llega a registrar `media_assets` ni a cobrar cuota.
- **Checksum sin volver a bufferear el archivo completo**: `sha256Hex()`
  (server/utils/checksum.ts) es de un solo golpe sobre un buffer entero —
  usarlo aquí habría reintroducido el mismo problema de memoria que esto
  arregla. `hashR2Object()` en su lugar streamea el objeto ya subido
  (`bucket.get(key).body`, un `ReadableStream`) a través de un hash
  incremental de `node:crypto` (`createHash('sha256')` — Node compat ya
  activado en `wrangler.toml` desde el inicio del proyecto, verificado que
  funciona en runtime real, no solo en build, con una subida completa de
  extremo a extremo vía `wrangler dev`). Memoria acotada, coste extra en
  CPU/tiempo, no en RAM — el mismo compromiso que el resto del diseño.
- **Ownership de la subida**: cada subida abierta se registra en la nueva
  tabla `media_multipart_uploads` (migración 0057, `organizationId` +
  `uploadId` + `status`). Cada petición de parte/complete/abort exige una
  fila `pending` que pertenezca a la organización de la sesión —
  exactamente el mismo principio que ya enuncia el comentario de
  `buildStructuredKey()`: la propiedad siempre viene de una fila de D1,
  nunca de confiar en el string del key o del uploadId por sí solos.
- **Limpieza de subidas abandonadas**: una pestaña cerrada o una conexión
  perdida a mitad de subida deja un multipart upload abierto en R2 y una
  fila `pending` en D1 para siempre si nada las cierra.
  `sweepStaleMultipartUploads()` se añadió a la tarea diaria
  `system:media-lifecycle` (24h de antigüedad) como tercer trabajo junto a
  la purga de `media_assets` y la reconciliación de cuota. Un segundo
  backstop nativo de R2 (regla de lifecycle `AbortIncompleteMultipartUpload`
  en el bucket) queda documentado como configuración manual pendiente —
  ver "Requiere configuración manual externa" — pero no es necesario para
  que la función sea segura hoy.

**Verificado más allá de typecheck/test/build/migrations:check**: 23 tests
nuevos en `test/unit/mediaMultipart.test.ts` (con un fake de R2 al estilo de
`fakeHealthyBucket`/`fakeD1` ya establecido en el proyecto) cubriendo cada
función y sus casos de rechazo. Además, flujo completo probado en vivo
contra `wrangler dev` real (R2 y D1 locales, no simulado en el sentido de
"solo unit tests"): init→parte→complete feliz, rechazo por magic bytes con
auto-abort verificado (una parte posterior al aborto devuelve 404), abort
explícito idempotente, bloqueo de carpetas no permitidas, y — crítico para
esta función en concreto — un script de Playwright real ejecutando el
código *exacto* de `VideoField.vue` (`$fetch` con `query`/`body: Blob`)
dentro de un navegador de verdad autenticado contra el servidor, no solo
`curl`, confirmando que el recorte de archivo por `File.slice()` y las
peticiones PUT con cuerpo binario funcionan tal como se diseñaron en el
cliente real, no solo en el servidor.

## Problemas P1 (reales, menor urgencia o menor probabilidad)

| # | Hallazgo | Archivo | Nota |
|---|---|---|---|
| P1-13 | 2 tests e2e de `agents-comerciales-admin.spec.ts` fallan de forma **preexistente**, no causada por este bloque de hardening | `tests/e2e/agents-comerciales-admin.spec.ts:162,194` | `page.goto('/admin/agents')` no renderiza el heading "Comerciales" esperado en este sandbox (`getByRole('heading', {name:'Comerciales'})` timeout). Verificado con `git stash` + rebuild + re-run contra el código sin los cambios de FASE 5/FASE 8 de este bloque: falla exactamente igual, así que no es una regresión de esta sesión — pendiente de investigar por separado, fuera del alcance de este bloque de hardening |
| P1-1 | ~~`agents.email`, `developers.email`, `team_members.email` son `UNIQUE` global, no por tenant~~ — ✅ resuelto en FASE 7 | `server/db/schema.ts` | Migración 0053, `UNIQUE(organization_id, email)` en las 3 tablas — ver `test/unit/multitenant.emailAndInvoiceScoping.test.ts` |
| P1-2 | ~~`invoices.number` es `UNIQUE` global pese a que `invoices` ya es tenant-scoped~~ — ✅ resuelto en FASE 7 | `server/db/schema.ts` | Migración 0053, `UNIQUE(organization_id, number)` |
| P1-3 | ~~Tokens de sesión se guardan en claro en D1 (no hasheados)~~ — ✅ resuelto en FASE 19 | `server/utils/auth.ts` `createSession()` | Migración 0052 + rotación retrocompatible en `getSessionUser()`, ver detalle abajo |
| P1-4 | ~~Webhooks salientes hacen un único intento, sin dead-letter ni tarea de reintento~~ — ✅ resuelto | `server/utils/webhooks.ts` | Migración 0054 + `attemptWebhookDelivery()` + `retry-webhook-queue.ts`, mismo patrón que el email — ver detalle abajo |
| P1-5 | ~~Backup diario de D1 carga todas las tablas enteras en memoria antes de comprimir y subir, sin streaming/chunking~~ — ✅ resuelto | `server/tasks/system/backup-d1.ts` | `buildBackupStream()` en `server/utils/backup.ts` — paginado por `rowid` + JSON incremental — ver detalle abajo |
| P1-6 | ~~Cada vista de propiedad hace 2 escrituras D1 sin rate limit ni deduplicación de visitante~~ — ✅ resuelto | `server/api/public/properties/[slug]/view.post.ts` | `rateLimit()` + dedup por visitante (ventana de 30 min) — ver detalle abajo |
| P1-7 | ~~Favoritos son un contador crudo incrementable/decrementable directamente desde el cliente, sin restricción de unicidad~~ — ✅ resuelto | `server/api/public/favorite.post.ts` | Tabla `favorites` real, migración 0055 — ver detalle abajo |
| P1-8 | ~~Subida de vídeo (hasta 100MB) atraviesa el Worker completo (limitación de memoria de request documentada en el propio código)~~ — ✅ resuelto | `server/utils/mediaMultipart.ts` | Subida chunked/multipart directa a R2 — ver detalle abajo |
| P1-9 | ~~No existe `npm run lint` ni ESLint/Biome configurado~~ — ✅ resuelto | `package.json` | `@nuxt/eslint` + `npm run lint` en CI — ver detalle abajo |
| P1-10 | ~~No existen `/api/health/live` ni `/api/health/ready`~~ — ✅ resuelto | `server/api/health/` | Ambos existen, `smoke-test.mjs` los usa — ver detalle abajo |
| P1-11 | ~~El pipeline de CI no valida que `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`/`PRODUCTION_URL` existan y sean válidos antes de desplegar~~ — ✅ resuelto en FASE 1 | `.github/workflows/ci.yml` | Jobs `staging-preflight`/`production-preflight` (comentario de cabecera desactualizado corregido aquí, la corrección ya estaba hecha en el commit `0c36a43`) |
| P1-12 | ~~Sin request-ID / correlación entre `error_logs`/`webhook_deliveries` para una misma petición~~ — 🟡 resuelto parcialmente | `server/plugins/error-logging.ts` | `error_logs` y `webhook_deliveries` correlacionados; `email_log` queda deliberadamente fuera de esta pasada — ver detalle abajo |

## Problemas P2 (mejoras de calidad, no urgentes)

- ~~Sin `.env.example` (no es un problema de seguridad — no se encontraron
  secretos hardcodeados en todo el repo — pero sí de onboarding)~~ —
  ✅ resuelto: `.dev.vars.example` (el nombre idiomático para
  `wrangler dev`/`nitro-cloudflare-dev` en un Worker — no hay
  `runtimeConfig`/`process.env` de Nuxt en juego aquí, así que `.env.example`
  habría sido el nombre equivocado) documenta las ~30 variables/secrets
  reales del proyecto, agrupadas y con nota de cuáles son opcionales
  (todas menos los dos webhooks entrantes, que ya fallan con un 503 claro
  si falta su secreto de firma). `.gitignore` ganó también una entrada para
  `.dev.vars` (no la tenía — un `.dev.vars` real con secretos podría
  haberse comiteado por accidente) junto al carve-out para el `.example`.
- ~~Sin RBAC granular más allá de `super_admin`/`admin`/`user`~~ — 🟡
  resuelto parcialmente. `users.permissions` (migración 0058) + las 8 áreas
  de `utils/adminAreas.ts` (General/CRM/Portal Web/Finanzas & Growth/Blog &
  CMS/Contenido/Bandeja/Sistema) ya tienen: un editor visual real en
  Sistema → Usuarios (`components/admin/UserPermissionsEditor.vue`, visible
  solo a un `super_admin`, con guard de servidor a juego en
  `[id].put.ts`/`index.post.ts` para que nadie más pueda auto-concederse
  permisos), filtrado del menú lateral por área
  (`layouts/admin.vue`'s `visibleNav`), y enforcement real del lado servidor
  en el motor genérico de recursos: los 31 recursos de
  `server/utils/adminResources.ts` llevan un `area` obligatorio, y cada ruta
  bajo `server/api/admin/[resource]/**` pasa ese `area` (y `read`/`write`
  según el verbo) a `requireOrgScope()`, que ya sabía comprobarlo
  (infraestructura de una pasada anterior). **Lo que falta**: los
  endpoints a medida fuera del motor genérico (Leads/Clientes/Visitas/
  Reservas → `crm`; Facturación/Contratos/Depósitos/Automatizaciones/AI
  Studio/Widgets/Marketplace/API → `finance`) no llaman a
  `requireOrgScope()` con área todavía, así que un admin restringido sin
  acceso a CRM/Finanzas puede seguir navegando a esas páginas y sus datos
  directamente por URL aunque ya no las vea en el menú — el menú se oculta,
  pero el servidor no corta el paso ahí. Cerrar esa brecha significa anotar
  cada endpoint bespoke uno a uno (son ~9 páginas distintas, cada una con su
  propio archivo de rutas), pendiente de una pasada futura dedicada.
- `developer_properties.publishedAt` no controla realmente la visibilidad
  pública — auditado a raíz del punto 30 del megaprompt de rediseño del
  Property Builder ("auditar si el backend distingue borrador/publicado
  antes de surfacear un control en el builder"). El campo existe, y
  `pages/admin/developer-properties/index.vue`/`DeveloperPropertyCard.vue`
  ya tienen un botón "Publicar/Despublicar" (fuera del Property Builder)
  que lo pone a `null`/una fecha. Pero ninguno de los endpoints públicos
  (`server/api/public/properties.get.ts`, `properties/[slug].get.ts`,
  `server/api/widget/properties.get.ts`) filtra por él — el widget solo lo
  usa como criterio de orden (`desc(P.publishedAt)`). Una propiedad
  "Despublicada" hoy sigue exactamente igual de visible en la web pública;
  el botón cambia una etiqueta en el admin, no el acceso real. `properties`
  (2ª mano) no tiene ningún concepto de borrador/publicado — ni columna.
  Decisión (confirmada con el usuario): documentar el hallazgo y no añadir
  nada al Property Builder por ahora — un paso "Borrador/Publicado" ahí
  mostraría como funcional algo que hoy no lo es. Arreglar el enforcement
  real es un cambio de comportamiento de producción (propiedades hoy
  "despublicadas" pero visibles dejarían de aparecer en la web al
  desplegarse) y queda fuera de esta pasada, pendiente de una decisión
  explícita futura.
- ~~Sin presupuestos de rendimiento de build ni lazy-loading auditado de
  librerías pesadas (Leaflet, PDF, QR)~~ — ✅ auditado, ya estaba resuelto
  por convención existente, no hizo falta código nuevo: `pdf-lib` y
  `qrcode`/`jsqr` se importan exclusivamente desde `server/**` (0 bytes en
  el bundle de cliente, verificado grepeando los 120 `.js` reales de
  `.output/public/_nuxt`); Leaflet (+`leaflet.markercluster`) solo se
  importa desde `LocationPicker.client.vue`/`EmbedMiniMap.client.vue`/
  `MapExplorer.client.vue` — el sufijo `.client.vue` + el code-splitting
  automático por ruta de Nuxt/Vite ya lo aíslan en un chunk propio
  (~146KB) que solo descargan `/mapa`, `/embed` y la edición de recurso en
  admin, nunca el chunk compartido que carga cada página. Sin herramienta
  de bundle-analysis instalada (`rollup-plugin-visualizer` o similar);
  documentado aquí como mejora futura opcional en vez de añadirla ahora
  sin una necesidad concreta. Nota aparte, no relacionada con este punto:
  el mismo audit encontró que la hoja de estilos de Leaflet podría no
  cargar en `/embed` ni en la edición de recurso en admin (solo se
  encontró en el chunk CSS de `/mapa`) — verificación pendiente, ver tarea
  sugerida en el registro de esta sesión.
- ~~Sin monitorización sintética externa ni suite de carga (`k6` o
  equivalente)~~ — 🟡 código listo, bloqueado por configuración externa
  pendiente: `scripts/load-test/k6-load-test.js` (escenarios de navegación
  pública de solo lectura — nunca booking/captura de lead, para no
  contaminar el entorno con datos sintéticos) + `.github/workflows/load-test.yml`
  (`workflow_dispatch` manual únicamente, nunca automático en push/PR).
  Documentado en `docs/load-testing.md`. **No puede ejecutarse todavía**:
  depende de `STAGING_URL`/`PRODUCTION_URL` en los Environments de GitHub,
  ya pendientes desde antes de esta sesión (ver "Requiere configuración
  manual externa") — el job `preflight` del workflow falla con un mensaje
  claro en vez de probar contra una URL vacía.

## Ya resuelto — verificado, no se reimplementa

Estos puntos del megaprompt ya están bien resueltos en el código actual.
Se han verificado contra el código real (no contra la suposición del
prompt) y se listan aquí para no repetir trabajo:

- **Aislamiento cross-tenant en general** — auditoría y hardening ya
  cerrados (ver referencias arriba), con 175 tests dedicados.
- **Webhooks entrantes (Stripe/Resend) — idempotencia** — patrón correcto
  de "claim-then-process": el `INSERT` con columna única (`eventId`/
  `svixId`) es la propia comprobación atómica de "ya procesado", no hay
  carrera de check-then-act.
- **Validación de subida de archivos** — magic bytes reales (no solo
  Content-Type declarado), bloqueo de SVG, validación estructural de
  imagen/PDF, cuota por organización, todo ya implementado en
  `server/utils/media.ts`.
- **Visibilidad de archivos privados** — modelo real `public`/`private`/
  `confidential` respaldado por tabla, 404 (nunca 403) en cross-tenant para
  no confirmar existencia, acceso confidencial auditado en
  `media_access_log`. Ya cumple lo que la Fase 12/13 del megaprompt pide
  para archivos privados — no requiere reconstrucción, solo la mejora de
  subida directa a R2 (P1-8) para archivos grandes.
- **Cabeceras de seguridad** — CSP real por origen, HSTS, X-Frame-Options,
  Referrer-Policy, Permissions-Policy ya en `server/middleware/security-headers.ts`.
  Queda documentado en el propio código que `unsafe-inline` sigue siendo
  necesario hasta tener CSP-nonce — no es un descuido, es una limitación
  conocida.
- **Rate limiting de aplicación** — existe (`server/utils/rateLimit.ts`),
  D1-backed, con la limitación de "no exacto bajo alta concurrencia"
  documentada explícitamente en el propio código como trade-off aceptado.
  Aplicado a `view.post.ts` (P1-6, resuelto); `favorite.post.ts` no lo
  necesita — su protección real es la restricción de unicidad de la tabla
  `favorites` (P1-7, resuelto), no un límite de frecuencia.
- **Paginación** — todos los endpoints de listado muestreados ya limitan
  `perPage` (máximo 100) o usan un `LIMIT` fijo razonable. No se encontró
  ningún endpoint que devuelva una tabla completa sin límite.
- **Secretos** — no se encontró ningún secreto hardcodeado en el repo.

## Requiere configuración manual externa (fuera del alcance del código)

- **Desactivar Cloudflare Workers Builds** en el dashboard de Cloudflare
  (Workers & Pages → sa-inmobiliaria → Settings → Builds) — pendiente
  desde la investigación de pérdida de datos de esta misma sesión, y la
  causa directa de que el código de los PR #56/#57 llegara a producción
  antes que sus migraciones.
- **Secrets del Environment `staging`** en GitHub (`CLOUDFLARE_API_TOKEN`/
  `CLOUDFLARE_ACCOUNT_ID`) — `deploy-staging` lleva fallando desde el
  PR #54 por este motivo.
- **Variable `PRODUCTION_URL`** (y `STAGING_URL`) en los Environments de
  GitHub — sin ella, "Smoke tests" nunca llega a ejecutarse de verdad.
- **Reglas WAF / rate limiting de borde** en el dashboard de Cloudflare —
  no configurables desde este repositorio; se documentarán como
  recomendación exacta en `docs/cloudflare-security.md` (Fase 18).
- **`ERROR_ALERT_WEBHOOK_URL`** — el código ya soporta enviar un aviso por
  webhook en cada error 5xx (`server/plugins/error-logging.ts`), pero la
  variable no está configurada; sin ella el sistema sigue registrando en
  `error_logs`, solo no hay aviso proactivo externo.
- **Regla de lifecycle `AbortIncompleteMultipartUpload` en el bucket R2**
  `sa-inmobiliaria-media` (y su equivalente `-staging`) — P1-8 (subida de
  vídeo chunked) ya limpia por sí sola las subidas abandonadas vía el
  barrido diario en `server/tasks/system/media-lifecycle.ts`
  (`sweepStaleMultipartUploads`, 24h), pero una regla de lifecycle nativa
  de R2 sería un segundo backstop independiente del propio código —
  configurable solo desde el dashboard/API de Cloudflare, no desde este
  repositorio. No bloquea el uso de la función: el barrido de D1 ya cubre
  el caso real.

## Posibles breaking changes de las fases siguientes

- **P0-1 (booking)** — resuelto en FASE 8: el índice parcial `CREATE INDEX`
  (migración 0050) es puramente aditivo; si ya existiera una colisión real
  en producción la migración fallaría de forma atómica y limpia antes de
  tocar el Worker, en vez de exigir una verificación previa manual.
- **P1-1/P1-2 (email/invoice uniqueness)** — resuelto en FASE 7 (migración
  0053). Al revisarlo de cerca, la comprobación previa de colisiones que
  este documento planeaba **no hacía falta**: relajar un `UNIQUE(X)` a
  `UNIQUE(organizationId, X)` es seguro por construcción — cualquier
  conjunto de filas que ya satisfacía la restricción global (más estricta)
  satisface trivialmente la restricción por tenant (más laxa). Solo haría
  falta verificar datos reales al **endurecer** una restricción, no al
  relajarla.
- **P1-3 (sesiones)** — resuelto en FASE 19 con compatibilidad hacia atrás
  (sesión legacy → se rota a hasheada en el primer uso válido), tal como
  pedía el propio megaprompt — ver detalle en P0-4 más arriba.

## Migraciones previstas (a confirmar fase a fase)

1. ✅ **Resuelto en FASE 4, sin migración SQL.** Quitados los 22
   `.default(1)` de `organizationId` en `server/db/schema.ts` — a nivel de
   Drizzle esto es puramente de tipos (el `DEFAULT 1` real ya presente en la
   columna D1 de las tablas creadas antes de la migración 0021 no cambia;
   Drizzle nunca inyectó ese valor en JS al omitirlo, solo lo generaba en
   DDL si se usara `drizzle-kit`, que este proyecto no usa — las migraciones
   son SQL a mano). El valor real del cambio es que ahora **el tipo de
   `insert().values()` exige `organizationId` en las 22 tablas**, así que
   typecheck detecta en tiempo de compilación cualquier insert que lo omita
   — y detectó uno real:
   `server/api/public/vendor-registration.post.ts` nunca fijaba
   `organizationId`, dependía en silencio del `DEFAULT 1` de la columna. Un
   proveedor que se registraba desde el sitio público de **cualquier**
   tenant caía siempre en la organización 1, invisible para el tenant al
   que realmente pertenecía — un bug cross-tenant real que la auditoría de
   multitenancy anterior (216 endpoints) no había marcado porque no lanzaba
   error, solo escribía en el tenant equivocado. Corregido con
   `resolvePublicOrgId(event)`, el mismo patrón que ya usan
   `contact.post.ts`/`visitor.post.ts`/`ask.post.ts`/etc. No se reescribe el
   `DEFAULT 1` a nivel de columna D1 (requeriría un rebuild DROP+RENAME de
   hasta 22 tablas para un beneficio marginal ya que el código que inserta
   está ahora reforzado por TypeScript) — queda documentado aquí como
   legado inofensivo, no como pendiente.
2. ✅ **Resuelto en FASE 8** (migración 0050) — `UNIQUE(organization_id, agent_id, scheduled_at)`
   condicional en `visits`, cierra la doble reserva.
3. ✅ **Resuelto en FASE 7** (migración 0053) — `UNIQUE(organization_id, email)`
   en `agents`, `developers`, `team_members` (sustituyendo el `UNIQUE(email)` global).
4. ✅ **Resuelto en FASE 7** (migración 0053) — `UNIQUE(organization_id, number)` en `invoices`.
5. ✅ **Resuelto en FASE 19** (migración 0052) — columna `token_hash` en
   `sessions`, con rotación retrocompatible en vez de una tabla nueva.

Cada una se implementó como su propio commit/migración numerada, validada
individualmente antes de pasar a la siguiente fase.
