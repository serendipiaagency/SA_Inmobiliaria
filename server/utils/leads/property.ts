import { and, eq } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { livePropertyCond } from '../properties/trash'

/**
 * La propiedad de interés de un lead y su catálogo (cierre del núcleo,
 * migración 0089).
 *
 * Hasta la 0089 el lead guardaba sólo `property_id`, y quien lo leía tenía
 * que adivinar de qué catálogo era buscando primero en 2ª mano
 * (`agent_properties`) y luego en obra nueva (`developer_properties`). Con
 * dos propiedades del mismo id en la agencia —las dos tablas tienen
 * secuencias independientes, así que pasa en cuanto hay unas cuantas— elegía
 * la de 2ª mano aunque el lead viniera de la web de obra nueva.
 *
 * Ahora `leads.property_kind` dice el catálogo. Todo lector pasa por
 * `resolveLeadPropertyKind()`: con la columna rellena manda la columna; sólo
 * con NULL (filas anteriores a la 0089, o una entrada que no lo sabe) se
 * conserva la resolución de siempre.
 */

export type LeadPropertyKind = 'agent' | 'developer'

/** `'agent'` / `'developer'`, o null para cualquier otra cosa (incluido un catálogo que no existe). */
export function parseLeadPropertyKind(raw: unknown): LeadPropertyKind | null {
  return raw === 'agent' || raw === 'developer' ? raw : null
}

function catalogTable(kind: LeadPropertyKind) {
  return kind === 'agent' ? schema.agentProperties : schema.developerProperties
}

/**
 * De qué catálogo es la propiedad de un lead. Con `propertyKind` es ése, sin
 * consultar nada. Con NULL, la resolución heredada: primero 2ª mano y si no
 * obra nueva, sólo entre las propiedades vivas de la agencia (como hacía el
 * enrutado); `includeTrashed` la amplía a la papelera para enseñar la ficha
 * de un lead antiguo cuya propiedad se borró después.
 */
export async function resolveLeadPropertyKind(
  db: any,
  orgId: number,
  propertyId: number | null | undefined,
  propertyKind: unknown,
  opts: { includeTrashed?: boolean } = {},
): Promise<LeadPropertyKind | null> {
  if (!propertyId) return null
  const explicit = parseLeadPropertyKind(propertyKind)
  if (explicit) return explicit
  for (const kind of ['agent', 'developer'] as const) {
    const t = catalogTable(kind) as any
    const conds = [eq(t.id, propertyId), eq(t.organizationId, orgId)]
    if (!opts.includeTrashed) conds.push(livePropertyCond(t))
    const [row] = await db.select({ id: t.id }).from(t).where(and(...conds)).limit(1)
    if (row) return kind
  }
  return null
}

export interface LeadPropertySummary {
  id: number
  kind: LeadPropertyKind
  name: string | null
  /** En la papelera: la ficha se enseña, pero no se puede poner como propiedad nueva. */
  trashed: boolean
  /** El catálogo no consta en el lead (fila anterior a la 0089): se ha resuelto como siempre. */
  inferred: boolean
  /** Ruta de su ficha en el panel. */
  adminPath: string
}

/** Ruta de la ficha de una propiedad en el panel según su catálogo (la misma que usan Tareas y Ofertas). */
export function adminPropertyPath(kind: LeadPropertyKind, id: number): string {
  return `/admin/${kind === 'agent' ? 'properties' : 'developer-properties'}/${id}`
}

/** La propiedad de interés de un lead, para su ficha: catálogo, nombre y enlace. Null si no tiene o ya no existe. */
export async function leadPropertySummary(db: any, orgId: number, lead: { propertyId?: number | null; propertyKind?: string | null; propertyName?: string | null }): Promise<LeadPropertySummary | null> {
  if (!lead.propertyId) return null
  const kind = await resolveLeadPropertyKind(db, orgId, lead.propertyId, lead.propertyKind, { includeTrashed: true })
  if (!kind) return null
  const t = catalogTable(kind) as any
  const nameCols = kind === 'agent' ? { reference: t.reference, street: t.street, streetNumber: t.streetNumber, slug: t.slug } : { name: t.name }
  const [row] = await db
    .select({ id: t.id, deletedAt: t.deletedAt, ...nameCols })
    .from(t)
    .where(and(eq(t.id, lead.propertyId), eq(t.organizationId, orgId)))
    .limit(1)
  if (!row) return null
  const name = kind === 'agent' ? row.reference || [row.street, row.streetNumber].filter(Boolean).join(' ') || row.slug || null : row.name || null
  return {
    id: row.id,
    kind,
    name: name || lead.propertyName || null,
    trashed: !!row.deletedAt,
    inferred: !parseLeadPropertyKind(lead.propertyKind),
    adminPath: adminPropertyPath(kind, row.id),
  }
}
