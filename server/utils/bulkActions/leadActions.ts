import { and, eq } from 'drizzle-orm'
import { createError, type H3Event } from 'h3'
import { schema, useDb } from '../db'
import { reassignLead, LeadRoutingError } from '../leads/routing'
import { transitionLeadStage, LeadPipelineError, STAGES } from '../leads/pipeline'
import { getOrCreateTag, linkTag } from '../tags/service'
import { createTask } from '../tasks/service'
import type { BulkActionItemHandler } from './service'

/** Cada handler primero confirma que el lead sigue existiendo y sigue siendo de esta organización — pudo borrarse entre seleccionarlo y que le llegue el turno. */
async function assertOwnedLead(event: H3Event, orgId: number, leadId: number) {
  const db = useDb(event)
  const row = (await db.select().from(schema.leads).where(and(eq(schema.leads.id, leadId), eq(schema.leads.organizationId, orgId))).limit(1))[0]
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Lead no encontrado' })
  return row
}

/** §97 — reutiliza el mismo servicio que la reasignación manual del tablero (leads/routing.ts#reassignLead), nunca una escritura directa de agentId: así queda constancia en lead_assignment_history igual que una reasignación hecha a mano. */
async function changeCommercial(event: H3Event, orgId: number, leadId: number, params: { commercialId?: number | null }, requestedBy: number | null | undefined) {
  await assertOwnedLead(event, orgId, leadId)
  const db = useDb(event)
  if (params.commercialId != null) {
    const tm = (await db.select({ id: schema.teamMembers.id }).from(schema.teamMembers).where(and(eq(schema.teamMembers.id, params.commercialId), eq(schema.teamMembers.organizationId, orgId))).limit(1))[0]
    if (!tm) throw createError({ statusCode: 422, statusMessage: 'Comercial no encontrado' })
  }
  try {
    await reassignLead(event, orgId, leadId, params.commercialId ?? null, { userId: requestedBy, reason: 'Acción masiva' })
  } catch (err) {
    if (err instanceof LeadRoutingError) throw createError({ statusCode: 422, statusMessage: err.message })
    throw err
  }
}

/** §98 — reutiliza leads/pipeline.ts#transitionLeadStage, el único escritor legal de leads.stage: genera lead_stage_history igual que arrastrar la tarjeta en el Kanban. */
async function changeStage(event: H3Event, orgId: number, leadId: number, params: { stage?: string }, requestedBy: number | null | undefined) {
  if (!params.stage || !STAGES.includes(params.stage as any)) throw createError({ statusCode: 422, statusMessage: `Fase inválida: ${params.stage}` })
  await assertOwnedLead(event, orgId, leadId)
  try {
    await transitionLeadStage(event, orgId, leadId, { toStage: params.stage, reason: 'Acción masiva' }, { userId: requestedBy })
  } catch (err) {
    if (err instanceof LeadPipelineError) throw createError({ statusCode: 422, statusMessage: err.message })
    throw err
  }
}

/** §99 — mismo Tag transversal que Properties (server/utils/tags/service.ts), 'lead' como entityType. Idempotente. */
async function addTag(event: H3Event, orgId: number, leadId: number, params: { tagName?: string }) {
  if (!params.tagName?.trim()) throw createError({ statusCode: 422, statusMessage: 'Falta el nombre de la etiqueta' })
  await assertOwnedLead(event, orgId, leadId)
  const tag = await getOrCreateTag(event, orgId, params.tagName)
  await linkTag(event, orgId, tag.id, 'lead', leadId)
}

/** §100 — una Task real por Lead (tasks/service.ts#createTask), nunca una sola Task compartida por los N leads del lote. */
async function createTaskForLead(event: H3Event, orgId: number, leadId: number, params: { type?: string; title?: string; assigneeId?: number | null; dueAt?: string | null }, requestedBy: number | null | undefined) {
  const lead = await assertOwnedLead(event, orgId, leadId)
  const db = useDb(event)
  await createTask(
    db,
    orgId,
    {
      type: (params.type as any) || 'call',
      title: (params.title || '').trim(),
      assigneeId: params.assigneeId ?? null,
      dueAt: params.dueAt || null,
      contactId: lead.contactId ?? null,
      leadId,
    },
    { createdBy: requestedBy },
  )
}

/** Un mapa único — a diferencia de Properties, Leads es un solo catálogo, sin distinción agent/developer. */
export function leadBulkHandlers(): Record<string, BulkActionItemHandler> {
  return {
    change_commercial: (event, orgId, id, params, requestedBy) => changeCommercial(event, orgId, id, params, requestedBy),
    change_stage: (event, orgId, id, params, requestedBy) => changeStage(event, orgId, id, params, requestedBy),
    add_tag: (event, orgId, id, params) => addTag(event, orgId, id, params),
    create_task: (event, orgId, id, params, requestedBy) => createTaskForLead(event, orgId, id, params, requestedBy),
  }
}
