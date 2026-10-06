import { and, eq, sql } from 'drizzle-orm'
import { now, useDb, schema } from '../../../utils/db'
import { requireOrgScope, requireSuperAdmin, type SessionUser } from '../../../utils/auth'
import { getResource, buildPayload, syncTranslations, assertPayloadReferences, rethrowUniqueViolation } from '../../../utils/adminResources'
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
import { checkDomainAvailability } from '../../../utils/organizations/provisioning'
import { notifyOrganizationStatusChange } from '../../../utils/organizations/lifecycle'
import { updateContactFromAdmin, validateNotePayload, validatePropertyContact } from '../../../utils/contacts/crm'
import { updateLeadFromAdmin } from '../../../utils/leads/admin'
import { validateRoutingRule } from '../../../utils/leads/routing'
import {
  assertSheetReferences,
  assertSubtypeMatchesType,
  assertValidPropertyType,
  extractSheetPayload,
  hasSheetChanges,
  loadPropertySheet,
  propertyKindForResource,
  savePropertySheet,
  type SheetPayload,
} from '../../../utils/properties/extendedSheet'
import { isSubtypeOf } from '../../../../utils/propertySheet'
import { applyCommercialStatusRulesOnSave, assertPropertyDatesOnSave } from '../../../utils/properties/commercialStatus'
import { isPropertyTrashed } from '../../../utils/properties/trash'
import { documentUpdateFromBody, grantDocumentAccess, revokeDocumentAccess } from '../../../utils/properties/documents'
import { PROPERTY_FILE_COLUMNS, enforceSingleMainMedia, releaseMediaKeyIfUnreferenced, syncMediaKeyVisibility, validatePropertyMedia } from '../../../utils/properties/media'
import { isCustomFieldValueResource, validateCustomFieldDefinition } from '../../../utils/customFields/service'
import { isTagLinkResource } from '../../../utils/tags/service'
import { updateAutomation } from '../../../utils/automations/service'
import { runAutomationsForOrg } from '../../../utils/automations/engine'
import { prepareKnowledgeDocument } from '../../../utils/knowledge/documents'
import { prepareBrainSettings } from '../../../utils/inmo/brainCatalog'
import { applyPropertySelectionAction } from '../../../utils/selections/service'
import { markItemsSelectedForRequirement } from '../../../utils/matching/actions'

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
  // Valores de campos personalizados y etiquetas de una ficha: se guardan
  // (POST con todos los valores) o se quitan (DELETE del enlace), nunca se
  // editan fila a fila.
  if (isCustomFieldValueResource(key)) throw createError({ statusCode: 405, statusMessage: 'Los valores se guardan desde el panel de la ficha (POST con todos los valores)' })
  if (isTagLinkResource(key)) throw createError({ statusCode: 405, statusMessage: 'Una etiqueta se añade o se quita; no se edita' })
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
  // Selección de propiedades (FASE 11, cierre C2): reordenar, quitar o añadir
  // (`action`), con las mismas reglas que al crearla. Lo que se añade a una
  // selección ligada a una necesidad queda «Seleccionado» en su
  // compatibilidad si no había decisión, igual que «Crear selección».
  if (key === 'property-selections') {
    const res = await applyPropertySelectionAction(db, orgId!, id, body || {}, { userId: user.id })
    const requirementId = (existing as any).buyerRequirementId as number | null
    if (requirementId && res.added.length) await markItemsSelectedForRequirement(event, orgId!, requirementId, res.added, user.id)
    await logAdminAction(event, { user, orgId, action: 'update', resource: key, resourceId: id, detail: res.action === 'add' ? `${res.added.length} propiedad(es) añadida(s)` : res.action === 'remove' ? 'propiedad quitada' : 'reordenada' })
    return res
  }
  // Automatizaciones (bloque N8b): editar/activar/desactivar con el permiso
  // de quien lo hace, o «Procesar ahora» ({ action: 'run' }) — el mismo motor
  // que el cron, sólo para esta automatización de esta agencia.
  if (key === 'automations') {
    if (body?.action === 'run') {
      if ((existing as any).engine !== 'v1') throw createError({ statusCode: 422, statusMessage: 'Una regla de demostración heredada no se ejecuta' })
      if (!(existing as any).enabled) throw createError({ statusCode: 422, statusMessage: 'Está desactivada: actívala para que procese eventos' })
      const summary = await runAutomationsForOrg(db, orgId!, { event, env: (event.context as any).cloudflare?.env || {}, automationId: id })
      return { ok: true, id, summary }
    }
    const row = await updateAutomation(db, orgId!, user, existing, body || {})
    await logAdminAction(event, { user, orgId, action: 'update', resource: key, resourceId: id, detail: row.enabled ? 'activa' : 'desactivada' })
    return { ok: true, id, enabled: Boolean(row.enabled) }
  }
  // Contactos (FASES 8-9): edición con normalización, deduplicación frente a
  // otras personas de la agencia (409 salvo force) y roles.
  if (key === 'contacts') return updateContactFromAdmin(event, orgId!, user, id, body || {})
  // Leads: datos de captación con deduplicación; etapa, resultado y comercial van por sus rutas con historial.
  if (key === 'leads') return updateLeadFromAdmin(event, orgId!, user, id, body || {})
  // Documentos (FASE 6): conceder/revocar acceso a un contacto, o editar
  // metadatos (tipo, título, fechas, notas, visibilidad). El fichero y la
  // propiedad no cambian por aquí.
  if (key === 'property-documents') {
    const doc = existing as Record<string, any>
    if (body?.action === 'grant' || body?.action === 'revoke') {
      const contactId = Number(body.contactId)
      const res = body.action === 'grant' ? await grantDocumentAccess(db, orgId!, user.id, doc, contactId) : await revokeDocumentAccess(db, orgId!, doc, contactId)
      await logAdminAction(event, { user, orgId, action: body.action === 'grant' ? 'update' : 'revoke', resource: key, resourceId: id, detail: `${body.action === 'grant' ? 'acceso concedido' : 'acceso revocado'} al contacto ${contactId}` })
      return { ...res, id }
    }
    const docData = documentUpdateFromBody(body || {}, doc)
    if (Object.keys(docData).length) {
      await db.update(def.table).set(docData).where(and(eq(def.table.id, id), eq(schema.propertyDocuments.organizationId, orgId!)))
    }
    await logAdminAction(event, { user, orgId, action: 'update', resource: key, resourceId: id })
    return { ok: true, id }
  }
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

  // Sistemas > Empresas > ficha: las mismas reglas que el alta (provisioning.ts)
  // — dominio libre con un 409 claro en vez del 500 del índice único, color
  // #RRGGBB y almacenamiento en GB enteros. El origen del alta y las
  // dimensiones de aprobación/pago no están en `fields`: no se editan aquí.
  if (key === 'organizations') {
    if (typeof data.domain === 'string' && data.domain) {
      const check = await checkDomainAvailability(db, data.domain, { excludeOrganizationId: id })
      if (!check.available) throw createError({ statusCode: 409, statusMessage: check.message || 'Ese dominio no está disponible.' })
    }
    if (typeof data.brandColor === 'string' && data.brandColor) {
      if (!/^#[0-9a-fA-F]{6}$/.test(data.brandColor)) throw createError({ statusCode: 422, statusMessage: 'El color debe tener el formato #RRGGBB (por ejemplo, #1F6F5C).' })
      data.brandColor = data.brandColor.toUpperCase()
    }
    if (body?.storageLimitGb != null && body.storageLimitGb !== '') {
      const gb = Number(body.storageLimitGb)
      if (!Number.isInteger(gb) || gb < 1 || gb > 1000) throw createError({ statusCode: 422, statusMessage: 'El almacenamiento debe ser un número entero de GB entre 1 y 1000.' })
      data.storageBytesLimit = gb * 1024 ** 3
    }
  }

  if (key === 'property-contacts') await validatePropertyContact(db, orgId!, data, existing as any)
  if (key === 'notes') await validateNotePayload(db, orgId!, data, existing as any)
  if (key === 'lead-routing-rules') await validateRoutingRule(db, orgId!, data, existing as any)
  if (key === 'property-media') await validatePropertyMedia(db, orgId!, data, existing as any)
  if (key === 'custom-fields') await validateCustomFieldDefinition(db, orgId!, data, existing as any)
  // Bloque N8b: se validan con la fila existente (search_text necesita el
  // documento entero; un ajuste de cerebro, saber de qué perfil es).
  if (key === 'knowledge-documents') prepareKnowledgeDocument(data, false, existing as any)
  if (key === 'inmo-brains') {
    prepareBrainSettings(data, false, existing as any)
    data.updatedBy = user.id
  }

  const tenantWhere = buildTenantWhere(db, def.table, def.tenantPolicy, orgId)
  const idCond = eq(def.table.id, id)
  const where = tenantWhere ? and(idCond, tenantWhere) : idCond

  // PropertySchemaRegistry (FASE 26) — valida el estado RESULTANTE (existente
  // + cambios), no sólo los campos tocados: antes de esto, `buildPayload()`
  // sólo exigía `required` en creación (isCreate), así que un PUT que
  // vaciara un campo obligatorio se guardaba sin más (auditoría FASE 26,
  // ver docs/property-schema-registry.md). `publishedAt` pasando de vacío a
  // un valor es el único "publicar" que existe hoy (developer-properties;
  // agent-properties no tiene consumidor público, ver auditoría) — ese caso
  // exige además los requiredForPublish; cualquier otro PUT sigue en modo
  // 'save', igual de permisivo que siempre.
  //
  // Va ANTES del histórico de precios y de las automatizaciones: un PUT que
  // acaba en 422 no puede haber dejado ya una fila de histórico con un
  // precio que nunca se guardó, ni haber disparado una republicación.
  const propertyKind = propertyKindForResource(key)
  let sheet: SheetPayload | null = null
  if (propertyKind) {
    const merged = { ...(existing as Record<string, unknown>), ...data }
    const isPublishing = key === 'developer-properties' && typeof data.publishedAt === 'string' && !(existing as any).publishedAt
    assertSchemaValid(key === 'developer-properties' ? 'developer' : 'agent', (merged.propertyType as string | null) ?? null, merged, isPublishing ? 'publish' : 'save')
    // Tipo de inmueble: lista común de los dos catálogos. Sólo se exige al
    // CAMBIARLO — una ficha antigua con un tipo fuera de la lista se sigue
    // pudiendo guardar sin tocarlo (el autoguardado reenvía la ficha entera).
    if ('propertyType' in data && data.propertyType !== (existing as any).propertyType) assertValidPropertyType(data.propertyType)
    // Estado y precio — los que se editan también desde la fila del listado
    // (edición inline, cierre C1): el estado tiene que ser uno del catálogo y
    // el precio no puede ser negativo. Mismo criterio que el tipo: sólo al
    // CAMBIARLOS, para no bloquear el guardado de una ficha antigua.
    const statusDef = def.fields.status
    if ('status' in data && data.status !== (existing as any).status && statusDef?.options && !statusDef.options.includes(data.status)) {
      throw createError({ statusCode: 422, statusMessage: `Estado no válido para este catálogo. Usa uno de: ${statusDef.options.map((o) => statusDef.optionLabels?.[o] || o).join(', ')}.` })
    }
    if (typeof data.price === 'number' && data.price !== (existing as any).price && data.price < 0) {
      throw createError({ statusCode: 422, statusMessage: 'El precio no puede ser negativo.' })
    }
    // Ficha ampliada (migración 0086): validada aquí, guardada tras el UPDATE.
    sheet = extractSheetPayload(body || {})
    const typeChanged = 'propertyType' in data && data.propertyType !== (existing as any).propertyType
    if ('subtype' in sheet.details) {
      assertSubtypeMatchesType(sheet.details.subtype, merged.propertyType)
    } else if (typeChanged) {
      // Cambiar el tipo invalida un subtipo que ya no le corresponde.
      const current = await loadPropertySheet(db, orgId!, propertyKind, id)
      if (current.subtype && !isSubtypeOf(current.subtype, merged.propertyType)) sheet.details.subtype = null
    }
    await assertSheetReferences(db, sheet, orgId!)
    // Cierre D1p: fechas de gestión en AAAA-MM-DD (sólo al cambiarlas) y
    // convivencia del estado comercial con «Reservada» y la disponibilidad
    // (sólo si el estado comercial o la disponibilidad cambian).
    assertPropertyDatesOnSave(data, existing as Record<string, any>)
    await applyCommercialStatusRulesOnSave(db, orgId!, propertyKind, id, data, sheet, existing as Record<string, any>)
  }
  // Motivo del cambio de precio (opcional): viaja con el PUT de la ficha y
  // sólo se usa si el precio cambia de verdad.
  const priceReason = typeof body?.priceChangeReason === 'string' && body.priceChangeReason.trim() ? body.priceChangeReason.trim().slice(0, 500) : null

  // Off-plan project prices are chartable on the public property page — every
  // real edit here becomes a real data point, never a fabricated one.
  // Also the two hooks for the Publication Scheduler's automation rules
  // (Fase 11): a real price drop or status change here can fire a rule that
  // re-publishes the property across its configured channels — see
  // server/utils/publication/automations.ts.
  //
  // Papelera: una ficha borrada se puede seguir editando (para dejarla lista
  // antes de restaurarla; sólo «Restaurar» la saca de ahí), pero nunca
  // dispara una republicación — eso la volvería a sacar a los portales.
  let automationsFired = 0
  const trashed = isPropertyTrashed(existing as { deletedAt?: string | null })
  if (key === 'developer-properties') {
    if (typeof data.price === 'number' && existing.price !== data.price) {
      await db.insert(schema.priceHistory).values({ developerPropertyId: id, price: data.price, previousPrice: existing.price ?? null, changedBy: user.id, reason: priceReason, recordedAt: now() })
      if (data.price < existing.price && !trashed) {
        automationsFired += await fireAutomationRules(db, orgId!, id, 'price_drop', `precio ${existing.price} → ${data.price}`)
      }
    }
    if (typeof data.status === 'string' && existing.status !== data.status && !trashed) {
      automationsFired += await fireAutomationRules(db, orgId!, id, 'status_change', `estado ${existing.status} → ${data.status}`)
    }
  }
  // FASE 28 §94 — 2ª mano también: un cambio real de precio a mano deja su
  // fila en agent_property_price_history, igual que la acción en bloque
  // (bulkActions/propertyActions.ts#updatePrice). Antes sólo escribía ahí
  // la acción en bloque, así que el histórico de 2ª mano no recogía las
  // ediciones de la ficha. Las dos tablas usan `now()` (el mismo formato que
  // la acción en bloque): con ISO aquí y `YYYY-MM-DD HH:MM:SS` allí, dos
  // filas del mismo día se ordenaban mal al comparar el texto.
  if (key === 'properties' && typeof data.price === 'number' && existing.price !== data.price) {
    await db.insert(schema.agentPropertyPriceHistory).values({ propertyId: id, price: data.price, previousPrice: existing.price ?? null, changedBy: user.id, reason: priceReason, recordedAt: now() })
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

  if (Object.keys(data).length) {
    await db.update(def.table).set(data).where(where as any).catch(rethrowUniqueViolation)
  }
  if (propertyKind && sheet && hasSheetChanges(sheet)) await savePropertySheet(db, orgId!, propertyKind, id, sheet, user.id)
  await syncTranslations(db, def, authorized, body?.translations)
  // Multimedia (FASE 7): un fichero sustituido o quitado no se queda
  // huérfano si ya nadie lo usa, y «privado» decide si se sirve sin sesión.
  const prev = existing as Record<string, any>
  if (key === 'property-media') {
    const row = { ...prev, ...data }
    await enforceSingleMainMedia(db, orgId!, { id, propertyKind: row.propertyKind, propertyId: row.propertyId, mediaType: row.mediaType, isMain: row.isMain ? 1 : 0 })
    if ('r2Key' in data && data.r2Key !== prev.r2Key) await releaseMediaKeyIfUnreferenced(db, orgId!, prev.r2Key)
    if (row.r2Key) await syncMediaKeyVisibility(db, orgId!, row.r2Key)
  }
  if (key === 'project-images' || key === 'gallery-images' || key === 'floor-plans' || key === 'agent-property-floor-plans') {
    if ('image' in data && data.image !== prev.image) await releaseMediaKeyIfUnreferenced(db, orgId!, prev.image)
    if ('image' in data || 'isPrivate' in data) await syncMediaKeyVisibility(db, orgId!, data.image ?? prev.image)
  }
  if (propertyKind) {
    for (const col of PROPERTY_FILE_COLUMNS[propertyKind]) {
      if (col in data && data[col] !== prev[col]) await releaseMediaKeyIfUnreferenced(db, orgId!, prev[col])
    }
  }
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
  // Activar/suspender una empresa avisa a sus administradores y al super
  // admin (email de plataforma). Nunca bloquea ni deshace el cambio.
  if (key === 'organizations' && typeof data.status === 'string' && data.status !== (existing as any).status) {
    const org = existing as any
    await notifyOrganizationStatusChange(event, { id, name: data.name ?? org.name, companyName: data.companyName ?? org.companyName, emailLocale: data.emailLocale ?? org.emailLocale }, org.status, data.status)
  }
  return { ok: true, id, automationsFired: automationsFired || undefined }
})
