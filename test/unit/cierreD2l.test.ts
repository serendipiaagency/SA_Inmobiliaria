import { and, eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { createError } from 'h3'
import * as schema from '../../server/db/schema'
import { createTestDb, seedTenant, type TenantFixture } from './helpers/tenantFixtures'

/**
 * Cierre del núcleo, bloque D2L (leads, pipeline, deduplicación de contactos
 * y enrutado), sobre una SQLite real con las migraciones reales (incluida la
 * 0089, `leads.property_kind`):
 *
 *  - el catálogo de la propiedad del lead: alta, edición, validación (ajena
 *    404, papelera 422), la ficha con su enlace, el enrutado con el MISMO id
 *    en los dos catálogos y los leads antiguos sin catálogo (NULL);
 *  - el motivo obligatorio en cada movimiento del panel y en la acción
 *    masiva, sin romper las entradas automáticas;
 *  - «Unificar» al dar de alta un contacto: completa sin pisar, nunca crea
 *    un duplicado cruzado, queda en Activity y no cruza de agencia;
 *  - el idioma desde la captación (formularios públicos y API v1) y que la
 *    regla «Idioma» enruta esos leads;
 *  - el selector de contacto del formulario del lead.
 */
vi.mock('../../server/utils/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/utils/db')>()
  return { ...actual, useDb: (event: any) => event.context.db }
})
vi.mock('../../server/utils/audit', () => ({ logAdminAction: vi.fn() }))
vi.mock('../../server/utils/rateLimit', () => ({ rateLimit: vi.fn(async () => undefined) }))
// Los endpoints se prueban llamando a su handler: la sesión (o la clave de API) la pone la prueba.
vi.mock('../../server/utils/auth', () => ({
  requireOrgScope: async (event: any) => ({ user: event.context.user, orgId: event.context.orgId }),
}))
vi.mock('../../server/utils/apiAuth', () => ({
  requireApiKey: async (event: any) => ({ orgId: event.context.orgId }),
}))

// Globales que Nitro inyecta en los handlers de server/api.
vi.stubGlobal('defineEventHandler', (fn: any) => fn)
vi.stubGlobal('createError', createError)
vi.stubGlobal('getQuery', (event: any) => event.context.query || {})
vi.stubGlobal('readBody', async (event: any) => event.context.body)
vi.stubGlobal('getRouterParam', (event: any, key: string) => event.context.params?.[key])
vi.stubGlobal('getCookie', (event: any, name: string) => event.context.cookies?.[name])

const ts = '2026-01-01 00:00:00'
let seq = 0

const userOf = (f: TenantFixture) => ({ id: f.userId, role: 'admin', email: 'admin@example.com', permissions: null, organizationId: f.orgId }) as any
/** Evento falso: base, sesión, cuerpo, parámetros, cookies y cabeceras (para el h3 real de getCookie/getRequestHeader). */
function ev(db: any, f?: TenantFixture, extra: { body?: any; query?: any; params?: any; cookies?: Record<string, string> } = {}) {
  const cookie = Object.entries(extra.cookies || {})
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
  // Algunos utils usan el getQuery real de h3 (lee la URL), no el global.
  const url = `/api/test${extra.query ? `?${new URLSearchParams(extra.query).toString()}` : ''}`
  return {
    context: { db, orgId: f?.orgId, org: f ? { id: f.orgId } : undefined, user: f ? userOf(f) : undefined, ...extra },
    path: url,
    method: 'POST',
    // …y el readBody real de h3 (el chat de la web lo importa de h3).
    _requestBody: extra.body ? JSON.stringify(extra.body) : undefined,
    node: { req: { url, method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) } } },
    headers: new Headers(cookie ? { cookie } : {}),
  } as any
}

async function commercial(db: any, orgId: number, name = `Comercial ${++seq}`) {
  seq += 1
  const [row] = await db
    .insert(schema.teamMembers)
    .values({ organizationId: orgId, name, slug: `d2l-comercial-${seq}`, email: `d2l-comercial-${seq}@example.com`, position: 'Comercial', createdAt: ts, updatedAt: ts })
    .returning()
  return row
}
async function rule(db: any, orgId: number, input: Partial<typeof schema.leadRoutingRules.$inferInsert> & { name: string; scope: string }) {
  const [row] = await db
    .insert(schema.leadRoutingRules)
    .values({ organizationId: orgId, priority: 0, strategy: 'round_robin', enabled: 1, createdAt: ts, updatedAt: ts, ...input })
    .returning()
  return row
}
async function contact(db: any, orgId: number, over: Partial<typeof schema.contacts.$inferInsert> = {}) {
  const [row] = await db
    .insert(schema.contacts)
    .values({ organizationId: orgId, name: `Contacto ${++seq}`, status: 'active', createdAt: ts, updatedAt: ts, ...over })
    .returning()
  return row
}
async function lead(db: any, orgId: number, over: Partial<typeof schema.leads.$inferInsert> = {}) {
  const [row] = await db
    .insert(schema.leads)
    .values({ organizationId: orgId, name: `Lead ${++seq}`, source: 'web', status: 'new', stage: 'new', score: 0, createdAt: ts, updatedAt: ts, ...over })
    .returning()
  return row
}
async function loadLead(db: any, id: number) {
  return (await db.select().from(schema.leads).where(eq(schema.leads.id, id)))[0]
}

