import { requireOrgScope } from '../../../../utils/auth'
import { findDuplicateContacts, type ContactInput } from '../../../../utils/contacts/service'

/**
 * Consulta de duplicados antes de crear. Es POST porque recibe los datos del
 * formulario, pero no escribe nada: sólo devuelve candidatos del propio
 * tenant para que una persona decida (por eso la matriz de rutas lo clasifica
 * como lectura).
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const body = await readBody<ContactInput & { excludeContactId?: number }>(event)
  if (!body?.name && !body?.email && !body?.phone) return { duplicates: [] }

  const duplicates = await findDuplicateContacts(event, orgId, { name: body.name || '', email: body.email, phone: body.phone, whatsapp: body.whatsapp, externalSource: body.externalSource, externalId: body.externalId }, { excludeContactId: body.excludeContactId })
  return { duplicates }
})
