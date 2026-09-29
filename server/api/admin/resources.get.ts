import { requireAdmin } from '../../utils/auth'
import { adminResources } from '../../utils/adminResources'
import { AGENT_PROPERTY_TYPE_TO_SCHEMA, listPropertySchemas } from '../../utils/propertySchema/registry'

/**
 * Returns resource metadata so the admin UI can render menus and forms.
 *
 * `__propertySchemas` rides along on this same response rather than a
 * dedicated `/api/admin/property-schema` route (FASE 26): this project's
 * TS2589 margin for new Nitro route keys was down to a single one at the
 * time PropertySchemaRegistry was built (see docs/deals.md, P1-14) and this
 * endpoint is already fetched once per admin session — adding a field here
 * costs zero route keys where a new file costs one. The `__` prefix keeps
 * it visually apart from the `Record<resourceKey, ResourceMeta>` shape the
 * rest of this object has (a resource key is never `__`-prefixed).
 */
export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const out: Record<string, any> = {}
  for (const [key, def] of Object.entries(adminResources)) {
    if (def.superAdminOnly && user.role !== 'super_admin') continue
    out[key] = {
      key,
      label: def.label,
      // The permissions area that owns this resource (utils/adminAreas.ts).
      // Sent so the resource pages can hide the write actions the API would
      // reject anyway — see composables/useAdminPermissions.ts. It is panel
      // structure, not tenant data.
      area: def.area,
      fields: def.fields,
      listFields: def.listFields,
      readonly: !!def.readonly,
      hasTranslations: !!def.translations,
    }
  }
  // agentTypeMap viaja junto a los schemas por el mismo motivo que el resto
  // de este comentario: FASE 25 (editor) necesita resolver PropertyType →
  // PropertySchema exactamente como server/api/admin/[resource]/*.ts (FASE
  // 26) — duplicar ese mapeo a mano en el cliente sería reintroducir
  // exactamente el patrón de tres listas de campos que este registro vino a
  // evitar (ver docstring de propertySchema/registry.ts).
  out.__propertySchemas = { schemas: listPropertySchemas(), agentTypeMap: AGENT_PROPERTY_TYPE_TO_SCHEMA }
  return out
})
