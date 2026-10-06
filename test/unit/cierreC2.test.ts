import { and, eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'

/**
 * Cierre C2 de la auditoría del núcleo inmobiliario:
 *
 * - FASE 18: añadir y quitar paradas de un tour YA creado — mismas
 *   validaciones que el alta (catálogo, agencia, papelera, solapes con el
 *   tour y con la agenda real), propagación del tour a la parada nueva,
 *   Activity y aviso al cliente; quitar = la cita queda cancelada con motivo
 *   (nunca se borra) y un tour no se queda sin paradas activas.
 * - FASE 11: la vista propia de una selección — detalle con foto, precio y
 *   estado, reordenar, quitar, añadir, y aislamiento entre agencias.
 *
 * Base real (sqlite-proxy + migraciones reales), como tours.test.ts y
 * necesidadesMatchingN4.test.ts.
 */
vi.mock('../../server/utils/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/utils/db')>()
  return { ...actual, useDb: (event: any) => event.context.db }
})

const ts = '2026-01-01 00:00:00'
let seq = 0
const ctx = { userId: 1, env: {}, publicOrigin: 'https://agencia.example' }
const ev = (db: any) => ({ context: { db } }) as any

async function commercial(db: any, orgId: number, over: Record<string, any> = {}) {
  seq += 1
  const [row] = await db
    .insert(schema.teamMembers)
    .values({ organizationId: orgId, name: `Comercial C2 ${seq}`, slug: `c2-comercial-${seq}`, email: `c2-comercial-${seq}@example.com`, position: 'Comercial', slotDurationMinutes: 60, createdAt: ts, updatedAt: ts, ...over })
    .returning()
  return row
}
async function contact(db: any, orgId: number, over: Record<string, any> = {}) {
  seq += 1
  const [row] = await db.insert(schema.contacts).values({ organizationId: orgId, name: `Contacto C2 ${seq}`, email: `c2-contacto-${seq}@example.com`, phone: '+34600111222', status: 'active', createdAt: ts, updatedAt: ts, ...over }).returning()
  return row
}
async function lead(db: any, orgId: number, over: Record<string, any> = {}) {
  seq += 1
  const [row] = await db.insert(schema.leads).values({ organizationId: orgId, name: `Lead C2 ${seq}`, email: `c2-lead-${seq}@example.com`, source: 'web', status: 'new', stage: 'new', score: 0, createdAt: ts, updatedAt: ts, ...over }).returning()
  return row
}
async function flat(db: any, orgId: number, over: Record<string, any> = {}) {
  seq += 1
  const [row] = await db
    .insert(schema.agentProperties)
    .values({ organizationId: orgId, slug: `c2-piso-${seq}`, reference: `C2-${seq}`, city: 'Madrid', price: 410_000, bedrooms: 3, area: 92, status: 'available', mainImage: `tenants/${orgId}/c2-${seq}.jpg`, createdAt: ts, updatedAt: ts, ...over })
    .returning()
  return row
}
async function visitRow(db: any, id: number) {
  return (await db.select().from(schema.visits).where(eq(schema.visits.id, id)))[0]
}
async function tours() {
  return import('../../server/utils/appointments/tours')
}

/** Un tour de dos paradas (10:00 de 45 min y 11:00 de 60 min) con lead, contacto, notas y zona horaria. */
async function tourFixture(name: string) {
  const { db } = createTestDb()
  const t = await seedTenant(db, name)
  const b = await seedTenant(db, `${name}B`)
  const agent = await commercial(db, t.orgId)
  const c = await contact(db, t.orgId)
  const l = await lead(db, t.orgId, { contactId: c.id })
  const { createTour } = await tours()
  const res = await createTour(db, t.orgId, {
    leadId: l.id,
    notes: 'Quiere terraza y garaje',
    timezone: 'Atlantic/Canary',
    stops: [
      { propertyId: t.projectId, propertyKind: 'developer', agentId: agent.id, scheduledAt: '2030-08-03 10:00:00', durationMinutes: 45 },
      { propertyId: t.propertyId, propertyKind: 'agent', agentId: agent.id, scheduledAt: '2030-08-03 11:00:00', durationMinutes: 60 },
    ],
  })
  return { db, t, b, agent, c, l, tourId: res.id, stopIds: res.stopIds }
}

