import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { createTestDb, seedTenant, type TenantFixture } from './helpers/tenantFixtures'

/**
 * FASE 31 — Domain Tools API. Base real (sqlite-proxy + migraciones reales)
 * y useDb() sustituido, igual que leadPipelineAndDedup.test.ts. Lo que se
 * prueba es el CONTRATO común del ejecutor (autorización con el RBAC real,
 * validación, confirmación, idempotencia, aislamiento entre agencias y traza)
 * y que cada herramienta delega en el servicio de dominio real.
 */
vi.mock('../../server/utils/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/utils/db')>()
  return { ...actual, useDb: (event: any) => event.context.db }
})

const { executeTool, toolCatalogFor } = await import('../../server/utils/tools/execute')

let db: any
let a: TenantFixture
let b: TenantFixture

beforeEach(async () => {
  ;({ db } = createTestDb())
  a = await seedTenant(db, 'ToolsAlpha')
  b = await seedTenant(db, 'ToolsBeta')
})

const admin = (f: TenantFixture, permissions: string[] | null = null) => ({
  id: f.userId,
  name: 'Admin',
  email: 'admin@example.com',
  role: 'admin',
  organizationId: f.orgId,
  permissions: permissions ? JSON.stringify(permissions) : null,
})

function ctx(f: TenantFixture, permissions: string[] | null = null) {
  return { event: { context: { db }, node: { req: { headers: {} } } } as any, db, env: {}, orgId: f.orgId, user: admin(f, permissions), source: 'api' as const }
}

async function traces(orgId: number) {
  return db.select().from(schema.domainToolCalls).where(eq(schema.domainToolCalls.organizationId, orgId))
}

describe('autorización (RBAC real del usuario, §21)', () => {
  it('un usuario con sólo web:read busca propiedades pero no puede crear un lead — y el catálogo ya no se lo ofrece', async () => {
    const c = ctx(a, ['web:read'])
    const search = await executeTool(c, 'search_properties', {})
    expect(search.ok).toBe(true)

    const lead = await executeTool(c, 'create_lead', { name: 'Eva', email: 'eva@example.com' })
    expect(lead).toMatchObject({ ok: false, error: { code: 'PERMISSION_DENIED' } })
    const leads = await db.select().from(schema.leads).where(eq(schema.leads.email, 'eva@example.com'))
    expect(leads).toHaveLength(0)

    const names = toolCatalogFor(c.user).map((t) => t.name)
    expect(names).toContain('search_properties')
    expect(names).toContain('get_property')
    expect(names).not.toContain('create_lead')
    expect(names).not.toContain('send_property')
  })

  it('herramienta desconocida → UNKNOWN_TOOL; input que no es un objeto → VALIDATION_ERROR', async () => {
    expect(await executeTool(ctx(a), 'drop_table', {})).toMatchObject({ ok: false, error: { code: 'UNKNOWN_TOOL' } })
    expect(await executeTool(ctx(a), 'search_properties', ['x'])).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
  })
})

describe('validación y errores tipados (§49)', () => {
  it('create_lead sin email ni teléfono → VALIDATION_ERROR legible', async () => {
    const r = await executeTool(ctx(a), 'create_lead', { name: 'Sin datos' })
    expect(r).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
    if (!r.ok) expect(r.error.message).toContain('email o teléfono')
  })

  it('un enum fuera de rango no llega al servicio', async () => {
    const r = await executeTool(ctx(a), 'search_properties', { features: ['jacuzzi'] })
    expect(r).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
  })

  it('sin SQL arbitrario (§25): las claves que no son del esquema se ignoran, nunca se interpretan', async () => {
    const r = await executeTool(ctx(a), 'search_properties', { where: '1=1; DROP TABLE leads', table: 'users', catalog: 'agent' })
    expect(r.ok).toBe(true)
    const all = await db.select().from(schema.leads)
    expect(all.length).toBeGreaterThan(0)
  })
})

