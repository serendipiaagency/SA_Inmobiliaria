#!/usr/bin/env node
/**
 * Restaura una instantánea diaria de D1 (la que server/tasks/system/backup-d1.ts
 * deja en R2 cada noche, `backups/AAAA-MM-DD.json.gz`) en una base D1.
 *
 * ## Por qué existe
 *
 * Había copia de seguridad diaria real y nunca se había probado —ni
 * documentado— el camino inverso. Una copia que no se sabe restaurar es una
 * promesa. Este script es ese camino, y `test/unit/backup.restore.test.ts`
 * lo ejecuta de verdad: hace una copia con el mismo código que la tarea
 * nocturna, la restaura en una base recién migrada y compara tabla por
 * tabla y fila por fila.
 *
 * ## Qué hace
 *
 *  1. Lee la instantánea (`.json.gz` o `.json`; o la descarga de R2 con
 *     `--from-r2 <clave>`).
 *  2. Comprueba que cada tabla de la instantánea existe en la base destino.
 *     La instantánea no lleva esquema: la base tiene que estar migrada ya
 *     (`d1_migrations` no se toca nunca).
 *  3. Genera un único fichero SQL: por tabla, `DELETE FROM` y los `INSERT`
 *     con los valores como literales (`wrangler d1 execute --file` no admite
 *     parámetros), con las claves foráneas diferidas para que el orden de
 *     las tablas no importe.
 *  4. Lo ejecuta con `wrangler d1 execute --file` y después CUENTA las filas
 *     de cada tabla restaurada contra las de la instantánea. Si no cuadran,
 *     sale con error: nunca da por hecho que fue bien.
 *
 * ## Qué NO restaura por defecto
 *
 * `sessions`, `rate_limits` y `password_reset_tokens`: son efímeras y
 * sensibles. Restaurarlas resucitaría sesiones cerradas y enlaces de
 * recuperación ya usados desde el momento de la copia. `--include-ephemeral`
 * las incluye si de verdad hace falta.
 *
 * ## Seguridad
 *
 *  - Escribe en la base LOCAL salvo `--remote`, y `--remote` exige además
 *    `--confirm RESTAURAR`. Restaurar en producción borra lo que haya ahora
 *    en cada tabla restaurada: es exactamente para lo que existe el workflow
 *    restore-d1-backup.yml, que hace antes una copia del estado actual.
 *  - `--dry-run` genera el SQL, dice dónde lo ha dejado y no ejecuta nada.
 *  - `--tables a,b` limita la restauración a esas tablas.
 *
 * ## El otro formato: el volcado SQL de `wrangler d1 export`
 *
 * El backup pre-despliegue del pipeline es un `.sql` de `wrangler d1 export`
 * (CREATE TABLE IF NOT EXISTS + INSERT, incluida la tabla d1_migrations).
 * Probado en local: ese fichero NO se puede ejecutar sobre una base con
 * datos —falla en el primer INSERT por clave duplicada y, como wrangler lo
 * ejecuta como un lote atómico, no cambia nada— y tampoco basta con vaciar
 * las tablas, porque también trae el ledger de migraciones. `--sql <fichero>`
 * hace el procedimiento que sí funciona: borra todas las tablas (las hijas
 * antes que sus padres, leyendo las claves foráneas reales de la base),
 * ejecuta el volcado tal cual y verifica los recuentos contra los INSERT
 * del fichero. Deja la base exactamente como estaba al exportar, ledger
 * incluido: si después hay migraciones nuevas, `npm run db:migrate` las
 * aplica encima.
 *
 * Uso:
 *   node scripts/restore-d1-backup.mjs --file backups/2026-09-18.json.gz
 *   node scripts/restore-d1-backup.mjs --from-r2 backups/2026-09-18.json.gz --remote --confirm RESTAURAR
 *   node scripts/restore-d1-backup.mjs --file copia.json --tables leads,clients --dry-run
 *   node scripts/restore-d1-backup.mjs --sql pre-deploy-backup.sql --remote --confirm RESTAURAR
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'

export const DB_NAME = 'sa_inmobiliaria'
export const BUCKET_NAME = 'sa-inmobiliaria-media'
/** Efímeras y sensibles: no se restauran salvo que se pida. */
export const EPHEMERAL_TABLES = ['sessions', 'rate_limits', 'password_reset_tokens']
/** Filas por sentencia INSERT. D1 acepta sentencias grandes, pero un lote moderado da errores localizables. */
const ROWS_PER_INSERT = 50

