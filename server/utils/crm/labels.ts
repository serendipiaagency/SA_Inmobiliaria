import { and, eq, inArray } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { selectInChunks } from '../sqlChunks'

/**
 * Nombres legibles para los ids que guardan tareas, ofertas, operaciones y
 * actividad (bloque N6, FASES 21-24). Esas tablas no copian el nombre del
 * contacto ni la dirección del inmueble — sólo el id — y la pantalla los
 * resolvía como «Contacto #12». Aquí se resuelven de una vez por listado,
 * SIEMPRE acotados a la organización: un id que no sea de esta agencia
 * simplemente no aparece en el mapa (y la pantalla enseña el id tal cual),
 * nunca el nombre de otra.
 *
 * Cada `IN (…)` va troceado (`selectInChunks`): D1 rechaza consultas de más
 * de 100 parámetros y un listado o un Kanban puede pasar de ahí.
 */

function uniq(ids: Array<number | null | undefined>): number[] {
  return [...new Set(ids.filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0))]
}

async function namesFrom(db: any, table: any, column: any, orgId: number, ids: Array<number | null | undefined>): Promise<Map<number, string>> {
  const list = uniq(ids)
  if (!list.length) return new Map()
  const rows = await selectInChunks(list, (part) =>
    db
      .select({ id: table.id, name: column })
      .from(table)
      .where(and(inArray(table.id, part), eq(table.organizationId, orgId))),
  )
  return new Map(rows.map((r: any) => [r.id, r.name || `#${r.id}`]))
}

export function contactNames(db: any, orgId: number, ids: Array<number | null | undefined>) {
  return namesFrom(db, schema.contacts, schema.contacts.name, orgId, ids)
}
export function leadNames(db: any, orgId: number, ids: Array<number | null | undefined>) {
  return namesFrom(db, schema.leads, schema.leads.name, orgId, ids)
}
export function teamMemberNames(db: any, orgId: number, ids: Array<number | null | undefined>) {
  return namesFrom(db, schema.teamMembers, schema.teamMembers.name, orgId, ids)
}
export function officeNames(db: any, orgId: number, ids: Array<number | null | undefined>) {
  return namesFrom(db, schema.offices, schema.offices.name, orgId, ids)
}
export function userNames(db: any, orgId: number, ids: Array<number | null | undefined>) {
  return namesFrom(db, schema.users, schema.users.name, orgId, ids)
}

/** Etiqueta de una cita: «Cliente · 2026-02-01 10:00». */
export async function visitLabels(db: any, orgId: number, ids: Array<number | null | undefined>): Promise<Map<number, string>> {
  const list = uniq(ids)
  if (!list.length) return new Map()
  const rows = await selectInChunks(list, (part) =>
    db
      .select({ id: schema.visits.id, clientName: schema.visits.clientName, scheduledAt: schema.visits.scheduledAt, propertyName: schema.visits.propertyName })
      .from(schema.visits)
      .where(and(inArray(schema.visits.id, part), eq(schema.visits.organizationId, orgId))),
  )
  return new Map(rows.map((r: any) => [r.id, `${r.clientName}${r.propertyName ? ` · ${r.propertyName}` : ''} · ${String(r.scheduledAt).slice(0, 16)}`]))
}

export interface PropertyRef {
  id: number | null | undefined
  kind?: string | null
}

/** Clave de un inmueble en el mapa de nombres: `agent:12` / `developer:7`. */
export function propertyKey(kind: string | null | undefined, id: number): string {
  return `${kind === 'agent' ? 'agent' : 'developer'}:${id}`
}

/**
 * Nombre de cada inmueble (los dos catálogos), incluidos los de la papelera:
 * es la historia de una tarea u oferta, no un selector. Una referencia sin
 * catálogo (tareas antiguas sin `propertyKind`) se busca en los dos y se
 * guarda también bajo la clave `any:<id>`.
 */
export async function propertyNames(db: any, orgId: number, refs: PropertyRef[]): Promise<Map<string, string>> {
  const devIds = uniq(refs.filter((r) => r.kind !== 'agent').map((r) => r.id))
  const agentIds = uniq(refs.filter((r) => r.kind !== 'developer').map((r) => r.id))
  const out = new Map<string, string>()
  if (devIds.length) {
    const rows = await selectInChunks(devIds, (part) =>
      db
        .select({ id: schema.developerProperties.id, name: schema.developerProperties.name })
        .from(schema.developerProperties)
        .where(and(inArray(schema.developerProperties.id, part), eq(schema.developerProperties.organizationId, orgId))),
    )
    for (const r of rows as any[]) out.set(propertyKey('developer', r.id), r.name || `Obra nueva #${r.id}`)
  }
  if (agentIds.length) {
    const rows = await selectInChunks(agentIds, (part) =>
      db
        .select({ id: schema.agentProperties.id, reference: schema.agentProperties.reference, street: schema.agentProperties.street, streetNumber: schema.agentProperties.streetNumber, location: schema.agentProperties.location, city: schema.agentProperties.city })
        .from(schema.agentProperties)
        .where(and(inArray(schema.agentProperties.id, part), eq(schema.agentProperties.organizationId, orgId))),
    )
    for (const r of rows as any[]) out.set(propertyKey('agent', r.id), r.reference || [r.street, r.streetNumber].filter(Boolean).join(' ') || r.location || r.city || `2ª mano #${r.id}`)
  }
  for (const r of refs) {
    if (r.kind || !r.id) continue
    const name = out.get(propertyKey('developer', r.id)) || out.get(propertyKey('agent', r.id))
    if (name) out.set(`any:${r.id}`, name)
  }
  return out
}

/** El nombre de un inmueble ya resuelto por `propertyNames()`. */
export function propertyNameOf(map: Map<string, string>, id: number | null | undefined, kind: string | null | undefined): string | null {
  if (!id) return null
  if (!kind) return map.get(`any:${id}`) ?? null
  return map.get(propertyKey(kind, id)) ?? null
}
