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

## Problemas P1 (reales, menor urgencia o menor probabilidad)

| # | Hallazgo | Archivo | Nota |
|---|---|---|---|
| P1-13 | 2 tests e2e de `agents-comerciales-admin.spec.ts` fallan de forma **preexistente**, no causada por este bloque de hardening | `tests/e2e/agents-comerciales-admin.spec.ts:162,194` | `page.goto('/admin/agents')` no renderiza el heading "Comerciales" esperado en este sandbox (`getByRole('heading', {name:'Comerciales'})` timeout). Verificado con `git stash` + rebuild + re-run contra el código sin los cambios de FASE 5/FASE 8 de este bloque: falla exactamente igual, así que no es una regresión de esta sesión — pendiente de investigar por separado, fuera del alcance de este bloque de hardening |
| P1-1 | ~~`agents.email`, `developers.email`, `team_members.email` son `UNIQUE` global, no por tenant~~ — ✅ resuelto en FASE 7 | `server/db/schema.ts` | Migración 0053, `UNIQUE(organization_id, email)` en las 3 tablas — ver `test/unit/multitenant.emailAndInvoiceScoping.test.ts` |
| P1-2 | ~~`invoices.number` es `UNIQUE` global pese a que `invoices` ya es tenant-scoped~~ — ✅ resuelto en FASE 7 | `server/db/schema.ts` | Migración 0053, `UNIQUE(organization_id, number)` |
| P1-3 | ~~Tokens de sesión se guardan en claro en D1 (no hasheados)~~ — ✅ resuelto en FASE 19 | `server/utils/auth.ts` `createSession()` | Migración 0052 + rotación retrocompatible en `getSessionUser()`, ver detalle abajo |
| P1-4 | ~~Webhooks salientes hacen un único intento, sin dead-letter ni tarea de reintento~~ — ✅ resuelto | `server/utils/webhooks.ts` | Migración 0054 + `attemptWebhookDelivery()` + `retry-webhook-queue.ts`, mismo patrón que el email — ver detalle abajo |
| P1-5 | Backup diario de D1 carga **todas** las tablas enteras en memoria (`SELECT *` por tabla → un solo objeto JS) antes de comprimir y subir | `server/tasks/system/backup-d1.ts` | Sin streaming/chunking; crecerá hasta chocar con límites de memoria/CPU del Worker |
| P1-6 | Cada vista de propiedad hace 2 escrituras D1 (`UPDATE viewCount` + `INSERT propertyViews`) sin rate limit ni deduplicación de visitante | `server/api/public/properties/[slug]/view.post.ts` | Cualquier script puede inflar contadores o generar carga de escritura |
| P1-7 | Favoritos son un contador crudo incrementable/decrementable directamente desde el cliente, sin tabla de favoritos real ni restricción de unicidad | `server/api/public/favorite.post.ts` | Cualquiera puede inflar o poner a cero el contador de favoritos de un listado público |
| P1-8 | Subida de vídeo (hasta 100MB) atraviesa el Worker completo (limitación de memoria de request documentada en el propio código) | `server/utils/media.ts` | No existe subida directa a R2 todavía |
| P1-9 | No existe `npm run lint` ni ESLint/Biome configurado | `package.json` | Solo `typecheck` como análisis estático |
| P1-10 | No existen `/api/health/live` ni `/api/health/ready` | — | — |
| P1-11 | ~~El pipeline de CI no valida que `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`/`PRODUCTION_URL` existan y sean válidos antes de desplegar~~ — ✅ resuelto en FASE 1 | `.github/workflows/ci.yml` | Jobs `staging-preflight`/`production-preflight` (comentario de cabecera desactualizado corregido aquí, la corrección ya estaba hecha en el commit `0c36a43`) |
| P1-12 | Sin request-ID / correlación entre `error_logs`, `webhook_deliveries`, `email_log` para una misma petición | `server/plugins/error-logging.ts` | Los `error_logs` sí se registran (no es un vacío total de observabilidad), pero no hay hilo conductor entre tablas |

## Problemas P2 (mejoras de calidad, no urgentes)

- Sin `.env.example` (no es un problema de seguridad — no se encontraron
  secretos hardcodeados en todo el repo — pero sí de onboarding).
- Sin RBAC granular más allá de `super_admin`/`admin`/`user` (el único
  sistema de permisos más fino que existe hoy es `api_keys.scopes`, solo
  para acceso de máquina vía `/api/v1/*`).
- Sin presupuestos de rendimiento de build ni lazy-loading auditado de
  librerías pesadas (Leaflet, PDF, QR).
- Sin monitorización sintética externa ni suite de carga (`k6` o
  equivalente).

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
  Sigue faltando aplicarlo a `view.post.ts`/`favorite.post.ts` (P1-6/P1-7).
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
