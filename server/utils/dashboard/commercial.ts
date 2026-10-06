import { and, eq, gte, inArray, isNotNull, isNull, lte, ne, or, sql, type SQL } from 'drizzle-orm'
import { createError } from 'h3'
import { schema, now } from '../db'
import { parsePermissionsConfig } from '../permissions'

/**
 * Dashboard comercial (FASE 33). Un único servicio de agregación — los KPIs
 * no se calculan en el navegador (§104) — sobre las tablas de dominio, sin
 * tabla de snapshots (§102): consultas agregadas acotadas por organización.
 *
 * Cada KPI tiene una fuente y una definición explícitas (§78-91), que la
 * respuesta devuelve junto al número para que la interfaz las enseñe:
 *
 *   Leads nuevos          leads.created_at dentro del periodo
 *   Leads sin atender     alertas SLA «sin atender» abiertas AHORA (lead_sla_alerts), no status = new
 *   Primera respuesta     leads.first_response_at − leads.created_at, cohorte del periodo
 *   Leads cualificados    leads.qualified_at (primera entrada en «cualificado») dentro del periodo
 *   Visitas próximas      visitas property_viewing programadas desde ahora
 *   Visitas realizadas    visitas property_viewing completadas con fecha dentro del periodo
 *   Ofertas               ofertas creadas en el periodo (una por oferta, nunca por revisión)
 *   Operaciones           creadas (opened_at) y cerradas (closed_at) en el periodo, por separado
 *   Conversión            leads de la cohorte con una operación cerrada ÷ leads de la cohorte
 *
 * Embudo (§90-92): cohorte = leads creados en el periodo; cada etapa cuenta
 * cuántos de ESOS leads la alcanzaron (respuesta real, cualificado, visita no
 * cancelada, oferta, operación no cancelada) — nunca se mezclan periodos.
 *
 * Segmentación (§93-100), combinable: comercial (leads.agent_id), oficina
 * (núcleo N8a: la ENTIDAD Oficina, `officeId` — la del propio registro si la
 * tiene, si no la de su comercial; `office` con el texto antiguo
 * `team_members.office_name` sigue aceptándose para enlaces viejos), origen,
 * portal, campaña (campaign o utm_campaign) e inmueble (leads.property_id).
 * Visitas, ofertas y operaciones se acotan por el mismo scope a través de su
 * comercial y de su lead.
 *
 * Visibilidad (núcleo N8a, `dashboardVisibilityFor`): un administrador o
 * gerente ve toda la agencia; un comercial (usuario restringido vinculado a
 * su ficha, `team_members.user_id`) sólo lo suyo — el servidor fuerza su
 * `commercialId` —; un usuario restringido sin ficha no ve el dashboard.
 *
 * Fechas en UTC (todas las marcas de tiempo del proyecto lo son).
 */

export interface DashboardScope {
  from: string // YYYY-MM-DD, inclusive
  to: string // YYYY-MM-DD, inclusive
  commercialId?: number | null
  /** Núcleo N8a: la entidad Oficina. */
  officeId?: number | null
  /** Texto heredado (`team_members.office_name`), sólo para enlaces anteriores a la entidad. */
  office?: string | null
  source?: string | null
  portal?: string | null
  campaign?: string | null
  propertyId?: number | null
  /**
   * Catálogo de `propertyId` (migración 0089): sin él, un id puede ser de los
   * dos catálogos. Con él, cuentan los leads de ese catálogo y los antiguos
   * sin catálogo (NULL), como hasta ahora.
   */
  propertyKind?: 'agent' | 'developer' | null
  /** Periodo comparativo explícito (§80): el inmediatamente anterior de la misma duración. */
  compare?: boolean
}

