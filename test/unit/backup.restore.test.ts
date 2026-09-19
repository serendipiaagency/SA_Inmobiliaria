import { describe, expect, it } from 'vitest'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'
import * as schema from '../../server/db/schema'
import { buildBackupStream } from '../../server/utils/backup'
import { buildRestoreStatements, countInsertsPerTable, dropOrder, EPHEMERAL_TABLES, reorderExportForImport, splitSqlStatements, sqlLiteral } from '../../scripts/restore-d1-backup.mjs'

/**
 * La copia de seguridad diaria tenía un solo lado: se hacía cada noche y
 * nunca se había restaurado. Esto cierra el círculo con el mismo código que
 * corre en producción a las dos puntas: buildBackupStream() genera la
 * instantánea (idéntica a la que sube a R2, sin comprimir) y
 * buildRestoreStatements() —lo que ejecuta scripts/restore-d1-backup.mjs—
 * la vuelve a meter en una base recién migrada. Después se compara tabla
 * por tabla y fila por fila, no por recuento.
 */

function fakeD1(sqlite: any): any {
  return {
    prepare(sql: string) {
      return {
        bind(...params: any[]) {
          return { all: async () => ({ results: sqlite.prepare(sql).all(...params) }) }
        },
        all: async () => ({ results: sqlite.prepare(sql).all() }),
      }
    },
  }
}

function allTables(sqlite: any): string[] {
  return sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations' ORDER BY name")
    .all()
    .map((r: any) => r.name)
}

async function snapshotOf(sqlite: any, tables: string[]) {
  const text = await new Response(buildBackupStream(fakeD1(sqlite), tables, 7, { totalRows: 0 })).text()
  return JSON.parse(text)
}

/** Ejecuta las sentencias como lo haría `wrangler d1 execute --file`: en una sola transacción. */
function applyStatements(sqlite: any, statements: string[]) {
  sqlite.exec('BEGIN')
  try {
    for (const s of statements) sqlite.exec(s)
    sqlite.exec('COMMIT')
  } catch (err) {
    sqlite.exec('ROLLBACK')
    throw err
  }
}

function rowsOf(sqlite: any, table: string): any[] {
  return sqlite.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all()
}

