import { useDb } from '../../../utils/db'
import { requireOrgScope, requireSuperAdmin, type SessionUser } from '../../../utils/auth'
import { getResource, buildPayload, syncTranslations, assertPayloadReferences } from '../../../utils/adminResources'
import { logAdminAction } from '../../../utils/audit'
import { authorizeRecord } from '../../../utils/tenantPolicy'
import { validatePermissionsInput } from '../../../utils/permissions'
import { describeUserCreation } from '../../../utils/sensitiveAudit'
import { getPropertySchemaFor, validateAgainstSchema } from '../../../utils/propertySchema/registry'
import { createBulkActionJob } from '../../../utils/bulkActions/service'
import { resolveFilteredPropertyIds } from '../../../utils/bulkActions/propertyActions'

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
  const db = useDb(event)
  const body = await readBody<Record<string, any>>(event)

  // Bulk Actions (FASE 28) — crear un job tiene forma propia (acción +
  // parámetros + selección), no es un alta de fila con campos: se
  // intercepta aquí, antes de que buildPayload() intente tratarlo como uno.
  if (key === 'property-bulk-jobs') {
    if (body?.entityType !== 'agent' && body?.entityType !== 'developer') {
      throw createError({ statusCode: 422, statusMessage: 'entityType debe ser "agent" o "developer"' })
    }
    if (typeof body?.action !== 'string' || !body.action) {
      throw createError({ statusCode: 422, statusMessage: 'Falta la acción' })
    }
    const ids = body.selectAllFiltered
      ? await resolveFilteredPropertyIds(event, orgId!, body.entityType, body.filters || {})
      : Array.isArray(body.ids)
        ? body.ids.map(Number)
        : []
    if (body.selectAllFiltered && ids.length > 2000) {
      throw createError({ statusCode: 422, statusMessage: `La selección filtrada tiene ${ids.length} elementos — el máximo por acción masiva es 2000. Añade más filtros para acotarla.` })
    }
    const job = await createBulkActionJob(event, orgId!, user.id, { entityType: body.entityType, action: body.action, params: body.params || {}, ids })
    await logAdminAction(event, { user, orgId, action: 'create', resource: key, resourceId: job.id, detail: `${job.action} × ${job.totalCount}` })
    return { ok: true, id: job.id, job }
  }

  const data = await buildPayload(def, body || {}, true, event)
  // Tenant ownership is always server-resolved, never taken from client input —
  // for direct-policy resources it's the org column, for child resources it's
  // the parent FK, which must point at a row this tenant already owns.
  delete data.organizationId
  await assertPayloadReferences(db, def, data, orgId, { isCreate: true })
  // Only an existing super_admin may mint another one — otherwise an org
  // admin could self-escalate to platform-wide access via a raw API call.
  if (key === 'users' && data.role === 'super_admin' && user.role !== 'super_admin') {
    throw createError({ statusCode: 403, statusMessage: 'Only a super_admin can grant that role' })
  }
  // Same reasoning as the role guard above, for the RBAC areas themselves:
  // otherwise any admin with write access to Usuarios could hand out (or
  // remove) other admins' area restrictions, including their own.
  if (key === 'users' && data.permissions != null && user.role !== 'super_admin') {
    throw createError({ statusCode: 403, statusMessage: 'Only a super_admin can set permissions' })
  }
  // A permissions value the checker can't parse denies everything
  // (utils/permissions.ts) — refuse to store one in the first place rather
  // than let a typo lock the new admin out of their own panel.
  if (key === 'users' && data.permissions != null) {
    const problem = validatePermissionsInput(data.permissions)
    if (problem) throw createError({ statusCode: 422, statusMessage: problem })
  }
  if (def.tenantPolicy.type === 'direct' && orgId != null) {
    data[def.tenantPolicy.organizationField ?? 'organizationId'] = orgId
  }
  // Quién creó un filtro/vista guardada (FASE 27 incremento 2) es siempre el
  // usuario de la sesión, nunca algo que el cliente pueda mandar — mismo
  // criterio que organizationId dos líneas arriba.
  if (key === 'property-saved-views') data.userId = user.id
  // PropertySchemaRegistry (FASE 26) — modo 'save' únicamente: una Property
  // incompleta debe poder crearse como borrador (§21); ver docs/property-schema-registry.md.
  if (key === 'properties' || key === 'developer-properties') {
    const propertySchema = getPropertySchemaFor(key === 'developer-properties' ? 'developer' : 'agent', data.propertyType ?? null)
    const result = validateAgainstSchema(propertySchema, data, 'save')
    if (!result.ok) throw createError({ statusCode: 422, statusMessage: `Faltan campos obligatorios para guardar: ${result.missingForSave.join(', ')}` })
  }
  const inserted = await db.insert(def.table).values(data).returning({ id: def.table.id })
  const id = inserted[0]?.id

  if (def.translations && Array.isArray(body?.translations)) {
    const { authorized } = await authorizeRecord(db, { resourceKey: key, table: def.table, policy: def.tenantPolicy, id, orgId })
    await syncTranslations(db, def, authorized, body.translations)
  }
  // Un alta de usuario deja constancia del rol (y, si lo hay, del
  // super_admin concedido): es lo que se busca cuando aparece una cuenta que
  // nadie recuerda haber creado. Nunca la contraseña.
  const detail = key === 'users' ? describeUserCreation(data) : undefined
  await logAdminAction(event, { user, orgId, action: 'create', resource: key, resourceId: id, detail })
  if (def.afterCreate) await def.afterCreate(event, id, data)
  return { ok: true, id }
})
