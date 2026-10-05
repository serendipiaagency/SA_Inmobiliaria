import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../../server/db/schema'
import { createTestDb, seedTenant, type TenantFixture } from './helpers/tenantFixtures'
import {
  addTagToEntity,
  assertTagLinkScope,
  deleteEntityTagLinks,
  getOrCreateTagDb,
  listOrgTags,
  parseTagIds,
  tagLinksResourceGet,
  tagsByEntity,
  TAG_LINK_RESOURCES,
} from '../../server/utils/tags/service'
import { searchContacts } from '../../server/utils/contacts/service'
import { buildPropertyFilterConds } from '../../server/utils/properties/searchService'

/**
 * FASE 0 (bloque N7b) — Tag: antes sólo lo escribía la acción masiva; ahora
 * se ve, se añade y se quita a mano, se filtra por él, y los contactos se
 * pueden etiquetar. Lo que se prueba aquí es el servicio real contra el
 * esquema real, con dos agencias: un registro, una etiqueta o un enlace de
 * otra agencia es siempre un 404.
 */

const ts = '2026-01-01 00:00:00'
let db: any
let A: TenantFixture
let B: TenantFixture

beforeEach(async () => {
  ;({ db } = createTestDb())
  A = await seedTenant(db, 'TagAlpha')
  B = await seedTenant(db, 'TagBeta')
})

async function contact(orgId: number, name: string) {
  const [row] = await db.insert(schema.contacts).values({ organizationId: orgId, name, createdAt: ts, updatedAt: ts }).returning()
  return row
}
async function expectStatus(p: Promise<unknown>, status: number) {
  let err: any
  try {
    await p
  } catch (e) {
    err = e
  }
  expect(err, 'se esperaba un error').toBeDefined()
  expect(err.statusCode).toBe(status)
}

describe('etiquetar a mano', () => {
  it('los contactos se pueden etiquetar (antes no): por nombre, idempotente, y se ven en la ficha', async () => {
    const c = await contact(A.orgId, 'Marta')
    const crm = TAG_LINK_RESOURCES['crm-tags']!
    const first = await addTagToEntity(db, A.orgId, crm, { entityType: 'contact', entityId: c.id, name: '  Cliente VIP ' })
    expect(first.tag.name).toBe('Cliente VIP')
    const again = await addTagToEntity(db, A.orgId, crm, { entityType: 'contact', entityId: c.id, name: 'cliente vip' })
    expect(again.tag.id).toBe(first.tag.id)
    expect(again.tags).toHaveLength(1)
    const { rows } = await tagLinksResourceGet(db, A.orgId, 'crm-tags', { entityType: 'contact', entityId: c.id })
    expect(rows.map((r: any) => r.name)).toEqual(['Cliente VIP'])
    expect(rows[0].linkId).toBeGreaterThan(0)
  })

  it('por id de una etiqueta existente; leads y los dos catálogos de propiedades', async () => {
    const tag = await getOrCreateTagDb(db, A.orgId, 'Urgente')
    await addTagToEntity(db, A.orgId, TAG_LINK_RESOURCES['crm-tags']!, { entityType: 'lead', entityId: A.leadId, tagId: tag.id })
    await addTagToEntity(db, A.orgId, TAG_LINK_RESOURCES['property-tags']!, { entityType: 'agent', entityId: A.propertyId, tagId: tag.id })
    await addTagToEntity(db, A.orgId, TAG_LINK_RESOURCES['property-tags']!, { entityType: 'developer', entityId: A.projectId, name: 'Urgente' })
    const links = await db.select().from(schema.tagLinks).where(eq(schema.tagLinks.tagId, tag.id))
    expect(links.map((l: any) => l.entityType).sort()).toEqual(['agent', 'developer', 'lead'])
    const catalog = await listOrgTags(db, A.orgId, ['agent', 'developer'])
    expect(catalog).toEqual([expect.objectContaining({ name: 'Urgente', uses: 2 })])
  })

  it('quitar el enlace de un registro y borrar los de una propiedad eliminada definitivamente', async () => {
    const res = await addTagToEntity(db, A.orgId, TAG_LINK_RESOURCES['property-tags']!, { entityType: 'agent', entityId: A.propertyId, name: 'Reformar' })
    expect(res.tags).toHaveLength(1)
    await deleteEntityTagLinks(db, A.orgId, 'agent', A.propertyId)
    expect((await tagLinksResourceGet(db, A.orgId, 'property-tags', { entityType: 'agent', entityId: A.propertyId })).rows).toEqual([])
    // La etiqueta sigue en el catálogo: sólo se quitó el enlace.
    expect((await listOrgTags(db, A.orgId)).map((t: any) => t.name)).toEqual(['Reformar'])
  })

  it('nombre vacío o demasiado largo → 422', async () => {
    await expectStatus(addTagToEntity(db, A.orgId, ['lead'], { entityType: 'lead', entityId: A.leadId, name: '   ' }), 422)
    await expectStatus(addTagToEntity(db, A.orgId, ['lead'], { entityType: 'lead', entityId: A.leadId, name: 'x'.repeat(61) }), 422)
  })
})

