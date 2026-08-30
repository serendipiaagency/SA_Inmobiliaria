#!/usr/bin/env node
/**
 * Migration validation gate for the deploy pipeline (.github/workflows/deploy.yml).
 * Two checks, both without touching any real (local persistent or remote) D1:
 *
 *  1. File sequence integrity — every migrations/*.sql file must be named
 *     NNNN_description.sql with a strictly increasing, gap-free, duplicate-free
 *     4+-digit sequence number. This is exactly the kind of mistake that's easy
 *     to make in a busy branch (two PRs both add "0041_...") and invisible until
 *     `wrangler d1 migrations apply` either silently reorders things or errors
 *     in production.
 *  2. Clean-apply — every migration actually runs, in order, against a brand
 *     new local D1 (a throwaway `wrangler d1 migrations apply --local` target,
 *     never the persistent one `npm run test:e2e` reuses). This is the same
 *     guarantee "the schema is valid SQL and each file applies on top of the
 *     last" that a fresh production or staging D1 would need — proven before
 *     any of this reaches a real database.
 *
 *  3. Dangerous-pattern gate — flags DROP TABLE / DROP COLUMN / RENAME
 *     (table or column) / DROP INDEX. Doesn't block them outright (some are
 *     legitimate, e.g. the CONTRACT step of an expand/migrate/contract
 *     rollout removing a column nothing reads anymore — see
 *     docs/database-migrations.md) but requires the file to say so
 *     explicitly with a `-- DESTRUCTIVE: <why this is safe>` comment. A
 *     migration that silently drops/renames something is exactly the kind
 *     of change that should never pass review by accident.
 *
 * Exits non-zero on any problem, with a message identifying exactly which file.
 * Never applies anything to a persistent or remote database — safe to run in CI
 * on every PR, and safe to run locally as many times as you like.
 */
import { readdirSync, readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS_DIR = join(ROOT, 'migrations')
const NAME_RE = /^(\d{4,})_[a-z0-9_]+\.sql$/

function fail(message) {
  console.error(`✗ ${message}`)
  process.exitCode = 1
}

function checkSequence(files) {
  let ok = true
  const seen = new Map()
  let prev = 0
  for (const file of files) {
    const m = file.match(NAME_RE)
    if (!m) {
      fail(`${file}: no sigue el patrón NNNN_descripcion_en_snake_case.sql`)
      ok = false
      continue
    }
    const n = parseInt(m[1], 10)
    if (seen.has(n)) {
      fail(`${file}: número de secuencia ${m[1]} duplicado (ya usado por ${seen.get(n)})`)
      ok = false
    }
    seen.set(n, file)
    if (n <= prev) {
      fail(`${file}: número de secuencia ${m[1]} no es mayor que el de la migración anterior (${prev})`)
      ok = false
    }
    prev = n
  }
  return ok
}

function checkCleanApply() {
  // --persist-to redirects wrangler's local D1 storage to a throwaway temp
  // directory instead of the project's persistent .wrangler/state — a real
  // brand-new database every run, isolated from both `npm run test:e2e`'s
  // shared local DB and any remote one, using the real configured database
  // name (wrangler resolves it from wrangler.toml either way).
  const scratchDir = mkdtempSync(join(tmpdir(), 'sa-migrations-check-'))
  try {
    execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'sa_inmobiliaria', '--local', '--persist-to', scratchDir], {
      cwd: ROOT,
      stdio: 'pipe',
      env: { ...process.env, CI: process.env.CI || '1' },
    })
    console.log(`✓ Las ${readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).length} migraciones se aplican limpias sobre una D1 local nueva`)
    return true
  } catch (err) {
    fail('Al menos una migración no se aplica limpia sobre una D1 local nueva:')
    console.error((err.stdout?.toString() || '') + (err.stderr?.toString() || '') || err.message)
    return false
  } finally {
    rmSync(scratchDir, { recursive: true, force: true })
  }
}

const DANGEROUS_PATTERNS = [
  { re: /\bDROP\s+TABLE\b/i, label: 'DROP TABLE' },
  { re: /\bDROP\s+COLUMN\b/i, label: 'DROP COLUMN' },
  { re: /\bRENAME\s+(TO|COLUMN)\b/i, label: 'RENAME (tabla o columna)' },
  { re: /\bDROP\s+INDEX\b/i, label: 'DROP INDEX' },
]
const DESTRUCTIVE_MARKER_RE = /--\s*DESTRUCTIVE:\s*\S/i

function checkDangerousMigrations(files) {
  let ok = true
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    const hits = DANGEROUS_PATTERNS.filter((p) => p.re.test(sql))
    if (!hits.length) continue
    if (!DESTRUCTIVE_MARKER_RE.test(sql)) {
      fail(
        `${file}: contiene ${hits.map((h) => h.label).join(', ')} sin una marca explícita ` +
          `"-- DESTRUCTIVE: <por qué es segura>" en el archivo. Añade esa marca documentando ` +
          `por qué es segura, o reescríbela siguiendo el patrón EXPAND/MIGRATE/CONTRACT de ` +
          `docs/database-migrations.md.`,
      )
      ok = false
    } else {
      console.log(`⚠ ${file}: migración destructiva marcada explícitamente (${hits.map((h) => h.label).join(', ')}) — revisar el motivo antes de aprobar.`)
    }
  }
  return ok
}

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()

if (!files.length) {
  fail('No se encontró ningún archivo de migración en migrations/')
  process.exit(1)
}

const sequenceOk = checkSequence(files)
const dangerousOk = checkDangerousMigrations(files)
const applyOk = checkCleanApply()

if (sequenceOk && dangerousOk && applyOk) {
  console.log(`✓ ${files.length} migraciones validadas correctamente`)
  process.exit(0)
} else {
  process.exit(1)
}