const DAY_MS = 86_400_000
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function parseDashboardScope(q: Record<string, any>, nowMs = Date.now()): DashboardScope {
  const today = new Date(nowMs).toISOString().slice(0, 10)
  const from = q.from ? String(q.from) : new Date(nowMs - 29 * DAY_MS).toISOString().slice(0, 10)
  const to = q.to ? String(q.to) : today
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) throw createError({ statusCode: 422, statusMessage: 'Periodo no válido (from/to en formato AAAA-MM-DD, from ≤ to).' })
  if (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 731 * DAY_MS) throw createError({ statusCode: 422, statusMessage: 'El periodo máximo es de dos años.' })
  const int = (v: any) => (v === undefined || v === null || v === '' ? null : Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null)
  const str = (v: any) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim().slice(0, 120))
  return {
    from,
    to,
    commercialId: int(q.commercialId),
    officeId: int(q.officeId),
    office: str(q.office),
    source: str(q.source),
    portal: str(q.portal),
    campaign: str(q.campaign),
    propertyId: int(q.propertyId),
    propertyKind: q.propertyKind === 'agent' || q.propertyKind === 'developer' ? q.propertyKind : null,
    compare: q.compare === '1' || q.compare === 'true' || q.compare === true,
  }
}

// --- visibilidad por comercial (núcleo N8a) ---------------------------------------

export type DashboardVisibility = { mode: 'all' } | { mode: 'own'; commercialId: number; commercialName: string } | { mode: 'none'; reason: string }

/**
 * Quién ve qué en el dashboard comercial, con los permisos que ya existen
 * (server/utils/permissions.ts) y el vínculo usuario ↔ comercial
 * (`team_members.user_id`, migración 0086):
 *
 *   - **Toda la agencia** (y puede filtrar por cualquier comercial u
 *     oficina): `super_admin`; un administrador sin restricciones
 *     (`users.permissions` NULL), que es el administrador de la agencia; y
 *     una cuenta restringida con escritura en Sistema (`system:write`), que
 *     gestiona usuarios y permisos — restringirle la vista no protegería
 *     nada, porque podría quitarse la restricción él mismo. Ése es el
 *     «gerente».
 *   - **Sólo lo suyo**: cualquier otra cuenta (restringida, sin
 *     `system:write`) vinculada a su ficha de comercial. El servidor fuerza
 *     su `commercialId` en todos los KPIs, el embudo, la tabla y las
 *     opciones de filtro; lo que pida el navegador no lo cambia.
 *   - **Nada** (403): una cuenta restringida sin ficha vinculada. Falla
 *     cerrada: sin vínculo no se sabe qué es «lo suyo».
 */
export async function dashboardVisibilityFor(db: any, orgId: number, user: { id: number; role: string; permissions?: string | null }): Promise<DashboardVisibility> {
  if (user.role === 'super_admin') return { mode: 'all' }
  const cfg = parsePermissionsConfig(user.permissions)
  if (cfg.kind === 'unrestricted') return { mode: 'all' }
  if (cfg.kind === 'restricted' && cfg.granted.has('system:write')) return { mode: 'all' }
  const [member] = await db
    .select({ id: schema.teamMembers.id, name: schema.teamMembers.name })
    .from(schema.teamMembers)
    .where(and(eq(schema.teamMembers.organizationId, orgId), eq(schema.teamMembers.userId, user.id)))
    .limit(1)
  if (member) return { mode: 'own', commercialId: member.id, commercialName: member.name }
  return { mode: 'none', reason: 'Tu usuario no está vinculado a ninguna ficha de comercial, así que no hay datos «tuyos» que enseñar. Pide a un administrador que lo vincule en la ficha del comercial (campo «Usuario del panel»).' }
}

/** El scope que de verdad se calcula: con «sólo lo suyo», su comercial siempre, pida lo que pida el navegador. */
export function applyDashboardVisibility(s: DashboardScope, visibility: DashboardVisibility): DashboardScope {
  if (visibility.mode === 'own') return { ...s, commercialId: visibility.commercialId }
  if (visibility.mode === 'none') throw createError({ statusCode: 403, statusMessage: visibility.reason })
  return s
}

