import { and, asc, eq } from 'drizzle-orm'
import { useDb, schema, resolvePublicOrgId } from '../../utils/db'
import { PUBLIC_TEAM_COLUMNS } from '../../utils/publicTeam'

/**
 * Only members with showOnWeb are listed here — that flag exists precisely
 * to separate internal employee data from what's shown on the public site
 * (Comerciales ficha, pestaña Web). Individual profile lookups
 * (team/[slug].get.ts) and the booking flow (public/agents/[slug]/*) are
 * unaffected: this is specifically the public *listing*.
 *
 * La proyección no es cosmética: con `select()` a secas esto devolvía la
 * fila entera, incluido `icalToken`, que abre la agenda del comercial sin
 * sesión. Ver server/utils/publicTeam.ts.
 */
export default defineEventHandler(async (event) => {
  const db = useDb(event)
  const rows = await db
    .select(PUBLIC_TEAM_COLUMNS)
    .from(schema.teamMembers)
    .where(and(eq(schema.teamMembers.organizationId, resolvePublicOrgId(event)), eq(schema.teamMembers.showOnWeb, 1)))
    .orderBy(asc(schema.teamMembers.sortOrder), asc(schema.teamMembers.name))
  return { rows }
})
