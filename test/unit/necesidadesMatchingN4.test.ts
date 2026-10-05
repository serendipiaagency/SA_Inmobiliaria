import { and, eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'

/**
 * Núcleo inmobiliario, bloque N4 (FASES 10 y 11): editor completo de la
 * necesidad (validación y edición), el motor con el estado del inmueble y la
 * ficha ampliada, y las acciones sobre una compatibilidad —crear selección,
 * crear visita, descartar, enviar sólo hacia delante— siempre dentro de la
 * organización. Base real (sqlite-proxy + migraciones reales).
 */
vi.mock('../../server/utils/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/utils/db')>()
  return { ...actual, useDb: (event: any) => event.context.db }
})

const ts = '2026-01-01 00:00:00'
let seq = 0
const ev = (db: any) => ({ context: { db } }) as any

async function contact(db: any, orgId: number, over: Record<string, any> = {}) {
  seq += 1
  const [row] = await db
    .insert(schema.contacts)
    .values({ organizationId: orgId, name: `Comprador ${seq}`, email: `comprador-${seq}@example.com`, phone: '+34600000000', status: 'active', createdAt: ts, updatedAt: ts, ...over })
    .returning()
  return row
}

async function commercial(db: any, orgId: number) {
  seq += 1
  const [row] = await db
    .insert(schema.teamMembers)
    .values({ organizationId: orgId, name: `Comercial ${seq}`, slug: `n4-comercial-${seq}`, email: `n4-comercial-${seq}@example.com`, position: 'Comercial', slotDurationMinutes: 60, createdAt: ts, updatedAt: ts })
    .returning()
  return row
}

/** Un piso de 2ª mano en Chamberí, con la ficha repasada. */
async function flat(db: any, orgId: number, over: Record<string, any> = {}) {
  seq += 1
  const [row] = await db
    .insert(schema.agentProperties)
    .values({
      organizationId: orgId,
      slug: `n4-piso-${seq}`,
      reference: `N4-${seq}`,
      transactionType: 'sale',
      propertyType: 'Apartment',
      price: 600_000,
      area: 90,
      bedrooms: 3,
      bathrooms: 2,
      city: 'Madrid',
      district: 'Chamberí',
      status: 'available',
      featuresReviewedAt: ts,
      createdAt: ts,
      updatedAt: ts,
      ...over,
    })
    .returning()
  return row
}

async function load() {
  const req = await import('../../server/utils/buyerRequirements/service')
  const matching = await import('../../server/utils/matching/service')
  const actions = await import('../../server/utils/matching/actions')
  return { ...req, ...matching, ...actions }
}

