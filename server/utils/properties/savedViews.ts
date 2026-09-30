import { createError } from 'h3'
import { eq, or, type SQL } from 'drizzle-orm'
import { schema } from '../db'

/**
 * Quién puede LEER un filtro/vista guardada (FASE 27 incremento 2): su
 * propio creador, o cualquiera de la organización si es `visibility='shared'`.
 * Es una condición SQL, no un post-filtro en memoria, para que la
 * paginación del listado genérico (`[resource]/index.get.ts`) siga siendo
 * correcta con este resource igual que con cualquier otro.
 */
export function savedViewVisibilityCond(userId: number): SQL {
  return or(eq(schema.propertySavedViews.userId, userId), eq(schema.propertySavedViews.visibility, 'shared'))!
}

/**
 * Quién puede EDITAR o BORRAR una fila: sólo quien la creó, sin excepción —
 * compartirla amplía quién la lee, nunca quién la posee. Lanza un 403 en vez
 * de devolver un booleano porque las tres rutas que la llaman
 * (`[id].put.ts`/`[id].delete.ts`) necesitan cortar ahí mismo.
 */
export function assertOwnsSavedView(row: { userId: number }, userId: number): void {
  if (row.userId !== userId) {
    throw createError({ statusCode: 403, statusMessage: 'Sólo quien creó este filtro o vista guardada puede editarlo o eliminarlo' })
  }
}