// ---------------------------------------------------------------------------
// Parte pura (la que prueba test/unit/backup.restore.test.ts)
// ---------------------------------------------------------------------------

/** Igual que isSafeIdentifier en server/utils/backup.ts: sólo identificadores snake_case. */
export function isSafeIdentifier(name) {
  return /^[a-z_][a-z0-9_]*$/.test(name)
}

/** Un valor de fila como literal SQL. Sólo los tipos que JSON puede transportar. */
export function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Valor numérico no representable: ${value}`)
    return String(value)
  }
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`
  // Un objeto o array aquí sería una fila que la instantánea no debería
  // haber producido (D1 devuelve texto para las columnas JSON). Se guarda
  // como su JSON en vez de fallar a mitad de restauración.
  return `'${JSON.stringify(value).replace(/'/g, "''")}'`
}

/**
 * Las sentencias que restauran una instantánea, en orden. Puras: no tocan
 * ninguna base de datos. Devuelven también el recuento esperado por tabla,
 * que es lo que después se verifica contra la base.
 */
export function buildRestoreStatements(snapshot, options = {}) {
  if (!snapshot || typeof snapshot !== 'object' || !snapshot.tables || typeof snapshot.tables !== 'object') {
    throw new Error('La instantánea no tiene la forma esperada { takenAt, tables: { ... } }')
  }
  const only = options.tables ? new Set(options.tables) : null
  const skip = new Set(options.includeEphemeral ? [] : EPHEMERAL_TABLES)

  const statements = ['PRAGMA defer_foreign_keys = true;']
  const expected = {}
  const skipped = []

  for (const [table, rows] of Object.entries(snapshot.tables)) {
    if (!isSafeIdentifier(table)) throw new Error(`Nombre de tabla inesperado en la instantánea: ${table}`)
    if (only && !only.has(table)) continue
    if (skip.has(table)) {
      skipped.push(table)
      continue
    }
    if (!Array.isArray(rows)) throw new Error(`La tabla ${table} no es una lista de filas`)

    statements.push(`DELETE FROM "${table}";`)
    expected[table] = rows.length
    if (!rows.length) continue

    const columns = Object.keys(rows[0])
    for (const col of columns) {
      if (!isSafeIdentifier(col)) throw new Error(`Nombre de columna inesperado en ${table}: ${col}`)
    }
    const columnList = columns.map((c) => `"${c}"`).join(', ')

    for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
      const batch = rows.slice(i, i + ROWS_PER_INSERT)
      const values = batch.map((row, offset) => {
        const keys = Object.keys(row)
        if (keys.length !== columns.length || keys.some((k) => !columns.includes(k))) {
          throw new Error(`La fila ${i + offset} de ${table} no tiene las mismas columnas que la primera`)
        }
        return `(${columns.map((c) => sqlLiteral(row[c])).join(', ')})`
      })
      statements.push(`INSERT INTO "${table}" (${columnList}) VALUES\n${values.join(',\n')};`)
    }
  }

  if (only) {
    for (const wanted of only) {
      if (!(wanted in snapshot.tables)) throw new Error(`La tabla ${wanted} no está en la instantánea`)
    }
  }

  return { statements, expected, skipped }
}

/**
 * Orden en que se pueden borrar las tablas con las claves foráneas activas:
 * cada tabla antes que cualquiera a la que referencie. SQLite falla con
 * "no such table: main.<padre>" al borrar una hija cuyo padre ya no existe
 * (comprobado en local), así que el orden no es opcional. Las
 * autorreferencias se ignoran; un ciclo real entre tablas distintas se
 * rompe dejándolas al final (con las claves diferidas ya no importa).
 */
