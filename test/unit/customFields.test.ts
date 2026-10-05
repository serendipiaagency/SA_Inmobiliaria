import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../../server/db/schema'
import { createTestDb, seedTenant, type TenantFixture } from './helpers/tenantFixtures'
import {
  assertCustomFieldValueScope,
  customFieldValuesResourceGet,
  customFieldValuesResourcePost,
  deleteCustomFieldValues,
  listDefinitions,
  loadEntityCustomFields,
  publicCustomFieldsFor,
  saveEntityCustomFields,
  validateCustomFieldDefinition,
  validateCustomFieldValue,
} from '../../server/utils/customFields/service'

/**
 * FASE 0 (bloque N7b) — CustomFieldDefinition y CustomFieldValue. Base real
 * (migraciones reales sobre SQLite): validación de cada valor por su tipo,
 * reglas de la definición (clave, opciones, tipo inmutable con valores,
 * «público» sólo en propiedades), obligatorios, y aislamiento entre agencias
 * de definiciones, valores y registros (404, nunca 403).
 */

const ts = '2026-01-01 00:00:00'
let db: any
let A: TenantFixture
let B: TenantFixture

beforeEach(async () => {
  ;({ db } = createTestDb())
  A = await seedTenant(db, 'CfAlpha')
  B = await seedTenant(db, 'CfBeta')
})

async function definition(orgId: number, over: Record<string, any>) {
  const [row] = await db
    .insert(schema.customFieldDefinitions)
    .values({ organizationId: orgId, entityType: 'contact', key: `k${Math.floor(Math.random() * 1e9)}`, label: 'Campo', fieldType: 'text', createdAt: ts, updatedAt: ts, ...over })
    .returning()
  return row
}
async function contact(orgId: number, name = 'Persona') {
  const [row] = await db.insert(schema.contacts).values({ organizationId: orgId, name, createdAt: ts, updatedAt: ts }).returning()
  return row
}
async function expectStatus(p: Promise<unknown> | (() => unknown), status: number, message?: RegExp) {
  let err: any
  try {
    await (typeof p === 'function' ? p() : p)
  } catch (e) {
    err = e
  }
  expect(err, 'se esperaba un error').toBeDefined()
  expect(err.statusCode).toBe(status)
  if (message) expect(String(err.statusMessage)).toMatch(message)
}

