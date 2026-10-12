import { getTableColumns } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import * as schema from '../../server/db/schema'
import { NEVER_PUBLIC_OFFICE_COLUMNS, PUBLIC_OFFICE_COLUMNS, officeMapsUrl } from '../../server/utils/publicOffices'

/**
 * Misma disciplina que publicTeamProjection.test.ts: las oficinas salen a la
 * web con una proyección explícita (bloque «Nuestras oficinas», /oficinas,
 * datos estructurados), y toda columna de `offices` tiene que estar
 * clasificada como pública o como nunca pública, con su motivo. Añadir una
 * columna (migración 0096 o la siguiente) sin decidirlo rompe aquí.
 */
const allColumns = Object.keys(getTableColumns(schema.offices)).sort()
const publicColumns = Object.keys(PUBLIC_OFFICE_COLUMNS).sort()
const privateColumns = Object.keys(NEVER_PUBLIC_OFFICE_COLUMNS).sort()

describe('proyección pública de offices', () => {
  it('clasifica TODAS las columnas: ninguna queda sin decidir', () => {
    const classified = [...publicColumns, ...privateColumns].sort()
    expect(allColumns.filter((c) => !classified.includes(c)), 'columnas de offices sin clasificar (PUBLIC_OFFICE_COLUMNS o NEVER_PUBLIC_OFFICE_COLUMNS)').toEqual([])
    expect(classified.filter((c) => !allColumns.includes(c)), 'columnas clasificadas que ya no existen').toEqual([])
  })

  it('ninguna columna está en los dos lados y lo interno nunca es público', () => {
    expect(publicColumns.filter((c) => privateColumns.includes(c))).toEqual([])
    for (const c of ['organizationId', 'code', 'timezone', 'status', 'showOnWeb', 'createdBy', 'createdAt', 'updatedAt', 'deletedAt']) {
      expect(privateColumns, `${c} tiene que ser privada`).toContain(c)
      expect(NEVER_PUBLIC_OFFICE_COLUMNS[c], `${c} necesita su motivo escrito`).toBeTruthy()
    }
  })

  it('lo que la web enseña de una oficina es público: contacto, dirección, horario, mapa, principal y orden', () => {
    for (const c of ['name', 'email', 'phone', 'address', 'city', 'province', 'postalCode', 'country', 'photo', 'description', 'openingHours', 'lat', 'lng', 'isMain', 'sortOrder']) {
      expect(publicColumns, c).toContain(c)
    }
  })

  it('el enlace «Cómo llegar» usa las coordenadas si existen, la dirección si no, y nada sin ninguna de las dos', () => {
    expect(officeMapsUrl({ lat: 43.3619, lng: -5.8494, address: 'Calle Uría 1', city: 'Oviedo' })).toBe('https://www.google.com/maps/search/?api=1&query=43.3619%2C-5.8494')
    expect(officeMapsUrl({ lat: null, lng: null, address: 'Calle Uría 1', postalCode: '33003', city: 'Oviedo', province: 'Asturias' })).toBe('https://www.google.com/maps/search/?api=1&query=Calle%20Ur%C3%ADa%201%2C%2033003%2C%20Oviedo%2C%20Asturias')
    expect(officeMapsUrl({ lat: null, lng: null, address: ' ', city: null })).toBeNull()
  })
})