describe('N4 — validación de la necesidad', () => {
  it('acepta todos los tipos del catálogo común y sigue aceptando los cinco de antes', async () => {
    const { validateBuyerRequirement } = await load()
    const { PROPERTY_TYPES } = await import('../../utils/propertySheet')
    expect(() => validateBuyerRequirement({ contactId: 1, propertyTypes: [...PROPERTY_TYPES] })).not.toThrow()
    expect(() => validateBuyerRequirement({ contactId: 1, propertyTypes: ['Apartment', 'Villa', 'Townhouse', 'Penthouse', 'Studio'] })).not.toThrow()
    expect(() => validateBuyerRequirement({ contactId: 1, propertyTypes: ['Castillo'] })).toThrow(/no reconocido/)
  })

  it('zonas: estructuradas, nunca vacías, y no la misma deseada y excluida', async () => {
    const { validateBuyerRequirement } = await load()
    expect(() => validateBuyerRequirement({ contactId: 1, desiredZones: [{ district: 'Chamberí' }], excludedZones: [{ postalCode: '28012' }] })).not.toThrow()
    expect(() => validateBuyerRequirement({ contactId: 1, desiredZones: [{}] })).toThrow(/zona vacía/)
    expect(() => validateBuyerRequirement({ contactId: 1, desiredZones: ['Chamberí'] as any })).toThrow(/estructurada/)
    expect(() => validateBuyerRequirement({ contactId: 1, desiredZones: [{ district: 'Chamberí' }], excludedZones: [{ district: 'chamberi' }] })).toThrow(/a la vez/)
    // La etiqueta que acompaña al distrito no la convierte en otra zona.
    expect(() => validateBuyerRequirement({ contactId: 1, desiredZones: [{ district: 'Lavapiés' }], excludedZones: [{ district: 'Lavapiés', label: 'Lavapiés' }] })).toThrow(/a la vez/)
    // Mismo nombre, distinto tipo de referencia: son zonas distintas.
    expect(() => validateBuyerRequirement({ contactId: 1, desiredZones: [{ city: 'Madrid' }], excludedZones: [{ district: 'Madrid' }] })).not.toThrow()
  })

  it('fecha deseada, coordenadas del centro, financiación y números con formato', async () => {
    const { validateBuyerRequirement } = await load()
    expect(() => validateBuyerRequirement({ contactId: 1, desiredDate: '2027-03-01' })).not.toThrow()
    expect(() => validateBuyerRequirement({ contactId: 1, desiredDate: 'marzo' })).toThrow(/Fecha deseada/)
    expect(() => validateBuyerRequirement({ contactId: 1, radiusKm: 3, centerLat: 95, centerLng: -3.7 })).toThrow(/latitud/)
    expect(() => validateBuyerRequirement({ contactId: 1, needsMortgage: 2 })).toThrow(/financiación/)
    expect(() => validateBuyerRequirement({ contactId: 1, priceMax: '650000' as any })).toThrow(/número/)
    expect(() => validateBuyerRequirement({ contactId: 1, bathroomsMin: 1.5 })).toThrow(/entero/)
  })

  it('importancia: sólo criterios del catálogo, y el precio nunca es indiferente', async () => {
    const { validateBuyerRequirement } = await load()
    expect(() =>
      validateBuyerRequirement({
        contactId: 1,
        importances: { propertyType: 'indifferent', area: 'required', bathrooms: 'preferred', zone: 'required', condition: 'required', build: 'preferred', airConditioning: 'required' },
        features: { airConditioning: true, pets: false },
      }),
    ).not.toThrow()
    expect(() => validateBuyerRequirement({ contactId: 1, importances: { vistas: 'required' } as any })).toThrow(/Criterio no reconocido/)
    expect(() => validateBuyerRequirement({ contactId: 1, importances: { price: 'indifferent' } })).toThrow(/indiferente/)
    expect(() => validateBuyerRequirement({ contactId: 1, features: { jacuzzi: true } as any })).toThrow(/Característica no reconocida/)
  })
})

