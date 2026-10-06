import { currencySymbol, DEFAULT_AGENCY_CURRENCY } from '../../utils/currency'
import { and, asc, eq, sql } from 'drizzle-orm'
import { createError } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { createTestDb, seedTenant, type TenantFixture } from './helpers/tenantFixtures'
import { buildPropertyFilterConds, exportPropertyRows, normalizedDateSql, parsePropertyFilters, propertyTextSearchCond, type PropertySearchFilters } from '../../server/utils/properties/searchService'
import { adminResources } from '../../server/utils/adminResources'
import { exclusivityState } from '../../server/utils/properties/summary'
import { applyCommercialStatusRulesOnSave, assertPropertyDatesOnSave, loadCommercialStatus } from '../../server/utils/properties/commercialStatus'
import { savePropertySheet } from '../../server/utils/properties/extendedSheet'
import { createBulkActionJob, getBulkActionJob, processNextBulkActionItem } from '../../server/utils/bulkActions/service'
import { propertyBulkHandlers, resolveFilteredPropertyIds } from '../../server/utils/bulkActions/propertyActions'
import { featureValue } from '../../server/utils/matching/engine'
import { withPropertyDetails } from '../../server/utils/matching/service'
import { isLegacyPropertyDate, isStrictIsoDate, parsePropertyDate } from '../../utils/propertyDates'
import { commercialStatusForAvailability, rowChangesForCommercialStatus } from '../../utils/propertyCommercialStatus'
import { COMMERCIAL_STATUS_FILTER_OPTIONS, PROPERTY_AMENITY_FILTER_GROUPS, extraFilterChips, pickExtraFilters } from '../../utils/propertyListFilters'
import { pricePerM2SuffixFor, priceSuffixFor } from '../../utils/propertySheet'
import { validatePropertyField } from '../../utils/propertyFieldValidation'
import { PROPERTY_LIST_CONFIG } from '../../composables/usePropertyListConfig'
import { PROPERTY_BUILDER_SECTIONS, type FieldSpec } from '../../composables/usePropertyBuilderConfig'

/**
 * Cierre D1p del núcleo inmobiliario — ficha y búsqueda de propiedades. Todo
 * contra SQLite real con las migraciones reales (`createTestDb`), en los DOS
 * catálogos y con una segunda agencia para comprobar que nada cruza:
 *
 *  1. estado comercial común: filtro, reglas con «Reservada» y la
 *     disponibilidad de 2ª mano, acción masiva «Cambiar estado comercial»;
 *  2. fechas: AAAA-MM-DD al cambiar, formatos antiguos leídos igual en JS y en
 *     SQL, exclusiva caducada / a punto de caducar, captación como fecha;
 *  4. piscina y jardín privados y comunitarios en el filtro y en el matching;
 *  7. búsqueda por referencias externa y de agencia, código comercial y calle;
 *  8. «Más características» de la ficha ampliada sin pasar de 100 parámetros;
 *  9. el portal no se arrastra en 2ª mano;
 * 10. la exportación CSV recorre todo el filtro por lotes.
 */
vi.mock('../../server/utils/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/utils/db')>()
  return { ...actual, useDb: (event: any) => event.context.db }
})
vi.mock('../../server/utils/audit', () => ({ logAdminAction: vi.fn() }))
vi.stubGlobal('createError', createError)

const ts = '2026-01-01 00:00:00'
type Kind = 'agent' | 'developer'
const KINDS: Kind[] = ['agent', 'developer']

let db: any
let A: TenantFixture
let B: TenantFixture
let seq = 0

beforeEach(async () => {
  ;({ db } = createTestDb())
  A = await seedTenant(db, 'D1pAlpha')
  B = await seedTenant(db, 'D1pBeta')
})

function ev() {
  return { context: { db } } as any
}
function table(kind: Kind) {
  return (kind === 'agent' ? schema.agentProperties : schema.developerProperties) as any
}
async function property(kind: Kind, f: TenantFixture, over: Record<string, any> = {}) {
  seq += 1
  const base = { organizationId: f.orgId, slug: `d1p-${kind}-${seq}`, status: kind === 'agent' ? 'available' : 'new', createdAt: ts, updatedAt: ts }
  const values = kind === 'agent' ? { ...base, ...over } : { ...base, developerId: f.developerId, name: over.name ?? `Promo D1p ${seq}`, ...over }
  const [row] = await db.insert(table(kind)).values(values).returning()
  return row
}
async function details(kind: Kind, f: TenantFixture, propertyId: number, values: Record<string, unknown>) {
  await savePropertySheet(db, f.orgId, kind, propertyId, { details: values, legal: {} }, f.userId)
}
async function ids(kind: Kind, f: TenantFixture, filters: PropertySearchFilters) {
  const t = table(kind)
  const rows = await db
    .select({ id: t.id })
    .from(t)
    .where(and(eq(t.organizationId, f.orgId), ...buildPropertyFilterConds(kind, filters)))
    .orderBy(asc(t.id))
  return rows.map((r: any) => r.id)
}
function expect422(fn: () => unknown) {
  let err: any
  try {
    fn()
  } catch (e) {
    err = e
  }
  expect(err?.statusCode).toBe(422)
}

