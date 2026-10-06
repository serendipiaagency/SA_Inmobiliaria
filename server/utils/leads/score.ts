import { and, desc, eq, inArray, isNotNull, isNull, lte, ne, or } from 'drizzle-orm'
import { createError } from 'h3'
import { schema, now } from '../db'

/**
 * Lead Score explicable (FASE 32, migración 0083).
 *
 * Sustituye al "bump" antiguo (upsertLead sumaba 10/25/30 puntos cada vez
 * que la persona volvía a escribir, sin explicar nada) por reglas
 * deterministas sobre señales REALES, cada una con su fuente:
 *
 *   budget_validated     BuyerRequirement activa con budget_validated = 1
 *   purchase_horizon     BuyerRequirement: desired_date dentro de N días, o urgency high/urgent
 *   responded_recently   mensaje de WhatsApp entrante (o llamada entrante contestada, o —FASE 29, email
 *                        entrante— respuesta por email a un hilo web) en las últimas N horas
 *   viewing_requested    una visita a inmueble del lead que no está cancelada
 *   financing_validated  BuyerRequirement: mortgage_status estructurado (aprobada, preaprobada, sin hipoteca)
 *   opened_listings      fichas enviadas con apertura confirmada: lectura de WhatsApp confirmada por el
 *                        proveedor, o (núcleo N8a) apertura del enlace personal enviado por email o chat web
 *   no_response          penalización (desactivada por defecto): N días sin respuesta tras nuestro último mensaje
 *
 * Lo que NO hace, a propósito:
 *   - Nunca mira `leads.updatedAt` ni infiere nada del texto libre (§61/§59).
 *   - "Abrió fichas" sólo cuenta aperturas verificables de una ficha que se
 *     le ENVIÓ: la lectura confirmada por WhatsApp, o (núcleo N8a) que abra
 *     SU enlace personal (property_share_links, comms/shareLinks.ts). La web
 *     no asocia sus visitas anónimas a un lead (sólo a una cookie) y
 *     enlazarlas sería perfilado sin consentimiento — no se hace (§64).
 *   - No es el Match Score (compatibilidad necesidad ↔ inmueble, matching/).
 *   - No cambia el routing ni sustituye al SLA (§75/§76).
 *
 * Recibe `db` (no `event`), igual que leads/sla.ts: el cron horario
 * server/tasks/leads/sla-check.ts también recalcula los que caducan.
 */

export const LEAD_SCORE_ENGINE_VERSION = 1
export const LEAD_SCORE_MIN = 0
export const LEAD_SCORE_MAX = 100

export const LEAD_SCORE_CRITERIA = [
  'budget_validated',
  'purchase_horizon',
  'responded_recently',
  'viewing_requested',
  'financing_validated',
  'opened_listings',
  'no_response',
] as const
export type LeadScoreCriterion = (typeof LEAD_SCORE_CRITERIA)[number]

export const FINANCING_STATUSES = ['approved', 'preapproved', 'not_needed', 'requested', 'required'] as const

export interface LeadScoreRule {
  criterion: LeadScoreCriterion
  points: number
  enabled: boolean
  priority: number
  config: Record<string, any>
}

interface CriterionMeta {
  label: string
  /** De dónde sale la señal — se enseña en la configuración, para que nadie tenga que adivinarlo. */
  source: string
  defaults: Omit<LeadScoreRule, 'criterion'>
}