describe('restauración de una instantánea diaria', () => {
  it('copia → restaura en una base vacía → cada tabla queda idéntica, fila a fila', async () => {
    const source = createTestDb()
    await seedTenant(source.db, 'RestoreA')
    const b = await seedTenant(source.db, 'RestoreB')
    // Más filas que el tamaño de página de la copia (7) y más que un lote de
    // INSERT del restaurador (50): así se ejercitan las dos particiones.
    for (let i = 0; i < 120; i++) {
      await source.db.insert(schema.leads).values({ organizationId: b.orgId, name: `Lead ${i}`, source: 'web', status: 'new', score: i, createdAt: '2026-01-01 00:00:00', updatedAt: '2026-01-01 00:00:00' })
    }

    const tables = allTables(source.sqlite)
    const snapshot = await snapshotOf(source.sqlite, tables)
    const { statements, expected } = buildRestoreStatements(snapshot, { includeEphemeral: true })

    const target = createTestDb() // migrada, vacía
    applyStatements(target.sqlite, statements)

    for (const table of tables) {
      const original = rowsOf(source.sqlite, table)
      const restored = rowsOf(target.sqlite, table)
      expect(restored, table).toEqual(original)
      expect(expected[table], table).toBe(original.length)
    }
    expect(rowsOf(target.sqlite, 'leads').length).toBeGreaterThan(120)
  })

  it('restaurar sobre una base con datos distintos deja exactamente lo de la instantánea (no suma)', async () => {
    const source = createTestDb()
    await seedTenant(source.db, 'RestoreOver')
    const snapshot = await snapshotOf(source.sqlite, ['organizations', 'users', 'leads'])

    // Una base "recién migrada" no está vacía: las migraciones siembran la
    // organización por defecto y la de demostración. Lo que importa es que
    // haya datos distintos de los de la instantánea antes de restaurar.
    const target = createTestDb()
    const seededByMigrations = rowsOf(target.sqlite, 'organizations').length
    await seedTenant(target.db, 'Basura1')
    await seedTenant(target.db, 'Basura2')
    expect(rowsOf(target.sqlite, 'organizations').length).toBe(seededByMigrations + 2)

    // FK de users→organizations: el DELETE de organizations con usuarios
    // colgando sólo pasa porque las claves foráneas quedan diferidas.
    const { statements } = buildRestoreStatements(snapshot, { tables: ['organizations', 'users', 'leads'] })
    applyStatements(target.sqlite, statements)

    expect(rowsOf(target.sqlite, 'organizations')).toEqual(rowsOf(source.sqlite, 'organizations'))
    expect(rowsOf(target.sqlite, 'users')).toEqual(rowsOf(source.sqlite, 'users'))
    expect(rowsOf(target.sqlite, 'leads')).toEqual(rowsOf(source.sqlite, 'leads'))
  })

  it('es idempotente: restaurar dos veces da el mismo resultado', async () => {
    const source = createTestDb()
    await seedTenant(source.db, 'RestoreTwice')
    const snapshot = await snapshotOf(source.sqlite, ['organizations', 'leads'])
    const { statements } = buildRestoreStatements(snapshot, { tables: ['organizations', 'leads'] })

    const target = createTestDb()
    applyStatements(target.sqlite, statements)
    applyStatements(target.sqlite, statements)
    expect(rowsOf(target.sqlite, 'leads')).toEqual(rowsOf(source.sqlite, 'leads'))
  })

  it('los valores difíciles sobreviven al viaje: comillas, saltos de línea, unicode, NULL y JSON', async () => {
    const source = createTestDb()
    const a = await seedTenant(source.db, 'RestoreEscapes')
    await source.db.insert(schema.leads).values({
      organizationId: a.orgId,
      name: `O'Brien "el raro"\nsegunda línea — ñ 🏠 \\ backslash`,
      email: null,
      source: 'web',
      status: 'new',
      score: 0,
      notes: JSON.stringify({ tags: ["it's", 'json'], n: 1.5 }),
      createdAt: '2026-01-01 00:00:00',
      updatedAt: '2026-01-01 00:00:00',
    })
    const snapshot = await snapshotOf(source.sqlite, ['organizations', 'leads'])
    const target = createTestDb()
    applyStatements(target.sqlite, buildRestoreStatements(snapshot, { tables: ['organizations', 'leads'] }).statements)
    expect(rowsOf(target.sqlite, 'leads')).toEqual(rowsOf(source.sqlite, 'leads'))
  })

  it('las tablas efímeras y sensibles no se restauran salvo que se pida', async () => {
    const source = createTestDb()
    const a = await seedTenant(source.db, 'RestoreEphemeral')
    await source.db.insert(schema.sessions).values({ id: 'sess-1', tokenHash: 'h', userId: a.userId, expiresAt: '2099-01-01T00:00:00.000Z', createdAt: '2026-01-01 00:00:00' })
    const snapshot = await snapshotOf(source.sqlite, ['organizations', 'users', 'sessions'])

    const byDefault = buildRestoreStatements(snapshot)
    expect(byDefault.skipped).toEqual(['sessions'])
    expect(byDefault.expected).not.toHaveProperty('sessions')
    expect(byDefault.statements.join('\n')).not.toContain('"sessions"')

    const forced = buildRestoreStatements(snapshot, { includeEphemeral: true })
    expect(forced.expected.sessions).toBe(1)
    // La lista de efímeras es una decisión escrita, no una casualidad.
    expect(EPHEMERAL_TABLES).toEqual(['sessions', 'rate_limits', 'password_reset_tokens'])
  })

  it('rechaza nombres que no sean identificadores simples y tablas pedidas que no están', () => {
    expect(() => buildRestoreStatements({ takenAt: 'x', tables: { 'leads"; DROP TABLE users; --': [] } })).toThrow(/Nombre de tabla inesperado/)
    expect(() => buildRestoreStatements({ takenAt: 'x', tables: { leads: [{ 'a b': 1 }] } })).toThrow(/Nombre de columna inesperado/)
    expect(() => buildRestoreStatements({ takenAt: 'x', tables: { leads: [] } }, { tables: ['clients'] })).toThrow(/no está en la instantánea/)
    expect(() => buildRestoreStatements({ nope: true })).toThrow(/forma esperada/)
  })

  it('sqlLiteral escapa como SQLite espera', () => {
    expect(sqlLiteral(null)).toBe('NULL')
    expect(sqlLiteral(undefined)).toBe('NULL')
    expect(sqlLiteral(42)).toBe('42')
    expect(sqlLiteral(1.5)).toBe('1.5')
    expect(sqlLiteral(true)).toBe('1')
    expect(sqlLiteral("it's")).toBe("'it''s'")
    expect(() => sqlLiteral(Number.NaN)).toThrow()
  })
})

