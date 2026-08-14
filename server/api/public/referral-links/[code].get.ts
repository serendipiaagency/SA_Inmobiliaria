import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code')
  if (!code) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const db = useDb(event)
  const link = (await db.select().from(schema.referralLinks).where(eq(schema.referralLinks.code, code)).limit(1))[0]
  if (!link) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const org = (await db.select({ name: schema.organizations.name }).from(schema.organizations).where(eq(schema.organizations.id, link.organizationId)).limit(1))[0]
  return { referrerName: link.referrerName, orgName: org?.name || null }
})