export const LEAD_SCORE_CATALOG: Record<LeadScoreCriterion, CriterionMeta> = {
  budget_validated: {
    label: 'Presupuesto validado',
    source: 'Necesidad de compra activa con el presupuesto validado por una persona del equipo.',
    defaults: { points: 20, enabled: true, priority: 10, config: {} },
  },
  purchase_horizon: {
    label: 'Compra prevista pronto',
    source: 'Necesidad de compra activa con fecha deseada dentro del plazo, o urgencia alta/urgente.',
    defaults: { points: 15, enabled: true, priority: 20, config: { withinDays: 90 } },
  },
  responded_recently: {
    label: 'Respondió recientemente',
    source: 'Mensaje de WhatsApp entrante, llamada entrante contestada o respuesta por email a un hilo de Comunicaciones, dentro de la ventana.',
    defaults: { points: 15, enabled: true, priority: 30, config: { withinHours: 24 } },
  },
  viewing_requested: {
    label: 'Visita solicitada',
    source: 'Una visita a inmueble del lead que no está cancelada.',
    defaults: { points: 20, enabled: true, priority: 40, config: {} },
  },
  financing_validated: {
    label: 'Financiación validada',
    source: 'Estado de la hipoteca en la necesidad de compra (nunca se deduce de una conversación).',
    defaults: { points: 10, enabled: true, priority: 50, config: { statuses: ['approved', 'preapproved', 'not_needed'] } },
  },
  opened_listings: {
    label: 'Abrió fichas enviadas',
    source: 'Fichas enviadas con apertura confirmada (distintas): lectura confirmada por WhatsApp, o apertura de su enlace personal enviado por email o por el chat web.',
    defaults: { points: 4, enabled: true, priority: 60, config: { min: 3 } },
  },
  no_response: {
    label: 'Sin respuesta',
    source: 'Días sin ninguna entrada real desde nuestro último mensaje saliente.',
    defaults: { points: -10, enabled: false, priority: 70, config: { days: 14 } },
  },
}

export function defaultLeadScoreRules(): LeadScoreRule[] {
  return LEAD_SCORE_CRITERIA.map((criterion) => ({ criterion, ...LEAD_SCORE_CATALOG[criterion].defaults, config: { ...LEAD_SCORE_CATALOG[criterion].defaults.config } }))
}

// --- señales ------------------------------------------------------------------

/** Todo lo que el cálculo necesita, ya leído — `evaluateLeadScore` es pura sobre esto. */
export interface LeadScoreSignals {
  requirements: Array<{ id: number; budgetValidated: boolean; desiredDate: string | null; urgency: string | null; mortgageStatus: string | null }>
  lastInboundAt: string | null
  lastInboundKind: 'whatsapp' | 'call' | 'email' | null
  lastOutboundAt: string | null
  viewings: Array<{ id: number; status: string; scheduledAt: string }>
  /** Fichas DISTINTAS enviadas con apertura confirmada (WhatsApp leído ∪ enlace personal abierto). */
  readPropertyShares: number
  /** De ellas, cuántas se abrieron por el enlace personal (email o chat web). Sólo para el desglose. */
  openedLinkShares?: number
}

export interface LeadScoreBreakdownItem {
  criterion: LeadScoreCriterion
  label: string
  points: number
  applied: boolean
  /** Por qué sí o por qué no, con el dato real (nunca un texto genérico). */
  detail: string
}

export interface LeadScoreResult {
  score: number
  breakdown: LeadScoreBreakdownItem[]
  /** Primera vez que una señal temporal cambiará por sí sola (null = ninguna). */
  expiresAt: string | null
}

/** Timestamps del proyecto: 'YYYY-MM-DD HH:MM:SS' (UTC, now()) o ISO; fechas 'YYYY-MM-DD'. */
function toMs(raw: string | null | undefined): number | null {
  if (!raw) return null
  const s = String(raw)
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00Z` : s.includes('T') ? (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`) : `${s.replace(' ', 'T')}Z`
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
}
function toDbTs(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19)
}
const DAY = 86_400_000
const HOUR = 3_600_000

/**
 * El cálculo en sí: puro y determinista (§69) — mismas señales + mismas
 * reglas + mismo instante = mismo resultado. Rango 0-100 (§65).
 */
