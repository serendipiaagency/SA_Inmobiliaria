import { and, eq, isNotNull, isNull, type SQL } from 'drizzle-orm'
import { createError } from 'h3'
import * as schema from '../../db/schema'
import type { PropertyKind } from '../matching/service'

/**
 * Papelera de propiedades — la condición «propiedad viva», escrita UNA vez.
 *
 * Desde la migración 0086, `agent_properties` (2ª mano, recurso admin
 * `properties`) y `developer_properties` (web / obra nueva, recurso
 * `developer-properties`) tienen `deleted_at`. Borrar desde el panel ya no
 * elimina la fila: le pone fecha a `deleted_at` y la propiedad pasa a la
 * Papelera, desde donde se restaura (`POST …/restore`) o se elimina de verdad
 * (`DELETE …?hard=1`). Ver docs/ficha-ampliada-propiedad.md, «Papelera».
 *
 * Qué consulta usa qué (la lista completa está en ese documento):
 *
 *  - **Listados, búsquedas, contadores, web pública, sitemap, widget, API v1,
 *    matching, INMO / Domain Tools, estadísticas, alertas, exportación,
 *    publicación multicanal…** añaden `livePropertyCond(tabla)`: una
 *    propiedad en la papelera no existe para ellos.
 *  - **Crear algo NUEVO sobre una propiedad** (oferta, visita, tarea,
 *    envío, selección, operación, contrato, programación…) pasa por
 *    `assertLiveProperty()`: 404 si no es de esta agencia, 422 claro si está
 *    en la papelera.
 *  - **Leer la historia** (la propiedad de una oferta, operación, contrato o
 *    conversación que ya existía) sigue leyendo la fila sin filtrar: borrar
 *    una propiedad no reescribe el pasado.
 *
 * `buildPropertyFilterConds()` (searchService.ts) NO incluye esta condición a
 * propósito: el listado admin la sustituye por `trashedPropertyCond()` cuando
 * se pide la Papelera (`?trashed=1`), y no puede llevar las dos a la vez.
 */

/** Cualquiera de las dos tablas de propiedades (sólo hace falta su columna `deletedAt`). */
type TableWithDeletedAt = { deletedAt: any }

/** La tabla Drizzle de cada catálogo, sin pasar por matching/service (evita una importación circular en tiempo de ejecución). */
function propertyTable(kind: PropertyKind) {
  return kind === 'agent' ? schema.agentProperties : schema.developerProperties
}

/** `deleted_at IS NULL` — la propiedad no está en la papelera. */
export function livePropertyCond(table: TableWithDeletedAt): SQL {
  return isNull(table.deletedAt)
}

/** `deleted_at IS NOT NULL` — sólo lo que está en la papelera (la vista Papelera del listado). */
export function trashedPropertyCond(table: TableWithDeletedAt): SQL {
  return isNotNull(table.deletedAt)
}

/** Para una fila ya leída: ¿está en la papelera? */
export function isPropertyTrashed(row: { deletedAt?: string | null } | null | undefined): boolean {
  return !!row?.deletedAt
}

export type PropertyState = 'live' | 'trashed' | 'missing'

/**
 * En qué estado está una propiedad PARA ESTA AGENCIA. Una propiedad de otra
 * organización es `missing`, exactamente igual que una que no existe: la
 * papelera ajena no se distingue de la nada.
 */
export async function propertyState(db: any, orgId: number, kind: PropertyKind, propertyId: number): Promise<PropertyState> {
  const t = propertyTable(kind)
  const rows = await db
    .select({ id: t.id, deletedAt: t.deletedAt })
    .from(t)
    .where(and(eq(t.id, propertyId), eq(t.organizationId, orgId)))
    .limit(1)
  if (!rows[0]) return 'missing'
  return rows[0].deletedAt ? 'trashed' : 'live'
}

/** Mensaje único para «está en la papelera», para que el panel diga siempre lo mismo. */
export function trashedPropertyMessage(action = 'usarla'): string {
  return `La propiedad está en la papelera: restáurala antes de ${action}.`
}

/**
 * Para crear algo NUEVO sobre una propiedad: que sea de esta agencia (404 si
 * no) y que no esté en la papelera (422 con un mensaje que dice qué hacer).
 * `action` completa la frase «restáurala antes de …» (p. ej. «crear una
 * oferta»).
 */
export async function assertLiveProperty(
  db: any,
  orgId: number,
  kind: PropertyKind,
  propertyId: number,
  opts: { action?: string; notFoundMessage?: string } = {},
): Promise<void> {
  const state = await propertyState(db, orgId, kind, propertyId)
  if (state === 'missing') throw createError({ statusCode: 404, statusMessage: opts.notFoundMessage || 'Propiedad no encontrada' })
  if (state === 'trashed') throw createError({ statusCode: 422, statusMessage: trashedPropertyMessage(opts.action) })
}
