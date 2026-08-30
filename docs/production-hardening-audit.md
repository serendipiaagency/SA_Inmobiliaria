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

### P0-1 — Doble reserva de citas (race condition real)

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

### P0-2 — `super_admin` sin organización activa cae en tenant 1 (fail-open)

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

## Problemas P1 (reales, menor urgencia o menor probabilidad)

| # | Hallazgo | Archivo | Nota |
|---|---|---|---|
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

1. Quitar `.default(1)` de `organizationId` en las tablas tenant-scoped que
   lo tengan (defensa en profundidad — el código que inserta ya fija
   siempre el valor explícitamente, verificado en esta auditoría; el
   riesgo real hoy es bajo, pero la migración lo cierra por completo).
2. `UNIQUE(agent_id, scheduled_at)` condicional (o equivalente) en `visits`
   para cerrar la doble reserva.
3. `UNIQUE(organization_id, email)` en `agents`, `developers`,
   `team_members` (sustituyendo el `UNIQUE(email)` global).
4. `UNIQUE(organization_id, number)` en `invoices`.
5. Tabla de sesiones hasheadas (o columna adicional de transición).

Cada una se implementará como su propio commit/migración numerada,
validada individualmente antes de pasar a la siguiente fase.
