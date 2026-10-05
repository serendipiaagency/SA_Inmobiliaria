import { and, desc, eq, inArray } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { schema } from '../db'
import type { SessionUser } from '../auth'
import { hasAreaAccess } from '../permissions'
import { adminResources } from '../adminResources'
import { listPropertyContacts } from '../contacts/crm'
import { findRequirementsForProperty } from '../matching/service'
import { getPropertySchemaFor, validateAgainstSchema } from '../propertySchema/registry'
import { CHANNELS } from '../publication/channels'
import { isChannelConnected } from '../publication/adapters'
import { selectInChunks } from '../sqlChunks'
import { propertyDocumentSummary } from './documents'
import { propertyMediaCounts } from './media'
import { OWNERSHIP_ROLES, PROPERTY_CONTACT_ROLE_LABELS } from '../../../utils/crmCatalog'
import { OFFER_OPEN_STATUSES } from '../../../utils/pipelineCatalog'
import { PROPERTY_SHEET_FIELD_MAP } from '../../../utils/propertySheet'

/**
 * Resumen de la ficha de una propiedad (FASE 25, bloque N7a): lo que hay que
 * saber de un vistazo al abrirla — estado, precio, en qué canales está
 * publicada y cómo, propietarios, compradores compatibles, ofertas,
 * documentos caducados o a punto de caducar, multimedia y qué falta para
 * publicar. Lo sirve `GET /api/admin/<recurso>/:id?view=summary` (sin ruta
 * nueva) y lo pinta la cabecera del editor y el paso «Portales».
 *
 * Todo sale de datos reales de esta organización. Lo de CRM (propietarios,
 * compatibles, ofertas) sólo se calcula si quien pregunta puede leer el CRM;
 * si no, viaja `null` y la ficha no lo enseña. Los canales son los del
 * sistema de publicación multicanal tal cual existe: ningún portal tiene hoy
 * una integración real (docs/publication-channels.md), y el resumen lo dice
 * en vez de inventarse un estado.
 */

type PropertyKind = 'agent' | 'developer'

const STATUS_LABELS: Record<string, string> = { new: 'Obra nueva', under_construction: 'En construcción', ready: 'Lista', available: 'Disponible', sold: 'Vendida' }
const COMMERCIAL_STATUS_LABELS: Record<string, string> = PROPERTY_SHEET_FIELD_MAP.commercialStatus?.optionLabels || {}

export type ChannelState = 'published' | 'visible' | 'scheduled' | 'withdrawn' | 'failed' | 'blocked' | 'cancelled' | 'none' | 'removed' | 'not_applicable'

export const CHANNEL_STATE_LABELS: Record<ChannelState, string> = {
  published: 'Publicada',
  visible: 'Visible',
  scheduled: 'Programada',
  withdrawn: 'Retirada',
  failed: 'Error',
  blocked: 'Bloqueada',
  cancelled: 'Cancelada',
  none: 'Sin programar',
  removed: 'Fuera (papelera)',
  not_applicable: 'No aplica',
}

/** Estado de un canal a partir de su último trabajo de publicación. */
export function channelStateFromJob(job: { status: string; action: string } | null): ChannelState {
  if (!job) return 'none'
  if (job.status === 'success') return job.action === 'unpublish' ? 'withdrawn' : 'published'
  if (['pending', 'queued', 'running', 'retrying', 'paused'].includes(job.status)) return 'scheduled'
  if (job.status === 'failed') return 'failed'
  if (job.status === 'blocked') return 'blocked'
  return 'cancelled'
}

function fieldLabel(resourceKey: string, key: string): string {
  return adminResources[resourceKey]?.fields[key]?.label || PROPERTY_SHEET_FIELD_MAP[key]?.label || key
}

