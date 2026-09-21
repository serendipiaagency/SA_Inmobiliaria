import { and, desc, eq, like } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { normalizePhone, phoneTail } from './phone'

/**
 * Cruce de un teléfono con el CRM. `clients.phone` y `leads.phone` se
 * escribieron a mano durante años en cualquier formato ("600 11 22 33",
 * "+34600112233", "0034…"), así que el cruce no puede ser una igualdad: se
 * buscan candidatos por los últimos 9 dígitos y se comparan normalizados.
 * Cuando el teléfono guardado no tiene prefijo y no se puede normalizar, la
 * coincidencia de los 9 dígitos finales se acepta — es el mismo criterio con
 * el que una persona diría "es el mismo número".
 */
export interface CrmMatch {
  clientId: number | null
  leadId: number | null
  /** El nombre del cliente (o del lead) encontrado. */
  name: string | null
}

function sameNumber(stored: string | null | undefined, phoneE164: string, defaultPrefix?: string | null): boolean {
  if (!stored) return false
  const normalized = normalizePhone(stored, defaultPrefix)
  if (normalized) return normalized === phoneE164
  const tail = phoneTail(stored, 9)
  return tail.length >= 9 && tail === phoneTail(phoneE164, 9)
}

export async function matchCrmByPhone(db: any, orgId: number, phoneE164: string, defaultPrefix?: string | null): Promise<CrmMatch> {
  const tail = phoneTail(phoneE164, 9)
  if (tail.length < 6) return { clientId: null, leadId: null, name: null }
  // Los teléfonos guardados con espacios ("600 11 22 33") no contienen los 9
  // dígitos seguidos: el LIKE se hace sobre la versión sin separadores.
  const pattern = `%${tail.split('').join('%')}%`

  const clients = await db
    .select({ id: schema.clients.id, name: schema.clients.name, phone: schema.clients.phone })
    .from(schema.clients)
    .where(and(eq(schema.clients.organizationId, orgId), like(schema.clients.phone, pattern)))
    .orderBy(desc(schema.clients.id))
    .limit(50)
  const client = clients.find((c: any) => sameNumber(c.phone, phoneE164, defaultPrefix))

  const leads = await db
    .select({ id: schema.leads.id, name: schema.leads.name, phone: schema.leads.phone })
    .from(schema.leads)
    .where(and(eq(schema.leads.organizationId, orgId), like(schema.leads.phone, pattern)))
    .orderBy(desc(schema.leads.id))
    .limit(50)
  const lead = leads.find((l: any) => sameNumber(l.phone, phoneE164, defaultPrefix))

  return { clientId: client?.id ?? null, leadId: lead?.id ?? null, name: client?.name ?? lead?.name ?? null }
}