describe('C2 · FASE 18 — añadir una parada a un tour ya creado', () => {
  it('a una hora concreta, del otro catálogo, con su duración: hereda cliente, lead, contacto y zona del tour; Activity y aviso', async () => {
    const { db, t, agent, c, l, tourId } = await tourFixture('C2Add')
    const p = await flat(db, t.orgId)
    const { addTourStop, listTours } = await tours()

    const res = await addTourStop(db, t.orgId, tourId, { stop: { propertyId: p.id, propertyKind: 'agent', agentId: agent.id, scheduledAt: '2030-08-03 13:00:00', durationMinutes: 30, meetingPoint: 'Portal 3' } }, ctx)
    expect(res).toMatchObject({ id: tourId, scheduledAt: '2030-08-03 13:00:00', endsAt: '2030-08-03 13:30:00', tourStopOrder: 2 })

    const row = await visitRow(db, res.stopId)
    expect(row).toMatchObject({
      tourId,
      tourStopOrder: 2,
      type: 'property_viewing',
      status: 'scheduled',
      confirmationStatus: 'pending',
      propertyId: p.id,
      propertyKind: 'agent',
      propertyName: p.reference,
      agentId: agent.id,
      durationMinutes: 30,
      meetingPoint: 'Portal 3',
      leadId: l.id,
      contactId: c.id,
      clientName: c.name,
      clientEmail: c.email,
      timezone: 'Atlantic/Canary',
      reminderStatus: 'pending',
      createdBy: 1,
    })
    expect(row.managementToken).toBeTruthy()

    // Las notas son de la cabecera, como al crear el tour: la parada nueva las tiene por ser del tour.
    const [tour] = await listTours(db, t.orgId)
    expect(tour.notes).toBe('Quiere terraza y garaje')
    expect(tour.stops.map((s) => s.id)).toContain(res.stopId)
    expect(tour.stops[2]).toMatchObject({ id: res.stopId, propertyKind: 'agent', contactId: c.id, leadId: l.id })

    const [act] = await db.select().from(schema.activities).where(and(eq(schema.activities.organizationId, t.orgId), eq(schema.activities.eventType, 'APPOINTMENT_CREATED'), eq(schema.activities.entityId, res.stopId)))
    expect(act).toMatchObject({ contactId: c.id, leadId: l.id, propertyId: p.id, propertyKind: 'agent', actorId: 1 })
    expect(JSON.parse(act.metadataJson)).toMatchObject({ tourId, tourStopOrder: 2, addedToTour: true })

    // Aviso por el mismo mecanismo que reordenar: el registro interno siempre; el email, sin proveedor, queda como NO entregado.
    const notes = await db.select().from(schema.appointmentNotifications).where(eq(schema.appointmentNotifications.visitId, res.stopId))
    expect(notes.find((n: any) => n.channel === 'internal')).toMatchObject({ type: 'confirmation', delivered: 1 })
    expect(notes.find((n: any) => n.channel === 'internal').message).toContain(`https://agencia.example/citas/${row.managementToken}`)
    const email = notes.find((n: any) => n.channel === 'email')
    expect(email).toMatchObject({ recipient: c.email, delivered: 0 })
  })

  it('«al final con el margen»: empieza al acabar la última parada ACTIVA más el desplazamiento, con la franja del comercial', async () => {
    const { db, t, agent, tourId, stopIds } = await tourFixture('C2AddEnd')
    const { addTourStop, removeTourStop } = await tours()

    const first = await addTourStop(db, t.orgId, tourId, { stop: { agentId: agent.id }, gapMinutes: 20 }, ctx)
    expect(first).toMatchObject({ scheduledAt: '2030-08-03 12:20:00', endsAt: '2030-08-03 13:20:00' }) // 11:00+60 → 12:00 + 20 min; 60 min de franja

    // Una parada cancelada no cuenta para «el final».
    await removeTourStop(db, t.orgId, tourId, { stopId: first.stopId, reason: 'Ya no le interesa' }, ctx)
    const again = await addTourStop(db, t.orgId, tourId, { stop: { agentId: agent.id, durationMinutes: 45 } }, ctx)
    expect(again).toMatchObject({ scheduledAt: '2030-08-03 12:15:00', endsAt: '2030-08-03 13:00:00', tourStopOrder: 3 }) // margen por defecto: 15 min

    await expect(addTourStop(db, t.orgId, tourId, { stop: { agentId: agent.id }, gapMinutes: 999 }, ctx)).rejects.toMatchObject({ statusCode: 422 })
    expect(stopIds).toHaveLength(2)
  })

  it('valida como el alta: inmueble ajeno 404, en la papelera 422, comercial ajeno 404, choque con el tour 422, con la agenda 409 — sin escribir nada', async () => {
    const { db, t, b, agent, tourId } = await tourFixture('C2AddVal')
    const { addTourStop } = await tours()
    const before = (await db.select().from(schema.visits).where(eq(schema.visits.tourId, tourId))).length
    const agentB = await commercial(db, b.orgId)
    const pB = await flat(db, b.orgId)
    const trashed = await flat(db, t.orgId, { deletedAt: ts })

    await expect(addTourStop(db, t.orgId, tourId, { stop: { propertyId: pB.id, propertyKind: 'agent', agentId: agent.id, scheduledAt: '2030-08-03 15:00:00' } }, ctx)).rejects.toMatchObject({ statusCode: 404 })
    // El mismo id en el OTRO catálogo tampoco vale: se busca en el suyo.
    await expect(addTourStop(db, t.orgId, tourId, { stop: { propertyId: b.projectId, propertyKind: 'developer', agentId: agent.id, scheduledAt: '2030-08-03 15:00:00' } }, ctx)).rejects.toMatchObject({ statusCode: 404 })
    await expect(addTourStop(db, t.orgId, tourId, { stop: { propertyId: trashed.id, propertyKind: 'agent', agentId: agent.id, scheduledAt: '2030-08-03 15:00:00' } }, ctx)).rejects.toThrow(/papelera/)
    await expect(addTourStop(db, t.orgId, tourId, { stop: { agentId: agentB.id, scheduledAt: '2030-08-03 15:00:00' } }, ctx)).rejects.toMatchObject({ statusCode: 404 })
    await expect(addTourStop(db, t.orgId, tourId, { stop: { propertyKind: 'agent', propertyId: t.propertyId, agentId: agent.id, scheduledAt: '2030-08-03 15:00:00' }, gapMinutes: 15 }, ctx)).resolves.toBeTruthy()
    await expect(addTourStop(db, t.orgId, tourId, { stop: { agentId: agent.id, scheduledAt: '2030-08-03 10:30:00' } }, ctx)).rejects.toThrow(/se solapa con la parada 1 de este tour/)
    await expect(addTourStop(db, t.orgId, tourId, { stop: { agentId: agent.id, scheduledAt: 'mañana' } }, ctx)).rejects.toMatchObject({ statusCode: 422 })

    // La agenda real del comercial, fuera del tour.
    await db.insert(schema.visits).values({ organizationId: t.orgId, clientName: 'Otra cita', agentId: agent.id, scheduledAt: '2030-08-03 17:00:00', endsAt: '2030-08-03 18:00:00', status: 'scheduled', createdAt: ts })
    await expect(addTourStop(db, t.orgId, tourId, { stop: { agentId: agent.id, scheduledAt: '2030-08-03 17:30:00' } }, ctx)).rejects.toMatchObject({ statusCode: 409 })

    // El tour de otra agencia no existe para esta.
    await expect(addTourStop(db, b.orgId, tourId, { stop: { agentId: agentB.id, scheduledAt: '2030-08-04 10:00:00' } }, ctx)).rejects.toMatchObject({ statusCode: 404 })

    const after = (await db.select().from(schema.visits).where(eq(schema.visits.tourId, tourId))).length
    expect(after).toBe(before + 1) // sólo la parada válida
  })

  it('con lead: la parada nueva cuenta en su próxima acción', async () => {
    const { db, t, agent, l, tourId } = await tourFixture('C2AddLead')
    const { addTourStop } = await tours()
    await addTourStop(db, t.orgId, tourId, { stop: { agentId: agent.id, scheduledAt: '2030-08-02 09:00:00', durationMinutes: 30 } }, ctx)
    const [row] = await db.select({ nextActionAt: schema.leads.nextActionAt }).from(schema.leads).where(eq(schema.leads.id, l.id))
    expect(row.nextActionAt).toBe('2030-08-02 09:00:00')
  })
})

