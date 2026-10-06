import { requireOrgScope } from '../../../utils/auth'
import { createContactFromPanel } from '../../../utils/contacts/crm'

/**
 * Crea un contacto (Contactos → «Nuevo contacto»).
 *
 * Si encuentra duplicados y no se ha pedido crear igualmente, NO crea nada y
 * devuelve 409 con los candidatos: la decisión es de una persona, nunca
 * automática — abrir el existente, «Unificar» (`mergeIntoContactId`: completa
 * ese contacto con los datos nuevos que le falten, sin pisar ninguno, y queda
 * en su Actividad) o crear igualmente (`force`).
 *
 * Cierre del núcleo (FASE 14): valida los campos igual que la edición
 * (server/utils/contacts/crm.ts#contactInputFromBody) y acepta WhatsApp e id
 * externo con su origen, que también cuentan para la deduplicación.
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = await readBody<Record<string, any>>(event)
  return createContactFromPanel(event, orgId, user, body || {})
})
