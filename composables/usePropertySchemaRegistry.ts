/**
 * Proyección cliente del PropertySchemaRegistry (FASE 26,
 * server/utils/propertySchema/registry.ts).
 *
 * server/ no es importable desde composables/ en este proyecto, así que
 * estos tipos son un espejo de los del servidor — no la fuente de verdad.
 * Los datos llegan vía `__propertySchemas` dentro de `GET /api/admin/resources`
 * (no una ruta dedicada: ver el comentario de por qué en
 * server/api/admin/resources.get.ts y docs/property-schema-registry.md).
 *
 * `useFetch('/api/admin/resources')` reutiliza la respuesta ya cacheada por
 * Nuxt si algún ancestro (p. ej. pages/admin/[resource]/[id].vue) ya la
 * pidió con la misma key — no dispara una petición HTTP adicional.
 */

export type PropertyCatalog = 'agent' | 'developer'

export type PropertySchemaKey = 'residential' | 'land' | 'commercial' | 'industrial' | 'garage' | 'building' | 'newDevelopment'

export interface PropertyFieldRule {
  key: string
  requiredForSave?: boolean
  requiredForPublish?: boolean
  requiredForPortal?: boolean
  publicExposable?: boolean
  portalRelevant?: boolean
}

export interface PropertySchemaSectionDef {
  key: string
  label: string
  fields: string[]
}

export interface PropertySchemaDef {
  key: PropertySchemaKey
  label: string
  catalogs: PropertyCatalog[]
  sections: PropertySchemaSectionDef[]
  fields: Record<string, PropertyFieldRule>
}

interface PropertySchemasPayload {
  schemas: PropertySchemaDef[]
  agentTypeMap: Record<string, PropertySchemaKey>
}

export function usePropertySchemaRegistry() {
  const { data: resources } = useFetch<Record<string, any>>('/api/admin/resources')

  const payload = computed<PropertySchemasPayload>(() => resources.value?.__propertySchemas || { schemas: [], agentTypeMap: {} })
  const schemas = computed(() => payload.value.schemas)
  const agentTypeMap = computed(() => payload.value.agentTypeMap)

  /**
   * `developer` siempre resuelve a `newDevelopment` (§35: PropertyType no es
   * lo mismo que PropertySchema, y developer_properties no participa del
   * mapeo — ver registry.ts). Sin schemas cargados todavía (primer render),
   * devuelve `undefined`: los consumidores deben tratar eso como "no filtrar
   * nada todavía", nunca como "ocultar todo".
   */
  function getSchemaFor(catalog: PropertyCatalog, propertyType: string | null | undefined): PropertySchemaDef | undefined {
    if (!schemas.value.length) return undefined
    if (catalog === 'developer') return schemas.value.find((s) => s.key === 'newDevelopment')
    const key = (propertyType && agentTypeMap.value[propertyType]) || 'residential'
    return schemas.value.find((s) => s.key === key)
  }

  /**
   * Unión de todas las claves que declara AL MENOS UN schema de un catálogo
   * — no todas las claves reales del editor. El registro modela hoy
   * identificación básica/ubicación/superficies/características/precio/
   * media (Property Core FASE 1-4 + precio); no modela campos de gestión de
   * fila (slug, status, propertyType, comercial asignado, exclusividad…).
   */
  function declaredFieldKeys(catalog: PropertyCatalog): Set<string> {
    const set = new Set<string>()
    for (const s of schemas.value) {
      if (!s.catalogs.includes(catalog)) continue
      for (const key of Object.keys(s.fields)) set.add(key)
    }
    return set
  }

  /**
   * Un campo se oculta SÓLO si el registro tiene una opinión real sobre él
   * (algún schema del catálogo lo declara) y el schema resuelto no lo
   * incluye — nunca por simple ausencia. Sin esto, cualquier campo que el
   * registro todavía no modela (el propio selector "Tipo de propiedad",
   * `status`, `slug`, comercial asignado…) desaparecería del editor por
   * omisión, en vez de mostrarse siempre como hasta ahora. Sin schema
   * resuelto (carga en curso), todo campo es aplicable — evita ocultar
   * datos reales por una carrera de carga.
   */
  function isFieldApplicable(catalog: PropertyCatalog, schema: PropertySchemaDef | undefined, fieldKey: string): boolean {
    if (!schema) return true
    if (fieldKey in schema.fields) return true
    return !declaredFieldKeys(catalog).has(fieldKey)
  }

  return { schemas, agentTypeMap, getSchemaFor, isFieldApplicable }
}
