import { and, asc, eq, isNotNull, ne } from 'drizzle-orm'
import { schema } from '../db'
import { floorPlanTitle, type PublicFloorPlan } from '../../../utils/floorPlans'

export type { PublicFloorPlan }

/**
 * Planos de una propiedad (#110). Son las filas de «Planos» del editor
 * (`floor_plans` en obra nueva, `agent_property_floor_plans` en 2ª mano), con
 * título, orden y visibilidad desde la migración 0091. La ficha pública los
 * enseña en «Plano de la vivienda» y en la pestaña «Plano» de la galería: es
 * el mismo recurso, no una copia.
 */

const flag = (v: unknown): 0 | 1 => (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0)

/** Lo que el panel puede escribir en un plano, saneado: el título recortado, el orden entero y la visibilidad 0/1 (vacía = visible). */
export function normalizeFloorPlan(data: Record<string, any>): Record<string, any> {
  if ('title' in data) {
    const t = data.title == null ? '' : String(data.title).trim().slice(0, 120)
    data.title = t || null
  }
  if ('sortOrder' in data) {
    const n = Math.round(Number(data.sortOrder))
    data.sortOrder = Number.isFinite(n) && n >= 0 ? n : 0
  }
  if ('isPublic' in data) data.isPublic = data.isPublic === null || data.isPublic === undefined || data.isPublic === '' ? 1 : flag(data.isPublic)
  return data
}

/**
 * Los planos públicos de una propiedad de obra nueva, en su orden: sólo los
 * marcados «visible en la web» y con imagen. Sólo columnas que se pueden
 * enseñar (antes la API devolvía la fila entera).
 */
export async function listPublicFloorPlans(db: any, developerPropertyId: number): Promise<PublicFloorPlan[]> {
  const T = schema.floorPlans
  const rows = await db
    .select({ id: T.id, title: T.title, category: T.category, unitType: T.unitType, sizes: T.sizes, floorDetails: T.floorDetails, image: T.image })
    .from(T)
    .where(and(eq(T.developerPropertyId, developerPropertyId), eq(T.isPublic, 1), isNotNull(T.image), ne(T.image, '')))
    .orderBy(asc(T.sortOrder), asc(T.id))
  return (rows as any[]).map((r, i) => ({ id: r.id, title: floorPlanTitle(r, i), image: r.image, sizes: r.sizes || null, floorDetails: r.floorDetails || null }))
}