describe('C2 · FASE 18 — quitar una parada de un tour ya creado', () => {
  it('la cita queda cancelada con su motivo (no se borra), sigue en el tour, deja Activity con el tour y avisa al cliente', async () => {
    const { db, t, c, tourId, stopIds } = await tourFixture('C2Remove')
    const { removeTourStop, listTours } = await tours()

    await expect(removeTourStop(db, t.orgId, tourId, { stopId: stopIds[0], reason: '   ' }, ctx)).rejects.toThrow(/motivo/)
    const res = await removeTourStop(db, t.orgId, tourId, { stopId: stopIds[0], reason: 'Ya la vio con otra agencia' }, ctx)
    expect(res).toEqual({ id: tourId, stopId: stopIds[0] })

    const row = await visitRow(db, stopIds[0])
    expect(row).toMatchObject({ status: 'cancelled', cancellationReason: 'Ya la vio con otra agencia', tourId })
    expect(row.cancelledAt).toBeTruthy()
    const [tour] = await listTours(db, t.orgId)
    expect(tour.stops.map((s) => [s.id, s.status])).toEqual([
      [stopIds[0], 'cancelled'],
      [stopIds[1], 'scheduled'],
    ])

    const [act] = await db.select().from(schema.activities).where(and(eq(schema.activities.eventType, 'APPOINTMENT_CANCELLED'), eq(schema.activities.entityId, stopIds[0])))
    expect(act.contactId).toBe(c.id)
    expect(JSON.parse(act.metadataJson)).toEqual({ reason: 'Ya la vio con otra agencia', tourId, removedFromTour: true })
    const notes = await db.select().from(schema.appointmentNotifications).where(eq(schema.appointmentNotifications.visitId, stopIds[0]))
    expect(notes.some((n: any) => n.type === 'cancelled' && n.channel === 'internal')).toBe(true)
  })

  it('un tour no se queda sin paradas activas; una parada ya cancelada o ya hecha no se quita; ajena o de otro tour → 404', async () => {
    const { db, t, b, agent, tourId, stopIds } = await tourFixture('C2RemoveVal')
    const { removeTourStop, createTour } = await tours()

    await removeTourStop(db, t.orgId, tourId, { stopId: stopIds[0], reason: 'No le encaja' }, ctx)
    await expect(removeTourStop(db, t.orgId, tourId, { stopId: stopIds[0], reason: 'Otra vez' }, ctx)).rejects.toThrow(/ya está cancelada/)
    await expect(removeTourStop(db, t.orgId, tourId, { stopId: stopIds[1], reason: 'La última' }, ctx)).rejects.toThrow(/única parada activa/)
    expect((await visitRow(db, stopIds[1])).status).toBe('scheduled')

    const other = await createTour(db, t.orgId, {
      clientName: 'Otro',
      clientEmail: 'otro@example.com',
      stops: [
        { agentId: agent.id, scheduledAt: '2030-08-05 10:00:00' },
        { agentId: agent.id, scheduledAt: '2030-08-05 12:00:00' },
      ],
    })
    await db.update(schema.visits).set({ status: 'completed' }).where(eq(schema.visits.id, other.stopIds[0]))
    await expect(removeTourStop(db, t.orgId, other.id, { stopId: other.stopIds[0], reason: 'x' }, ctx)).rejects.toThrow(/ya se hizo/)
    // Una parada de otro tour, o el tour visto desde otra agencia: 404.
    await expect(removeTourStop(db, t.orgId, tourId, { stopId: other.stopIds[1], reason: 'x' }, ctx)).rejects.toMatchObject({ statusCode: 404 })
    await expect(removeTourStop(db, b.orgId, other.id, { stopId: other.stopIds[1], reason: 'x' }, ctx)).rejects.toMatchObject({ statusCode: 404 })
    expect((await visitRow(db, other.stopIds[1])).status).toBe('scheduled')
  })
})

