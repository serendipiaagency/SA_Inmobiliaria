import { and, asc, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../../server/db/schema'
import { createTestDb, seedTenant, type TenantFixture } from './helpers/tenantFixtures'
import { buildPropertyFilterConds, parsePropertyFilters, type PropertySearchFilters } from '../../server/utils/properties/searchService'
import { geoConds, parseGeoFilters, squaredDistanceSql } from '../../server/utils/properties/geoSearch'
import { haversineKm, parseGeoQuery, radiusBounds } from '../../utils/maps/geo'
import { saveEntityCustomFields } from '../../server/utils/customFields/service'
import { addTagToEntity } from '../../server/utils/tags/service'

/**
 * FASE 2 (búsqueda geográfica) y FASE 27 (filtros que faltaban), bloque N7b.
 * El filtro real (`buildPropertyFilterConds`, el mismo del listado, de las
 * acciones masivas y de la exportación) contra el esquema real, en los DOS
 * catálogos: radio, zona visible (bounding box) y coordenadas; subtipo,
 * comercial, oficina, propietario, portal, características, barrio,
 * municipio, etiquetas y campos personalizados — y ninguna referencia de otra
 * agencia coincide con nada.
 */

const ts = '2026-01-01 00:00:00'
type Kind = 'agent' | 'developer'
const KINDS: Kind[] = ['agent', 'developer']

// Puerta del Sol, Retiro (~1,7 km), Getafe (~13 km) y Toledo (~67 km).
const SOL = { lat: 40.4168, lng: -3.7038 }
const RETIRO = { lat: 40.4153, lng: -3.6845 }
const GETAFE = { lat: 40.3083, lng: -3.7327 }
const TOLEDO = { lat: 39.8628, lng: -4.0273 }

let db: any
let A: TenantFixture
let B: TenantFixture
let seq = 0

beforeEach(async () => {
  ;({ db } = createTestDb())
  A = await seedTenant(db, 'GeoAlpha')
  B = await seedTenant(db, 'GeoBeta')
})

function table(kind: Kind) {
  return (kind === 'agent' ? schema.agentProperties : schema.developerProperties) as any
}
async function property(kind: Kind, orgId: number, f: TenantFixture, over: Record<string, any> = {}) {
  seq += 1
  const base = { organizationId: orgId, slug: `p-${kind}-${seq}`, status: kind === 'agent' ? 'available' : 'new', createdAt: ts, updatedAt: ts }
  const values = kind === 'agent' ? { ...base, ...over } : { ...base, developerId: f.developerId, name: over.name ?? `Promo ${seq}`, ...over }
  const [row] = await db.insert(table(kind)).values(values).returning()
  return row
}
async function ids(kind: Kind, orgId: number, filters: PropertySearchFilters) {
  const t = table(kind)
  const rows = await db
    .select({ id: t.id })
    .from(t)
    .where(and(eq(t.organizationId, orgId), ...buildPropertyFilterConds(kind, filters)))
    .orderBy(asc(t.id))
  return rows.map((r: any) => r.id)
}

describe('parseo de la búsqueda geográfica', () => {
  it('caja y radio válidos; ausentes = sin filtro', () => {
    expect(parseGeoQuery({})).toEqual({})
    expect(parseGeoQuery({ north: '40.5', south: '40.3', east: '-3.6', west: '-3.8' })).toEqual({ bbox: { north: 40.5, south: 40.3, east: -3.6, west: -3.8 } })
    expect(parseGeoQuery({ lat: '40,4168', lng: '-3.7038', radiusKm: '2' })).toEqual({ radius: { lat: 40.4168, lng: -3.7038, radiusKm: 2 } })
  })

  it('mal formada → 422 (nunca se ignora en silencio: devolvería todo)', () => {
    const bad = [
      { north: '40.5', south: '40.3', east: '-3.6' },
      { north: 'norte', south: '40.3', east: '-3.6', west: '-3.8' },
      { north: '40.3', south: '40.5', east: '-3.6', west: '-3.8' },
      { north: '95', south: '40', east: '-3.6', west: '-3.8' },
      { lat: '40', lng: '-3' },
      { lat: '40', lng: '-3', radiusKm: '0' },
      { lat: '40', lng: '-3', radiusKm: '501' },
      { lat: '91', lng: '-3', radiusKm: '2' },
    ]
    for (const q of bad) {
      let err: any
      try {
        parseGeoFilters(q)
      } catch (e) {
        err = e
      }
      expect(err?.statusCode, JSON.stringify(q)).toBe(422)
    }
  })

  it('la caja que envuelve el radio contiene el círculo', () => {
    const b = radiusBounds({ ...SOL, radiusKm: 2 })
    expect(b.north).toBeGreaterThan(SOL.lat)
    expect(b.south).toBeLessThan(SOL.lat)
    expect(haversineKm(SOL, { lat: b.north, lng: SOL.lng })).toBeCloseTo(2, 1)
    expect(haversineKm(SOL, { lat: SOL.lat, lng: b.east })).toBeCloseTo(2, 1)
  })
})

describe.each(KINDS)('búsqueda geográfica en el catálogo %s', (kind) => {
  async function seedMadrid() {
    const sol = await property(kind, A.orgId, A, { lat: SOL.lat, lng: SOL.lng })
    const retiro = await property(kind, A.orgId, A, { lat: RETIRO.lat, lng: RETIRO.lng })
    const getafe = await property(kind, A.orgId, A, { lat: GETAFE.lat, lng: GETAFE.lng })
    const toledo = await property(kind, A.orgId, A, { lat: TOLEDO.lat, lng: TOLEDO.lng })
    const sinCoords = await property(kind, A.orgId, A, { lat: null, lng: null })
    const ceroCero = await property(kind, A.orgId, A, { lat: 0, lng: 0 })
    // Otra agencia, en el mismo sitio exacto.
    const ajena = await property(kind, B.orgId, B, { lat: SOL.lat, lng: SOL.lng })
    return { sol, retiro, getafe, toledo, sinCoords, ceroCero, ajena }
  }

  it('por radio alrededor de unas coordenadas: 2 km, 20 km y 100 km', async () => {
    const p = await seedMadrid()
    expect(await ids(kind, A.orgId, { geo: { radius: { ...SOL, radiusKm: 2 } } })).toEqual([p.sol.id, p.retiro.id])
    expect(await ids(kind, A.orgId, { geo: { radius: { ...SOL, radiusKm: 20 } } })).toEqual([p.sol.id, p.retiro.id, p.getafe.id])
    expect(await ids(kind, A.orgId, { geo: { radius: { ...SOL, radiusKm: 100 } } })).toEqual([p.sol.id, p.retiro.id, p.getafe.id, p.toledo.id])
    // Sin coordenadas o con el (0,0) de «sin asignar», nunca entran.
    expect(await ids(kind, A.orgId, { geo: { radius: { lat: 0.001, lng: 0.001, radiusKm: 50 } } })).toEqual([])
  })

  it('por la zona visible del mapa (bounding box)', async () => {
    const p = await seedMadrid()
    const madrid = { north: 40.5, south: 40.35, east: -3.6, west: -3.8 }
    expect(await ids(kind, A.orgId, { geo: { bbox: madrid } })).toEqual([p.sol.id, p.retiro.id])
    const sur = { north: 40.35, south: 39.8, east: -3.6, west: -4.1 }
    expect(await ids(kind, A.orgId, { geo: { bbox: sur } })).toEqual([p.getafe.id, p.toledo.id])
  })

  it('una caja que cruza el antimeridiano (oeste > este) son dos franjas', async () => {
    const fiji = await property(kind, A.orgId, A, { lat: -17.7, lng: 178.4 })
    const samoa = await property(kind, A.orgId, A, { lat: -13.8, lng: -171.8 })
    await property(kind, A.orgId, A, { lat: -17.7, lng: 100 })
    expect(await ids(kind, A.orgId, { geo: { bbox: { north: -10, south: -20, east: -170, west: 170 } } })).toEqual([fiji.id, samoa.id])
  })

  it('ordenar por cercanía al centro', async () => {
    const p = await seedMadrid()
    const t = table(kind)
    const rows = await db
      .select({ id: t.id })
      .from(t)
      .where(and(eq(t.organizationId, A.orgId), ...geoConds(t.lat, t.lng, { radius: { ...RETIRO, radiusKm: 100 } })))
      .orderBy(asc(squaredDistanceSql(t.lat, t.lng, RETIRO)))
    expect(rows.map((r: any) => r.id)).toEqual([p.retiro.id, p.sol.id, p.getafe.id, p.toledo.id])
  })

  it('la otra agencia en el mismo punto no aparece', async () => {
    const p = await seedMadrid()
    expect(await ids(kind, A.orgId, { geo: { radius: { ...SOL, radiusKm: 1 } } })).toEqual([p.sol.id])
    expect(await ids(kind, B.orgId, { geo: { radius: { ...SOL, radiusKm: 1 } } })).toEqual([p.ajena.id])
  })
})

describe.each(KINDS)('filtros de la FASE 27 en el catálogo %s', (kind) => {
  async function details(orgId: number, propertyId: number, over: Record<string, any>) {
    await db.insert(schema.propertyDetails).values({ organizationId: orgId, propertyKind: kind, propertyId, ...over })
  }

  it('subtipo y oficina (ficha ampliada) — un id de oficina de otra agencia no coincide', async () => {
    const [officeA] = await db.insert(schema.offices).values({ organizationId: A.orgId, name: 'Centro' }).returning()
    const [officeB] = await db.insert(schema.offices).values({ organizationId: B.orgId, name: 'Ajena' }).returning()
    const atico = await property(kind, A.orgId, A, { propertyType: 'Penthouse' })
    const bajo = await property(kind, A.orgId, A, { propertyType: 'Apartment' })
    await details(A.orgId, atico.id, { subtype: 'penthouse_duplex', officeId: officeA.id })
    await details(A.orgId, bajo.id, { subtype: 'ground_floor_garden' })
    // La otra agencia tiene su propiedad en su oficina: filtrar A por esa oficina no la trae.
    const deB = await property(kind, B.orgId, B)
    await details(B.orgId, deB.id, { officeId: officeB.id, subtype: 'penthouse_duplex' })
    expect(await ids(kind, A.orgId, { subtype: 'penthouse_duplex' })).toEqual([atico.id])
    expect(await ids(kind, A.orgId, { officeId: officeA.id })).toEqual([atico.id])
    expect(await ids(kind, A.orgId, { officeId: officeB.id })).toEqual([])
    expect(await ids(kind, B.orgId, { officeId: officeB.id })).toEqual([deB.id])
  })

  it('comercial asignado (o «sin comercial»)', async () => {
    const con = await property(kind, A.orgId, A, { agentId: A.teamMemberId })
    const sin = await property(kind, A.orgId, A, { agentId: null })
    const all = await ids(kind, A.orgId, {})
    expect(await ids(kind, A.orgId, { agentId: A.teamMemberId })).toEqual([con.id])
    expect(await ids(kind, A.orgId, { agentId: 'none' })).toEqual(all.filter((id: number) => id !== con.id))
    expect(await ids(kind, A.orgId, { agentId: 'none' })).toContain(sin.id)
    expect(await ids(kind, A.orgId, { agentId: B.teamMemberId })).toEqual([])
  })

  it('propietario por nombre/email/teléfono o por contacto; sólo propietarios vivos de la agencia', async () => {
    const [ana] = await db.insert(schema.contacts).values({ organizationId: A.orgId, name: 'Ana García', email: 'ana@x.test', phone: '+34600111222' }).returning()
    const [inquilino] = await db.insert(schema.contacts).values({ organizationId: A.orgId, name: 'Pedro Inquilino' }).returning()
    const [ajeno] = await db.insert(schema.contacts).values({ organizationId: B.orgId, name: 'Ana García' }).returning()
    const suya = await property(kind, A.orgId, A)
    const alquilada = await property(kind, A.orgId, A)
    const borrada = await property(kind, A.orgId, A)
    await db.insert(schema.propertyContacts).values([
      { organizationId: A.orgId, propertyKind: kind, propertyId: suya.id, contactId: ana.id, role: 'co_owner' },
      { organizationId: A.orgId, propertyKind: kind, propertyId: alquilada.id, contactId: inquilino.id, role: 'tenant' },
      { organizationId: A.orgId, propertyKind: kind, propertyId: borrada.id, contactId: ana.id, role: 'owner', deletedAt: ts },
      // Enlace sembrado en B que apunta a una propiedad de A: no cuenta.
      { organizationId: B.orgId, propertyKind: kind, propertyId: alquilada.id, contactId: ajeno.id, role: 'owner' },
    ])
    expect(await ids(kind, A.orgId, { owner: 'garcía' })).toEqual([suya.id])
    expect(await ids(kind, A.orgId, { owner: '600111' })).toEqual([suya.id])
    expect(await ids(kind, A.orgId, { owner: 'Inquilino' })).toEqual([])
    expect(await ids(kind, A.orgId, { ownerContactId: ana.id })).toEqual([suya.id])
    expect(await ids(kind, A.orgId, { ownerContactId: ajeno.id })).toEqual([])
  })

  it('características (las de las tools, ya en el panel), barrio y municipio', async () => {
    const terraza = await property(kind, A.orgId, A, { hasTerrace: 1, hasPool: 1, community: 'Chamberí', city: 'Madrid' })
    const piscina = await property(kind, A.orgId, A, { hasPool: 1, city: 'Pozuelo' })
    await details(A.orgId, piscina.id, { neighborhood: 'Somosaguas', municipality: 'Pozuelo de Alarcón' })
    expect(await ids(kind, A.orgId, { features: ['pool'] })).toEqual([terraza.id, piscina.id])
    expect(await ids(kind, A.orgId, { features: ['pool', 'terrace'] })).toEqual([terraza.id])
    expect(await ids(kind, A.orgId, { neighborhood: 'chamber' })).toEqual([terraza.id])
    expect(await ids(kind, A.orgId, { neighborhood: 'Somosaguas' })).toEqual([piscina.id])
    expect(await ids(kind, A.orgId, { municipality: 'Alarcón' })).toEqual([piscina.id])
    expect(await ids(kind, A.orgId, { municipality: 'Madrid' })).toEqual([terraza.id])
  })

  it('campos personalizados: lista, número (rango), sí/no, texto y lista múltiple — la definición de otra agencia no coincide', async () => {
    const [estado] = await db.insert(schema.customFieldDefinitions).values({ organizationId: A.orgId, entityType: 'property', key: 'llaves', label: 'Llaves', fieldType: 'select', optionsJson: '["Oficina","Propietario"]' }).returning()
    const [metros] = await db.insert(schema.customFieldDefinitions).values({ organizationId: A.orgId, entityType: 'property', key: 'trastero_m2', label: 'Trastero m²', fieldType: 'number' }).returning()
    const [vistas] = await db.insert(schema.customFieldDefinitions).values({ organizationId: A.orgId, entityType: 'property', key: 'vistas', label: 'Vistas', fieldType: 'boolean' }).returning()
    const [nota] = await db.insert(schema.customFieldDefinitions).values({ organizationId: A.orgId, entityType: 'property', key: 'nota', label: 'Nota', fieldType: 'text' }).returning()
    const [usos] = await db.insert(schema.customFieldDefinitions).values({ organizationId: A.orgId, entityType: 'property', key: 'usos', label: 'Usos', fieldType: 'multiselect', optionsJson: '["Oficina","Vivienda"]' }).returning()
    const [ajena] = await db.insert(schema.customFieldDefinitions).values({ organizationId: B.orgId, entityType: 'property', key: 'llaves', label: 'Llaves', fieldType: 'text' }).returning()
    const p1 = await property(kind, A.orgId, A)
    const p2 = await property(kind, A.orgId, A)
    await saveEntityCustomFields(db, A.orgId, A.userId, { entityType: 'property', entityKind: kind, entityId: p1.id }, { llaves: 'Oficina', trastero_m2: 8, vistas: true, nota: 'Necesita pintura', usos: ['Oficina', 'Vivienda'] })
    await saveEntityCustomFields(db, A.orgId, A.userId, { entityType: 'property', entityKind: kind, entityId: p2.id }, { llaves: 'Propietario', trastero_m2: 3, vistas: false, usos: ['Vivienda'] })
    // Un valor sembrado en B con la definición ajena sobre la propiedad de A.
    await db.insert(schema.customFieldValues).values({ organizationId: B.orgId, definitionId: ajena.id, entityType: 'property', entityKind: kind, entityId: p2.id, valueText: 'Oficina' })

    const q = (cf: Record<string, string>) => parsePropertyFilters(cf).customFields!
    expect(await ids(kind, A.orgId, { customFields: q({ [`cf_${estado.id}`]: 'Oficina' }) })).toEqual([p1.id])
    expect(await ids(kind, A.orgId, { customFields: q({ [`cf_${metros.id}_min`]: '5' }) })).toEqual([p1.id])
    expect(await ids(kind, A.orgId, { customFields: q({ [`cf_${metros.id}_min`]: '1', [`cf_${metros.id}_max`]: '5' }) })).toEqual([p2.id])
    expect(await ids(kind, A.orgId, { customFields: q({ [`cf_${vistas.id}`]: '0' }) })).toEqual([p2.id])
    expect(await ids(kind, A.orgId, { customFields: q({ [`cf_${nota.id}`]: 'pintura' }) })).toEqual([p1.id])
    expect(await ids(kind, A.orgId, { customFields: q({ [`cf_${usos.id}`]: 'Vivienda' }) })).toEqual([p1.id, p2.id])
    expect(await ids(kind, A.orgId, { customFields: q({ [`cf_${usos.id}`]: 'Oficina' }) })).toEqual([p1.id])
    expect(await ids(kind, A.orgId, { customFields: q({ [`cf_${ajena.id}`]: 'Oficina' }) })).toEqual([])
  })

  it('etiquetas, con el mismo Tag que la acción masiva', async () => {
    const p1 = await property(kind, A.orgId, A)
    await property(kind, A.orgId, A)
    const { tag } = await addTagToEntity(db, A.orgId, ['agent', 'developer'], { entityType: kind, entityId: p1.id, name: 'Escaparate' })
    expect(await ids(kind, A.orgId, { tagIds: [tag.id] })).toEqual([p1.id])
  })
})

describe('portal (publicación multicanal)', () => {
  it('obra nueva: publicada o programada en ese portal; un trabajo cancelado no cuenta; 2ª mano: ninguna', async () => {
    const enIdealista = await property('developer', A.orgId, A)
    const cancelada = await property('developer', A.orgId, A)
    for (const [prop, status] of [
      [enIdealista, 'success'],
      [cancelada, 'cancelled'],
    ] as const) {
      const [sched] = await db.insert(schema.publicationSchedules).values({ organizationId: A.orgId, developerPropertyId: prop.id, baseScheduledAt: ts }).returning()
      await db.insert(schema.publicationJobs).values({ organizationId: A.orgId, scheduleId: sched.id, channelKey: 'idealista', runAt: ts, status })
    }
    expect(await ids('developer', A.orgId, { portal: 'idealista' })).toEqual([enIdealista.id])
    expect(await ids('developer', A.orgId, { portal: 'fotocasa' })).toEqual([])
    expect(await ids('developer', B.orgId, { portal: 'idealista' })).toEqual([])
    await property('agent', A.orgId, A)
    expect(await ids('agent', A.orgId, { portal: 'idealista' })).toEqual([])
  })
})

describe('parsePropertyFilters (la query del listado, de la exportación y de «todos los filtrados»)', () => {
  it('lee los parámetros nuevos con los mismos nombres en los dos catálogos', () => {
    const f = parsePropertyFilters({
      subtype: 'penthouse_duplex',
      agentId: '7',
      officeId: '3',
      owner: 'García',
      ownerId: '9',
      portal: 'idealista',
      features: 'pool,terrace,jacuzzi',
      neighborhood: 'Chamberí',
      municipality: 'Madrid',
      tags: '4,5',
      cf_12: 'Oficina',
      cf_13_min: '5',
      lat: '40.4',
      lng: '-3.7',
      radiusKm: '3',
    })
    expect(f).toMatchObject({
      subtype: 'penthouse_duplex',
      agentId: 7,
      officeId: 3,
      owner: 'García',
      ownerContactId: 9,
      portal: 'idealista',
      features: ['pool', 'terrace'],
      neighborhood: 'Chamberí',
      municipality: 'Madrid',
      tagIds: [4, 5],
      customFields: [
        { definitionId: 12, value: 'Oficina' },
        { definitionId: 13, min: '5' },
      ],
      geo: { radius: { lat: 40.4, lng: -3.7, radiusKm: 3 } },
    })
    expect(parsePropertyFilters({ agentId: 'none' }).agentId).toBe('none')
    expect(parsePropertyFilters({ agentId: 'abc', officeId: '-1' })).toMatchObject({ agentId: undefined, officeId: undefined })
  })
})
