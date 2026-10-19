import { eq, like, sql } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { demoScopedTables, DEMO_ORG_SLUG } from '../../demo/purge'
import { DEMO_REGISTRATION_SOURCE } from '../demo/tenant'

/**
 * Eliminar una empresa del todo (super admin, desde «Empresas»).
 *
 * «Eliminar» es eliminar: se borran TODAS las filas de la empresa —sus
 * usuarios (así que sus correos quedan libres para volver a registrarse),
 * comerciales, contactos, propiedades, leads, ajustes…— y sus ficheros de R2,
 * y por último la propia fila de `organizations`. No queda nada que bloquee
 * un alta nueva con los mismos datos.
 *
 * Las tablas salen del propio esquema (las mismas que vacía el restablecido de
 * la demo, `demoScopedTables`), no de una lista a mano que se quedaría atrás:
 * cada tabla nueva con `organization_id` entra sola. Todo va en un único
 * batch (una transacción de D1): o se borra todo o no se borra nada.
 *
 * Se niega con la empresa de la plataforma (la 1) y con la cuenta demo, que
 * tiene su propio camino (restablecer / regenerar).
 */
export class OrganizationDeleteRefused extends Error {
  constructor(message: string, readonly statusCode = 422) {
    super(message)
  }
}

export async function assertDeletableOrganization(db: any, orgId: number): Promise<{ id: number; name: string; slug: string }> {
  const [org] = await db
    .select({ id: schema.organizations.id, name: schema.organizations.name, slug: schema.organizations.slug, registrationSource: schema.organizations.registrationSource })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, orgId))
    .limit(1)
  if (!org) throw new OrganizationDeleteRefused('La empresa no existe', 404)
  if (org.id === 1) throw new OrganizationDeleteRefused('La empresa de la plataforma no se puede eliminar')
  if (org.slug === DEMO_ORG_SLUG || org.registrationSource === DEMO_REGISTRATION_SOURCE) {
    throw new OrganizationDeleteRefused('La cuenta demo no se elimina: se restablece o se regenera desde su panel')
  }
  return org
}

export async function deleteOrganizationCompletely(db: any, env: Record<string, any> | null, orgId: number): Promise<{ statements: number; r2Deleted: number }> {
  await assertDeletableOrganization(db, orgId)

  // Ficheros de R2 de la empresa (biblioteca de medios), antes de perder el registro que los lista.
  let r2Deleted = 0
  const bucket = env?.MEDIA
  if (bucket?.delete) {
    const keys: string[] = (await db.select({ k: schema.mediaAssets.r2Key }).from(schema.mediaAssets).where(eq(schema.mediaAssets.organizationId, orgId))).map((r: { k: string }) => r.k)
    for (let i = 0; i < keys.length; i += 500) {
      await bucket.delete(keys.slice(i, i + 500))
      r2Deleted += Math.min(500, keys.length - i)
    }
  }

  const statements = [
    // D1 ejecuta el batch en una transacción: las claves foráneas se comprueban al final.
    db.run(sql`PRAGMA defer_foreign_keys = on`),
    ...demoScopedTables().map((t) => db.delete(t.table).where(t.where(orgId))),
    db.delete(schema.settings).where(like(schema.settings.key, `org:${orgId}:%`)),
    db.delete(schema.organizations).where(eq(schema.organizations.id, orgId)),
  ]
  await db.batch(statements)
  return { statements: statements.length, r2Deleted }
}