export function evaluateLeadScore(signals: LeadScoreSignals, rules: LeadScoreRule[], nowMs: number): LeadScoreResult {
  const breakdown: LeadScoreBreakdownItem[] = []
  const expiries: number[] = []
  const active = [...rules].filter((r) => r.enabled).sort((a, b) => a.priority - b.priority)

  for (const rule of active) {
    const label = LEAD_SCORE_CATALOG[rule.criterion].label
    let applied = false
    let detail = ''
    switch (rule.criterion) {
      case 'budget_validated': {
        const r = signals.requirements.find((x) => x.budgetValidated)
        applied = Boolean(r)
        detail = r ? `Presupuesto validado en la necesidad #${r.id}.` : 'Ninguna necesidad activa con el presupuesto validado.'
        break
      }
      case 'purchase_horizon': {
        const withinDays = Number(rule.config.withinDays) || 90
        const horizonEnd = nowMs + withinDays * DAY
        const byUrgency = signals.requirements.find((x) => x.urgency === 'high' || x.urgency === 'urgent')
        const byDate = signals.requirements.find((x) => {
          const d = toMs(x.desiredDate)
          return d !== null && d + DAY > nowMs && d <= horizonEnd
        })
        if (byDate) {
          applied = true
          detail = `Fecha deseada ${byDate.desiredDate} (dentro de ${withinDays} días), necesidad #${byDate.id}.`
          expiries.push(toMs(byDate.desiredDate)! + DAY)
        } else if (byUrgency) {
          applied = true
          detail = `Urgencia «${byUrgency.urgency}» en la necesidad #${byUrgency.id}.`
        } else {
          detail = `Sin fecha deseada en los próximos ${withinDays} días ni urgencia alta.`
          for (const x of signals.requirements) {
            const d = toMs(x.desiredDate)
            if (d !== null && d > horizonEnd) expiries.push(d - withinDays * DAY)
          }
        }
        break
      }
      case 'responded_recently': {
        const withinHours = Number(rule.config.withinHours) || 24
        const last = toMs(signals.lastInboundAt)
        applied = last !== null && nowMs - last <= withinHours * HOUR
        if (applied) {
          detail = `${signals.lastInboundKind === 'call' ? 'Llamada entrante contestada' : signals.lastInboundKind === 'email' ? 'Respuesta por email' : 'Mensaje de WhatsApp entrante'} el ${signals.lastInboundAt} (UTC).`
          expiries.push(last! + withinHours * HOUR)
        } else {
          detail = last !== null ? `Última entrada real el ${signals.lastInboundAt} (UTC), fuera de las últimas ${withinHours} h.` : 'Ningún mensaje ni llamada entrante registrados.'
        }
        break
      }
      case 'viewing_requested': {
        const v = signals.viewings.find((x) => x.status !== 'cancelled')
        applied = Boolean(v)
        detail = v ? `Visita #${v.id} (${v.status}) el ${v.scheduledAt}.` : 'Ninguna visita a inmueble activa.'
        break
      }
      case 'financing_validated': {
        const statuses: string[] = Array.isArray(rule.config.statuses) ? rule.config.statuses : []
        const r = signals.requirements.find((x) => x.mortgageStatus && statuses.includes(x.mortgageStatus))
        applied = Boolean(r)
        detail = r ? `Hipoteca «${r.mortgageStatus}» en la necesidad #${r.id}.` : 'Sin financiación validada en ninguna necesidad activa.'
        break
      }
      case 'opened_listings': {
        const min = Number(rule.config.min) || 3
        applied = signals.readPropertyShares >= min
        const viaLink = signals.openedLinkShares ?? 0
        detail = viaLink
          ? `${signals.readPropertyShares} ficha(s) enviada(s) con apertura confirmada, ${viaLink} por su enlace personal (mínimo ${min}).`
          : `${signals.readPropertyShares} ficha(s) enviada(s) por WhatsApp con lectura confirmada (mínimo ${min}).`
        break
      }
      case 'no_response': {
        const days = Number(rule.config.days) || 14
        const out = toMs(signals.lastOutboundAt)
        const inn = toMs(signals.lastInboundAt)
        const waiting = out !== null && (inn === null || inn < out)
        applied = waiting && nowMs - out! >= days * DAY
        if (applied) detail = `Último mensaje nuestro el ${signals.lastOutboundAt} (UTC) y ninguna respuesta desde entonces.`
        else if (waiting) {
          detail = `Esperando respuesta desde el ${signals.lastOutboundAt} (UTC), menos de ${days} días.`
          expiries.push(out! + days * DAY)
        } else detail = 'Sin mensajes nuestros pendientes de respuesta.'
        break
      }
    }
    breakdown.push({ criterion: rule.criterion, label, points: rule.points, applied, detail })
  }

  const raw = breakdown.filter((b) => b.applied).reduce((sum, b) => sum + b.points, 0)
  const score = Math.max(LEAD_SCORE_MIN, Math.min(LEAD_SCORE_MAX, raw))
  const future = expiries.filter((ms) => ms > nowMs)
  return { score, breakdown, expiresAt: future.length ? toDbTs(Math.min(...future)) : null }
}