export function dropOrder(references) {
  const tables = Object.keys(references)
  const remaining = new Set(tables)
  const order = []
  // "Referenciada por alguien que aún no se ha borrado" bloquea el borrado.
  const referencedBy = new Map(tables.map((t) => [t, new Set()]))
  for (const [child, parents] of Object.entries(references)) {
    for (const parent of parents) if (parent !== child && referencedBy.has(parent)) referencedBy.get(parent).add(child)
  }
  while (remaining.size) {
    const free = [...remaining].filter((t) => [...referencedBy.get(t)].every((child) => !remaining.has(child)))
    if (!free.length) {
      order.push(...[...remaining].sort())
      break
    }
    for (const t of free.sort()) {
      order.push(t)
      remaining.delete(t)
    }
  }
  return order
}

/** Cuántas filas mete un volcado de `wrangler d1 export` en cada tabla: un INSERT por fila, con la tabla entre comillas. */
export function countInsertsPerTable(sqlText) {
  const counts = {}
  for (const s of splitSqlStatements(sqlText)) {
    const m = /^INSERT INTO "([a-z_][a-z0-9_]*)"/.exec(s)
    if (m && !isSqliteInternalTable(m[1])) counts[m[1]] = (counts[m[1]] || 0) + 1
  }
  return counts
}

/**
 * `sqlite_sequence` (contadores de AUTOINCREMENT) va en el volcado, pero es
 * una tabla interna: SQLite la mantiene solo a partir de los INSERT con id
 * explícito, y comprobado en local, importarla a mano no deja filas (y
 * contarla como "tabla a verificar" hacía fallar una restauración que era
 * correcta en las 52 tablas reales). Se omite al importar y al verificar.
 */
export function isSqliteInternalTable(name) {
  return name.startsWith('sqlite_') || name.startsWith('_cf_')
}

/**
 * Parte un fichero SQL en sentencias respetando los literales de texto: un
 * `;` o un salto de línea dentro de comillas simples (con `''` como escape)
 * no termina nada. Sin esto, un nombre como "O'Brien; segunda línea" en
 * cualquier fila rompería la reordenación de abajo.
 */
export function splitSqlStatements(sqlText) {
  const statements = []
  let current = ''
  let inString = false
  for (let i = 0; i < sqlText.length; i++) {
    const ch = sqlText[i]
    if (inString) {
      current += ch
      if (ch === "'") {
        if (sqlText[i + 1] === "'") {
          current += "'"
          i++
        } else inString = false
      }
      continue
    }
    if (ch === "'") {
      inString = true
      current += ch
    } else if (ch === ';') {
      const trimmed = current.trim()
      if (trimmed) statements.push(trimmed + ';')
      current = ''
    } else current += ch
  }
  const rest = current.trim()
  if (rest) statements.push(rest.endsWith(';') ? rest : rest + ';')
  return statements
}

/**
 * Reordena un volcado de `wrangler d1 export` para que se pueda importar en
 * una base vacía.
 *
 * Comprobado en local: el volcado va tabla a tabla (CREATE TABLE seguido de
 * sus INSERT) en el orden en que las tablas existen en sqlite_master, y ese
 * orden NO respeta las claves foráneas — las tablas de planos de una
 * vivienda, por ejemplo, van antes que la tabla de viviendas. Con las claves
 * foráneas activas (siempre, en D1), el primer INSERT en una tabla hija cuyo
 * padre aún no existe falla con "no such table: main.<padre>", y como el
 * lote es atómico no entra nada. `PRAGMA foreign_keys = OFF` no sirve: dentro
 * de una transacción SQLite lo ignora. Lo que sí funciona es crear TODAS las
 * tablas primero, luego todos los INSERT (con las violaciones diferidas al
 * final del lote, cuando ya está todo) y por último los índices.
 */
