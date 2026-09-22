import { requireOrgScope } from '../../../utils/auth'
import { logAdminAction } from '../../../utils/audit'
import { createContact, findDuplicateContacts, type ContactInput } from '../../../utils/contacts/service'

/**
 * Crea un contacto.
 *
 * Si encuentra duplicados y no se ha pedido crear igualmente, NO crea nada y
 * devuelve 409 con los candidatos: la decisión (unificar / vincular / crear
 * igualmente) es de una persona, nunca automática.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = await readBody<ContactInput & { force?: boolean }>(event)

  if (!body?.name?.trim()) throw createError({ statusCode: 422, statusMessage: 'El nombre es obligatorio' })
  if (!body.email && !body.phone && !body.whatsapp) {
    throw createError({ statusCode: 422, statusMessage: 'Indica al menos un email o un teléfono' })
  }

  const candidates = await findDuplicateContacts(event, orgId, body)
  if (candidates.length && !body.force) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Puede que este contacto ya exista',
      data: { duplicates: candidates },
    })
  }

  const contact = await createContact(event, orgId, body, { createdBy: user.id })
  await logAdminAction(event, {
    user,
    orgId,
    action: 'create',
    resource: 'contact',
    resourceId: contact.id,
    // Queda constancia de que se creó a sabiendas de que había candidatos.
    detail: candidates.length ? `creado pese a ${candidates.length} posible(s) duplicado(s)` : undefined,
  })

  return contact
})