/**
 * El otro formato: el `.sql` de `wrangler d1 export` (el backup
 * pre-despliegue del pipeline). Comprobado en local que ese fichero no se
 * puede importar tal cual: va tabla a tabla en el orden de sqlite_master, y
 * una tabla hija puede ir —y va— antes que su padre, así que con las claves
 * foráneas activas el primer INSERT hijo falla con "no such table". Esto
 * prueba la reordenación que lo arregla contra un SQLite real con claves
 * foráneas activas.
 */
describe('restauración de un volcado de wrangler d1 export', () => {
  // Un volcado mínimo con la misma forma que el real: PRAGMA inicial, cada
  // tabla con sus INSERT justo después, la hija ANTES que el padre, y los
  // índices al final. Con un literal difícil dentro.
  const EXPORT = `PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE IF NOT EXISTS "floor_plans" (
  id INTEGER PRIMARY KEY,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  label TEXT
);
INSERT INTO "floor_plans" ("id","property_id","label") VALUES(1,1,'planta baja; con ''patio''
y segunda línea');
INSERT INTO "floor_plans" ("id","property_id","label") VALUES(2,1,'ático');
CREATE TABLE IF NOT EXISTS "properties" (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);
INSERT INTO "properties" ("id","name") VALUES(1,'Casa');
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('properties',1);
CREATE INDEX floor_plans_property ON floor_plans (property_id);
`

  it('el volcado tal cual falla en un SQLite con claves foráneas (el motivo de todo esto)', async () => {
    const { DatabaseSync } = await import('node:sqlite')
    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec('PRAGMA foreign_keys = ON')
    sqlite.exec('BEGIN')
    expect(() => {
      for (const s of splitSqlStatements(EXPORT)) sqlite.exec(s)
    }).toThrow(/no such table: main\.properties/)
    sqlite.exec('ROLLBACK')
  })

  it('reordenado (tablas, luego filas, luego índices) se importa entero y los literales sobreviven', async () => {
    const { DatabaseSync } = await import('node:sqlite')
    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec('PRAGMA foreign_keys = ON')
    const statements = reorderExportForImport(EXPORT)
    expect(statements.map((s) => s.split(/\s+/).slice(0, 2).join(' '))).toEqual([
      'PRAGMA defer_foreign_keys=TRUE;',
      'CREATE TABLE',
      'CREATE TABLE',
      'INSERT INTO',
      'INSERT INTO',
      'INSERT INTO',
      'CREATE INDEX',
    ])
    sqlite.exec('BEGIN')
    for (const s of statements) sqlite.exec(s)
    sqlite.exec('COMMIT')
    expect(sqlite.prepare('SELECT label FROM floor_plans ORDER BY id').all().map((r: any) => r.label)).toEqual(["planta baja; con 'patio'\ny segunda línea", 'ático'])
    // La tabla interna de AUTOINCREMENT ni se importa ni se cuenta.
    expect(statements.join('\n')).not.toContain('sqlite_sequence')
    expect(countInsertsPerTable(EXPORT)).toEqual({ floor_plans: 2, properties: 1 })
  })

  it('el orden de borrado pone cada tabla antes que las que referencia', () => {
    // hijos → padres: floor_plans referencia properties; properties referencia organizations.
    const order = dropOrder({ organizations: [], properties: ['organizations'], floor_plans: ['properties'], self_ref: ['self_ref'] })
    expect(order.indexOf('floor_plans')).toBeLessThan(order.indexOf('properties'))
    expect(order.indexOf('properties')).toBeLessThan(order.indexOf('organizations'))
    expect(order).toHaveLength(4)
  })

  it('sqlLiteral escapa como SQLite espera (repetido a propósito: es lo que separa una restauración de una corrupción)', () => {
    expect(sqlLiteral(null)).toBe('NULL')
    expect(sqlLiteral(undefined)).toBe('NULL')
    expect(sqlLiteral(42)).toBe('42')
    expect(sqlLiteral(1.5)).toBe('1.5')
    expect(sqlLiteral(true)).toBe('1')
    expect(sqlLiteral("it's")).toBe("'it''s'")
    expect(() => sqlLiteral(Number.NaN)).toThrow()
  })
})
