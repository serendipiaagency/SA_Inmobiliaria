import { and, asc, eq } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../utils/db'

/**
 * Only members with showOnWeb are listed here — that flag exists precisely
 * to separate internal employee data from what's shown on the public site
 * (Comerciales ficha, pestaña Web). Individual profile lookups
 * (team/[slug].get.ts) and the booking flow (public/agents/[slug]/*) are
 * unaffected: this is specifically the public *listing*.
 */
export default defineEventHandler(async (event) => {
  const db = useDb(event)
  const rows = await db
    .select()
    .from(schema.teamMembers)
    .where(and(eq(schema.teamMembers.organizationId, resolvePublicOrgId(event)), eq(schema.teamMembers.showOnWeb, 1)))
    .orderBy(asc(schema.teamMembers.sortOrder), asc(schema.teamMembers.name))
  return { rows }
})
