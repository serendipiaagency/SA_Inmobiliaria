import { eq } from 'drizzle-orm'
import { cfEnv, schema, useDb } from '../../../utils/db'
import { requireOrgScope, requireSuperAdmin, type SessionUser } from '../../../utils/auth'
import { getResource } from '../../../utils/adminResources'
import { logAdminAction } from '../../../utils/audit'
import { describeUserCreation } from '../../../utils/sensitiveAudit'
import { createBulkActionJob } from '../../../utils/bulkActions/service'
import { resolveFilteredPropertyIds } from '../../../utils/bulkActions/propertyActions'
import { validateLeadBulkParams } from '../../../utils/bulkActions/leadActions'
import { executeTool } from '../../../utils/tools/execute'
import { InmoError } from '../../../utils/inmo/orchestrator'
import { deleteConversation, renameConversation, runPersistentInmoTurn } from '../../../utils/inmo/conversations'
import { advanceWorkflow, startWorkflow } from '../../../utils/inmo/workflows'
import { createAutomation } from '../../../utils/automations/service'
import { createOrganizationFromAdmin, resendAdminInvite } from '../../../utils/organizations/lifecycle'
import { handleDemoAction } from '../../../demo/admin'
import { createContactFromAdmin } from '../../../utils/contacts/crm'
import { createLeadFromAdmin } from '../../../utils/leads/admin'
import { resolveFilteredLeadIds, d1Runner } from '../../../utils/leads/list'
import { customFieldValuesResourcePost, isCustomFieldValueResource } from '../../../utils/customFields/service'
import { addTagToEntity, isTagLinkResource, TAG_LINK_RESOURCES } from '../../../utils/tags/service'
import { isCommercialStatus } from '../../../../utils/propertyCommercialStatus'
import { organizationCurrency } from '../../../utils/currency'
import { insertResourceRecord } from '../../../utils/adminResourceCreate'

