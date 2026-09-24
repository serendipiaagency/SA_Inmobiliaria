import { describe, expect, it } from 'vitest'
import {
  buildPool,
  cursorScopeFor,
  explain,
  normalize,
  parseList,
  pickFromPool,
  ruleApplies,
  STRATEGIES,
  type RoutableCommercial,
  type RoutingRule,
} from '../../server/utils/leads/routing'

/**
 * Lo que se prueba aquí es lo que hace defendible un reparto delante del
 * equipo: que sea reproducible, que se pueda explicar y que nunca deje un lead
 * sin dueño sin decirlo.
 */

function rule(overrides: Partial<RoutingRule> = {}): RoutingRule {
  return {
    id: 1,
    name: 'Regla',
    priority: 100,
    enabled: 1,
    strategy: 'round_robin',
    respectWorkingHours: 0,
    ...overrides,
  }
}

function commercial(id: number, overrides: Partial<RoutableCommercial> = {}): RoutableCommercial {
  return { id, name: `Comercial ${id}`, employmentStatus: 'active', ...overrides }
}

describe('routing — cuándo aplica una regla', () => {
  it('una condición sin rellenar no filtra', () => {
    // Es lo que permite una regla general ("todo lo de Idealista al centro")
    // sin tener que escribir todas las demás condiciones.
    expect(ruleApplies(rule({ matchPortal: 'Idealista' }), { portal: 'Idealista', source: 'portal' })).toBe(true)
    expect(ruleApplies(rule({ matchPortal: 'Idealista' }), { portal: 'Fotocasa' })).toBe(false)
  })

  it('las tildes y mayúsculas no rompen la coincidencia', () => {
    expect(ruleApplies(rule({ matchZone: 'Chamberí' }), { zone: 'CHAMBERI' })).toBe(true)
  })

  it('una regla desactivada nunca aplica', () => {
    expect(ruleApplies(rule({ enabled: 0 }), {})).toBe(false)
  })

  it('todas las condiciones deben cumplirse a la vez', () => {
    const r = rule({ matchSource: 'portal', matchZone: 'Chamberí' })
    expect(ruleApplies(r, { source: 'portal', zone: 'Chamberí' })).toBe(true)
    expect(ruleApplies(r, { source: 'portal', zone: 'Salamanca' })).toBe(false)
  })
})

describe('routing — quién entra en el reparto', () => {
  const pool = [
    commercial(3, { zones: '["Chamberí"]', officeName: 'Centro' }),
    commercial(1, { zones: '["Salamanca"]', officeName: 'Centro' }),
    commercial(2, { zones: '["Chamberí","Salamanca"]', officeName: 'Norte' }),
  ]

  it('el orden es estable por id, no el que devuelva la base de datos', () => {
    // Sin orden estable, el turno rotatorio dejaría de ser reproducible.
    expect(buildPool(rule(), {}, pool).map((c) => c.id)).toEqual([1, 2, 3])
  })

  it('filtra por oficina cuando la regla lo pide', () => {
    expect(buildPool(rule({ targetOffice: 'Centro' }), {}, pool).map((c) => c.id)).toEqual([1, 3])
  })

  it('prefiere a quien cubre la zona del lead', () => {
    expect(buildPool(rule(), { zone: 'Chamberí' }, pool).map((c) => c.id)).toEqual([2, 3])
  })

  it('si nadie cubre la zona no se queda sin nadie: el grupo entero sigue valiendo', () => {
    // Vaciar el grupo aquí dejaría el lead sin dueño por un dato de
    // configuración que nadie rellenó.
    expect(buildPool(rule(), { zone: 'Retiro' }, pool).map((c) => c.id)).toEqual([1, 2, 3])
  })

  it('excluye a quien no está activo', () => {
    const conBaja = [...pool, commercial(4, { employmentStatus: 'inactive' })]
    expect(buildPool(rule(), {}, conBaja).map((c) => c.id)).not.toContain(4)
  })

  it('respetar el horario no excluye a quien no tiene horario configurado', () => {
    // `null` = no hay horario. Excluirlo sería castigar la falta de
    // configuración dejando leads sin asignar.
    const mixto = [
      commercial(1, { withinWorkingHours: false }),
      commercial(2, { withinWorkingHours: null }),
      commercial(3, { withinWorkingHours: true }),
    ]
    expect(buildPool(rule({ respectWorkingHours: 1 }), {}, mixto).map((c) => c.id)).toEqual([2, 3])
  })

  it('si nadie está dentro de su horario, se reparte igual', () => {
    const todosFuera = [commercial(1, { withinWorkingHours: false }), commercial(2, { withinWorkingHours: false })]
    expect(buildPool(rule({ respectWorkingHours: 1 }), {}, todosFuera).map((c) => c.id)).toEqual([1, 2])
  })
})

