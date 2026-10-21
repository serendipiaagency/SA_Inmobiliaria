import { requireOrgScope } from '../../../../../utils/auth'
import { useDb, cfEnv } from '../../../../../utils/db'
import { getPosterRender } from '../../../../../utils/posters/service'

/** GET /api/admin/carteles/renders/:id/download — descarga el PDF del cartel desde R2. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event, 'web', 'read')
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 422, statusMessage: 'Descarga no válida' })

  const render = await getPosterRender(useDb(event), orgId, id)
  if (render.status !== 'completed' || !render.r2Key) throw createError({ statusCode: 409, statusMessage: `El cartel está «${render.status}», aún no se puede descargar` })

  const obj = await cfEnv(event).MEDIA.get(render.r2Key)
  if (!obj) throw createError({ statusCode: 404, statusMessage: 'El archivo no está en el almacenamiento' })

  setHeader(event, 'Content-Type', obj.httpMetadata?.contentType || 'application/pdf')
  setHeader(event, 'Content-Disposition', `attachment; filename="cartel-${render.projectId}-${render.id}.pdf"`)
  return obj.body
})
