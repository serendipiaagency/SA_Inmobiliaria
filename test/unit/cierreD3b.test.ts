import { and, eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { createError } from 'h3'
import * as schema from '../../server/db/schema'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'

/**
 * Cierre D3b del núcleo inmobiliario, sobre una SQLite real con las
 * migraciones reales:
 *  - FASE 5 — la moneda de la agencia como fuente de verdad: panel y
 *    servidor formatean con ella sin convertir; la web la toma como base y
 *    convierte con tasas relativas; registros con moneda propia; agencia sin
 *    ajuste = AED, como antes;
 *  - FASE 1/27 — tipos de la web pública: catálogo común, sólo los
 *    publicados por la agencia, rótulos en castellano y traducidos;
 *  - FASE 2 — búsqueda pública por código postal y por radio, sobre las
 *    coordenadas publicadas; insignia y búsqueda guardada;
 *  - FASE 28 — «Crear catálogo» con propiedades de 2ª mano: sólo las de la
 *    agencia, sólo fotos publicables, privacidad de ubicación, y el PDF
 *    combinado de verdad con el motor de Asset Export Studio.
 */

// R2 en memoria para los PDF del catálogo (fragmentos y ensamblado).
const { fakeR2 } = vi.hoisted(() => {
  const store = new Map<string, { bytes: Uint8Array; contentType?: string }>()
  return {
    fakeR2: {
      store,
      async put(key: string, bytes: Uint8Array, opts?: { httpMetadata?: { contentType?: string } }) {
        store.set(key, { bytes: new Uint8Array(bytes), contentType: opts?.httpMetadata?.contentType })
      },
      async get(key: string) {
        const o = store.get(key)
        if (!o) return null
        return { arrayBuffer: async () => o.bytes.slice().buffer, httpMetadata: { contentType: o.contentType } }
      },
      async delete(key: string) {
        store.delete(key)
      },
    },
  }
})

vi.mock('../../server/utils/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/utils/db')>()
  return { ...actual, useDb: (event: any) => event.context.db, cfEnv: () => ({ MEDIA: fakeR2 }) }
})
vi.mock('../../server/utils/audit', () => ({ logAdminAction: vi.fn() }))
// Los endpoints se prueban llamando a su handler: la sesión la pone la prueba.
vi.mock('../../server/utils/auth', () => ({
  requireOrgScope: async (event: any) => ({ user: event.context.user, orgId: event.context.orgId }),
}))

// Globales que Nitro inyecta en los handlers de server/api.
vi.stubGlobal('defineEventHandler', (fn: any) => fn)
vi.stubGlobal('createError', createError)
vi.stubGlobal('getQuery', (event: any) => event.context.query || {})
vi.stubGlobal('readBody', async (event: any) => event.context.body)
vi.stubGlobal('getRouterParam', (event: any, key: string) => event.context.params?.[key])
vi.stubGlobal('getRequestURL', () => new URL('https://panel.agencia.example/admin'))

const ts = '2026-01-01 00:00:00'
let seq = 0
const adminUser = { id: 1, role: 'admin', email: 'admin@example.com', permissions: null } as any
const adminEv = (db: any, orgId: number, extra: { body?: any; query?: any; params?: any } = {}) => ({ context: { db, orgId, user: adminUser, ...extra } }) as any
const publicEv = (db: any, orgId: number, query: Record<string, unknown> = {}) => ({ context: { db, org: { id: orgId }, query } }) as any

async function setCurrency(db: any, orgId: number, code: string) {
  await db.insert(schema.settings).values({ key: `org:${orgId}:currency`, value: code, updatedAt: ts })
}

async function flat(db: any, orgId: number, over: Record<string, any> = {}) {
  seq += 1
  const [row] = await db
    .insert(schema.agentProperties)
    .values({
      organizationId: orgId,
      slug: `d3b-piso-${seq}`,
      reference: `S-D3B${seq}`,
      propertyType: 'Apartment',
      transactionType: 'sale',
      city: 'Madrid',
      community: 'Chamberí',
      street: 'Calle de Fuencarral',
      streetNumber: '123',
      floor: '3',
      doorLetter: 'B',
      postalCode: '28010',
      price: 350_000,
      area: 90,
      bedrooms: 3,
      bathrooms: 2,
      status: 'available',
      mainImage: `uploads/d3b-portada-${seq}.jpg`,
      lat: 40.4312,
      lng: -3.7025,
      createdAt: ts,
      updatedAt: ts,
      ...over,
    })
    .returning()
  return row
}

