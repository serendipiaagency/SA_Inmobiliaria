import { describe, expect, it } from 'vitest'
import {
  ALERT_KINDS,
  alertStillApplies,
  evaluateLead,
  responseMetrics,
  resolutionReason,
  type SlaConfig,
  type SlaLead,
} from '../../server/utils/leads/sla'

/**
 * Lo que se prueba aquí es que el SLA no mienta: que no invente tiempos que no
 * se midieron, que no siga avisando de cosas ya atendidas y que no cuente como
 * "atendido" un intento de llamada que nadie cogió.
 */

const config: SlaConfig = { enabled: 1, firstResponseMinutes: 60, staleDays: 7, businessHoursOnly: 0 }
const NOW = Date.parse('2026-09-22T12:00:00Z')

function lead(overrides: Partial<SlaLead> = {}): SlaLead {
  return {
    id: 1,
    createdAt: '2026-09-22 11:00:00',
    status: 'new',
    agentId: 5,
    ...overrides,
  }
}

describe('SLA — sin atender dentro del plazo', () => {
  it('avisa cuando pasa el plazo sin respuesta humana', () => {
    const alerts = evaluateLead(lead({ createdAt: '2026-09-22 09:00:00' }), config, NOW)
    const unanswered = alerts.find((a) => a.kind === 'unanswered')!
    expect(unanswered).toBeTruthy()
    expect(unanswered.detail).toContain('3 h sin respuesta')
    expect(unanswered.commercialId).toBe(5)
  })

  it('no avisa si aún no se ha cumplido el plazo', () => {
    const alerts = evaluateLead(lead({ createdAt: '2026-09-22 11:30:00' }), config, NOW)
    expect(alerts.some((a) => a.kind === 'unanswered')).toBe(false)
  })

  it('haber intentado llamar NO cuenta como haber atendido', () => {
    // Es la distinción que hace útil la métrica: tres llamadas que nadie coge
    // no son atención al cliente, aunque el comercial haya trabajado.
    const alerts = evaluateLead(lead({ createdAt: '2026-09-22 09:00:00', firstContactAt: '2026-09-22 09:15:00' }), config, NOW)
    const unanswered = alerts.find((a) => a.kind === 'unanswered')!
    expect(unanswered).toBeTruthy()
    // …pero se dice, porque cambia mucho la conversación con el comercial.
    expect(unanswered.detail).toContain('ya se intentó contactar')
  })

  it('cuando no se intentó nada siquiera, lo dice', () => {
    const alerts = evaluateLead(lead({ createdAt: '2026-09-22 09:00:00' }), config, NOW)
    expect(alerts.find((a) => a.kind === 'unanswered')!.detail).toContain('sin ningún intento de contacto')
  })

  it('una respuesta humana cierra el asunto', () => {
    const alerts = evaluateLead(lead({ createdAt: '2026-09-22 09:00:00', firstResponseAt: '2026-09-22 09:20:00' }), config, NOW)
    expect(alerts.some((a) => a.kind === 'unanswered')).toBe(false)
  })
})

describe('SLA — cualificado sin próxima acción', () => {
  it('avisa: es por donde se escapan los leads buenos', () => {
    const alerts = evaluateLead(lead({ qualifiedAt: '2026-09-21 10:00:00', firstResponseAt: '2026-09-22 11:10:00' }), config, NOW)
    expect(alerts.some((a) => a.kind === 'qualified_without_next_action')).toBe(true)
  })

  it('una cita concertada lo resuelve', () => {
    const alerts = evaluateLead(
      lead({ qualifiedAt: '2026-09-21 10:00:00', firstAppointmentAt: '2026-09-25 17:00:00', firstResponseAt: '2026-09-22 11:10:00' }),
      config,
      NOW,
    )
    expect(alerts.some((a) => a.kind === 'qualified_without_next_action')).toBe(false)
  })

  it('una próxima acción fijada también', () => {
    const alerts = evaluateLead(
      lead({ qualifiedAt: '2026-09-21 10:00:00', nextActionAt: '2026-09-23 09:00:00', firstResponseAt: '2026-09-22 11:10:00' }),
      config,
      NOW,
    )
    expect(alerts.some((a) => a.kind === 'qualified_without_next_action')).toBe(false)
  })
})