/** Lee de las tablas reales las señales de un lead. Siempre acotado por organización. */
export async function collectLeadScoreSignals(db: any, orgId: number, lead: { id: number; contactId: number | null }): Promise<LeadScoreSignals> {
  const requirements = lead.contactId
    ? (
        await db
          .select({
            id: schema.buyerRequirements.id,
            budgetValidated: schema.buyerRequirements.budgetValidated,
            desiredDate: schema.buyerRequirements.desiredDate,
            urgency: schema.buyerRequirements.urgency,
            mortgageStatus: schema.buyerRequirements.mortgageStatus,
          })
          .from(schema.buyerRequirements)
          .where(and(eq(schema.buyerRequirements.organizationId, orgId), eq(schema.buyerRequirements.contactId, lead.contactId), eq(schema.buyerRequirements.status, 'active')))
          .orderBy(schema.buyerRequirements.id)
      ).map((r: any) => ({ ...r, budgetValidated: Boolean(r.budgetValidated) }))
    : []

  const viewings = await db
    .select({ id: schema.visits.id, status: schema.visits.status, scheduledAt: schema.visits.scheduledAt })
    .from(schema.visits)
    .where(and(eq(schema.visits.organizationId, orgId), eq(schema.visits.leadId, lead.id), eq(schema.visits.type, 'property_viewing'), ne(schema.visits.status, 'cancelled'), isNull(schema.visits.deletedAt)))
    .orderBy(schema.visits.id)
    .limit(5)

  const commsContactIds: number[] = (
    await db
      .select({ id: schema.commsContacts.id })
      .from(schema.commsContacts)
      .where(and(eq(schema.commsContacts.organizationId, orgId), eq(schema.commsContacts.leadId, lead.id)))
  ).map((r: any) => r.id)

  let lastInboundAt: string | null = null
  let lastInboundKind: 'whatsapp' | 'call' | 'email' | null = null
  let lastOutboundAt: string | null = null
  const openedShares = new Set<string>()
  if (commsContactIds.length) {
    const conversationIds: number[] = (
      await db
        .select({ id: schema.commsConversations.id })
        .from(schema.commsConversations)
        .where(and(eq(schema.commsConversations.organizationId, orgId), inArray(schema.commsConversations.contactId, commsContactIds)))
    ).map((r: any) => r.id)
    if (conversationIds.length) {
      const [inbound] = await db
        .select({ createdAt: schema.commsMessages.createdAt })
        .from(schema.commsMessages)
        .where(and(eq(schema.commsMessages.organizationId, orgId), inArray(schema.commsMessages.conversationId, conversationIds), eq(schema.commsMessages.direction, 'in')))
        .orderBy(desc(schema.commsMessages.createdAt))
        .limit(1)
      if (inbound) {
        lastInboundAt = inbound.createdAt
        lastInboundKind = 'whatsapp'
      }
      const [outbound] = await db
        .select({ createdAt: schema.commsMessages.createdAt })
        .from(schema.commsMessages)
        .where(and(eq(schema.commsMessages.organizationId, orgId), inArray(schema.commsMessages.conversationId, conversationIds), eq(schema.commsMessages.direction, 'out'), ne(schema.commsMessages.status, 'failed')))
        .orderBy(desc(schema.commsMessages.createdAt))
        .limit(1)
      lastOutboundAt = outbound?.createdAt ?? null
      const reads = await db
        .select({ propertyId: schema.commsMessages.propertyId, propertyKind: schema.commsMessages.propertyKind })
        .from(schema.commsMessages)
        .where(
          and(
            eq(schema.commsMessages.organizationId, orgId),
            inArray(schema.commsMessages.conversationId, conversationIds),
            eq(schema.commsMessages.direction, 'out'),
            eq(schema.commsMessages.type, 'property_share'),
            isNotNull(schema.commsMessages.readAt),
          ),
        )
      for (const r of reads) openedShares.add(`${r.propertyKind === 'agent' ? 'agent' : 'developer'}:${r.propertyId}`)
    }
    // Llamadas entrantes contestadas: las de WhatsApp Calling traen
    // answered_at del proveedor; las anotadas a mano con un resultado de
    // "contestada" quedan en status = 'completed' (comms/calls.ts#logManualCall).
    const calls = await db
      .select({ answeredAt: schema.commsCalls.answeredAt, startedAt: schema.commsCalls.startedAt })
      .from(schema.commsCalls)
      .where(
        and(
          eq(schema.commsCalls.organizationId, orgId),
          inArray(schema.commsCalls.contactId, commsContactIds),
          eq(schema.commsCalls.direction, 'inbound'),
          or(isNotNull(schema.commsCalls.answeredAt), eq(schema.commsCalls.status, 'completed')),
        ),
      )
      .orderBy(desc(schema.commsCalls.id))
      .limit(5)
    for (const c of calls) {
      const at = c.answeredAt ?? c.startedAt
      if (at && (toMs(at) ?? 0) > (toMs(lastInboundAt) ?? -1)) {
        lastInboundAt = at
        lastInboundKind = 'call'
      }
    }
  }

  // FASE 29 — email entrante: la respuesta del cliente por email a un hilo web
  // de ESTE lead o de su Contact (comms_web_messages `in` por `email`). Sólo
  // email: un mensaje del chat web no ha contado nunca como «respondió» y no
  // se cambia aquí de rebote.
  const W = schema.commsWebThreads
  const WM = schema.commsWebMessages
  const threadOwners = [eq(W.leadId, lead.id), ...(lead.contactId ? [eq(W.contactId, lead.contactId)] : [])]
  const [emailReply] = await db
    .select({ createdAt: WM.createdAt })
    .from(WM)
    .innerJoin(W, eq(W.id, WM.threadId))
    .where(and(eq(WM.organizationId, orgId), eq(W.organizationId, orgId), eq(WM.direction, 'in'), eq(WM.via, 'email'), or(...threadOwners)))
    .orderBy(desc(WM.createdAt))
    .limit(1)
  if (emailReply && (toMs(emailReply.createdAt) ?? 0) > (toMs(lastInboundAt) ?? -1)) {
    lastInboundAt = emailReply.createdAt
    lastInboundKind = 'email'
  }

  // Núcleo N8a — aperturas de su enlace personal (email o chat web): sólo las
  // de un enlace enviado a ESTE lead o a su Contact, y sólo si se abrió de verdad.
  const L = schema.propertyShareLinks
  const owners = [eq(L.leadId, lead.id), ...(lead.contactId ? [eq(L.contactId, lead.contactId)] : [])]
  const linkOpens = await db
    .select({ propertyId: L.propertyId, propertyKind: L.propertyKind })
    .from(L)
    .where(and(eq(L.organizationId, orgId), isNotNull(L.firstOpenedAt), or(...owners)))
  const viaLink = new Set<string>()
  for (const r of linkOpens) {
    const key = `${r.propertyKind === 'agent' ? 'agent' : 'developer'}:${r.propertyId}`
    viaLink.add(key)
    openedShares.add(key)
  }

  return { requirements, lastInboundAt, lastInboundKind, lastOutboundAt, viewings, readPropertyShares: openedShares.size, openedLinkShares: viaLink.size }
}