const start = (d: string) => `${d} 00:00:00`
const end = (d: string) => `${d} 23:59:59`

function hasLeadFilters(s: DashboardScope) {
  return Boolean(s.source || s.portal || s.campaign || s.propertyId)
}

/** Los comerciales de una oficina (entidad) como subconsulta. */
function teamInOffice(orgId: number, officeId: number): SQL {
  return sql`(SELECT id FROM team_members WHERE organization_id = ${orgId} AND office_id = ${officeId})`
}

/**
 * Oficina de un registro: la suya (`officeCol`) si la tiene; si no, la de su
 * comercial. Las ofertas no tienen oficina propia: sólo la del comercial. Las
 * tareas sí desde la migración 0089 (`tasks.office_id`, cierre D3a): la suya
 * o, si no tiene, la de su responsable.
 */
function officeCond(orgId: number, officeId: number, commercialCol: any, officeCol?: any): SQL {
  return officeCol
    ? sql`(${officeCol} = ${officeId} OR (${officeCol} IS NULL AND ${commercialCol} IN ${teamInOffice(orgId, officeId)}))`
    : sql`${commercialCol} IN ${teamInOffice(orgId, officeId)}`
}

/** Condiciones sobre `leads` para el scope (sin periodo). */
function leadScopeConds(orgId: number, s: DashboardScope): SQL[] {
  const L = schema.leads
  const conds: SQL[] = [eq(L.organizationId, orgId)]
  if (s.commercialId) conds.push(eq(L.agentId, s.commercialId))
  if (s.officeId) conds.push(officeCond(orgId, s.officeId, L.agentId, L.officeId))
  if (s.office) conds.push(sql`${L.agentId} IN (SELECT id FROM team_members WHERE organization_id = ${orgId} AND office_name = ${s.office})`)
  if (s.source) conds.push(eq(L.source, s.source))
  if (s.portal) conds.push(eq(L.portal, s.portal))
  if (s.campaign) conds.push(or(eq(L.campaign, s.campaign), eq(L.utmCampaign, s.campaign))!)
  if (s.propertyId) conds.push(eq(L.propertyId, s.propertyId))
  if (s.propertyId && s.propertyKind) conds.push(or(eq(L.propertyKind, s.propertyKind), isNull(L.propertyKind))!)
  return conds
}

/** Ids de lead del scope como subconsulta SQL (para acotar visitas/ofertas/operaciones por sus atributos de captación). */
function scopedLeadIdsSql(orgId: number, s: DashboardScope): SQL {
  const parts: SQL[] = [sql`organization_id = ${orgId}`]
  if (s.commercialId) parts.push(sql`agent_id = ${s.commercialId}`)
  if (s.officeId) parts.push(sql`(office_id = ${s.officeId} OR (office_id IS NULL AND agent_id IN ${teamInOffice(orgId, s.officeId)}))`)
  if (s.office) parts.push(sql`agent_id IN (SELECT id FROM team_members WHERE organization_id = ${orgId} AND office_name = ${s.office})`)
  if (s.source) parts.push(sql`source = ${s.source}`)
  if (s.portal) parts.push(sql`portal = ${s.portal}`)
  if (s.campaign) parts.push(sql`(campaign = ${s.campaign} OR utm_campaign = ${s.campaign})`)
  if (s.propertyId) parts.push(sql`property_id = ${s.propertyId}`)
  if (s.propertyId && s.propertyKind) parts.push(sql`(property_kind = ${s.propertyKind} OR property_kind IS NULL)`)
  return sql`(SELECT id FROM leads WHERE ${sql.join(parts, sql` AND `)})`
}

