import { requireOrgScope } from '../../../utils/auth'
import { useDb, schema, now } from '../../../utils/db'
import { logAdminAction } from '../../../utils/audit'

const VALID_EVENTS = ['lead.created', 'deal.closed', 'visit.booked', 'contract.accepted', 'referral.converted']

function generateSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = await readBody<{ url?: string; events?: string[] }>(event)

  if (!body?.url || !/^https:\/\//i.test(body.url)) throw createError({ statusCode: 422, statusMessage: 'La URL debe ser https://' })
  const events = Array.isArray(body.events) ? body.events.filter((e) => VALID_EVENTS.includes(e)) : []
  if (!events.length) throw createError({ statusCode: 422, statusMessage: 'Selecciona al menos un evento' })

  const secret = generateSecret()
  const db = useDb(event)
  const [row] = await db
    .insert(schema.webhookEndpoints)
    .values({ organizationId: orgId, url: body.url, secret, eventsJson: JSON.stringify(events), active: 1, createdAt: now() })
    .returning()

  await logAdminAction(event, { user, orgId, action: 'create', resource: 'webhook-endpoint', resourceId: row.id })
  // The secret is only ever shown once, at creation — after this, only the masked hint is returned.
  return { ...row, secret }
})
