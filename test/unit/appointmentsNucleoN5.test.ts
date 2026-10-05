import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import * as schema from '../../server/db/schema'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'

/**
 * Núcleo inmobiliario, bloque N5 (FASES 17-20): citas con todos sus tipos y
 * campos y su edición, tours con hora y duración por parada en los dos
 * catálogos (y reordenar la ruta), resultado de visita estructurado con
 * oferta real, filtros del calendario (oficina, tipo, cliente) e iCal con la
 * zona horaria correcta — siempre dentro de la agencia. Base real
 * (sqlite-proxy + migraciones reales).
 */

const ts = '2026-01-01 00:00:00'
let seq = 0
const ctx = { userId: 1, env: {} }

async function commercial(db: any, orgId: number, over: Record<string, any> = {}) {
  seq += 1
  const [row] = await db
    .insert(schema.teamMembers)
    .values({ organizationId: orgId, name: `Comercial ${seq}`, slug: `n5-comercial-${seq}`, email: `n5-comercial-${seq}@example.com`, position: 'Comercial', slotDurationMinutes: 60, createdAt: ts, updatedAt: ts, ...over })
    .returning()
  return row
}
async function office(db: any, orgId: number, over: Record<string, any> = {}) {
  seq += 1
  const [row] = await db.insert(schema.offices).values({ organizationId: orgId, name: `Oficina ${seq}`, createdAt: ts, updatedAt: ts, ...over }).returning()
  return row
}
async function contact(db: any, orgId: number, over: Record<string, any> = {}) {
  seq += 1
  const [row] = await db.insert(schema.contacts).values({ organizationId: orgId, name: `Contacto ${seq}`, email: `n5-contacto-${seq}@example.com`, createdAt: ts, updatedAt: ts, ...over }).returning()
  return row
}
async function lead(db: any, orgId: number, over: Record<string, any> = {}) {
  seq += 1
  const [row] = await db.insert(schema.leads).values({ organizationId: orgId, name: `Lead ${seq}`, email: `n5-lead-${seq}@example.com`, source: 'web', status: 'new', stage: 'new', score: 0, createdAt: ts, updatedAt: ts, ...over }).returning()
  return row
}
async function visitRow(db: any, id: number) {
  return (await db.select().from(schema.visits).where(eq(schema.visits.id, id)))[0]
}
async function trashDeveloperProperty(db: any, id: number) {
  await db.update(schema.developerProperties).set({ deletedAt: ts }).where(eq(schema.developerProperties.id, id))
}

describe('catálogo de citas compartido', () => {
  it('incluye los tipos nuevos con etiqueta en castellano y canal por defecto coherente', async () => {
    const cat = await import('../../utils/appointmentCatalog')
    for (const t of ['property_viewing', 'call', 'video_call', 'meeting', 'valuation', 'listing', 'signing', 'notary', 'open_house', 'other']) {
      expect(cat.APPOINTMENT_TYPES).toContain(t)
      expect(cat.APPOINTMENT_TYPE_LABELS[t]).toBeTruthy()
    }
    expect(cat.APPOINTMENT_TYPE_LABELS.valuation).toBe('Tasación')
    expect(cat.APPOINTMENT_TYPE_LABELS.listing).toBe('Captación')
    expect(cat.APPOINTMENT_TYPE_LABELS.signing).toBe('Firma')
    expect(cat.APPOINTMENT_TYPE_LABELS.open_house).toBe('Open house')
    expect(cat.defaultChannelFor('video_call')).toBe('video')
    expect(cat.defaultChannelFor('call')).toBe('phone')
    expect(cat.defaultChannelFor('valuation')).toBe('in_person')
    expect(cat.isValidTimeZone('Europe/Madrid')).toBe(true)
    expect(cat.isValidTimeZone('UTC')).toBe(true)
    expect(cat.isValidTimeZone('Marte/Olympus')).toBe(false)
    expect(cat.isValidTimeZone('')).toBe(false)
  })

  it('el resultado de visita del servidor usa los mismos valores que el panel', async () => {
    const cat = await import('../../utils/appointmentCatalog')
    const { VISIT_OUTCOMES } = await import('../../server/utils/appointments/outcome')
    expect([...VISIT_OUTCOMES]).toEqual([...cat.VISIT_OUTCOMES])
    for (const o of VISIT_OUTCOMES) expect(cat.VISIT_OUTCOME_LABELS[o]).toBeTruthy()
  })
})