// ---------------------------------------------------------------------------
// 2 · Fechas
// ---------------------------------------------------------------------------

describe('fechas de gestión: AAAA-MM-DD al cambiar, formatos antiguos leídos igual en JS y en SQL', () => {
  it('parsePropertyDate entiende ISO y día primero; rechaza lo imposible', () => {
    expect(parsePropertyDate('2025-03-15')).toBe('2025-03-15')
    expect(parsePropertyDate('2025-03-15T10:00:00Z')).toBe('2025-03-15')
    expect(parsePropertyDate('15/03/2025')).toBe('2025-03-15')
    expect(parsePropertyDate('5/3/2025')).toBe('2025-03-05')
    expect(parsePropertyDate('15-03-2025')).toBe('2025-03-15')
    expect(parsePropertyDate('15.3.2025')).toBe('2025-03-15')
    expect(parsePropertyDate('2025/03/15')).toBe('2025-03-15')
    expect(parsePropertyDate('31/02/2025')).toBeNull()
    expect(parsePropertyDate('marzo')).toBeNull()
    expect(parsePropertyDate('')).toBeNull()
    expect(isStrictIsoDate('2025-03-15')).toBe(true)
    expect(isStrictIsoDate('2025-02-30')).toBe(false)
    expect(isStrictIsoDate('15/03/2025')).toBe(false)
    expect(isLegacyPropertyDate('15/03/2025')).toBe(true)
    expect(isLegacyPropertyDate('2025-03-15')).toBe(false)
  })

  it('normalizedDateSql da lo mismo que parsePropertyDate sobre los formatos habituales', async () => {
    const samples = ['2025-03-15', '2025-03-15T10:00:00', ' 2025-03-15 ', '15/03/2025', '5/3/2025', '15/3/2025', '5/03/2025', '15-03-2025', '15.03.2025', '2025/03/15', '2025.03.15', 'marzo', '', '15/03/25']
    for (const v of samples) {
      const row = await property('agent', A, { captureDate: v })
      const t = schema.agentProperties
      const [got] = await db.select({ d: normalizedDateSql(t.captureDate) }).from(t).where(eq(t.id, row.id))
      expect(got.d ?? null, `«${v}»`).toBe(parsePropertyDate(v))
    }
  })

  it('el servidor exige AAAA-MM-DD sólo al cambiar la fecha; una ficha antigua se sigue guardando', () => {
    const existing = { captureDate: '15/03/2025', exclusiveFrom: null, exclusiveUntil: '01/06/2026' }
    // Sin cambios (el autoguardado reenvía la ficha entera): no bloquea.
    expect(() => assertPropertyDatesOnSave({ captureDate: '15/03/2025', exclusiveUntil: '01/06/2026', price: 1 }, existing)).not.toThrow()
    // Cambiada a otro texto: 422. A AAAA-MM-DD válida o vacía: bien.
    expect422(() => assertPropertyDatesOnSave({ captureDate: '16/03/2025' }, existing))
    expect422(() => assertPropertyDatesOnSave({ captureDate: '2025-02-30' }, existing))
    expect(() => assertPropertyDatesOnSave({ captureDate: '2025-03-16' }, existing)).not.toThrow()
    expect(() => assertPropertyDatesOnSave({ captureDate: null }, existing)).not.toThrow()
    // Al crear todo es un cambio.
    expect422(() => assertPropertyDatesOnSave({ exclusiveUntil: 'mañana' }, null))
    // El vencimiento no puede quedar antes del inicio (también contra el valor antiguo guardado).
    expect422(() => assertPropertyDatesOnSave({ exclusiveFrom: '2026-07-01' }, existing))
    expect(() => assertPropertyDatesOnSave({ exclusiveFrom: '2026-01-01' }, existing)).not.toThrow()
  })

  it('exclusivityState lee también la fecha de fin escrita a mano (dd/mm/aaaa)', () => {
    expect(exclusivityState(1, '20/10/2026', '2026-10-05')).toEqual({ state: 'expiring', until: '2026-10-20', daysLeft: 15 })
    expect(exclusivityState(1, '1/9/2026', '2026-10-05')).toMatchObject({ state: 'expired', until: '2026-09-01' })
    expect(exclusivityState(1, '31-12-2027', '2026-10-05')).toMatchObject({ state: 'active', until: '2027-12-31' })
    expect(exclusivityState(1, 'sin fecha', '2026-10-05')).toEqual({ state: 'open', until: null, daysLeft: null })
    expect(exclusivityState(0, '01/09/2026', '2026-10-05').state).toBe('none')
  })

  it.each(KINDS)('filtros de exclusiva caducada / que caduca en 30 días y de captación como fecha (%s)', async (kind) => {
    const today = '2026-10-06'
    const caducadaIso = await property(kind, A, { isExclusive: 1, exclusiveUntil: '2026-10-05' })
    const caducadaAntigua = await property(kind, A, { isExclusive: 1, exclusiveUntil: '15/09/2026' })
    const hoy = await property(kind, A, { isExclusive: 1, exclusiveUntil: '06/10/2026' })
    const en30 = await property(kind, A, { isExclusive: 1, exclusiveUntil: '2026-11-05' })
    await property(kind, A, { isExclusive: 1, exclusiveUntil: '2026-11-06' }) // a 31 días: aún no
    await property(kind, A, { isExclusive: 0, exclusiveUntil: '2026-01-01' }) // no es exclusiva
    await property(kind, A, { isExclusive: 1, exclusiveUntil: 'cuando firme' }) // no se entiende: ni caducada ni por caducar
    await property(kind, B, { isExclusive: 1, exclusiveUntil: '2026-10-01' }) // otra agencia
    expect(await ids(kind, A, { exclusivity: { state: 'expired', today } })).toEqual([caducadaIso.id, caducadaAntigua.id])
    expect(await ids(kind, A, { exclusivity: { state: 'expiring', today } })).toEqual([hoy.id, en30.id])

    // Captación: «15/02/2026» es febrero aunque como texto ordene detrás de «2026-…».
    const feb = await property(kind, A, { captureDate: '15/02/2026' })
    const febIso = await property(kind, A, { captureDate: '2026-02-28' })
    await property(kind, A, { captureDate: '5/1/2026' })
    await property(kind, A, { captureDate: 'febrero' })
    const filters = parsePropertyFilters({ capturedFrom: '2026-02-01', capturedTo: '28/02/2026' })
    expect(filters).toMatchObject({ capturedFrom: '2026-02-01', capturedTo: '2026-02-28' })
    expect(await ids(kind, A, filters)).toEqual([feb.id, febIso.id])
  })

  it('parsePropertyFilters: exclusiva y fechas mal formadas son 422, nunca se ignoran', () => {
    expect(parsePropertyFilters({ exclusivity: 'expired' }).exclusivity).toMatchObject({ state: 'expired', today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })
    expect422(() => parsePropertyFilters({ exclusivity: 'pronto' }))
    expect422(() => parsePropertyFilters({ capturedFrom: 'ayer' }))
    expect422(() => parsePropertyFilters({ capturedTo: '2026-02-30' }))
  })
})

