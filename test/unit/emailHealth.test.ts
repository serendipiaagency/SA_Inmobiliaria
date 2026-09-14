import { describe, expect, it } from 'vitest'
import { EMAIL_HEALTH_WINDOW_DAYS, STUCK_AFTER_HOURS, parseLogTimestamp, summarizeEmailHealth, type EmailHealthRow } from '../../server/utils/email/health'
import { MAX_EMAIL_ATTEMPTS } from '../../server/utils/email/send'

/**
 * El envío de emails ya se registraba fila a fila en `email_log`, y cada
 * llamada está envuelta en `try/catch` a propósito para que un email que no
 * sale no tumbe la captura de un lead ni un webhook de pago. Lo que faltaba
 * era que alguien sumara esas filas: si faltaba RESEND_API_KEY, o si Resend
 * rechazaba todo, la plataforma seguía funcionando mientras no salía ni un
 * email y nadie se enteraba.
 *
 * Esto cubre el veredicto. No envía nada: la función es pura.
 */

const NOW = Date.parse('2026-09-14T12:00:00Z')

/** Fecha en el formato exacto en que la guarda send.ts: UTC, sin zona, con espacio. */
function isoAgo(hours: number): string {
  return new Date(NOW - hours * 3_600_000).toISOString().replace('T', ' ').slice(0, 19)
}

function rows(...specs: Array<[status: string, hoursAgo?: number, errorMessage?: string]>): EmailHealthRow[] {
  return specs.map(([status, hoursAgo = 1, errorMessage]) => ({ status, createdAt: isoAgo(hoursAgo), errorMessage: errorMessage ?? null }))
}

describe('parseLogTimestamp', () => {
  it('interpreta las fechas de email_log como UTC, no como hora local', () => {
    // Sin la 'Z' explícita, el cálculo de "atascado" se desviaría tantas horas
    // como tenga de offset la zona del runtime. Esto es lo que lo fija.
    expect(parseLogTimestamp('2026-09-14 12:00:00')).toBe(Date.parse('2026-09-14T12:00:00Z'))
  })

  it('devuelve null en vez de NaN cuando no hay fecha utilizable', () => {
    expect(parseLogTimestamp(null)).toBeNull()
    expect(parseLogTimestamp(undefined)).toBeNull()
    expect(parseLogTimestamp('')).toBeNull()
    expect(parseLogTimestamp('no es una fecha')).toBeNull()
  })
})

describe('summarizeEmailHealth', () => {
  it('sin RESEND_API_KEY lo dice con esas palabras, aunque el historial esté vacío', () => {
    const health = summarizeEmailHealth([], { connected: false, now: NOW })
    expect(health.status).toBe('not-connected')
    expect(health.connected).toBe(false)
    expect(health.headline).toContain('RESEND_API_KEY')
  })

  it('"no conectado" gana sobre cualquier otra lectura del historial', () => {
    // Un historial lleno de 'sent' antiguos no puede hacer parecer sano un
    // canal que ahora mismo no puede enviar nada.
    const health = summarizeEmailHealth(rows(['sent'], ['delivered'], ['sent']), { connected: false, now: NOW })
    expect(health.status).toBe('not-connected')
  })

  it('sin envíos en la ventana no inventa un problema', () => {
    const health = summarizeEmailHealth([], { connected: true, now: NOW })
    expect(health.status).toBe('idle')
    expect(health.headline).toContain(String(EMAIL_HEALTH_WINDOW_DAYS))
  })

  it('todo enviado o entregado es "ok"', () => {
    const health = summarizeEmailHealth(rows(['delivered'], ['sent'], ['delivered']), { connected: true, now: NOW })
    expect(health.status).toBe('ok')
    expect(health.counts).toMatchObject({ total: 3, delivered: 2, sent: 1, failed: 0, stuck: 0 })
  })

  it('un rebote o una reclamación no marcan el canal como roto — eso es el destinatario, no el envío', () => {
    const health = summarizeEmailHealth(rows(['bounced'], ['complained'], ['delivered']), { connected: true, now: NOW })
    expect(health.status).toBe('ok')
    expect(health.counts).toMatchObject({ bounced: 1, complained: 1 })
  })

  it('un fallo suelto entre envíos buenos avisa, pero no declara el canal caído', () => {
    const health = summarizeEmailHealth(rows(['failed', 3, 'Resend devolvió 422'], ['delivered'], ['sent']), { connected: true, now: NOW })
    expect(health.status).toBe('warning')
    expect(health.lastError).toBe('Resend devolvió 422')
    expect(health.headline).toContain(String(MAX_EMAIL_ATTEMPTS))
  })

  it('si no ha salido ni uno, lo llama caído en vez de "algunos fallos"', () => {
    const health = summarizeEmailHealth(rows(['failed', 2, 'Resend devolvió 401'], ['failed', 4], ['failed', 6]), { connected: true, now: NOW })
    expect(health.status).toBe('down')
    expect(health.headline).toContain('caído')
  })

  it('una cola reciente es normal: todavía le quedan reintentos', () => {
    const health = summarizeEmailHealth(rows(['queued', 1], ['queued', STUCK_AFTER_HOURS - 1]), { connected: true, now: NOW })
    expect(health.status).toBe('ok')
    expect(health.counts.queued).toBe(2)
    expect(health.counts.stuck).toBe(0)
  })

  it('una cola que lleva más de la ventana de reintentos sí está atascada', () => {
    const health = summarizeEmailHealth(rows(['queued', STUCK_AFTER_HOURS + 1], ['delivered']), { connected: true, now: NOW })
    expect(health.status).toBe('warning')
    expect(health.counts.stuck).toBe(1)
    expect(health.headline).toContain(String(STUCK_AFTER_HOURS))
  })

  it('una fila en cola sin fecha utilizable no se acusa de atasco', () => {
    // Preferimos no avisar a avisar de algo que no podemos sostener.
    const health = summarizeEmailHealth([{ status: 'queued', createdAt: null, errorMessage: null }], { connected: true, now: NOW })
    expect(health.counts.stuck).toBe(0)
    expect(health.status).toBe('ok')
  })

  it('el último error es el de la fila más reciente, no el primero que aparezca en la tabla', () => {
    // El endpoint las pide de la más nueva a la más antigua; el resumen tiene
    // que respetar ese orden o enseñaría un error ya resuelto.
    const health = summarizeEmailHealth(
      [
        { status: 'failed', createdAt: isoAgo(1), errorMessage: 'el de ahora' },
        { status: 'failed', createdAt: isoAgo(50), errorMessage: 'el de la semana pasada' },
      ],
      { connected: true, now: NOW },
    )
    expect(health.lastError).toBe('el de ahora')
  })

  it('no filtra el secreto ni ningún dato de cliente en el veredicto', () => {
    const health = summarizeEmailHealth(rows(['failed', 2, 'Invalid API key']), { connected: true, now: NOW })
    // `connected` es un booleano, nunca el valor de la clave, y el resumen no
    // arrastra destinatarios ni asuntos.
    expect(typeof health.connected).toBe('boolean')
    expect(Object.keys(health).sort()).toEqual(['connected', 'counts', 'headline', 'lastError', 'maxAttempts', 'status', 'windowDays'])
  })

  it('cuenta estados desconocidos en el total sin romperse ni inventarles una categoría', () => {
    const health = summarizeEmailHealth(rows(['un_estado_nuevo'], ['delivered']), { connected: true, now: NOW })
    expect(health.counts.total).toBe(2)
    expect(health.counts.delivered).toBe(1)
    expect(health.status).toBe('ok')
  })
})