/** Condición de comercial/oficina sobre una columna de comercial (visitas.agent_id, offers.commercial_id…) y, si la tiene, la oficina propia del registro. */
function commercialConds(orgId: number, s: DashboardScope, col: any, officeCol?: any): SQL[] {
  const conds: SQL[] = []
  if (s.commercialId) conds.push(eq(col, s.commercialId))
  if (s.officeId) conds.push(officeCond(orgId, s.officeId, col, officeCol))
  if (s.office) conds.push(sql`${col} IN (SELECT id FROM team_members WHERE organization_id = ${orgId} AND office_name = ${s.office})`)
  return conds
}

async function count(db: any, table: any, where: SQL): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(table).where(where)
  return Number(row?.n ?? 0)
}

function median(values: number[]): number | null {
  if (!values.length) return null
  const v = [...values].sort((a, b) => a - b)
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2)
}
function tsMs(raw: string | null): number | null {
  if (!raw) return null
  const s = String(raw)
  const ms = Date.parse(s.includes('T') ? (/[zZ]$/.test(s) ? s : `${s}Z`) : `${s.replace(' ', 'T')}Z`)
  return Number.isNaN(ms) ? null : ms
}

async function periodKpis(db: any, orgId: number, s: DashboardScope, nowTs: string) {
  const L = schema.leads
  const V = schema.visits
  const O = schema.offers
  const D = schema.dealOperations
  const leadScope = leadScopeConds(orgId, s)
  const inPeriod = (col: any) => and(gte(col, start(s.from)), lte(col, end(s.to)))!
  const leadFiltered = hasLeadFilters(s)
  const scopedLeads = scopedLeadIdsSql(orgId, s)

  const newLeads = await count(db, L, and(...leadScope, inPeriod(L.createdAt))!)
  const qualifiedLeads = await count(db, L, and(...leadScope, isNotNull(L.qualifiedAt), inPeriod(L.qualifiedAt))!)

  // Primera respuesta: cohorte del periodo, sólo con respuesta humana real.
  const responded = await db
    .select({ createdAt: L.createdAt, firstResponseAt: L.firstResponseAt })
    .from(L)
    .where(and(...leadScope, inPeriod(L.createdAt), isNotNull(L.firstResponseAt))!)
    .limit(5000)
  const minutes = responded
    .map((r: any) => {
      const a = tsMs(r.createdAt)
      const b = tsMs(r.firstResponseAt)
      return a !== null && b !== null && b >= a ? Math.round((b - a) / 60_000) : null
    })
    .filter((m: number | null): m is number => m !== null)

  const visitScope = (extra: SQL[]) => {
    // Cierre D3a: las citas de la papelera no cuentan.
    const conds: SQL[] = [eq(V.organizationId, orgId), isNull(V.deletedAt), eq(V.type, 'property_viewing'), ...commercialConds(orgId, s, V.agentId, V.officeId), ...extra]
    if (leadFiltered) conds.push(sql`${V.leadId} IN ${scopedLeads}`)
    return and(...conds)!
  }
  const completedViewings = await count(db, V, visitScope([eq(V.status, 'completed'), inPeriod(V.scheduledAt)]))

  const offerScope = (extra: SQL[]) => {
    const conds: SQL[] = [eq(O.organizationId, orgId), ...commercialConds(orgId, s, O.commercialId), ...extra]
    if (leadFiltered) conds.push(sql`${O.leadId} IN ${scopedLeads}`)
    return and(...conds)!
  }
  const offers = await count(db, O, offerScope([inPeriod(O.createdAt)]))

  const dealScope = (extra: SQL[]) => {
    const conds: SQL[] = [eq(D.organizationId, orgId), ...commercialConds(orgId, s, D.commercialId, D.officeId), ...extra]
    if (leadFiltered) conds.push(sql`${D.leadId} IN ${scopedLeads}`)
    return and(...conds)!
  }
  const dealsCreated = await count(db, D, dealScope([inPeriod(D.openedAt)]))
  const dealsClosed = await count(db, D, dealScope([eq(D.status, 'closed'), isNotNull(D.closedAt), inPeriod(D.closedAt)]))

  return {
    newLeads,
    qualifiedLeads,
    firstResponse: {
      responded: minutes.length,
      cohort: newLeads,
      avgMinutes: minutes.length ? Math.round(minutes.reduce((a: number, b: number) => a + b, 0) / minutes.length) : null,
      medianMinutes: median(minutes),
    },
    completedViewings,
    offers,
    dealsCreated,
    dealsClosed,
    _visitScope: visitScope,
    _offerScope: offerScope,
    _nowTs: nowTs,
  }
}