export function reorderExportForImport(sqlText) {
  const statements = splitSqlStatements(sqlText)
  const kind = (s) => {
    const head = s.replace(/\s+/g, ' ').slice(0, 40).toUpperCase()
    if (head.startsWith('PRAGMA')) return 'pragma'
    if (head.startsWith('CREATE TABLE')) return 'table'
    if (head.startsWith('CREATE INDEX') || head.startsWith('CREATE UNIQUE INDEX')) return 'index'
    if (head.startsWith('INSERT INTO')) return 'insert'
    return 'other'
  }
  const groups = { pragma: [], table: [], insert: [], index: [], other: [] }
  for (const s of statements) {
    const internal = /^INSERT INTO "(sqlite_|_cf_)/i.test(s) || /^CREATE TABLE IF NOT EXISTS "?(sqlite_|_cf_)/i.test(s)
    if (internal) continue
    groups[kind(s)].push(s)
  }
  if (!groups.pragma.some((s) => /defer_foreign_keys\s*=\s*true/i.test(s))) groups.pragma.unshift('PRAGMA defer_foreign_keys = true;')
  return [...groups.pragma, ...groups.table, ...groups.insert, ...groups.index, ...groups.other]
}

/** Lee una instantánea desde disco, comprimida o no. */
export function readSnapshot(path) {
  const raw = readFileSync(path)
  const isGzip = raw.length > 2 && raw[0] === 0x1f && raw[1] === 0x8b
  const text = (isGzip ? gunzipSync(raw) : raw).toString('utf8')
  return JSON.parse(text)
}

// ---------------------------------------------------------------------------
// Ejecución (sólo cuando se invoca como CLI)
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { tables: null, includeEphemeral: false, remote: false, dryRun: false, confirm: null, file: null, fromR2: null, sql: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    if (a === '--file') args.file = next()
    else if (a === '--from-r2') args.fromR2 = next()
    else if (a === '--sql') args.sql = next()
    else if (a === '--tables') args.tables = next().split(',').map((s) => s.trim()).filter(Boolean)
    else if (a === '--include-ephemeral') args.includeEphemeral = true
    else if (a === '--remote') args.remote = true
    else if (a === '--dry-run') args.dryRun = true
    else if (a === '--confirm') args.confirm = next()
    else if (a === '--help' || a === '-h') {
      console.log('Uso: node scripts/restore-d1-backup.mjs (--file <ruta> | --from-r2 <clave> | --sql <volcado>) [--tables a,b] [--include-ephemeral] [--remote --confirm RESTAURAR] [--dry-run]')
      process.exit(0)
    } else throw new Error(`Argumento desconocido: ${a}`)
  }
  return args
}

function wrangler(args) {
  return execFileSync('npx', ['wrangler', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 })
}

function d1Json(location, command) {
  const out = wrangler(['d1', 'execute', DB_NAME, location, '--json', '--command', command])
  const parsed = JSON.parse(out)
  return parsed[0]?.results || []
}

/** Ejecuta un fichero SQL y devuelve el resultado de cada sentencia (wrangler lo corre como un lote atómico). */
function d1File(location, sqlFile, json = false) {
  const out = wrangler(['d1', 'execute', DB_NAME, location, '--file', sqlFile, '--yes', ...(json ? ['--json'] : [])])
  return json ? JSON.parse(out) : out
}