async function project(db: any, orgId: number, over: Record<string, any> = {}) {
  seq += 1
  const [developer] = await db.select({ id: schema.developers.id }).from(schema.developers).where(eq(schema.developers.organizationId, orgId)).limit(1)
  const [row] = await db
    .insert(schema.developerProperties)
    .values({ organizationId: orgId, developerId: developer.id, name: `Residencial D3b ${seq}`, slug: `d3b-res-${seq}`, status: 'new', price: 400_000, area: 100, createdAt: ts, updatedAt: ts, ...over })
    .returning()
  return row
}

async function pdfTemplateId(db: any): Promise<number> {
  const { FORMAT_BY_KEY } = await import('../../server/utils/assetExport/formats')
  const rows = await db.select().from(schema.assetExportTemplates)
  const t = rows.find((r: any) => r.organizationId === null && FORMAT_BY_KEY[r.formatKey]?.renderReady)
  if (!t) throw new Error('No hay ninguna plantilla PDF del sistema sembrada por las migraciones')
  return t.id
}

// ---------------------------------------------------------------------------
// FASE 5 — moneda de la agencia
// ---------------------------------------------------------------------------

describe('D3b · FASE 5 — la moneda de la agencia (regla en utils/currency.ts)', () => {
  it('panel y servidor: formatean con la moneda indicada, en castellano y SIN convertir', async () => {
    const { formatMoney } = await import('../../utils/currency')
    expect(formatMoney(1_250_000, 'EUR')).toBe('1.250.000 €')
    expect(formatMoney(1_250_000, 'AED')).toBe('1.250.000 AED')
    expect(formatMoney(1_250_000, 'eur')).toBe('1.250.000 €')
    expect(formatMoney(1_250_000, 'USD')).toMatch(/^1\.250\.000\s*US\$$/)
    // Sin moneda (o una que la plataforma no conoce): la de por defecto, AED.
    expect(formatMoney(1_250_000, null)).toBe('1.250.000 AED')
    expect(formatMoney(1_250_000, 'XYZ')).toBe('1.250.000 AED')
    expect(formatMoney(1_250_000, 'EUR', { compact: true })).toBe('1,3 M €')
    expect(formatMoney(312_000, 'AED', { compact: true })).toBe('312 mil AED')
    expect(formatMoney(null, 'EUR')).toBe('—')
    expect(formatMoney(undefined, 'EUR', { empty: 'Sin precio' })).toBe('Sin precio')
  })

  it('la web convierte desde la moneda BASE de la agencia con tasas relativas (no «desde AED»)', async () => {
    const { convertAmount, formatDisplayPrice, CURRENCIES } = await import('../../utils/currency')
    // Misma moneda: el mismo importe, sin redondeos de más.
    expect(convertAmount(123_456.78, 'EUR', 'EUR')).toBe(123_456.78)
    // Las tasas son relativas entre sí: EUR→USD sale de su cociente, sin pasar por AED.
    const per = Object.fromEntries(CURRENCIES.map((c) => [c.code, c.perUsd]))
    expect(convertAmount(1000, 'EUR', 'USD')).toBeCloseTo(1000 / per.EUR, 6)
    // Ida y vuelta: vuelve al importe de partida.
    expect(convertAmount(convertAmount(500_000, 'EUR', 'GBP'), 'GBP', 'EUR')).toBeCloseTo(500_000, 6)
    // Las tasas cruzadas de antes se conservan: un visitante de una agencia en AED ve lo mismo que antes.
    expect(convertAmount(1_000_000, 'AED', 'EUR')).toBeCloseTo(253_200, -2)
    expect(convertAmount(1_000_000, 'AED', 'USD')).toBeCloseTo(272_300, -2)
    // Agencia en euros, visitante sin elección: los euros tal cual, escritos como en España.
    expect(formatDisplayPrice(450_000, 'EUR', 'EUR')).toBe('450.000 €')
    // Agencia en euros, visitante en AED: convertido desde los euros.
    expect(formatDisplayPrice(450_000, 'EUR', 'AED')).toBe(`AED ${new Intl.NumberFormat('en-AE').format(Math.round((450_000 * per.AED) / per.EUR))}`)
    // Agencia en AED (la de por defecto), visitante en dólares: el aspecto de siempre.
    expect(formatDisplayPrice(1_000_000, 'AED', 'USD')).toBe(`$${new Intl.NumberFormat('en-US').format(Math.round((1_000_000 * per.USD) / per.AED))}`)
    expect(formatDisplayPrice(1_500_000, 'EUR', 'EUR', { compact: true })).toBe('1,5M €')
    expect(formatDisplayPrice(1_500_000, 'AED', 'AED', { compact: true })).toBe('AED 1.5M')
  })

  it('servidor: la elegida en Configuración; sin ajuste, AED; cada agencia la suya', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D3bMonedaA')
    const b = await seedTenant(db, 'D3bMonedaB')
    const { organizationCurrency, organizationCurrencySetting, defaultRecordCurrency } = await import('../../server/utils/currency')

    expect(await organizationCurrency(db, a.orgId)).toBe('AED')
    expect(await organizationCurrencySetting(db, a.orgId)).toBeNull()
    expect(await defaultRecordCurrency(db, a.orgId)).toBe('eur')

    await setCurrency(db, a.orgId, 'eur')
    expect(await organizationCurrency(db, a.orgId)).toBe('EUR')
    expect(await defaultRecordCurrency(db, a.orgId)).toBe('eur')
    // El ajuste de A no es el de B.
    expect(await organizationCurrency(db, b.orgId)).toBe('AED')

    // La agencia 1 conserva su ajuste anterior al espacio de nombres; el namespaced manda.
    await db.delete(schema.settings).where(eq(schema.settings.key, 'currency'))
    await db.insert(schema.settings).values({ key: 'currency', value: 'GBP', updatedAt: ts })
    expect(await organizationCurrency(db, 1)).toBe('GBP')
    await setCurrency(db, 1, 'USD')
    expect(await organizationCurrency(db, 1)).toBe('USD')
    // …y la clave anterior NO es de ninguna otra agencia.
    expect(await organizationCurrency(db, b.orgId)).toBe('AED')
  })

  it('el panel y la web la reciben: active-org-info (cualquier cuenta del panel) y el tenant público', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D3bInfoA')
    const b = await seedTenant(db, 'D3bInfoB')
    await setCurrency(db, a.orgId, 'EUR')
    const info = (await import('../../server/api/admin/active-org-info.get')).default as any
    expect(await info(adminEv(db, a.orgId))).toMatchObject({ id: a.orgId, currency: 'EUR', recordCurrency: 'eur' })
    expect(await info(adminEv(db, b.orgId))).toMatchObject({ id: b.orgId, currency: 'AED', recordCurrency: 'eur' })

    const tenant = (await import('../../server/api/public/tenant.get')).default as any
    expect((await tenant(publicEv(db, a.orgId))).currency).toBe('EUR')
    expect((await tenant(publicEv(db, b.orgId))).currency).toBe('AED')
  })

  it('ofertas nuevas: la moneda de la agencia si la eligió; si no, eur como antes; la explícita se respeta', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D3bOfertaA')
    const [buyer] = await db.insert(schema.contacts).values({ organizationId: a.orgId, name: 'Comprador D3b', status: 'active', createdAt: ts, updatedAt: ts }).returning()
    const { createOffer } = await import('../../server/utils/offers/service')
    const legacy = await createOffer(db, a.orgId, { propertyId: a.propertyId, propertyKind: 'agent', buyerContactId: buyer.id, amount: 300_000 })
    expect(legacy.currency).toBe('eur')
    await setCurrency(db, a.orgId, 'AED')
    const chosen = await createOffer(db, a.orgId, { propertyId: a.propertyId, propertyKind: 'agent', buyerContactId: buyer.id, amount: 300_000 })
    expect(chosen.currency).toBe('aed')
    const explicit = await createOffer(db, a.orgId, { propertyId: a.propertyId, propertyKind: 'agent', buyerContactId: buyer.id, amount: 300_000, currency: 'USD' })
    expect(explicit.currency).toBe('usd')
  })

  it('servidor: WhatsApp, matching, resumen de la necesidad e IA citan la moneda de la agencia', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D3bServidor')
    const p = await flat(db, a.orgId, { price: 180_000, street: 'Avenida Sur', city: 'Málaga' })
    const { buildPropertyShare } = await import('../../server/utils/comms/admin')

    // Sin ajuste: AED (lo de por defecto), nunca «€» fijo.
    expect((await buildPropertyShare(db, a.orgId, p.id, 'agent', 'https://agencia.example')).text).toContain('180.000 AED')
    await setCurrency(db, a.orgId, 'EUR')
    const share = await buildPropertyShare(db, a.orgId, p.id, 'agent', 'https://agencia.example')
    expect(share.text).toContain('180.000 €')
    expect(share.text).not.toContain('AED')

    const { evaluateMatch } = await import('../../server/utils/matching/engine')
    const requirement: any = { operation: 'sale', priceMax: 200_000, criteria: [] }
    const price = (r: any) => r.criteria.find((c: any) => c.key === 'price')?.detail || ''
    expect(price(evaluateMatch({ id: 1, price: 180_000 } as any, requirement, { currency: 'EUR' }))).toContain('180.000 €')
    expect(price(evaluateMatch({ id: 1, price: 180_000 } as any, requirement))).toContain('180.000 AED')

    const { summarizeRequirement } = await import('../../server/utils/buyerRequirements/service')
    expect(summarizeRequirement({ operation: 'sale', priceMax: 650_000 }, 'EUR')).toContain('≤ 650.000 €')
    expect(summarizeRequirement({ operation: 'sale', priceMax: 650_000 })).toContain('≤ 650.000 AED')

    const { fallbackAnswer } = await import('../../server/utils/ai')
    const eur = fallbackAnswer('¿Necesita reforma?', { status: 'ready', name: 'X' }, 'EUR')
    expect(eur).toMatch(/€–.*€\/m²/)
    expect(eur).not.toContain('AED')
    expect(fallbackAnswer('¿Necesita reforma?', { status: 'ready', name: 'X' })).toContain('400 AED–700 AED/m²')

    // INMO sabe en qué moneda están los importes de la agencia.
    const { inmoSystemPrompt } = await import('../../server/utils/inmo/orchestrator')
    expect(inmoSystemPrompt({ nowIso: '2026-10-06 10:00', entities: [], currency: 'EUR' })).toContain('están en EUR')
    expect(inmoSystemPrompt({ nowIso: '2026-10-06 10:00', entities: [] })).not.toContain('MONEDA')
  })

  it('un precio escrito en la fila acepta cualquier moneda de la plataforma (se guarda sin convertir)', async () => {
    const { parseInlineNumber } = await import('../../utils/inlineEdit')
    expect(parseInlineNumber('1.250.000 AED')).toBe(1_250_000)
    expect(parseInlineNumber('US$ 450.000')).toBe(450_000)
    expect(parseInlineNumber('£ 300000')).toBe(300_000)
    expect(parseInlineNumber(' 1 250 000 € ')).toBe(1_250_000)
  })
})

