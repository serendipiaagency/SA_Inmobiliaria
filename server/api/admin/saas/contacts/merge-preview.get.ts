import { requireOrgScope } from '../../../../utils/auth'
import { previewMerge, ContactMergeError } from '../../../../utils/contacts/merge'

/** Lo que hay que enseñar antes de fusionar dos Contact: los dos registros, sus conflictos de campo y cuánto se movería (FASE 14 §106). */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const query = getQuery(event)
  const masterId = Number(query.masterId)
  const duplicateId = Number(query.duplicateId)
  if (!Number.isInteger(masterId) || !Number.isInteger(duplicateId)) {
    throw createError({ statusCode: 422, statusMessage: 'Faltan masterId y duplicateId' })
  }

  try {
    return await previewMerge(event, orgId, masterId, duplicateId)
  } catch (err) {
    if (err instanceof ContactMergeError) throw createError({ statusCode: 422, statusMessage: err.message })
    throw err
  }
})