describe('FASE 17 — alta de una cita con todos sus campos', () => {
  it('guarda tipo, contacto, oficina (heredada del comercial), zona horaria (de la oficina), fin libre, punto de encuentro, notas, notas internas y confirmación interna', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'N5Alta')
    const of = await office(db, t.orgId, { timezone: 'Atlantic/Canary' })
    const agent = await commercial(db, t.orgId, { officeId: of.id })
    const c = await contact(db, t.orgId, { name: 'Marta Propietaria', phone: '+34600111222' })
    const { createAdminAppointment } = await import('../../server/utils/appointments/adminCreate')

    const v = await createAdminAppointment(db, t.orgId, {
      agentId: agent.id,
      contactId: c.id,
      type: 'valuation',
      propertyId: t.propertyId,
      propertyKind: 'agent',
      scheduledAt: '2026-05-04T10:00',
      endsAt: '2026-05-04 11:30:00',
      meetingPoint: 'Portal del edificio',
      notes: 'Llevar el dossier de comparables',
      internalNotes: 'El propietario pide 320.000 €',
      confirmationStatus: 'confirmed_internal',
      createdBy: t.userId,
    })
    const row = await visitRow(db, v.id)
    expect(row).toMatchObject({
      type: 'valuation',
      channel: 'in_person',
      clientName: 'Marta Propietaria', // del contacto
      clientEmail: c.email,
      clientPhone: '+34600111222',
      contactId: c.id,
      officeId: of.id,
      timezone: 'Atlantic/Canary',
      scheduledAt: '2026-05-04 10:00:00',
      endsAt: '2026-05-04 11:30:00',
      durationMinutes: 90,
      meetingPoint: 'Portal del edificio',
      notes: 'Llevar el dossier de comparables',
      internalNotes: 'El propietario pide 320.000 €',
      confirmationStatus: 'confirmed_internal',
      reminderStatus: 'pending',
      propertyKind: 'agent',
      createdBy: t.userId,
    })
    expect(row.confirmedAt).toBeTruthy()
  })

  it('una videollamada sale por vídeo con su enlace; un open house no exige email ni teléfono', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'N5Tipos')
    const agent = await commercial(db, t.orgId)
    const { createAdminAppointment } = await import('../../server/utils/appointments/adminCreate')

    const video = await createAdminAppointment(db, t.orgId, { clientName: 'Cliente remoto', clientEmail: 'remoto@example.com', agentId: agent.id, type: 'video_call', scheduledAt: '2026-05-05 09:00:00' })
    expect(video.channel).toBe('video')
    expect(video.videoLink).toMatch(/^https:\/\/meet\.jit\.si\//)
    await expect(createAdminAppointment(db, t.orgId, { clientName: 'X', clientEmail: 'x@example.com', agentId: agent.id, type: 'video_call', channel: 'in_person', scheduledAt: '2026-05-05 12:00:00' })).rejects.toMatchObject({ statusCode: 422 })

    const openHouse = await createAdminAppointment(db, t.orgId, { clientName: 'Open house ático', agentId: agent.id, type: 'open_house', propertyId: t.projectId, propertyKind: 'developer', scheduledAt: '2026-05-06 10:00:00', durationMinutes: 240 })
    expect(openHouse).toMatchObject({ type: 'open_house', durationMinutes: 240, endsAt: '2026-05-06 14:00:00', reminderStatus: 'not_applicable' })
  })

  it('valida tipo, zona horaria, fin y confirmación — 422, nunca se ignoran', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'N5Validacion')
    const agent = await commercial(db, t.orgId)
    const { createAdminAppointment } = await import('../../server/utils/appointments/adminCreate')
    const base = { clientName: 'Cliente', clientEmail: 'c@example.com', agentId: agent.id, scheduledAt: '2026-05-07 10:00:00' }

    await expect(createAdminAppointment(db, t.orgId, { ...base, type: 'merienda' })).rejects.toThrow(/Tipo de cita/)
    await expect(createAdminAppointment(db, t.orgId, { ...base, timezone: 'Marte/Olympus' })).rejects.toThrow(/Zona horaria/)
    await expect(createAdminAppointment(db, t.orgId, { ...base, endsAt: '2026-05-07 09:00:00' })).rejects.toThrow(/posterior al inicio/)
    await expect(createAdminAppointment(db, t.orgId, { ...base, durationMinutes: 13 * 60 })).rejects.toThrow(/durationMinutes/)
    await expect(createAdminAppointment(db, t.orgId, { ...base, scheduledAt: '2026-02-30 10:00:00' })).rejects.toThrow(/no existe/)
    await expect(createAdminAppointment(db, t.orgId, { ...base, confirmationStatus: 'confirmed' })).rejects.toThrow(/cliente/)
    expect(await db.select().from(schema.visits).where(eq(schema.visits.agentId, agent.id))).toEqual([])
  })

  it('aislamiento: lead, contacto, oficina, inmueble, operación o comercial de otra agencia → 404 y no se crea nada; inmueble en la papelera → 422', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'N5IsoA')
    const b = await seedTenant(db, 'N5IsoB')
    const agentA = await commercial(db, a.orgId)
    const agentB = await commercial(db, b.orgId)
    const contactB = await contact(db, b.orgId)
    const officeB = await office(db, b.orgId)
    const { createAdminAppointment } = await import('../../server/utils/appointments/adminCreate')
    const base = { clientName: 'Cliente', clientEmail: 'c@example.com', agentId: agentA.id, scheduledAt: '2026-05-08 10:00:00' }

    await expect(createAdminAppointment(db, a.orgId, { ...base, leadId: b.leadId })).rejects.toMatchObject({ statusCode: 404 })
    await expect(createAdminAppointment(db, a.orgId, { ...base, contactId: contactB.id })).rejects.toMatchObject({ statusCode: 404 })
    await expect(createAdminAppointment(db, a.orgId, { ...base, officeId: officeB.id })).rejects.toMatchObject({ statusCode: 404 })
    await expect(createAdminAppointment(db, a.orgId, { ...base, propertyId: b.propertyId, propertyKind: 'agent' })).rejects.toMatchObject({ statusCode: 404 })
    await expect(createAdminAppointment(db, a.orgId, { ...base, dealId: 999999 })).rejects.toMatchObject({ statusCode: 404 })
    await expect(createAdminAppointment(db, a.orgId, { ...base, agentId: agentB.id })).rejects.toMatchObject({ statusCode: 404 })
    // Un inmueble de 2ª mano buscado como obra nueva no existe en ese catálogo.
    await expect(createAdminAppointment(db, a.orgId, { ...base, propertyId: a.propertyId + 100000, propertyKind: 'developer' })).rejects.toMatchObject({ statusCode: 404 })

    await trashDeveloperProperty(db, a.projectId)
    await expect(createAdminAppointment(db, a.orgId, { ...base, propertyId: a.projectId, propertyKind: 'developer' })).rejects.toMatchObject({ statusCode: 422 })

    expect(await db.select().from(schema.visits).where(eq(schema.visits.agentId, agentA.id))).toEqual([])
  })

  it('el contacto tiene que ser la persona del lead si el lead ya la tiene', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'N5LeadContacto')
    const agent = await commercial(db, t.orgId)
    const c1 = await contact(db, t.orgId)
    const c2 = await contact(db, t.orgId)
    const l = await lead(db, t.orgId, { contactId: c1.id })
    const { createAdminAppointment } = await import('../../server/utils/appointments/adminCreate')

    await expect(createAdminAppointment(db, t.orgId, { agentId: agent.id, leadId: l.id, contactId: c2.id, scheduledAt: '2026-05-09 10:00:00' })).rejects.toThrow(/no coincide/)
    const v = await createAdminAppointment(db, t.orgId, { agentId: agent.id, leadId: l.id, scheduledAt: '2026-05-09 12:00:00' })
    expect(v).toMatchObject({ leadId: l.id, contactId: c1.id, clientName: c1.name })
  })

  it('una cita que empezó la víspera y cruza la medianoche también ocupa la agenda', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'N5Medianoche')
    const agent = await commercial(db, t.orgId)
    const { createAdminAppointment } = await import('../../server/utils/appointments/adminCreate')
    await createAdminAppointment(db, t.orgId, { clientName: 'Open house nocturno', agentId: agent.id, type: 'open_house', scheduledAt: '2026-05-10 22:00:00', endsAt: '2026-05-11 01:00:00' })
    await expect(createAdminAppointment(db, t.orgId, { clientName: 'Madrugador', clientEmail: 'm@example.com', agentId: agent.id, scheduledAt: '2026-05-11 00:30:00' })).rejects.toMatchObject({ statusCode: 409 })
  })
})

