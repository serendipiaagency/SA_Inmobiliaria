import { useDb, schema, now, resolvePublicOrgId } from '../../utils/db'

function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string; filters?: Record<string, unknown> }>(event)
  const email = body?.email?.trim().toLowerCase()
  if (!email || !EMAIL_RE.test(email)) throw createError({ statusCode: 422, statusMessage: 'Email inválido' })

  const db = useDb(event)
  const orgId = resolvePublicOrgId(event)
  const [row] = await db
    .insert(schema.savedSearches)
    .values({ organizationId: orgId, email, filtersJson: JSON.stringify(body?.filters || {}), unsubscribeToken: generateToken(), active: 1, createdAt: now() })
    .returning()

  return { ok: true, id: row.id }
})