// --- reglas por agencia --------------------------------------------------------

/** Reglas efectivas: las por defecto, con lo que la agencia haya cambiado encima (§67). */
export async function getLeadScoreRules(db: any, orgId: number): Promise<LeadScoreRule[]> {
  const rows = await db.select().from(schema.leadScoreRules).where(eq(schema.leadScoreRules.organizationId, orgId))
  const byCriterion = new Map<string, any>(rows.map((r: any) => [r.criterion, r]))
  return defaultLeadScoreRules().map((d) => {
    const row = byCriterion.get(d.criterion)
    if (!row) return d
    let config: Record<string, any>
    try {
      config = { ...d.config, ...(row.configJson ? JSON.parse(row.configJson) : {}) }
    } catch {
      config = d.config
    }
    return { criterion: d.criterion, points: row.points, enabled: Boolean(row.enabled), priority: row.priority, config }
  })
}

function invalid(message: string): never {
  throw createError({ statusCode: 422, statusMessage: message })
}

/** Valida y normaliza la configuración de un criterio — nunca se guarda una regla que el motor no sepa evaluar. */
function normalizeConfig(criterion: LeadScoreCriterion, raw: any): Record<string, any> {
  const cfg = raw && typeof raw === 'object' ? raw : {}
  const int = (v: any, min: number, max: number, name: string) => {
    const n = Number(v)
    if (!Number.isInteger(n) || n < min || n > max) invalid(`${LEAD_SCORE_CATALOG[criterion].label}: ${name} debe ser un entero entre ${min} y ${max}.`)
    return n
  }
  switch (criterion) {
    case 'purchase_horizon':
      return { withinDays: int(cfg.withinDays ?? 90, 1, 365, 'el plazo en días') }
    case 'responded_recently':
      return { withinHours: int(cfg.withinHours ?? 24, 1, 168, 'la ventana en horas') }
    case 'opened_listings':
      return { min: int(cfg.min ?? 3, 1, 50, 'el mínimo de fichas') }
    case 'no_response':
      return { days: int(cfg.days ?? 14, 1, 365, 'los días') }
    case 'financing_validated': {
      const statuses = Array.isArray(cfg.statuses) ? cfg.statuses.map(String) : ['approved', 'preapproved', 'not_needed']
      if (!statuses.length || statuses.some((s: string) => !(FINANCING_STATUSES as readonly string[]).includes(s))) invalid('Financiación validada: estados de hipoteca no válidos.')
      return { statuses: [...new Set(statuses)] }
    }
    default:
      return {}
  }
}