describe('validación de un valor por su tipo', () => {
  const def = (fieldType: string, options: string[] = []) => ({ label: 'Campo', fieldType: fieldType as any, options })

  it('texto y texto largo: recortan espacios, respetan el máximo y vacío es «sin valor»', () => {
    expect(validateCustomFieldValue(def('text'), '  Hola  ')).toEqual({ valueText: 'Hola', valueNumber: null, valueJson: null })
    expect(validateCustomFieldValue(def('text'), '   ')).toBeNull()
    expect(validateCustomFieldValue(def('text'), null)).toBeNull()
    expect(() => validateCustomFieldValue(def('text'), 'x'.repeat(501))).toThrow(/500/)
    expect(validateCustomFieldValue(def('textarea'), 'x'.repeat(4000))?.valueText).toHaveLength(4000)
    expect(() => validateCustomFieldValue(def('text'), { a: 1 })).toThrow(/texto/)
  })

  it('número: acepta coma decimal y rechaza lo que no es un número', () => {
    expect(validateCustomFieldValue(def('number'), '12,5')?.valueNumber).toBe(12.5)
    expect(validateCustomFieldValue(def('number'), 0)?.valueNumber).toBe(0)
    expect(() => validateCustomFieldValue(def('number'), 'doce')).toThrow(/número/)
    expect(() => validateCustomFieldValue(def('number'), true)).toThrow(/número/)
  })

  it('sí/no: true/false, 1/0 y sí/no; cualquier otra cosa es un 422', () => {
    expect(validateCustomFieldValue(def('boolean'), true)?.valueNumber).toBe(1)
    expect(validateCustomFieldValue(def('boolean'), 'sí')?.valueNumber).toBe(1)
    expect(validateCustomFieldValue(def('boolean'), false)?.valueNumber).toBe(0)
    expect(validateCustomFieldValue(def('boolean'), '0')?.valueNumber).toBe(0)
    let err: any
    try {
      validateCustomFieldValue(def('boolean'), 'quizá')
    } catch (e) {
      err = e
    }
    expect(err?.statusCode).toBe(422)
  })

  it('fecha: AAAA-MM-DD y una fecha que existe', () => {
    expect(validateCustomFieldValue(def('date'), '2026-02-28')?.valueText).toBe('2026-02-28')
    expect(() => validateCustomFieldValue(def('date'), '2026-02-30')).toThrow(/fecha/)
    expect(() => validateCustomFieldValue(def('date'), '28/02/2026')).toThrow(/fecha/)
    expect(() => validateCustomFieldValue(def('date'), '2026-02-28T10:00')).toThrow(/fecha/)
  })

  it('lista: sólo una de sus opciones; lista múltiple: varias, sin repetir', () => {
    const opts = ['Inversor', 'Primera vivienda']
    expect(validateCustomFieldValue(def('select', opts), 'Inversor')?.valueText).toBe('Inversor')
    expect(() => validateCustomFieldValue(def('select', opts), 'Otro')).toThrow(/no es una opción/)
    expect(validateCustomFieldValue(def('multiselect', opts), ['Inversor', 'Inversor', 'Primera vivienda'])?.valueJson).toBe(JSON.stringify(opts))
    expect(validateCustomFieldValue(def('multiselect', opts), [])).toBeNull()
    expect(() => validateCustomFieldValue(def('multiselect', opts), ['Inversor', 'Pirata'])).toThrow(/Pirata/)
  })
})

describe('reglas de la definición', () => {
  it('la clave sale de la etiqueta y debe empezar por letra; una lista exige opciones únicas', async () => {
    const data: Record<string, any> = { entityType: 'lead', label: 'Fecha de llaves', fieldType: 'date' }
    await validateCustomFieldDefinition(db, A.orgId, data, null)
    expect(data.key).toBe('fecha_de_llaves')
    expect(data.optionsJson).toBeNull()

    await expectStatus(validateCustomFieldDefinition(db, A.orgId, { entityType: 'lead', label: '123', fieldType: 'text' }, null), 422, /letra/)
    await expectStatus(validateCustomFieldDefinition(db, A.orgId, { entityType: 'lead', label: 'Perfil', fieldType: 'select' }, null), 422, /opción/)
    await expectStatus(validateCustomFieldDefinition(db, A.orgId, { entityType: 'lead', label: 'Perfil', fieldType: 'select', optionsJson: '["A","a"]' }, null), 422, /repetidas/)
    const ok: Record<string, any> = { entityType: 'lead', label: 'Perfil', fieldType: 'multiselect', optionsJson: JSON.stringify([' A ', 'B']) }
    await validateCustomFieldDefinition(db, A.orgId, ok, null)
    expect(ok.optionsJson).toBe('["A","B"]')
  })

  it('«público» sólo existe en propiedades, y el tipo de entidad tiene que ser uno de los cinco', async () => {
    await expectStatus(validateCustomFieldDefinition(db, A.orgId, { entityType: 'contact', label: 'Web', fieldType: 'text', isPublic: 1 }, null), 422, /propiedad/)
    const prop: Record<string, any> = { entityType: 'property', label: 'Vistas al mar', fieldType: 'boolean', isPublic: true }
    await validateCustomFieldDefinition(db, A.orgId, prop, null)
    expect(prop.isPublic).toBe(1)
    await expectStatus(validateCustomFieldDefinition(db, A.orgId, { entityType: 'invoice', label: 'X', fieldType: 'text' }, null), 422)
  })

  it('clave repetida en la misma agencia → 409; la misma clave en otra agencia, sin problema', async () => {
    await definition(A.orgId, { entityType: 'lead', key: 'perfil', label: 'Perfil' })
    await expectStatus(validateCustomFieldDefinition(db, A.orgId, { entityType: 'lead', key: 'perfil', label: 'Perfil 2', fieldType: 'text' }, null), 409, /perfil/)
    await expect(validateCustomFieldDefinition(db, B.orgId, { entityType: 'lead', key: 'perfil', label: 'Perfil', fieldType: 'text' }, null)).resolves.toBeUndefined()
  })

  it('al editar: ni la clave ni la entidad cambian, y el tipo sólo mientras nadie tenga valor', async () => {
    const def = await definition(A.orgId, { entityType: 'contact', key: 'vip', label: 'VIP', fieldType: 'text' })
    await expectStatus(validateCustomFieldDefinition(db, A.orgId, { key: 'otra' }, def), 422, /clave/)
    await expectStatus(validateCustomFieldDefinition(db, A.orgId, { entityType: 'lead' }, def), 422, /entidad/)
    const sinValores: Record<string, any> = { fieldType: 'boolean' }
    await validateCustomFieldDefinition(db, A.orgId, sinValores, def)
    expect(sinValores.fieldType).toBe('boolean')

    const c = await contact(A.orgId)
    await saveEntityCustomFields(db, A.orgId, A.userId, { entityType: 'contact', entityKind: 'contact', entityId: c.id }, { vip: 'sí' })
    await expectStatus(validateCustomFieldDefinition(db, A.orgId, { fieldType: 'number' }, def), 422, /registro/)
  })
})

