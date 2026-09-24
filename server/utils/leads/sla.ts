import { isClosedStatus } from './status'

/**
 * SLA del lead (FASE 16, migración 0071).
 *
 * Mide el ciclo real de atención y avisa cuando se incumple. Las reglas son
 * puras y viven aquí; `slaService.ts` las aplica contra la base de datos.
 *
 * La regla que atraviesa todo el archivo: **un tiempo que no se ha medido no
 * se inventa**. Si no consta cuándo se respondió a un lead, el sistema dice
 * que no consta — no rellena el hueco con `createdAt` para que la media quede
 * bonita. Una métrica de SLA construida sobre fechas inventadas es peor que no
 * tener métrica: parece que se cumple y nadie investiga.
 */

export const ALERT_KINDS = ['unanswered', 'qualified_without_next_action', 'stale'] as const
export type AlertKind = (typeof ALERT_KINDS)[number]

export const ALERT_LABELS: Record<AlertKind, string> = {
  unanswered: 'Sin atender dentro del plazo',
  qualified_without_next_action: 'Cualificado y sin próxima acción',
  stale: 'Sin contacto desde hace demasiado',
}

export interface SlaConfig {
  enabled: number
  firstResponseMinutes: number
  staleDays: number
  businessHoursOnly: number
}

/** Lo que el evaluador necesita saber de un lead. */
export interface SlaLead {
  id: number
  createdAt: string
  /**
   * El `status` del lead (new|contacted|qualified|proposal|won|lost). El cierre
   * vive aquí: en este modelo no existe una columna `outcome` aparte, y tener
   * dos habría permitido un lead "ganado" y "vivo" a la vez.
   */
  status: string
  stage?: string | null
  agentId?: number | null
  /** Primer intento de contacto (llamada, email…), haya respondido alguien o no. */
  firstContactAt?: string | null
  /** Primera interacción humana real. Existe desde la migración 0069. */
  firstResponseAt?: string | null
  lastContactAt?: string | null
  qualifiedAt?: string | null
  firstAppointmentAt?: string | null
  nextActionAt?: string | null
}

export interface SlaAlert {
  kind: AlertKind
  leadId: number
  commercialId: number | null
  detail: string
}

function parseTs(value: string | null | undefined): number | null {
  if (!value) return null
  // Las fechas se guardan como 'YYYY-MM-DD HH:MM:SS' en UTC.
  const iso = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : null
}