describe('aislamiento entre agencias', () => {
  it('get_property con el id de otra agencia → NOT_FOUND, sin filtrar ningún dato', async () => {
    const r = await executeTool(ctx(a), 'get_property', { propertyId: b.propertyId, propertyKind: 'agent' })
    expect(r).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })

  it('search_properties sólo devuelve inmuebles de la propia organización', async () => {
    const r = await executeTool(ctx(a), 'search_properties', {})
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const out = r.output as any
    const ids = out.results.map((p: any) => `${p.kind}:${p.id}`)
    expect(ids).toContain(`agent:${a.propertyId}`)
    expect(ids).toContain(`developer:${a.projectId}`)
    expect(ids).not.toContain(`agent:${b.propertyId}`)
    expect(ids).not.toContain(`developer:${b.projectId}`)
  })

  it('create_property_selection con una propiedad de otra agencia → NOT_FOUND y no se crea nada', async () => {
    const [contact] = await db.insert(schema.contacts).values({ organizationId: a.orgId, name: 'Comprador', status: 'active', createdAt: 'x', updatedAt: 'x' }).returning()
    const r = await executeTool(ctx(a), 'create_property_selection', {
      contactId: contact.id,
      title: 'Selección',
      items: [
        { propertyId: a.propertyId, propertyKind: 'agent' },
        { propertyId: b.propertyId, propertyKind: 'agent' },
      ],
    })
    expect(r).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    expect(await db.select().from(schema.propertySelections)).toHaveLength(0)
  })

  it('create_task con el lead de otra agencia → NOT_FOUND (createTask valida todas sus referencias)', async () => {
    const r = await executeTool(ctx(a), 'create_task', { title: 'Llamar', leadId: b.leadId })
    expect(r).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    expect(await db.select().from(schema.tasks)).toHaveLength(0)
  })
})

describe('get_property: vista pública vs interna (§29-30)', () => {
  beforeEach(async () => {
    await db
      .update(schema.agentProperties)
      .set({ agencyReference: 'MANDATO-77', mandateType: 'exclusive', street: 'Calle Mayor', streetNumber: '12', city: 'Valencia', locationPrivacy: 'approximate', hasTerrace: 1 })
      .where(eq(schema.agentProperties.id, a.propertyId))
  })

  it('public: sin referencias internas ni número de portal; internal: ficha compacta con mandato y dirección', async () => {
    const pub = await executeTool(ctx(a), 'get_property', { propertyId: a.propertyId, propertyKind: 'agent', view: 'public' })
    expect(pub.ok).toBe(true)
    const p = (pub as any).output
    expect(JSON.stringify(p)).not.toContain('MANDATO-77')
    expect(p.agencyReference).toBeUndefined()
    expect(JSON.stringify(p)).not.toContain('"12"')
    expect(p.features).toEqual(['terrace'])

    const internal = await executeTool(ctx(a), 'get_property', { propertyId: a.propertyId, propertyKind: 'agent', view: 'internal' })
    const i = (internal as any).output
    expect(i.agencyReference).toBe('MANDATO-77')
    expect(i.mandateType).toBe('exclusive')
    expect(i.location.streetNumber).toBe('12')
  })

  it('el DTO es compacto: nunca la fila entera', async () => {
    const r = await executeTool(ctx(a), 'get_property', { propertyId: a.propertyId, propertyKind: 'agent' })
    const keys = Object.keys((r as any).output)
    expect(keys.length).toBeLessThan(25)
    expect(keys).not.toContain('organizationId')
    expect(keys).not.toContain('createdAt')
  })
})

describe('search_properties estructurado (§27)', () => {
  it('filtra por zona, características, dormitorios y comercial con los criterios reales del PropertySearchService', async () => {
    const base = { organizationId: a.orgId, status: 'available', createdAt: 'x', updatedAt: 'x' }
    await db.insert(schema.agentProperties).values([
      { ...base, slug: 'p-terraza', city: 'Valencia', bedrooms: 3, hasTerrace: 1, price: 250_000, agentId: a.teamMemberId },
      { ...base, slug: 'p-sin-terraza', city: 'Valencia', bedrooms: 3, hasTerrace: 0, price: 240_000 },
      { ...base, slug: 'p-madrid', city: 'Madrid', bedrooms: 4, hasTerrace: 1, price: 600_000 },
      { ...base, slug: 'p-vendida', city: 'Valencia', bedrooms: 3, hasTerrace: 1, price: 260_000, status: 'sold' },
    ])
    const r = await executeTool(ctx(a), 'search_properties', { catalog: 'agent', zones: ['Valencia'], features: ['terrace'], bedroomsMin: 3 })
    expect(r.ok).toBe(true)
    const out = (r as any).output
    expect(out.total).toBe(1)
    expect(out.results[0].features).toContain('terrace')
    expect(out.results[0].location.city).toBe('Valencia')

    const byCommercial = await executeTool(ctx(a), 'search_properties', { commercialId: a.teamMemberId })
    const kinds = (byCommercial as any).output.results.map((x: any) => x.kind)
    expect(kinds).toEqual(['agent'])
  })
})