describe('valores de una ficha', () => {
  it('guarda sólo lo que llega, lo devuelve con su tipo y vacío lo borra', async () => {
    await definition(A.orgId, { key: 'presupuesto', label: 'Presupuesto', fieldType: 'number', sortOrder: 20 })
    await definition(A.orgId, { key: 'vip', label: 'VIP', fieldType: 'boolean', sortOrder: 10 })
    await definition(A.orgId, { key: 'zonas', label: 'Zonas', fieldType: 'multiselect', optionsJson: '["Centro","Norte"]', sortOrder: 30 })
    const c = await contact(A.orgId)
    const ref = { entityType: 'contact' as const, entityKind: 'contact', entityId: c.id }

    const saved = await saveEntityCustomFields(db, A.orgId, A.userId, ref, { presupuesto: '250000', vip: true, zonas: ['Norte'] })
    expect(saved.values).toEqual({ vip: true, presupuesto: 250000, zonas: ['Norte'] })
    expect(saved.definitions.map((d) => d.key)).toEqual(['vip', 'presupuesto', 'zonas'])

    // Sólo lo que llega se toca.
    await saveEntityCustomFields(db, A.orgId, A.userId, ref, { vip: false })
    expect((await loadEntityCustomFields(db, A.orgId, ref)).values).toMatchObject({ vip: false, presupuesto: 250000 })

    await saveEntityCustomFields(db, A.orgId, A.userId, ref, { presupuesto: '' })
    expect((await loadEntityCustomFields(db, A.orgId, ref)).values.presupuesto).toBeNull()
    const rows = await db.select().from(schema.customFieldValues).where(eq(schema.customFieldValues.entityId, c.id))
    expect(rows).toHaveLength(2)
    expect(rows.every((r: any) => r.entityKind === 'contact' && r.updatedBy === A.userId)).toBe(true)
  })

  it('obligatorios sobre el estado resultante; una clave desconocida o archivada es un 422', async () => {
    await definition(A.orgId, { key: 'dni', label: 'DNI', fieldType: 'text', isRequired: 1 })
    await definition(A.orgId, { key: 'antiguo', label: 'Antiguo', fieldType: 'text', status: 'archived' })
    await definition(A.orgId, { key: 'nota', label: 'Nota', fieldType: 'text' })
    const c = await contact(A.orgId)
    const ref = { entityType: 'contact' as const, entityKind: 'contact', entityId: c.id }
    await expectStatus(saveEntityCustomFields(db, A.orgId, A.userId, ref, { nota: 'x' }), 422, /DNI/)
    await saveEntityCustomFields(db, A.orgId, A.userId, ref, { nota: 'x', dni: '12345678Z' })
    await expect(saveEntityCustomFields(db, A.orgId, A.userId, ref, { nota: 'y' })).resolves.toBeTruthy()
    await expectStatus(saveEntityCustomFields(db, A.orgId, A.userId, ref, { dni: '' }), 422, /DNI/)
    await expectStatus(saveEntityCustomFields(db, A.orgId, A.userId, ref, { antiguo: 'x' }), 422, /antiguo/)
    await expectStatus(saveEntityCustomFields(db, A.orgId, A.userId, ref, { inventado: 'x' }), 422, /inventado/)
    await expectStatus(saveEntityCustomFields(db, A.orgId, A.userId, ref, ['x']), 422)
  })

  it('una propiedad separa los dos catálogos por entity_kind (mismo id, valores distintos)', async () => {
    await definition(A.orgId, { entityType: 'property', key: 'llaves', label: 'Llaves', fieldType: 'text' })
    const [dev] = await db.insert(schema.developerProperties).values({ organizationId: A.orgId, developerId: A.developerId, name: 'X', slug: 'x-mismo-id', status: 'new', createdAt: ts, updatedAt: ts }).returning()
    const [agent] = await db.insert(schema.agentProperties).values({ id: dev.id, organizationId: A.orgId, slug: 'y-mismo-id', status: 'available', createdAt: ts, updatedAt: ts }).returning()
    expect(agent.id).toBe(dev.id)
    await saveEntityCustomFields(db, A.orgId, A.userId, { entityType: 'property', entityKind: 'agent', entityId: agent.id }, { llaves: 'En la oficina' })
    await saveEntityCustomFields(db, A.orgId, A.userId, { entityType: 'property', entityKind: 'developer', entityId: dev.id }, { llaves: 'En obra' })
    expect((await loadEntityCustomFields(db, A.orgId, { entityType: 'property', entityKind: 'agent', entityId: agent.id })).values.llaves).toBe('En la oficina')
    expect((await loadEntityCustomFields(db, A.orgId, { entityType: 'property', entityKind: 'developer', entityId: dev.id })).values.llaves).toBe('En obra')
  })

  it('citas y operaciones también tienen campos', async () => {
    await definition(A.orgId, { entityType: 'appointment', key: 'parking', label: 'Parking', fieldType: 'boolean' })
    const res = await customFieldValuesResourcePost(db, A.orgId, A.userId, 'custom-field-values', { entityType: 'appointment', entityId: A.visitId, values: { parking: '1' } })
    expect(res.values.parking).toBe(true)
  })
})