/**
 * Embudo de cohorte: leads creados en el periodo y cuántos de ellos alcanzaron cada etapa.
 * Ojo: dentro de los EXISTS la columna del lead va calificada a mano
 * (`leads.id`) — interpolada, Drizzle la pinta como `"id"` y SQLite la
 * resolvería contra la tabla de la subconsulta (visitas, ofertas…).
 */
async function cohortFunnel(db: any, orgId: number, s: DashboardScope) {
  const L = schema.leads
  const cohort = and(...leadScopeConds(orgId, s), gte(L.createdAt, start(s.from)), lte(L.createdAt, end(s.to)))!
  const [row] = await db
    .select({
      leads: sql<number>`count(*)`,
      contacted: sql<number>`sum(CASE WHEN ${L.firstResponseAt} IS NOT NULL THEN 1 ELSE 0 END)`,
      qualified: sql<number>`sum(CASE WHEN ${L.qualifiedAt} IS NOT NULL THEN 1 ELSE 0 END)`,
      viewings: sql<number>`sum(CASE WHEN EXISTS (SELECT 1 FROM visits v WHERE v.organization_id = ${orgId} AND v.lead_id = leads.id AND v.type = 'property_viewing' AND v.status != 'cancelled' AND v.deleted_at IS NULL) THEN 1 ELSE 0 END)`,
      offers: sql<number>`sum(CASE WHEN EXISTS (SELECT 1 FROM offers o WHERE o.organization_id = ${orgId} AND o.lead_id = leads.id) THEN 1 ELSE 0 END)`,
      deals: sql<number>`sum(CASE WHEN EXISTS (SELECT 1 FROM deal_operations d WHERE d.organization_id = ${orgId} AND d.lead_id = leads.id AND d.status != 'cancelled') THEN 1 ELSE 0 END)`,
      closed: sql<number>`sum(CASE WHEN EXISTS (SELECT 1 FROM deal_operations d WHERE d.organization_id = ${orgId} AND d.lead_id = leads.id AND d.status = 'closed') THEN 1 ELSE 0 END)`,
    })
    .from(L)
    .where(cohort)
  const n = (v: any) => Number(v ?? 0)
  return { leads: n(row?.leads), contacted: n(row?.contacted), qualified: n(row?.qualified), viewings: n(row?.viewings), offers: n(row?.offers), deals: n(row?.deals), closed: n(row?.closed) }
}

function previousPeriod(s: DashboardScope): DashboardScope {
  const fromMs = Date.parse(`${s.from}T00:00:00Z`)
  const toMs = Date.parse(`${s.to}T00:00:00Z`)
  const days = Math.round((toMs - fromMs) / DAY_MS) + 1
  const prevTo = new Date(fromMs - DAY_MS).toISOString().slice(0, 10)
  const prevFrom = new Date(fromMs - days * DAY_MS).toISOString().slice(0, 10)
  return { ...s, from: prevFrom, to: prevTo, compare: false }
}

