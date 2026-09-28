import type { PropertyKind } from '../matching/service'

export interface PropertySearchRow {
  id: number
  kind: PropertyKind
  name: string
  subtitle: string | null
  price: number | null
}

/**
 * Búsqueda por nombre/zona sobre los dos catálogos de inmueble a la vez.
 *
 * No existía nada así en el repo: `matching/service.ts` resuelve un inmueble
 * concreto por id+kind, y `PropertyPickerModal.vue`/`/api/admin/comms/properties`
 * sólo busca en `developer_properties` (obra nueva) — el resto del sistema de
 * citas ha vivido igual, sin cubrir 2ª mano. FASE 20 (filtro de Propiedad en
 * Calendar) y las fases siguientes (Offer/Deal) sí necesitan ambos catálogos
 * en un único resultado, así que esto vive aquí para reutilizarse en las tres.
 *
 * Misma pareja de tablas que `PROPERTY_KINDS`, nunca una tercera tabla ni una
 * FK polimórfica — cada catálogo se consulta con su propio SQL y se etiqueta
 * con `kind` en memoria, igual que hace matching/service.ts.
 */
export async function searchPropertiesAcrossKinds(db: D1Database, orgId: number, q: string, limit = 20): Promise<PropertySearchRow[]> {
  const needle = `%${q.trim()}%`
  const perKindLimit = Math.max(1, Math.min(limit, 50))

  const [developerRows, agentRows] = await Promise.all([
    db
      .prepare(
        `SELECT id, name, community AS subtitle, price
         FROM developer_properties
         WHERE organization_id = ?1 AND (name LIKE ?2 OR community LIKE ?2)
         ORDER BY name LIMIT ?3`,
      )
      .bind(orgId, needle, perKindLimit)
      .all<{ id: number; name: string; subtitle: string | null; price: number | null }>(),
    db
      .prepare(
        `SELECT id, COALESCE(reference, street || ' ' || COALESCE(street_number, ''), 'Sin nombre') AS name, city AS subtitle, price
         FROM agent_properties
         WHERE organization_id = ?1 AND (COALESCE(reference, '') LIKE ?2 OR COALESCE(street, '') LIKE ?2 OR COALESCE(city, '') LIKE ?2)
         ORDER BY name LIMIT ?3`,
      )
      .bind(orgId, needle, perKindLimit)
      .all<{ id: number; name: string; subtitle: string | null; price: number | null }>(),
  ])

  const developer: PropertySearchRow[] = developerRows.results.map((r: any) => ({ ...r, kind: 'developer' as const }))
  const agent: PropertySearchRow[] = agentRows.results.map((r: any) => ({ ...r, kind: 'agent' as const }))
  return [...developer, ...agent].slice(0, limit)
}
