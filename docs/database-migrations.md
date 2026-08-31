# Migraciones de base de datos

Guía de cómo cambiar el esquema de D1 en producción sin downtime y sin
arriesgar datos. Complementa `docs/deployment.md`, que cubre tanto el
pipeline que aplica las migraciones como el
[procedimiento de rollback completo](./deployment.md#procedimiento-de-rollback-completo)
si una migración sale mal (Worker, esquema, R2 y postmortem).

## El patrón obligatorio: EXPAND → MIGRATE → CONTRACT

El Worker de producción se despliega **después** de que la migración se
aplique en el mismo job de `deploy-production` (ver `.github/workflows/ci.yml`),
así que en la práctica no hay una ventana larga de "código viejo contra
esquema nuevo". Aun así, cualquier cambio de esquema que **rompa** lo que el
código actual espera es peligroso por dos motivos reales en este proyecto:

1. **Cloudflare Workers Builds sigue activo** (ver
   `docs/production-hardening-audit.md`) y puede desplegar el código de una
   rama *antes* de que sus migraciones se apliquen por el pipeline correcto
   — el incidente de julio y el de los PR #56/#57 de esta misma sesión son
   exactamente esto.
2. Un rollback del Worker
   ([`docs/deployment.md`](./deployment.md#procedimiento-de-rollback-completo))
   vuelve a una versión de código **anterior** que puede no entender un
   esquema ya migrado hacia adelante, si la migración no fue aditiva.

Por eso, cualquier cambio de esquema que no sea puramente aditivo (nueva
tabla, nueva columna nullable, nuevo índice) se divide en releases
separadas siguiendo este patrón:

```
RELEASE A — EXPAND
  Añade la columna/tabla nueva (nullable, o con DEFAULT). El código viejo
  la ignora; nada se rompe.

RELEASE B — MIGRATE (código)
  El código pasa a leer/escribir tanto el campo viejo como el nuevo (o ya
  solo el nuevo si el viejo puede quedar vacío para filas futuras).

RELEASE C — BACKFILL (datos)
  Un script/migración rellena el campo nuevo para las filas existentes.
  Puede ir dentro de la propia migración SQL (INSERT...SELECT, UPDATE) si
  el volumen de datos lo permite sin bloquear la escritura del deploy.

RELEASE D — CONTRACT (código)
  El código deja de leer/escribir el campo antiguo.

RELEASE E — CONTRACT (esquema)
  Se elimina la columna/tabla antigua. Esta es la única release que
  necesita la marca `-- DESTRUCTIVE:` (ver más abajo) porque ya no hay
  código en ningún commit reciente que dependa de lo que se borra.
```

No todas las migraciones necesitan las 5 releases — una tabla nueva es solo
EXPAND. El patrón completo se reserva para cambios que romperían el código
actual si se aplicaran solos: quitar una columna que el código todavía lee,
renombrar algo, o añadir `NOT NULL` a una columna con filas existentes sin
backfill.

## El gate de migraciones peligrosas

`npm run migrations:check` (`scripts/check-migrations.mjs`) hace tres
comprobaciones sobre `migrations/*.sql`, en este orden:

1. **Secuencia** — nombres `NNNN_descripcion.sql`, números estrictamente
   crecientes, sin huecos ni duplicados.
2. **Patrones peligrosos** — busca `DROP TABLE`, `DROP COLUMN`,
   `RENAME TO`/`RENAME COLUMN` y `DROP INDEX` en cada archivo. Si encuentra
   alguno, **no lo bloquea automáticamente** (SQLite obliga a reconstruir
   la tabla entera — `DROP` + `RENAME` — para relajar un `UNIQUE` o
   renombrar una columna, así que este patrón aparece en migraciones
   legítimas ya aplicadas en producción, como 0023, 0042 y 0043). En su
   lugar **exige** que el archivo contenga una línea:

   ```sql
   -- DESTRUCTIVE: <por qué esta migración es segura>
   ```

   Sin esa marca, `migrations:check` falla con el archivo y el patrón
   exactos que la dispararon. Con la marca presente, el check pasa pero
   imprime un aviso (`⚠`) para que quede visible en el log de CI y en
   revisión de PR — es una señal para el revisor humano, no solo un
   requisito formal.
3. **Aplicación limpia** — las migraciones se aplican de verdad, en orden,
   sobre una D1 local nueva y desechable, igual que se aplicarán en
   staging/producción.

Este check corre en el job `validate` de CI en cada PR y localmente con
`npm run migrations:check`.

## Cómo escribir la marca `-- DESTRUCTIVE:`

Va en cualquier parte del archivo (normalmente junto al comentario de
cabecera de la migración) y debe explicar **por qué** es segura, no solo
que lo es. Ejemplos reales ya usados en `migrations/0023`, `0042` y `0043`:

```sql
-- DESTRUCTIVE: rebuilds 4 tables (DROP + RENAME) to relax a column-level
-- UNIQUE that SQLite/D1 can't ALTER directly — every row is copied via
-- INSERT...SELECT into the replacement table first (ids preserved), so no
-- data is lost.
```

Una marca sin motivo real (`-- DESTRUCTIVE: sí`) no aporta nada — el
check solo comprueba que la línea existe y tiene contenido después de los
dos puntos; la calidad de la justificación es responsabilidad de quien
escribe la migración y de quien revisa el PR.

## Qué SÍ es siempre seguro sin el patrón completo

- `CREATE TABLE` nueva.
- `ALTER TABLE ... ADD COLUMN` nullable, o con `DEFAULT`.
- `CREATE INDEX` / `CREATE UNIQUE INDEX` nuevo (no sustituye uno existente).
- Backfills (`UPDATE`) que no cambian la forma del esquema.

Estos no necesitan `-- DESTRUCTIVE:` ni releases separadas — son
aditivos por definición, el código viejo los ignora y el código nuevo los
usa desde que se despliega.