/**
 * El MISMO id en los dos catálogos de una agencia (las dos tablas tienen
 * secuencias independientes, así que en la vida real pasa en cuanto hay unas
 * cuantas propiedades): un piso de 2ª mano en Chamberí con su comercial y una
 * promoción de obra nueva en Marbella con otro.
 */
async function twinProperties(db: any, f: TenantFixture, id: number) {
  const agentOwner = await commercial(db, f.orgId, 'Responsable 2ª mano')
  const devOwner = await commercial(db, f.orgId, 'Responsable obra nueva')
  await db.insert(schema.agentProperties).values({
    id,
    organizationId: f.orgId,
    slug: `d2l-piso-${id}-${f.orgId}`,
    location: 'Madrid',
    district: 'Chamberí',
    city: 'Madrid',
    propertyType: 'Apartment',
    reference: `REF-${id}`,
    price: 300_000,
    status: 'available',
    agentId: agentOwner.id,
    createdAt: ts,
    updatedAt: ts,
  })
  await db.insert(schema.developerProperties).values({
    id,
    organizationId: f.orgId,
    developerId: f.developerId,
    name: `Residencial Marbella ${id}`,
    slug: `d2l-promo-${id}-${f.orgId}`,
    status: 'new',
    price: 500_000,
    area: 90,
    community: 'Marbella',
    district: 'Nueva Andalucía',
    city: 'Marbella',
    propertyType: 'Villa',
    agentId: devOwner.id,
    createdAt: ts,
    updatedAt: ts,
  })
  return { agentOwner, devOwner }
}

// ---------------------------------------------------------------------------
// 1. Catálogo de la propiedad del lead
// ---------------------------------------------------------------------------