describe('N4 — crear y editar la necesidad completa', () => {
  it('guarda todos los campos y edita después: criterios reemplazados, «indiferente» del tipo guardado', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'N4Edit')
    const c = await contact(db, a.orgId)
    const { createBuyerRequirement, updateBuyerRequirement, listBuyerRequirements } = await load()

    const req = await createBuyerRequirement(ev(db), a.orgId, {
      contactId: c.id,
      title: 'Vivienda habitual',
      operation: 'sale',
      propertyTypes: ['Apartment', 'Duplex'],
      priceMax: 650_000,
      areaMin: 80,
      areaMax: 140,
      bedroomsMin: 2,
      bathroomsMin: 2,
      desiredZones: [{ district: 'Chamberí', label: 'Chamberí' }],
      excludedZones: [{ district: 'Lavapiés', label: 'Lavapiés' }],
      centerLat: 40.43,
      centerLng: -3.7,
      radiusKm: 3,
      conditionPref: 'good',
      buildPref: 'renovated',
      desiredDate: '2027-01-15',
      needsMortgage: 1,
      mortgageStatus: 'preapproved',
      financingNotes: 'Preaprobada en su banco',
      urgency: 'high',
      importances: { propertyType: 'required', condition: 'required', terrace: 'required', garage: 'preferred' },
      features: { terrace: true, garage: true },
    })

    const updated = await updateBuyerRequirement(ev(db), a.orgId, req.id, {
      title: '  Vivienda habitual (revisada)  ',
      propertyTypes: ['Apartment', 'Penthouse', 'Duplex'],
      areaMax: null,
      radiusKm: null,
      importances: { propertyType: 'indifferent', pool: 'required' },
      features: { pool: false },
    })
    expect(updated!.title).toBe('Vivienda habitual (revisada)')
    expect(updated!.areaMax).toBeNull()
    // Quitar el radio deja también sin centro.
    expect(updated!.radiusKm).toBeNull()
    expect(updated!.centerLat).toBeNull()
    expect(updated!.conditionPref).toBe('good')
    expect(updated!.desiredDate).toBe('2027-01-15')

    const [listed] = await listBuyerRequirements(ev(db), a.orgId, { contactId: c.id })
    expect(listed.propertyTypes).toEqual(['Apartment', 'Penthouse', 'Duplex'])
    expect(listed.excludedZones).toEqual([{ district: 'Lavapiés', label: 'Lavapiés' }])
    const byType = Object.fromEntries(listed.criteria.map((x: any) => [x.criterionType, x]))
    expect(Object.keys(byType).sort()).toEqual(['pool', 'propertyType'])
    expect(byType.propertyType.importance).toBe('indifferent')
    expect(byType.pool).toMatchObject({ importance: 'required', valueBool: 0 })
  })

  it('una fila antigua con datos mal formados se puede seguir pausando (no bloquea la edición)', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'N4Legacy')
    const c = await contact(db, a.orgId)
    const [legacy] = await db
      .insert(schema.buyerRequirements)
      .values({ organizationId: a.orgId, contactId: c.id, title: 'Antigua', priceMin: '' as any, desiredZonesJson: '["Chamberí", {"label": ""}]', desiredDate: '15/01/2027', createdAt: ts, updatedAt: ts })
      .returning()
    const { updateBuyerRequirement } = await load()
    const paused = await updateBuyerRequirement(ev(db), a.orgId, legacy.id, { status: 'paused' })
    expect(paused!.status).toBe('paused')
  })

  it('aislamiento: contacto o comercial de otra agencia → 404; PATCH de una necesidad ajena no la toca', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'N4IsoA')
    const b = await seedTenant(db, 'N4IsoB')
    const cA = await contact(db, a.orgId)
    const cB = await contact(db, b.orgId)
    const comB = await commercial(db, b.orgId)
    const { createBuyerRequirement, updateBuyerRequirement, BuyerRequirementValidationError } = await load()

    await expect(createBuyerRequirement(ev(db), a.orgId, { contactId: cB.id })).rejects.toMatchObject({ statusCode: 404 })
    await expect(createBuyerRequirement(ev(db), a.orgId, { contactId: cA.id, assignedCommercialId: comB.id })).rejects.toBeInstanceOf(BuyerRequirementValidationError)
    await expect(createBuyerRequirement(ev(db), a.orgId, { contactId: cA.id, assignedCommercialId: comB.id })).rejects.toMatchObject({ statusCode: 404 })

    const reqB = await createBuyerRequirement(ev(db), b.orgId, { contactId: cB.id, title: 'De B' })
    expect(await updateBuyerRequirement(ev(db), a.orgId, reqB.id, { title: 'Secuestrada' })).toBeNull()
    const [still] = await db.select().from(schema.buyerRequirements).where(eq(schema.buyerRequirements.id, reqB.id))
    expect(still.title).toBe('De B')
  })

  it('el presupuesto validado lleva autor (con nombre) y fecha', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'N4Budget')
    const c = await contact(db, a.orgId)
    const { createBuyerRequirement, validateBudget, listBuyerRequirements } = await load()
    const req = await createBuyerRequirement(ev(db), a.orgId, { contactId: c.id, priceMax: 500_000 })
    await validateBudget(ev(db), a.orgId, req.id, a.userId, true)
    const [listed] = await listBuyerRequirements(ev(db), a.orgId, { contactId: c.id })
    expect(listed.budgetValidated).toBe(1)
    expect(listed.budgetValidatedAt).toBeTruthy()
    expect(listed.budgetValidatedByName).toBe('N4Budget Admin')
  })
})

