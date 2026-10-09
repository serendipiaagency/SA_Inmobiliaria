import { and, eq } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../../utils/db'
import { livePropertyCond } from '../../../utils/properties/trash'
import { loadPublicPropertyDetail } from '../../../utils/properties/publicDetail'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })
  const db = useDb(event)

  // Una propiedad en la papelera responde 404, igual que una que no existe.
  const rows = await db
    .select()
    .from(schema.developerProperties)
    .where(and(eq(schema.developerProperties.slug, slug), eq(schema.developerProperties.organizationId, resolvePublicOrgId(event)), livePropertyCond(schema.developerProperties)))
    .limit(1)
  const project = rows[0]
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  // Todo lo demás (multimedia, ficha ampliada, comercial, disponibilidad de
  // secciones…) sale de server/utils/properties/publicDetail.ts.
  return loadPublicPropertyDetail(db, project)
})
