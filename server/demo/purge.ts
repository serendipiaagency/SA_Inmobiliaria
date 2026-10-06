import { eq, like, sql, type SQL } from 'drizzle-orm'
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core'
import * as schema from '../db/schema'
import { DEMO_REGISTRATION_SOURCE } from '../utils/demo/tenant'

/**
 * Vacía la empresa demo para volver a sembrarla: borra TODAS sus filas —las de
 * las tablas con `organization_id` y las de sus tablas hijas que no lo llevan
 * (sesiones de sus usuarios, revisiones de sus ofertas, vistas de sus
 * propiedades…)— y sus ficheros de R2. Conserva la fila de `organizations`,
 * así que el id de la empresa y sus enlaces no cambian.
 *
 * Sólo actúa sobre la empresa demo: se niega con cualquier otra (marca
 * `registration_source = 'demo'` y slug de la demo, y nunca la empresa 1).
 *
 * Las tablas salen del propio esquema (server/db/schema.ts), no de una lista
 * a mano que se quedaría atrás: cada tabla nueva con `organization_id` entra
 * sola. Las hijas sin esa columna se alcanzan por sus claves foráneas.
 */
export const DEMO_ORG_SLUG = 'norte-astur-inmobiliaria'

interface ScopedTable {
  name: string
  table: SQLiteTable
  /** Condición SQL que selecciona las filas de la empresa en esta tabla. */
  where: (orgId: number) => SQL
  /** Tablas de las que depende (sus padres), para borrar antes a las hijas. */
  parents: string[]
}

function allTables(): SQLiteTable[] {
  return (Object.values(schema) as unknown[]).filter((v): v is SQLiteTable => v instanceof SQLiteTable)
}

/** Las tablas con filas de una empresa y cómo encontrarlas, de hijas a padres. */
export function demoScopedTables(): ScopedTable[] {
  const tables = allTables()
  const configs = tables.map((t) => getTableConfig(t))
  const tableOf = new Map(configs.map((c, i) => [c.name, tables[i]]))
  const scoped = new Map<string, ScopedTable>()

  for (const cfg of configs) {
    if (cfg.name === 'organizations') continue
    if (cfg.columns.some((c) => c.name === 'organization_id')) {
      const parents = cfg.foreignKeys.map((fk) => getTableConfig(fk.reference().foreignTable).name).filter((p) => p !== cfg.name)
      scoped.set(cfg.name, { name: cfg.name, table: tableOf.get(cfg.name)!, where: (orgId) => sql`organization_id = ${orgId}`, parents })
    }
  }

  // Hijas sin organization_id: por su clave foránea hacia una tabla ya alcanzada.
  for (let depth = 0; depth < 4; depth++) {
    let added = false
    for (const cfg of configs) {
      if (scoped.has(cfg.name) || cfg.name === 'organizations') continue
      for (const fk of cfg.foreignKeys) {
        const ref = fk.reference()
        const parentName = getTableConfig(ref.foreignTable).name
        const parent = scoped.get(parentName)
        if (!parent || ref.columns.length !== 1) continue
        const col = ref.columns[0].name
        const parentCol = ref.foreignColumns[0].name
        scoped.set(cfg.name, {
          name: cfg.name,
          table: tableOf.get(cfg.name)!,
          where: (orgId) => sql`${sql.identifier(col)} IN (SELECT ${sql.identifier(parentCol)} FROM ${sql.identifier(parentName)} WHERE ${parent.where(orgId)})`,
          parents: [parentName],
        })
        added = true
        break
      }
    }
    if (!added) break
  }

  // Orden: una tabla va antes que cualquiera de sus padres (las hijas primero).
  const ordered: ScopedTable[] = []
  const visiting = new Set<string>()
  const done = new Set<string>()
  const children = new Map<string, string[]>()
  for (const t of scoped.values()) for (const p of t.parents) if (scoped.has(p)) children.set(p, [...(children.get(p) || []), t.name])
  function visit(name: string) {
    if (done.has(name) || visiting.has(name)) return
    visiting.add(name)
    for (const child of children.get(name) || []) visit(child)
    visiting.delete(name)
    done.add(name)
    ordered.push(scoped.get(name)!)
  }
  for (const name of [...scoped.keys()].sort()) visit(name)
  return ordered
}

export class DemoPurgeRefused extends Error {}

/** Comprueba que `orgId` es de verdad la empresa demo. Lanza si no. */
export async function assertDemoOrganization(db: any, orgId: number): Promise<void> {
  const [org] = await db
    .select({ id: schema.organizations.id, slug: schema.organizations.slug, registrationSource: schema.organizations.registrationSource })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, orgId))
    .limit(1)
  if (!org || org.id === 1 || org.slug !== DEMO_ORG_SLUG || org.registrationSource !== DEMO_REGISTRATION_SOURCE) {
    throw new DemoPurgeRefused(`La empresa ${orgId} no es la cuenta demo: no se borra nada.`)
  }
}

/** Borra los datos de la empresa demo (no la empresa). Devuelve cuántas sentencias ejecutó. */
export async function purgeDemoTenant(db: any, env: Record<string, any> | null, orgId: number): Promise<{ statements: number; r2Deleted: number }> {
  await assertDemoOrganization(db, orgId)

  // Ficheros de R2 de la empresa (los de la biblioteca de medios: todo lo que
  // sube el seed y lo que se haya subido durante una demo).
  let r2Deleted = 0
  const bucket = env?.MEDIA
  if (bucket?.delete) {
    const keys: string[] = (await db.select({ k: schema.mediaAssets.r2Key }).from(schema.mediaAssets).where(eq(schema.mediaAssets.organizationId, orgId))).map((r: { k: string }) => r.k)
    for (let i = 0; i < keys.length; i += 500) {
      await bucket.delete(keys.slice(i, i + 500))
      r2Deleted += Math.min(500, keys.length - i)
    }
  }

  const tables = demoScopedTables()
  const statements = [
    // D1 ejecuta el batch en una transacción: las claves foráneas se comprueban al final.
    db.run(sql`PRAGMA defer_foreign_keys = on`),
    // Con el constructor de consultas (no `db.run` con parámetros, que el batch de D1 no admite).
    ...tables.map((t) => db.delete(t.table).where(t.where(orgId))),
    db.delete(schema.settings).where(like(schema.settings.key, `org:${orgId}:%`)),
    db.update(schema.organizations).set({ storageBytesUsed: 0 }).where(eq(schema.organizations.id, orgId)),
  ]
  await db.batch(statements)
  return { statements: statements.length, r2Deleted }
}