describe('catálogo de la propiedad del lead (migración 0089)', () => {
  it('el alta guarda la propiedad con su catálogo; sin catálogo 422, de otra agencia 404, en la papelera 422', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D2lCatA')
    const b = await seedTenant(db, 'D2lCatB')
    await twinProperties(db, a, 7001)
    const { createLeadFromAdmin } = await import('../../server/utils/leads/admin')
    const create = (body: any) => createLeadFromAdmin(ev(db, a), a.orgId, userOf(a), { source: 'call', ...body })

    const dev = await create({ name: 'Obra nueva', email: 'obra.nueva@d2l.test', propertyId: 7001, propertyKind: 'developer' })
    expect(await loadLead(db, dev.id)).toMatchObject({ propertyId: 7001, propertyKind: 'developer', propertyName: 'Residencial Marbella 7001' })
    const agent = await create({ name: 'Segunda mano', email: 'segunda.mano@d2l.test', propertyId: 7001, propertyKind: 'agent' })
    expect(await loadLead(db, agent.id)).toMatchObject({ propertyId: 7001, propertyKind: 'agent', propertyName: 'REF-7001' })

    await expect(create({ name: 'Sin catálogo', email: 'sin.catalogo@d2l.test', propertyId: 7001 })).rejects.toMatchObject({ statusCode: 422 })
    await expect(create({ name: 'Ajena', email: 'ajena@d2l.test', propertyId: b.projectId, propertyKind: 'developer' })).rejects.toMatchObject({ statusCode: 404 })
    await db.update(schema.developerProperties).set({ deletedAt: ts }).where(eq(schema.developerProperties.id, 7001))
    await expect(create({ name: 'Papelera', email: 'papelera@d2l.test', propertyId: 7001, propertyKind: 'developer' })).rejects.toMatchObject({ statusCode: 422, statusMessage: expect.stringMatching(/papelera/) })
  })

  it('la edición cambia de catálogo, quitarla deja los dos campos vacíos y la misma propiedad (ya en la papelera) no se revalida', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D2lEditCat')
    await twinProperties(db, a, 7002)
    const { updateLeadFromAdmin } = await import('../../server/utils/leads/admin')
    const l = await lead(db, a.orgId, { propertyId: 7002, propertyKind: 'agent', propertyName: 'REF-7002' })

    await updateLeadFromAdmin(ev(db, a), a.orgId, userOf(a), l.id, { propertyId: 7002, propertyKind: 'developer' })
    expect(await loadLead(db, l.id)).toMatchObject({ propertyId: 7002, propertyKind: 'developer', propertyName: 'Residencial Marbella 7002' })

    // La misma propiedad, aunque después se mandara a la papelera: se puede seguir editando el resto.
    await db.update(schema.developerProperties).set({ deletedAt: ts }).where(eq(schema.developerProperties.id, 7002))
    await updateLeadFromAdmin(ev(db, a), a.orgId, userOf(a), l.id, { propertyId: 7002, propertyKind: 'developer', notes: 'Sigue interesado' })
    expect(await loadLead(db, l.id)).toMatchObject({ propertyKind: 'developer', notes: 'Sigue interesado' })
    // Pero no se puede volver a elegir desde otro catálogo… ni elegirla de nuevo una vez quitada.
    await updateLeadFromAdmin(ev(db, a), a.orgId, userOf(a), l.id, { propertyId: null, propertyKind: null })
    expect(await loadLead(db, l.id)).toMatchObject({ propertyId: null, propertyKind: null, propertyName: null })
    await expect(updateLeadFromAdmin(ev(db, a), a.orgId, userOf(a), l.id, { propertyId: 7002, propertyKind: 'developer' })).rejects.toMatchObject({ statusCode: 422 })
    // Un catálogo suelto, sin id, no cambia nada.
    await updateLeadFromAdmin(ev(db, a), a.orgId, userOf(a), l.id, { propertyKind: 'agent' })
    expect((await loadLead(db, l.id)).propertyKind).toBeNull()
  })

  it('la ficha trae la propiedad con su catálogo y su enlace; un lead antiguo sin catálogo se deduce como siempre y lo dice', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D2lFicha')
    await twinProperties(db, a, 7003)
    const { getLeadDetail } = await import('../../server/utils/leads/admin')

    const nuevo = await lead(db, a.orgId, { propertyId: 7003, propertyKind: 'developer' })
    expect((await getLeadDetail(ev(db, a), a.orgId, nuevo.id)).property).toMatchObject({
      id: 7003,
      kind: 'developer',
      name: 'Residencial Marbella 7003',
      inferred: false,
      adminPath: '/admin/developer-properties/7003',
    })
    // NULL (fila anterior a la 0089): la resolución heredada, primero 2ª mano.
    const antiguo = await lead(db, a.orgId, { propertyId: 7003, propertyKind: null })
    expect((await getLeadDetail(ev(db, a), a.orgId, antiguo.id)).property).toMatchObject({ id: 7003, kind: 'agent', inferred: true, adminPath: '/admin/properties/7003' })
  })

  it('enrutado con el mismo id en los dos catálogos: con catálogo manda el suyo; con NULL, la resolución heredada (2ª mano primero)', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D2lRoute')
    const { agentOwner, devOwner } = await twinProperties(db, a, 7004)
    await rule(db, a.orgId, { name: 'Responsable de la propiedad', scope: 'property', priority: 0 })
    const { upsertLead } = await import('../../server/utils/leads')

    const devLead = await upsertLead(ev(db), { organizationId: a.orgId, name: 'Web obra nueva', email: 'route.dev@d2l.test', source: 'web', propertyId: 7004, propertyKind: 'developer' })
    expect(await loadLead(db, devLead.id)).toMatchObject({ propertyKind: 'developer', agentId: devOwner.id })

    const legacyLead = await upsertLead(ev(db), { organizationId: a.orgId, name: 'Sin catálogo', email: 'route.legacy@d2l.test', source: 'web', propertyId: 7004 })
    expect(await loadLead(db, legacyLead.id)).toMatchObject({ propertyKind: null, agentId: agentOwner.id })

    // El contexto (zona, tipo, obra nueva) también sale del catálogo correcto.
    const { buildRoutingContextFromProperty } = await import('../../server/utils/leads/routing')
    expect(await buildRoutingContextFromProperty(ev(db), a.orgId, 7004, 'developer')).toMatchObject({ propertyKind: 'developer', city: 'Marbella', propertyType: 'Villa', isNewBuild: true })
    expect(await buildRoutingContextFromProperty(ev(db), a.orgId, 7004, null)).toMatchObject({ propertyKind: 'agent', city: 'Madrid', isNewBuild: false })
    // Con catálogo explícito no se cae al otro: una de obra nueva en la papelera no aporta contexto.
    await db.update(schema.developerProperties).set({ deletedAt: ts }).where(eq(schema.developerProperties.id, 7004))
    expect(await buildRoutingContextFromProperty(ev(db), a.orgId, 7004, 'developer')).toEqual({})
  })

  it('la regla «Zona» y la de obra nueva aplican al catálogo del lead, no al primero que tenga ese id', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D2lZone')
    await twinProperties(db, a, 7005)
    const marbella = await commercial(db, a.orgId, 'Costa del Sol')
    await rule(db, a.orgId, { name: 'Marbella', scope: 'zone', matchValue: 'Marbella', targetCommercialId: marbella.id, priority: 0 })
    const { upsertLead } = await import('../../server/utils/leads')

    const dev = await upsertLead(ev(db), { organizationId: a.orgId, name: 'Zona dev', email: 'zone.dev@d2l.test', source: 'web', propertyId: 7005, propertyKind: 'developer' })
    expect((await loadLead(db, dev.id)).agentId).toBe(marbella.id)
    const legacy = await upsertLead(ev(db), { organizationId: a.orgId, name: 'Zona legacy', email: 'zone.legacy@d2l.test', source: 'web', propertyId: 7005 })
    expect((await loadLead(db, legacy.id)).agentId).toBeNull()
  })

  it('reutilizar un lead con una propiedad nueva cambia también su catálogo (nunca un id nuevo con el catálogo del anterior)', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D2lReuse')
    await twinProperties(db, a, 7006)
    const { upsertLead } = await import('../../server/utils/leads')
    const first = await upsertLead(ev(db), { organizationId: a.orgId, name: 'Repite', email: 'repite@d2l.test', source: 'web', propertyId: 7006, propertyKind: 'agent' })
    await upsertLead(ev(db), { organizationId: a.orgId, name: 'Repite', email: 'repite@d2l.test', source: 'web', propertyId: 7006, propertyKind: 'developer' })
    expect(await loadLead(db, first.id)).toMatchObject({ propertyId: 7006, propertyKind: 'developer' })
  })

  it('la web pública y la API v1 rellenan el catálogo: la reserva y el formulario son obra nueva; la API acepta propertyKind', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D2lIntake')
    const b = await seedTenant(db, 'D2lIntakeB')
    await twinProperties(db, a, 7007)
    const [promo] = await db.select({ slug: schema.developerProperties.slug }).from(schema.developerProperties).where(eq(schema.developerProperties.id, 7007))

    const contactHandler = (await import('../../server/api/public/contact.post')).default as any
    await contactHandler(ev(db, a, { body: { name: 'Formulario', email: 'form.cat@d2l.test', message: 'Me interesa', propertySlug: promo.slug } }))
    const [fromForm] = await db.select().from(schema.leads).where(and(eq(schema.leads.organizationId, a.orgId), eq(schema.leads.email, 'form.cat@d2l.test')))
    expect(fromForm).toMatchObject({ propertyId: 7007, propertyKind: 'developer' })

    const v1 = (await import('../../server/api/v1/leads.post')).default as any
    const res = await v1(ev(db, a, { body: { name: 'Portal', email: 'api.cat@d2l.test', propertyId: 7007, propertyKind: 'agent' } }))
    expect(res.data).toMatchObject({ propertyId: 7007, propertyKind: 'agent', propertyName: 'REF-7007' })
    // Sin propertyKind, obra nueva (como siempre ha sido esta API).
    const res2 = await v1(ev(db, a, { body: { name: 'Portal 2', email: 'api.cat2@d2l.test', propertyId: 7007 } }))
    expect(res2.data).toMatchObject({ propertyKind: 'developer' })
    await expect(v1(ev(db, a, { body: { name: 'X', email: 'x@d2l.test', propertyId: 7007, propertyKind: 'otro' } }))).rejects.toMatchObject({ statusCode: 422 })
    await expect(v1(ev(db, a, { body: { name: 'X', email: 'y@d2l.test', propertyId: b.propertyId, propertyKind: 'agent' } }))).rejects.toMatchObject({ statusCode: 422 })
  })

  it('INMO: create_lead guarda el catálogo; update_lead cambia la propiedad sólo con catálogo y sin motivo deja uno descriptivo', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D2lInmo')
    await twinProperties(db, a, 7008)
    const { executeTool } = await import('../../server/utils/tools/execute')
    const ctx = (source: 'api' | 'inmo' | 'automation') => ({ event: ev(db), db, env: {}, orgId: a.orgId, user: userOf(a), source })

    const created = await executeTool(ctx('inmo'), 'create_lead', { name: 'Desde INMO', email: 'inmo.cat@d2l.test', propertyId: 7008, propertyKind: 'agent', language: 'English' })
    expect(created.ok).toBe(true)
    const leadId = (created as any).output.leadId
    expect(await loadLead(db, leadId)).toMatchObject({ propertyId: 7008, propertyKind: 'agent', language: 'en' })

    expect(await executeTool(ctx('inmo'), 'update_lead', { leadId, propertyId: 7008 })).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
    expect((await executeTool(ctx('inmo'), 'update_lead', { leadId, propertyId: 7008, propertyKind: 'developer' })).ok).toBe(true)
    expect(await loadLead(db, leadId)).toMatchObject({ propertyKind: 'developer', propertyName: 'Residencial Marbella 7008' })

    // Una automatización sin motivo explícito: el historial dice por dónde vino el cambio.
    expect((await executeTool(ctx('automation'), 'update_lead', { leadId, stage: 'contacted' })).ok).toBe(true)
    const [h] = await db.select().from(schema.leadStageHistory).where(eq(schema.leadStageHistory.leadId, leadId))
    expect(h).toMatchObject({ toStage: 'contacted', reason: 'Automatización', userId: null })
  })
})

