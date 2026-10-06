import { and, eq } from 'drizzle-orm'
import { useDb, schema } from '../../utils/db'
import { requireApiKey } from '../../utils/apiAuth'
import { upsertLead } from '../../utils/leads'
import { rateLimit } from '../../utils/rateLimit'
import { isValidEmail, isValidPhone } from '../../utils/validate'
import { trashedPropertyMessage } from '../../utils/properties/trash'
import { leadPropertySummary } from '../../utils/leads/property'
import { normalizeLanguage } from '../../../utils/crmCatalog'

interface CreateLeadBody {
  name?: string
  email?: string
  phone?: string
  source?: string
  /** Núcleo N8a: con `source: 'portal'`, el portal del que llega (p. ej. «Idealista»). Obligatorio en ese caso. */
  portal?: string
  /** Id del lead en el sistema de origen (el portal): deduplica un reenvío del mismo lead. */
  externalId?: string
  propertyId?: number
  /** Cierre del núcleo (migración 0089): catálogo de `propertyId` — «developer» (obra nueva, por defecto) o «agent» (2ª mano). */
  propertyKind?: string
  /** Cierre del núcleo (FASE 15): idioma de la persona — código (es, en…), «es-ES» o el nombre («English»). */
  language?: string
  budget?: number
  notes?: string
}

/**
 * POST /api/v1/leads — documented since before this existed (same gap as
 * /communities and /agents). Requires the "write" scope. Org-scoped to the
 * caller's API key — no fabricated confirmation, the returned id is real.
 *
 * FASE 29 §118: goes through `upsertLead()`, the same pipeline as the public
 * forms (Contact resolution + dedup, LEAD_CREATED activity, routing,
 * internal notification) instead of its own INSERT. Like every other
 * intake, an email that already has a lead in this org refreshes that lead
 * instead of duplicating it — `created: false` says so.
 *
 * Núcleo N8a (FASE 33, «portal nunca se rellena»): una integración que trae
 * leads de un portal envía `source: 'portal'` + `portal` (y, si lo tiene,
 * `externalId`): el lead queda con origen «Portal inmobiliario», su portal
 * rellenado de verdad y deduplicado por (origen, id externo). Cualquier otro
 * `source` sigue guardándose como «api», como hasta ahora. La plataforma no
 * tiene integración directa con ningún portal: este es el único camino por
 * el que llega ese dato, y sólo si quien llama lo dice.
 *
 * Cierre del núcleo:
 *   - `propertyKind` dice de qué catálogo es `propertyId` («developer», el de
 *     siempre y el valor por defecto, o «agent» para 2ª mano). La propiedad
 *     se busca sólo en ese catálogo: de otra agencia → 422 (como hasta
 *     ahora), en la papelera → 422.
 *   - `language` se normaliza al catálogo de idiomas («en-GB», «English» →
 *     «en»); uno que no está en el catálogo es un 422, nunca se ignora en
 *     silencio. Con él, la regla de enrutado «Idioma» se aplica a estos leads.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireApiKey(event, 'write')
  await rateLimit(event, 'public-api-write', { limit: 30, windowSeconds: 60 })

  const body = await readBody<CreateLeadBody>(event)
  const name = String(body?.name || '').trim()
  if (!name) throw createError({ statusCode: 422, statusMessage: 'name is required' })
  if (!body?.email && !body?.phone) throw createError({ statusCode: 422, statusMessage: 'email or phone is required' })
  if (body.email && !isValidEmail(body.email)) throw createError({ statusCode: 422, statusMessage: 'Invalid email' })
  if (body.phone && !isValidPhone(body.phone)) throw createError({ statusCode: 422, statusMessage: 'Invalid phone' })
  const fromPortal = body.source === 'portal'
  const portal = typeof body.portal === 'string' ? body.portal.trim().slice(0, 100) : ''
  if (fromPortal && !portal) throw createError({ statusCode: 422, statusMessage: 'portal is required when source is "portal"' })
  const externalId = typeof body.externalId === 'string' || typeof body.externalId === 'number' ? String(body.externalId).trim().slice(0, 120) || null : null
  const propertyKind = body.propertyKind === undefined || body.propertyKind === null || body.propertyKind === '' ? 'developer' : body.propertyKind
  if (propertyKind !== 'developer' && propertyKind !== 'agent') throw createError({ statusCode: 422, statusMessage: 'propertyKind must be "developer" (new build / web) or "agent" (second-hand)' })
  const hasLanguage = body.language !== undefined && body.language !== null && body.language !== ''
  const language = hasLanguage ? normalizeLanguage(body.language) : null
  if (hasLanguage && !language) throw createError({ statusCode: 422, statusMessage: 'language must be a supported language code (es, en, fr, de, it, pt, nl, ru, ar, zh, ca, eu, gl)' })

  const propertyId = body.propertyId === undefined || body.propertyId === null || (body.propertyId as unknown) === '' ? null : Number(body.propertyId)
  if (propertyId !== null && (!Number.isInteger(propertyId) || propertyId <= 0)) throw createError({ statusCode: 422, statusMessage: 'propertyId must be a positive integer' })

  const db = useDb(event)
  let propertyName: string | null = null
  if (propertyId) {
    const t = (propertyKind === 'agent' ? schema.agentProperties : schema.developerProperties) as any
    const rows = await db
      .select({ id: t.id, deletedAt: t.deletedAt })
      .from(t)
      .where(and(eq(t.id, propertyId), eq(t.organizationId, orgId)))
      .limit(1)
    if (!rows[0]) throw createError({ statusCode: 422, statusMessage: 'propertyId does not belong to this organization' })
    // Un lead nuevo no se asocia a una propiedad de la papelera.
    if (rows[0].deletedAt) throw createError({ statusCode: 422, statusMessage: trashedPropertyMessage('asociarle un lead') })
    propertyName = (await leadPropertySummary(db, orgId, { propertyId, propertyKind }))?.name ?? null
  }

  const result = await upsertLead(event, {
    organizationId: orgId,
    name: name.slice(0, 200),
    email: body.email?.trim() || null,
    phone: body.phone?.trim() || null,
    source: fromPortal ? 'portal' : 'api',
    ...(fromPortal ? { portal, sourceDetail: portal } : {}),
    externalId,
    budget: body.budget || null,
    propertyId,
    propertyKind: propertyId ? propertyKind : null,
    propertyName,
    language,
    notes: body.notes?.slice(0, 2000) || null,
  })
  const [lead] = await db.select().from(schema.leads).where(and(eq(schema.leads.id, result.id), eq(schema.leads.organizationId, orgId))).limit(1)

  return { data: lead, created: result.created }
})
