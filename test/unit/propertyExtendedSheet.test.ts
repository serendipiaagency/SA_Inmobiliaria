import { describe, expect, it } from 'vitest'
import * as schema from '../../server/db/schema'
import {
  assertSheetReferences,
  assertSubtypeMatchesType,
  assertValidPropertyType,
  deletePropertySheet,
  extractSheetPayload,
  hasSheetChanges,
  loadPropertySheet,
  loadPropertySheets,
  propertyKindForResource,
  savePropertySheet,
} from '../../server/utils/properties/extendedSheet'
import { PROPERTY_SHEET_FIELDS, PROPERTY_SUBTYPES, PROPERTY_TYPES, isSubtypeOf, pricePerSquareMeter, propertyTypeLabel } from '../../utils/propertySheet'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'

/**
 * Ficha ampliada de la propiedad (núcleo inmobiliario, migración 0086):
 * validación de cada tipo de campo, guardado parcial en las dos tablas 1:1,
 * aislamiento por organización y coherencia tipo ↔ subtipo.
 */

const ts = '2026-01-01 00:00:00'

describe('catálogo común de tipos y campos (utils/propertySheet.ts)', () => {
  it('tiene los tipos del encargo, con etiqueta en español', () => {
    const labels = PROPERTY_TYPES.map((t) => propertyTypeLabel(t))
    for (const l of ['Piso', 'Casa', 'Chalet', 'Ático', 'Dúplex', 'Estudio', 'Finca', 'Terreno', 'Local', 'Oficina', 'Nave', 'Garaje', 'Edificio', 'Promoción']) {
      expect(labels).toContain(l)
    }
    // Cada tipo tiene al menos un subtipo.
    for (const t of PROPERTY_TYPES) expect(Object.keys(PROPERTY_SUBTYPES[t] || {}).length).toBeGreaterThan(0)
  })

  it('cada clave de campo es única y no pisa una columna de la fila principal', () => {
    const keys = PROPERTY_SHEET_FIELDS.map((f) => f.key)
    expect(new Set(keys).size).toBe(keys.length)
    const mainColumns = new Set([...Object.keys(schema.agentProperties), ...Object.keys(schema.developerProperties)])
    for (const k of keys) expect(mainColumns.has(k), `${k} ya existe en la tabla principal`).toBe(false)
  })

  it('cada campo existe como columna en su tabla 1:1', () => {
    for (const f of PROPERTY_SHEET_FIELDS) {
      const table = f.store === 'details' ? schema.propertyDetails : schema.propertyLegalEconomics
      expect(f.key in table, `${f.key} no es columna de ${f.store}`).toBe(true)
    }
  })

  it('precio por m² se calcula, nunca con datos que no existen', () => {
    expect(pricePerSquareMeter(300000, 100)).toBe(3000)
    expect(pricePerSquareMeter(null, 100)).toBeNull()
    expect(pricePerSquareMeter(300000, 0)).toBeNull()
  })
})

describe('extractSheetPayload — validación por tipo', () => {
  it('sólo recoge los campos presentes y los reparte en sus dos tablas', () => {
    const p = extractSheetPayload({ heating: 'central', ibiAnnual: '450,5', hasFiber: true, price: 1, name: 'x' })
    expect(p.details).toEqual({ heating: 'central', hasFiber: 1 })
    expect(p.legal).toEqual({ ibiAnnual: 450.5 })
    expect(hasSheetChanges(p)).toBe(true)
    expect(hasSheetChanges(extractSheetPayload({ price: 1 }))).toBe(false)
  })

  it('vacío significa borrar el valor (null), nunca 0', () => {
    const p = extractSheetPayload({ totalArea: '', heating: null, hasAlarm: '' })
    expect(p.details).toEqual({ totalArea: null, heating: null, hasAlarm: null })
  })

  it('rechaza valores fuera de catálogo, negativos, decimales donde va un entero, enlaces y fechas inválidas', () => {
    expect(() => extractSheetPayload({ heating: 'nuclear' })).toThrow(/Calefacción/)
    expect(() => extractSheetPayload({ totalArea: -3 })).toThrow(/Superficie total/)
    expect(() => extractSheetPayload({ terracesCount: 1.5 })).toThrow(/entero/)
    expect(() => extractSheetPayload({ virtualTourUrl: 'javascript:alert(1)' })).toThrow(/https/)
    expect(() => extractSheetPayload({ energyCertificateExpiry: '31/12/2027' })).toThrow(/fecha/)
    expect(() => extractSheetPayload({ commissionVatPct: 150 })).toThrow(/100/)
    expect(() => extractSheetPayload({ hasAlarm: 'quizá' })).toThrow(/sí o no/)
  })

  it('acepta los valores válidos de cada tipo', () => {
    const p = extractSheetPayload({
      renovationYear: 2019,
      ceilingHeight: '2.7',
      energyCertificateExpiry: '2030-05-01',
      virtualTourUrl: 'https://my.matterport.com/show/?m=abc',
      commissionType: 'percentage',
      officeId: '3',
      encumbrances: '  Hipoteca con Banco X  ',
    })
    expect(p.details).toMatchObject({ renovationYear: 2019, ceilingHeight: 2.7, virtualTourUrl: 'https://my.matterport.com/show/?m=abc', officeId: 3 })
    expect(p.legal).toMatchObject({ energyCertificateExpiry: '2030-05-01', commissionType: 'percentage', encumbrances: 'Hipoteca con Banco X' })
  })
})