describe('C2 · FASE 11 — vista propia de una selección', () => {
  async function selectionFixture(name: string) {
    const { db } = createTestDb()
    const a = await seedTenant(db, name)
    const b = await seedTenant(db, `${name}B`)
    const c = await contact(db, a.orgId, { whatsapp: '+34611222333' })
    const p1 = await flat(db, a.orgId, { reference: 'REF-UNO' })
    const p2 = await flat(db, a.orgId, { reference: 'REF-DOS', status: 'sold' })
    const svc = await import('../../server/utils/selections/service')
    const sel = await svc.createPropertySelection(db, a.orgId, {
      contactId: c.id,
      title: 'Para ver el sábado',
      items: [
        { propertyId: p1.id, propertyKind: 'agent', note: 'La del ático' },
        { propertyId: a.projectId, propertyKind: 'developer' },
        { propertyId: p2.id, propertyKind: 'agent' },
      ],
    })
    return { db, a, b, c, p1, p2, svc, sel: sel! }
  }

  it('el detalle trae contacto y cada propiedad en su orden con foto, precio, estado y catálogo; la papelera se marca', async () => {
    const { db, a, c, p1, p2, svc, sel } = await selectionFixture('C2SelDetail')
    await db.update(schema.agentProperties).set({ deletedAt: ts }).where(eq(schema.agentProperties.id, p2.id))

    const detail = await svc.getPropertySelectionDetail(db, a.orgId, sel.id)
    expect(detail!.contact).toMatchObject({ id: c.id, name: c.name, whatsapp: '+34611222333' })
    expect(detail!.items.map((i: any) => [i.propertyKind, i.propertyId, i.position])).toEqual([
      ['agent', p1.id, 0],
      ['developer', a.projectId, 1],
      ['agent', p2.id, 2],
    ])
    expect(detail!.items[0]).toMatchObject({ name: 'REF-UNO', price: 410_000, status: 'available', statusLabel: 'Disponible', image: p1.mainImage, location: 'Madrid', bedrooms: 3, note: 'La del ático', trashed: false, missing: false })
    expect(detail!.items[1]).toMatchObject({ name: 'C2SelDetail Tower', price: 500_000, statusLabel: 'Obra nueva', location: 'C2SelDetail Bay' })
    expect(detail!.items[2]).toMatchObject({ statusLabel: 'Vendida', trashed: true })
  })

  it('reordenar: cada propiedad exactamente una vez; si no, 422 y nada cambia', async () => {
    const { db, a, svc, sel } = await selectionFixture('C2SelOrder')
    const [i1, i2, i3] = sel.items.map((i: any) => i.id)

    const res = await svc.applyPropertySelectionAction(db, a.orgId, sel.id, { action: 'reorder', itemIds: [i3, i1, i2] }, { userId: a.userId })
    expect(res.selection!.items.map((i: any) => [i.id, i.position])).toEqual([
      [i3, 0],
      [i1, 1],
      [i2, 2],
    ])

    await expect(svc.applyPropertySelectionAction(db, a.orgId, sel.id, { action: 'reorder', itemIds: [i1, i2] })).rejects.toMatchObject({ statusCode: 422 })
    await expect(svc.applyPropertySelectionAction(db, a.orgId, sel.id, { action: 'reorder', itemIds: [i1, i1, i2] })).rejects.toMatchObject({ statusCode: 422 })
    await expect(svc.applyPropertySelectionAction(db, a.orgId, sel.id, { action: 'mezclar' })).rejects.toMatchObject({ statusCode: 422 })
    const now = await svc.getPropertySelection(db, a.orgId, sel.id)
    expect(now!.items.map((i: any) => i.id)).toEqual([i3, i1, i2])
  })

  it('quitar: borra sólo la fila de la selección (no la propiedad), renumera, y nunca la deja vacía', async () => {
    const { db, a, p1, svc, sel } = await selectionFixture('C2SelRemove')
    const [i1, i2, i3] = sel.items.map((i: any) => i.id)

    const res = await svc.applyPropertySelectionAction(db, a.orgId, sel.id, { action: 'remove', itemId: i1 })
    expect(res.removed).toEqual({ propertyId: p1.id, propertyKind: 'agent' })
    expect(res.selection!.items.map((i: any) => [i.id, i.position])).toEqual([
      [i2, 0],
      [i3, 1],
    ])
    expect(await db.select().from(schema.agentProperties).where(eq(schema.agentProperties.id, p1.id))).toHaveLength(1)

    await expect(svc.applyPropertySelectionAction(db, a.orgId, sel.id, { action: 'remove', itemId: i1 })).rejects.toMatchObject({ statusCode: 404 })
    await svc.applyPropertySelectionAction(db, a.orgId, sel.id, { action: 'remove', itemId: i2 })
    await expect(svc.applyPropertySelectionAction(db, a.orgId, sel.id, { action: 'remove', itemId: i3 })).rejects.toThrow(/al menos una propiedad/)
  })

  it('añadir: mismas reglas que al crearla (agencia, catálogo, papelera, sin repetir, máximo 30) y «Ampliada» en Activity', async () => {
    const { db, a, b, c, svc, sel, p1 } = await selectionFixture('C2SelAdd')
    const p3 = await flat(db, a.orgId)
    const pB = await flat(db, b.orgId)
    const trashed = await flat(db, a.orgId, { deletedAt: ts })

    const res = await svc.applyPropertySelectionAction(db, a.orgId, sel.id, { action: 'add', items: [{ propertyId: p3.id, propertyKind: 'agent', note: 'Mira el garaje' }, { propertyId: p1.id, propertyKind: 'agent' }] }, { userId: a.userId })
    expect(res.added).toEqual([{ propertyId: p3.id, propertyKind: 'agent', note: 'Mira el garaje' }]) // p1 ya estaba: no se duplica
    expect(res.selection!.items.at(-1)).toMatchObject({ propertyId: p3.id, position: 3, note: 'Mira el garaje' })

    const [act] = await db.select().from(schema.activities).where(and(eq(schema.activities.eventType, 'PROPERTY_SELECTION_CREATED'), eq(schema.activities.entityId, sel.id)))
    expect(act.contactId).toBe(c.id)
    expect(JSON.parse(act.metadataJson)).toEqual({ title: 'Para ver el sábado', added: 1, created: false })

    await expect(svc.applyPropertySelectionAction(db, a.orgId, sel.id, { action: 'add', items: [{ propertyId: pB.id, propertyKind: 'agent' }] })).rejects.toMatchObject({ statusCode: 404 })
    await expect(svc.applyPropertySelectionAction(db, a.orgId, sel.id, { action: 'add', items: [{ propertyId: b.projectId, propertyKind: 'developer' }] })).rejects.toMatchObject({ statusCode: 404 })
    await expect(svc.applyPropertySelectionAction(db, a.orgId, sel.id, { action: 'add', items: [{ propertyId: trashed.id, propertyKind: 'agent' }] })).rejects.toThrow(/papelera/)
    await expect(svc.applyPropertySelectionAction(db, a.orgId, sel.id, { action: 'add', items: [{ propertyId: p3.id, propertyKind: 'otro' }] })).rejects.toMatchObject({ statusCode: 422 })
    await expect(svc.applyPropertySelectionAction(db, a.orgId, sel.id, { action: 'add', items: [] })).rejects.toMatchObject({ statusCode: 422 })
    const many = []
    for (let i = 0; i < 27; i++) many.push({ propertyId: (await flat(db, a.orgId)).id, propertyKind: 'agent' })
    await expect(svc.applyPropertySelectionAction(db, a.orgId, sel.id, { action: 'add', items: many })).rejects.toThrow(/30/)
    expect((await svc.getPropertySelection(db, a.orgId, sel.id))!.items).toHaveLength(4)
  })

  it('lo añadido a una selección de una necesidad queda «Seleccionado» en su compatibilidad, como «Crear selección»', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'C2SelMatch')
    const c = await contact(db, a.orgId)
    const p1 = await flat(db, a.orgId)
    const p2 = await flat(db, a.orgId)
    const { createBuyerRequirement } = await import('../../server/utils/buyerRequirements/service')
    const { createSelectionFromMatch, markItemsSelectedForRequirement } = await import('../../server/utils/matching/actions')
    const svc = await import('../../server/utils/selections/service')
    const req = await createBuyerRequirement(ev(db), a.orgId, { contactId: c.id, priceMax: 650_000 })
    const { selection } = await createSelectionFromMatch(ev(db), a.orgId, { buyerRequirementId: req.id, items: [{ propertyId: p1.id, propertyKind: 'agent' }] })

    const res = await svc.applyPropertySelectionAction(db, a.orgId, selection.id, { action: 'add', propertyId: p2.id, propertyKind: 'agent' })
    await markItemsSelectedForRequirement(ev(db), a.orgId, req.id, res.added, a.userId)
    const [m] = await db.select().from(schema.propertyMatches).where(and(eq(schema.propertyMatches.buyerRequirementId, req.id), eq(schema.propertyMatches.propertyId, p2.id)))
    expect(m.status).toBe('selected')

    const detail = await svc.getPropertySelectionDetail(db, a.orgId, selection.id)
    expect(detail!.requirement).toMatchObject({ id: req.id })
  })

  it('aislamiento: otra agencia no ve, no reordena, no quita ni añade en una selección ajena (404)', async () => {
    const { db, a, b, svc, sel } = await selectionFixture('C2SelIso')
    const ids = sel.items.map((i: any) => i.id)
    const pB = await flat(db, b.orgId)

    expect(await svc.getPropertySelectionDetail(db, b.orgId, sel.id)).toBeNull()
    await expect(svc.applyPropertySelectionAction(db, b.orgId, sel.id, { action: 'reorder', itemIds: [...ids].reverse() })).rejects.toMatchObject({ statusCode: 404 })
    await expect(svc.applyPropertySelectionAction(db, b.orgId, sel.id, { action: 'remove', itemId: ids[0] })).rejects.toMatchObject({ statusCode: 404 })
    await expect(svc.applyPropertySelectionAction(db, b.orgId, sel.id, { action: 'add', items: [{ propertyId: pB.id, propertyKind: 'agent' }] })).rejects.toMatchObject({ statusCode: 404 })

    // Un item de OTRA selección (aunque sea de la misma agencia) no se puede quitar desde ésta.
    const other = await svc.createPropertySelection(db, a.orgId, { contactId: sel.contactId, title: 'Otra', items: [{ propertyId: a.propertyId, propertyKind: 'agent' }, { propertyId: a.projectId, propertyKind: 'developer' }] })
    await expect(svc.applyPropertySelectionAction(db, a.orgId, sel.id, { action: 'remove', itemId: other!.items[0].id })).rejects.toMatchObject({ statusCode: 404 })
    await expect(svc.applyPropertySelectionAction(db, a.orgId, sel.id, { action: 'reorder', itemIds: [other!.items[0].id, ids[1], ids[2]] })).rejects.toMatchObject({ statusCode: 422 })

    const untouched = await svc.getPropertySelection(db, a.orgId, sel.id)
    expect(untouched!.items.map((i: any) => i.id)).toEqual(ids)

    // Y el recurso genérico (/api/admin/property-selections/:id) responde 404 a la otra agencia, como cualquier otro.
    const { authorizeRecord } = await import('../../server/utils/tenantPolicy')
    const { adminResources } = await import('../../server/utils/adminResources')
    const def = adminResources['property-selections']
    await expect(authorizeRecord(db, { resourceKey: 'property-selections', table: def.table, policy: def.tenantPolicy, id: sel.id, orgId: b.orgId })).rejects.toMatchObject({ statusCode: 404 })
  })
})