// ---------------------------------------------------------------------------
// FASE 1 / 27 — tipos en la web pública
// ---------------------------------------------------------------------------

describe('D3b · tipos de la web pública: catálogo común, sólo los publicados, en castellano y traducidos', () => {
  it('el diccionario castellano dice lo mismo que el catálogo, y los seis idiomas tienen los 15 tipos', async () => {
    const { PROPERTY_TYPES, PROPERTY_TYPE_LABELS, propertyTypeI18nKey } = await import('../../utils/propertySheet')
    const { messages, LOCALES } = await import('../../i18n/messages')
    for (const type of PROPERTY_TYPES) {
      expect(messages.es[propertyTypeI18nKey(type)], type).toBe(PROPERTY_TYPE_LABELS[type])
      for (const l of LOCALES) expect(messages[l.code]?.[propertyTypeI18nKey(type)], `${l.code} ${type}`).toBeTruthy()
    }
    for (const key of ['filters.postalCode', 'filters.nearby', 'map.searchNearby', 'map.nearbyMyLocation']) {
      for (const l of LOCALES) expect(messages[l.code]?.[key], `${l.code} ${key}`).toBeTruthy()
    }
  })

  it('orden del catálogo, sin repetidos ni vacíos; un valor antiguo fuera del catálogo va al final', async () => {
    const { orderPropertyTypes } = await import('../../utils/propertySheet')
    expect(orderPropertyTypes(['Penthouse', null, 'Apartment', 'Penthouse', '', 'loft antiguo', 'Villa'])).toEqual(['Apartment', 'Villa', 'Penthouse', 'loft antiguo'])
  })

  it('facets=types: sólo los tipos de la agencia del host, de propiedades vivas, y sin encoger con los filtros', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D3bTiposA')
    const b = await seedTenant(db, 'D3bTiposB')
    await project(db, a.orgId, { propertyType: 'Penthouse', price: 900_000 })
    await project(db, a.orgId, { propertyType: 'Apartment', price: 300_000 })
    await project(db, a.orgId, { propertyType: 'Villa', deletedAt: ts }) // en la papelera
    await project(db, b.orgId, { propertyType: 'Office' }) // de otra agencia
    const handler = (await import('../../server/api/public/properties.get')).default as any

    const res = await handler(publicEv(db, a.orgId, { countOnly: '1', facets: 'types' }))
    expect(res.facets.types).toEqual(['Apartment', 'Penthouse'])
    // Con un filtro que deja fuera los áticos, la lista de tipos no cambia.
    const filtered = await handler(publicEv(db, a.orgId, { facets: 'types', maxPrice: '400000' }))
    expect(filtered.facets.types).toEqual(['Apartment', 'Penthouse'])
    expect(filtered.rows.every((r: any) => r.organizationId === a.orgId)).toBe(true)
    // Sin pedirlo, la respuesta no cambia de forma.
    expect((await handler(publicEv(db, a.orgId, { countOnly: '1' }))).facets).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// FASE 2 — código postal y radio en la web pública
// ---------------------------------------------------------------------------

describe('D3b · FASE 2 — búsqueda pública por código postal y por radio', () => {
  it('código postal por prefijo, saneado (sin comodines), y sólo de la agencia del host', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D3bCpA')
    const b = await seedTenant(db, 'D3bCpB')
    const centro = await project(db, a.orgId, { postalCode: '28013' })
    const norte = await project(db, a.orgId, { postalCode: '28100' })
    await project(db, a.orgId, { postalCode: '08001' })
    await project(db, b.orgId, { postalCode: '28013' })
    const handler = (await import('../../server/api/public/properties.get')).default as any
    const ids = async (q: Record<string, unknown>) => (await handler(publicEv(db, a.orgId, q))).rows.map((r: any) => r.id).sort()

    expect(await ids({ postalCode: '280' })).toEqual([centro.id])
    expect(await ids({ postalCode: '28' })).toEqual([centro.id, norte.id].sort())
    expect(await ids({ postalCode: ' 28013 ' })).toEqual([centro.id])
    // «%» y «_» no son comodines de LIKE: se quitan. «%» solo se queda en nada
    // (sin filtro, como no escribir nada) y «0_0» busca «00…», no «0?0…».
    expect(await ids({ postalCode: '%' })).toEqual(await ids({}))
    expect(await ids({ postalCode: '0_0' })).toEqual([])
  })

  it('radio sobre las coordenadas QUE SE PUBLICAN: la ubicación aproximada busca por el punto redondeado', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D3bRadioA')
    const b = await seedTenant(db, 'D3bRadioB')
    const exacta = await project(db, a.orgId, { lat: 40.4168, lng: -3.7038, locationPrivacy: 'exact' })
    // Mismo punto, pero aproximada con 2 km de privacidad: se publica en la cuadrícula de 0,018°, a ~700 m.
    const aproximada = await project(db, a.orgId, { lat: 40.4168, lng: -3.7038, locationPrivacy: 'approximate', locationPrivacyRadius: 2000 })
    const lejos = await project(db, a.orgId, { lat: 40.5, lng: -3.7, locationPrivacy: 'exact' })
    await project(db, b.orgId, { lat: 40.4168, lng: -3.7038, locationPrivacy: 'exact' })
    const handler = (await import('../../server/api/public/properties.get')).default as any
    const ids = async (q: Record<string, unknown>) => (await handler(publicEv(db, a.orgId, q))).rows.map((r: any) => r.id).sort()

    // 200 m alrededor del punto real: la exacta sí; la aproximada no (su pin publicado está más lejos).
    expect(await ids({ lat: '40.4168', lng: '-3.7038', radiusKm: '0.2' })).toEqual([exacta.id])
    // 2 km: las dos del centro; la de 9 km al norte, no; la de otra agencia, nunca.
    expect(await ids({ lat: '40.4168', lng: '-3.7038', radiusKm: '2' })).toEqual([exacta.id, aproximada.id].sort())
    expect(await ids({ lat: '40.4168', lng: '-3.7038', radiusKm: '25' })).toEqual([exacta.id, aproximada.id, lejos.id].sort())
    // Un radio mal formado no se ignora en silencio: 422.
    await expect(handler(publicEv(db, a.orgId, { lat: '40.4', lng: '-3.7', radiusKm: '0' }))).rejects.toMatchObject({ statusCode: 422 })
  })

  it('la insignia cuenta el código postal y el radio (como UNO); un radio a medias no cuenta', async () => {
    const { countActivePublicFilters, nearbyFromQuery } = await import('../../utils/publicSearch')
    expect(countActivePublicFilters({})).toBe(0)
    expect(countActivePublicFilters({ postalCode: '28010' })).toBe(1)
    expect(countActivePublicFilters({ postalCode: '28010', lat: '40.4', lng: '-3.7', radiusKm: '5', bedrooms: '2' })).toBe(3)
    expect(countActivePublicFilters({ lat: '40.4', lng: '-3.7' })).toBe(0)
    expect(countActivePublicFilters({ q: 'Chamberí', page: '2', sort: 'price_asc', north: '1' })).toBe(0)
    expect(nearbyFromQuery({ lat: '40.4', lng: '-3.7', radiusKm: '5' })).toEqual({ lat: 40.4, lng: -3.7, radiusKm: 5 })
    expect(nearbyFromQuery({ lat: 'x', lng: '-3.7', radiusKm: '5' })).toBeNull()
  })

  it('la posición del visitante sale redondeada a ~110 m, y la búsqueda guardada se reconoce por CP y radio', async () => {
    const { nearbyQuery, withoutNearby, normalizePostalCode } = await import('../../utils/publicSearch')
    expect(nearbyQuery(40.416834, -3.703791, 5)).toEqual({ lat: '40.417', lng: '-3.704', radiusKm: '5' })
    expect(withoutNearby({ lat: '1', lng: '2', radiusKm: '3', postalCode: '28010' })).toEqual({ postalCode: '28010' })
    expect(normalizePostalCode(' sw1a  1aa ')).toBe('SW1A 1AA')
    // Sin comodines ni comillas, y como mucho 10 caracteres.
    expect(normalizePostalCode("28%' OR 1=1 --")).toBe('28 OR 11 -')

    const { describePublicSearch } = await import('../../composables/useSavedSearches')
    const t = (_k: string, fallback?: string) => fallback || _k
    const label = describePublicSearch({ municipality: 'Madrid', postalCode: '28010', lat: '40.4', lng: '-3.7', radiusKm: '5', type: 'Penthouse' }, t, (ty) => (ty === 'Penthouse' ? 'Ático' : ty))
    expect(label).toBe('Madrid · 28010 · a menos de 5 km · Ático')
  })

  it('geolocalización: sólo para el propio origen y sólo en la web pública; panel y widget, cerrada', async () => {
    const { permissionsPolicyFor } = await import('../../server/utils/permissionsPolicy')
    expect(permissionsPolicyFor('/mapa')).toBe('geolocation=(self), microphone=(), camera=()')
    expect(permissionsPolicyFor('/propiedades')).toContain('geolocation=(self)')
    for (const path of ['/admin', '/admin/mapa', '/embed', '/embed/x', '/api/public/properties']) {
      expect(permissionsPolicyFor(path), path).toBe('geolocation=(), microphone=(), camera=()')
    }
  })
})

// ---------------------------------------------------------------------------
// FASE 28 — «Crear catálogo» con propiedades de 2ª mano
// ---------------------------------------------------------------------------

describe('D3b · FASE 28 — crear un catálogo con propiedades de 2ª mano', () => {
  it('sólo las de la agencia y fuera de la papelera; todas ajenas = 404; el catálogo queda marcado como 2ª mano', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D3bCatA')
    const b = await seedTenant(db, 'D3bCatB')
    const f1 = await flat(db, a.orgId)
    const f2 = await flat(db, a.orgId)
    const borrada = await flat(db, a.orgId, { deletedAt: ts })
    const ajena = await flat(db, b.orgId)
    const templateId = await pdfTemplateId(db)
    const create = (await import('../../server/api/admin/asset-export/catalogs.post')).default as any
    const { catalogPropertyKind } = await import('../../server/utils/assetExport/catalogKind')

    const res = await create(adminEv(db, a.orgId, { body: { templateId, assetIds: [f1.id, ajena.id, borrada.id, f2.id], propertyKind: 'agent' } }))
    expect(res).toMatchObject({ totalCount: 2, propertyKind: 'agent', organizationId: a.orgId })
    expect(res.skipped.sort()).toEqual([ajena.id, borrada.id].sort())
    const items = await db.select().from(schema.assetExportCatalogItems).where(eq(schema.assetExportCatalogItems.catalogId, res.id))
    expect(items.map((i: any) => i.assetId)).toEqual([f1.id, f2.id])
    const [row] = await db.select().from(schema.assetExportCatalogs).where(eq(schema.assetExportCatalogs.id, res.id))
    expect(catalogPropertyKind(row)).toBe('agent')

    // Sólo ids ajenos (o borrados): 404, nunca un catálogo vacío.
    await expect(create(adminEv(db, a.orgId, { body: { templateId, assetIds: [ajena.id], propertyKind: 'agent' } }))).rejects.toMatchObject({ statusCode: 404 })
    // Un id de 2ª mano no vale como obra nueva (y al revés): cada uno en su tabla.
    await expect(create(adminEv(db, b.orgId, { body: { templateId, assetIds: [ajena.id] } }))).rejects.toMatchObject({ statusCode: 404 })
    await expect(create(adminEv(db, a.orgId, { body: { templateId, assetIds: [f1.id], propertyKind: 'otro' } }))).rejects.toMatchObject({ statusCode: 422 })

    // Obra nueva sigue igual (sin marca: lo de siempre).
    const dev = await create(adminEv(db, a.orgId, { body: { templateId, assetIds: [a.projectId] } }))
    expect(dev.propertyKind).toBe('developer')
    const [devRow] = await db.select().from(schema.assetExportCatalogs).where(eq(schema.assetExportCatalogs.id, dev.id))
    expect(devRow.validationJson).toBeNull()
    expect(catalogPropertyKind(devRow)).toBe('developer')
  })

  it('la ficha de 2ª mano sólo lleva lo publicable: privacidad de ubicación, foto publicable, sin QR ni referencia interna', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D3bFichaA')
    const b = await seedTenant(db, 'D3bFichaB')
    await setCurrency(db, a.orgId, 'EUR')
    const p = await flat(db, a.orgId, { locationPrivacy: 'approximate', locationPrivacyRadius: 500, mainImage: 'uploads/d3b-portada.jpg', reference: 'S-INTERNA-77' })
    const G = schema.propertyGalleryImages
    await db.insert(G).values([
      // La portada está marcada como privada en la galería: no puede salir.
      { propertyId: p.id, image: 'uploads/d3b-portada.jpg', sortOrder: 0, isPrivate: 1, createdAt: ts },
      { propertyId: p.id, image: 'uploads/d3b-oculta.jpg', sortOrder: 1, isHidden: 1, createdAt: ts },
      { propertyId: p.id, image: 'uploads/d3b-no-publicable.jpg', sortOrder: 2, isPublishable: 0, createdAt: ts },
      { propertyId: p.id, image: 'uploads/d3b-publica.jpg', sortOrder: 3, createdAt: ts },
    ])
    const { resolveAssetBindings, publishableAgentCover } = await import('../../server/utils/assetExport/bindings')
    const ev = adminEv(db, a.orgId)

    const { values, images } = await resolveAssetBindings(ev, { orgId: a.orgId, assetKind: 'agent_property', assetId: p.id })
    expect(values['asset.title']).toBe('Piso en Chamberí')
    expect(values['asset.location']).toBe('Chamberí, Madrid')
    expect(values['asset.price']).toBe('350.000 €')
    expect(values['asset.pricePerSquareMeter']).toBe(`${new Intl.NumberFormat('es-ES').format(Math.round(350_000 / 90))} €`)
    expect(values['asset.builtArea']).toBe('90 m²')
    expect(values['asset.bedrooms']).toBe('3')
    expect(values['asset.bathrooms']).toBe('2')
    expect(values['asset.propertyType']).toBe('Piso')
    expect(values['asset.reference']).toBe(String(p.id))
    // Sin página pública: ni enlace ni QR.
    expect(values['asset.publicUrl']).toBe('')
    expect(values['asset.qrCode']).toBe('')
    const everything = JSON.stringify(values)
    for (const secret of ['S-INTERNA-77', 'Fuencarral', '123', 'Planta']) expect(everything, secret).not.toContain(secret)
    expect(images['asset.mainImage']).toBe('uploads/d3b-publica.jpg')

    // Una portada que nadie ha marcado en la galería sí vale; sin fotos publicables, sin foto.
    const libre = await flat(db, a.orgId, { mainImage: 'uploads/d3b-libre.jpg' })
    expect(await publishableAgentCover(db, libre.id, libre.mainImage)).toBe('uploads/d3b-libre.jpg')
    const sinFoto = await flat(db, a.orgId, { mainImage: null })
    await db.insert(G).values({ propertyId: sinFoto.id, image: 'uploads/d3b-privada.jpg', isPrivate: 1, createdAt: ts })
    expect(await publishableAgentCover(db, sinFoto.id, null)).toBeNull()

    // Ubicación exacta sin zona: la calle, nunca el número.
    const exacta = await flat(db, a.orgId, { community: null, city: null, district: null, locationPrivacy: 'exact' })
    const ex = await resolveAssetBindings(ev, { orgId: a.orgId, assetKind: 'agent_property', assetId: exacta.id })
    expect(ex.values['asset.title']).toBe('Piso en Calle de Fuencarral')
    expect(JSON.stringify(ex.values)).not.toContain('123')

    // Ajena: 404. En la papelera: 422.
    const ajena = await flat(db, b.orgId)
    await expect(resolveAssetBindings(ev, { orgId: a.orgId, assetKind: 'agent_property', assetId: ajena.id })).rejects.toMatchObject({ statusCode: 404 })
    const borrada = await flat(db, a.orgId, { deletedAt: ts })
    await expect(resolveAssetBindings(ev, { orgId: a.orgId, assetKind: 'agent_property', assetId: borrada.id })).rejects.toMatchObject({ statusCode: 422 })
  })

  it('el motor de Asset Export genera el PDF combinado de 2ª mano de verdad, y el detalle nombra cada sección dentro de la agencia', async () => {
    const { db } = createTestDb()
    const a = await seedTenant(db, 'D3bPdfA')
    const b = await seedTenant(db, 'D3bPdfB')
    await setCurrency(db, a.orgId, 'EUR')
    const f1 = await flat(db, a.orgId, { community: 'Salamanca' })
    const f2 = await flat(db, a.orgId, { propertyType: 'Penthouse', community: 'Retiro' })
    // Una obra nueva de OTRA agencia con el mismo id que una sección: su nombre nunca debe aparecer.
    await project(db, b.orgId, { name: 'Nombre ajeno que no debe salir' })
    const templateId = await pdfTemplateId(db)
    const create = (await import('../../server/api/admin/asset-export/catalogs.post')).default as any
    const processNext = (await import('../../server/api/admin/asset-export/catalogs/[id]/process-next.post')).default as any
    const detail = (await import('../../server/api/admin/asset-export/catalogs/[id].get')).default as any
    const list = (await import('../../server/api/admin/asset-export/catalogs.get')).default as any

    const catalog = await create(adminEv(db, a.orgId, { body: { templateId, assetIds: [f1.id, f2.id], propertyKind: 'agent', name: 'Selección 2ª mano' } }))
    const params = { id: String(catalog.id) }
    let res: any
    for (let i = 0; i < 5; i++) {
      res = await processNext(adminEv(db, a.orgId, { params }))
      if (res.done) break
    }
    expect(res.done).toBe(true)
    expect(res.catalog).toMatchObject({ status: 'completed', completedCount: 2, failedCount: 0 })
    // El PDF ensamblado está en R2 y se abre, con portada + índice + las dos secciones.
    const stored = fakeR2.store.get(res.catalog.r2Key)
    expect(stored?.contentType).toBe('application/pdf')
    const { PDFDocument } = await import('pdf-lib')
    expect((await PDFDocument.load(stored!.bytes)).getPageCount()).toBeGreaterThanOrEqual(4)
    // La validación final conserva que es de 2ª mano (la marca vive en validation_json).
    const { catalogPropertyKind } = await import('../../server/utils/assetExport/catalogKind')
    expect(catalogPropertyKind(res.catalog)).toBe('agent')
    expect(JSON.parse(res.catalog.validationJson)).toMatchObject({ ok: true, propertyKind: 'agent' })

    const items = await db.select().from(schema.assetExportCatalogItems).where(and(eq(schema.assetExportCatalogItems.catalogId, catalog.id)))
    expect(items.map((i: any) => i.title)).toEqual(['Piso en Salamanca', 'Ático en Retiro'])

    const d = await detail(adminEv(db, a.orgId, { params }))
    expect(d.propertyKind).toBe('agent')
    expect(d.items.map((i: any) => i.assetName)).toEqual(['Piso en Salamanca', 'Ático en Retiro'])
    expect(JSON.stringify(d)).not.toContain('Nombre ajeno')
    // Otra agencia no ve el catálogo.
    await expect(detail(adminEv(db, b.orgId, { params }))).rejects.toMatchObject({ statusCode: 404 })
    await expect(processNext(adminEv(db, b.orgId, { params }))).rejects.toMatchObject({ statusCode: 404 })
    expect((await list(adminEv(db, a.orgId))).find((c: any) => c.id === catalog.id)?.propertyKind).toBe('agent')
    expect((await list(adminEv(db, b.orgId))).some((c: any) => c.id === catalog.id)).toBe(false)
  }, 30_000)
})