// ---------------------------------------------------------------------------
// 2. Motivo en cada cambio de fase
// ---------------------------------------------------------------------------

describe('motivo obligatorio en cada movimiento del panel (FASE 13)', () => {
  const patch = async (db: any, f: TenantFixture, id: number, body: any) => {
    const handler = (await import('../../server/api/admin/saas/leads/[id].patch')).default as any
    return handler(ev(db, f, { body, params: { id: String(id) } }))
  }
  async function history(db: any, leadId: number) {
    return db.select().from(schema.leadStageHistory).where(eq(schema.leadStageHistory.leadId, leadId)).orderBy(schema.leadStageHistory.id)
  }

  it('cambiar de fase sin motivo es un 422 y no mueve nada; con motivo queda en el historial', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D2lReason')
    const l = await lead(db, a.orgId)
    await expect(patch(db, a, l.id, { stage: 'contacted' })).rejects.toMatchObject({ statusCode: 422, statusMessage: expect.stringMatching(/motivo/) })
    await expect(patch(db, a, l.id, { stage: 'contacted', reason: '   ' })).rejects.toMatchObject({ statusCode: 422 })
    await expect(patch(db, a, l.id, { status: 'contacted' })).rejects.toMatchObject({ statusCode: 422 })
    expect((await loadLead(db, l.id)).stage).toBe('new')
    expect(await history(db, l.id)).toHaveLength(0)

    await patch(db, a, l.id, { stage: 'contacted', reason: '  Primera llamada hecha  ' })
    expect(await history(db, l.id)).toEqual([expect.objectContaining({ fromStage: 'new', toStage: 'contacted', reason: 'Primera llamada hecha', userId: a.userId })])
  })

  it('perder exige el motivo del catálogo y reactivar exige su motivo; los dos quedan en el historial', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D2lLost')
    const l = await lead(db, a.orgId, { stage: 'qualified', status: 'qualified' })
    await expect(patch(db, a, l.id, { lost: true })).rejects.toMatchObject({ statusCode: 422 })
    await expect(patch(db, a, l.id, { lost: true, lostReason: 'aburrimiento' })).rejects.toMatchObject({ statusCode: 422 })
    await patch(db, a, l.id, { lost: true, lostReason: 'not_interested', note: 'Compró con otra agencia' })
    await expect(patch(db, a, l.id, { lost: false })).rejects.toMatchObject({ statusCode: 422 })
    expect((await loadLead(db, l.id)).status).toBe('lost')
    await patch(db, a, l.id, { lost: false, note: 'Ha vuelto a escribir' })
    expect((await history(db, l.id)).map((h: any) => [h.toStage, h.reason])).toEqual([
      ['lost', 'No interesado — Compró con otra agencia'],
      ['reactivated', 'Ha vuelto a escribir'],
    ])
  })

  it('un lead de otra agencia es un 404, con o sin motivo', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D2lReason404A')
    const b = await seedTenant(db, 'D2lReason404B')
    await expect(patch(db, a, b.leadId, { stage: 'contacted', reason: 'Intruso' })).rejects.toMatchObject({ statusCode: 404 })
    await expect(patch(db, a, b.leadId, { stage: 'contacted' })).rejects.toMatchObject({ statusCode: 404 })
  })

  it('la acción masiva «Cambiar fase» no se crea sin motivo y escribe el motivo de quien la lanzó', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D2lBulk')
    const { validateLeadBulkParams, leadBulkHandlers } = await import('../../server/utils/bulkActions/leadActions')
    expect(() => validateLeadBulkParams('change_stage', { stage: 'qualified' })).toThrow(expect.objectContaining({ statusCode: 422 }))
    expect(() => validateLeadBulkParams('change_stage', { stage: 'qualified', reason: '' })).toThrow(expect.objectContaining({ statusCode: 422 }))
    // Las demás acciones no piden motivo.
    expect(validateLeadBulkParams('add_tag', { tagName: 'x' })).toEqual({ tagName: 'x' })

    const params = validateLeadBulkParams('change_stage', { stage: 'qualified', reason: ' Campaña de primavera ' })
    expect(params.reason).toBe('Campaña de primavera')
    await leadBulkHandlers().change_stage(ev(db), a.orgId, a.leadId, params, a.userId)
    const [h] = await history(db, a.leadId)
    expect(h).toMatchObject({ toStage: 'qualified', reason: 'Acción masiva: Campaña de primavera', userId: a.userId })
  })

  it('las entradas automáticas no se rompen: transitionLeadStage sigue aceptando su propio motivo (o ninguno)', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D2lAuto')
    const { transitionLeadStage } = await import('../../server/utils/leads/pipeline')
    await transitionLeadStage(ev(db), a.orgId, a.leadId, { toStage: 'viewing', reason: 'Visita reservada por el cliente' })
    expect((await loadLead(db, a.leadId)).stage).toBe('viewing')
  })
})

