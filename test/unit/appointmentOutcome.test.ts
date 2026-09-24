import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  APPOINTMENT_TYPES,
  APPOINTMENT_TYPE_LABELS,
  AppointmentError,
  FEEDBACK_MUST_NOT_TOUCH,
  PRICE_PERCEPTIONS,
  reorderStops,
  summarizeOutcome,
  validateOutcome,
} from '../../server/utils/appointments/types'

/**
 * Lo que se prueba aquí es la regla que protege el catálogo: que la opinión de
 * un comprador sobre una tarde concreta no acabe convertida en un dato oficial
 * del inmueble.
 */

describe('resultado de visita — el feedback no muta el catálogo', () => {
  it('el módulo de citas no escribe NUNCA en el catálogo ni en las necesidades', () => {
    // La invariante se comprueba por tabla y no por columna: prohibir toda
    // escritura en agent_properties y buyer_requirements desde este módulo es
    // más fuerte que vigilar campos sueltos, y no confunde `visits.status`
    // —que sí se escribe, porque si la visita se realizó es un hecho de la
    // agenda— con `agent_properties.status`, que es del inmueble.
    const dir = join(process.cwd(), 'server/utils/appointments')
    const sources = ['types.ts', 'outcomes.ts']
      .map((f) => {
        try {
          return readFileSync(join(dir, f), 'utf8')
        } catch {
          return ''
        }
      })
      .join('\n')

    const forbiddenTables = [...new Set(FEEDBACK_MUST_NOT_TOUCH.map((f) => f.split('.')[0]))]
    const drizzleNames: Record<string, string> = {
      agent_properties: 'agentProperties',
      buyer_requirements: 'buyerRequirements',
    }

    for (const table of forbiddenTables) {
      const name = drizzleNames[table]
      expect(name, `falta el nombre Drizzle de ${table}`).toBeTruthy()
      for (const write of [`update(schema.${name})`, `insert(schema.${name})`, `delete(schema.${name})`]) {
        expect(sources.includes(write), `el flujo de feedback hace ${write}`).toBe(false)
      }
    }
  })

  it('sí puede marcar la cita como realizada: eso es la agenda, no una opinión', () => {
    const source = readFileSync(join(process.cwd(), 'server/utils/appointments/outcomes.ts'), 'utf8')
    expect(source).toContain('update(schema.visits)')
  })

  it('la lista de campos protegidos cubre inmueble y necesidad', () => {
    expect(FEEDBACK_MUST_NOT_TOUCH.some((f) => f.startsWith('agent_properties.'))).toBe(true)
    expect(FEEDBACK_MUST_NOT_TOUCH.some((f) => f.startsWith('buyer_requirements.'))).toBe(true)
  })
})

describe('resultado de visita — validación', () => {
  it('acepta un resultado a medias', () => {
    // Exigirlo todo haría que la gente rellenara cualquier cosa por salir del
    // paso, que es peor que un hueco honesto.
    expect(() => validateOutcome({ disliked: 'La cocina' })).not.toThrow()
  })

  it('el interés va de 0 a 5', () => {
    expect(() => validateOutcome({ interestScore: 6 })).toThrow(AppointmentError)
    expect(() => validateOutcome({ interestScore: -1 })).toThrow(AppointmentError)
    expect(() => validateOutcome({ interestScore: 0 })).not.toThrow()
    expect(() => validateOutcome({ interestScore: 5 })).not.toThrow()
  })

  it('descartar exige decir por qué', () => {
    expect(() => validateOutcome({ discarded: true })).toThrow(AppointmentError)
    expect(() => validateOutcome({ discarded: true, discardReason: 'Demasiado ruido' })).not.toThrow()
  })

  it('pedir seguimiento exige fecha: una intención sin fecha no la ejecuta nadie', () => {
    expect(() => validateOutcome({ followUpRequired: true })).toThrow(AppointmentError)
    expect(() => validateOutcome({ followUpRequired: true, followUpAt: '2026-10-01 10:00:00' })).not.toThrow()
  })

  it('no se puede descartar y querer ofertar a la vez', () => {
    expect(() => validateOutcome({ discarded: true, discardReason: 'Caro', wantsOffer: true })).toThrow(AppointmentError)
  })

  it('una percepción de precio inventada se rechaza', () => {
    expect(() => validateOutcome({ pricePerception: 'regular' })).toThrow(AppointmentError)
  })
})

describe('resultado de visita — resumen', () => {
  it('lo construye desde los datos, no a mano', () => {
    expect(summarizeOutcome({ completed: 1, interestScore: 4, pricePerception: 'too_expensive', wantsSecondViewing: 1 })).toBe(
      'Interés 4/5 · Le pareció caro · Quiere segunda visita',
    )
  })

  it('una visita que no se hizo lo dice y no inventa valoración', () => {
    expect(summarizeOutcome({ completed: 0, interestScore: 3 })).toBe('No se realizó')
  })

  it('descartado manda sobre el resto', () => {
    expect(summarizeOutcome({ completed: 1, discarded: 1, wantsOffer: 0 })).toContain('Descartado')
  })

  it('sin ningún dato lo dice en vez de fingir una valoración', () => {
    expect(summarizeOutcome({ completed: 1 })).toBe('Sin valorar')
  })

  it('un interés de 0 no se confunde con "no se preguntó"', () => {
    // 0 = no le interesó nada. NULL = nadie se lo preguntó. Son cosas distintas.
    expect(summarizeOutcome({ completed: 1, interestScore: 0 })).toContain('Interés 0/5')
    expect(summarizeOutcome({ completed: 1, interestScore: null })).toBe('Sin valorar')
  })
})

describe('citas — vocabulario', () => {
  it('los nueve tipos de la fase existen, con etiqueta en castellano', () => {
    expect(APPOINTMENT_TYPES).toHaveLength(9)
    for (const type of APPOINTMENT_TYPES) expect(APPOINTMENT_TYPE_LABELS[type]).toBeTruthy()
  })

  it('una visita de inmueble es el tipo por defecto del dominio', () => {
    expect(APPOINTMENT_TYPES[0]).toBe('property_viewing')
  })

  it('las tres percepciones de precio existen', () => {
    expect(PRICE_PERCEPTIONS).toEqual(['too_expensive', 'fair', 'bargain'])
  })
})

describe('tours — reordenar paradas', () => {
  it('asigna posiciones consecutivas desde cero', () => {
    expect(reorderStops([7, 3, 9])).toEqual([
      { id: 7, sortOrder: 0 },
      { id: 3, sortOrder: 1 },
      { id: 9, sortOrder: 2 },
    ])
  })

  it('ignora repetidos en vez de crear dos paradas en la misma posición', () => {
    expect(reorderStops([4, 4, 5])).toEqual([
      { id: 4, sortOrder: 0 },
      { id: 5, sortOrder: 1 },
    ])
  })

  it('una lista vacía no rompe nada', () => {
    expect(reorderStops([])).toEqual([])
  })
})
