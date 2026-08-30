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

## Problemas P1 (reales, menor urgencia o menor probabilidad)

| # | Hallazgo | Archivo | Nota |
|---|---|---|---|
| P1-13 | 2 tests e2e de `agents-comerciales-admin.spec.ts` fallan de forma **preexistente**, no causada por este bloque de hardening | `tests/e2e/agents-comerciales-admin.spec.ts:162,194` | `page.goto('/admin/agents')` no renderiza el heading "Comerciales" esperado en este sandbox (`getByRole('heading', {name:'Comerciales'})` timeout). Verificado con `git stash` + rebuild + re-run contra el código sin los cambios de FASE 5/FASE 8 de este bloque: falla exactamente igual, así que no es una regresión de esta sesión — pendiente de investigar por separado, fuera del alcance de este bloque de hardening |
| P1-1 | `agents.email`, `developers.email`, `team_members.email` son `UNIQUE` **global**, no por tenant | `server/db/schema.ts` | Dos inmobiliarias no pueden tener cada una un contacto con el mismo email — bloqueará altas de tenants nuevos por colisión |
| P1-2 | `invoices.number` es `UNIQUE` global pese a que `invoices` ya es tenant-scoped (migración 0038) | `server/db/schema.ts:764` | Cada negocio normalmente numera sus facturas desde 1; hoy el tenant B no puede reutilizar "INV-0001" si A ya lo tiene |
| P1-3 | Tokens de sesión se guardan en claro en D1 (no hasheados) | `server/utils/auth.ts` `createSession()` | Inconsistente con el propio patrón que el proyecto ya usa para `password_reset_tokens.tokenHash` y `api_keys.keyHash` — una fuga de D1 entregaría cookies de sesión reutilizables |
| P1-4 | Webhooks salientes (`dispatchWebhook()`) hacen **un único intento** y silencian el fallo (`catch {}`), pese a que `webhook_deliveries.attempts` sugiere que se pensó en reintentos | `server/utils/webhooks.ts` | Sin dead-letter ni tarea de reintento — a diferencia del email, que sí tiene backoff real (`retry-email-queue.ts`) |
| P1-5 | Backup diario de D1 carga **todas** las tablas enteras en memoria (`SELECT *` por tabla → un solo objeto JS) antes de comprimir y subir | `server/tasks/system/backup-d1.ts` | Sin streaming/chunking; crecerá hasta chocar con límites de memoria/CPU del Worker |
| P1-6 | Cada vista de propiedad hace 2 escrituras D1 (`UPDATE viewCount` + `INSERT propertyViews`) sin rate limit ni deduplicación de visitante | `server/api/public/properties/[slug]/view.post.ts` | Cualquier script puede inflar contadores o generar carga de escritura |
| P1-7 | Favoritos son un contador crudo incrementable/decrementable directamente desde el cliente, sin tabla de favoritos real ni restricción de unicidad | `server/api/public/favorite.post.ts` | Cualquiera puede inflar o poner a cero el contador de favoritos de un listado público |
| P1-8 | Subida de vídeo (hasta 100MB) atraviesa el Worker completo (limitación de memoria de request documentada en el propio código) | `server/utils/media.ts` | No existe subida directa a R2 todavía |
| P1-9 | No existe `npm run lint` ni ESLint/Biome configurado | `package.json` | Solo `typecheck` como análisis estático |
| P1-10 | No existen `/api/health/live` ni `/api/health/ready` | — | — |
| P1-11 | El pipeline de CI no valida que `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`/`PRODUCTION_URL` existan y sean válidos **antes** de hacer backup/migrar/desplegar | `.github/workflows/ci.yml` | El primer síntoma de un secret vacío es el error crudo de `wrangler`, a mitad del pipeline |
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

- **P0-1 (booking)**: añadir una restricción `UNIQUE` a `visits` requiere
  confirmar primero que no existen ya citas duplicadas para el mismo
  agente/slot en los datos reales (se comprobará antes de escribir la
  migración).
- **P1-1/P1-2 (email/invoice uniqueness)**: pasar de `UNIQUE(email)` a
  `UNIQUE(organizationId, email)` requiere primero comprobar que no hay ya
  colisiones inter-tenant en los datos reales (poco probable con pocos
  tenants actuales, pero se verificará antes de migrar).
- **P1-3 (sesiones)**: hashear tokens de sesión invalidaría las sesiones
  activas si se hace de golpe. Se implementará con compatibilidad hacia
  atrás (sesión legacy → se rota a hasheada en el primer uso válido), tal
  como pide el propio megaprompt.

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
2. `UNIQUE(agent_id, scheduled_at)` condicional (o equivalente) en `visits`
   para cerrar la doble reserva.
3. `UNIQUE(organization_id, email)` en `agents`, `developers`,
   `team_members` (sustituyendo el `UNIQUE(email)` global).
4. `UNIQUE(organization_id, number)` en `invoices`.
5. Tabla de sesiones hasheadas (o columna adicional de transición).

Cada una se implementará como su propio commit/migración numerada,
validada individualmente antes de pasar a la siguiente fase.
