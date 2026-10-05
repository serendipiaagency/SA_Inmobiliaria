import { and, eq } from 'drizzle-orm'
import * as schema from '../../db/schema'

/**
 * Evaluates a job's `condition_json` gate (Fase 8: "no publicar en Instagram
 * hasta tener al menos 15 fotografías"). Real checks against the property's
 * actual data — never a stub that always passes.
 */
export async function evaluateCondition(db: any, developerPropertyId: number, conditionJson: string | null): Promise<{ met: boolean; reason?: string }> {
  if (!conditionJson) return { met: true }
  let condition: { type: string; value: number }
  try {
    condition = JSON.parse(conditionJson)
  } catch {
    return { met: true }
  }

  if (condition.type === 'min_photos') {
    // Sólo cuentan las fotos que de verdad saldrían en el canal: publicables,
    // no privadas y no ocultas (FASE 7, bloque N7a).
    const rows = await db
      .select({ id: schema.images.id })
      .from(schema.images)
      .where(and(eq(schema.images.developerPropertyId, developerPropertyId), eq(schema.images.isPublishable, 1), eq(schema.images.isPrivate, 0), eq(schema.images.isHidden, 0)))
    const count = rows.length
    return count >= condition.value ? { met: true } : { met: false, reason: `Requiere ${condition.value} fotos, hay ${count}.` }
  }

  return { met: true }
}
