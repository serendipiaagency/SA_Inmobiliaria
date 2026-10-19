import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { describe, expect, it } from 'vitest'
import * as schema from '../../server/db/schema'
import { deleteOrganizationCompletely, OrganizationDeleteRefused } from '../../server/utils/organizations/delete'
import { releaseUserReferences, usersReferenceColumns } from '../../server/utils/users/release'
import { provisionOrganization } from '../../server/utils/organizations/provisioning'
import { createD1Shim, createR2Shim } from './helpers/d1Shim'

const ts = '2026-01-01 00:00:00'

async function setup() {
  const { DB } = createD1Shim()
  const db = drizzle(DB as any, { schema })
  // La empresa 1 es la de la plataforma.
  await db.insert(schema.organizations).values({ name: 'Plataforma', slug: 'plataforma', status: 'active', createdAt: ts, updatedAt: ts })
  const make = (name: string, email: string) =>
    provisionOrganization(db, { source: 'self_service', organization: { name }, initialAdmin: { name: `${name} Admin`, email, password: 'una-clave-larga-1' } })
  return { db, make }
}

async function fill(db: any, orgId: number, n: string) {
  await db.insert(schema.contacts).values({ organizationId: orgId, name: `Cliente ${n}`, email: `cliente-${n}@x.test`, status: 'active', createdAt: ts, updatedAt: ts })
  await db.insert(schema.agents).values({ organizationId: orgId, name: `Comercial ${n}`, email: `comercial-${n}@x.test`, createdAt: ts, updatedAt: ts })
}

describe('eliminar una empresa la borra del todo', () => {
  it('sus usuarios, comerciales y contactos desaparecen, el correo queda libre y otra empresa no se toca', async () => {
    const { db, make } = await setup()
    const a = await make('Empresa Uno', 'dueno@prueba.test')
    const b = await make('Empresa Dos', 'otro@prueba.test')
    await fill(db, a.organization.id, 'a')
    await fill(db, b.organization.id, 'b')

    await deleteOrganizationCompletely(db, { MEDIA: createR2Shim() }, a.organization.id)

    expect(await db.select().from(schema.organizations).where(eq(schema.organizations.id, a.organization.id))).toHaveLength(0)
    expect(await db.select().from(schema.users).where(eq(schema.users.email, 'dueno@prueba.test'))).toHaveLength(0)
    expect(await db.select().from(schema.contacts).where(eq(schema.contacts.organizationId, a.organization.id))).toHaveLength(0)
    expect(await db.select().from(schema.agents).where(eq(schema.agents.organizationId, a.organization.id))).toHaveLength(0)
    // La otra empresa, intacta.
    expect(await db.select().from(schema.users).where(eq(schema.users.email, 'otro@prueba.test'))).toHaveLength(1)
    expect(await db.select().from(schema.contacts).where(eq(schema.contacts.organizationId, b.organization.id))).toHaveLength(1)
    expect(await db.select().from(schema.agents).where(eq(schema.agents.organizationId, b.organization.id))).toHaveLength(1)

    // Y el mismo correo se puede volver a registrar.
    const again = await make('Empresa Uno otra vez', 'dueno@prueba.test')
    expect(again.admin?.email).toBe('dueno@prueba.test')
  })

  it('borra también los ficheros de la empresa en R2', async () => {
    const { db, make } = await setup()
    const a = await make('Con ficheros', 'ficheros@prueba.test')
    const bucket = createR2Shim()
    await bucket.put('org/a/foto.jpg', new Uint8Array([1, 2, 3]))
    await db.insert(schema.mediaAssets).values({ organizationId: a.organization.id, r2Key: 'org/a/foto.jpg', mimeType: 'image/jpeg', extension: 'jpg', sizeBytes: 3, visibility: 'private', category: 'upload', createdAt: ts, updatedAt: ts } as any)
    const res = await deleteOrganizationCompletely(db, { MEDIA: bucket }, a.organization.id)
    expect(res.r2Deleted).toBe(1)
    expect(await bucket.get('org/a/foto.jpg')).toBeNull()
  })

  it('se niega con la empresa de la plataforma, con la demo y con una que no existe', async () => {
    const { db } = await setup()
    const [demo] = await db.insert(schema.organizations).values({ name: 'Norte Astur Inmobiliaria', slug: 'norte-astur-inmobiliaria', registrationSource: 'demo', status: 'active', createdAt: ts, updatedAt: ts }).returning()
    await expect(deleteOrganizationCompletely(db, null, 1)).rejects.toBeInstanceOf(OrganizationDeleteRefused)
    await expect(deleteOrganizationCompletely(db, null, demo.id)).rejects.toThrow(/demo/)
    await expect(deleteOrganizationCompletely(db, null, 999)).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('eliminar un usuario libera su correo aunque haya firmado cosas', () => {
  it('la autoría (cms_authors.user_id…) pasa a NULL, la fila se conserva y el usuario se puede borrar', async () => {
    const { db, make } = await setup()
    const a = await make('Con autoría', 'autor@prueba.test')
    const [u] = await db.select().from(schema.users).where(eq(schema.users.email, 'autor@prueba.test'))
    await db.insert(schema.cmsAuthors).values({ organizationId: a.organization.id, userId: u.id, name: 'Autor', slug: 'autor', createdAt: ts, updatedAt: ts } as any)
    expect(usersReferenceColumns().map((c) => `${c.tableName}.${c.column}`)).toContain('cms_authors.user_id')

    // Sin liberar, la clave foránea impide borrarlo (el viejo «ya está registrada» para siempre).
    await expect(db.delete(schema.users).where(eq(schema.users.id, u.id))).rejects.toBeTruthy()

    await releaseUserReferences(db, u.id)
    await db.delete(schema.users).where(eq(schema.users.id, u.id))
    expect(await db.select().from(schema.users).where(eq(schema.users.email, 'autor@prueba.test'))).toHaveLength(0)
    const [author] = await db.select().from(schema.cmsAuthors).where(eq(schema.cmsAuthors.organizationId, a.organization.id))
    expect(author).toMatchObject({ name: 'Autor', userId: null })
    // Y ese correo se puede registrar de nuevo.
    expect((await make('Otra vez', 'autor@prueba.test')).admin?.email).toBe('autor@prueba.test')
  })
})