describe('FASE 17 — editar una cita existente', () => {
  async function setup(name: string) {
    const { db } = createTestDb()
    const t = await seedTenant(db, name)
    const agent = await commercial(db, t.orgId)
    const { createAdminAppointment } = await import('../../server/utils/appointments/adminCreate')
    const v = await createAdminAppointment(db, t.orgId, { clientName: 'Cliente Edición', clientEmail: 'edicion@example.com', agentId: agent.id, propertyId: t.projectId, propertyKind: 'developer', scheduledAt: '2026-06-01 10:00:00' })
    const { updateAppointment } = await import('../../server/utils/appointments/update')
    return { db, t, agent, v, updateAppointment }
  }

  it('cambia inmueble (al otro catálogo), lead, contacto, comercial, oficina, inicio y fin libres, zona, punto de encuentro, notas, notas internas y tipo', async () => {
    const { db, t, v, updateAppointment } = await setup('N5Editar')
    const agent2 = await commercial(db, t.orgId)
    const of = await office(db, t.orgId)
    const c = await contact(db, t.orgId)
    const l = await lead(db, t.orgId, { contactId: c.id })

    await updateAppointment(
      db,
      t.orgId,
      v.id,
      {
        propertyId: t.propertyId,
        propertyKind: 'agent',
        leadId: l.id,
        agentId: agent2.id,
        officeId: of.id,
        scheduledAt: '2026-06-02T17:15',
        endsAt: '2026-06-02 18:05:00',
        timezone: 'Europe/Madrid',
        meetingPoint: 'Cafetería de la esquina',
        notes: 'Trae la nómina',
        internalNotes: 'Cliente muy sensible al precio',
        type: 'meeting',
      },
      ctx,
    )
    const row = await visitRow(db, v.id)
    expect(row).toMatchObject({
      propertyId: t.propertyId,
      propertyKind: 'agent',
      leadId: l.id,
      contactId: c.id, // el del lead
      agentId: agent2.id,
      agentName: agent2.name,
      officeId: of.id,
      scheduledAt: '2026-06-02 17:15:00',
      endsAt: '2026-06-02 18:05:00',
      durationMinutes: 50,
      timezone: 'Europe/Madrid',
      meetingPoint: 'Cafetería de la esquina',
      notes: 'Trae la nómina',
      internalNotes: 'Cliente muy sensible al precio',
      type: 'meeting',
    })
    expect(row.updatedAt).toBeTruthy()
  })

  it('cancelar exige motivo; con motivo guarda motivo y fecha; reactivar los limpia', async () => {
    const { db, t, v, updateAppointment } = await setup('N5Cancelar')
    await expect(updateAppointment(db, t.orgId, v.id, { status: 'cancelled' }, ctx)).rejects.toThrow(/motivo/)
    await expect(updateAppointment(db, t.orgId, v.id, { status: 'cancelled', cancellationReason: '   ' }, ctx)).rejects.toThrow(/motivo/)
    await expect(updateAppointment(db, t.orgId, v.id, { notes: 'x', cancellationReason: 'no procede' }, ctx)).rejects.toThrow(/sólo se guarda al cancelar/)

    await updateAppointment(db, t.orgId, v.id, { status: 'cancelled', cancellationReason: 'El cliente ya compró otra vivienda' }, ctx)
    let row = await visitRow(db, v.id)
    expect(row).toMatchObject({ status: 'cancelled', cancellationReason: 'El cliente ya compró otra vivienda' })
    expect(row.cancelledAt).toBeTruthy()

    await updateAppointment(db, t.orgId, v.id, { status: 'scheduled' }, ctx)
    row = await visitRow(db, v.id)
    expect(row).toMatchObject({ status: 'scheduled', cancellationReason: null, cancelledAt: null })
  })

  it('la confirmación interna se anota; la del cliente no se puede dar en su nombre; mover la cita la invalida y reinicia los recordatorios', async () => {
    const { db, t, v, updateAppointment } = await setup('N5Confirmar')
    await expect(updateAppointment(db, t.orgId, v.id, { confirmationStatus: 'confirmed' }, ctx)).rejects.toMatchObject({ statusCode: 422 })
    await updateAppointment(db, t.orgId, v.id, { confirmationStatus: 'confirmed_internal' }, ctx)
    expect((await visitRow(db, v.id)).confirmationStatus).toBe('confirmed_internal')

    await db.update(schema.visits).set({ reminder24hSentAt: ts, reminderStatus: 'sent' }).where(eq(schema.visits.id, v.id))
    await updateAppointment(db, t.orgId, v.id, { scheduledAt: '2026-06-03 10:00:00' }, ctx)
    const row = await visitRow(db, v.id)
    expect(row).toMatchObject({ confirmationStatus: 'pending', confirmedAt: null, reminder24hSentAt: null, reminderStatus: 'pending', durationMinutes: 60, endsAt: '2026-06-03 11:00:00' })
  })

  it('referencias de otra agencia → 404; un inmueble nuevo en la papelera → 422; conservar el que ya tenía, aunque esté en la papelera, no se revalida', async () => {
    const { db, t, v, updateAppointment } = await setup('N5EditarIso')
    const b = await seedTenant(db, 'N5EditarIsoB')
    const agentB = await commercial(db, b.orgId)
    const officeB = await office(db, b.orgId)
    const contactB = await contact(db, b.orgId)

    await expect(updateAppointment(db, t.orgId, v.id, { leadId: b.leadId }, ctx)).rejects.toMatchObject({ statusCode: 404 })
    await expect(updateAppointment(db, t.orgId, v.id, { contactId: contactB.id }, ctx)).rejects.toMatchObject({ statusCode: 404 })
    await expect(updateAppointment(db, t.orgId, v.id, { officeId: officeB.id }, ctx)).rejects.toMatchObject({ statusCode: 404 })
    await expect(updateAppointment(db, t.orgId, v.id, { agentId: agentB.id }, ctx)).rejects.toMatchObject({ statusCode: 404 })
    await expect(updateAppointment(db, t.orgId, v.id, { propertyId: b.propertyId, propertyKind: 'agent' }, ctx)).rejects.toMatchObject({ statusCode: 404 })
    // La cita de esta agencia, vista desde la otra, no existe.
    await expect(updateAppointment(db, b.orgId, v.id, { notes: 'intruso' }, ctx)).rejects.toMatchObject({ statusCode: 404 })

    const [otherProject] = await db.insert(schema.developerProperties).values({ organizationId: t.orgId, developerId: t.developerId, name: 'Proyecto en papelera', slug: `n5-papelera-${Date.now()}`, status: 'new', deletedAt: ts, createdAt: ts, updatedAt: ts }).returning()
    await expect(updateAppointment(db, t.orgId, v.id, { propertyId: otherProject.id, propertyKind: 'developer' }, ctx)).rejects.toMatchObject({ statusCode: 422 })

    await trashDeveloperProperty(db, t.projectId)
    await updateAppointment(db, t.orgId, v.id, { propertyId: t.projectId, propertyKind: 'developer', notes: 'Sigue siendo la misma visita' }, ctx)
    expect((await visitRow(db, v.id)).notes).toBe('Sigue siendo la misma visita')
  })

  it('mover la cita encima de otra del mismo comercial → 409', async () => {
    const { db, t, agent, v, updateAppointment } = await setup('N5Solape')
    const { createAdminAppointment } = await import('../../server/utils/appointments/adminCreate')
    await createAdminAppointment(db, t.orgId, { clientName: 'Otra', clientEmail: 'otra@example.com', agentId: agent.id, scheduledAt: '2026-06-01 12:00:00' })
    await expect(updateAppointment(db, t.orgId, v.id, { endsAt: '2026-06-01 12:30:00' }, ctx)).rejects.toMatchObject({ statusCode: 409 })
  })
})

