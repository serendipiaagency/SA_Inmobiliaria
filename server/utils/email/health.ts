import { MAX_EMAIL_ATTEMPTS } from './send'

/**
 * Diagnóstico del canal de email a partir de lo que ya hay en `email_log`.
 *
 * ## Por qué hace falta
 *
 * Todas las llamadas a `sendTransactionalEmail()` están envueltas en
 * `try/catch` a propósito: un email que no sale no puede tumbar la captura de
 * un lead, la aceptación de un contrato ni un webhook de pago. Eso está bien y
 * no se toca. El problema es lo que pasaba después: el fallo quedaba anotado
 * en `email_log` y ahí se moría. Si faltaba el secreto `RESEND_API_KEY`, o si
 * Resend rechazaba todo, la plataforma seguía funcionando con normalidad
 * mientras **ningún** email salía, y la única forma de enterarse era abrir
 * /admin/emails y leer fila a fila.
 *
 * Esta función no envía nada ni cambia nada: resume las filas que ya existen
 * en un veredicto que se puede enseñar. Es pura a propósito (recibe las filas
 * y el reloj) para poder probarla sin D1 ni el runtime de Workers, igual que
 * server/utils/health.ts.
 */

/** Ventana de análisis. Coincide con lo que mira la pantalla /admin/emails. */
export const EMAIL_HEALTH_WINDOW_DAYS = 7

/**
 * A partir de aquí, una fila que sigue 'queued' ya no está esperando su
 * reintento: está atascada. Los 5 intentos de `send.ts` se agotan a los ~522
 * minutos (2+10+30+120+360), y la tarea que los repesca corre cada hora, así
 * que 12 h deja margen de sobra para no acusar en falso a una cola que
 * simplemente todavía no ha terminado.
 */
export const STUCK_AFTER_HOURS = 12

export type EmailChannelStatus = 'not-connected' | 'down' | 'warning' | 'idle' | 'ok'

/** Lo mínimo que hace falta de cada fila de `email_log`. */
export interface EmailHealthRow {
  status?: string | null
  errorMessage?: string | null
  createdAt?: string | null
}

export interface EmailChannelCounts {
  total: number
  queued: number
  sent: number
  delivered: number
  bounced: number
  complained: number
  failed: number
  /** Filas todavía en cola que ya deberían haber salido — ver STUCK_AFTER_HOURS. */
  stuck: number
}

export interface EmailChannelHealth {
  /** Si el Worker tiene configurado RESEND_API_KEY. Sin esto no sale nada. */
  connected: boolean
  status: EmailChannelStatus
  /** Frase lista para enseñar en el panel, sin adornos ni datos de clientes. */
  headline: string
  /** El último error real que devolvió Resend, tal cual, o null si no hay. */
  lastError: string | null
  counts: EmailChannelCounts
  windowDays: number
  maxAttempts: number
}

/**
 * `email_log.createdAt` se guarda como 'YYYY-MM-DD HH:MM:SS' en UTC (ver
 * `nowIso()` en send.ts). Sin la 'Z' explícita, `new Date()` lo interpretaría
 * como hora local y el cálculo de "atascado" se desviaría tantas horas como
 * tenga de offset la zona del runtime.
 */
export function parseLogTimestamp(value: string | null | undefined): number | null {
  if (!value) return null
  const ms = Date.parse(`${String(value).trim().replace(' ', 'T')}Z`)
  return Number.isNaN(ms) ? null : ms
}

export function summarizeEmailHealth(
  rows: EmailHealthRow[],
  options: { connected: boolean; now?: number },
): EmailChannelHealth {
  const now = options.now ?? Date.now()
  const stuckBefore = now - STUCK_AFTER_HOURS * 3_600_000

  const counts: EmailChannelCounts = { total: 0, queued: 0, sent: 0, delivered: 0, bounced: 0, complained: 0, failed: 0, stuck: 0 }
  let lastError: string | null = null

  for (const row of rows) {
    counts.total++
    switch (String(row.status || '')) {
      case 'queued': {
        counts.queued++
        const createdAt = parseLogTimestamp(row.createdAt)
        // Sin fecha utilizable no se acusa de atasco: preferimos no avisar a
        // avisar de algo que no podemos sostener.
        if (createdAt !== null && createdAt < stuckBefore) counts.stuck++
        break
      }
      case 'sent': counts.sent++; break
      case 'delivered': counts.delivered++; break
      case 'bounced': counts.bounced++; break
      case 'complained': counts.complained++; break
      case 'failed': counts.failed++; break
    }
    // Las filas llegan de la más reciente a la más antigua, así que el primer
    // error que aparece es el último que ocurrió.
    if (lastError === null && row.errorMessage) lastError = String(row.errorMessage)
  }

  const base = { connected: options.connected, lastError, counts, windowDays: EMAIL_HEALTH_WINDOW_DAYS, maxAttempts: MAX_EMAIL_ATTEMPTS }

  if (!options.connected) {
    return {
      ...base,
      status: 'not-connected',
      headline: 'El envío de emails no está conectado: falta configurar el secreto RESEND_API_KEY en el Worker. Nada de lo que la plataforma intente enviar sale de aquí.',
    }
  }

  if (counts.total === 0) {
    return { ...base, status: 'idle', headline: `Sin envíos en los últimos ${EMAIL_HEALTH_WINDOW_DAYS} días.` }
  }

  const broken = counts.failed + counts.stuck
  if (broken > 0 && broken === counts.total) {
    return {
      ...base,
      status: 'down',
      headline: `Ninguno de los ${counts.total} emails de los últimos ${EMAIL_HEALTH_WINDOW_DAYS} días ha salido. El canal está caído, no es un fallo suelto.`,
    }
  }

  if (broken > 0) {
    const parts: string[] = []
    if (counts.failed) parts.push(`${counts.failed} ${counts.failed === 1 ? 'email ha agotado' : 'emails han agotado'} sus ${MAX_EMAIL_ATTEMPTS} intentos`)
    if (counts.stuck) parts.push(`${counts.stuck} ${counts.stuck === 1 ? 'sigue' : 'siguen'} en cola desde hace más de ${STUCK_AFTER_HOURS} h`)
    return { ...base, status: 'warning', headline: `${parts.join(' y ')} (de ${counts.total} en ${EMAIL_HEALTH_WINDOW_DAYS} días).` }
  }

  return {
    ...base,
    status: 'ok',
    headline: `${counts.total} ${counts.total === 1 ? 'envío' : 'envíos'} en los últimos ${EMAIL_HEALTH_WINDOW_DAYS} días, ninguno fallido.`,
  }
}