describe('aislamiento entre agencias', () => {
  it('etiquetar un registro de otra agencia → 404 (contacto, lead y los dos catálogos), sin crear nada', async () => {
    const cB = await contact(B.orgId, 'De B')
    await expectStatus(addTagToEntity(db, A.orgId, ['contact', 'lead'], { entityType: 'contact', entityId: cB.id, name: 'Intruso' }), 404)
    await expectStatus(addTagToEntity(db, A.orgId, ['contact', 'lead'], { entityType: 'lead', entityId: B.leadId, name: 'Intruso' }), 404)
    await expectStatus(addTagToEntity(db, A.orgId, ['agent', 'developer'], { entityType: 'agent', entityId: B.propertyId, name: 'Intruso' }), 404)
    await expectStatus(addTagToEntity(db, A.orgId, ['agent', 'developer'], { entityType: 'developer', entityId: B.projectId, name: 'Intruso' }), 404)
    expect(await db.select().from(schema.tagLinks)).toEqual([])
    expect(await db.select().from(schema.tags)).toEqual([])
  })

  it('usar una etiqueta de otra agencia por su id → 404; leer las de un registro ajeno → 404', async () => {
    const tagB = await getOrCreateTagDb(db, B.orgId, 'Secreta de B')
    await expectStatus(addTagToEntity(db, A.orgId, ['lead'], { entityType: 'lead', entityId: A.leadId, tagId: tagB.id }), 404)
    await expectStatus(tagLinksResourceGet(db, A.orgId, 'crm-tags', { entityType: 'lead', entityId: B.leadId }), 404)
    expect((await listOrgTags(db, A.orgId)).map((t: any) => t.name)).toEqual([])
  })

  it('cada recurso sólo etiqueta sus entidades: un lead por el de propiedades (o al revés) → 404', async () => {
    await expectStatus(addTagToEntity(db, A.orgId, TAG_LINK_RESOURCES['property-tags']!, { entityType: 'lead', entityId: A.leadId, name: 'X' }), 404)
    await expectStatus(addTagToEntity(db, A.orgId, TAG_LINK_RESOURCES['crm-tags']!, { entityType: 'agent', entityId: A.propertyId, name: 'X' }), 404)
    expect(() => assertTagLinkScope('crm-tags', { entityType: 'agent' })).toThrow()
    expect(() => assertTagLinkScope('property-tags', { entityType: 'developer' })).not.toThrow()
  })

  it('las etiquetas de un listado salen en una sola consulta (más de 100 ids) y sólo las de la agencia', async () => {
    const tag = await getOrCreateTagDb(db, A.orgId, 'Lote')
    const tagB = await getOrCreateTagDb(db, B.orgId, 'Ajena')
    // Un enlace «cruzado» mal sembrado (organización B sobre un id de A): no debe aparecer en A.
    await db.insert(schema.tagLinks).values({ organizationId: B.orgId, tagId: tagB.id, entityType: 'lead', entityId: A.leadId, createdAt: ts })
    await db.insert(schema.tagLinks).values({ organizationId: A.orgId, tagId: tag.id, entityType: 'lead', entityId: A.leadId, createdAt: ts })
    const ids = [A.leadId, ...Array.from({ length: 150 }, (_, i) => 900000 + i)]
    const map = await tagsByEntity(db, A.orgId, 'lead', ids)
    expect(map.get(A.leadId)?.map((t) => t.name)).toEqual(['Lote'])
    expect(map.size).toBe(1)
  })
})

describe('filtrar por etiqueta', () => {
  it('contactos: sólo los que tienen TODAS las etiquetas pedidas', async () => {
    const c1 = await contact(A.orgId, 'Uno')
    const c2 = await contact(A.orgId, 'Dos')
    const crm = TAG_LINK_RESOURCES['crm-tags']!
    const vip = (await addTagToEntity(db, A.orgId, crm, { entityType: 'contact', entityId: c1.id, name: 'VIP' })).tag
    await addTagToEntity(db, A.orgId, crm, { entityType: 'contact', entityId: c2.id, name: 'VIP' })
    const inv = (await addTagToEntity(db, A.orgId, crm, { entityType: 'contact', entityId: c1.id, name: 'Inversor' })).tag
    expect((await searchContacts(db, A.orgId, '', 100, { tagIds: [vip.id] })).map((c: any) => c.name).sort()).toEqual(['Dos', 'Uno'])
    expect((await searchContacts(db, A.orgId, '', 100, { tagIds: [vip.id, inv.id] })).map((c: any) => c.name)).toEqual(['Uno'])
    // La etiqueta de A usada desde B no encuentra nada.
    expect(await searchContacts(db, B.orgId, '', 100, { tagIds: [vip.id] })).toEqual([])
  })

  it('propiedades (los dos catálogos) con el mismo filtro del listado', async () => {
    const tag = (await addTagToEntity(db, A.orgId, ['agent', 'developer'], { entityType: 'developer', entityId: A.projectId, name: 'Escaparate' })).tag
    const [other] = await db.insert(schema.developerProperties).values({ organizationId: A.orgId, developerId: A.developerId, name: 'Sin etiqueta', slug: 'sin-etiqueta', status: 'new', createdAt: ts, updatedAt: ts }).returning()
    const t = schema.developerProperties
    const rows = await db.select({ id: t.id }).from(t).where(and(eq(t.organizationId, A.orgId), ...buildPropertyFilterConds('developer', { tagIds: [tag.id] })))
    expect(rows.map((r: any) => r.id)).toEqual([A.projectId])
    expect(rows.map((r: any) => r.id)).not.toContain(other.id)
    const agentRows = await db.select({ id: schema.agentProperties.id }).from(schema.agentProperties).where(and(eq(schema.agentProperties.organizationId, A.orgId), ...buildPropertyFilterConds('agent', { tagIds: [tag.id] })))
    expect(agentRows).toEqual([])
  })

  it('parseTagIds: ids válidos, sin repetir y como mucho 10', () => {
    expect(parseTagIds('3, 7,3,abc,-1')).toEqual([3, 7])
    expect(parseTagIds(undefined)).toEqual([])
    expect(() => parseTagIds(Array.from({ length: 11 }, (_, i) => i + 1).join(','))).toThrow()
  })
})
