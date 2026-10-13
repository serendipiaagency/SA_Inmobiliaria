import { eq, like, sql } from 'drizzle-orm'
import * as schema from '../db/schema'
import { demoScopedTables } from './purge'
import type { DemoContext } from './context'
import type { DemoState } from './state'

/**
 * La instantánea del estado sembrado de la cuenta demo: todas sus filas tal
 * cual quedan al terminar la siembra (y los eventos que el código añada
 * después), guardadas como JSON en el R2 de la plataforma. Es lo que hace
 * posible un restablecimiento NO destructivo:
 *
 *  - «Restablecer» no vuelve a sembrar: borra las filas actuales de la empresa
 *    demo, vuelve a insertar las de la instantánea (mismos ids, mismas claves
 *    de R2: las imágenes no se tocan ni se vuelven a subir) y después ejecuta
 *    sólo los eventos de la línea de tiempo que el código añadió desde la
 *    instantánea (claves que no están en `done`). Lo que un visitante haya
 *    creado o cambiado desaparece; lo que viene del código se conserva.
 *  - Los ficheros de R2 que no estén en la instantánea (subidos por un
 *    visitante) se borran; los sembrados se conservan.
 *
 * La clave de R2 no es servible: /api/media sólo entrega ficheros registrados
 * en `media_assets`, y la instantánea no lo está (contiene, entre otras cosas,
 * los hash de las contraseñas de los usuarios de la demo).
 *
 * Tablas que nunca se guardan ni se restauran: las de sesión y rastro, que son
 * de quien visita (sesiones, retos de acceso, tokens de contraseña, accesos a
 * medios, subidas a medias, errores).
 */

export const DEMO_SNAPSHOT_KEY = 'demo/norte-astur/snapshot.json'
export const DEMO_SNAPSHOT_VERSION = 1

export const SNAPSHOT_SKIP_TABLES = new Set(['sessions', 'login_challenges', 'password_reset_tokens', 'media_access_log', 'media_multipart_uploads', 'error_logs'])

/** Columnas de `organizations` que la restauración no toca (identidad de la empresa demo). */
const ORGANIZATION_FIXED_COLUMNS = new Set(['id', 'slug', 'registration_source', 'created_at'])

/** Topes de D1: parámetros por consulta (no usamos ninguno), tamaño de sentencia y sentencias por batch. */
const MAX_STATEMENT_BYTES = 60_000
const MAX_ROWS_PER_STATEMENT = 100
const MAX_STATEMENTS_PER_BATCH = 25

const ident = (name: string) => `"${name.replace(/"/g, '""')}"`

export interface DemoSnapshotTable {
  name: string
  rows: Record<string, unknown>[]
}

export interface DemoSnapshot {
  version: number
  takenAt: string
  orgId: number
  organization: Record<string, unknown>
  settings: Record<string, unknown>[]
  /** En orden de inserción: cada tabla después de sus padres. */
  tables: DemoSnapshotTable[]
  state: Pick<DemoState, 'anchorDay' | 'ids' | 'media' | 'done' | 'finishedAt'>
}

type Bucket = { put: (key: string, value: string, opts?: any) => Promise<unknown>; get: (key: string) => Promise<any>; head: (key: string) => Promise<any>; delete: (keys: string | string[]) => Promise<unknown> }

function bucketOf(env: Record<string, any> | null | undefined): Bucket | null {
  const b = env?.MEDIA
  return b && typeof b.put === 'function' && typeof b.get === 'function' ? (b as Bucket) : null
}

const isoNow = () => new Date().toISOString().replace('T', ' ').slice(0, 19)

/**
 * Los padres REALES de una tabla, según las claves foráneas de la propia base
 * de datos (`PRAGMA foreign_key_list`), no según lo que declara el esquema de
 * Drizzle: varias claves (leads → contacts, visits → leads…) sólo existen en
 * las migraciones, y son las que SQLite comprueba al insertar.
 */
async function foreignKeyParents(db: any, table: string): Promise<string[]> {
  const rows = (await db.all(sql.raw(`PRAGMA foreign_key_list(${ident(table)})`))) as { table?: string }[]
  const out = new Set<string>()
  for (const r of rows) if (typeof r.table === 'string' && r.table !== table) out.add(r.table)
  return [...out]
}

/**
 * Orden de inserción (cada tabla después de todas sus padres) para un
 * conjunto de tablas, con las claves foráneas reales. Un ciclo —si lo hubiera—
 * se rompe dejando esas tablas al final en su orden de entrada; dentro de un
 * mismo batch las comprobaciones van diferidas y eso lo salva.
 */
export async function orderTablesForInsert(db: any, names: string[]): Promise<{ order: string[]; cycles: string[] }> {
  const set = new Set(names)
  const parents = new Map<string, string[]>()
  for (const n of names) parents.set(n, (await foreignKeyParents(db, n)).filter((p) => set.has(p)))
  const order: string[] = []
  const done = new Set<string>()
  let remaining = [...names]
  while (remaining.length) {
    const ready = remaining.filter((n) => parents.get(n)!.every((p) => done.has(p)))
    if (!ready.length) break
    for (const n of ready) {
      order.push(n)
      done.add(n)
    }
    remaining = remaining.filter((n) => !done.has(n))
  }
  return { order: [...order, ...remaining], cycles: remaining }
}