/** Query string de /admin/leads para el detalle de un KPI (§101). */
function leadsLink(s: DashboardScope, extra: Record<string, string>) {
  const p = new URLSearchParams()
  if (s.commercialId) p.set('agentId', String(s.commercialId))
  // La misma regla de oficina que el dashboard (la del lead o, sin ella, la de su comercial).
  if (s.officeId) p.set('officeScope', String(s.officeId))
  if (s.office) p.set('office', s.office)
  if (s.source) p.set('source', s.source)
  if (s.portal) p.set('portal', s.portal)
  if (s.campaign) p.set('campaign', s.campaign)
  if (s.propertyId) p.set('propertyId', String(s.propertyId))
  if (s.propertyId && s.propertyKind) p.set('propertyKind', s.propertyKind)
  for (const [k, v] of Object.entries(extra)) p.set(k, v)
  p.set('view', 'table')
  return `/admin/leads?${p.toString()}`
}

/** CRM → Tareas con las vencidas y el mismo comercial u oficina que el dashboard (cierre D3a). */
function tasksLink(s: DashboardScope) {
  const p = new URLSearchParams({ bucket: 'overdue' })
  if (s.commercialId) p.set('assigneeId', String(s.commercialId))
  if (s.officeId) p.set('officeId', String(s.officeId))
  return `/admin/tareas?${p.toString()}`
}

