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
    que se le asigne).
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

Si hace falta ir más atrás de esa ventana, o Time Travel no está disponible,
usar el artefacto de `deploy-production`:

```
gh run download <run-id> -n pre-deploy-backup-<sha>
wrangler d1 execute sa_inmobiliaria --remote --file=pre-deploy-backup.sql
```

Verificar primero el contenido del archivo (`wrangler d1 export` genera
sentencias `CREATE TABLE`/`INSERT` reales, no un diff) y probarlo contra la
D1 de staging antes de tocar producción si hay tiempo para hacerlo.

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
   - Restaurar con Time Travel o el backup pre-despliegue (ver arriba) si
     el cambio no es reversible de forma segura con una migración nueva
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