describe('FASE 18 — tours con hora y duración por parada en los dos catálogos', () => {
  it('10:00 (45 min) y 10:45 (60 min): cada parada con su duración, su catálogo y su propertyKind; lead, contacto y notas en todas', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'N5Tour')
    const agent = await commercial(db, t.orgId)
    const c = await contact(db, t.orgId)
    const l = await lead(db, t.orgId, { contactId: c.id })
    const { createTour, listTours } = await import('../../server/utils/appointments/tours')

    const res = await createTour(db, t.orgId, {
      leadId: l.id,
      notes: 'Le preocupa el aparcamiento',
      stops: [
        { propertyId: t.projectId, propertyKind: 'developer', agentId: agent.id, scheduledAt: '2026-07-01 10:00:00', durationMinutes: 45 },
        { propertyId: t.propertyId, propertyKind: 'agent', agentId: agent.id, scheduledAt: '2026-07-01 10:45:00', endsAt: '2026-07-01 11:45:00', meetingPoint: 'Portal 2' },
      ],
    })
    const stops = await db.select().from(schema.visits).where(eq(schema.visits.tourId, res.id)).orderBy(schema.visits.tourStopOrder)
    expect(stops[0]).toMatchObject({ propertyKind: 'developer', propertyId: t.projectId, scheduledAt: '2026-07-01 10:00:00', endsAt: '2026-07-01 10:45:00', durationMinutes: 45, leadId: l.id, contactId: c.id, clientName: c.name }) // la persona del lead
    expect(stops[1]).toMatchObject({ propertyKind: 'agent', propertyId: t.propertyId, scheduledAt: '2026-07-01 10:45:00', endsAt: '2026-07-01 11:45:00', durationMinutes: 60, meetingPoint: 'Portal 2', contactId: c.id })

    const [tour] = await listTours(db, t.orgId)
    expect(tour).toMatchObject({ leadId: l.id, leadName: l.name, contactId: c.id, contactName: c.name, notes: 'Le preocupa el aparcamiento' })
    expect(tour.stops.map((s) => s.propertyKind)).toEqual(['developer', 'agent'])
  })

  it('una parada que se come la siguiente del mismo comercial se rechaza; un inmueble ajeno o en la papelera se señala por su número', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'N5TourVal')
    const b = await seedTenant(db, 'N5TourValB')
    const agent = await commercial(db, t.orgId)
    const { createTour } = await import('../../server/utils/appointments/tours')
    const base = { clientName: 'Cliente', clientEmail: 'c@example.com' }

    await expect(
      createTour(db, t.orgId, {
        ...base,
        stops: [
          { agentId: agent.id, scheduledAt: '2026-07-02 10:00:00', durationMinutes: 90 },
          { agentId: agent.id, scheduledAt: '2026-07-02 11:00:00', durationMinutes: 30 },
        ],
      }),
    ).rejects.toThrow(/Parada 2: se solapa/)
    await expect(createTour(db, t.orgId, { ...base, stops: [{ agentId: agent.id, scheduledAt: '2026-07-02 10:00:00' }, { propertyId: b.propertyId, propertyKind: 'agent', agentId: agent.id, scheduledAt: '2026-07-02 12:00:00' }] })).rejects.toThrow(/Parada 2: inmueble no encontrado/)
    await trashDeveloperProperty(db, t.projectId)
    await expect(createTour(db, t.orgId, { ...base, stops: [{ propertyId: t.projectId, propertyKind: 'developer', agentId: agent.id, scheduledAt: '2026-07-02 10:00:00' }] })).rejects.toThrow(/Parada 1: La propiedad está en la papelera/)
    await expect(createTour(db, t.orgId, { ...base, contactId: (await contact(db, b.orgId)).id, stops: [{ agentId: agent.id, scheduledAt: '2026-07-02 10:00:00' }] })).rejects.toMatchObject({ statusCode: 404 })
    expect(await db.select().from(schema.propertyTours).where(eq(schema.propertyTours.organizationId, t.orgId))).toEqual([])
  })

  it('editar la cabecera propaga cliente, lead y contacto a cada parada; otra agencia no puede tocarlo', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'N5TourEdit')
    const b = await seedTenant(db, 'N5TourEditB')
    const agent = await commercial(db, t.orgId)
    const c = await contact(db, t.orgId)
    const { createTour, updateTour } = await import('../../server/utils/appointments/tours')
    const res = await createTour(db, t.orgId, { clientName: 'Sin ficha', clientPhone: '600000000', stops: [{ agentId: agent.id, scheduledAt: '2026-07-03 10:00:00' }, { agentId: agent.id, scheduledAt: '2026-07-03 12:00:00' }] })

    await updateTour(db, t.orgId, res.id, { contactId: c.id, leadId: t.leadId, notes: 'Quiere terraza', clientName: 'Ya con ficha' })
    const stops = await db.select().from(schema.visits).where(eq(schema.visits.tourId, res.id))
    expect(stops.every((s: any) => s.contactId === c.id && s.leadId === t.leadId && s.clientName === 'Ya con ficha')).toBe(true)
    const [tour] = await db.select().from(schema.propertyTours).where(eq(schema.propertyTours.id, res.id))
    expect(tour).toMatchObject({ notes: 'Quiere terraza', leadId: t.leadId, clientName: 'Ya con ficha' })

    await expect(updateTour(db, b.orgId, res.id, { notes: 'intruso' })).rejects.toMatchObject({ statusCode: 404 })
    await expect(updateTour(db, t.orgId, res.id, { contactId: (await contact(db, b.orgId)).id })).rejects.toMatchObject({ statusCode: 404 })
  })

  it('reordenar la ruta recalcula las horas encadenadas con el margen, conservando la duración de cada parada (y sin chocar consigo misma)', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'N5TourReorder')
    const b = await seedTenant(db, 'N5TourReorderB')
    const agent = await commercial(db, t.orgId)
    const { createTour, reorderTour } = await import('../../server/utils/appointments/tours')
    const res = await createTour(db, t.orgId, {
      clientName: 'Ruta',
      clientEmail: 'ruta@example.com',
      stops: [
        { agentId: agent.id, scheduledAt: '2026-07-04 10:00:00', durationMinutes: 45 },
        { agentId: agent.id, scheduledAt: '2026-07-04 10:45:00', durationMinutes: 60 },
        { agentId: agent.id, scheduledAt: '2026-07-04 12:00:00', durationMinutes: 30 },
      ],
    })
    const [s1, s2, s3] = res.stopIds
    await db.update(schema.visits).set({ confirmationStatus: 'confirmed_internal' }).where(eq(schema.visits.id, s3))

    const out = await reorderTour(db, t.orgId, res.id, { stopIds: [s3, s1, s2], recalculate: true, gapMinutes: 15 }, ctx)
    expect(out.moved.sort()).toEqual([s1, s2, s3].sort())
    const rows = await db.select().from(schema.visits).where(eq(schema.visits.tourId, res.id)).orderBy(schema.visits.tourStopOrder)
    expect(rows.map((r: any) => [r.id, r.scheduledAt, r.endsAt, r.durationMinutes])).toEqual([
      [s3, '2026-07-04 10:00:00', '2026-07-04 10:30:00', 30],
      [s1, '2026-07-04 10:45:00', '2026-07-04 11:30:00', 45],
      [s2, '2026-07-04 11:45:00', '2026-07-04 12:45:00', 60],
    ])
    expect(rows[0].confirmationStatus).toBe('pending')

    // Sólo reordenar, sin recalcular: las horas no se tocan.
    await reorderTour(db, t.orgId, res.id, { stopIds: [s1, s2, s3] }, ctx)
    const again = await db.select().from(schema.visits).where(eq(schema.visits.tourId, res.id)).orderBy(schema.visits.tourStopOrder)
    expect(again.map((r: any) => r.id)).toEqual([s1, s2, s3])
    expect(again.find((r: any) => r.id === s3).scheduledAt).toBe('2026-07-04 10:00:00')

    await expect(reorderTour(db, t.orgId, res.id, { stopIds: [s1, s2] }, ctx)).rejects.toMatchObject({ statusCode: 422 })
    await expect(reorderTour(db, b.orgId, res.id, { stopIds: [s1, s2, s3] }, ctx)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('recalcular no pisa la agenda real del comercial (409) ni mueve un tour ya empezado (422)', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'N5TourReorderConflict')
    const agent = await commercial(db, t.orgId)
    const { createTour, reorderTour } = await import('../../server/utils/appointments/tours')
    const res = await createTour(db, t.orgId, {
      clientName: 'Ruta',
      clientEmail: 'ruta@example.com',
      stops: [
        { agentId: agent.id, scheduledAt: '2026-07-05 10:00:00', durationMinutes: 30 },
        { agentId: agent.id, scheduledAt: '2026-07-05 12:00:00', durationMinutes: 30 },
      ],
    })
    await db.insert(schema.visits).values({ organizationId: t.orgId, clientName: 'Otra cita', agentId: agent.id, scheduledAt: '2026-07-05 10:45:00', endsAt: '2026-07-05 11:15:00', status: 'scheduled', createdAt: ts })
    await expect(reorderTour(db, t.orgId, res.id, { stopIds: res.stopIds, recalculate: true, gapMinutes: 15 }, ctx)).rejects.toMatchObject({ statusCode: 409 })

    await db.update(schema.visits).set({ status: 'completed' }).where(eq(schema.visits.id, res.stopIds[0]))
    await expect(reorderTour(db, t.orgId, res.id, { stopIds: [...res.stopIds].reverse(), recalculate: true }, ctx)).rejects.toThrow(/ya ha empezado/)
  })
})

