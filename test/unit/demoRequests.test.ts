import { beforeEach, describe, expect, it } from 'vitest'
import { schema } from '../../server/utils/db'
import { createDemoRequest, deleteDemoRequests, listDemoRequests, updateDemoRequest, validateDemoRequest } from '../../server/utils/demoRequests'
import { createTestDb } from './helpers/tenantFixtures'

/**
 * Solicitudes de demo de la landing (migración 0094, server/utils/demoRequests.ts):
 * validación honesta (consentimiento obligatorio, opciones cerradas), guardado
 * con su consentimiento, bandeja con recuentos, estado/notas y borrado.
 */
let db: any
beforeEach(() => {
  ;({ db } = createTestDb())
})

const VALID = { name: ' Lucía  Martín ', email: 'Lucia@Ejemplo.COM', company: 'Inmobiliaria Ejemplo', consent: true }

describe('validación', () => {
  it('normaliza, recorta y sólo admite las opciones conocidas', () => {
    const v = validateDemoRequest({ ...VALID, phone: ' +34 600 000 000 ', teamSize: '2-5', interest: 'web', message: 'Hola\n\nquiero\tver la web', locale: 'ES' })
    expect(v).toEqual({ name: 'Lucía Martín', email: 'lucia@ejemplo.com', company: 'Inmobiliaria Ejemplo', phone: '+34 600 000 000', teamSize: '2-5', interest: 'web', message: 'Hola\n\nquiero ver la web', locale: 'es' })
    expect(validateDemoRequest({ ...VALID, teamSize: 'enorme', interest: 'otra', locale: 'klingon' })).toMatchObject({ teamSize: null, interest: null, locale: null, phone: null, message: null })
  })
  it('rechaza sin nombre, sin inmobiliaria, con email inválido, con teléfono raro o sin consentimiento', () => {
    expect(() => validateDemoRequest({ ...VALID, name: '  ' })).toThrow(/nombre/)
    expect(() => validateDemoRequest({ ...VALID, company: '' })).toThrow(/inmobiliaria/)
    expect(() => validateDemoRequest({ ...VALID, email: 'no-es-un-email' })).toThrow()
    expect(() => validateDemoRequest({ ...VALID, phone: 'abc' })).toThrow(/teléfono/)
    expect(() => validateDemoRequest({ ...VALID, consent: 'yes' })).toThrow(/permiso/)
    expect(() => validateDemoRequest(null)).toThrow()
  })
  it('quita los caracteres de control y respeta los límites de longitud', () => {
    const v = validateDemoRequest({ ...VALID, name: 'A\u0000B\u0007C', message: 'x'.repeat(5000) })
    expect(v.name).toBe('A B C')
    expect(v.message).toHaveLength(2000)
  })
})

describe('bandeja', () => {
  it('guarda la solicitud con su consentimiento y la lista con recuentos por estado', async () => {
    const a = await createDemoRequest(db, validateDemoRequest(VALID), 'req-1')
    const b = await createDemoRequest(db, validateDemoRequest({ ...VALID, email: 'otro@ejemplo.com', company: 'Casa Norte' }), null)
    expect(a.id).toBeGreaterThan(0)
    const [row] = await db.select().from(schema.platformDemoRequests)
    expect(row).toMatchObject({ email: 'lucia@ejemplo.com', status: 'new', requestId: 'req-1' })
    expect(row.consentAt).toBeTruthy()

    const all = await listDemoRequests(db)
    expect(all.rows.map((r: any) => r.id)).toEqual([b.id, a.id])
    expect(all.counts).toEqual({ new: 2, contacted: 0, closed: 0 })
    expect(all.rows[1].teamSizeLabel).toBeNull()

    expect((await listDemoRequests(db, { q: 'casa' })).rows.map((r: any) => r.id)).toEqual([b.id])
    expect((await listDemoRequests(db, { q: 'LUCIA' })).rows.map((r: any) => r.id)).toEqual([a.id])
    // `%` y `_` no son comodines para quien busca.
    expect((await listDemoRequests(db, { q: '%' })).rows).toHaveLength(0)
  })

  it('cambia estado y notas, rechaza estados inventados y borra a petición', async () => {
    const a = await createDemoRequest(db, validateDemoRequest(VALID), null)
    expect(await updateDemoRequest(db, a.id, { status: 'contacted', notes: ' Llamada el lunes ' })).toBe(true)
    const [row] = await db.select().from(schema.platformDemoRequests)
    expect(row).toMatchObject({ status: 'contacted', notes: 'Llamada el lunes' })
    expect((await listDemoRequests(db, { status: 'contacted' })).counts).toEqual({ new: 0, contacted: 1, closed: 0 })
    await expect(updateDemoRequest(db, a.id, { status: 'spam' })).rejects.toThrow(/Estado/)
    expect(await updateDemoRequest(db, 9999, { status: 'closed' })).toBe(false)
    expect(await deleteDemoRequests(db, [a.id, 9999])).toBe(1)
    expect((await listDemoRequests(db)).rows).toHaveLength(0)
  })
})