// ---------------------------------------------------------------------------
// 3. Deduplicación de contactos al darlos de alta: «Unificar»
// ---------------------------------------------------------------------------

describe('alta de contacto: WhatsApp, id externo y «Unificar» (FASE 14)', () => {
  it('detecta el duplicado por WhatsApp y por id externo; el id externo va con su sistema y no admite «crear igualmente»', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D2lDupes')
    await contact(db, a.orgId, { name: 'Laura WhatsApp', whatsapp: '+34611000111', normalizedWhatsapp: '+34611000111' })
    await contact(db, a.orgId, { name: 'Pedro Portal', externalSource: 'Idealista', externalId: 'ID-77' })
    const { createContactFromPanel } = await import('../../server/utils/contacts/crm')
    const create = (body: any) => createContactFromPanel(ev(db, a), a.orgId, userOf(a), body)

    await expect(create({ name: 'Laura', email: 'laura.nueva@d2l.test', whatsapp: '+34 611 000 111' })).rejects.toMatchObject({
      statusCode: 409,
      data: { duplicates: [expect.objectContaining({ name: 'Laura WhatsApp', matchedOn: 'WhatsApp' })] },
    })
    await expect(create({ name: 'Sin sistema', email: 'sin.sistema@d2l.test', externalId: 'ID-1' })).rejects.toMatchObject({ statusCode: 422 })
    await expect(create({ name: 'Pedro', email: 'pedro.nuevo@d2l.test', externalSource: 'Idealista', externalId: 'ID-77' })).rejects.toMatchObject({ statusCode: 409 })
    await expect(create({ name: 'Pedro', email: 'pedro.nuevo@d2l.test', externalSource: 'Idealista', externalId: 'ID-77', force: true })).rejects.toMatchObject({ statusCode: 409 })
    // El mismo id en OTRO sistema es otra persona.
    const ok = await create({ name: 'Pedro Fotocasa', email: 'pedro.fotocasa@d2l.test', externalSource: 'Fotocasa', externalId: 'ID-77' })
    expect(ok).toMatchObject({ externalSource: 'Fotocasa', externalId: 'ID-77' })
  })

  it('«Unificar» completa el existente con lo que le falta, nunca pisa lo que tiene ni le pone un dato de otra persona, y queda en Activity', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D2lUnify')
    const target = await contact(db, a.orgId, { name: 'Marta Ruiz', email: 'marta@d2l.test', normalizedEmail: 'marta@d2l.test', language: 'es', notes: 'Busca ático' })
    // El teléfono nuevo ya es de otra persona de la agencia: no se le pone a Marta.
    await contact(db, a.orgId, { name: 'Otra persona', phone: '+34600999888', normalizedPhone: '+34600999888', normalizedWhatsapp: '+34600999888' })
    const { createContactFromPanel } = await import('../../server/utils/contacts/crm')

    const res: any = await createContactFromPanel(ev(db, a), a.orgId, userOf(a), {
      name: 'Marta R.',
      email: 'otra.direccion@d2l.test',
      phone: '+34600999888',
      whatsapp: '+34611222333',
      externalSource: 'Idealista',
      externalId: 'M-1',
      language: 'en',
      country: 'España',
      notes: 'Llamó desde el portal',
      mergeIntoContactId: target.id,
    })
    expect(res).toMatchObject({ id: target.id, merged: true })
    expect(res.filled.sort()).toEqual(['country', 'externalId', 'notes', 'whatsapp'])
    expect(res.skipped.sort()).toEqual(['email', 'language', 'phone'])

    const [row] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, target.id))
    expect(row).toMatchObject({
      name: 'Marta Ruiz',
      email: 'marta@d2l.test',
      phone: null,
      whatsapp: '+34611222333',
      normalizedWhatsapp: '+34611222333',
      externalSource: 'Idealista',
      externalId: 'M-1',
      language: 'es',
      country: 'España',
      notes: 'Busca ático\n\nLlamó desde el portal',
    })
    // No se creó ningún contacto nuevo.
    expect(await db.select().from(schema.contacts).where(and(eq(schema.contacts.organizationId, a.orgId), eq(schema.contacts.name, 'Marta R.')))).toHaveLength(0)

    const [act] = await db.select().from(schema.activities).where(and(eq(schema.activities.organizationId, a.orgId), eq(schema.activities.eventType, 'CONTACT_UNIFIED')))
    expect(act).toMatchObject({ contactId: target.id, actorType: 'user', actorId: a.userId })
    expect(JSON.parse(act.metadataJson)).toMatchObject({ filled: expect.arrayContaining(['whatsapp', 'externalId']), skipped: expect.arrayContaining(['email', 'phone']) })
  })

  it('«Unificar» no cruza de agencia ni usa un contacto archivado (404), y no deja rastro en la otra', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D2lUnifyA')
    const b = await seedTenant(db, 'D2lUnifyB')
    const ajeno = await contact(db, b.orgId, { name: 'De B', email: 'deb@d2l.test' })
    const archivado = await contact(db, a.orgId, { name: 'Archivado', status: 'archived', deletedAt: ts })
    const { createContactFromPanel, createContactFromAdmin } = await import('../../server/utils/contacts/crm')
    const body = (id: number) => ({ name: 'X', email: 'x.unify@d2l.test', phone: '+34655000000', mergeIntoContactId: id })

    await expect(createContactFromPanel(ev(db, a), a.orgId, userOf(a), body(ajeno.id))).rejects.toMatchObject({ statusCode: 404 })
    await expect(createContactFromAdmin(ev(db, a), a.orgId, userOf(a), body(ajeno.id))).rejects.toMatchObject({ statusCode: 404 })
    await expect(createContactFromPanel(ev(db, a), a.orgId, userOf(a), body(archivado.id))).rejects.toMatchObject({ statusCode: 404 })
    const [untouched] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, ajeno.id))
    expect(untouched.phone).toBeNull()
    expect(await db.select().from(schema.activities).where(eq(schema.activities.eventType, 'CONTACT_UNIFIED'))).toHaveLength(0)
  })

  it('la edición guarda el id externo con su sistema y no deja usar el de otro contacto', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D2lEditExt')
    const uno = await contact(db, a.orgId, { name: 'Uno', email: 'uno@d2l.test' })
    await contact(db, a.orgId, { name: 'Dos', externalSource: 'CRM anterior', externalId: '42' })
    const { updateContactFromAdmin } = await import('../../server/utils/contacts/crm')
    await updateContactFromAdmin(ev(db, a), a.orgId, userOf(a), uno.id, { externalSource: 'CRM anterior', externalId: '41', whatsapp: '+34611444555' })
    const [row] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, uno.id))
    expect(row).toMatchObject({ externalSource: 'CRM anterior', externalId: '41', whatsapp: '+34611444555' })
    await expect(updateContactFromAdmin(ev(db, a), a.orgId, userOf(a), uno.id, { externalId: '42' })).rejects.toMatchObject({ statusCode: 409 })
    await expect(updateContactFromAdmin(ev(db, a), a.orgId, userOf(a), uno.id, { externalSource: null })).rejects.toMatchObject({ statusCode: 422 })
  })
})