describe('FASE 19 — resultado estructurado de la visita', () => {
  async function completedVisit(name: string, over: Record<string, any> = {}) {
    const { db } = createTestDb()
    const t = await seedTenant(db, name)
    const agent = await commercial(db, t.orgId)
    const { createAdminAppointment } = await import('../../server/utils/appointments/adminCreate')
    const v = await createAdminAppointment(db, t.orgId, { clientName: 'Comprador', clientEmail: `${name}@example.com`, agentId: agent.id, propertyId: t.propertyId, propertyKind: 'agent', scheduledAt: '2026-08-01 10:00:00', ...over })
    await db.update(schema.visits).set({ status: 'completed' }).where(eq(schema.visits.id, v.id))
    const { recordVisitOutcome } = await import('../../server/utils/appointments/outcome')
    return { db, t, agent, v, recordVisitOutcome }
  }

  it('guarda interés, qué le gustó y qué no por separado, precio, ubicación, estado, distribución y las marcas', async () => {
    const { db, t, v, recordVisitOutcome } = await completedVisit('N5Resultado')
    await recordVisitOutcome(db, t.orgId, v.id, {
      outcome: 'wants_to_think',
      interestLevel: 4,
      liked: 'La luz y la terraza',
      disliked: 'La cocina sin reformar',
      pricePerception: 'expensive',
      locationRating: 5,
      conditionRating: 2,
      layoutRating: '3',
      wantsSecondVisit: true,
      wantsToOffer: false,
      notes: 'Viene con su pareja la próxima vez',
    })
    expect(await visitRow(db, v.id)).toMatchObject({
      outcome: 'wants_to_think',
      interestLevel: 4,
      outcomeLiked: 'La luz y la terraza',
      outcomeDisliked: 'La cocina sin reformar',
      pricePerception: 'expensive',
      locationRating: 5,
      conditionRating: 2,
      layoutRating: 3,
      wantsSecondVisit: 1,
      wantsToOffer: 0,
      discarded: null,
      outcomeNotes: 'Viene con su pareja la próxima vez',
    })
  })

  it('valida las valoraciones y la coherencia del descarte, sin escribir nada', async () => {
    const { db, t, v, recordVisitOutcome } = await completedVisit('N5ResultadoVal')
    await expect(recordVisitOutcome(db, t.orgId, v.id, { outcome: 'interested', interestLevel: 6 })).rejects.toThrow(/Interés/)
    await expect(recordVisitOutcome(db, t.orgId, v.id, { outcome: 'interested', locationRating: 0 })).rejects.toThrow(/Ubicación/)
    await expect(recordVisitOutcome(db, t.orgId, v.id, { outcome: 'interested', pricePerception: 'regalado' })).rejects.toThrow(/precio/)
    await expect(recordVisitOutcome(db, t.orgId, v.id, { outcome: 'interested', discarded: true })).rejects.toThrow(/descartado/)
    expect((await visitRow(db, v.id)).outcome).toBeNull()
  })

  it('descartar deja el resultado y el match de esa persona con el inmueble como descartado', async () => {
    const { db, t, v, recordVisitOutcome } = await completedVisit('N5Descartar')
    const c = await contact(db, t.orgId)
    await db.update(schema.visits).set({ contactId: c.id }).where(eq(schema.visits.id, v.id))
    const [req] = await db.insert(schema.buyerRequirements).values({ organizationId: t.orgId, contactId: c.id, title: 'Piso', createdAt: ts, updatedAt: ts }).returning()
    const [match] = await db.insert(schema.propertyMatches).values({ organizationId: t.orgId, buyerRequirementId: req.id, contactId: c.id, propertyId: t.propertyId, score: 80, status: 'new', createdAt: ts, updatedAt: ts }).returning()

    await recordVisitOutcome(db, t.orgId, v.id, { outcome: 'not_interested', discarded: true, disliked: 'Demasiado ruido' })
    expect((await visitRow(db, v.id)).discarded).toBe(1)
    const [after] = await db.select().from(schema.propertyMatches).where(eq(schema.propertyMatches.id, match.id))
    expect(after.status).toBe('discarded')
  })

  it('desde el resultado se crea una oferta REAL (2ª mano) vinculando al comprador, y se ve en la lista de citas', async () => {
    const { db, t, v, recordVisitOutcome } = await completedVisit('N5Oferta')
    const b = await seedTenant(db, 'N5OfertaB')
    const c = await contact(db, t.orgId)

    // Sin comprador: 422 y nada escrito.
    await expect(recordVisitOutcome(db, t.orgId, v.id, { outcome: 'interested', createOffer: { amount: 250000 } })).rejects.toThrow(/comprador identificado/)
    // Comprador de otra agencia: 404.
    await expect(recordVisitOutcome(db, t.orgId, v.id, { outcome: 'interested', contactId: (await contact(db, b.orgId)).id, createOffer: { amount: 250000 } })).rejects.toMatchObject({ statusCode: 404 })

    // Financiación fuera del catálogo de la oferta: 422 antes de anotar nada.
    await expect(recordVisitOutcome(db, t.orgId, v.id, { outcome: 'interested', contactId: c.id, createOffer: { amount: 250000, financeCondition: 'Hipoteca 80 %' } })).rejects.toThrow(/financiación/)
    expect((await visitRow(db, v.id)).outcome).toBeNull()
    const res = await recordVisitOutcome(db, t.orgId, v.id, { outcome: 'interested', interestLevel: 5, contactId: c.id, createOffer: { amount: 250000, conditions: 'Sujeta a hipoteca', financeCondition: 'mortgage_subject', expiration: '2026-08-15' } })
    expect(res.offerId).toBeTruthy()
    expect(res.wantsToOffer).toBe(1)
    const [offer] = await db.select().from(schema.offers).where(eq(schema.offers.id, res.offerId!))
    expect(offer).toMatchObject({ organizationId: t.orgId, propertyId: t.propertyId, propertyKind: 'agent', buyerContactId: c.id, currentAmount: 250000, status: 'draft', currentConditions: 'Sujeta a hipoteca', currentFinanceCondition: 'mortgage_subject', expiration: '2026-08-15 23:59:59' })
    expect((await visitRow(db, v.id)).contactId).toBe(c.id)

    const { listAppointments } = await import('../../server/utils/appointments/query')
    const rows = await listAppointments(db, t.orgId)
    const listed = rows.find((r) => r.id === v.id)!
    expect(listed.offers.map((o) => o.id)).toEqual([res.offerId])
    expect(listed).toMatchObject({ contactId: c.id, contactName: c.name, interestLevel: 5 })
  })

  it('la oferta funciona también desde una parada de tour de 2ª mano (antes se rompía sin propertyKind)', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'N5OfertaTour')
    const agent = await commercial(db, t.orgId)
    const c = await contact(db, t.orgId)
    const { createTour, listTours } = await import('../../server/utils/appointments/tours')
    const { recordVisitOutcome } = await import('../../server/utils/appointments/outcome')
    const res = await createTour(db, t.orgId, { contactId: c.id, stops: [{ propertyId: t.propertyId, propertyKind: 'agent', agentId: agent.id, scheduledAt: '2026-08-02 10:00:00' }] })
    await db.update(schema.visits).set({ status: 'completed' }).where(eq(schema.visits.id, res.stopIds[0]))

    const out = await recordVisitOutcome(db, t.orgId, res.stopIds[0], { outcome: 'interested', createOffer: { amount: 199000 } })
    expect(out.offerId).toBeTruthy()
    const [tour] = await listTours(db, t.orgId)
    expect(tour.stops[0].offers).toEqual([expect.objectContaining({ id: out.offerId, amount: 199000, status: 'draft' })])
  })

  it('«segunda visita» la agenda ya como cita real; si choca con la agenda, no se anota nada', async () => {
    const { db, t, agent, v, recordVisitOutcome } = await completedVisit('N5Segunda')
    const { createAdminAppointment } = await import('../../server/utils/appointments/adminCreate')
    await createAdminAppointment(db, t.orgId, { clientName: 'Ocupado', clientEmail: 'o@example.com', agentId: agent.id, scheduledAt: '2026-08-05 10:00:00' })

    await expect(recordVisitOutcome(db, t.orgId, v.id, { outcome: 'interested', secondVisit: { scheduledAt: '2026-08-05 10:30:00' } })).rejects.toMatchObject({ statusCode: 409 })
    expect((await visitRow(db, v.id)).outcome).toBeNull()

    const res = await recordVisitOutcome(db, t.orgId, v.id, { outcome: 'interested', secondVisit: { scheduledAt: '2026-08-06 10:00:00', durationMinutes: 30 } })
    const second = await visitRow(db, res.secondVisitId!)
    expect(second).toMatchObject({ propertyId: t.propertyId, propertyKind: 'agent', agentId: agent.id, scheduledAt: '2026-08-06 10:00:00', durationMinutes: 30, status: 'scheduled', clientName: 'Comprador' })
    expect((await visitRow(db, v.id)).wantsSecondVisit).toBe(1)
  })
})