/** Las filas de una tabla de la empresa demo, con los nombres de columna de la base de datos. */
async function rowsOf(db: any, table: string, where: ReturnType<typeof sql>): Promise<Record<string, unknown>[]> {
  const rows = await db.all(sql`select * from ${sql.identifier(table)} where ${where}`)
  return (rows as Record<string, unknown>[]).map((r) => ({ ...r }))
}

/** Guarda la instantánea del estado actual de la empresa demo. Una invocación: una consulta por tabla. */
export async function exportDemoSnapshot(ctx: DemoContext, orgId: number): Promise<{ key: string; bytes: number; rows: number; tables: number }> {
  const bucket = bucketOf(ctx.env)
  if (!bucket) throw new Error('Sin binding MEDIA: no se puede guardar la instantánea de la demo')
  // demoScopedTables() va de hijas a padres (orden de borrado); la instantánea se guarda al revés (orden de inserción).
  const scoped = [...demoScopedTables()].reverse().filter((t) => !SNAPSHOT_SKIP_TABLES.has(t.name))
  const tables: DemoSnapshotTable[] = []
  let rowCount = 0
  for (const t of scoped) {
    const rows = await rowsOf(ctx.db, t.name, t.where(orgId))
    if (!rows.length) continue
    rowCount += rows.length
    tables.push({ name: t.name, rows })
  }
  // El orden de inserción sale de las claves foráneas reales de la base de datos.
  const { order } = await orderTablesForInsert(ctx.db, tables.map((t) => t.name))
  tables.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name))
  const [organization] = (await ctx.db.all(sql`select * from organizations where id = ${orgId}`)) as Record<string, unknown>[]
  const settings = (await ctx.db.all(sql`select * from settings where key like ${`org:${orgId}:%`}`)) as Record<string, unknown>[]
  const snapshot: DemoSnapshot = {
    version: DEMO_SNAPSHOT_VERSION,
    takenAt: isoNow(),
    orgId,
    organization: { ...organization },
    settings: settings.map((r) => ({ ...r })),
    tables,
    state: { anchorDay: ctx.state.anchorDay, ids: ctx.state.ids, media: ctx.state.media, done: ctx.state.done, finishedAt: ctx.state.finishedAt },
  }
  const json = JSON.stringify(snapshot)
  await bucket.put(DEMO_SNAPSHOT_KEY, json, { httpMetadata: { contentType: 'application/json' } })
  return { key: DEMO_SNAPSHOT_KEY, bytes: json.length, rows: rowCount, tables: tables.length }
}

export async function readDemoSnapshot(env: Record<string, any> | null | undefined): Promise<DemoSnapshot | null> {
  const bucket = bucketOf(env)
  if (!bucket) return null
  const obj = await bucket.get(DEMO_SNAPSHOT_KEY)
  if (!obj) return null
  const text = typeof obj.text === 'function' ? await obj.text() : new TextDecoder().decode(await obj.arrayBuffer())
  try {
    const parsed = JSON.parse(text) as DemoSnapshot
    if (!parsed || parsed.version !== DEMO_SNAPSHOT_VERSION || !Array.isArray(parsed.tables) || !parsed.orgId) return null
    return parsed
  } catch {
    return null
  }
}

export async function hasDemoSnapshot(env: Record<string, any> | null | undefined): Promise<boolean> {
  const bucket = bucketOf(env)
  if (!bucket) return false
  try {
    return Boolean(await bucket.head(DEMO_SNAPSHOT_KEY))
  } catch {
    return false
  }
}

export async function deleteDemoSnapshot(env: Record<string, any> | null | undefined): Promise<void> {
  const bucket = bucketOf(env)
  if (bucket) await bucket.delete(DEMO_SNAPSHOT_KEY)
}

// ---------------------------------------------------------------------------
// Sentencias de inserción con los valores en literal (ni un parámetro: D1 admite
// 100 por consulta y una fila de `agent_properties` tiene 80 columnas)
// ---------------------------------------------------------------------------

export function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL'
  if (typeof v === 'bigint') return v.toString()
  if (typeof v === 'boolean') return v ? '1' : '0'
  if (v instanceof Uint8Array || v instanceof ArrayBuffer) {
    const bytes = v instanceof Uint8Array ? v : new Uint8Array(v)
    return `X'${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}'`
  }
  return `'${String(v).replace(/'/g, "''")}'`
}