describe('aislamiento entre agencias', () => {
  it('las definiciones de una agencia no existen para otra', async () => {
    await definition(B.orgId, { entityType: 'lead', key: 'secreto', label: 'Secreto' })
    expect(await listDefinitions(db, A.orgId, 'lead')).toEqual([])
    expect((await listDefinitions(db, B.orgId, 'lead')).map((d) => d.key)).toEqual(['secreto'])
    // Usar la clave de otra agencia sobre un registro propio: campo desconocido.
    await expectStatus(saveEntityCustomFields(db, A.orgId, A.userId, { entityType: 'lead', entityKind: 'lead', entityId: A.leadId }, { secreto: 'x' }), 422, /secreto/)
  })

  it('leer o guardar campos de un registro de otra agencia → 404, en los cinco tipos', async () => {
    await definition(A.orgId, { entityType: 'lead', key: 'nota', label: 'Nota' })
    const cB = await contact(B.orgId)
    const refs = [
      { entityType: 'contact', entityId: cB.id },
      { entityType: 'lead', entityId: B.leadId },
      { entityType: 'appointment', entityId: B.visitId },
      { entityType: 'property', entityKind: 'agent', entityId: B.propertyId },
      { entityType: 'property', entityKind: 'developer', entityId: B.projectId },
    ]
    for (const r of refs) {
      const resource = r.entityType === 'property' ? 'property-custom-field-values' : 'custom-field-values'
      await expectStatus(customFieldValuesResourceGet(db, A.orgId, resource, r), 404)
      await expectStatus(customFieldValuesResourcePost(db, A.orgId, A.userId, resource, { ...r, values: {} }), 404)
    }
    expect(await db.select().from(schema.customFieldValues)).toEqual([])
  })

  it('cada recurso sólo sirve sus entidades: una propiedad por el recurso de CRM (o al revés) → 404', async () => {
    await expectStatus(customFieldValuesResourceGet(db, A.orgId, 'custom-field-values', { entityType: 'property', entityKind: 'agent', entityId: A.propertyId }), 404)
    await expectStatus(customFieldValuesResourceGet(db, A.orgId, 'property-custom-field-values', { entityType: 'lead', entityId: A.leadId }), 404)
    expect(() => assertCustomFieldValueScope('custom-field-values', { entityType: 'property' })).toThrow()
    expect(() => assertCustomFieldValueScope('property-custom-field-values', { entityType: 'property' })).not.toThrow()
  })

  it('borrar definitivamente una definición se lleva sus valores, sólo los de esa agencia', async () => {
    const dA = await definition(A.orgId, { entityType: 'lead', key: 'x', label: 'X' })
    await saveEntityCustomFields(db, A.orgId, A.userId, { entityType: 'lead', entityKind: 'lead', entityId: A.leadId }, { x: 'a' })
    // La agencia B intenta borrar los valores de la definición de A: nada.
    await deleteCustomFieldValues(db, B.orgId, { definitionId: dA.id })
    expect(await db.select().from(schema.customFieldValues).where(eq(schema.customFieldValues.definitionId, dA.id))).toHaveLength(1)
    await deleteCustomFieldValues(db, A.orgId, { definitionId: dA.id })
    expect(await db.select().from(schema.customFieldValues).where(eq(schema.customFieldValues.definitionId, dA.id))).toHaveLength(0)
  })
})

