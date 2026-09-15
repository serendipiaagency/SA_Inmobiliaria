import { describe, expect, it } from 'vitest'
import { buildSystemStatus, TRACKED_SECRETS, type SystemStatusInput } from '../../server/utils/systemStatus'

/**
 * La pantalla de estado sólo sirve para algo si dice la verdad y si distingue
 * "falta un ajuste" de "no existe el código". Un panel que pinta las dos cosas
 * igual manda a alguien a configurar un secreto que no va a cambiar nada.
 */

const BASE: SystemStatusInput = {
  secrets: Object.fromEntries(TRACKED_SECRETS.map((s) => [s, true])),
  database: { ok: true },
  storage: { ok: true },
  channels: { total: 22, implemented: 0 },
  email: { connected: true, status: 'ok', headline: '12 envíos en los últimos 7 días, ninguno fallido.' },
  build: { commit: '2192e1b', branch: 'main', builtAt: '2026-09-15T09:33:00.000Z', source: 'github-actions' },
}

function report(overrides: Partial<SystemStatusInput> = {}) {
  return buildSystemStatus({ ...BASE, ...overrides })
}

function find(input: Partial<SystemStatusInput>, key: string) {
  return report(input).integrations.find((i) => i.key === key)!
}

describe('buildSystemStatus', () => {
  it('con todo configurado y sano, lo único que no está "ok" son los canales sin adaptador', () => {
    const r = report()
    const notOk = r.integrations.filter((i) => i.state !== 'ok').map((i) => i.key)
    expect(notOk).toEqual(['channels'])
    expect(r.summary.degraded).toBe(0)
    expect(r.summary.notConfigured).toBe(0)
  })

  it('distingue "sin configurar" de "sin implementar"', () => {
    // La distinción entera del panel: una se arregla con un ajuste y lleva
    // remedio; la otra no, y ofrecer uno sería mandar a perder la tarde.
    const sinConfigurar = find({ secrets: { ...BASE.secrets, AI_API_KEY: false } }, 'ai')
    expect(sinConfigurar.state).toBe('not-configured')
    expect(sinConfigurar.remedy).toContain('AI_API_KEY')

    const sinImplementar = find({}, 'channels')
    expect(sinImplementar.state).toBe('not-implemented')
    expect(sinImplementar.remedy).toBeNull()
  })

  it('dice qué deja de funcionar, no sólo que falta algo', () => {
    // Un semáforo sin consecuencia no se acciona. Cada fila apagada tiene que
    // explicar qué se pierde mientras tanto.
    for (const secret of TRACKED_SECRETS) {
      const r = report({ secrets: { ...BASE.secrets, [secret]: false } })
      const off = r.integrations.filter((i) => i.state === 'not-configured')
      for (const item of off) {
        expect(item.detail.length, `${secret} → ${item.key}`).toBeGreaterThan(40)
        expect(item.remedy, `${secret} → ${item.key}`).toBeTruthy()
      }
    }
  })

  it('una dependencia caída es "con problemas", no "sin configurar"', () => {
    const db = find({ database: { ok: false, error: 'D1 query failed' } }, 'database')
    expect(db.state).toBe('degraded')
    expect(db.detail).toBe('D1 query failed')
  })

  it('el email reutiliza su propio veredicto en vez de calcular uno peor', () => {
    // summarizeEmailHealth mira el historial real de envíos; aquí sólo se
    // traduce. Recalcularlo a partir de "¿hay clave?" daría un "ok" falso
    // sobre un canal que lleva una semana sin entregar nada.
    expect(find({ email: { connected: false, status: 'not-connected', headline: 'falta RESEND_API_KEY' } }, 'email').state).toBe('not-configured')
    expect(find({ email: { connected: true, status: 'down', headline: 'nada ha salido' } }, 'email').state).toBe('degraded')
    expect(find({ email: { connected: true, status: 'warning', headline: 'algunos fallos' } }, 'email').state).toBe('degraded')
    expect(find({ email: { connected: true, status: 'idle', headline: 'sin envíos' } }, 'email').state).toBe('ok')
  })

  it('lo roto manda sobre lo dormido en el titular', () => {
    const roto = report({ storage: { ok: false, error: 'R2 no responde' }, secrets: { ...BASE.secrets, AI_API_KEY: false } })
    expect(roto.headline).toContain('R2 no responde')

    const soloDormido = report({ secrets: { ...BASE.secrets, AI_API_KEY: false } })
    expect(soloDormido.headline).toContain('sin configurar')
  })

  it('sin nada que decir, no dice nada', () => {
    // Un panel que siempre tiene un titular deja de leerse.
    expect(report({ channels: { total: 22, implemented: 22 } }).headline).toBeNull()
  })

  it('no filtra el valor de ningún secreto, sólo su presencia', () => {
    // La entrada es de booleanos por diseño; esto comprueba que nada parecido
    // a una credencial puede colarse en la salida aunque alguien pase basura.
    const serialized = JSON.stringify(
      buildSystemStatus({ ...BASE, secrets: { ...BASE.secrets, RESEND_API_KEY: 're_clave_secreta_de_verdad' as unknown as boolean } }),
    )
    expect(serialized).not.toContain('re_clave_secreta_de_verdad')
  })

  it('el recuento cuadra con las filas', () => {
    const r = report({ database: { ok: false, error: 'x' }, secrets: { ...BASE.secrets, STRIPE_SECRET_KEY: false } })
    const { ok, degraded, notConfigured, notImplemented } = r.summary
    expect(ok + degraded + notConfigured + notImplemented).toBe(r.integrations.length)
  })

  it('cada integración declara grupo, etiqueta y detalle', () => {
    for (const item of report().integrations) {
      expect(item.group, item.key).toBeTruthy()
      expect(item.label, item.key).toBeTruthy()
      expect(item.detail, item.key).toBeTruthy()
    }
  })
})