describe('N4 — el motor sobre datos reales: estado y ficha ampliada', () => {
  it('Necesidad → inmuebles evalúa el estado (condition) y «reformado» desde property_details', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'N4Engine')
    const c = await contact(db, a.orgId)
    const bueno = await flat(db, a.orgId, { condition: 'good' })
    const aReformar = await flat(db, a.orgId, { condition: 'to_reform' })
    const sinDato = await flat(db, a.orgId, { condition: null })
    await db.insert(schema.propertyDetails).values({ organizationId: a.orgId, propertyKind: 'agent', propertyId: bueno.id, isRenovated: 1, renovationYear: 2022, hasAirConditioning: 1, createdAt: ts, updatedAt: ts })
    const { createBuyerRequirement, findPropertiesForRequirement } = await load()

    const req = await createBuyerRequirement(ev(db), a.orgId, {
      contactId: c.id,
      priceMax: 650_000,
      conditionPref: 'good',
      buildPref: 'renovated',
      importances: { condition: 'required', airConditioning: 'preferred' },
      features: { airConditioning: true },
    })
    const found = await findPropertiesForRequirement(ev(db), a.orgId, req.id, { includeIneligible: true })
    const of = (id: number) => found!.results.find((r) => r.propertyKind === 'agent' && r.property.id === id)!.result

    const ok = of(bueno.id)
    expect(ok.eligibility).toBe('eligible')
    expect(ok.criteria.find((x) => x.key === 'condition')!.outcome).toBe('matched')
    expect(ok.criteria.find((x) => x.key === 'build')!.detail).toContain('2022')
    expect(ok.criteria.find((x) => x.key === 'airConditioning')!.outcome).toBe('matched')

    expect(of(aReformar.id).eligibility).toBe('ineligible')
    const unknown = of(sinDato.id)
    expect(unknown.eligibility).toBe('needs_review')
    expect(unknown.criteria.find((x) => x.key === 'condition')!.outcome).toBe('unknown')
    // Sin ficha ampliada: «reformado» y el aire acondicionado no constan, no son un «no».
    expect(unknown.criteria.find((x) => x.key === 'build')!.outcome).toBe('unknown')
    expect(unknown.criteria.find((x) => x.key === 'airConditioning')!.outcome).toBe('unknown')
  })

  it('tipo «preferible»: los demás tipos llegan al motor y puntúan; imprescindible (por defecto) los recorta', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'N4Type')
    const c = await contact(db, a.orgId)
    const local = await flat(db, a.orgId, { propertyType: 'Retail' })
    const { createBuyerRequirement, findPropertiesForRequirement, findRequirementsForProperty } = await load()

    const strict = await createBuyerRequirement(ev(db), a.orgId, { contactId: c.id, propertyTypes: ['Apartment'], priceMax: 650_000 })
    const loose = await createBuyerRequirement(ev(db), a.orgId, { contactId: c.id, propertyTypes: ['Apartment'], priceMax: 650_000, importances: { propertyType: 'preferred' } })

    const isLocal = (r: any) => r.propertyKind === 'agent' && r.property.id === local.id
    expect((await findPropertiesForRequirement(ev(db), a.orgId, strict.id, { includeIneligible: true }))!.results.some(isLocal)).toBe(false)
    expect((await findPropertiesForRequirement(ev(db), a.orgId, loose.id))!.results.some(isLocal)).toBe(true)

    // Y en la dirección contraria dice lo mismo: el estricto no aparece para el local.
    const buyers = await findRequirementsForProperty(ev(db), a.orgId, local.id, 'agent')
    expect(buyers!.results.map((r) => r.requirement.id)).toEqual([loose.id])
  })
})