function userTables(location) {
  return d1Json(location, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").map((r) => r.name)
}

/** Restauración de un volcado SQL de `wrangler d1 export`: vaciar el esquema entero y ejecutar el volcado. */
function restoreFromSqlExport(args, location) {
  if (!existsSync(args.sql)) throw new Error(`No existe el fichero ${args.sql}`)
  const sqlText = readFileSync(args.sql, 'utf8')
  if (!/^PRAGMA defer_foreign_keys=TRUE;/m.test(sqlText) || !/CREATE TABLE IF NOT EXISTS/.test(sqlText)) {
    throw new Error('Ese fichero no parece un volcado de `wrangler d1 export` (falta el PRAGMA inicial o los CREATE TABLE).')
  }
  const expected = countInsertsPerTable(sqlText)

  console.log(`\n=== Restauración de volcado SQL de D1 ===`)
  console.log(`   fichero: ${args.sql}`)
  console.log(`   destino: ${args.remote ? 'REMOTO (producción)' : 'local'}`)
  console.log(`   tablas con filas en el volcado: ${Object.keys(expected).length}`)

  // Orden de borrado a partir de las claves foráneas reales de la base
  // (PRAGMA foreign_key_list por tabla, todo en una sola llamada). Una base
  // ya vacía (p. ej. un intento anterior que vació y no llegó a importar)
  // no tiene nada que borrar ni que preguntar.
  const tables = userTables(location)
  const references = {}
  if (tables.length) {
    const fkFile = join(tmpdir(), `d1-fks-${Date.now()}.sql`)
    writeFileSync(fkFile, tables.map((t) => `PRAGMA foreign_key_list("${t}");`).join('\n'), 'utf8')
    const fkResults = d1File(location, fkFile, true)
    unlinkSync(fkFile)
    tables.forEach((t, i) => {
      references[t] = [...new Set((fkResults[i]?.results || []).map((r) => r.table))]
    })
  }
  const order = dropOrder(references)

  const dropFile = join(tmpdir(), `d1-drop-${Date.now()}.sql`)
  writeFileSync(dropFile, ['PRAGMA defer_foreign_keys = true;', ...order.map((t) => `DROP TABLE IF EXISTS "${t}";`)].join('\n'), 'utf8')
  // El volcado tal cual no se puede importar (ver reorderExportForImport).
  const importFile = join(tmpdir(), `d1-import-${Date.now()}.sql`)
  const reordered = reorderExportForImport(sqlText)
  writeFileSync(importFile, reordered.join('\n'), 'utf8')
  console.log(`   tablas actuales a borrar: ${tables.length} (SQL en ${dropFile})`)
  console.log(`   volcado reordenado para importar: ${importFile} (${reordered.length} sentencias)\n`)

  if (args.dryRun) {
    console.log('--dry-run: no se ha ejecutado nada. Orden de borrado:')
    console.log('   ' + order.join(', '))
    return
  }

  if (order.length) {
    try {
      d1File(location, dropFile)
    } catch (err) {
      const detail = [err.stderr, err.stdout].filter(Boolean).join('\n').trim()
      throw new Error(`Error al vaciar el esquema (no se ha ejecutado el volcado; el lote es atómico y la base sigue como estaba):\n${detail || err.message}`, { cause: err })
    }
  }
  try {
    d1File(location, importFile)
  } catch (err) {
    const detail = [err.stderr, err.stdout].filter(Boolean).join('\n').trim()
    throw new Error(`Error al ejecutar el volcado. ATENCIÓN: el esquema ya se había vaciado; vuelve a intentarlo o aplica las migraciones (npm run db:migrate) para recrearlo.\n${detail || err.message}`, { cause: err })
  }

  let mismatches = 0
  console.log('Recuento esperado (INSERT en el volcado) → real:')
  for (const t of Object.keys(expected).sort()) {
    const after = d1Json(location, `SELECT count(*) AS n FROM "${t}"`)[0]?.n ?? 0
    const ok = after === expected[t]
    if (!ok) mismatches++
    console.log(`   ${ok ? '✓' : '✗'} ${t.padEnd(36)} ${String(expected[t]).padStart(7)} → ${String(after).padStart(7)}`)
  }
  try {
    unlinkSync(dropFile)
    unlinkSync(importFile)
  } catch {
    // temporal
  }
  if (mismatches) throw new Error(`${mismatches} tabla(s) no tienen el recuento esperado tras restaurar.`)
  console.log(`\nRestauración completada. Si hay migraciones posteriores al volcado, aplícalas ahora: npm run db:migrate${args.remote ? '' : ':local'}.`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.file && !args.fromR2 && !args.sql) throw new Error('Indica --file <ruta>, --from-r2 <clave> o --sql <volcado>')
  if (args.remote && args.confirm !== 'RESTAURAR') {
    throw new Error('--remote sobreescribe tablas de la base de datos de producción. Añade --confirm RESTAURAR si es lo que quieres.')
  }
  const location = args.remote ? '--remote' : '--local'
  if (args.sql) {
    restoreFromSqlExport(args, location)
    return
  }

  let file = args.file
  let downloaded = null
  if (args.fromR2) {
    downloaded = join(tmpdir(), `d1-snapshot-${Date.now()}.json.gz`)
    console.log(`Descargando ${args.fromR2} del bucket ${BUCKET_NAME} (${args.remote ? 'remoto' : 'local'})…`)
    wrangler(['r2', 'object', 'get', `${BUCKET_NAME}/${args.fromR2}`, `--file=${downloaded}`, location])
    file = downloaded
  }
  if (!existsSync(file)) throw new Error(`No existe el fichero ${file}`)

  const snapshot = readSnapshot(file)
  const { statements, expected, skipped } = buildRestoreStatements(snapshot, { tables: args.tables, includeEphemeral: args.includeEphemeral })
  const tables = Object.keys(expected)

  console.log(`\n=== Restauración de instantánea D1 ===`)
  console.log(`   tomada:  ${snapshot.takenAt}`)
  console.log(`   destino: ${args.remote ? 'REMOTO (producción)' : 'local'}`)
  console.log(`   tablas:  ${tables.length}${skipped.length ? ` (omitidas por efímeras: ${skipped.join(', ')})` : ''}`)

  // La base destino tiene que tener ya cada tabla: la instantánea no lleva esquema.
  const existing = new Set(d1Json(location, "SELECT name FROM sqlite_master WHERE type='table'").map((r) => r.name))
  const missing = tables.filter((t) => !existing.has(t))
  if (missing.length) {
    throw new Error(`La base destino no tiene estas tablas: ${missing.join(', ')}. Aplica primero las migraciones (npm run db:migrate${args.remote ? '' : ':local'}).`)
  }

  const before = {}
  for (const t of tables) before[t] = d1Json(location, `SELECT count(*) AS n FROM "${t}"`)[0]?.n ?? 0

  const sqlFile = join(tmpdir(), `d1-restore-${Date.now()}.sql`)
  writeFileSync(sqlFile, statements.join('\n'), 'utf8')
  console.log(`   SQL:     ${sqlFile} (${statements.length} sentencias)\n`)

  if (args.dryRun) {
    console.log('--dry-run: no se ha ejecutado nada. Recuento actual → esperado tras restaurar:')
    for (const t of tables) console.log(`   ${t.padEnd(36)} ${String(before[t]).padStart(7)} → ${String(expected[t]).padStart(7)}`)
    return
  }

  try {
    wrangler(['d1', 'execute', DB_NAME, location, '--file', sqlFile, '--yes'])
  } catch (err) {
    const detail = [err.stderr, err.stdout].filter(Boolean).join('\n').trim()
    throw new Error(`Error al ejecutar el SQL de restauración (el fichero queda en ${sqlFile}):\n${detail || err.message}`, { cause: err })
  }

  // Verificación: contar lo que hay de verdad, tabla por tabla.
  let mismatches = 0
  console.log('Recuento antes → esperado → real:')
  for (const t of tables) {
    const after = d1Json(location, `SELECT count(*) AS n FROM "${t}"`)[0]?.n ?? 0
    const ok = after === expected[t]
    if (!ok) mismatches++
    console.log(`   ${ok ? '✓' : '✗'} ${t.padEnd(36)} ${String(before[t]).padStart(7)} → ${String(expected[t]).padStart(7)} → ${String(after).padStart(7)}`)
  }

  try {
    unlinkSync(sqlFile)
    if (downloaded) unlinkSync(downloaded)
  } catch {
    // Ficheros temporales: que no se puedan borrar no es un fallo.
  }

  if (mismatches) throw new Error(`${mismatches} tabla(s) no tienen el recuento esperado tras restaurar.`)
  console.log(`\nRestauración completada: ${tables.length} tablas, ${Object.values(expected).reduce((a, b) => a + b, 0)} filas.`)
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`\n${err.message}`)
    process.exit(1)
  })
}