describe('confirmación de acciones con efectos externos (§20)', () => {
  it('book_viewing sin confirmación → CONFIRMATION_REQUIRED y no se crea la cita; confirmada, sí', async () => {
    const input = { leadId: a.leadId, commercialId: a.teamMemberId, propertyId: a.projectId, propertyKind: 'developer', scheduledAt: '2026-12-01 10:00' }
    const before = (await db.select().from(schema.visits).where(eq(schema.visits.organizationId, a.orgId))).length

    const pending = await executeTool(ctx(a), 'book_viewing', input)
    expect(pending).toMatchObject({ ok: false, error: { code: 'CONFIRMATION_REQUIRED' } })
    expect((await db.select().from(schema.visits).where(eq(schema.visits.organizationId, a.orgId))).length).toBe(before)

    const done = await executeTool(ctx(a), 'book_viewing', input, { confirmed: true })
    expect(done.ok).toBe(true)
    const visitId = (done as any).output.appointmentId
    const [visit] = await db.select().from(schema.visits).where(eq(schema.visits.id, visitId))
    expect(visit.scheduledAt).toBe('2026-12-01 10:00:00')
    expect(visit.leadId).toBe(a.leadId)

    // Mismo comercial, misma hora: el conflicto lo detecta el servicio de citas real.
    const clash = await executeTool(ctx(a), 'book_viewing', input, { confirmed: true })
    expect(clash).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
  })

  it('cancel_viewing cancela (no borra) y reschedule_viewing mueve la MISMA cita', async () => {
    const booked = await executeTool(ctx(a), 'book_viewing', { leadId: a.leadId, commercialId: a.teamMemberId, propertyId: a.projectId, propertyKind: 'developer', scheduledAt: '2026-12-02 10:00' }, { confirmed: true })
    const id = (booked as any).output.appointmentId

    const moved = await executeTool(ctx(a), 'reschedule_viewing', { appointmentId: id, scheduledAt: '2026-12-02 12:30' }, { confirmed: true })
    expect(moved).toMatchObject({ ok: true, output: { appointmentId: id, from: '2026-12-02 10:00:00', to: '2026-12-02 12:30:00' } })

    const cancelled = await executeTool(ctx(a), 'cancel_viewing', { appointmentId: id }, { confirmed: true })
    expect(cancelled).toMatchObject({ ok: true, output: { status: 'cancelled' } })
    const [row] = await db.select().from(schema.visits).where(eq(schema.visits.id, id))
    expect(row.status).toBe('cancelled')
    // Cancelar exige motivo (FASE 17): sin uno explícito, queda dicho desde dónde se canceló.
    expect(row.cancellationReason).toBe('Cancelada con la herramienta cancel_viewing')
    expect(row.cancelledAt).toBeTruthy()
  })

  it('send_property de una 2ª mano vendida → PROPERTY_NOT_PUBLISHABLE antes de tocar Comunicaciones', async () => {
    await db.update(schema.agentProperties).set({ status: 'sold' }).where(eq(schema.agentProperties.id, a.propertyId))
    const r = await executeTool(ctx(a), 'send_property', { leadId: a.leadId, propertyId: a.propertyId, propertyKind: 'agent' }, { confirmed: true })
    expect(r).toMatchObject({ ok: false, error: { code: 'PROPERTY_NOT_PUBLISHABLE' } })
    expect(await db.select().from(schema.commsMessages)).toHaveLength(0)
  })
})

