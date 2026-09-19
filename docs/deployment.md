# Despliegue, migraciones y rollback

## El pipeline

Un único workflow, `.github/workflows/ci.yml` ("CI & Deploy"), con tres jobs:

```
validate  (siempre: PR y push a main)
  → npm ci → npm audit --omit=dev → typecheck → npm test → npm run build
  → npm run migrations:check (aplica todas las migraciones a una D1 local
    nueva, para probar que corren limpias, sin tocar nada persistente ni remoto)
  → npm run test:e2e

deploy-staging   (solo pull_request, needs: validate)
  → wrangler d1 migrations apply sa_inmobiliaria_staging --remote --env staging
  → wrangler deploy --env staging
  → npm run smoke-test -- $STAGING_URL

deploy-production   (solo push a main, needs: validate)
  → wrangler d1 export sa_inmobiliaria --remote  (backup, sube como artefacto)
  → wrangler d1 migrations apply sa_inmobiliaria --remote
  → wrangler deploy
  → npm run smoke-test -- $PRODUCTION_URL
```

Ningún paso usa `continue-on-error` — el typecheck también es bloqueante
(los 43 errores preexistentes que lo mantenían en modo informativo se
corrigieron en un bloque de trabajo posterior). Cada paso solo se ejecuta
si el anterior tuvo éxito: si `migrations apply` falla, el job se detiene
ahí — `wrangler deploy` nunca llega a ejecutarse con una migración a medias.
Esto es lo que impide un despliegue parcial (código nuevo sobre esquema
viejo), no una comprobación aparte.

`deploy-production` solo se dispara con `github.ref == 'refs/heads/main' &&
github.event_name == 'push'` — ninguna otra rama ni PR puede alcanzar ese
job. `deploy-staging` solo se dispara en pull_request, así que una rama
nunca toca datos ni credenciales de producción. D1 y R2 de staging
(`sa_inmobiliaria_staging`, `sa-inmobiliaria-media-staging`) son recursos de
Cloudflare completamente distintos a los de producción — ya estaban
separados en `wrangler.toml` antes de este cambio.

## Ajustes manuales pendientes (no se pueden hacer desde código)

Para dar de alta el dominio propio de una inmobiliaria (Custom Domain +
registro DNS en Cloudflare, y el campo correspondiente en
`/admin/organizations`), ver [`docs/multi-domain.md`](./multi-domain.md) — es
un ajuste manual recurrente (uno por cliente nuevo), no de una sola vez como
los dos de abajo.

Para activar los cobros con Stripe (`STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET` y el endpoint de webhook en el Dashboard de Stripe),
ver [`docs/stripe-payments.md`](./stripe-payments.md).

Para activar los emails transaccionales con Resend (`RESEND_API_KEY`,
`RESEND_WEBHOOK_SECRET`, verificación de dominio y el endpoint de webhook en
el Dashboard de Resend), ver [`docs/resend-email.md`](./resend-email.md).

**1. Desactivar el auto-deploy de Cloudflare Workers Builds — el paso más
importante.** Ahora mismo, Cloudflare tiene su propia integración con git
que ejecuta `npx wrangler deploy` en cada push (a cualquier rama), sin
aplicar migraciones — esto es lo que causó el incidente de julio y sigue
activo. Si se deja tal cual, competirá con este pipeline: dos sistemas
desplegando el mismo Worker de forma independiente, y el de Cloudflare
seguirá sin migrar. Ir a:

> Cloudflare Dashboard → Workers & Pages → sa-inmobiliaria → Settings → Build

y desactivar el "Build & deploy" automático (o borrar la integración con el
repositorio). A partir de ahí, el único camino a producción es este
workflow de GitHub Actions.

**2. Crear los entornos y secretos en GitHub** (Settings → Environments, en
este repositorio):

* Entorno `staging`:
  * Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` — un token con
    permiso de Edit sobre el Worker `sa-inmobiliaria-staging`, la D1
    `sa_inmobiliaria_staging` y el bucket R2 `sa-inmobiliaria-media-staging`
    únicamente (no sobre los recursos de producción).
  * Variable: `STAGING_URL` (la URL pública del Worker de staging, p. ej.
    `https://sa-inmobiliaria-staging.<subdominio>.workers.dev` o el dominio
    que se le asigne). **Mientras no esté puesta, `deploy-staging` se salta
    en cada PR** — así es como staging llegó a existir con 0 tablas. El
    workflow manual "Poblar y desplegar staging"
    (`.github/workflows/deploy-staging-manual.yml`) hace ese mismo trabajo
    sin depender de la variable, descubre la URL real preguntando a
    Cloudflare y la imprime en el log para copiarla aquí.