// ---------------------------------------------------------------------------
// 4. Idioma desde la captación
// ---------------------------------------------------------------------------

describe('idioma desde la captación y regla «Idioma» (FASE 15)', () => {
  it('normalizeLanguage lleva al catálogo lo que llega de un navegador, una integración o una persona', async () => {
    const { normalizeLanguage } = await import('../../utils/crmCatalog')
    expect(normalizeLanguage('en-GB')).toBe('en')
    expect(normalizeLanguage('pt_BR')).toBe('pt')
    expect(normalizeLanguage(' ES ')).toBe('es')
    expect(normalizeLanguage('English')).toBe('en')
    expect(normalizeLanguage('Inglés')).toBe('en')
    expect(normalizeLanguage('Français')).toBe('fr')
    expect(normalizeLanguage('zh-Hans-CN')).toBe('zh')
    expect(normalizeLanguage('ja-JP')).toBeNull()
    expect(normalizeLanguage('klingon')).toBeNull()
    expect(normalizeLanguage(42)).toBeNull()
  })

  it('el formulario público guarda el idioma de quien escribe y la regla «Idioma» enruta el lead', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D2lLangForm')
    const english = await commercial(db, a.orgId, 'English desk')
    await rule(db, a.orgId, { name: 'Inglés', scope: 'language', matchValue: 'en', targetCommercialId: english.id, priority: 0 })
    const handler = (await import('../../server/api/public/contact.post')).default as any

    await handler(ev(db, a, { body: { name: 'John', email: 'john@d2l.test', message: 'Hello', language: 'en-GB' } }))
    const [john] = await db.select().from(schema.leads).where(and(eq(schema.leads.organizationId, a.orgId), eq(schema.leads.email, 'john@d2l.test')))
    expect(john).toMatchObject({ language: 'en', agentId: english.id })
    // Su contacto nace con el idioma también.
    const [c] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, john.contactId))
    expect(c.language).toBe('en')

    // Un idioma fuera del catálogo no rompe el formulario: queda sin idioma y sin esa regla.
    await handler(ev(db, a, { body: { name: 'Taro', email: 'taro@d2l.test', message: 'Hi', language: 'ja-JP' } }))
    const [taro] = await db.select().from(schema.leads).where(and(eq(schema.leads.organizationId, a.orgId), eq(schema.leads.email, 'taro@d2l.test')))
    expect(taro).toMatchObject({ language: null, agentId: null })
  })

  it('sin idioma en el envío, sólo cuenta el selector de la web si la persona lo eligió (la cookie «locale» existe siempre)', async () => {
    const { publicLeadLanguage } = await import('../../server/utils/leads/captureLanguage')
    expect(publicLeadLanguage(ev(null, undefined, { cookies: { locale: 'es' } }), undefined)).toBeNull()
    expect(publicLeadLanguage(ev(null, undefined, { cookies: { locale: 'de', locale_chosen: '1' } }), undefined)).toBe('de')
    expect(publicLeadLanguage(ev(null, undefined, { cookies: { locale: 'de', locale_chosen: '1' } }), 'fr-FR')).toBe('fr')
  })

  it('la reserva, los referidos y el chat de la web también llevan el idioma', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D2lLangOther')
    // Referidos: la agencia la decide el enlace.
    const [link] = await db.insert(schema.referralLinks).values({ organizationId: a.orgId, code: `ref-d2l-${a.orgId}`, referrerName: 'Ana', createdAt: ts }).returning()
    const referrals = (await import('../../server/api/public/referrals.post')).default as any
    await referrals(ev(db, a, { body: { code: link.code, name: 'Referida', email: 'referida@d2l.test', language: 'de' } }))
    const [ref] = await db.select().from(schema.leads).where(eq(schema.leads.email, 'referida@d2l.test'))
    expect(ref).toMatchObject({ organizationId: a.orgId, language: 'de', source: 'referral' })

    // Chat de la web (rama de /api/public/contact): con el chat activado.
    await db.insert(schema.commsSettings).values({ organizationId: a.orgId, webChatEnabled: 1, createdAt: ts, updatedAt: ts })
    const contactHandler = (await import('../../server/api/public/contact.post')).default as any
    await contactHandler(ev(db, a, { query: { channel: 'chat', action: 'start' }, body: { name: 'Chat', email: 'chat.lang@d2l.test', message: 'Bonjour', language: 'fr' } }))
    const [chat] = await db.select().from(schema.leads).where(eq(schema.leads.email, 'chat.lang@d2l.test'))
    expect(chat).toMatchObject({ language: 'fr', sourceDetail: 'Chat web' })
  })

  it('la API v1 acepta language (normalizado, desconocido = 422) y la regla «Idioma» lo enruta; una regla antigua escrita «English» también', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D2lLangApi')
    const desk = await commercial(db, a.orgId, 'International desk')
    await rule(db, a.orgId, { name: 'Antigua', scope: 'language', matchValue: 'English', targetCommercialId: desk.id, priority: 0 })
    const v1 = (await import('../../server/api/v1/leads.post')).default as any

    const res = await v1(ev(db, a, { body: { name: 'Mary', email: 'mary@d2l.test', language: 'en-US' } }))
    expect(res.data).toMatchObject({ language: 'en', agentId: desk.id })
    await expect(v1(ev(db, a, { body: { name: 'K', email: 'k@d2l.test', language: 'klingon' } }))).rejects.toMatchObject({ statusCode: 422 })
  })

  it('upsertLead guarda el idioma si el lead no lo tenía y nunca pisa el que ya tiene', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D2lLangUpsert')
    const { upsertLead } = await import('../../server/utils/leads')
    const first = await upsertLead(ev(db), { organizationId: a.orgId, name: 'Repite', email: 'lang.repite@d2l.test', source: 'web' })
    expect((await loadLead(db, first.id)).language).toBeNull()
    await upsertLead(ev(db), { organizationId: a.orgId, name: 'Repite', email: 'lang.repite@d2l.test', source: 'web', language: 'Français' })
    expect((await loadLead(db, first.id)).language).toBe('fr')
    await upsertLead(ev(db), { organizationId: a.orgId, name: 'Repite', email: 'lang.repite@d2l.test', source: 'web', language: 'de' })
    expect((await loadLead(db, first.id)).language).toBe('fr')
  })

  it('una regla «Idioma» se guarda con el código del catálogo y un idioma desconocido es un 422', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D2lLangRule')
    const { validateRoutingRule } = await import('../../server/utils/leads/routing')
    const data: Record<string, any> = { name: 'R', scope: 'language', matchValue: 'Inglés' }
    await validateRoutingRule(db, a.orgId, data, null)
    expect(data.matchValue).toBe('en')
    await expect(validateRoutingRule(db, a.orgId, { name: 'R', scope: 'language', matchValue: 'klingon' }, null)).rejects.toMatchObject({ statusCode: 422 })
    // El editor de horario genera este JSON, que se valida igual que siempre.
    await validateRoutingRule(db, a.orgId, { name: 'G', scope: 'department', scheduleJson: JSON.stringify({ days: [6, 7], from: '22:00', to: '06:00', timezone: 'Europe/Madrid' }) }, null)
  })
})

