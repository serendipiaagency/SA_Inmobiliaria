# SA Inmobiliaria

Plataforma SaaS **multi-inmobiliaria** para agencias: cada agencia
(organización) tiene su panel de gestión, su catálogo, su CRM y su web
pública en su propio dominio, todo servido por un único Worker de Cloudflare
sobre una única base de datos compartida.

> Este README describe el proyecto **tal y como está hoy**. La versión
> anterior de este documento describía la reescritura inicial desde Laravel
> y llevaba mucho tiempo sin corresponderse con el código.

## Stack

| Capa | Tecnología |
| --- | --- |
| Framework | Nuxt 3 (Vue 3, SSR) — Nitro con el preset `cloudflare_module` |
| Runtime | Cloudflare Workers (un solo Worker: `sa-inmobiliaria`; staging: `sa-inmobiliaria-staging`) |
| Base de datos | Cloudflare D1 (SQLite) vía Drizzle ORM — 62 migraciones SQL en `migrations/` |
| Archivos | Cloudflare R2 (`sa-inmobiliaria-media`), claves `tenants/<orgId>/…` |
| Tareas programadas | Cron Triggers de Workers → `server/tasks/**` (Nitro tasks) |
| Estilos | Tailwind CSS |
| Autenticación | Sesiones en D1 (cookie httpOnly, sólo se guarda el hash del token), PBKDF2 con Web Crypto |
| Integraciones | Resend (email), Stripe (depósitos), Anthropic (IA), Leaflet (mapas), pdf-lib (PDF) |
| Pruebas | Vitest (unitarias, con SQLite real en memoria) + Playwright (e2e contra `wrangler dev`) |

No hay Node en producción: todo corre en el Worker. Las integraciones leen
sus secretos de `event.context.cloudflare.env` y **degradan a un "no
conectado" honesto** cuando falta la clave — nunca fingen éxito
(`.dev.vars.example` lista cada una).

## Multi-tenant

- Una organización = una inmobiliaria. Toda tabla con datos de negocio lleva
  `organization_id`; los endpoints de administración pasan por
  `requireOrgScope()` (`server/utils/auth.ts`) y
  `test/unit/tenantScopeCoverage.test.ts` falla si aparece un endpoint que
  no acota su ámbito.
- El **dominio** decide la agencia en la web pública
  (`server/middleware/00.tenant.ts`): un host que coincide con
  `organizations.domain` sirve esa agencia; `*.workers.dev` y `localhost`
  sirven la organización por defecto (id 1); cualquier otro host recibe 404.
  Cada dominio se comprueba cada 10 minutos
  ([`docs/multi-domain.md`](docs/multi-domain.md)).
- El `super_admin` (la plataforma) no pertenece a ninguna organización y
  cambia de agencia desde el panel; un `admin` sólo ve la suya. Dentro de
  la agencia los permisos son por área (ver/editar × 8 áreas):
  [`docs/rbac-authorization-matrix.md`](docs/rbac-authorization-matrix.md).

## Qué hay en el panel (`/admin`)

| Grupo | Módulos |
| --- | --- |
| General | Dashboard, Analytics |
| CRM | Leads, Clientes (ficha 360º), Visitas y citas con recordatorios, Analítica de citas, Reservas, Referidos |
| Portal Web | Propiedades obra nueva, Propiedades 2ª mano (mismo editor por pasos), Constructor Web (páginas por bloques, historial de versiones), Comerciales, Comunidades, Publicación multicanal, Brand Kit y exportación de piezas (PDF) |
| Finanzas & Growth | Facturación, Operaciones, Ingresos, Contratos con firma por enlace, Depósitos con Stripe, Tasador (AVM), Automatizaciones, AI Studio, Widgets embebibles, Marketplace, API y claves |
| Blog & CMS | Artículos, categorías, etiquetas, autores, biblioteca de medios, comentarios, redirecciones |
| Bandeja | Solicitudes de visitante, proveedores, mensajes de contacto |
| Sistema | Configuración, Usuarios y permisos, Webhooks salientes, Emails, Privacidad (RGPD), Estado del sistema, Auditoría, Empresas (super_admin) |