export async function getCommercialDashboard(db: any, orgId: number, s: DashboardScope) {
  const nowTs = now()
  const V = schema.visits
  const T = schema.tasks
  const A = schema.leadSlaAlerts
  const O = schema.offers

  const current = await periodKpis(db, orgId, s, nowTs)
  const funnel = await cohortFunnel(db, orgId, s)

  // «Ahora mismo» — no dependen del periodo, y lo dicen.
  const upcomingViewings = await count(db, V, current._visitScope([eq(V.status, 'scheduled'), gte(V.scheduledAt, nowTs)]))
  const unattendedLeads = await count(db, A, and(eq(A.organizationId, orgId), eq(A.type, 'unattended'), eq(A.status, 'open'), sql`${A.leadId} IN ${scopedLeadIdsSql(orgId, s)}`)!)
  const pendingOffers = await count(db, O, current._offerScope([inArray(O.status, ['submitted', 'countered'])]))
  const overdueTasks = await count(
    db,
    T,
    and(
      eq(T.organizationId, orgId),
      isNull(T.deletedAt),
      inArray(T.status, ['open', 'in_progress']),
      isNotNull(T.dueAt),
      sql`${T.dueAt} < ${nowTs}`,
      // La oficina de la tarea si la tiene; si no, la de su responsable (cierre D3a).
      ...commercialConds(orgId, s, T.assigneeId, T.officeId),
      ...(hasLeadFilters(s) ? [sql`${T.leadId} IN ${scopedLeadIdsSql(orgId, s)}`] : []),
    )!,
  )

  const conversion = funnel.leads ? Math.round((funnel.closed / funnel.leads) * 1000) / 10 : null

  let comparison: null | { from: string; to: string; newLeads: number; qualifiedLeads: number; completedViewings: number; offers: number; dealsClosed: number; conversion: number | null } = null
  if (s.compare) {
    const prev = previousPeriod(s)
    const p = await periodKpis(db, orgId, prev, nowTs)
    const pf = await cohortFunnel(db, orgId, prev)
    comparison = {
      from: prev.from,
      to: prev.to,
      newLeads: p.newLeads,
      qualifiedLeads: p.qualifiedLeads,
      completedViewings: p.completedViewings,
      offers: p.offers,
      dealsClosed: p.dealsClosed,
      conversion: pf.leads ? Math.round((pf.closed / pf.leads) * 1000) / 10 : null,
    }
  }

  // Segmentación por comercial (cohorte del periodo, mismo scope).
  const L = schema.leads
  const byCommercialRows = await db
    .select({
      commercialId: L.agentId,
      leads: sql<number>`count(*)`,
      qualified: sql<number>`sum(CASE WHEN ${L.qualifiedAt} IS NOT NULL THEN 1 ELSE 0 END)`,
      closed: sql<number>`sum(CASE WHEN EXISTS (SELECT 1 FROM deal_operations d WHERE d.organization_id = ${orgId} AND d.lead_id = leads.id AND d.status = 'closed') THEN 1 ELSE 0 END)`,
    })
    .from(L)
    .where(and(...leadScopeConds(orgId, s), gte(L.createdAt, start(s.from)), lte(L.createdAt, end(s.to)))!)
    .groupBy(L.agentId)
  const team = await db
    .select({ id: schema.teamMembers.id, name: schema.teamMembers.name, officeName: schema.teamMembers.officeName, officeId: schema.teamMembers.officeId })
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.organizationId, orgId))
  const teamById = new Map<number, any>(team.map((t: any) => [t.id, t]))
  const officeNames = await officeNamesFor(db, orgId)
  const byCommercial = byCommercialRows
    .map((r: any) => ({
      commercialId: r.commercialId,
      name: r.commercialId ? (teamById.get(r.commercialId)?.name ?? `#${r.commercialId}`) : 'Sin asignar',
      // La oficina como entidad; el texto antiguo sólo si la ficha todavía no tiene una.
      office: r.commercialId ? (officeNames.get(teamById.get(r.commercialId)?.officeId) ?? teamById.get(r.commercialId)?.officeName ?? null) : null,
      leads: Number(r.leads ?? 0),
      qualified: Number(r.qualified ?? 0),
      closed: Number(r.closed ?? 0),
    }))
    .sort((a: any, b: any) => b.leads - a.leads)

  const kpis = {
    newLeads: { value: current.newLeads, definition: 'Leads creados en el periodo (fecha de alta).', link: leadsLink(s, { createdFrom: s.from, createdTo: s.to }) },
    unattendedLeads: { value: unattendedLeads, definition: 'Alertas de SLA «sin atender» abiertas ahora mismo (umbral configurado en Enrutamiento y SLA). No depende del periodo.', link: leadsLink(s, { unattended: '1' }) },
    firstResponse: { ...current.firstResponse, definition: 'Minutos entre el alta y la primera respuesta humana real (cambio de fase hecho por una persona), para los leads creados en el periodo que ya la tienen. Tiempo natural, no horario comercial.' },
    qualifiedLeads: { value: current.qualifiedLeads, definition: 'Leads que entraron por primera vez en «cualificado» dentro del periodo (qualified_at).', link: leadsLink(s, { qualifiedFrom: s.from, qualifiedTo: s.to }) },
    upcomingViewings: { value: upcomingViewings, definition: 'Visitas a inmueble programadas desde ahora. No depende del periodo.', link: '/admin/visitas' },
    completedViewings: { value: current.completedViewings, definition: 'Visitas a inmueble marcadas como realizadas, con fecha dentro del periodo.', link: '/admin/visitas' },
    offers: { value: current.offers, definition: 'Ofertas creadas en el periodo — una por oferta, nunca por contraoferta o revisión.', link: '/admin/compatibilidades' },
    pendingOffers: { value: pendingOffers, definition: 'Ofertas enviadas o contraofertadas, pendientes de respuesta ahora mismo.', link: '/admin/compatibilidades' },
    dealsCreated: { value: current.dealsCreated, definition: 'Operaciones abiertas en el periodo (oferta aceptada).', link: '/admin/deal-operations' },
    dealsClosed: { value: current.dealsClosed, definition: 'Operaciones cerradas en el periodo.', link: '/admin/deal-operations' },
    conversion: { value: conversion, definition: 'Leads creados en el periodo que ya tienen una operación cerrada ÷ leads creados en el periodo (misma cohorte; nunca se dividen periodos distintos).' },
    overdueTasks: { value: overdueTasks, definition: 'Tareas abiertas con fecha límite ya pasada, ahora mismo. Con oficina: la de la tarea o, si no tiene, la de su responsable.', link: tasksLink(s) },
  }

  return {
    scope: { from: s.from, to: s.to, commercialId: s.commercialId, officeId: s.officeId ?? null, office: s.office, source: s.source, portal: s.portal, campaign: s.campaign, propertyId: s.propertyId },
    generatedAt: nowTs,
    timezone: 'UTC',
    kpis,
    funnel: {
      definition: 'Cohorte: leads creados en el periodo con este filtro. Cada etapa cuenta cuántos de ESOS leads la alcanzaron: respuesta humana real, cualificado, al menos una visita a inmueble no cancelada, al menos una oferta, una operación no cancelada.',
      stages: [
        { key: 'leads', label: 'Leads', value: funnel.leads },
        { key: 'contacted', label: 'Contactados', value: funnel.contacted },
        { key: 'qualified', label: 'Cualificados', value: funnel.qualified },
        { key: 'viewings', label: 'Visitas', value: funnel.viewings },
        { key: 'offers', label: 'Ofertas', value: funnel.offers },
        { key: 'deals', label: 'Operaciones', value: funnel.deals },
      ],
    },
    comparison,
    byCommercial,
  }
}