// ---------------------------------------------------------------------------
// 1 · Estado comercial común
// ---------------------------------------------------------------------------

describe('estado comercial común', () => {
  it.each(KINDS)('filtro por estado comercial, varios a la vez y «sin indicar» (%s); otra agencia no cuenta', async (kind) => {
    const reservada = await property(kind, A)
    const vendida = await property(kind, A)
    const vacia = await property(kind, A)
    const sinFicha = await property(kind, A)
    await details(kind, A, reservada.id, { commercialStatus: 'reserved' })
    await details(kind, A, vendida.id, { commercialStatus: 'sold' })
    await details(kind, A, vacia.id, { commercialCode: 'SOLO-CODIGO' })
    // Una ficha ampliada de OTRA agencia apuntando al id de la nuestra no la hace «retirada».
    await db.insert(schema.propertyDetails).values({ organizationId: B.orgId, propertyKind: kind, propertyId: sinFicha.id, commercialStatus: 'withdrawn', createdAt: ts, updatedAt: ts })

    const seed = kind === 'agent' ? A.propertyId : A.projectId
    expect(await ids(kind, A, { commercialStatuses: ['reserved'] })).toEqual([reservada.id])
    expect(await ids(kind, A, { commercialStatuses: ['reserved', 'sold'] })).toEqual([reservada.id, vendida.id])
    expect(await ids(kind, A, { commercialStatuses: ['withdrawn'] })).toEqual([])
    expect(await ids(kind, A, { commercialStatuses: ['none'] })).toEqual([seed, vacia.id, sinFicha.id].sort((x, y) => x - y))
    expect(await ids(kind, A, { commercialStatuses: ['none', 'sold'] })).toEqual([seed, vendida.id, vacia.id, sinFicha.id].sort((x, y) => x - y))
  })

  it('parsePropertyFilters: estado comercial desconocido o característica fuera del catálogo → 422', () => {
    expect(parsePropertyFilters({ commercialStatus: 'reserved,none' }).commercialStatuses).toEqual(['reserved', 'none'])
    expect422(() => parsePropertyFilters({ commercialStatus: 'reserved,embargada' }))
    expect(parsePropertyFilters({ amenities: 'hasGym,hasFiber' }).amenities).toEqual(['hasGym', 'hasFiber'])
    // Ni una columna de la fila ni un nombre de columna SQL: sólo claves del catálogo.
    expect422(() => parsePropertyFilters({ amenities: 'hasPool' }))
    expect422(() => parsePropertyFilters({ amenities: 'has_gym = 1 or 1' }))
  })

  it('reglas puras: «Reservada» sigue al estado comercial; en 2ª mano vendida/disponible van con la disponibilidad', () => {
    expect(rowChangesForCommercialStatus('developer', 'reserved')).toEqual({ isReserved: 1 })
    expect(rowChangesForCommercialStatus('developer', 'sold')).toEqual({ isReserved: 0 })
    expect(rowChangesForCommercialStatus('agent', 'sold')).toEqual({ isReserved: 0, status: 'sold' })
    expect(rowChangesForCommercialStatus('agent', 'available')).toEqual({ isReserved: 0, status: 'available' })
    expect(rowChangesForCommercialStatus('agent', 'rented')).toEqual({ isReserved: 0 })
    expect(commercialStatusForAvailability('sold', 'reserved')).toBe('sold')
    expect(commercialStatusForAvailability('sold', null)).toBeUndefined() // no se inventa
    expect(commercialStatusForAvailability('available', 'sold')).toBe('available')
    expect(commercialStatusForAvailability('available', 'withdrawn')).toBeUndefined()
  })

  it('al guardar (PUT/POST): sólo actúa si el estado comercial o la disponibilidad cambian', async () => {
    const agent = await property('agent', A, { isReserved: 1 })
    // Guardar sin tocar el estado comercial no reescribe la casilla antigua.
    let data: Record<string, any> = { price: 1, isReserved: 1 }
    let sheet = { details: { commercialStatus: null } as Record<string, unknown>, legal: {} }
    await applyCommercialStatusRulesOnSave(db, A.orgId, 'agent', agent.id, data, sheet, agent)
    expect(data).toEqual({ price: 1, isReserved: 1 })

    // Pasar a «Vendida»: la disponibilidad va detrás y «Reservada» se quita.
    data = { isReserved: 1 }
    sheet = { details: { commercialStatus: 'sold' }, legal: {} }
    await applyCommercialStatusRulesOnSave(db, A.orgId, 'agent', agent.id, data, sheet, agent)
    expect(data).toEqual({ isReserved: 0, status: 'sold' })

    // Marcar la disponibilidad «Vendida» con un estado comercial «Reservada» guardado.
    await details('agent', A, agent.id, { commercialStatus: 'reserved' })
    data = { status: 'sold' }
    sheet = { details: { commercialStatus: 'reserved' }, legal: {} } // el editor reenvía el valor de antes
    await applyCommercialStatusRulesOnSave(db, A.orgId, 'agent', agent.id, data, sheet, { ...agent, status: 'available' })
    expect(sheet.details.commercialStatus).toBe('sold')
    expect(data).toEqual({ status: 'sold', isReserved: 0 })

    // Obra nueva: el estado de la obra nunca se toca.
    const dev = await property('developer', A)
    data = {}
    sheet = { details: { commercialStatus: 'sold' }, legal: {} }
    await applyCommercialStatusRulesOnSave(db, A.orgId, 'developer', dev.id, data, sheet, dev)
    expect(data).toEqual({ isReserved: 0 })

    // Alta con «Reservada».
    data = {}
    sheet = { details: { commercialStatus: 'reserved' }, legal: {} }
    await applyCommercialStatusRulesOnSave(db, A.orgId, 'developer', null, data, sheet, null)
    expect(data).toEqual({ isReserved: 1 })
  })

  it.each(KINDS)('acción masiva «Cambiar estado comercial» (%s): ficha ampliada, «Reservada», autor y fallo individual con una ajena', async (kind) => {
    const p1 = await property(kind, A)
    const p2 = await property(kind, A, { isReserved: 1 })
    const ajena = await property(kind, B)
    const job = await createBulkActionJob(ev(), A.orgId, A.userId, { entityType: kind, action: 'change_commercial_status', params: { commercialStatus: 'reserved' }, ids: [p1.id, p2.id, ajena.id] })
    const handlers = propertyBulkHandlers(kind)
    for (let i = 0; i < 4; i++) await processNextBulkActionItem(ev(), A.orgId, job.id, handlers)
    const res = await getBulkActionJob(ev(), A.orgId, job.id)
    expect(res!.job).toMatchObject({ status: 'partial', completedCount: 2, failedCount: 1, requestedBy: A.userId })
    expect(res!.items.find((it: any) => it.targetId === ajena.id)).toMatchObject({ status: 'failed', errorMessage: 'Propiedad no encontrada' })
    for (const p of [p1, p2]) {
      expect(await loadCommercialStatus(db, A.orgId, kind, p.id)).toBe('reserved')
      const [row] = await db.select().from(table(kind)).where(eq(table(kind).id, p.id))
      expect(row.isReserved).toBe(1)
      const [d] = await db.select().from(schema.propertyDetails).where(and(eq(schema.propertyDetails.propertyKind, kind), eq(schema.propertyDetails.propertyId, p.id)))
      expect(d).toMatchObject({ organizationId: A.orgId, updatedBy: A.userId })
    }
    // La propiedad de la otra agencia no se tocó.
    expect(await loadCommercialStatus(db, B.orgId, kind, ajena.id)).toBeNull()

    // Un valor fuera del vocabulario falla en cada fila, con su motivo.
    const bad = await createBulkActionJob(ev(), A.orgId, A.userId, { entityType: kind, action: 'change_commercial_status', params: { commercialStatus: 'embargada' }, ids: [p1.id] })
    const r = await processNextBulkActionItem(ev(), A.orgId, bad.id, handlers)
    expect((r as any).item).toMatchObject({ status: 'failed', errorMessage: expect.stringContaining('no válido') })
  })

  it('2ª mano: «Vendida» en bloque pasa la disponibilidad; «Cambiar disponibilidad» ajusta el estado comercial', async () => {
    const p = await property('agent', A)
    const handlers = propertyBulkHandlers('agent')
    const j1 = await createBulkActionJob(ev(), A.orgId, A.userId, { entityType: 'agent', action: 'change_commercial_status', params: { commercialStatus: 'sold' }, ids: [p.id] })
    await processNextBulkActionItem(ev(), A.orgId, j1.id, handlers)
    expect((await db.select().from(schema.agentProperties).where(eq(schema.agentProperties.id, p.id)))[0].status).toBe('sold')

    const j2 = await createBulkActionJob(ev(), A.orgId, A.userId, { entityType: 'agent', action: 'change_status', params: { status: 'available' }, ids: [p.id] })
    await processNextBulkActionItem(ev(), A.orgId, j2.id, handlers)
    expect(await loadCommercialStatus(db, A.orgId, 'agent', p.id)).toBe('available')
  })

  it('«Seleccionar todos los filtrados» usa el filtro de estado comercial y la misma búsqueda de texto', async () => {
    const a1 = await property('agent', A, { agencyReference: 'AG-77' })
    const a2 = await property('agent', A, { agencyReference: 'AG-78' })
    await details('agent', A, a1.id, { commercialStatus: 'withdrawn' })
    await details('agent', A, a2.id, { commercialStatus: 'available' })
    expect(await resolveFilteredPropertyIds(ev(), A.orgId, 'agent', { commercialStatus: 'withdrawn' })).toEqual([a1.id])
    expect((await resolveFilteredPropertyIds(ev(), A.orgId, 'agent', { q: 'AG-7' })).sort()).toEqual([a1.id, a2.id].sort())
  })
})