describe('idempotencia (§48) y traza (§47/§51)', () => {
  it('create_task repetida con la misma clave devuelve el mismo resultado sin crear otra tarea', async () => {
    const first = await executeTool(ctx(a), 'create_task', { title: 'Llamar a Eva', leadId: a.leadId }, { idempotencyKey: 'k-1' })
    const second = await executeTool(ctx(a), 'create_task', { title: 'Llamar a Eva', leadId: a.leadId }, { idempotencyKey: 'k-1' })
    expect(first.ok && second.ok).toBe(true)
    expect((second as any).output.taskId).toBe((first as any).output.taskId)
    expect((second as any).replayed).toBe(true)
    const rows = await db.select().from(schema.tasks).where(eq(schema.tasks.organizationId, a.orgId))
    expect(rows).toHaveLength(1)

    // La misma clave en OTRA agencia no reutiliza nada.
    const other = await executeTool(ctx(b), 'create_task', { title: 'Otra', leadId: b.leadId }, { idempotencyKey: 'k-1' })
    expect((other as any).replayed).toBeUndefined()
    expect((other as any).output.taskId).not.toBe((first as any).output.taskId)
  })

  it('cada llamada deja traza con herramienta, resultado y error tipado — nunca el input', async () => {
    await executeTool(ctx(a), 'create_lead', { name: 'Traza', email: 'traza@example.com', notes: 'dato sensible' })
    await executeTool(ctx(a), 'get_property', { propertyId: 999999, propertyKind: 'agent' })
    const rows = await traces(a.orgId)
    const lead = rows.find((r: any) => r.tool === 'create_lead')
    expect(lead).toMatchObject({ status: 'ok', kind: 'write', targetType: 'lead', userId: a.userId })
    expect(lead.resultJson).toBeNull() // sin clave de idempotencia no se guarda el resultado
    const miss = rows.find((r: any) => r.tool === 'get_property')
    expect(miss).toMatchObject({ status: 'error', errorCode: 'NOT_FOUND' })
    expect(JSON.stringify(rows)).not.toContain('dato sensible')
    expect(await traces(b.orgId)).toHaveLength(0)
  })
})

describe('las herramientas delegan en los servicios de dominio reales', () => {
  it('create_lead pasa por upsertLead: Contacto resuelto y deduplicación por email', async () => {
    const r1 = await executeTool(ctx(a), 'create_lead', { name: 'Lucía', email: 'lucia@example.com' })
    const r2 = await executeTool(ctx(a), 'create_lead', { name: 'Lucía', email: 'lucia@example.com' })
    expect((r1 as any).output.created).toBe(true)
    expect((r2 as any).output.created).toBe(false)
    expect((r2 as any).output.leadId).toBe((r1 as any).output.leadId)
    expect((r1 as any).output.contactId).not.toBeNull()
  })

  it('create_contact reutiliza el contacto exacto y nunca fusiona los dudosos', async () => {
    const first = await executeTool(ctx(a), 'create_contact', { name: 'Marta', email: 'marta@example.com' })
    const again = await executeTool(ctx(a), 'create_contact', { name: 'Marta G.', email: 'marta@example.com' })
    expect((again as any).output.created).toBe(false)
    expect((again as any).output.contactId).toBe((first as any).output.contactId)
  })

  it('update_buyer_requirements persiste una necesidad real; las zonas quedan como etiqueta comparable por el Matching', async () => {
    const [contact] = await db.insert(schema.contacts).values({ organizationId: a.orgId, name: 'Comprador', status: 'active', createdAt: 'x', updatedAt: 'x' }).returning()
    const r = await executeTool(ctx(a), 'update_buyer_requirements', { contactId: contact.id, operation: 'sale', priceMax: 300000, desiredZones: ['Ruzafa'] })
    expect(r.ok).toBe(true)
    const [req] = await db.select().from(schema.buyerRequirements).where(and(eq(schema.buyerRequirements.organizationId, a.orgId), eq(schema.buyerRequirements.contactId, contact.id)))
    expect(req.priceMax).toBe(300000)
    expect(JSON.parse(req.desiredZonesJson)).toEqual([{ label: 'Ruzafa' }])
  })
})