export async function saveLeadScoreRules(db: any, orgId: number, input: Array<Partial<LeadScoreRule> & { criterion: string }>): Promise<LeadScoreRule[]> {
  if (!Array.isArray(input)) invalid('Envía la lista de reglas.')
  const current = await getLeadScoreRules(db, orgId)
  const nowTs = now()
  for (const item of input) {
    if (!(LEAD_SCORE_CRITERIA as readonly string[]).includes(item?.criterion)) invalid(`Criterio desconocido: ${item?.criterion}`)
    const criterion = item.criterion as LeadScoreCriterion
    const base = current.find((r) => r.criterion === criterion)!
    const points = item.points === undefined ? base.points : Number(item.points)
    if (!Number.isInteger(points) || points < -100 || points > 100) invalid(`${LEAD_SCORE_CATALOG[criterion].label}: los puntos deben ser un entero entre -100 y 100.`)
    const priority = item.priority === undefined ? base.priority : Number(item.priority)
    if (!Number.isInteger(priority) || priority < 0 || priority > 1000) invalid(`${LEAD_SCORE_CATALOG[criterion].label}: prioridad no válida.`)
    const enabled = item.enabled === undefined ? base.enabled : Boolean(item.enabled)
    const config = normalizeConfig(criterion, item.config === undefined ? base.config : item.config)
    const values = { points, enabled: enabled ? 1 : 0, priority, configJson: JSON.stringify(config), updatedAt: nowTs }
    await db
      .insert(schema.leadScoreRules)
      .values({ organizationId: orgId, criterion, ...values, createdAt: nowTs })
      .onConflictDoUpdate({ target: [schema.leadScoreRules.organizationId, schema.leadScoreRules.criterion], set: values })
  }
  return getLeadScoreRules(db, orgId)
}

