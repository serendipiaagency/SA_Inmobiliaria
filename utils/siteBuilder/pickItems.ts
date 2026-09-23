/**
 * El mismo vocabulario de selección dinámica que ya usa el bloque
 * Propiedades (`components/site-builder/blocks/PropertiesBlock.vue`,
 * `PropertiesInspector.vue`): más recientes / destacadas / precio más alto
 * o más bajo / mejor rentabilidad / comunidad / tipo / selección manual.
 * Extraído aquí para que el bloque de mapa (`MapTeaserBlock.vue`) elija
 * propiedades reales con las mismas reglas exactas, sin inventar un segundo
 * vocabulario ni duplicar el switch con riesgo de que diverjan — sin tocar
 * `PropertiesBlock.vue`, que sigue con su propia copia (probada, en
 * producción) intacta.
 */

export interface PickableItem {
  id: number
  community?: string | null
  propertyType?: string | null
  price?: number | null
  isExclusive?: boolean | number | null
  rentalYield?: number | null
}

export function pickDynamicItems<T extends PickableItem>(all: T[], content: Record<string, any>, limit: number): T[] {
  if (content.source === 'manual') {
    const ids: number[] = Array.isArray(content.manualIds) ? content.manualIds : []
    const byId = new Map(all.map((p) => [p.id, p]))
    return ids
      .map((id) => byId.get(id))
      .filter((p): p is T => !!p)
      .slice(0, limit)
  }
  switch (content.dynamicFilter) {
    case 'featured': {
      const exclusive = all.filter((p) => p.isExclusive)
      return (exclusive.length ? exclusive : all).slice(0, limit)
    }
    case 'premium':
      return [...all].sort((a, b) => (b.price || 0) - (a.price || 0)).slice(0, limit)
    case 'affordable':
      return [...all].sort((a, b) => (a.price || 0) - (b.price || 0)).slice(0, limit)
    case 'recommended':
      return [...all].sort((a, b) => (b.rentalYield || 0) - (a.rentalYield || 0)).slice(0, limit)
    case 'community':
      return all.filter((p) => p.community === content.dynamicCommunity).slice(0, limit)
    case 'type':
      return all.filter((p) => p.propertyType === content.dynamicType).slice(0, limit)
    case 'latest':
    default:
      return all.slice(0, limit)
  }
}