/** INSERT de varias filas por sentencia, troceado por filas y por tamaño. */
export function insertStatements(table: string, rows: Record<string, unknown>[]): string[] {
  if (!rows.length) return []
  const columns = Object.keys(rows[0])
  const head = `INSERT INTO ${ident(table)} (${columns.map(ident).join(', ')}) VALUES `
  const out: string[] = []
  let values: string[] = []
  let bytes = head.length
  const flush = () => {
    if (values.length) out.push(head + values.join(', '))
    values = []
    bytes = head.length
  }
  for (const row of rows) {
    const tuple = `(${columns.map((c) => sqlLiteral(row[c])).join(', ')})`
    if (values.length && (values.length >= MAX_ROWS_PER_STATEMENT || bytes + tuple.length + 2 > MAX_STATEMENT_BYTES)) flush()
    values.push(tuple)
    bytes += tuple.length + 2
  }
  flush()
  return out
}

/** UPDATE de la fila de la empresa con lo guardado (salvo su identidad). */
export function organizationUpdateStatement(orgId: number, organization: Record<string, unknown>): string | null {
  const sets = Object.entries(organization)
    .filter(([k]) => !ORGANIZATION_FIXED_COLUMNS.has(k))
    .map(([k, v]) => `${ident(k)} = ${sqlLiteral(v)}`)
  return sets.length ? `UPDATE organizations SET ${sets.join(', ')} WHERE id = ${sqlLiteral(orgId)}` : null
}

export interface RestoreProgress {
  table: number
  offset: number
}

export interface RestoreStepResult {
  progress: RestoreProgress
  /** Toda la instantánea está insertada (y la empresa y sus ajustes, restaurados). */
  done: boolean
  statements: number
  label: string
}

/**
 * Un tramo de la restauración: inserta filas de la instantánea desde
 * `progress` hasta agotar el presupuesto de sentencias o de tiempo. Al llegar
 * al final restaura la fila de la empresa y sus ajustes.
 */
export async function restoreDemoSnapshotStep(
  ctx: DemoContext,
  snapshot: DemoSnapshot,
  progress: RestoreProgress,
  limits: { maxStatements: number; deadline: number },
): Promise<RestoreStepResult> {
  let { table, offset } = progress
  let statements = 0
  let label = ''
  while (table < snapshot.tables.length) {
    const t = snapshot.tables[table]
    const pending = insertStatements(t.name, t.rows.slice(offset))
    if (!pending.length) {
      table++
      offset = 0
      continue
    }
    // Cuántas filas cubre cada sentencia, para saber por dónde seguir si no caben todas.
    const rowsPer = pending.map((s) => (s.match(/\), \(/g)?.length ?? 0) + 1)
    let i = 0
    while (i < pending.length) {
      if (statements >= limits.maxStatements || Date.now() > limits.deadline) {
        return { progress: { table, offset }, done: false, statements, label }
      }
      const chunk = pending.slice(i, i + MAX_STATEMENTS_PER_BATCH)
      await ctx.db.batch([ctx.db.run(sql`PRAGMA defer_foreign_keys = on`), ...chunk.map((s) => ctx.db.run(sql.raw(s)))])
      statements += chunk.length + 1
      offset += chunk.reduce((n, _s, j) => n + rowsPer[i + j], 0)
      i += chunk.length
      label = `${t.name}: ${Math.min(offset, t.rows.length)} de ${t.rows.length}`
    }
    table++
    offset = 0
  }
  // Al final: la empresa (sus datos, logo, cuota…) y sus ajustes.
  const tail: any[] = [ctx.db.run(sql`PRAGMA defer_foreign_keys = on`)]
  const orgUpdate = organizationUpdateStatement(snapshot.orgId, snapshot.organization)
  if (orgUpdate) tail.push(ctx.db.run(sql.raw(orgUpdate)))
  tail.push(ctx.db.delete(schema.settings).where(like(schema.settings.key, `org:${snapshot.orgId}:%`)))
  for (const s of insertStatements('settings', snapshot.settings)) tail.push(ctx.db.run(sql.raw(s)))
  await ctx.db.batch(tail)
  statements += tail.length
  return { progress: { table, offset: 0 }, done: true, statements, label: 'Empresa y ajustes restaurados' }
}

/** Claves de R2 de la biblioteca de medios actual que no están en la instantánea: lo que subió alguien después. */
export async function visitorMediaKeys(db: any, orgId: number, snapshot: DemoSnapshot): Promise<string[]> {
  const kept = new Set<string>()
  const media = snapshot.tables.find((t) => t.name === 'media_assets')
  for (const row of media?.rows ?? []) if (typeof row.r2_key === 'string') kept.add(row.r2_key)
  const current: { k: string }[] = await db.select({ k: schema.mediaAssets.r2Key }).from(schema.mediaAssets).where(eq(schema.mediaAssets.organizationId, orgId))
  return current.map((r) => r.k).filter((k) => !kept.has(k))
}

export async function deleteMediaKeys(env: Record<string, any> | null | undefined, keys: string[]): Promise<number> {
  const bucket = bucketOf(env)
  if (!bucket || !keys.length) return 0
  for (let i = 0; i < keys.length; i += 500) await bucket.delete(keys.slice(i, i + 500))
  return keys.length
}
