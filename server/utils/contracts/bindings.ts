import { and, eq } from 'drizzle-orm'
import { createError, type H3Event } from 'h3'
import { useDb, schema } from '../db'
import { trashedPropertyMessage } from '../properties/trash'
import { organizationCurrency } from '../currency'
import { formatMoney } from '../../../utils/currency'
import { clockNow } from '../clock'

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
    'contract.date': clockNow().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }),
    ...(opts.variables || {}),
  }

  const org = (await db.select().from(schema.organizations).where(eq(schema.organizations.id, orgId)).limit(1))[0]
  values['org.name'] = org?.name || ''

  // Un activo sólo puede ser una propiedad (web) de esta agencia: un id ajeno
  // o inexistente es 404, nunca un contrato guardado apuntando a otra agencia.
  if (opts.assetId && opts.assetKind !== 'property') throw createError({ statusCode: 422, statusMessage: 'El activo de un contrato sólo puede ser una propiedad' })
  if (opts.assetKind === 'property' && opts.assetId) {
    const property = (await db.select().from(schema.developerProperties).where(and(eq(schema.developerProperties.id, opts.assetId), eq(schema.developerProperties.organizationId, orgId))).limit(1))[0]
    if (!property) throw createError({ statusCode: 404, statusMessage: 'Propiedad no encontrada' })
    // Un contrato NUEVO sobre una propiedad de la papelera, no (los ya
    // generados conservan su texto: aquí sólo se pasa al crear uno).
    if (property.deletedAt) throw createError({ statusCode: 422, statusMessage: trashedPropertyMessage('generar un contrato') })
    values['property.name'] = property.name
    values['property.community'] = property.community || ''
    // En la moneda de la agencia, en la que está guardado el precio (utils/currency.ts) — antes «€» fijo.
    values['property.price'] = property.price != null ? formatMoney(property.price, await organizationCurrency(db, orgId)) : ''
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
