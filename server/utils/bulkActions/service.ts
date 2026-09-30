import { and, eq, sql } from 'drizzle-orm'
import { createError, type H3Event } from 'h3'
import { schema, useDb, now } from '../db'

/** Mismo vocabulario que tasks.propertyKind/activities.propertyKind, más 'lead' — ver migración 0081. */
export type BulkEntityType = 'agent' | 'developer' | 'lead'

/**
 * Framework de Bulk Actions (FASE 28 §84-106) — motor genérico compartido
 * por Properties y Leads, no un hack por acción. Mismo patrón job+items ya
 * probado en este repo por asset_export_catalogs/_items (no hay Cloudflare
 * Queues ni Durable Objects aquí: "no bloquear el request durante minutos"
 * se resuelve con un job pendiente + un endpoint que procesa una fila por
 * llamada, sondeado por el cliente hasta `{ done: true }`).
 *
 * Los handlers de cada acción NO viven en un registro global mutable — cada
 * dominio (properties, leads) pasa su propio mapa `action → handler` a
 * `processNextBulkActionItem()` en el momento de la llamada. Así no depende
 * de que un módulo de handlers se cargue por un efecto secundario de import
 * (frágil bajo el empaquetado de Nitro/Workers); el mapa siempre está donde
 * ya se sabía qué dominio es, porque cada recurso RBAC (`property-bulk-jobs`/
 * `lead-bulk-jobs`) es su propia rama en las rutas genéricas.
 */
export type BulkActionItemHandler = (event: H3Event, orgId: number, targetId: number, params: Record<string, any>) => Promise<void>

const TERMINAL_STATUSES = ['completed', 'failed', 'partial']

/** Tope de un job — mismo orden de magnitud que PROPERTY_EXPORT_MAX_ROWS (FASE 27), por la misma razón: nada sin paginar debería crecer sin límite. */
export const MAX_BULK_ACTION_TARGETS = 2000

export interface CreateBulkActionJobInput {
  entityType: BulkEntityType
  action: string
  params: Record<string, unknown>
  ids: number[]
}

/** Crea el job y una fila `pending` por elemento — nada se procesa todavía. */
export async function createBulkActionJob(event: H3Event, orgId: number, userId: number, input: CreateBulkActionJobInput) {
  const ids = [...new Set(input.ids)].filter((id) => Number.isFinite(id) && id > 0)
  if (!ids.length) throw createError({ statusCode: 422, statusMessage: 'No hay elementos seleccionados' })
  if (ids.length > MAX_BULK_ACTION_TARGETS) throw createError({ statusCode: 422, statusMessage: `Máximo ${MAX_BULK_ACTION_TARGETS} elementos por acción masiva` })

  const db = useDb(event)
  const nowTs = now()
  const [job] = await db
    .insert(schema.bulkActionJobs)
    .values({
      organizationId: orgId,
      entityType: input.entityType,
      action: input.action,
      paramsJson: JSON.stringify(input.params ?? {}),
      status: 'pending',
      totalCount: ids.length,
      requestedBy: userId,
      createdAt: nowTs,
    })
    .returning()

  await db.insert(schema.bulkActionJobItems).values(ids.map((targetId) => ({ jobId: job.id, targetId, status: 'pending' as const, createdAt: nowTs })))
  return job
}

export async function getBulkActionJob(event: H3Event, orgId: number, jobId: number) {
  const db = useDb(event)
  const job = (await db.select().from(schema.bulkActionJobs).where(and(eq(schema.bulkActionJobs.id, jobId), eq(schema.bulkActionJobs.organizationId, orgId))).limit(1))[0]
  if (!job) return null
  const items = await db.select().from(schema.bulkActionJobItems).where(eq(schema.bulkActionJobItems.jobId, jobId)).orderBy(schema.bulkActionJobItems.id)
  return { job, items }
}