export default defineEventHandler(async (event) => {
  const { key, def } = getResource(event)

  // Domain Tools API (FASE 31): ejecutar una herramienta no es dar de alta
  // una fila. Va ANTES del requireOrgScope(def.area, 'write') genérico: una
  // herramienta de lectura (search_properties) no exige escribir en ningún
  // sitio, y el área de cada una la comprueba executeTool() — nunca el cliente.
  if (key === 'domain-tools') {
    const { user, orgId } = await requireOrgScope(event)
    const body = (await readBody<Record<string, any>>(event)) || {}
    const toolCtx = { event, db: useDb(event), env: cfEnv(event) as Record<string, any>, orgId, user, source: 'api' as const }
    // INMO (FASE 30) es un cliente más de esta misma API: mismo usuario, mismo RBAC, misma organización.
    // Bloque N8b: con memoria (la conversación la guarda el servidor, de este
    // usuario en esta agencia: `conversationId`) y con cerebro (`brain`).
    if (body.mode === 'inmo') {
      const [org] = await toolCtx.db.select({ name: schema.organizations.name }).from(schema.organizations).where(eq(schema.organizations.id, orgId)).limit(1)
      try {
        return await runPersistentInmoTurn(
          toolCtx,
          { conversationId: body.conversationId, brain: body.brain, messages: body.messages, userMessage: body.message, resolve: body.resolve, entities: body.entities },
          // La moneda de la agencia, para que INMO cite los importes con ella (utils/currency.ts).
          { fetch: (input, init) => fetch(input, init), orgName: org?.name ?? null, currency: await organizationCurrency(toolCtx.db, orgId) },
        )
      } catch (e) {
        if (!(e instanceof InmoError)) throw e
        setResponseStatus(event, e.code === 'AI_NOT_CONFIGURED' ? 503 : e.code === 'PROVIDER_ERROR' ? 502 : 422)
        return { ok: false, error: { code: e.code, message: e.message } }
      }
    }
    // Conversaciones de INMO: sólo las propias (otra persona u otra agencia → 404).
    if (body.mode === 'inmo-conversation') {
      const id = Number(body.id)
      if (body.action === 'delete') return deleteConversation(toolCtx.db, orgId, user.id, id)
      if (body.action === 'rename') return renameConversation(toolCtx.db, orgId, user.id, id, body.title)
      throw createError({ statusCode: 422, statusMessage: 'Acción no válida (delete o rename)' })
    }
    // Workflows guiados de INMO: cada paso, una Domain Tool tras «Ejecutar paso».
    if (body.mode === 'workflow') {
      const wfCtx = { ...toolCtx, source: 'inmo' as const }
      if (body.action === 'start') return startWorkflow(wfCtx, body.workflow, body.entityId)
      return advanceWorkflow(wfCtx, Number(body.runId), { action: body.action, step: body.step, params: body.params })
    }
    const result = await executeTool(toolCtx, String(body.tool || ''), body.input ?? {}, {
      idempotencyKey: body.idempotencyKey ? String(body.idempotencyKey) : null,
      confirmed: body.confirmed === true,
    })
    if (!result.ok) setResponseStatus(event, TOOL_ERROR_STATUS[result.error.code] ?? 400)
    return result
  }
  let orgId: number | null = null
  let user: SessionUser
  if (def.superAdminOnly) {
    user = await requireSuperAdmin(event)
  } else {
    ;({ user, orgId } = await requireOrgScope(event, def.area, 'write'))
  }
  if (def.readonly) throw createError({ statusCode: 405, statusMessage: 'Resource is read-only' })
  // Una selección se crea desde una compatibilidad («Crear selección») o con
  // INMO, con su propia validación (server/utils/selections/service.ts); aquí
  // sólo se ve, se reordena, se amplía o se recorta (PUT /:id con `action`).
  if (key === 'property-selections') throw createError({ statusCode: 405, statusMessage: 'Las selecciones se crean desde una compatibilidad («Crear selección») o con INMO' })
  const db = useDb(event)
  const body = await readBody<Record<string, any>>(event)

  // Sistemas > Empresas > + Nuevo: el alta de una empresa no es una fila
  // suelta — pasa por el mismo provisioning que el registro público
  // (server/utils/organizations/), con administrador inicial invitado por
  // email, auditoría y validación por paso del asistente. superAdminOnly ya
  // se comprobó arriba (requireSuperAdmin).
  if (key === 'organizations') {
    if (body?.action === 'resend-invite') return resendAdminInvite(event, user, body)
    // Cuenta demo «Norte Astur Inmobiliaria» (server/demo/).
    if (typeof body?.action === 'string' && body.action.startsWith('demo-')) return handleDemoAction(event, user, body)
    return createOrganizationFromAdmin(event, user, body || {})
  }

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
    // «Cambiar estado comercial» (cierre D1p): un valor fuera del vocabulario
    // común se rechaza aquí, antes de crear un job que fallaría en cada fila.
    if (body.action === 'change_commercial_status' && !isCommercialStatus(body.params?.commercialStatus)) {
      throw createError({ statusCode: 422, statusMessage: 'Elige un estado comercial válido (disponible, reservada, vendida, alquilada, retirada o borrador)' })
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

  // Bulk Actions sobre Leads (FASE 28 incremento 3) — sin "todos los
  // filtrados": pages/admin/leads/index.vue no pagina (un único listado con tope
  // de 200 filas, ver leads.get.ts), así que lo que ya está cargado en
  // pantalla ES la selección filtrada completa — nunca hace falta
  // resolverla otra vez del lado servidor como sí hace Properties.
  if (key === 'lead-bulk-jobs') {
    if (typeof body?.action !== 'string' || !body.action) {
      throw createError({ statusCode: 422, statusMessage: 'Falta la acción' })
    }
    // «Cambiar fase» en bloque exige su motivo (FASE 13), antes de crear nada.
    const leadJobParams = validateLeadBulkParams(body.action, body.params || {})
    // Única excepción (FASE 32): «Recalcular Lead Score» para TODOS los leads
    // de la agencia tras cambiar sus reglas — no es una selección de pantalla
    // sino la organización entera, resuelta aquí y con el mismo tope de 2000.
    let ids: number[] = Array.isArray(body.ids) ? body.ids.map(Number) : []
    if (body.selectAllFiltered && body.filters && typeof body.filters === 'object') {
      // «Seleccionar todos los filtrados» (bloque N7b): el listado de leads ya
      // pagina, así que la selección completa la resuelve el servidor con el
      // MISMO filtro que la Tabla (server/utils/leads/list.ts), con el tope de
      // siempre.
      ids = await resolveFilteredLeadIds(d1Runner(cfEnv(event).DB), orgId!, body.filters, 2000)
      if (ids.length > 2000) throw createError({ statusCode: 422, statusMessage: `La selección filtrada tiene más de 2000 leads — el máximo por acción masiva es 2000. Añade más filtros para acotarla.` })
    } else if (body.selectAllFiltered && body.action === 'recalculate_score') {
      const rows = await db.select({ id: schema.leads.id }).from(schema.leads).where(eq(schema.leads.organizationId, orgId!)).limit(2001)
      if (rows.length > 2000) throw createError({ statusCode: 422, statusMessage: 'La agencia tiene más de 2000 leads — recalcula por partes desde el listado.' })
      ids = rows.map((r: { id: number }) => r.id)
    }
    const job = await createBulkActionJob(event, orgId!, user.id, { entityType: 'lead', action: body.action, params: leadJobParams, ids })
    await logAdminAction(event, { user, orgId, action: 'create', resource: key, resourceId: job.id, detail: `${job.action} × ${job.totalCount}` })
    return { ok: true, id: job.id, job }
  }

  // Automatizaciones (bloque N8b): disparador, condiciones y acción del
  // catálogo, validados, con el permiso de quien la configura (403 si no
  // podría ejecutar la acción) y el cursor en «ahora».
  if (key === 'automations') {
    const row = await createAutomation(db, orgId!, user, body || {})
    await logAdminAction(event, { user, orgId, action: 'create', resource: key, resourceId: row.id, detail: `${row.trigger} → ${row.action}` })
    return { ok: true, id: row.id }
  }

  // Contactos (FASES 8-9): alta con normalización, deduplicación (409 con
  // candidatos salvo force) y roles — el mismo camino que Contactos → Nuevo.
  if (key === 'contacts') return createContactFromAdmin(event, orgId!, user, body || {})
  // Leads (FASES 12-16): alta manual con deduplicación (409 con candidatos,
  // `mergeIntoLeadId` para unificar o `force` para crear igualmente) y
  // enrutado — el mismo `insertLead()` que la captación pública.
  if (key === 'leads') return createLeadFromAdmin(event, orgId!, user, body || {})
  // Documentos de una propiedad (FASE 6): el alta lleva el fichero, así que
  // va por la subida privada (multipart) y nunca por un JSON sin fichero.
  if (key === 'property-documents') {
    throw createError({ statusCode: 422, statusMessage: 'Un documento se da de alta con su fichero: usa POST /api/admin/property-documents/private-upload.' })
  }
  // Campos personalizados de una ficha (FASE 0): guardar los valores de UN
  // registro — validados por tipo, con el registro y cada definición
  // comprobados contra la organización.
  if (isCustomFieldValueResource(key)) {
    const res = await customFieldValuesResourcePost(db, orgId!, user.id, key, body || {})
    await logAdminAction(event, { user, orgId, action: 'update', resource: key, resourceId: res.ref.entityId, detail: `${res.ref.entityType}:${res.ref.entityKind}` })
    return res
  }
  // Etiquetar a mano (FASE 0): por nombre (se crea si no existe) o por id de una etiqueta de la agencia.
  if (isTagLinkResource(key)) {
    const res = await addTagToEntity(db, orgId!, TAG_LINK_RESOURCES[key]!, body || {})
    await logAdminAction(event, { user, orgId, action: 'create', resource: key, resourceId: res.tag.id, detail: `${body?.entityType}:${body?.entityId}` })
    return { ok: true, ...res }
  }

  const { id, data } = await insertResourceRecord(db, key, def, body, { orgId, user, event })

  // Un alta de usuario deja constancia del rol (y, si lo hay, del
  // super_admin concedido): es lo que se busca cuando aparece una cuenta que
  // nadie recuerda haber creado. Nunca la contraseña.
  const detail = key === 'users' ? describeUserCreation(data) : undefined
  await logAdminAction(event, { user, orgId, action: 'create', resource: key, resourceId: id, detail })
  if (def.afterCreate) await def.afterCreate(event, id, data)
  return { ok: true, id }
})

/** Código HTTP de cada error tipado de las Domain Tools; el cuerpo lleva siempre el código. */
const TOOL_ERROR_STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  UNKNOWN_TOOL: 404,
  AMBIGUOUS_ENTITY: 409,
  CONFLICT: 409,
  DUPLICATE: 409,
  CONFIRMATION_REQUIRED: 409,
  VALIDATION_ERROR: 422,
  PROPERTY_NOT_PUBLISHABLE: 422,
  PERMISSION_DENIED: 403,
  PROVIDER_ERROR: 502,
  INTERNAL_ERROR: 500,
}
