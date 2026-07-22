import { requireAdmin } from '../../utils/auth'
import { adminResources } from '../../utils/adminResources'

/** Returns resource metadata so the admin UI can render menus and forms. */
export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const out: Record<string, any> = {}
  for (const [key, def] of Object.entries(adminResources)) {
    if (def.superAdminOnly && user.role !== 'super_admin') continue
    out[key] = {
      key,
      label: def.label,
      fields: def.fields,
      listFields: def.listFields,
      readonly: !!def.readonly,
      hasTranslations: !!def.translations,
    }
  }
  return out
})
