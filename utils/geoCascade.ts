/**
 * Desplegables dependientes de la ubicación de una propiedad:
 * País → Comunidad → Provincia → Municipio → Localidad.
 *
 * Salen del catálogo geográfico que ya usa el buscador (`public/geo/es.json`,
 * GeoNames): no hay una segunda lista. La propiedad guarda los NOMBRES
 * (`country`, `region`, `province`, `municipality`, `city`), como siempre,
 * así que ni cambia el modelo de datos ni se pierde nada de lo ya guardado.
 *
 * Es lógica pura (sin red ni Vue) para poder probarla: recibe el JSON ya leído.
 */
export const COUNTRY_SPAIN = 'España'

export interface GeoRaw {
  regions: [string, string, ...unknown[]][]
  /** [letra, ine (2 cifras), código de comunidad, nombre, …] */
  provinces: [string, string | null, string, string, ...unknown[]][]
  /** [ine, letra de provincia, nombre, …] */
  municipalities: [string, string, string, ...unknown[]][]
  /** [id, nombre, ine del municipio, …] */
  localities: [number, string, string, ...unknown[]][]
}

export interface GeoCascade {
  regions(): string[]
  provinces(region: string): string[]
  municipalities(province: string): string[]
  /** Localidades del municipio; el propio municipio va primero (una localidad puede coincidir con él). */
  localities(municipality: string, province?: string): string[]
  /** La comunidad y la provincia a las que pertenece un municipio dentro de una provincia, si se conoce. */
  parentsOf(province: string): { region: string | null }
}

const collator = new Intl.Collator('es', { sensitivity: 'base' })
const sorted = (xs: Iterable<string>) => [...new Set(xs)].sort((a, b) => collator.compare(a, b))

export function buildGeoCascade(raw: GeoRaw): GeoCascade {
  const regionByCode = new Map(raw.regions.map((r) => [String(r[0]), String(r[1])]))
  const provinces = raw.provinces.map((p) => ({ letter: String(p[0]), ine: p[1] ? String(p[1]) : null, regionCode: String(p[2]), name: String(p[3]) }))
  const provinceByName = new Map(provinces.map((p) => [p.name, p]))
  const munByProvinceLetter = new Map<string, { ine: string; name: string }[]>()
  for (const m of raw.municipalities) {
    const list = munByProvinceLetter.get(String(m[1])) ?? []
    list.push({ ine: String(m[0]), name: String(m[2]) })
    munByProvinceLetter.set(String(m[1]), list)
  }
  const locByIne = new Map<string, string[]>()
  for (const l of raw.localities) {
    const list = locByIne.get(String(l[2])) ?? []
    list.push(String(l[1]))
    locByIne.set(String(l[2]), list)
  }
  return {
    regions: () => sorted(regionByCode.values()),
    provinces: (region) => sorted(provinces.filter((p) => regionByCode.get(p.regionCode) === region).map((p) => p.name)),
    municipalities: (province) => {
      const p = provinceByName.get(province)
      return p ? sorted((munByProvinceLetter.get(p.letter) ?? []).map((m) => m.name)) : []
    },
    localities: (municipality, province) => {
      const p = province ? provinceByName.get(province) : null
      const muns = (p ? munByProvinceLetter.get(p.letter) ?? [] : [...munByProvinceLetter.values()].flat()).filter((m) => m.name === municipality)
      const locs = muns.flatMap((m) => locByIne.get(m.ine) ?? [])
      return [municipality, ...sorted(locs.filter((n) => n !== municipality))].filter(Boolean)
    },
    parentsOf: (province) => ({ region: provinceByName.has(province) ? regionByCode.get(provinceByName.get(province)!.regionCode) ?? null : null }),
  }
}

/**
 * Las opciones de un desplegable, sin perder lo ya guardado: si el valor actual
 * no está en el catálogo (una ficha antigua, escrita a mano) se añade como
 * opción para que siga viéndose y no se borre al abrir y guardar.
 */
export function withCurrent(options: string[], current: unknown): string[] {
  const v = typeof current === 'string' ? current.trim() : ''
  return v && !options.includes(v) ? [v, ...options] : options
}
