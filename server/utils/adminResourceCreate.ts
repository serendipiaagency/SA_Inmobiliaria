import type { H3Event } from 'h3'
import type { SessionUser } from './auth'
import { buildPayload, syncTranslations, assertPayloadReferences, rethrowUniqueViolation, type ResourceDef } from './adminResources'
import { authorizeRecord } from './tenantPolicy'
import { validatePermissionsInput } from './permissions'
import { getPropertySchemaFor, validateAgainstSchema } from './propertySchema/registry'
import { validatePropertyContact, validateNotePayload, ensureContactRole } from './contacts/crm'
import { validateRoutingRule } from './leads/routing'
import { enforceSingleMainMedia, syncMediaKeyVisibility, validatePropertyMedia } from './properties/media'
import { validateCustomFieldDefinition } from './customFields/service'
import { assertNoBrainSettings } from './inmo/brains'
import {
  assertSheetReferences,
  assertSubtypeMatchesType,
  assertValidPropertyType,
  extractSheetPayload,
  hasSheetChanges,
  propertyKindForResource,
  savePropertySheet,
  type SheetPayload,
} from './properties/extendedSheet'
import { applyCommercialStatusRulesOnSave, assertPropertyDatesOnSave } from './properties/commercialStatus'

/**
 * El alta genérica de una fila de un recurso del panel
 * (POST /api/admin/:resource): payload permitido, referencias de la misma
 * organización, reglas de cada recurso (ficha ampliada y estado comercial de
 * una propiedad, propietarios, notas, multimedia, campos personalizados…) y
 * traducciones.
 *
 * Vive aquí, y no dentro del handler, para que el seed de la cuenta demo
 * (server/demo/) cree sus filas por EXACTAMENTE el mismo camino que el
 * panel. Lo que es de la petición —auditoría y efectos posteriores al alta
 * (`afterCreate`)— lo sigue haciendo el handler.
 */
export async function insertResourceRecord(
  db: any,
  key: string,
  def: ResourceDef,
  body: Record<string, any> | null | undefined,
  ctx: { orgId: number | null; user: SessionUser; event?: H3Event },
): Promise<{ id: number; data: Record<string, any> }> {
  const { orgId, user, event } = ctx
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
  const propertyKind = propertyKindForResource(key)
  let sheet: SheetPayload | null = null
  if (propertyKind) {
    const propertySchema = getPropertySchemaFor(key === 'developer-properties' ? 'developer' : 'agent', data.propertyType ?? null)
    const result = validateAgainstSchema(propertySchema, data, 'save')
    if (!result.ok) throw createError({ statusCode: 422, statusMessage: `Faltan campos obligatorios para guardar: ${result.missingForSave.join(', ')}` })
    assertValidPropertyType(data.propertyType)
    // Ficha ampliada (migración 0086) — se valida ANTES de insertar nada.
    sheet = extractSheetPayload(body || {})
    assertSubtypeMatchesType(sheet.details.subtype, data.propertyType)
    await assertSheetReferences(db, sheet, orgId!)
    // Cierre D1p: fechas de gestión en AAAA-MM-DD y estado comercial ↔ «Reservada» / disponibilidad.
    assertPropertyDatesOnSave(data, null)
    await applyCommercialStatusRulesOnSave(db, orgId!, propertyKind, null, data, sheet, null)
    // Quién dio de alta la propiedad: siempre la sesión, nunca el cliente.
    data.createdBy = user.id
  }
  // Propietarios/contactos de una propiedad y notas: la propiedad o la
  // entidad a la que apuntan se valida por tipo (y por organización) antes de
  // escribir; el autor es siempre la sesión.
  if (key === 'property-contacts') {
    await validatePropertyContact(db, orgId!, data, null)
    data.createdBy = user.id
  }
  if (key === 'notes') {
    await validateNotePayload(db, orgId!, data, null)
    data.createdBy = user.id
  }
  if (key === 'lead-routing-rules') await validateRoutingRule(db, orgId!, data, null)
  // Multimedia (FASE 7): propiedad de la agencia y viva, tipo, fuente y fichero propio.
  if (key === 'property-media') {
    await validatePropertyMedia(db, orgId!, data, null)
    data.createdBy = user.id
  }
  if (key === 'custom-fields') {
    await validateCustomFieldDefinition(db, orgId!, data, null)
    data.createdBy = user.id
  }
  // Bloque N8b: el autor del documento y de los ajustes de un cerebro es siempre la sesión.
  if (key === 'knowledge-documents') data.createdBy = user.id
  if (key === 'inmo-brains') {
    await assertNoBrainSettings(db, orgId!, data.brainKey)
    data.updatedBy = user.id
  }
  const inserted = await db.insert(def.table).values(data).returning({ id: def.table.id }).catch(rethrowUniqueViolation)
  const id = inserted[0]?.id
  if (key === 'property-media') {
    await enforceSingleMainMedia(db, orgId!, { id, propertyKind: data.propertyKind, propertyId: data.propertyId, mediaType: data.mediaType, isMain: data.isMain ? 1 : 0 })
    if (data.r2Key) await syncMediaKeyVisibility(db, orgId!, data.r2Key)
  }
  // Una foto que nace privada deja de servirse sin sesión desde el primer momento.
  // (la propiedad padre ya se comprobó de esta agencia en assertPayloadReferences).
  if ((key === 'project-images' || key === 'gallery-images') && data.isPrivate) await syncMediaKeyVisibility(db, orgId!, data.image)
  if (propertyKind && sheet && hasSheetChanges(sheet)) await savePropertySheet(db, orgId!, propertyKind, id, sheet, user.id)
  // Vincular a alguien como propietario de una propiedad le da el rol «Propietario».
  if (key === 'property-contacts' && (data.role === 'owner' || data.role === 'co_owner')) await ensureContactRole(db, orgId!, data.contactId, 'owner', user.id)

  if (def.translations && Array.isArray(body?.translations)) {
    const { authorized } = await authorizeRecord(db, { resourceKey: key, table: def.table, policy: def.tenantPolicy, id, orgId })
    await syncTranslations(db, def, authorized, body.translations)
  }
  return { id, data }
}
