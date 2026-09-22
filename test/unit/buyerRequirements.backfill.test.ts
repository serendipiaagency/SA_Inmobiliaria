import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/**
 * El backfill de la migración 0066 corre una sola vez sobre datos reales de
 * producción, así que se prueba con SQLite de verdad y no con dobles: lo que
 * importa es exactamente lo que hace ese SQL.
 */
function migratedDb() {
  const db = new DatabaseSync(':memory:')
  // Sólo las tablas que el backfill toca, con las columnas que usa.
  db.exec(`
    CREATE TABLE leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      notes TEXT,
      contact_id INTEGER,
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      stage TEXT NOT NULL DEFAULT 'active',
      notes TEXT,
      contact_id INTEGER,
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );
  `)
  return db
}

/** El bloque de backfill de la migración, tal cual está en el archivo. */
function backfillSql(): string {
  const sql = readFileSync(join(process.cwd(), 'migrations/0066_buyer_requirements.sql'), 'utf8')
  const start = sql.indexOf('INSERT INTO contacts')
  expect(start).toBeGreaterThan(0)
  return sql.slice(start)
}

function schemaSql(): string {
  const sql = readFileSync(join(process.cwd(), 'migrations/0066_buyer_requirements.sql'), 'utf8')
  const end = sql.indexOf('INSERT INTO contacts')
  // Sin las ALTER TABLE sobre leads/clients: ya están en el CREATE de arriba.
  return sql
    .slice(0, end)
    .split(';')
    .filter((s) => !s.includes('ALTER TABLE leads') && !s.includes('ALTER TABLE clients'))
    .join(';')
}

function run(seed: (db: DatabaseSync) => void) {
  const db = migratedDb()
  db.exec(schemaSql())
  seed(db)
  db.exec(backfillSql())
  return db
}

describe('migración 0066 — backfill de contactos', () => {
  it('dos leads con el mismo email son una persona con dos oportunidades', () => {
    const db = run((d) => {
      d.exec(`INSERT INTO leads (organization_id, name, email) VALUES
        (1, 'María López', 'maria@example.com'),
        (1, 'M. Lopez', 'MARIA@Example.com ')`)
    })

    const contacts = db.prepare('SELECT COUNT(*) AS n FROM contacts').get() as { n: number }
    const distinct = db.prepare('SELECT COUNT(DISTINCT contact_id) AS n FROM leads').get() as { n: number }
    expect(contacts.n).toBe(1)
    expect(distinct.n).toBe(1)
  })

  it('el mismo teléfono escrito de otra forma también colapsa', () => {
    const db = run((d) => {
      d.exec(`INSERT INTO leads (organization_id, name, phone) VALUES
        (1, 'Juan', '+34 600 11 22 33'),
        (1, 'Juan P.', '+34-600-11-22-33')`)
    })
    expect((db.prepare('SELECT COUNT(*) AS n FROM contacts').get() as { n: number }).n).toBe(1)
  })

  it('dos leads anónimos con el mismo nombre NO se fusionan: son dos personas distintas', () => {
    // Sin email ni teléfono no hay ninguna señal de identidad. Emparejarlos
    // por nombre uniría a dos desconocidos y dejaría un contacto huérfano.
    const db = run((d) => {
      d.exec(`INSERT INTO leads (organization_id, name) VALUES (1, 'Juan Pérez'), (1, 'Juan Pérez')`)
    })

    const contacts = db.prepare('SELECT COUNT(*) AS n FROM contacts').get() as { n: number }
    const distinct = db.prepare('SELECT COUNT(DISTINCT contact_id) AS n FROM leads').get() as { n: number }
    expect(contacts.n).toBe(2)
    expect(distinct.n).toBe(2)
  })

  it('no deja contactos huérfanos ni filas sin enlazar', () => {
    const db = run((d) => {
      d.exec(`INSERT INTO clients (organization_id, name, email, phone) VALUES (1, 'Ana', 'ana@example.com', '+34600000001')`)
      d.exec(`INSERT INTO leads (organization_id, name, email, phone) VALUES
        (1, 'Ana R.', 'ana@example.com', NULL),
        (1, 'Sin datos', NULL, NULL),
        (1, 'Otro', 'otro@example.com', '+34600000002')`)
    })

    const orphans = db
      .prepare(`SELECT COUNT(*) AS n FROM contacts ct
        WHERE NOT EXISTS (SELECT 1 FROM leads l WHERE l.contact_id = ct.id)
          AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.contact_id = ct.id)`)
      .get() as { n: number }
    const unlinkedLeads = db.prepare('SELECT COUNT(*) AS n FROM leads WHERE contact_id IS NULL').get() as { n: number }
    const unlinkedClients = db.prepare('SELECT COUNT(*) AS n FROM clients WHERE contact_id IS NULL').get() as { n: number }

    expect(orphans.n).toBe(0)
    expect(unlinkedLeads.n).toBe(0)
    expect(unlinkedClients.n).toBe(0)
  })

  it('no cruza personas entre organizaciones distintas', () => {
    const db = run((d) => {
      d.exec(`INSERT INTO leads (organization_id, name, email) VALUES
        (1, 'María', 'maria@example.com'),
        (2, 'María', 'maria@example.com')`)
    })

    // El mismo email en dos agencias son dos fichas: una agencia no puede
    // llegar a deducir que la otra tiene a esa persona.
    expect((db.prepare('SELECT COUNT(*) AS n FROM contacts').get() as { n: number }).n).toBe(2)
  })

  it('no deja el marcador de migración en external_source', () => {
    const db = run((d) => {
      d.exec(`INSERT INTO leads (organization_id, name) VALUES (1, 'Sin datos')`)
    })
    const marked = db.prepare(`SELECT COUNT(*) AS n FROM contacts WHERE external_source IS NOT NULL`).get() as { n: number }
    expect(marked.n).toBe(0)
  })
})