// --- recálculo y persistencia ---------------------------------------------------

export type LeadScoreReason = 'created' | 'signal' | 'rules' | 'manual' | 'expiry'

function appliedKey(breakdown: LeadScoreBreakdownItem[]): string {
  return breakdown
    .filter((b) => b.applied)
    .map((b) => `${b.criterion}:${b.points}`)
    .join('|')
}

/**
 * Recalcula y guarda el score de un lead. Escribe una fila de historial sólo
 * si cambia la puntuación o el conjunto de criterios que la componen (§68),
 * con las reglas efectivas usadas. Nunca toca `updatedAt` del lead: que se
 * recalcule una puntuación no es actividad de nadie.
 */
export async function recomputeLeadScore(db: any, orgId: number, leadId: number, reason: LeadScoreReason, nowMs: number = Date.now()): Promise<(LeadScoreResult & { changed: boolean }) | null> {
  const [lead] = await db
    .select({ id: schema.leads.id, contactId: schema.leads.contactId, score: schema.leads.score, scoreBreakdownJson: schema.leads.scoreBreakdownJson, scoreComputedAt: schema.leads.scoreComputedAt })
    .from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, orgId)))
    .limit(1)
  if (!lead) return null

  const rules = await getLeadScoreRules(db, orgId)
  const signals = await collectLeadScoreSignals(db, orgId, lead)
  const result = evaluateLeadScore(signals, rules, nowMs)

  let previous: LeadScoreBreakdownItem[]
  try {
    previous = lead.scoreBreakdownJson ? JSON.parse(lead.scoreBreakdownJson) : []
  } catch {
    previous = []
  }
  const changed = !lead.scoreComputedAt || lead.score !== result.score || appliedKey(previous) !== appliedKey(result.breakdown)
  const computedAt = toDbTs(nowMs)

  await db
    .update(schema.leads)
    .set({ score: result.score, scoreBreakdownJson: JSON.stringify(result.breakdown), scoreComputedAt: computedAt, scoreExpiresAt: result.expiresAt })
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, orgId)))

  if (changed) {
    await db.insert(schema.leadScoreSnapshots).values({
      organizationId: orgId,
      leadId,
      score: result.score,
      breakdownJson: JSON.stringify(result.breakdown),
      rulesJson: JSON.stringify(rules),
      engineVersion: LEAD_SCORE_ENGINE_VERSION,
      reason,
      createdAt: computedAt,
    })
  }
  return { ...result, changed }
}

/**
 * Para Comunicaciones: recalcula el lead vinculado a un contacto de WhatsApp
 * (un entrante, una lectura confirmada, un saliente). Nunca lanza — el
 * mensaje o la llamada ya están guardados.
 */
export async function recomputeLeadScoreForCommsContact(db: any, orgId: number, commsContactId: number): Promise<void> {
  try {
    const [c] = await db
      .select({ leadId: schema.commsContacts.leadId })
      .from(schema.commsContacts)
      .where(and(eq(schema.commsContacts.id, commsContactId), eq(schema.commsContacts.organizationId, orgId)))
      .limit(1)
    if (c?.leadId) await recomputeLeadScore(db, orgId, c.leadId, 'signal')
  } catch {
    // Se recalculará con la próxima señal.
  }
}