function minutesBetween(from: number, to: number): number {
  return Math.floor((to - from) / 60_000)
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h`
  const days = Math.floor(hours / 24)
  return `${days} día${days === 1 ? '' : 's'}`
}


/**
 * Qué alertas corresponden a este lead ahora mismo.
 *
 * Devuelve la lista completa de las que aplican; quien llame decide si abrirlas
 * o cerrarlas. No decide por su cuenta si notificar: eso depende de la
 * configuración de la agencia y de si ya se avisó antes.
 */
export function evaluateLead(lead: SlaLead, config: SlaConfig, nowMs: number): SlaAlert[] {
  if (!config.enabled) return []
  // Un lead cerrado no incumple plazos: seguir avisando de él convertiría el
  // panel de alertas en ruido que nadie mira.
  if (isClosedStatus(lead.status)) return []

  const alerts: SlaAlert[] = []
  const created = parseTs(lead.createdAt)

  // 1) Entró y nadie lo ha atendido dentro del plazo.
  //
  // Cuenta la RESPUESTA humana, no el intento: haber llamado sin que nadie
  // cogiera el teléfono no es haber atendido al cliente. El intento se guarda
  // aparte (firstContactAt) y se enseña en el detalle, porque cambia mucho la
  // conversación con el comercial.
  if (created && !lead.firstResponseAt) {
    const waited = minutesBetween(created, nowMs)
    if (waited >= config.firstResponseMinutes) {
      const tried = lead.firstContactAt ? ', ya se intentó contactar' : ', sin ningún intento de contacto'
      alerts.push({
        kind: 'unanswered',
        leadId: lead.id,
        commercialId: lead.agentId ?? null,
        detail: `${formatDuration(waited)} sin respuesta (plazo: ${formatDuration(config.firstResponseMinutes)})${tried}`,
      })
    }
  }

  // 2) Está cualificado pero nadie ha decidido qué pasa después.
  //
  // Es el agujero por el que se escapan los leads buenos: alguien confirma que
  // el cliente interesa y ahí se queda.
  if (lead.qualifiedAt && !lead.nextActionAt && !lead.firstAppointmentAt) {
    alerts.push({
      kind: 'qualified_without_next_action',
      leadId: lead.id,
      commercialId: lead.agentId ?? null,
      detail: 'cualificado, sin próxima acción ni cita',
    })
  }

  // 3) Lleva demasiado sin ningún contacto.
  //
  // Se mide desde el último contacto real, y si nunca hubo ninguno, desde que
  // entró — que es justamente el caso más grave.
  const lastTouch = parseTs(lead.lastContactAt) ?? parseTs(lead.firstResponseAt) ?? created
  if (lastTouch) {
    const days = Math.floor((nowMs - lastTouch) / 86_400_000)
    if (days >= config.staleDays) {
      alerts.push({
        kind: 'stale',
        leadId: lead.id,
        commercialId: lead.agentId ?? null,
        detail: lead.lastContactAt
          ? `${days} días desde el último contacto (límite: ${config.staleDays})`
          : `${days} días sin ningún contacto desde que entró`,
      })
    }
  }

  return alerts
}

/**
 * ¿Sigue vigente una alerta abierta?
 *
 * Se resuelven solas cuando desaparece el motivo. Sin esto, el panel se
 * llenaría de avisos de cosas ya atendidas y la gente dejaría de mirarlo —
 * que es la forma habitual en que un sistema de alertas deja de servir.
 */
export function alertStillApplies(kind: AlertKind, lead: SlaLead, config: SlaConfig, nowMs: number): boolean {
  return evaluateLead(lead, config, nowMs).some((a) => a.kind === kind)
}

/** Por qué se cerró una alerta, en palabras, para el historial. */
export function resolutionReason(kind: AlertKind, lead: SlaLead): string {
  if (kind === 'unanswered') return lead.firstResponseAt ? 'se respondió al lead' : 'la oportunidad se cerró'
  if (kind === 'qualified_without_next_action') {
    if (lead.firstAppointmentAt) return 'se concertó una cita'
    if (lead.nextActionAt) return 'se fijó la próxima acción'
    return 'la oportunidad se cerró'
  }
  return lead.lastContactAt ? 'hubo contacto con el cliente' : 'la oportunidad se cerró'
}

export interface SlaMetrics {
  /** Cuántos leads se pudieron medir, frente al total. Sin esto, una media sobre 3 de 67 leads parecería representativa. */
  measured: number
  total: number
  medianResponseMinutes: number | null
  withinTarget: number
  breached: number
}

/**
 * Métricas del periodo. Sólo entran los leads que TIENEN el dato medido: los
 * que no se pudieron medir se cuentan aparte en `measured` en lugar de
 * rellenarse con un cero que bajaría la media artificialmente.
 *
 * Se usa la mediana y no la media porque un solo lead olvidado tres semanas
 * desplaza la media lo suficiente como para esconder que el resto se atiende
 * en diez minutos.
 */
export function responseMetrics(leads: SlaLead[], config: SlaConfig): SlaMetrics {
  const durations: number[] = []
  let withinTarget = 0
  let breached = 0

  for (const lead of leads) {
    const created = parseTs(lead.createdAt)
    const responded = parseTs(lead.firstResponseAt)
    if (created == null || responded == null) continue
    const minutes = Math.max(0, minutesBetween(created, responded))
    durations.push(minutes)
    if (minutes <= config.firstResponseMinutes) withinTarget++
    else breached++
  }

  durations.sort((a, b) => a - b)
  const median = durations.length
    ? durations.length % 2
      ? durations[(durations.length - 1) / 2]
      : Math.round((durations[durations.length / 2 - 1] + durations[durations.length / 2]) / 2)
    : null

  return { measured: durations.length, total: leads.length, medianResponseMinutes: median, withinTarget, breached }
}