describe('FASE 20 — filtros del calendario: oficina (entidad), tipo y cliente', () => {
  it('oficina de la cita o de su comercial, tipos nuevos, contacto directo o por su lead; nada de otra agencia', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'N5Calendario')
    const b = await seedTenant(db, 'N5CalendarioB')
    const ofA = await office(db, t.orgId)
    const ofB = await office(db, t.orgId)
    const agentA = await commercial(db, t.orgId, { officeId: ofA.id })
    const agentB = await commercial(db, t.orgId)
    const c = await contact(db, t.orgId)
    const l = await lead(db, t.orgId, { contactId: c.id })
    const { createAdminAppointment } = await import('../../server/utils/appointments/adminCreate')
    const { listAppointments } = await import('../../server/utils/appointments/query')

    const v1 = await createAdminAppointment(db, t.orgId, { clientName: 'Uno', clientEmail: 'uno@example.com', agentId: agentA.id, type: 'signing', scheduledAt: '2026-09-01 10:00:00' }) // oficina heredada: ofA
    const v2 = await createAdminAppointment(db, t.orgId, { clientName: 'Dos', clientEmail: 'dos@example.com', agentId: agentB.id, officeId: ofB.id, type: 'listing', leadId: l.id, scheduledAt: '2026-09-01 11:00:00' })
    const v3 = await createAdminAppointment(db, t.orgId, { agentId: agentB.id, contactId: c.id, type: 'open_house', scheduledAt: '2026-09-02 11:00:00' })
    // Una cita antigua sin oficina propia: cuenta la de su comercial.
    const [legacy] = await db.insert(schema.visits).values({ organizationId: t.orgId, clientName: 'Antigua', agentId: agentA.id, scheduledAt: '2026-09-03 10:00:00', status: 'scheduled', createdAt: ts }).returning()
    const ids = (rows: any[]) => rows.map((r) => r.id).sort((x, y) => x - y)

    expect(ids(await listAppointments(db, t.orgId, { from: '2026-09-01', to: '2026-09-30', officeId: ofA.id }))).toEqual([v1.id, legacy.id].sort((x, y) => x - y))
    expect(ids(await listAppointments(db, t.orgId, { from: '2026-09-01', to: '2026-09-30', officeId: ofB.id }))).toEqual([v2.id])
    expect(ids(await listAppointments(db, t.orgId, { from: '2026-09-01', to: '2026-09-30', type: 'signing' }))).toEqual([v1.id])
    expect(ids(await listAppointments(db, t.orgId, { from: '2026-09-01', to: '2026-09-30', type: 'open_house' }))).toEqual([v3.id])
    expect(ids(await listAppointments(db, t.orgId, { from: '2026-09-01', to: '2026-09-30', contactId: c.id }))).toEqual([v2.id, v3.id].sort((x, y) => x - y))
    expect(ids(await listAppointments(db, t.orgId, { from: '2026-09-01', to: '2026-09-01' }))).toEqual([v1.id, v2.id].sort((x, y) => x - y))

    const [withNames] = await listAppointments(db, t.orgId, { from: '2026-09-01', to: '2026-09-01', officeId: ofB.id })
    expect(withNames).toMatchObject({ officeName: ofB.name, leadName: l.name, contactName: c.name, contactId: c.id })

    // La otra agencia no ve nada de esto, ni filtrando por estas oficinas.
    expect(await listAppointments(db, b.orgId, { from: '2026-09-01', to: '2026-09-30' })).toEqual([])
    expect(await listAppointments(db, b.orgId, { from: '2026-09-01', to: '2026-09-30', officeId: ofA.id })).toEqual([])
    const { getAppointment } = await import('../../server/utils/appointments/query')
    expect(await getAppointment(db, b.orgId, v1.id)).toBeNull()
    expect((await getAppointment(db, t.orgId, v1.id))?.type).toBe('signing')
  })
})