// ---------------------------------------------------------------------------
// 5. Selector de contacto en el formulario del lead
// ---------------------------------------------------------------------------

describe('selector de contacto del lead (FASE 12)', () => {
  it('el alta vincula el contacto elegido aunque el email sea otro; ajeno 404, archivado 422', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D2lContactSel')
    const b = await seedTenant(db, 'D2lContactSelB')
    const elegido = await contact(db, a.orgId, { name: 'Elegida', email: 'elegida@d2l.test', normalizedEmail: 'elegida@d2l.test' })
    const ajeno = await contact(db, b.orgId, { name: 'De B' })
    const archivado = await contact(db, a.orgId, { name: 'Archivada', status: 'archived', deletedAt: ts })
    const { createLeadFromAdmin, updateLeadFromAdmin } = await import('../../server/utils/leads/admin')
    const before = (await db.select().from(schema.contacts).where(eq(schema.contacts.organizationId, a.orgId))).length

    const res = await createLeadFromAdmin(ev(db, a), a.orgId, userOf(a), { name: 'Elegida', email: 'otro.email@d2l.test', source: 'call', contactId: elegido.id })
    const row = await loadLead(db, res.id)
    expect(row).toMatchObject({ contactId: elegido.id })
    expect(row.convertedAt).toBeTruthy()
    // No se creó otro contacto por el email distinto.
    expect((await db.select().from(schema.contacts).where(eq(schema.contacts.organizationId, a.orgId))).length).toBe(before)

    await expect(createLeadFromAdmin(ev(db, a), a.orgId, userOf(a), { name: 'X', email: 'x1@d2l.test', source: 'call', contactId: ajeno.id })).rejects.toMatchObject({ statusCode: 404 })
    await expect(createLeadFromAdmin(ev(db, a), a.orgId, userOf(a), { name: 'X', email: 'x2@d2l.test', source: 'call', contactId: archivado.id })).rejects.toMatchObject({ statusCode: 422 })

    // Edición: cambiar de persona; ajeno 404.
    const otro = await contact(db, a.orgId, { name: 'Otra' })
    await updateLeadFromAdmin(ev(db, a), a.orgId, userOf(a), res.id, { contactId: otro.id })
    expect((await loadLead(db, res.id)).contactId).toBe(otro.id)
    await expect(updateLeadFromAdmin(ev(db, a), a.orgId, userOf(a), res.id, { contactId: ajeno.id })).rejects.toMatchObject({ statusCode: 404 })
  })
})
