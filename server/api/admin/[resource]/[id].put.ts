import { and, eq, sql } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'
import { requireOrgScope, requireSuperAdmin, type SessionUser } from '../../../utils/auth'
import { getResource, buildPayload, syncTranslations, assertPayloadReferences } from '../../../utils/adminResources'
import { logAdminAction } from '../../../utils/audit'
import { fireAutomationRules } from '../../../utils/publication/automations'
import { authorizeRecord, buildTenantWhere } from '../../../utils/tenantPolicy'
import { validatePermissionsInput } from '../../../utils/permissions'
import { describeOrganizationChanges, describeUserChanges } from '../../../utils/sensitiveAudit'
import { assertSchemaValid } from '../../../utils/properties/publication'
import { assertOwnsSavedView } from '../../../utils/properties/savedViews'
import { processNextBulkActionItem } from '../../../utils/bulkActions/service'
import { propertyBulkHandlers } from '../../../utils/bulkActions/propertyActions'
import { leadBulkHandlers } from '../../../utils/bulkActions/leadActions'

export default defineEventHandler(async (event) => {
  const { key, def } = getResource(event)
  let orgId: number | null = null
  let user: SessionUser
  if (def.superAdminOnly) {
    user = await requireSuperAdmin(event)
  } else {
    ;({ user, orgId } = await requireOrgScope(event, def.area, 'write'))
  }
  if (def.readonly) throw createError({ statusCode: 405, statusMessage: 'Resource is read-only' })
  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const db = useDb(event)

  // Resolve-then-act: every later step (including translation sync) works from
  // a record this tenant has been proven to own, instead of from a raw URL id.
  const { row: existing, authorized } = await authorizeRecord(db, {
    resourceKey: key,
    table: def.table,
    policy: def.tenantPolicy,
    id,
    orgId,
  })

  // Compartir un filtro/vista guardada amplía quién la LEE, nunca quién
  // puede tocarla — sólo su creador edita, aunque sea de toda la org.
  if (key === 'property-saved-views') assertOwnsSavedView(existing as any, user.id)

  // Bulk Actions (FASE 28) — "procesar el siguiente elemento" es una
  // transición de estado del job, no una edición de campos: se intercepta
  // aquí, con el mismo PUT que ya autoriza el job por tenant arriba, en vez
  // de una ruta nueva (coste cero de ruta, ver docs/property-schema-registry.md).
  if (key === 'property-bulk-jobs') {
    const jobRow = existing as any
    const handlers = propertyBulkHandlers(jobRow.entityType)
    const result = await processNextBulkActionItem(event, orgId!, id, handlers)
    return { ok: true, ...result }
  }
  if (key === 'lead-bulk-jobs') {
    const result = await processNextBulkActionItem(event, orgId!, id, leadBulkHandlers())
    return { ok: true, ...result }
  }

  const body = await readBody<Record<string, any>>(event)
  const data = await buildPayload(def, body || {}, false, event)
  delete data.organizationId // tenant ownership can't be reassigned via this endpoint
  delete data.userId // authorship can't be reassigned via this endpoint either
  // Re-validate any FK the payload touches: an update must not be able to
  // re-parent this row onto another tenant's record.
  await assertPayloadReferences(db, def, data, orgId, { isCreate: false })
  // Only an existing super_admin may mint another one — otherwise an org
  // admin could self-escalate to platform-wide access via a raw API call.
  if (key === 'users' && data.role === 'super_admin' && user.role !== 'super_admin') {
    throw createError({ statusCode: 403, statusMessage: 'Only a super_admin can grant that role' })
  }
  // Same reasoning as the role guard above, for the RBAC areas themselves —
  // only when the value actually changes, so a non-super_admin editing any
  // other field of a user (name, role, …) doesn't trip this on the
  // untouched `permissions` value that round-trips through the edit form.
  if (key === 'users' && 'permissions' in data && data.permissions !== (existing as any).permissions && user.role !== 'super_admin') {
    throw createError({ statusCode: 403, statusMessage: 'Only a super_admin can change permissions' })
  }
  // A permissions value the checker can't parse denies everything
  // (utils/permissions.ts) — refuse to store one in the first place rather
  // than let a typo lock an admin out of their own panel.
  if (key === 'users' && 'permissions' in data) {
    const problem = validatePermissionsInput(data.permissions)
    if (problem) throw createError({ statusCode: 422, statusMessage: problem })
  }

  const tenantWhere = buildTenantWhere(db, def.table, def.tenantPolicy, orgId)
  const idCond = eq(def.table.id, id)
  const where = tenantWhere ? and(idCond, tenantWhere) : idCond

  // Off-plan project prices are chartable on the public property page — every
  // real edit here becomes a real data point, never a fabricated one.
  // Also the two hooks for the Publication Scheduler's automation rules
  // (Fase 11): a real price drop or status change here can fire a rule that
  // re-publishes the property across its configured channels — see
  // server/utils/publication/automations.ts.
  let automationsFired = 0
  if (key === 'developer-properties') {
    if (typeof data.price === 'number' && existing.price !== data.price) {
      await db.insert(schema.priceHistory).values({ developerPropertyId: id, price: data.price, recordedAt: new Date().toISOString() })
      if (data.price < existing.price) {
        automationsFired += await fireAutomationRules(db, orgId!, id, 'price_drop', `precio ${existing.price} → ${data.price}`)
      }
    }
    if (typeof data.status === 'string' && existing.status !== data.status) {
      automationsFired += await fireAutomationRules(db, orgId!, id, 'status_change', `estado ${existing.status} → ${data.status}`)
    }
  }

  // The public article's comment_count only reflects visible (approved) comments —
  // moderating one into/out of "approved" here must keep that counter honest.
  // The article is reached through this comment's own (tenant-verified) row, and
  // `relations.articleId` guarantees it belongs to the same tenant.
  if (key === 'cms-comments' && typeof data.status === 'string' && existing.status !== data.status) {
    const articleId = data.articleId ?? existing.articleId
    const wasApproved = existing.status === 'approved'
    const nowApproved = data.status === 'approved'
    const articleWhere = and(eq(schema.cmsArticles.id, articleId), eq(schema.cmsArticles.organizationId, orgId!))
    if (!wasApproved && nowApproved) {
      await db.update(schema.cmsArticles).set({ commentCount: sql`${schema.cmsArticles.commentCount} + 1` }).where(articleWhere)
    } else if (wasApproved && !nowApproved) {
      await db.update(schema.cmsArticles).set({ commentCount: sql`max(${schema.cmsArticles.commentCount} - 1, 0)` }).where(articleWhere)
    }
  }

  // PropertySchemaRegistry (FASE 26) — valida el estado RESULTANTE (existente
  // + cambios), no sólo los campos tocados: antes de esto, `buildPayload()`
  // sólo exigía `required` en creación (isCreate), así que un PUT que
  // vaciara un campo obligatorio se guardaba sin más (auditoría FASE 26,
  // ver docs/property-schema-registry.md). `publishedAt` pasando de vacío a
  // un valor es el único "publicar" que existe hoy (developer-properties;
  // agent-properties no tiene consumidor público, ver auditoría) — ese caso
  // exige además los requiredForPublish; cualquier otro PUT sigue en modo
  // 'save', igual de permisivo que siempre.
  if (key === 'properties' || key === 'developer-properties') {
    const merged = { ...(existing as Record<string, unknown>), ...data }
    const isPublishing = key === 'developer-properties' && typeof data.publishedAt === 'string' && !(existing as any).publishedAt
    assertSchemaValid(key === 'developer-properties' ? 'developer' : 'agent', (merged.propertyType as string | null) ?? null, merged, isPublishing ? 'publish' : 'save')
  }

  if (Object.keys(data).length) {
    await db.update(def.table).set(data).where(where as any)
  }
  await syncTranslations(db, def, authorized, body?.translations)
  // Lo sensible se anota con detalle (server/utils/sensitiveAudit.ts): una
  // contraseña cambiada, un rol que sube, unos permisos que cambian, un
  // dominio que se mueve. El resto sigue como "update <recurso> <id>".
  const detail =
    key === 'users'
      ? describeUserChanges(existing as any, data)
      : key === 'organizations'
        ? describeOrganizationChanges(existing as any, data)
        : undefined
  await logAdminAction(event, { user, orgId, action: 'update', resource: key, resourceId: id, detail })
  return { ok: true, id, automationsFired: automationsFired || undefined }
})