describe('tipo y subtipo', () => {
  it('el tipo tiene que ser de la lista común; vacío es válido (borrador)', () => {
    expect(() => assertValidPropertyType('Apartment')).not.toThrow()
    expect(() => assertValidPropertyType(null)).not.toThrow()
    expect(() => assertValidPropertyType('Castillo')).toThrow(/Tipo de inmueble no válido/)
  })

  it('un subtipo sólo vale para su tipo', () => {
    expect(() => assertSubtypeMatchesType('penthouse_duplex', 'Penthouse')).not.toThrow()
    expect(() => assertSubtypeMatchesType('penthouse_duplex', 'Retail')).toThrow(/Subtipo no válido/)
    expect(() => assertSubtypeMatchesType('flat', null)).toThrow(/elige primero el tipo/)
    expect(() => assertSubtypeMatchesType(null, 'Retail')).not.toThrow()
    expect(isSubtypeOf('loft', 'Apartment')).toBe(true)
    expect(isSubtypeOf('loft', 'Garage')).toBe(false)
  })

  it('las claves de recurso del panel resuelven a su catálogo', () => {
    expect(propertyKindForResource('properties')).toBe('agent')
    expect(propertyKindForResource('developer-properties')).toBe('developer')
    expect(propertyKindForResource('team')).toBeNull()
  })
})

describe('guardado y lectura (property_details / property_legal_economics)', () => {
  it('crea la fila 1:1 la primera vez y después sólo actualiza las columnas que llegan', async () => {
    const { db } = createTestDb()
    const A = await seedTenant(db, 'SheetSave')
    await savePropertySheet(db, A.orgId, 'agent', A.propertyId, extractSheetPayload({ heating: 'central', ibiAnnual: 320 }), A.userId)
    await savePropertySheet(db, A.orgId, 'agent', A.propertyId, extractSheetPayload({ hasFiber: true }), A.userId)

    const sheet = await loadPropertySheet(db, A.orgId, 'agent', A.propertyId)
    expect(sheet).toMatchObject({ heating: 'central', hasFiber: 1, ibiAnnual: 320, cadastralReference: null })
    const rows = await db.select().from(schema.propertyDetails)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ organizationId: A.orgId, propertyKind: 'agent', propertyId: A.propertyId, createdBy: A.userId, updatedBy: A.userId })
  })

  it('los dos catálogos no se mezclan aunque compartan id', async () => {
    const { db } = createTestDb()
    const A = await seedTenant(db, 'SheetKinds')
    await savePropertySheet(db, A.orgId, 'agent', 7, extractSheetPayload({ views: 'sea' }), A.userId)
    await savePropertySheet(db, A.orgId, 'developer', 7, extractSheetPayload({ views: 'mountain' }), A.userId)
    expect((await loadPropertySheet(db, A.orgId, 'agent', 7)).views).toBe('sea')
    expect((await loadPropertySheet(db, A.orgId, 'developer', 7)).views).toBe('mountain')
    const many = await loadPropertySheets(db, A.orgId, 'developer', [7, 8])
    expect(many.get(7)?.views).toBe('mountain')
    expect(many.get(8)?.views).toBeNull()
  })

  it('otra agencia no lee la ficha ampliada ajena', async () => {
    const { db } = createTestDb()
    const A = await seedTenant(db, 'SheetIsoA')
    const B = await seedTenant(db, 'SheetIsoB')
    await savePropertySheet(db, A.orgId, 'agent', A.propertyId, extractSheetPayload({ priceMinAuthorized: 250000, cadastralReference: '9872023VH5797S0001WX' }), A.userId)
    const fromB = await loadPropertySheet(db, B.orgId, 'agent', A.propertyId)
    expect(fromB.priceMinAuthorized).toBeNull()
    expect(fromB.cadastralReference).toBeNull()
  })

  it('oficina y equipo tienen que ser de la misma agencia', async () => {
    const { db } = createTestDb()
    const A = await seedTenant(db, 'SheetRefA')
    const B = await seedTenant(db, 'SheetRefB')
    const [officeA] = await db.insert(schema.offices).values({ organizationId: A.orgId, name: 'Centro', createdAt: ts, updatedAt: ts }).returning()
    const [officeB] = await db.insert(schema.offices).values({ organizationId: B.orgId, name: 'Centro', createdAt: ts, updatedAt: ts }).returning()
    const [teamB] = await db.insert(schema.teams).values({ organizationId: B.orgId, name: 'Lujo', createdAt: ts, updatedAt: ts }).returning()
    await expect(assertSheetReferences(db, extractSheetPayload({ officeId: officeA.id }), A.orgId)).resolves.toBeUndefined()
    await expect(assertSheetReferences(db, extractSheetPayload({ officeId: officeB.id }), A.orgId)).rejects.toMatchObject({ statusCode: 404 })
    await expect(assertSheetReferences(db, extractSheetPayload({ teamId: teamB.id }), A.orgId)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('borrar de verdad la propiedad se lleva su ficha ampliada', async () => {
    const { db } = createTestDb()
    const A = await seedTenant(db, 'SheetDelete')
    await savePropertySheet(db, A.orgId, 'developer', A.projectId, extractSheetPayload({ hasGym: true, ibiAnnual: 900 }), A.userId)
    await deletePropertySheet(db, A.orgId, 'developer', A.projectId)
    expect(await db.select().from(schema.propertyDetails)).toHaveLength(0)
    expect(await db.select().from(schema.propertyLegalEconomics)).toHaveLength(0)
  })
})