describe('SLA — sin contacto desde hace demasiado', () => {
  it('cuenta desde el último contacto real', () => {
    const alerts = evaluateLead(
      lead({ createdAt: '2026-08-01 10:00:00', firstResponseAt: '2026-08-01 10:30:00', lastContactAt: '2026-09-01 10:00:00' }),
      config,
      NOW,
    )
    const stale = alerts.find((a) => a.kind === 'stale')!
    expect(stale).toBeTruthy()
    expect(stale.detail).toContain('desde el último contacto')
  })

  it('si nunca hubo contacto, cuenta desde que entró — y lo dice', () => {
    const alerts = evaluateLead(lead({ createdAt: '2026-09-01 10:00:00' }), config, NOW)
    expect(alerts.find((a) => a.kind === 'stale')!.detail).toContain('sin ningún contacto desde que entró')
  })

  it('un contacto reciente no genera aviso', () => {
    const alerts = evaluateLead(
      lead({ createdAt: '2026-08-01 10:00:00', firstResponseAt: '2026-08-01 10:30:00', lastContactAt: '2026-09-21 10:00:00' }),
      config,
      NOW,
    )
    expect(alerts.some((a) => a.kind === 'stale')).toBe(false)
  })
})

describe('SLA — cuándo NO se avisa', () => {
  it('un lead cerrado no incumple nada', () => {
    // Seguir avisando de leads perdidos convertiría el panel en ruido que
    // nadie mira, que es como mueren los sistemas de alertas.
    for (const status of ['won', 'lost']) {
      expect(evaluateLead(lead({ createdAt: '2026-08-01 10:00:00', status }), config, NOW)).toHaveLength(0)
    }
  })

  it('un lead que sigue vivo en cualquier punto del pipeline sí se evalúa', () => {
    // El motivo de cerrar por `status` y no por una columna aparte: aquí se ve
    // que 'proposal' (negociando) no es un cierre, aunque esté muy avanzado.
    for (const status of ['new', 'contacted', 'qualified', 'proposal']) {
      expect(evaluateLead(lead({ createdAt: '2026-08-01 10:00:00', status }), config, NOW).length).toBeGreaterThan(0)
    }
  })

  it('con el SLA desactivado no se avisa de nada', () => {
    expect(evaluateLead(lead({ createdAt: '2026-08-01 10:00:00' }), { ...config, enabled: 0 }, NOW)).toHaveLength(0)
  })
})

describe('SLA — resolución automática', () => {
  it('una alerta deja de aplicar cuando desaparece su motivo', () => {
    const sinResponder = lead({ createdAt: '2026-09-22 09:00:00' })
    expect(alertStillApplies('unanswered', sinResponder, config, NOW)).toBe(true)

    const respondido = { ...sinResponder, firstResponseAt: '2026-09-22 09:30:00' }
    expect(alertStillApplies('unanswered', respondido, config, NOW)).toBe(false)
  })

  it('el motivo del cierre se explica en palabras', () => {
    expect(resolutionReason('unanswered', lead({ firstResponseAt: '2026-09-22 09:30:00' }))).toBe('se respondió al lead')
    expect(resolutionReason('qualified_without_next_action', lead({ firstAppointmentAt: '2026-09-25 17:00:00' }))).toBe(
      'se concertó una cita',
    )
    expect(resolutionReason('stale', lead({ lastContactAt: '2026-09-21 10:00:00' }))).toBe('hubo contacto con el cliente')
  })
})

describe('SLA — métricas', () => {
  const leads: SlaLead[] = [
    lead({ id: 1, createdAt: '2026-09-22 10:00:00', firstResponseAt: '2026-09-22 10:10:00' }), // 10 min
    lead({ id: 2, createdAt: '2026-09-22 10:00:00', firstResponseAt: '2026-09-22 10:30:00' }), // 30 min
    lead({ id: 3, createdAt: '2026-09-22 10:00:00', firstResponseAt: '2026-09-22 14:00:00' }), // 240 min
    lead({ id: 4, createdAt: '2026-09-22 10:00:00' }), // sin medir
  ]

  it('sólo cuenta los leads que SÍ se pudieron medir', () => {
    // Contar el no medido como cero bajaría la mediana y haría creer que se
    // responde más rápido de lo que se responde.
    const m = responseMetrics(leads, config)
    expect(m.measured).toBe(3)
    expect(m.total).toBe(4)
  })

  it('usa la mediana, que un solo caso extremo no desplaza', () => {
    // La media de 10/30/240 es 93 min y pintaría un incumplimiento general.
    // La mediana, 30, dice la verdad: la mayoría se atiende dentro de plazo.
    expect(responseMetrics(leads, config).medianResponseMinutes).toBe(30)
  })

  it('separa los que cumplieron de los que no', () => {
    const m = responseMetrics(leads, config)
    expect(m.withinTarget).toBe(2)
    expect(m.breached).toBe(1)
  })

  it('sin ningún lead medible no inventa un número', () => {
    const m = responseMetrics([lead({ id: 9 })], config)
    expect(m.medianResponseMinutes).toBeNull()
    expect(m.measured).toBe(0)
  })
})

describe('SLA — vocabulario', () => {
  it('los tres tipos de alerta de la fase existen', () => {
    expect(ALERT_KINDS).toEqual(['unanswered', 'qualified_without_next_action', 'stale'])
  })
})
