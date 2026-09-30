import { createError } from 'h3'
import { getPropertySchemaFor, validateAgainstSchema, type PropertyCatalog } from '../propertySchema/registry'

/**
 * Única validación de PropertySchemaRegistry contra el estado RESULTANTE de
 * una Property — compartida por la edición manual (`[resource]/[id].put.ts`)
 * y por el handler de "publicar" de Bulk Actions (FASE 28 incremento 2), en
 * vez de reimplementar esta comparación una tercera vez (ver
 * docs/bulk-actions.md, "Qué queda para el siguiente incremento" de FASE 28
 * incremento 1). `mode: 'publish'` sólo tiene sentido hoy en
 * developer-properties — agent-properties no tiene consumidor público (ver
 * auditoría FASE 26).
 */
export function assertSchemaValid(catalog: PropertyCatalog, propertyType: string | null, merged: Record<string, unknown>, mode: 'save' | 'publish'): void {
  const propertySchema = getPropertySchemaFor(catalog, propertyType)
  const result = validateAgainstSchema(propertySchema, merged, mode)
  if (!result.ok) {
    const missing = [...result.missingForSave, ...result.missingForPublish]
    throw createError({ statusCode: 422, statusMessage: `Faltan campos obligatorios para ${mode === 'publish' ? 'publicar' : 'guardar'}: ${missing.join(', ')}` })
  }
}