describe('web pública', () => {
  it('sólo salen los campos «público», activos y con valor — nunca los internos', async () => {
    await definition(A.orgId, { entityType: 'property', key: 'orientacion', label: 'Orientación del salón', fieldType: 'select', optionsJson: '["Sur","Norte"]', isPublic: 1, sortOrder: 1 })
    await definition(A.orgId, { entityType: 'property', key: 'comision', label: 'Comisión pactada', fieldType: 'number', isPublic: 0 })
    await definition(A.orgId, { entityType: 'property', key: 'entrega', label: 'Entrega', fieldType: 'date', isPublic: 1, sortOrder: 2 })
    await definition(A.orgId, { entityType: 'property', key: 'vacio', label: 'Vacío', fieldType: 'text', isPublic: 1 })
    const ref = { entityType: 'property' as const, entityKind: 'developer', entityId: A.projectId }
    await saveEntityCustomFields(db, A.orgId, A.userId, ref, { orientacion: 'Sur', comision: 3, entrega: '2027-06-30' })
    const pub = await publicCustomFieldsFor(db, A.orgId, 'developer', A.projectId)
    expect(pub.map((f) => [f.label, f.display])).toEqual([
      ['Orientación del salón', 'Sur'],
      ['Entrega', '30/06/2027'],
    ])
    // Otra agencia, aunque pidiera esta propiedad, no ve nada: los campos se buscan con SU organización.
    expect(await publicCustomFieldsFor(db, B.orgId, 'developer', A.projectId)).toEqual([])
    const all = await db.select().from(schema.customFieldValues).where(and(eq(schema.customFieldValues.organizationId, A.orgId)))
    expect(all).toHaveLength(3)
  })
})