describe('routing — cómo se elige', () => {
  const pool = [commercial(1), commercial(2), commercial(3)]

  it('el turno rotatorio reparte en orden y sin azar', () => {
    const elegidos = [0, 1, 2, 3, 4, 5].map((n) => pickFromPool(rule(), {}, pool, { cursorCounter: n }).commercial?.id)
    expect(elegidos).toEqual([1, 2, 3, 1, 2, 3])
  })

  it('el mismo contador da siempre el mismo comercial', () => {
    const a = pickFromPool(rule(), {}, pool, { cursorCounter: 7 }).commercial?.id
    const b = pickFromPool(rule(), {}, pool, { cursorCounter: 7 }).commercial?.id
    expect(a).toBe(b)
  })

  it('"menos carga" elige a quien menos leads vivos tiene, y desempata por id', () => {
    const conCarga = [commercial(1, { activeLeads: 5 }), commercial(2, { activeLeads: 2 }), commercial(3, { activeLeads: 2 })]
    const { commercial: elegido, step } = pickFromPool(rule({ strategy: 'least_load' }), {}, conCarga)
    expect(elegido?.id).toBe(2)
    expect(step).toContain('2 leads vivos')
  })

  it('"comercial del inmueble" no inventa a nadie si el lead no viene de un inmueble', () => {
    const { commercial: elegido, step } = pickFromPool(rule({ strategy: 'property_owner' }), {}, pool)
    expect(elegido).toBeNull()
    expect(step).toContain('no viene de ningún inmueble')
  })

  it('"comercial del inmueble" lo elige cuando está disponible', () => {
    const { commercial: elegido } = pickFromPool(rule({ strategy: 'property_owner' }), { propertyOwnerCommercialId: 2 }, pool)
    expect(elegido?.id).toBe(2)
  })

  it('"comercial concreto" que ya no está disponible no asigna a otro en su lugar', () => {
    // Asignar a otro sería desobedecer la regla en silencio. Devolver null hace
    // que se pruebe la siguiente regla, que es lo que se espera.
    const { commercial: elegido, step } = pickFromPool(rule({ strategy: 'specific', targetCommercialId: 99 }), {}, pool)
    expect(elegido).toBeNull()
    expect(step).toContain('no está disponible')
  })

  it('un grupo vacío no elige a nadie y lo dice', () => {
    const { commercial: elegido, step } = pickFromPool(rule(), {}, [])
    expect(elegido).toBeNull()
    expect(step).toContain('ningún comercial')
  })

  it('una estrategia desconocida cae al turno rotatorio en vez de fallar', () => {
    const { commercial: elegido } = pickFromPool(rule({ strategy: 'inventada' }), {}, pool, { cursorCounter: 1 })
    expect(elegido?.id).toBe(2)
  })
})

describe('routing — explicación', () => {
  it('produce la frase completa que pide la fase', () => {
    expect(explain(['Zona Chamberí', 'oficina Centro', 'turno rotatorio (3 comerciales)'], 'Laura')).toBe(
      'Zona Chamberí → oficina Centro → turno rotatorio (3 comerciales) → Laura',
    )
  })

  it('cuando no hay nadie, lo dice en vez de dejar la frase a medias', () => {
    expect(explain(['Reparto general'], null)).toBe('Reparto general → sin asignar')
  })
})

describe('routing — ámbitos del contador', () => {
  it('dos reglas distintas no se pisan el turno', () => {
    expect(cursorScopeFor(rule({ id: 1 }))).not.toBe(cursorScopeFor(rule({ id: 2 })))
  })

  it('la misma regla en oficinas distintas lleva turnos separados', () => {
    expect(cursorScopeFor(rule({ targetOffice: 'Centro' }))).not.toBe(cursorScopeFor(rule({ targetOffice: 'Norte' })))
  })
})

describe('routing — lectura de los campos de comerciales', () => {
  it('lee las zonas guardadas como JSON', () => {
    expect(parseList('["Chamberí","Salamanca"]')).toEqual(['Chamberí', 'Salamanca'])
  })

  it('también lee las guardadas como texto separado por comas', () => {
    // Los campos antiguos de team_members se rellenaron a mano así.
    expect(parseList('Chamberí, Salamanca')).toEqual(['Chamberí', 'Salamanca'])
  })

  it('un campo vacío o roto no revienta el reparto', () => {
    expect(parseList(null)).toEqual([])
    expect(parseList('')).toEqual([])
    expect(parseList('[roto')).toEqual([])
  })

  it('normalize quita tildes y mayúsculas', () => {
    expect(normalize(' CHAMBERÍ ')).toBe('chamberi')
  })
})

describe('routing — vocabulario', () => {
  it('las cuatro estrategias de la fase existen', () => {
    expect(STRATEGIES).toEqual(['property_owner', 'specific', 'round_robin', 'least_load'])
  })
})
