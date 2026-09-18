import { describe, expect, it } from 'vitest'
import { adminResources } from '../../server/utils/adminResources'
import { CLIENT_TYPES, CLIENT_STAGES, CLIENT_BADGE_CLASSES, clientOption, initials, formatRelative } from '../../composables/useClientConfig'
import { buildClientTimeline } from '../../composables/useClientTimeline'

/**
 * El módulo de Clientes se apoya en dos cosas que se pueden desalinear en
 * silencio: los valores que ofrece la interfaz frente a los que acepta el
 * servidor, y la cronología frente a lo que la base de datos registra de
 * verdad.
 *
 * Ninguno de los dos fallos da error rojo. Un desplegable con un valor que el
 * servidor rechaza sólo se nota al guardar; una cronología que inventa
 * eventos no se nota nunca — y es justo lo que el encargo prohíbe.
 */

describe('los valores de la interfaz coinciden con los que acepta el servidor', () => {
  const def = adminResources.clients

  it('clientes está dado de alta en el motor genérico, acotado por organización', () => {
    // Sin esto no hay alta, edición, borrado, auditoría ni ámbito por
    // inquilino: era exactamente la situación de partida.
    expect(def).toBeTruthy()
    expect(def.tenantPolicy.type).toBe('direct')
    expect(def.area).toBe('crm')
  })

  it.each([
    ['type', CLIENT_TYPES],
    ['stage', CLIENT_STAGES],
  ])('«%s»: el desplegable ofrece exactamente lo que el servidor admite', (field, options) => {
    const serverOptions = (def.fields as any)[field]?.options
    expect(serverOptions, `el campo ${field} no declara opciones`).toBeTruthy()
    expect(options.map((o) => o.value).sort()).toEqual([...serverOptions].sort())
  })

  it('no deja editar las columnas que nadie mantiene', () => {
    // `lifetime_value` y `deals_count` sólo las escriben las migraciones de
    // siembra. Editables, invitarían a rellenar a mano una cifra que la ficha
    // presenta como real.
    expect(Object.keys(def.fields)).not.toContain('lifetimeValue')
    expect(Object.keys(def.fields)).not.toContain('dealsCount')
  })

  it('cada opción tiene un tono con clase definida', () => {
    for (const o of [...CLIENT_TYPES, ...CLIENT_STAGES]) {
      expect(CLIENT_BADGE_CLASSES[o.tone], `el tono "${o.tone}" no tiene clase`).toBeTruthy()
    }
  })

  it('un valor desconocido no rompe la etiqueta', () => {
    // Filas sembradas antes de que existieran estas opciones, o un valor
    // escrito a mano en la base: se muestra tal cual en vez de dejar hueco.
    expect(clientOption('stage', 'algo_raro').label).toBe('algo_raro')
    expect(clientOption('stage', null).label).toBe('—')
  })
})

describe('iniciales del avatar', () => {
  // El modelo no guarda fotografía de cliente, así que el avatar son sus
  // iniciales — y tiene que aguantar nombres reales.
  it.each([
    ['Laura Gómez', 'LG'],
    ['Laura', 'L'],
    ['María del Carmen Ruiz', 'MR'],
    ['  Ana   Pérez  ', 'AP'],
  ])('«%s» → %s', (name, expected) => {
    expect(initials(name)).toBe(expected)
  })

  it('sin nombre no revienta', () => {
    expect(initials('')).toBe('—')
    expect(initials(null)).toBe('—')
  })
})

describe('la cronología sólo muestra hechos registrados', () => {
  const related = {
    visits: [{ id: 1, scheduledAt: '2026-09-10 11:00:00', status: 'completed', propertyName: 'Mirador', agentName: 'Ana' }],
    deals: [{ id: 2, closedAt: '2026-09-15 00:00:00', dealType: 'sale', propertyName: 'Mirador', agentName: 'Ana' }],
    reservations: [{ id: 3, reservedAt: '2026-09-01 09:00:00', propertyName: 'Mirador', reference: 'R-1' }],
    contracts: [{ id: 4, createdAt: '2026-08-20 09:00:00', acceptedAt: null, title: 'Reserva' }],
    leads: [{ id: 5, createdAt: '2026-08-01 09:00:00', propertyName: 'Mirador', source: 'web' }],
    activity: [{ id: 6, createdAt: '2026-09-18 11:00:00', action: 'update', userEmail: 'admin@x.com' }],
  }

  it('recoge un evento por fila real, y ninguno más', () => {
    const events = buildClientTimeline(related)
    expect(events).toHaveLength(6)
    expect(new Set(events.map((e) => e.kind))).toEqual(new Set(['visit', 'deal', 'reservation', 'contract', 'lead', 'admin']))
  })

  it('ordena de lo más reciente a lo más antiguo', () => {
    const dates = buildClientTimeline(related).map((e) => e.at)
    expect(dates).toEqual([...dates].sort().reverse())
  })

  it('no fabrica un «cliente creado» cuando no hay auditoría que lo respalde', () => {
    // Las fichas sembradas por migraciones no tienen entrada de auditoría.
    // Deducir el alta de `created_at` sería presentar una suposición como un
    // hecho registrado, que es justo lo que no se quiere.
    const events = buildClientTimeline({ ...related, activity: [] })
    expect(events.some((e) => e.kind === 'admin')).toBe(false)
    expect(events).toHaveLength(5)
  })

  it('descarta filas sin fecha en vez de colocarlas en un sitio inventado', () => {
    const events = buildClientTimeline({ visits: [{ id: 9, scheduledAt: null, status: 'scheduled' }] })
    expect(events).toEqual([])
  })

  it('sin nada relacionado, la cronología está vacía y no falla', () => {
    expect(buildClientTimeline({})).toEqual([])
  })
})

describe('fechas', () => {
  it('«hace X» no se va un día por la zona horaria', () => {
    // Las marcas se guardan en UTC sin zona; leerlas como hora local
    // desplazaba la fecha. Mismo arreglo que en el Constructor Web.
    const ahora = new Date()
    const haceDos = new Date(ahora.getTime() - 2 * 86_400_000).toISOString().replace('T', ' ').slice(0, 19)
    expect(formatRelative(haceDos)).toBe('hace 2 días')
  })

  it('sin fecha devuelve un guion', () => {
    expect(formatRelative(null)).toBe('—')
  })
})