describe('FASE 20 — iCal con la zona horaria correcta', () => {
  it('convierte la hora de pared al instante UTC real (verano, invierno, Canarias, Dubái)', async () => {
    const { wallTimeToIcsUtc } = await import('../../server/utils/appointments/timezone')
    expect(wallTimeToIcsUtc('2026-07-15 10:00:00', 'Europe/Madrid')).toBe('20260715T080000Z')
    expect(wallTimeToIcsUtc('2026-01-15 10:00:00', 'Europe/Madrid')).toBe('20260115T090000Z')
    expect(wallTimeToIcsUtc('2026-07-15 10:00:00', 'Atlantic/Canary')).toBe('20260715T090000Z')
    expect(wallTimeToIcsUtc('2026-07-15 10:00:00', 'Asia/Dubai')).toBe('20260715T060000Z')
    expect(wallTimeToIcsUtc('2026-07-15 00:30:00', 'Europe/Madrid')).toBe('20260714T223000Z') // cruza al día anterior en UTC
    expect(wallTimeToIcsUtc('2026-03-29 02:30:00', 'Europe/Madrid')).toBe('20260329T013000Z') // hora que no existe → 03:30
  })

  it('el feed de un comercial usa la zona de la cita, luego la de su oficina, luego la de la agencia; sin canceladas ni citas de otra agencia', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'N5Ical')
    const b = await seedTenant(db, 'N5IcalB')
    const canary = await office(db, t.orgId, { timezone: 'Atlantic/Canary' })
    const agent = await commercial(db, t.orgId)
    await db.insert(schema.settings).values({ key: `org:${t.orgId}:timezone`, value: 'Europe/Madrid', updatedAt: ts })
    const { createAdminAppointment } = await import('../../server/utils/appointments/adminCreate')
    const { updateAppointment } = await import('../../server/utils/appointments/update')
    const { buildAgentIcs } = await import('../../server/utils/appointments/ical')

    const own = await createAdminAppointment(db, t.orgId, { clientName: 'En Dubái', clientEmail: 'd@example.com', agentId: agent.id, timezone: 'Asia/Dubai', scheduledAt: '2026-07-20 10:00:00', durationMinutes: 45 })
    const byOffice = await createAdminAppointment(db, t.orgId, { clientName: 'En Canarias', clientEmail: 'c@example.com', agentId: agent.id, officeId: canary.id, scheduledAt: '2026-07-21 10:00:00' })
    const byAgency = await createAdminAppointment(db, t.orgId, { clientName: 'En Madrid', clientEmail: 'm@example.com', agentId: agent.id, scheduledAt: '2026-12-21 10:00:00', meetingPoint: 'Plaza Mayor, 1' })
    const cancelled = await createAdminAppointment(db, t.orgId, { clientName: 'Cancelada', clientEmail: 'x@example.com', agentId: agent.id, scheduledAt: '2026-07-22 10:00:00' })
    await updateAppointment(db, t.orgId, cancelled.id, { status: 'cancelled', cancellationReason: 'Prueba' }, ctx)
    // Una cita de otra agencia con el mismo id de comercial nunca entra.
    await db.insert(schema.visits).values({ organizationId: b.orgId, clientName: 'Intrusa', agentId: agent.id, scheduledAt: '2026-07-23 10:00:00', status: 'scheduled', createdAt: ts })

    const ics = await buildAgentIcs(db, { id: agent.id, name: agent.name, organizationId: t.orgId }, { nowTs: '2026-07-01 00:00:00' })
    const unfolded = ics.replace(/\r\n /g, '')
    const block = (id: number) => unfolded.slice(unfolded.indexOf(`UID:visit-${id}@`), unfolded.indexOf('END:VEVENT', unfolded.indexOf(`UID:visit-${id}@`)))

    expect(block(own.id)).toContain('DTSTART:20260720T060000Z')
    expect(block(own.id)).toContain('DTEND:20260720T064500Z')
    expect(block(byOffice.id)).toContain('DTSTART:20260721T090000Z')
    expect(block(byAgency.id)).toContain('DTSTART:20261221T090000Z') // invierno en Madrid: UTC+1
    expect(block(byAgency.id)).toContain('LOCATION:Plaza Mayor\\, 1')
    expect(unfolded).toContain('X-WR-TIMEZONE:Europe/Madrid')
    expect(unfolded).not.toContain(`UID:visit-${cancelled.id}@`)
    expect(unfolded).not.toContain('Intrusa')
    // Ninguna hora local se escribe ya como si fuera UTC.
    expect(unfolded).not.toContain('DTSTART:20260720T100000Z')
    expect(ics.split('\r\n').every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true)
  })

  it('sin zona en la cita, la oficina ni la agencia, usa la que el panel muestra por defecto', async () => {
    const { db } = createTestDb()
    const t = await seedTenant(db, 'N5IcalDefecto')
    const agent = await commercial(db, t.orgId)
    const { createAdminAppointment } = await import('../../server/utils/appointments/adminCreate')
    const { buildAgentIcs } = await import('../../server/utils/appointments/ical')
    const { DEFAULT_AGENCY_TIMEZONE } = await import('../../utils/appointmentCatalog')
    const { wallTimeToIcsUtc } = await import('../../server/utils/appointments/timezone')
    const v = await createAdminAppointment(db, t.orgId, { clientName: 'Sin zona', clientEmail: 's@example.com', agentId: agent.id, scheduledAt: '2026-07-25 10:00:00' })
    const ics = (await buildAgentIcs(db, { id: agent.id, name: agent.name, organizationId: t.orgId }, { nowTs: '2026-07-01 00:00:00' })).replace(/\r\n /g, '')
    expect(ics).toContain(`DTSTART:${wallTimeToIcsUtc('2026-07-25 10:00:00', DEFAULT_AGENCY_TIMEZONE)}`)
    expect(ics).toContain(`UID:visit-${v.id}@`)
  })
})
