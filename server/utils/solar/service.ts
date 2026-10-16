import { SOLAR_PROVIDER_STATUS, normalizeSolarExposure, type SolarExposure } from '../../../utils/solarExposure'

/**
 * Servicio de «Exposición solar»: pide la exposición de una propiedad a un
 * proveedor con licencia y la guarda en caché. No calcula nada por su cuenta.
 *
 * - **Un proveedor sólo se llama si su acceso está concedido** (`access: 'ready'`).
 *   Shadowmap no lo está (su API se da a socios en alta temprana y no publica
 *   endpoints ni autenticación): su adaptador no hace ninguna petición y el
 *   servicio devuelve `null`, es decir, «sin datos». Cuando haya licencia, sólo
 *   cambia ese adaptador; la ficha, el Constructor y las pruebas ya funcionan
 *   con el contrato de `utils/solarExposure.ts`.
 * - **Privacidad**: sólo se envían a un tercero las coordenadas publicadas, y sólo
 *   si la propiedad las publica con precisión (`locationPrivacy` exact); con una
 *   ubicación aproximada u oculta no se consulta nada.
 * - **Caché** (por coordenadas redondeadas y empresa): la exposición de un edificio
 *   no cambia entre visitas. En memoria del Worker, con caducidad; también se
 *   guarda la ausencia de dato, para no insistir al proveedor en cada visita.
 * - Un fallo del proveedor nunca rompe la ficha: se registra y la sección no sale.
 */
export interface SolarProvider {
  key: string
  name: string
  access: 'pending_access' | 'ready'
  fetch(input: { lat: number; lng: number; orgId: number }): Promise<unknown>
}

/** Shadowmap: sin acceso concedido ni documentación pública de la API, no se llama a nada. */
export const shadowmapProvider: SolarProvider = {
  key: SOLAR_PROVIDER_STATUS.key,
  name: SOLAR_PROVIDER_STATUS.name,
  access: SOLAR_PROVIDER_STATUS.state,
  async fetch() {
    return null
  },
}

export const SOLAR_PROVIDERS: SolarProvider[] = [shadowmapProvider]

const HIT_TTL_MS = 24 * 60 * 60 * 1000
const MISS_TTL_MS = 60 * 60 * 1000
const MAX_ENTRIES = 500
const cache = new Map<string, { value: SolarExposure | null; at: number }>()

export function clearSolarCache(): void {
  cache.clear()
}

export interface SolarProperty {
  organizationId: number
  lat?: number | string | null
  lng?: number | string | null
  locationPrivacy?: string | null
}

/** Las coordenadas que pueden salir hacia un tercero: las exactas y válidas, redondeadas a 5 decimales (~1 m). */
export function solarCoordinates(p: SolarProperty): { lat: number; lng: number } | null {
  const lat = Number(p.lat)
  const lng = Number(p.lng)
  if (p.lat == null || p.lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180 || (lat === 0 && lng === 0)) return null
  if ((p.locationPrivacy || 'exact') !== 'exact') return null
  const r = (n: number) => Math.round(n * 1e5) / 1e5
  return { lat: r(lat), lng: r(lng) }
}

export async function solarExposureFor(
  p: SolarProperty,
  opts: { providers?: SolarProvider[]; now?: () => number; log?: (msg: string) => void } = {},
): Promise<SolarExposure | null> {
  const coords = solarCoordinates(p)
  if (!coords) return null
  const providers = (opts.providers ?? SOLAR_PROVIDERS).filter((x) => x.access === 'ready')
  if (!providers.length) return null
  const now = opts.now ?? Date.now
  const key = `${p.organizationId}:${coords.lat},${coords.lng}`
  const hit = cache.get(key)
  if (hit && now() - hit.at < (hit.value ? HIT_TTL_MS : MISS_TTL_MS)) return hit.value

  let value: SolarExposure | null = null
  for (const provider of providers) {
    try {
      value = normalizeSolarExposure(await provider.fetch({ ...coords, orgId: p.organizationId }), provider.name)
    } catch (e) {
      // Sin detalles del error en el log (podrían llevar la credencial); la ficha sigue sin la sección.
      opts.log?.(`solar: el proveedor ${provider.key} no respondió (${e instanceof Error ? e.name : 'error'})`)
      value = null
    }
    if (value) break
  }
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string)
  cache.set(key, { value, at: now() })
  return value
}
