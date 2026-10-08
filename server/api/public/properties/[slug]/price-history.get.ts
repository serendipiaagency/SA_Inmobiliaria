import { and, eq } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../../../utils/db'
import { livePropertyCond } from '../../../../utils/properties/trash'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })

  const db = useDb(event)
  const rows = await db
    .select({ id: schema.developerProperties.id })
    .from(schema.developerProperties)
    // Una propiedad en la papelera responde 404, igual que una que no existe.
    .where(and(eq(schema.developerProperties.slug, slug), eq(schema.developerProperties.organizationId, resolvePublicOrgId(event)), livePropertyCond(schema.developerProperties)))
    .limit(1)
  const project = rows[0]
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  // `previousPrice`: el precio público que tenía antes de cada cambio, para
  // que la ficha (#111) diga cuánto ha cambiado desde el primero.
  const history = await db
    .select({ price: schema.priceHistory.price, previousPrice: schema.priceHistory.previousPrice, recordedAt: schema.priceHistory.recordedAt })
    .from(schema.priceHistory)
    .where(eq(schema.priceHistory.developerPropertyId, project.id))

  history.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
  return { history }
})