describe('N4 — acciones sobre una compatibilidad', () => {
  it('crear selección: para el contacto de la necesidad, marca seleccionado y deja Activity', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'N4Sel')
    const c = await contact(db, a.orgId, { name: 'María López' })
    const p1 = await flat(db, a.orgId)
    const { createBuyerRequirement, createSelectionFromMatch } = await load()
    const req = await createBuyerRequirement(ev(db), a.orgId, { contactId: c.id, title: 'Vivienda', priceMax: 650_000 })

    const res = await createSelectionFromMatch(
      ev(db),
      a.orgId,
      { buyerRequirementId: req.id, items: [{ propertyId: p1.id, propertyKind: 'agent' }, { propertyId: a.projectId, propertyKind: 'developer' }] },
      { userId: a.userId },
    )
    expect(res.created).toBe(true)
    expect(res.selection.contactId).toBe(c.id)
    expect(res.selection.buyerRequirementId).toBe(req.id)
    expect(res.selection.title).toContain('María López')
    expect(res.selection.items).toHaveLength(2)

    const [m] = await db.select().from(schema.propertyMatches).where(and(eq(schema.propertyMatches.buyerRequirementId, req.id), eq(schema.propertyMatches.propertyId, p1.id)))
    expect(m.status).toBe('selected')
    const [dm] = await db.select().from(schema.developerPropertyMatches).where(eq(schema.developerPropertyMatches.buyerRequirementId, req.id))
    expect(dm.status).toBe('selected')

    const acts = await db.select().from(schema.activities).where(and(eq(schema.activities.organizationId, a.orgId), eq(schema.activities.eventType, 'PROPERTY_SELECTION_CREATED')))
    expect(acts).toHaveLength(1)
    expect(acts[0].contactId).toBe(c.id)
  })

  it('añadir a una selección existente: sin duplicar, y no retrocede un enviado ni resucita un descarte', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'N4SelAdd')
    const c = await contact(db, a.orgId)
    const p1 = await flat(db, a.orgId)
    const p2 = await flat(db, a.orgId)
    const p3 = await flat(db, a.orgId)
    const { createBuyerRequirement, createSelectionFromMatch, setMatchStatus, markMatchSent } = await load()
    const req = await createBuyerRequirement(ev(db), a.orgId, { contactId: c.id, priceMax: 650_000 })

    const first = await createSelectionFromMatch(ev(db), a.orgId, { buyerRequirementId: req.id, items: [{ propertyId: p1.id, propertyKind: 'agent' }] })
    await markMatchSent(ev(db), a.orgId, { buyerRequirementId: req.id, propertyId: p2.id, propertyKind: 'agent' })
    await setMatchStatus(ev(db), a.orgId, { buyerRequirementId: req.id, propertyId: p3.id, propertyKind: 'agent', status: 'discarded', discardedReason: 'Muy oscuro' })

    const res = await createSelectionFromMatch(ev(db), a.orgId, {
      buyerRequirementId: req.id,
      selectionId: first.selection.id,
      items: [
        { propertyId: p1.id, propertyKind: 'agent' },
        { propertyId: p2.id, propertyKind: 'agent' },
        { propertyId: p3.id, propertyKind: 'agent' },
      ],
    })
    expect(res.created).toBe(false)
    expect(res.added).toBe(2)
    expect(res.selection.items.map((i: any) => i.propertyId)).toEqual([p1.id, p2.id, p3.id])

    const status = async (pid: number) =>
      (await db.select().from(schema.propertyMatches).where(and(eq(schema.propertyMatches.buyerRequirementId, req.id), eq(schema.propertyMatches.propertyId, pid))))[0].status
    expect(await status(p2.id)).toBe('sent')
    expect(await status(p3.id)).toBe('discarded')
  })

  it('crear visita: cita real del contacto (con contactId) por createAdminAppointment, y el match pasa a seleccionado', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'N4Visit')
    const c = await contact(db, a.orgId, { name: 'Pedro Ruiz', email: 'pedro@example.com', phone: '+34611222333' })
    const laura = await commercial(db, a.orgId)
    const p1 = await flat(db, a.orgId)
    const { createBuyerRequirement, createVisitFromMatch } = await load()
    const req = await createBuyerRequirement(ev(db), a.orgId, { contactId: c.id, priceMax: 650_000 })

    const res = await createVisitFromMatch(ev(db), a.orgId, { buyerRequirementId: req.id, propertyId: p1.id, propertyKind: 'agent', agentId: laura.id, scheduledAt: '2026-11-10 10:00:00' })
    expect(res.visit).toMatchObject({ clientName: 'Pedro Ruiz', clientEmail: 'pedro@example.com', clientPhone: '+34611222333', contactId: c.id, propertyId: p1.id, propertyKind: 'agent', type: 'property_viewing', agentId: laura.id })
    expect(res.matchStatus).toBe('selected')

    // Mismo comercial a la misma hora: el solape real de Calendar.
    await expect(
      createVisitFromMatch(ev(db), a.orgId, { buyerRequirementId: req.id, propertyId: p1.id, propertyKind: 'agent', agentId: laura.id, scheduledAt: '2026-11-10 10:00:00' }),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('crear visita para alguien sin email ni teléfono: 422 que lo dice, sin cita a medias', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'N4VisitNoChannel')
    const c = await contact(db, a.orgId, { email: null, phone: null })
    const laura = await commercial(db, a.orgId)
    const p1 = await flat(db, a.orgId)
    const { createBuyerRequirement, createVisitFromMatch } = await load()
    const req = await createBuyerRequirement(ev(db), a.orgId, { contactId: c.id })
    await expect(
      createVisitFromMatch(ev(db), a.orgId, { buyerRequirementId: req.id, propertyId: p1.id, propertyKind: 'agent', agentId: laura.id, scheduledAt: '2026-11-10 12:00:00' }),
    ).rejects.toMatchObject({ statusCode: 422, message: expect.stringMatching(/email ni teléfono/) })
    expect(await db.select().from(schema.visits).where(eq(schema.visits.contactId, c.id))).toHaveLength(0)
  })

  it('aislamiento: necesidad, propiedad, comercial o selección de otra agencia → 404 y nada se crea', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'N4ActIsoA')
    const b = await seedTenant(db, 'N4ActIsoB')
    const cA = await contact(db, a.orgId)
    const cA2 = await contact(db, a.orgId)
    const cB = await contact(db, b.orgId)
    const comA = await commercial(db, a.orgId)
    const comB = await commercial(db, b.orgId)
    const pA = await flat(db, a.orgId)
    const pB = await flat(db, b.orgId)
    const { createBuyerRequirement, createSelectionFromMatch, createVisitFromMatch, setMatchStatus } = await load()
    const reqA = await createBuyerRequirement(ev(db), a.orgId, { contactId: cA.id })
    const reqA2 = await createBuyerRequirement(ev(db), a.orgId, { contactId: cA2.id })
    const reqB = await createBuyerRequirement(ev(db), b.orgId, { contactId: cB.id })

    // Necesidad de B desde A.
    await expect(createSelectionFromMatch(ev(db), a.orgId, { buyerRequirementId: reqB.id, items: [{ propertyId: pA.id, propertyKind: 'agent' }] })).rejects.toMatchObject({ statusCode: 404 })
    await expect(
      createVisitFromMatch(ev(db), a.orgId, { buyerRequirementId: reqB.id, propertyId: pA.id, propertyKind: 'agent', agentId: comA.id, scheduledAt: '2026-11-11 10:00:00' }),
    ).rejects.toMatchObject({ statusCode: 404 })
    await expect(setMatchStatus(ev(db), a.orgId, { buyerRequirementId: reqB.id, propertyId: pA.id, propertyKind: 'agent', status: 'discarded' })).rejects.toMatchObject({ statusCode: 404 })

    // Propiedad de B en una necesidad de A.
    await expect(createSelectionFromMatch(ev(db), a.orgId, { buyerRequirementId: reqA.id, items: [{ propertyId: pB.id, propertyKind: 'agent' }] })).rejects.toMatchObject({ statusCode: 404 })
    await expect(
      createVisitFromMatch(ev(db), a.orgId, { buyerRequirementId: reqA.id, propertyId: pB.id, propertyKind: 'agent', agentId: comA.id, scheduledAt: '2026-11-11 11:00:00' }),
    ).rejects.toMatchObject({ statusCode: 404 })
    await expect(setMatchStatus(ev(db), a.orgId, { buyerRequirementId: reqA.id, propertyId: pB.id, propertyKind: 'agent', status: 'selected' })).rejects.toMatchObject({ statusCode: 404 })

    // Comercial de B.
    await expect(
      createVisitFromMatch(ev(db), a.orgId, { buyerRequirementId: reqA.id, propertyId: pA.id, propertyKind: 'agent', agentId: comB.id, scheduledAt: '2026-11-11 12:00:00' }),
    ).rejects.toMatchObject({ statusCode: 404 })

    // Selección de otra persona (aunque sea de la misma agencia) o de otra agencia.
    const otra = await createSelectionFromMatch(ev(db), a.orgId, { buyerRequirementId: reqA2.id, items: [{ propertyId: pA.id, propertyKind: 'agent' }] })
    await expect(
      createSelectionFromMatch(ev(db), a.orgId, { buyerRequirementId: reqA.id, selectionId: otra.selection.id, items: [{ propertyId: pA.id, propertyKind: 'agent' }] }),
    ).rejects.toMatchObject({ statusCode: 404 })
    const deB = await createSelectionFromMatch(ev(db), b.orgId, { buyerRequirementId: reqB.id, items: [{ propertyId: pB.id, propertyKind: 'agent' }] })
    await expect(
      createSelectionFromMatch(ev(db), a.orgId, { buyerRequirementId: reqA.id, selectionId: deB.selection.id, items: [{ propertyId: pA.id, propertyKind: 'agent' }] }),
    ).rejects.toMatchObject({ statusCode: 404 })

    // Nada de A apunta a B, y B no ha ganado nada.
    expect(await db.select().from(schema.propertySelections).where(eq(schema.propertySelections.organizationId, a.orgId))).toHaveLength(1)
    expect(await db.select().from(schema.visits).where(eq(schema.visits.contactId, cA.id))).toHaveLength(0)
    const itemsB = await db.select().from(schema.propertySelectionItems).where(eq(schema.propertySelectionItems.selectionId, deB.selection.id))
    expect(itemsB.map((i: any) => i.propertyId)).toEqual([pB.id])
  })

  it('descartar con motivo y recuperar después (vuelve a «nuevo», sin motivo)', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'N4Discard')
    const c = await contact(db, a.orgId)
    const p1 = await flat(db, a.orgId)
    const { createBuyerRequirement, setMatchStatus } = await load()
    const req = await createBuyerRequirement(ev(db), a.orgId, { contactId: c.id })
    const discarded = await setMatchStatus(ev(db), a.orgId, { buyerRequirementId: req.id, propertyId: p1.id, propertyKind: 'agent', status: 'discarded', discardedReason: 'Le pilla lejos' })
    expect(discarded).toMatchObject({ status: 'discarded', discardedReason: 'Le pilla lejos' })
    const back = await setMatchStatus(ev(db), a.orgId, { buyerRequirementId: req.id, propertyId: p1.id, propertyKind: 'agent', status: 'new' })
    expect(back).toMatchObject({ status: 'new', discardedReason: null })
  })

  it('enviar es sólo hacia delante: un match visitado u ofertado no vuelve a «enviado», un descarte no se resucita', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'N4Sent')
    const c = await contact(db, a.orgId)
    const p1 = await flat(db, a.orgId)
    const p2 = await flat(db, a.orgId)
    const p3 = await flat(db, a.orgId)
    const { createBuyerRequirement, setMatchStatus, markMatchSent } = await load()
    const req = await createBuyerRequirement(ev(db), a.orgId, { contactId: c.id })

    // Seleccionado → enviado: avanza.
    await setMatchStatus(ev(db), a.orgId, { buyerRequirementId: req.id, propertyId: p1.id, propertyKind: 'agent', status: 'selected' })
    expect((await markMatchSent(ev(db), a.orgId, { buyerRequirementId: req.id, propertyId: p1.id, propertyKind: 'agent' })).status).toBe('sent')

    // Ofertado: se queda ofertado.
    await setMatchStatus(ev(db), a.orgId, { buyerRequirementId: req.id, propertyId: p2.id, propertyKind: 'agent', status: 'selected' })
    await db.update(schema.propertyMatches).set({ status: 'offered' }).where(and(eq(schema.propertyMatches.buyerRequirementId, req.id), eq(schema.propertyMatches.propertyId, p2.id)))
    expect((await markMatchSent(ev(db), a.orgId, { buyerRequirementId: req.id, propertyId: p2.id, propertyKind: 'agent' })).status).toBe('offered')

    // Descartado: se queda descartado.
    await setMatchStatus(ev(db), a.orgId, { buyerRequirementId: req.id, propertyId: p3.id, propertyKind: 'agent', status: 'discarded' })
    expect((await markMatchSent(ev(db), a.orgId, { buyerRequirementId: req.id, propertyId: p3.id, propertyKind: 'agent' })).status).toBe('discarded')
  })

  it('las selecciones de la ficha del contacto llevan el nombre real de cada propiedad', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'N4SelList')
    const c = await contact(db, a.orgId)
    const p1 = await flat(db, a.orgId, { reference: 'REF-N4-LIST' })
    const { createBuyerRequirement, createSelectionFromMatch } = await load()
    const { listPropertySelectionsWithItems } = await import('../../server/utils/selections/service')
    const req = await createBuyerRequirement(ev(db), a.orgId, { contactId: c.id })
    await createSelectionFromMatch(ev(db), a.orgId, { buyerRequirementId: req.id, items: [{ propertyId: p1.id, propertyKind: 'agent' }, { propertyId: a.projectId, propertyKind: 'developer' }] })

    const [sel] = await listPropertySelectionsWithItems(db, a.orgId, c.id)
    expect(sel.items.map((i: any) => i.name)).toEqual(['REF-N4-LIST', 'N4SelList Tower'])
    // Otra agencia no ve las selecciones de esta persona.
    const b = await seedTenant(db, 'N4SelListB')
    expect(await listPropertySelectionsWithItems(db, b.orgId, c.id)).toHaveLength(0)
  })
})

describe('N4 — parseSelectionItems', () => {
  it('acepta items o un único propertyId, y rechaza catálogos inventados', async () => {
    const { parseSelectionItems } = await load()
    expect(parseSelectionItems({ propertyId: 5, propertyKind: 'developer' })).toEqual([{ propertyId: 5, propertyKind: 'developer', note: null }])
    expect(parseSelectionItems({ items: [{ propertyId: 1 }] })).toEqual([{ propertyId: 1, propertyKind: 'agent', note: null }])
    expect(() => parseSelectionItems({})).toThrow(/al menos una/)
    expect(() => parseSelectionItems({ items: [{ propertyId: 1, propertyKind: 'otro' }] })).toThrow(/Catálogo/)
    expect(() => parseSelectionItems({ items: Array.from({ length: 31 }, (_, i) => ({ propertyId: i + 1 })) })).toThrow(/30/)
  })
})