* Entorno `production`:
  * Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` — un token con
    permiso sobre el Worker `sa-inmobiliaria`, la D1 `sa_inmobiliaria` y el
    bucket `sa-inmobiliaria-media` de producción.
  * Variable: `PRODUCTION_URL` (el dominio real de producción).
  * **Deployment branches**: restringir a `main` únicamente (Settings →
    Environments → production → Deployment branches and tags). El workflow
    ya lo exige con su propio `if:`, pero esta es la misma regla aplicada
    por GitHub a nivel de plataforma — defensa en profundidad, no
    redundancia inútil: un `if:` mal editado en el futuro no bastaría por sí
    solo para desplegar a producción si el entorno lo bloquea también.

Usar dos tokens de API distintos (uno por entorno, con permisos acotados a
sus propios recursos) es lo que hace imposible que un despliegue de staging
toque producción por error, incluso si el propio workflow tuviera un bug.

## Backups y restauración de D1

Hay dos backups independientes de producción, con propósitos distintos:

1. **Instantánea diaria** (`server/tasks/system/backup-d1.ts`, cron
   `30 3 * * *`): JSON comprimido de cada tabla, en R2, 14 días de
   retención. Pensado para "¿qué había el día X?", legible por una persona.
2. **Backup pre-despliegue** (paso `Backup D1 before migrating` de
   `deploy-production`): `wrangler d1 export --remote`, el volcado SQL
   nativo de D1, subido como artefacto de GitHub Actions
   (`pre-deploy-backup-<sha>`, 30 días de retención). Pensado para
   restaurar exactamente el estado justo antes de la migración que se
   acaba de aplicar.

Cloudflare D1 también tiene **Time Travel** nativo (point-in-time recovery,
30 días en el plan de pago) — es la vía más simple y fiable para un
rollback de esquema/datos reciente, y no depende de ningún artefacto
nuestro:

```
wrangler d1 time-travel restore sa_inmobiliaria --timestamp=<ISO-8601>
```

### Restaurar: el camino probado

Hasta el 19-09-2026 esta sección decía que el volcado SQL se restauraba
con `wrangler d1 execute --file=pre-deploy-backup.sql`. **Eso no funciona**,
y se comprobó ejecutándolo en local contra una D1 real:

1. Sobre una base con datos falla en el primer `INSERT` (`UNIQUE constraint
   failed: d1_migrations.id`): el volcado trae el ledger de migraciones y
   todos los ids. Como wrangler ejecuta el fichero como un lote atómico, no
   cambia nada — pero tampoco restaura nada.
2. Sobre una base vacía **también falla**: el volcado va tabla a tabla en el
   orden de `sqlite_master`, que no respeta las claves foráneas (los planos
   de una vivienda van antes que la tabla de viviendas), y con las claves
   foráneas activas el primer `INSERT` en una tabla hija cuyo padre aún no
   existe muere con `no such table: main.agent_properties`. `PRAGMA
   foreign_keys = OFF` no ayuda: dentro de una transacción SQLite lo ignora.

`scripts/restore-d1-backup.mjs` hace lo que sí funciona, y el workflow
manual **"Restaurar una copia de seguridad de D1 en producción"**
(`.github/workflows/restore-d1-backup.yml`) lo ejecuta con los secretos del
entorno `production`, guardando antes un volcado del estado actual como
punto de retorno. Dos orígenes:

- **Instantánea diaria** (`backups/AAAA-MM-DD.json.gz` en R2):
  `node scripts/restore-d1-backup.mjs --from-r2 backups/2026-09-18.json.gz --remote --confirm RESTAURAR`.
  Por cada tabla de la instantánea: `DELETE FROM` + `INSERT` con las
  claves foráneas diferidas, en un solo lote. No toca el esquema ni el
  ledger de migraciones. Por defecto **omite `sessions`, `rate_limits` y
  `password_reset_tokens`** (efímeras y sensibles: restaurarlas resucitaría
  sesiones cerradas y enlaces ya usados); `--include-ephemeral` las
  incluye. `--tables leads,clients` limita la restauración.
- **Volcado SQL de `wrangler d1 export`** (artefacto `pre-deploy-backup-<sha>`,
  `pre-migration-backup-*`, `pre-seed-backup-*`, `pre-restore-backup-*`):
  `node scripts/restore-d1-backup.mjs --sql volcado.sql --remote --confirm RESTAURAR`.
  Borra todas las tablas (las hijas antes que sus padres, leyendo las claves
  foráneas reales con `PRAGMA foreign_key_list`), reordena el volcado
  (todos los `CREATE TABLE`, luego todos los `INSERT`, luego los índices) y
  lo ejecuta. La base queda **exactamente** como al exportar, ledger
  incluido; si hay migraciones posteriores, `npm run db:migrate` las aplica
  encima (el workflow lo hace solo).

En los dos casos el script **cuenta las filas** de cada tabla restaurada
contra la copia y falla si no cuadran: nunca da por hecho que fue bien.

Resultado de la prueba real en local (volcado de 109 tablas, 847 filas):
las 52 tablas con datos quedaron con exactamente las filas del volcado,
`d1_migrations` incluida (61 → 61), y la migración posterior al volcado
(0062) apareció como pendiente y se aplicó limpia encima. La tabla interna
`sqlite_sequence` se excluye del import y de la verificación a propósito
(ver el comentario en el script). `test/unit/backup.restore.test.ts`
repite el ciclo completo copia → restauración → comparación fila a fila en
cada ejecución de `npm test`, con el mismo código que corre en producción a
las dos puntas.

`--dry-run` genera el SQL, dice dónde lo ha dejado y el orden de borrado, y
no ejecuta nada. Sin `--remote` todo va contra la D1 local: es la forma de
ensayar una restauración antes de hacerla de verdad.

## Procedimiento de rollback completo

1. **Volver el Worker a la versión anterior.** Cloudflare Workers guarda
   versiones de cada despliegue:
   ```
   wrangler deployments list          # ver versiones recientes
   wrangler rollback [deployment-id]  # sin id, vuelve a la anterior
   ```
   Esto revierte el código al instante — no toca D1 ni R2.

2. **Decidir si hace falta revertir el esquema.** La mayoría de incidentes
   de despliegue son solo de código: el rollback del paso 1 basta. Si la
   migración que se acaba de aplicar es la causa (una columna que rompe una
   query, un índice mal definido), D1/SQLite no tiene "deshacer una
   migración" automático — las migraciones de este proyecto son siempre
   hacia adelante. Las opciones son:
   - Escribir una migración nueva que revierta el cambio (lo preferible
     cuando es viable — mantiene el historial y no requiere Time Travel).
   - Restaurar con Time Travel o el backup pre-despliegue (ver arriba:
     workflow "Restaurar una copia de seguridad de D1", origen
     `volcado-sql`, referencia = id del run de `deploy-production`) si el
     cambio no es reversible de forma segura con una migración nueva
     (p. ej. una columna ya eliminada con datos reales perdidos).

3. **Comprobar la integridad de R2.** Ningún paso de este pipeline modifica
   R2 directamente — las migraciones son solo D1. Aun así, tras un rollback:
   ```
   wrangler r2 object list sa-inmobiliaria-media --remote | head -20
   ```
   y confirmar que el binding `MEDIA` en `wrangler.toml` sigue apuntando al
   bucket correcto (no debería haber cambiado, pero es la comprobación
   barata que evita un segundo incidente encima del primero).

4. **Volver a ejecutar los smoke tests** contra producción una vez hecho el
   rollback:
   ```
   npm run smoke-test -- https://<dominio-de-produccion>
   ```

5. **Postmortem breve**: qué falló, en qué paso del pipeline debería haberse
   detectado y no lo hizo (si el pipeline lo dejó pasar, esa es la mejora
   real a hacer — no solo el rollback puntual).

## Comandos sueltos útiles

* `npm run db:pending` / `npm run db:pending:staging` — lista qué
  migraciones locales aún no están aplicadas en remoto, sin aplicarlas.
* `npm run migrations:check` — valida secuencia y aplicación limpia de las
  migraciones sobre una D1 local nueva. Es exactamente lo que corre en CI;
  correrlo en local antes de abrir una PR con una migración nueva ahorra un
  ciclo completo de pipeline.
* `npm run smoke-test -- <url>` — las mismas comprobaciones que corre el
  pipeline tras desplegar, ejecutables a mano contra cualquier entorno.
