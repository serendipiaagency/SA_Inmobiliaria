/**
 * Planos de la ficha pública (#110): el tipo que devuelve la API y el título
 * que se lee, compartidos por el servidor (server/utils/properties/floorPlans.ts)
 * y los componentes de la ficha.
 */
export interface PublicFloorPlan {
  id: number
  title: string
  image: string
  sizes: string | null
  floorDetails: string | null
}

/** El título que se lee: el suyo, o la categoría / el tipo de unidad (lo que ya rellenaban), o «Plano N». */
export function floorPlanTitle(row: { title?: string | null; category?: string | null; unitType?: string | null }, index: number): string {
  return row.title?.trim() || row.category?.trim() || row.unitType?.trim() || `Plano ${index + 1}`
}