async function officeNamesFor(db: any, orgId: number): Promise<Map<number, string>> {
  const rows = await db
    .select({ id: schema.offices.id, name: schema.offices.name })
    .from(schema.offices)
    .where(and(eq(schema.offices.organizationId, orgId), isNull(schema.offices.deletedAt)))
  return new Map(rows.map((o: any) => [o.id, o.name]))
}

/** Opciones reales de los filtros (§93): sólo valores que existen en la agencia. Con visibilidad «sólo lo suyo», sólo su ficha y su oficina. */
export async function dashboardFilterOptions(db: any, orgId: number, visibility: DashboardVisibility = { mode: 'all' }) {
  const L = schema.leads
  const team = await db
    .select({ id: schema.teamMembers.id, name: schema.teamMembers.name, officeName: schema.teamMembers.officeName, officeId: schema.teamMembers.officeId })
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.organizationId, orgId))
    .orderBy(schema.teamMembers.name)
  const officeNames = await officeNamesFor(db, orgId)
  const visibleTeam = visibility.mode === 'own' ? team.filter((t: any) => t.id === visibility.commercialId) : team
  // «Sólo lo suyo»: las opciones salen únicamente de sus leads (ni campañas ni inmuebles de los demás).
  const own = visibility.mode === 'own' ? [eq(L.agentId, visibility.commercialId)] : []
  const distinct = async (col: any) =>
    (await db.selectDistinct({ v: col }).from(L).where(and(eq(L.organizationId, orgId), ...own, isNotNull(col), ne(col, ''))!).limit(100)).map((r: any) => r.v).sort()
  const campaigns = [...new Set([...(await distinct(L.campaign)), ...(await distinct(L.utmCampaign))])].sort()
  // Con su catálogo (migración 0089): el mismo id en 2ª mano y en obra nueva son dos inmuebles.
  const properties = await db
    .selectDistinct({ id: L.propertyId, kind: L.propertyKind, name: L.propertyName })
    .from(L)
    .where(and(eq(L.organizationId, orgId), ...own, isNotNull(L.propertyId))!)
    .limit(100)
  const offices =
    visibility.mode === 'own'
      ? visibleTeam.filter((t: any) => t.officeId && officeNames.has(t.officeId)).map((t: any) => ({ id: t.officeId, name: officeNames.get(t.officeId)! }))
      : [...officeNames.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'es'))
  return {
    visibility,
    commercials: visibleTeam.map((t: any) => ({ id: t.id, name: t.name })),
    /** Núcleo N8a: la entidad Oficina ({ id, name }), ya no el texto de la ficha. */
    offices,
    sources: await distinct(L.source),
    portals: await distinct(L.portal),
    campaigns,
    properties: properties.map((p: any) => ({ id: p.id, kind: p.kind ?? null, name: `${p.name || `Inmueble #${p.id}`}${p.kind === 'agent' ? ' (2ª mano)' : p.kind === 'developer' ? ' (obra nueva)' : ''}` })),
  }
}
