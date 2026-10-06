import { and, eq } from 'drizzle-orm'
import { schema } from '../db'
import { livePropertyCond } from '../properties/trash'
import { normalizeMatchText } from '../matching/engine'

/**
 * Sugerencias para las zonas de una necesidad (FASE 10): los distritos,
 * localidades, códigos postales y urbanizaciones/comunidades que la agencia
 * tiene de verdad en sus fichas vivas, de los dos catálogos.
 *
 * Son exactamente los campos con los que el motor compara cada tipo de zona
 * (`zoneContains` en matching/engine.ts), así que una zona elegida de la lista
 * siempre puede coincidir con algún inmueble. El campo sigue siendo libre: una
 * zona sin inmuebles todavía (la que pide el comprador) también se guarda.
 */
export interface ZoneSuggestions {
  district: string[]
  city: string[]
  postalCode: string[]
  label: string[]
}

const MAX_PER_KIND = 300

function collect(values: (string | null | undefined)[]): string[] {
  const seen = new Map<string, string>()
  for (const raw of values) {
    const v = String(raw ?? '').trim()
    if (!v) continue
    const key = normalizeMatchText(v)
    if (!seen.has(key)) seen.set(key, v)
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'es')).slice(0, MAX_PER_KIND)
}

export async function listZoneSuggestions(db: any, orgId: number): Promise<ZoneSuggestions> {
  const A = schema.agentProperties
  const D = schema.developerProperties
  const [agent, developer] = await Promise.all([
    db
      .selectDistinct({ district: A.district, city: A.city, postalCode: A.postalCode, community: A.community })
      .from(A)
      .where(and(eq(A.organizationId, orgId), livePropertyCond(A))),
    db
      .selectDistinct({ district: D.district, city: D.city, postalCode: D.postalCode, community: D.community })
      .from(D)
      .where(and(eq(D.organizationId, orgId), livePropertyCond(D))),
  ])
  const rows = [...agent, ...developer] as { district: string | null; city: string | null; postalCode: string | null; community: string | null }[]
  return {
    district: collect(rows.map((r) => r.district)),
    city: collect(rows.map((r) => r.city)),
    postalCode: collect(rows.map((r) => r.postalCode)),
    label: collect(rows.map((r) => r.community)),
  }
}