/** Recalcula los leads de un Contact (sus necesidades de compra son señales de todos ellos). */
export async function recomputeLeadScoresForContact(db: any, orgId: number, contactId: number, reason: LeadScoreReason = 'signal'): Promise<void> {
  const leads = await db
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(and(eq(schema.leads.organizationId, orgId), eq(schema.leads.contactId, contactId)))
    .limit(50)
  for (const l of leads) await recomputeLeadScore(db, orgId, l.id, reason)
}

/** Para el cron horario: sólo los leads cuya señal temporal ya caducó (§70), nunca el tenant entero. */
export async function recomputeExpiredLeadScores(db: any, orgId: number, nowMs: number = Date.now(), limit = 200): Promise<number> {
  const due = await db
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(and(eq(schema.leads.organizationId, orgId), isNotNull(schema.leads.scoreExpiresAt), lte(schema.leads.scoreExpiresAt, toDbTs(nowMs))))
    .limit(limit)
  for (const l of due) await recomputeLeadScore(db, orgId, l.id, 'expiry', nowMs)
  return due.length
}

/** Desglose vigente + historial de un lead (más reciente primero). */
export async function getLeadScoreDetail(db: any, orgId: number, leadId: number) {
  const [lead] = await db
    .select({ id: schema.leads.id, score: schema.leads.score, scoreBreakdownJson: schema.leads.scoreBreakdownJson, scoreComputedAt: schema.leads.scoreComputedAt, scoreExpiresAt: schema.leads.scoreExpiresAt })
    .from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, orgId)))
    .limit(1)
  if (!lead) return null
  const history = await db
    .select({
      id: schema.leadScoreSnapshots.id,
      score: schema.leadScoreSnapshots.score,
      breakdownJson: schema.leadScoreSnapshots.breakdownJson,
      engineVersion: schema.leadScoreSnapshots.engineVersion,
      reason: schema.leadScoreSnapshots.reason,
      createdAt: schema.leadScoreSnapshots.createdAt,
    })
    .from(schema.leadScoreSnapshots)
    .where(and(eq(schema.leadScoreSnapshots.organizationId, orgId), eq(schema.leadScoreSnapshots.leadId, leadId)))
    .orderBy(desc(schema.leadScoreSnapshots.createdAt), desc(schema.leadScoreSnapshots.id))
    .limit(20)
  const parse = (raw: string | null) => {
    try {
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }
  return {
    leadId: lead.id,
    score: lead.score,
    /** null = puntuación heredada del sistema anterior, sin desglose: nunca se inventa uno. */
    breakdown: parse(lead.scoreBreakdownJson) as LeadScoreBreakdownItem[] | null,
    computedAt: lead.scoreComputedAt,
    expiresAt: lead.scoreExpiresAt,
    engineVersion: LEAD_SCORE_ENGINE_VERSION,
    history: history.map((h: any) => ({ id: h.id, score: h.score, reason: h.reason, engineVersion: h.engineVersion, createdAt: h.createdAt, breakdown: parse(h.breakdownJson) })),
  }
}

/** Para la ficha de configuración: el catálogo con su fuente y las reglas efectivas. */
export async function leadScoreSettings(db: any, orgId: number) {
  const rules = await getLeadScoreRules(db, orgId)
  return {
    engineVersion: LEAD_SCORE_ENGINE_VERSION,
    range: { min: LEAD_SCORE_MIN, max: LEAD_SCORE_MAX },
    rules: rules.map((r) => ({ ...r, label: LEAD_SCORE_CATALOG[r.criterion].label, source: LEAD_SCORE_CATALOG[r.criterion].source })),
    financingStatuses: FINANCING_STATUSES,
  }
}

