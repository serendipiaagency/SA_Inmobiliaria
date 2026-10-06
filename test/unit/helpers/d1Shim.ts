import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'

const MIGRATIONS_DIR = join(import.meta.dirname, '../../../migrations')

/**
 * Un binding de D1 de mentira sobre SQLite en memoria (node:sqlite) con todas
 * las migraciones aplicadas. A diferencia de createTestDb() (drizzle
 * sqlite-proxy), aquí el código corre EXACTAMENTE como en el Worker:
 * `drizzle-orm/d1` sobre `env.DB`, `useDb(event)` y las consultas en crudo
 * (`env.DB.prepare(...).bind(...).first()`), con el mismo `batch`.
 *
 * Las filas «raw» salen como arrays (setReturnArrays): con joins, dos columnas
 * con el mismo nombre no se pisan, igual que en D1.
 */
export function createD1Shim() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
  }

  const norm = (v: unknown) => (typeof v === 'boolean' ? (v ? 1 : 0) : v === undefined ? null : v)

  class Statement {
    constructor(
      readonly sql: string,
      readonly params: unknown[] = [],
    ) {}
    bind(...params: unknown[]) {
      return new Statement(this.sql, params.map(norm))
    }
    private prepared(arrays = false) {
      const stmt = sqlite.prepare(this.sql)
      stmt.setReturnArrays(arrays)
      return stmt
    }
    async all() {
      return { results: this.prepared().all(...(this.params as any[])), success: true, meta: {} }
    }
    async first(column?: string) {
      const row = this.prepared().get(...(this.params as any[])) as Record<string, unknown> | undefined
      if (!row) return null
      return column ? (row[column] ?? null) : row
    }
    async run() {
      const stmt = this.prepared()
      // Un INSERT … RETURNING por run() también devuelve sus filas.
      if (/\breturning\b/i.test(this.sql)) return { results: stmt.all(...(this.params as any[])), success: true, meta: { changes: 1 } }
      const info = stmt.run(...(this.params as any[]))
      return { results: [], success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } }
    }
    async raw(opts?: { columnNames?: boolean }) {
      const stmt = this.prepared(true)
      const rows = stmt.all(...(this.params as any[])) as unknown as unknown[][]
      if (opts?.columnNames) return [stmt.columns().map((c) => c.name), ...rows]
      return rows
    }
  }

  const DB = {
    prepare: (sql: string) => new Statement(sql),
    async batch(statements: Statement[]) {
      const out = []
      sqlite.exec('BEGIN')
      try {
        for (const s of statements) out.push(/^\s*(select|with)\b/i.test(s.sql) || /\breturning\b/i.test(s.sql) ? await s.all() : await s.run())
        sqlite.exec('COMMIT')
      } catch (err) {
        sqlite.exec('ROLLBACK')
        throw err
      }
      return out
    },
    async exec(sql: string) {
      sqlite.exec(sql)
      return { count: 1, duration: 0 }
    },
    dump() {
      throw new Error('dump no soportado en el shim')
    },
  }
  return { DB, sqlite }
}

/** Un bucket de R2 en memoria con lo que usa la plataforma (put/get/head/delete/list). */
export function createR2Shim() {
  const objects = new Map<string, { bytes: Uint8Array; contentType?: string }>()
  const toBytes = async (v: any): Promise<Uint8Array> => {
    if (v instanceof Uint8Array) return v
    if (v instanceof ArrayBuffer) return new Uint8Array(v)
    if (typeof v === 'string') return new TextEncoder().encode(v)
    if (v?.arrayBuffer) return new Uint8Array(await v.arrayBuffer())
    return new Uint8Array(await new Response(v).arrayBuffer())
  }
  const objectOf = (key: string) => {
    const o = objects.get(key)
    if (!o) return null
    return {
      key,
      size: o.bytes.byteLength,
      httpMetadata: { contentType: o.contentType },
      arrayBuffer: async () => o.bytes.buffer.slice(o.bytes.byteOffset, o.bytes.byteOffset + o.bytes.byteLength),
      body: new Response(o.bytes as BodyInit).body,
    }
  }
  return {
    objects,
    async put(key: string, value: any, opts?: { httpMetadata?: { contentType?: string } }) {
      objects.set(key, { bytes: await toBytes(value), contentType: opts?.httpMetadata?.contentType })
      return { key }
    },
    async get(key: string) {
      return objectOf(key)
    },
    async head(key: string) {
      return objectOf(key)
    },
    async delete(keys: string | string[]) {
      for (const k of Array.isArray(keys) ? keys : [keys]) objects.delete(k)
    },
    async list(opts?: { prefix?: string }) {
      const keys = [...objects.keys()].filter((k) => !opts?.prefix || k.startsWith(opts.prefix))
      return { objects: keys.map((key) => ({ key, size: objects.get(key)!.bytes.byteLength })), truncated: false }
    },
  }
}