Cada módulo está documentado dentro del propio panel en **Ayuda**
(`/admin/ayuda`, contenido en `composables/useHelpContent.ts`). Es la
documentación de usuario oficial: un módulo sin entrada ahí se considera sin
documentar.

## Web pública

Portal por agencia en su dominio: catálogo con buscador y mapa, fichas de
propiedad, comparador, favoritos y búsquedas guardadas con alertas, equipo,
zonas, blog, reserva de visitas online, formularios (contacto, visitante,
proveedores, reclamaciones), páginas legales con los datos reales de la
agencia, y portal de cliente (`/mi-cuenta`). Las páginas se construyen con
el **Constructor Web** ([`docs/site-builder.md`](docs/site-builder.md)).

## Desarrollo local

```bash
npm install                 # también prepara Nuxt (postinstall)
cp .dev.vars.example .dev.vars   # opcional: secretos que quieras probar en local
npm run db:migrate:local    # crea la D1 local y aplica las migraciones
npm run dev                 # http://localhost:3000 con D1/R2 emulados
```

Cuentas sembradas por las migraciones: `admin@sa-inmobiliaria.com` /
`ChangeMe123!` (super_admin) y `admin@skyline-estates.com` (admin de la
agencia de demostración). Con `DEV_AUTH_BYPASS=<email>` en `.dev.vars` el
panel entra sin login (sólo funciona en desarrollo: la rama se elimina del
build de producción).

Para tener un catálogo con fichas completas en local:
`node scripts/seed-demo-properties.mjs --org 1`.

## Validación

```bash
npm run lint
npm run typecheck
npm test                    # Vitest: 800+ pruebas, SQLite real con las migraciones reales
npm run build
npm run migrations:check    # secuencia + aplicación limpia en una D1 nueva; exige marcar las destructivas
npm run test:e2e            # build + wrangler dev + Playwright (D1/R2 locales limpias)
```

Los cinco primeros son el gate que corre CI (`.github/workflows/ci.yml`,
job `validate`) y todos son bloqueantes: un typecheck en rojo impide la
fusión. Un cambio no está terminado hasta que el gate está en verde.

## Despliegue

Producción se alcanza **sólo** a través del pipeline
([`docs/deployment.md`](docs/deployment.md)): un push a `main` ejecuta
`validate` → `production-preflight` → copia de seguridad de D1 → migraciones
remotas → `wrangler deploy` → smoke test. Staging se despliega en cada pull
request (`deploy-staging`) o a mano con el workflow "Poblar y desplegar
staging".

Workflows manuales (todos piden confirmación escrita):

| Workflow | Qué hace |
| --- | --- |
| Aplicar migraciones pendientes a producción | Copia de seguridad + `d1 migrations apply --remote` |
| Restaurar una copia de seguridad de D1 | Restaura la instantánea diaria de R2 o el volcado SQL de un despliegue anterior, con punto de retorno previo |
| Sembrar catálogo de demostración | Propiedades de demostración en una organización concreta (reversible) |
| Poblar y desplegar staging | Migraciones + deploy + smoke test del Worker de staging |

Copias de seguridad: instantánea diaria de cada tabla a R2 (14 días) más el
volcado SQL previo a cada despliegue (artefacto, 30 días). La restauración
está probada en `test/unit/backup.restore.test.ts` y documentada en
`docs/deployment.md`.

## Scripts (`scripts/`)

