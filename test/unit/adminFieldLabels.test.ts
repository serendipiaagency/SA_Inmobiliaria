import { describe, expect, it } from 'vitest'
import { fieldLabel, humanizeFieldName } from '../../utils/adminFieldLabels'
import { adminResources } from '../../server/utils/adminResources'

/**
 * El CRUD genérico (pages/admin/[resource]/index.vue y [id].vue) sirve 18
 * entradas del menú. Hasta ahora imprimía el nombre de la columna tal cual
 * —`id`, `createdAt`, `emailSenderDomainVerified`— y la mitad de su chrome
 * estaba en inglés dentro de un panel que por lo demás está en español.
 *
 * Esto protege lo que se arregló: que ninguna columna llegue a la pantalla
 * con su nombre técnico, y que ningún recurso o campo se quede sin etiqueta.
 */

describe('humanizeFieldName', () => {
  it('parte el camelCase en palabras legibles', () => {
    expect(humanizeFieldName('emailSenderName')).toBe('Email sender name')
    expect(humanizeFieldName('createdAt')).toBe('Created at')
  })

  it('trata guiones y guiones bajos como separadores', () => {
    expect(humanizeFieldName('sort_order')).toBe('Sort order')
    expect(humanizeFieldName('main-image')).toBe('Main image')
  })

  it('no se rompe con entradas degeneradas', () => {
    expect(humanizeFieldName('')).toBe('')
    expect(humanizeFieldName('x')).toBe('X')
  })
})

describe('fieldLabel', () => {
  it('prefiere la etiqueta que declara el recurso', () => {
    const meta = { fields: { price: { label: 'Precio (AED)' } } }
    expect(fieldLabel(meta, 'price')).toBe('Precio (AED)')
  })

  it('usa el diccionario para las columnas técnicas que no son campos editables', () => {
    // `id` y las marcas de tiempo salen en listFields de casi todos los
    // recursos y no tienen campo detrás: sin diccionario acabarían como
    // "Id" y "Created at".
    expect(fieldLabel({ fields: {} }, 'id')).toBe('ID')
    expect(fieldLabel({ fields: {} }, 'createdAt')).toBe('Creado')
    expect(fieldLabel(null, 'updatedAt')).toBe('Actualizado')
  })

  it('cae a la conversión automática para un campo sin etiqueta', () => {
    expect(fieldLabel({ fields: {} }, 'algunCampoNuevo')).toBe('Algun campo nuevo')
  })
})

describe('etiquetas de los recursos de administración', () => {
  const entries = Object.entries(adminResources)

  it('encuentra todos los recursos', () => {
    expect(entries.length).toBeGreaterThan(25)
  })

  it('cada recurso declara una etiqueta para su pantalla', () => {
    const missing = entries.filter(([, def]) => !String((def as any).label || '').trim()).map(([key]) => key)
    expect(missing, 'estos recursos saldrían con el título vacío en /admin/<recurso>').toEqual([])
  })

  it('cada campo editable declara una etiqueta', () => {
    const missing: string[] = []
    for (const [key, def] of entries) {
      for (const [field, spec] of Object.entries((def as any).fields || {})) {
        if (!String((spec as any)?.label || '').trim()) missing.push(`${key}.${field}`)
      }
    }
    expect(missing, 'estos campos saldrían sin etiqueta en el formulario genérico').toEqual([])
  })

  it('ninguna etiqueta es el nombre crudo de la columna', () => {
    // Una etiqueta idéntica a la clave significa que nadie la escribió: es
    // la forma en que el esquema se filtra a la pantalla.
    const raw: string[] = []
    for (const [key, def] of entries) {
      for (const [field, spec] of Object.entries((def as any).fields || {})) {
        if ((spec as any)?.label === field) raw.push(`${key}.${field}`)
      }
    }
    expect(raw).toEqual([])
  })

  it('cada columna de la tabla resuelve a un nombre legible, no a la clave', () => {
    const leaking: string[] = []
    for (const [key, def] of entries) {
      for (const field of (def as any).listFields || []) {
        if (fieldLabel(def as any, field) === field) leaking.push(`${key}.${field}`)
      }
    }
    expect(
      leaking,
      'estas cabeceras saldrían con el nombre técnico de la columna; dale una etiqueta al campo o añade la clave a KNOWN_FIELD_LABELS en utils/adminFieldLabels.ts',
    ).toEqual([])
  })
})
