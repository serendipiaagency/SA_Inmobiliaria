#!/usr/bin/env node
/**
 * OPT-IN, HUMAN-INVOKED ONLY. Never run this automatically — not from CI, not
 * from the deploy workflow, not from any migration. It permanently deletes an
 * organization and every row scoped to it from a real D1 database.
 *
 * Why this exists instead of a migration: migrations 0009, 0015, 0021, 0024,
 * 0025 and 0040 seeded org 2 ("Skyline Estates") and its demo CRM data (fake
 * leads, clients, visits, appointments…) as part of the shared migration
 * ledger every environment — including this one — has already applied. A
 * migration file is immutable once applied: editing one of those files
 * retroactively would break checksum validation for
 * `wrangler d1 migrations apply` / `migrations:check` everywhere it already
 * ran. So the seed stays in the ledger, and this script is the explicit,
 * reviewable, opt-in way to remove its data from a specific database when
 * that database is about to become a real production install.
 *
 * What it does:
 *   1. Introspects the live schema (sqlite_master + PRAGMA table_info) for
 *      every table that has an organization_id column, instead of relying on
 *      a hand-maintained table list that would silently go stale as the
 *      schema grows.
 *   2. Reports exactly how many rows of each table belong to the target org
 *      — always, even without --yes (dry run by default).
 *   3. Only deletes anything when --yes is passed.
 *   4. Only targets the LOCAL D1 unless --remote is also passed — an
 *      accidental bare run can never touch a real database.
 *   5. Deletes every scoped row plus the organizations row itself in a
 *      single `wrangler d1 execute --file` batch (one connection, so
 *      statement order inside it is irrelevant either way).
 *
 * Usage:
 *   node scripts/purge-demo-data.mjs                    # dry run against local D1
 *   node scripts/purge-demo-data.mjs --yes               # actually delete, local D1
 *   node scripts/purge-demo-data.mjs --remote --yes       # actually delete, remote/production D1 — DANGEROUS
 *   node scripts/purge-demo-data.mjs --org-id=3 --yes     # target a different org id (default: 2, the demo seed org)
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DB_NAME = 'sa_inmobiliaria'

const args = process.argv.slice(2)
const isRemote = args.includes('--remote')
const confirmed = args.includes('--yes')
const orgIdArg = args.find((a) => a.startsWith('--org-id='))
const ORG_ID = orgIdArg ? parseInt(orgIdArg.split('=')[1], 10) : 2

if (!Number.isInteger(ORG_ID) || ORG_ID < 1) {
  console.error(`--org-id inválido`)
  process.exit(1)
}
if (ORG_ID === 1) {
  console.error('Org #1 no se purga con este script: es la organización por defecto que usan las páginas públicas sin dominio propio todavía configurado, no un seed demo aislado como la #2.')
  process.exit(1)
}

function d1Query(sql) {
  const flags = isRemote ? ['--remote'] : ['--local']
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', DB_NAME, ...flags, '--json', '--command', sql], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  const parsed = JSON.parse(out)
  return parsed[0]?.results || []
}

console.log(`Purga de datos demo — organización #${ORG_ID}, base de datos ${isRemote ? 'REMOTA/PRODUCCIÓN' : 'local'}\n`)

const org = d1Query(`SELECT id, name, company_name FROM organizations WHERE id = ${ORG_ID}`)[0]
if (!org) {
  console.log(`No existe ninguna organización con id ${ORG_ID}. Nada que purgar.`)
  process.exit(0)
}
console.log(`Organización objetivo: #${org.id} — ${org.company_name || org.name}\n`)

const tables = d1Query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'`)
  .map((r) => r.name)
  .sort()

const scopedTables = tables.filter((table) => d1Query(`PRAGMA table_info(${table})`).some((c) => c.name === 'organization_id'))

console.log(`Tablas con organization_id (${scopedTables.length} de ${tables.length} tablas totales):`)
let totalRows = 0
const counts = []
for (const table of scopedTables) {
  const row = d1Query(`SELECT COUNT(*) AS n FROM ${table} WHERE organization_id = ${ORG_ID}`)[0]
  const n = Number(row?.n || 0)
  if (n > 0) {
    counts.push({ table, n })
    totalRows += n
  }
}
if (counts.length) {
  for (const { table, n } of counts) console.log(`  - ${table}: ${n} fila(s)`)
} else {
  console.log('  (ninguna tabla tiene filas de esta organización)')
}
console.log(`\nTotal: ${totalRows} fila(s) en ${counts.length} tabla(s), más la propia fila de organizations.\n`)

if (!confirmed) {
  console.log(`Dry run — no se ha borrado nada. Vuelve a ejecutar con --yes para borrar de verdad${isRemote ? ' (ya estás en --remote: ten mucho cuidado)' : ''}.`)
  process.exit(0)
}

if (isRemote) {
  console.log('⚠️  Vas a borrar datos de la base de datos REMOTA/PRODUCCIÓN. Esta acción no se puede deshacer.\n')
}

const statements = [
  ...counts.map(({ table }) => `DELETE FROM ${table} WHERE organization_id = ${ORG_ID};`),
  `DELETE FROM organizations WHERE id = ${ORG_ID};`,
]

const scratchDir = mkdtempSync(join(tmpdir(), 'sa-purge-demo-'))
const sqlFile = join(scratchDir, 'purge.sql')
writeFileSync(sqlFile, statements.join('\n') + '\n')
try {
  const flags = isRemote ? ['--remote'] : ['--local']
  execFileSync('npx', ['wrangler', 'd1', 'execute', DB_NAME, ...flags, '-y', '--file', sqlFile], {
    cwd: ROOT,
    stdio: 'inherit',
  })
} finally {
  rmSync(scratchDir, { recursive: true, force: true })
}

console.log(`\nListo. Organización #${ORG_ID} (${org.company_name || org.name}) y sus ${totalRows} fila(s) asociadas han sido eliminadas.`)