| Script | Para qué |
| --- | --- |
| `seed-demo-properties.mjs` | Catálogo de demostración con fichas completas (local; `--remote --confirm APLICAR` para producción) |
| `purge-demo-data.mjs` | Elimina una organización de demostración y todo lo suyo (opt-in, dry-run por defecto) |
| `restore-d1-backup.mjs` | Restaura una instantánea JSON de R2 o un volcado de `wrangler d1 export` |
| `create-super-admin.mjs` | Crea o reajusta la contraseña de un super_admin sin que pase por el repositorio |
| `mint-access-link.mjs` | Enlace de acceso de un solo uso para una cuenta |
| `diagnose-access.mjs` | Diagnóstico de sólo lectura de "no puedo entrar" contra la D1 real |
| `smoke-test.mjs` | Las comprobaciones que hace el pipeline tras desplegar, contra cualquier URL |
| `worker-url.mjs` | Descubre la URL `*.workers.dev` del Worker preguntando a Cloudflare |
| `check-migrations.mjs` | El gate de migraciones |
| `load-test/` | Escenarios k6 ([`docs/load-testing.md`](docs/load-testing.md)) |

## Estructura

```
migrations/            Migraciones SQL de D1 (esquema + semillas), inmutables una vez aplicadas
server/db/schema.ts    Esquema Drizzle (una tabla = una exportación)
server/middleware/     Resolución de tenant por dominio, RBAC de la API admin
server/api/            admin/ (panel), public/ (web), v1/ (API con clave), client/, auth/, health/, stripe/, resend/
server/utils/          Auth y sesiones, adminResources (CRUD genérico), tenantPolicy, email/, publication/, assetExport/…
server/tasks/          Tareas programadas (recordatorios, colas de reintento, backup, monitor de dominios…)
pages/                 Web pública y /admin
components/            property-builder/, site-builder/, client-builder/, team-builder/, admin/
composables/           useHelpContent (ayuda del panel), configuraciones de listados y editores
utils/                 Compartido cliente/servidor: áreas de permisos, navegación del panel, permisos
test/unit/             Vitest (incluye pruebas de exhaustividad: ámbito por agencia, matriz de rutas, registro de bloques)
tests/e2e/             Playwright contra wrangler dev (dos agencias, aislamiento, RBAC, flujos del panel)
docs/                  Documentación técnica por módulo (ver abajo)
```

## Documentación técnica (`docs/`)

- [`deployment.md`](docs/deployment.md) — pipeline, ajustes manuales, backups y rollback
- [`database-migrations.md`](docs/database-migrations.md) — expand/migrate/contract y el gate de migraciones destructivas
- [`multi-domain.md`](docs/multi-domain.md) — dominio por agencia y su monitorización
- [`rbac-authorization-matrix.md`](docs/rbac-authorization-matrix.md) — áreas de permisos y matriz de rutas
- [`multitenant-audit.md`](docs/multitenant-audit.md), [`multitenant-hardening-report.md`](docs/multitenant-hardening-report.md) — aislamiento entre agencias
- [`r2-architecture.md`](docs/r2-architecture.md), [`media-security-audit.md`](docs/media-security-audit.md) — almacenamiento y seguridad de archivos
- [`property-editor.md`](docs/property-editor.md), [`clientes.md`](docs/clientes.md), [`site-builder.md`](docs/site-builder.md) — módulos del panel
- [`matching-and-lead-pipeline.md`](docs/matching-and-lead-pipeline.md) — necesidades, motor de matching, pipeline de leads y fusión de contactos duplicados
- [`publication-channels.md`](docs/publication-channels.md), [`asset-export-studio.md`](docs/asset-export-studio.md) — publicación y piezas gráficas
- [`stripe-payments.md`](docs/stripe-payments.md), [`resend-email.md`](docs/resend-email.md) — integraciones
- [`production-hardening-audit.md`](docs/production-hardening-audit.md), [`auditoria-pre-piloto.md`](docs/auditoria-pre-piloto.md), [`load-testing.md`](docs/load-testing.md) — auditorías y carga

Las reglas de trabajo del repositorio (qué documentar, cómo se envía un
cambio, qué necesita aviso explícito) están en `CLAUDE.md`.