// ---------------------------------------------------------------------------
// 4 y 8 · Piscina, jardín y «Más características»
// ---------------------------------------------------------------------------

describe('piscina y jardín privados o comunitarios, y «Más características»', () => {
  it.each(KINDS)('«piscina» y «jardín» cuentan cualquiera de los tres; filtros propios de privada y comunitaria (%s)', async (kind) => {
    const generica = await property(kind, A, { hasPool: 1 })
    const privada = await property(kind, A)
    const comunitaria = await property(kind, A)
    const jardinPrivado = await property(kind, A)
    const jardinComun = await property(kind, A)
    const nada = await property(kind, A)
    await details(kind, A, privada.id, { hasPrivatePool: 1 })
    await details(kind, A, comunitaria.id, { hasCommunityPool: 1 })
    await details(kind, A, jardinPrivado.id, { hasPrivateGarden: 1 })
    await details(kind, A, jardinComun.id, { hasCommunityGarden: 1 })
    await details(kind, A, nada.id, { hasPrivatePool: 0, hasCommunityPool: 0 })
    // Una ficha ampliada de OTRA agencia con piscina privada que apunta al id de una nuestra: no cuenta.
    const cruzada = await property(kind, A)
    await db.insert(schema.propertyDetails).values({ organizationId: B.orgId, propertyKind: kind, propertyId: cruzada.id, hasPrivatePool: 1, createdAt: ts, updatedAt: ts })

    expect(await ids(kind, A, { features: ['pool'] })).toEqual([generica.id, privada.id, comunitaria.id])
    expect(await ids(kind, A, { features: ['garden'] })).toEqual([jardinPrivado.id, jardinComun.id])
    expect(await ids(kind, A, { features: ['privatePool'] })).toEqual([privada.id])
    expect(await ids(kind, A, { features: ['communityPool'] })).toEqual([comunitaria.id])
    expect(await ids(kind, A, { features: ['privateGarden'] })).toEqual([jardinPrivado.id])
    expect(await ids(kind, A, parsePropertyFilters({ features: 'pool,privateGarden' }))).toEqual([])
  })

  it.each(KINDS)('«Más características»: cualquier sí/no de la ficha ampliada, todas a la vez (%s)', async (kind) => {
    const completa = await property(kind, A)
    const media = await property(kind, A)
    await details(kind, A, completa.id, { hasGym: 1, hasFiber: 1, isBeachfront: 1 })
    await details(kind, A, media.id, { hasGym: 1, hasFiber: 0 })
    expect(await ids(kind, A, parsePropertyFilters({ amenities: 'hasGym' }))).toEqual([completa.id, media.id])
    expect(await ids(kind, A, parsePropertyFilters({ amenities: 'hasGym,hasFiber,isBeachfront' }))).toEqual([completa.id])
  })

  it('todas las características y referencias a la vez no pasan de 100 parámetros (límite de D1)', () => {
    const allAmenities = PROPERTY_AMENITY_FILTER_GROUPS.flatMap((g) => g.fields.map((f) => f.key)).join(',')
    for (const kind of KINDS) {
      const t = table(kind)
      const filters = parsePropertyFilters({
        amenities: allAmenities,
        features: 'terrace,pool,privatePool,communityPool,garage,elevator,garden,privateGarden',
        commercialStatus: 'available,reserved,sold,rented,withdrawn,draft,none',
        exclusivity: 'expiring',
        capturedFrom: '2026-01-01',
        capturedTo: '2026-12-31',
        priceMin: '1',
        priceMax: '9',
      })
      const searchFields = adminResources[kind === 'agent' ? 'properties' : 'developer-properties'].searchFields
      const q = db
        .select({ id: t.id })
        .from(t)
        .where(and(eq(t.organizationId, A.orgId), propertyTextSearchCond(kind, '123', searchFields), ...buildPropertyFilterConds(kind, filters)))
        .toSQL()
      expect(q.params.length, kind).toBeLessThan(100)
    }
    // Sin repetir en «Más características» las que ya están en «Características».
    const amenityKeys = PROPERTY_AMENITY_FILTER_GROUPS.flatMap((g) => g.fields.map((f) => f.key))
    expect(amenityKeys).not.toContain('hasPrivatePool')
    expect(amenityKeys).toContain('hasCommunityGarden')
    expect(amenityKeys).toContain('hasAirConditioning')
  })

  it('matching: la piscina o el jardín privado o comunitario de la ficha ampliada cuentan; dos «no» explícitos son «no»', async () => {
    const base = { id: 1, hasPool: 0, hasGarden: 0, featuresReviewedAt: null }
    expect(featureValue(base, 'pool')).toBeNull()
    expect(featureValue({ ...base, hasPrivatePool: 1 }, 'pool')).toBe(true)
    expect(featureValue({ ...base, hasCommunityPool: 1 }, 'pool')).toBe(true)
    expect(featureValue({ ...base, hasCommunityGarden: 1 }, 'garden')).toBe(true)
    expect(featureValue({ ...base, hasPrivatePool: 0, hasCommunityPool: 0 }, 'pool')).toBe(false)
    expect(featureValue({ ...base, hasPrivatePool: 0, hasCommunityPool: null }, 'pool')).toBeNull()
    expect(featureValue({ ...base, featuresReviewedAt: ts }, 'pool')).toBe(false)
    expect(featureValue({ ...base, featuresReviewedAt: ts, hasPrivatePool: 1 }, 'pool')).toBe(true)

    // Y el servicio carga esas columnas de la ficha ampliada de la agencia (nunca de otra).
    const p = await property('agent', A)
    await details('agent', A, p.id, { hasCommunityPool: 1 })
    await db.insert(schema.propertyDetails).values({ organizationId: B.orgId, propertyKind: 'agent', propertyId: A.propertyId, hasPrivateGarden: 1, createdAt: ts, updatedAt: ts })
    const [withDetails, seedRow] = await withPropertyDetails(db, A.orgId, 'agent', [{ id: p.id, hasPool: 0 }, { id: A.propertyId, hasGarden: 0 }])
    expect(featureValue(withDetails as any, 'pool')).toBe(true)
    expect((seedRow as any).hasPrivateGarden).toBeNull()
    expect(featureValue(seedRow as any, 'garden')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 7 · Búsqueda por referencias
// ---------------------------------------------------------------------------

describe('búsqueda de texto por referencias, código comercial y calle', () => {
  it.each(KINDS)('referencia interna, externa, de agencia, código comercial, id y (2ª mano) calle — sólo de la agencia (%s)', async (kind) => {
    const searchFields = adminResources[kind === 'agent' ? 'properties' : 'developer-properties'].searchFields
    const t = table(kind)
    const find = async (f: TenantFixture, q: string) =>
      (await db.select({ id: t.id }).from(t).where(and(eq(t.organizationId, f.orgId), propertyTextSearchCond(kind, q, searchFields))).orderBy(asc(t.id))).map((r: any) => r.id)

    const ext = await property(kind, A, { externalReference: 'IDEALISTA-998877' })
    const ag = await property(kind, A, { agencyReference: 'OF-CENTRO-42' })
    const calle = await property(kind, A, { street: 'Calle del Pez Volador' })
    const cod = await property(kind, A, {})
    await details(kind, A, cod.id, { commercialCode: 'CARTEL-5150' })
    // El mismo código comercial en otra agencia no aparece.
    const ajena = await property(kind, B, {})
    await details(kind, B, ajena.id, { commercialCode: 'CARTEL-5150' })

    expect(await find(A, 'IDEALISTA-998877')).toEqual([ext.id])
    expect(await find(A, 'of-centro')).toEqual([ag.id])
    expect(await find(A, 'CARTEL-5150')).toEqual([cod.id])
    expect(await find(B, 'CARTEL-5150')).toEqual([ajena.id])
    expect(await find(A, String(cod.id))).toContain(cod.id)
    expect(await find(A, 'Pez Volador')).toEqual(kind === 'agent' || searchFields.includes('street') ? [calle.id] : [])
    expect(searchFields).toEqual(expect.arrayContaining(['reference', 'externalReference', 'agencyReference', 'street']))
  })

  it('la búsqueda de las Domain Tools (`text`) también encuentra por referencia de agencia y código comercial', async () => {
    const p = await property('developer', A, { agencyReference: 'AGC-1' })
    const q = await property('agent', A, {})
    await details('agent', A, q.id, { commercialCode: 'COD-AGENT-1' })
    expect(await ids('developer', A, { text: 'AGC-1' })).toEqual([p.id])
    expect(await ids('agent', A, { text: 'COD-AGENT-1' })).toEqual([q.id])
  })
})

// ---------------------------------------------------------------------------
// 9 y 10 · Portal en 2ª mano y exportación sin tope
// ---------------------------------------------------------------------------

describe('portal en 2ª mano y exportación CSV por lotes', () => {
  it('el filtro «portal» no se arrastra en 2ª mano desde un enlace o una vista guardada', () => {
    const query = { portal: 'idealista', subtype: 'flat', commercialStatus: 'reserved', exclusivity: 'expired', amenities: 'hasGym' }
    expect(pickExtraFilters(query, { allowPortal: false })).toEqual({ subtype: 'flat', commercialStatus: 'reserved', exclusivity: 'expired', amenities: 'hasGym' })
    expect(pickExtraFilters(query)).toMatchObject({ portal: 'idealista' })
    const chips = extraFilterChips({ commercialStatus: 'reserved,none', exclusivity: 'expiring', amenities: 'hasGym,hasFiber' }, null)
    expect(chips.map((c) => c.label)).toEqual(['Con gimnasio, fibra óptica', 'Estado comercial: reservada o sin indicar', 'Exclusiva que caduca en 30 días'])
    expect(COMMERCIAL_STATUS_FILTER_OPTIONS.map((o) => o.value)).toEqual(['available', 'reserved', 'sold', 'rented', 'withdrawn', 'draft', 'none'])
  })

  it.each(KINDS)('exporta TODO el filtro (%s), por lotes, cada fila una vez, sólo de la agencia y con el estado comercial', async (kind) => {
    const t = table(kind)
    const created: number[] = []
    for (let i = 0; i < 23; i++) created.push((await property(kind, A, { price: 1000 + i })).id)
    await property(kind, B, { price: 1005 })
    await details(kind, A, created[3], { commercialStatus: 'rented' })
    const where = and(eq(t.organizationId, A.orgId), ...buildPropertyFilterConds(kind, { priceMin: 1000, priceMax: 2000 }))
    const rows = await exportPropertyRows(db, kind, where, sql`${t.price} desc`, 5)
    expect(rows).toHaveLength(23)
    expect(new Set(rows.map((r) => r.id)).size).toBe(23)
    expect(rows.map((r) => r.id).sort((x: any, y: any) => x - y)).toEqual(created)
    expect(rows.find((r) => r.id === created[3])).toMatchObject({ commercialStatus: 'rented' })
    expect(rows[0].price).toBe(1022)
  })
})

describe('renta mensual: cómo se lee el precio de un alquiler', () => {
  it('«/mes» y «/m²·mes» sólo con operación alquiler', () => {
    expect(priceSuffixFor('rent')).toBe('/mes')
    expect(priceSuffixFor('sale')).toBe('')
    expect(priceSuffixFor(null)).toBe('')
    expect(pricePerM2SuffixFor('rent')).toBe('/m²·mes')
    expect(pricePerM2SuffixFor('sale')).toBe('/m²')
  })
})

describe('resumen de la ficha: quién la creó y cuándo', () => {
  it('nombre del autor sólo si es de la agencia (o super_admin); estado de la obra / disponibilidad con su nombre', async () => {
    const { buildPropertySummary } = await import('../../server/utils/properties/summary')
    const user = { id: A.userId, role: 'admin', email: 'a@example.com', name: 'Admin', organizationId: A.orgId, permissions: JSON.stringify(['web:read']) } as any
    const [userB] = await db.select().from(schema.users).where(eq(schema.users.id, B.userId))
    const own = await property('agent', A, { createdBy: A.userId, createdAt: '2026-03-02 10:00:00', transactionType: 'rent', price: 1200, area: 60 })
    const foreign = await property('developer', A, { createdBy: userB.id })
    const legacy = await property('developer', A, { createdBy: null })
    const s1 = await buildPropertySummary(ev(), db, {}, A.orgId, user, 'agent', own, { commercialStatus: 'reserved' })
    expect(s1).toMatchObject({ createdBy: A.userId, createdByName: 'D1pAlpha Admin', createdAt: '2026-03-02 10:00:00', statusTitle: 'Disponibilidad', commercialStatusLabel: 'Reservada', pricePerM2: 20 })
    const s2 = await buildPropertySummary(ev(), db, {}, A.orgId, user, 'developer', foreign, {})
    expect(s2).toMatchObject({ createdBy: userB.id, createdByName: null, statusTitle: 'Estado de la obra' })
    const s3 = await buildPropertySummary(ev(), db, {}, A.orgId, user, 'developer', legacy, {})
    expect(s3).toMatchObject({ createdBy: null, createdByName: null })
  })
})

describe('rótulos del panel: estado de la obra / disponibilidad, dormitorios, renta mensual y campos heredados', () => {
  const fieldsOf = (resource: string) => PROPERTY_BUILDER_SECTIONS[resource].flatMap((sec: any) => (sec.fields || []) as FieldSpec[])

  it('el `status` de cada catálogo tiene su propio nombre, en el listado y en el editor', () => {
    expect(PROPERTY_LIST_CONFIG['developer-properties'].statusTitle).toBe('Estado de la obra')
    expect(PROPERTY_LIST_CONFIG.properties.statusTitle).toBe('Disponibilidad')
    expect(fieldsOf('developer-properties').find((f) => f.key === 'status')?.label).toBe('Estado de la obra')
    expect(fieldsOf('properties').find((f) => f.key === 'status')?.label).toBe('Disponibilidad')
    expect(adminResources.properties.fields.status.label).toBe('Disponibilidad')
    for (const r of ['developer-properties', 'properties']) expect(fieldsOf(r).some((f) => f.key === 'commercialStatus')).toBe(true)
  })

  it('«Dormitorios», fechas con calendario, «Renta mensual» en alquiler y los campos heredados sólo con valor', () => {
    for (const r of ['developer-properties', 'properties']) {
      const fields = fieldsOf(r)
      const byKey = (k: string) => fields.find((f) => f.key === k)!
      expect(byKey('bedrooms').label).toBe('Dormitorios')
      for (const k of ['captureDate', 'exclusiveFrom', 'exclusiveUntil']) expect(byKey(k).type, `${r}.${k}`).toBe('date')
      expect(byKey('price').labelFor!({ transactionType: 'rent' })).toBe('Renta mensual')
      expect(byKey('price').labelFor!({ transactionType: 'sale' })).not.toBe('Renta mensual')
      // Con el símbolo de la moneda de la agencia (cierre D3b); fuera de Nuxt, el de la moneda por defecto.
      const sym = currencySymbol(DEFAULT_AGENCY_CURRENCY)
      expect(byKey('pricePerSquareMeter').labelFor!({ transactionType: 'rent' })).toContain(`${sym}/m²·mes`)
      expect(byKey('pricePerSquareMeter').compute!({ transactionType: 'rent', price: 1200, area: 60 })).toBe(`20 ${sym}/m²·mes`)
      expect(byKey('serviceChargeAnnual').legacyOnly).toBe(true)
      expect(byKey('isReserved').legacyOnly).toBe(true)
      // La comunidad se escribe en un solo sitio.
      expect(fields.filter((f) => f.key === 'communityFeeMonthly' && !f.legacyOnly)).toHaveLength(1)
    }
  })

  it('una fecha antigua escrita a mano no es un error mientras nadie la toque', () => {
    const field = { key: 'captureDate', type: 'date' }
    expect(validatePropertyField(field, '15/03/2025', false)).toBe('')
    expect(validatePropertyField(field, '15/03/2025', true)).toMatch(/AAAA-MM-DD/)
    expect(validatePropertyField(field, '2025-03-15', true)).toBe('')
  })
})