/** Los canales de publicación de una propiedad: la web propia y, en obra nueva, cada canal multicanal con su último trabajo. */
export async function propertyChannels(db: any, env: Record<string, any>, orgId: number, kind: PropertyKind, row: Record<string, any>) {
  const web =
    kind === 'agent'
      ? { state: 'not_applicable' as ChannelState, detail: 'Las propiedades de 2ª mano no tienen ficha en la web pública.', url: null as string | null }
      : row.deletedAt
        ? { state: 'removed' as ChannelState, detail: 'En la papelera: no aparece en la web.', url: null }
        : row.publishedAt
          ? { state: 'published' as ChannelState, detail: `Publicada en la web desde el ${String(row.publishedAt).slice(0, 10)}.`, url: `/propiedades/${row.slug || row.id}` }
          : { state: 'visible' as ChannelState, detail: 'Se ve en la web pública, pero sin fecha de publicación (sus documentos públicos no se ofrecen hasta publicarla).', url: `/propiedades/${row.slug || row.id}` }

  if (kind === 'agent') {
    return {
      web: { ...web, label: CHANNEL_STATE_LABELS[web.state] },
      portals: [] as any[],
      portalsNote: 'La publicación multicanal (portales, redes y mensajería) se programa sobre propiedades de obra nueva; las de 2ª mano todavía no tienen programaciones.',
    }
  }

  const schedules = await db
    .select({ id: schema.publicationSchedules.id })
    .from(schema.publicationSchedules)
    .where(and(eq(schema.publicationSchedules.organizationId, orgId), eq(schema.publicationSchedules.developerPropertyId, row.id)))
  const scheduleIds: number[] = schedules.map((x: any) => Number(x.id))
  const jobs = await selectInChunks(scheduleIds, (part) =>
    db
      .select({
        id: schema.publicationJobs.id,
        channelKey: schema.publicationJobs.channelKey,
        status: schema.publicationJobs.status,
        action: schema.publicationJobs.action,
        runAt: schema.publicationJobs.runAt,
        publishedAt: schema.publicationJobs.publishedAt,
        externalUrl: schema.publicationJobs.externalUrl,
        lastError: schema.publicationJobs.lastError,
      })
      .from(schema.publicationJobs)
      .where(and(eq(schema.publicationJobs.organizationId, orgId), inArray(schema.publicationJobs.scheduleId, part)))
      .orderBy(desc(schema.publicationJobs.runAt), desc(schema.publicationJobs.id)),
  )
  const latest = new Map<string, any>()
  for (const j of jobs as any[]) {
    const prev = latest.get(j.channelKey)
    if (!prev || j.runAt > prev.runAt || (j.runAt === prev.runAt && j.id > prev.id)) latest.set(j.channelKey, j)
  }
  const configs = await db
    .select({ channelKey: schema.publicationChannelConfigs.channelKey, enabled: schema.publicationChannelConfigs.enabled })
    .from(schema.publicationChannelConfigs)
    .where(eq(schema.publicationChannelConfigs.organizationId, orgId))
  const enabled = new Map<string, boolean>(configs.map((c: any) => [c.channelKey, !!c.enabled]))

  const portals = CHANNELS.map((c) => {
    const job = latest.get(c.key) || null
    const state = channelStateFromJob(job)
    return {
      key: c.key,
      label: c.label,
      type: c.type,
      implemented: c.implemented,
      connected: isChannelConnected(c.key, env),
      enabled: enabled.has(c.key) ? enabled.get(c.key)! : true,
      state,
      stateLabel: CHANNEL_STATE_LABELS[state],
      lastJob: job,
    }
  })
  return {
    web: { ...web, label: CHANNEL_STATE_LABELS[web.state] },
    portals,
    portalsNote: CHANNELS.some((c) => c.implemented)
      ? null
      : 'Ningún canal externo tiene todavía una integración real: un trabajo programado queda «Bloqueado» sin llamar al portal. Se programan desde Publicación multicanal.',
  }
}

