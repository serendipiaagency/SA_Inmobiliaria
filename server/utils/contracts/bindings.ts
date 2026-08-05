import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { useDb, schema } from '../db'

const TOKEN_RE = /\{\{([a-zA-Z0-9_.]+)\}\}/g

/**
 * Resolves {{token}} placeholders against real data (client info, org, and — when
 * assetKind/assetId point at a real catalog property — its own name/price/community).
 * Anything with no real value resolves to '' rather than an invented placeholder;
 * `variables` carries the admin-entered fields (amount, deposit, dates…) that have
 * no other source of truth.
 */
export async function resolveContractBindings(
  event: H3Event,
  orgId: number,
  opts: { clientName: string; clientEmail?: string | null; assetKind?: string | null; assetId?: number | null; variables?: Record<string, string> },
): Promise<Record<string, string>> {
  const db = useDb(event)
  const values: Record<string, string> = {
    'client.name': opts.clientName,
    'client.email': opts.clientEmail || '',
    'contract.date': new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }),
    ...(opts.variables || {}),
  }

  const org = (await db.select().from(schema.organizations).where(eq(schema.organizations.id, orgId)).limit(1))[0]
  values['org.name'] = org?.name || ''

  if (opts.assetKind === 'property' && opts.assetId) {
    const property = (await db.select().from(schema.developerProperties).where(eq(schema.developerProperties.id, opts.assetId)).limit(1))[0]
    if (property && property.organizationId === orgId) {
      values['property.name'] = property.name
      values['property.community'] = property.community || ''
      values['property.price'] = property.price != null ? new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(property.price) : ''
    }
  }

  return values
}

export function applyBindings(template: string, values: Record<string, string>): string {
  return template.replace(TOKEN_RE, (_match, token) => values[token] ?? '')
}

export function listTokensUsed(template: string): string[] {
  const found = new Set<string>()
  let m: RegExpExecArray | null
  const re = new RegExp(TOKEN_RE)
  while ((m = re.exec(template))) found.add(m[1])
  return [...found]
}