/**
 * Reclama exactamente un elemento `pending` (nunca más de uno por llamada,
 * para que el progreso del cliente sea granular) de forma segura frente a
 * dos llamadas concurrentes sobre el mismo job: SELECT del candidato, UPDATE
 * condicionado a que siga en `pending` — el mismo compara-y-cambia que ya
 * usa `leads/routing.ts` (`pickByRoundRobin`) para su reparto round-robin.
 * Si el UPDATE no afecta ninguna fila, alguien más lo reclamó primero y se
 * reintenta con el siguiente candidato.
 */
async function claimNextPendingItem(db: any, jobId: number) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = (
      await db
        .select()
        .from(schema.bulkActionJobItems)
        .where(and(eq(schema.bulkActionJobItems.jobId, jobId), eq(schema.bulkActionJobItems.status, 'pending')))
        .orderBy(schema.bulkActionJobItems.id)
        .limit(1)
    )[0]
    if (!candidate) return null
    const claimed = await db
      .update(schema.bulkActionJobItems)
      .set({ status: 'processing' })
      .where(and(eq(schema.bulkActionJobItems.id, candidate.id), eq(schema.bulkActionJobItems.status, 'pending')))
      .returning()
    if (claimed.length) return claimed[0]
    // Perdió la carrera: otra llamada concurrente ya reclamó esta fila justo
    // entre el SELECT y el UPDATE — se reintenta con la siguiente candidata.
  }
  return null
}

/**
 * Procesa exactamente un elemento pendiente del job. Mismo contrato que
 * `asset-export-catalogs/[id]/process-next.post.ts`: el cliente sondea este
 * endpoint hasta que la respuesta trae `done: true`.
 */
export async function processNextBulkActionItem(event: H3Event, orgId: number, jobId: number, handlers: Record<string, BulkActionItemHandler>) {
  const db = useDb(event)
  const job = (await db.select().from(schema.bulkActionJobs).where(and(eq(schema.bulkActionJobs.id, jobId), eq(schema.bulkActionJobs.organizationId, orgId))).limit(1))[0]
  if (!job) throw createError({ statusCode: 404, statusMessage: 'Bulk action job not found' })
  if (TERMINAL_STATUSES.includes(job.status)) return { done: true, job }

  const item = await claimNextPendingItem(db, jobId)
  if (!item) return finalize()

  if (job.status === 'pending') await db.update(schema.bulkActionJobs).set({ status: 'processing' }).where(eq(schema.bulkActionJobs.id, jobId))

  const handler = handlers[job.action]
  const params = JSON.parse(job.paramsJson) as Record<string, unknown>
  try {
    if (!handler) throw createError({ statusCode: 422, statusMessage: `Acción desconocida: ${job.action}` })
    await handler(event, orgId, item.targetId, params)
    await db.update(schema.bulkActionJobItems).set({ status: 'done', completedAt: now() }).where(eq(schema.bulkActionJobItems.id, item.id))
    await db
      .update(schema.bulkActionJobs)
      .set({ completedCount: sql`${schema.bulkActionJobs.completedCount} + 1` })
      .where(eq(schema.bulkActionJobs.id, jobId))
    return { done: false, item: { id: item.id, targetId: item.targetId, status: 'done' } }
  } catch (err: any) {
    const message = String(err?.statusMessage || err?.message || 'Error').slice(0, 500)
    await db.update(schema.bulkActionJobItems).set({ status: 'failed', errorMessage: message, completedAt: now() }).where(eq(schema.bulkActionJobItems.id, item.id))
    await db
      .update(schema.bulkActionJobs)
      .set({ failedCount: sql`${schema.bulkActionJobs.failedCount} + 1` })
      .where(eq(schema.bulkActionJobs.id, jobId))
    return { done: false, item: { id: item.id, targetId: item.targetId, status: 'failed', errorMessage: message } }
  }

  // Sin elementos pendientes: el job termina — completed (todo bien),
  // failed (todo mal) o partial (mezcla), vocabulario exacto del encargo §103.
  async function finalize() {
    const [updated] = await db
      .update(schema.bulkActionJobs)
      .set({ status: job.failedCount > 0 ? (job.completedCount > 0 ? 'partial' : 'failed') : 'completed', completedAt: now() })
      .where(eq(schema.bulkActionJobs.id, jobId))
      .returning()
    return { done: true, job: updated }
  }
}