export async function buildPropertySummary(event: H3Event, db: any, env: Record<string, any>, orgId: number, user: SessionUser, kind: PropertyKind, row: Record<string, any>, sheet: Record<string, unknown>) {
  const resourceKey = kind === 'developer' ? 'developer-properties' : 'properties'
  const canCrm = hasAreaAccess(user, 'crm', 'read')
  const id = Number(row.id)

  const [channels, documents, media] = await Promise.all([propertyChannels(db, env, orgId, kind, row), propertyDocumentSummary(db, orgId, kind, id), propertyMediaCounts(db, orgId, kind, id)])

  let owners: any[] | null = null
  let otherContacts = 0
  let matches: { total: number; eligible: number; needsReview: number } | null = null
  let offers: { total: number; open: number; accepted: number } | null = null
  if (canCrm) {
    const contacts = await listPropertyContacts(db, orgId, kind, id)
    const ownerRows = contacts
      .filter((c: any) => (OWNERSHIP_ROLES as readonly string[]).includes(c.role))
      .map((c: any) => ({ contactId: c.contactId, name: c.name, role: c.role, roleLabel: PROPERTY_CONTACT_ROLE_LABELS[c.role as keyof typeof PROPERTY_CONTACT_ROLE_LABELS] || c.role, ownershipPct: c.ownershipPct }))
    owners = ownerRows
    otherContacts = contacts.length - ownerRows.length
    if (!row.deletedAt) {
      const found = await findRequirementsForProperty(event, orgId, id, kind, { limit: 500 }).catch(() => null)
      if (found) {
        matches = {
          total: found.results.length,
          eligible: found.results.filter((r) => r.result.eligibility === 'eligible').length,
          needsReview: found.results.filter((r) => r.result.eligibility === 'needs_review').length,
        }
      }
    }
    const offerRows = await db
      .select({ status: schema.offers.status })
      .from(schema.offers)
      .where(and(eq(schema.offers.organizationId, orgId), eq(schema.offers.propertyKind, kind), eq(schema.offers.propertyId, id)))
    offers = {
      total: offerRows.length,
      open: offerRows.filter((o: any) => (OFFER_OPEN_STATUSES as readonly string[]).includes(o.status)).length,
      accepted: offerRows.filter((o: any) => o.status === 'accepted').length,
    }
  }

  const sch = getPropertySchemaFor(kind, (row.propertyType as string | null) ?? null)
  const readiness = validateAgainstSchema(sch, { ...row, ...sheet }, 'publish')
  const commercialStatus = (sheet.commercialStatus as string | null) ?? null

  return {
    kind,
    id,
    schemaLabel: sch.label,
    status: row.status ?? null,
    statusLabel: STATUS_LABELS[row.status] || row.status || null,
    commercialStatus,
    commercialStatusLabel: commercialStatus ? COMMERCIAL_STATUS_LABELS[commercialStatus] || commercialStatus : null,
    transactionType: row.transactionType ?? null,
    price: row.price ?? null,
    priceOld: row.priceOld ?? null,
    isExclusive: !!row.isExclusive,
    isReserved: !!row.isReserved,
    publishedAt: row.publishedAt ?? null,
    deletedAt: row.deletedAt ?? null,
    channels,
    owners,
    otherContacts,
    matches,
    offers,
    documents,
    media,
    publishReadiness: {
      ok: readiness.missingForPublish.length === 0 && readiness.missingForSave.length === 0,
      missing: [...readiness.missingForSave, ...readiness.missingForPublish].map((key) => ({ key, label: fieldLabel(resourceKey, key) })),
    },
  }
}

/**
 * Valores por defecto para una propiedad nueva (FASE 25, «defaults
 * inteligentes»), sacados de datos reales de la agencia y de quien la da de
 * alta: operación «venta», ubicación exacta, el país y la localidad más
 * frecuentes de su catálogo, y — si la cuenta está vinculada a un comercial —
 * ese comercial con su oficina y su equipo. Nada se inventa: sin datos, no
 * hay valor por defecto.
 */
export async function propertyDefaults(db: any, orgId: number, userId: number, kind: PropertyKind) {
  const t = kind === 'agent' ? schema.agentProperties : schema.developerProperties
  const defaults: Record<string, unknown> = { transactionType: 'sale', locationPrivacy: 'exact', status: kind === 'agent' ? 'available' : 'new' }
  const recent = await db
    .select({ country: t.country, city: t.city })
    .from(t)
    .where(eq(t.organizationId, orgId))
    .orderBy(desc(t.id))
    .limit(200)
  const mostCommon = (values: (string | null)[]) => {
    const counts = new Map<string, number>()
    for (const v of values) if (v && v.trim()) counts.set(v.trim(), (counts.get(v.trim()) || 0) + 1)
    let best: string | null = null
    let max = 0
    for (const [v, n] of counts) if (n > max) [best, max] = [v, n]
    return best
  }
  const country = mostCommon(recent.map((r: any) => r.country))
  const city = mostCommon(recent.map((r: any) => r.city))
  if (country) defaults.country = country
  if (city) defaults.city = city
  const [member] = await db
    .select({ id: schema.teamMembers.id, officeId: schema.teamMembers.officeId, teamId: schema.teamMembers.teamId })
    .from(schema.teamMembers)
    .where(and(eq(schema.teamMembers.organizationId, orgId), eq(schema.teamMembers.userId, userId)))
    .limit(1)
  if (member) {
    defaults.agentId = member.id
    if (member.officeId) defaults.officeId = member.officeId
    if (member.teamId) defaults.teamId = member.teamId
  }
  return defaults
}
