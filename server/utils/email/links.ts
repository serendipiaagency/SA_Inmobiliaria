import { getRequestURL, type H3Event } from 'h3'
import { cfEnv } from '../db'

const HTTPS_ORIGIN_RE = /^https?:\/\/[^/\s]+$/i

/**
 * Origen público de la plataforma para los enlaces de los emails (acceder,
 * definir contraseña, ver la ficha…): `PLATFORM_BASE_URL` si está configurada
 * y, si no, el origen de la propia petición. Nunca un localhost fijo.
 */
export function platformBaseUrl(event: H3Event): string {
  const configured = String((cfEnv(event) as Record<string, any>).PLATFORM_BASE_URL || '').trim().replace(/\/+$/, '')
  return HTTPS_ORIGIN_RE.test(configured) ? configured : getRequestURL(event).origin
}

/** Lo mismo sin petición (tareas programadas): sólo con `PLATFORM_BASE_URL`; si no, null y el email va sin botón. */
export function configuredPlatformBaseUrl(env: Record<string, any>): string | null {
  const configured = String(env.PLATFORM_BASE_URL || '').trim().replace(/\/+$/, '')
  return HTTPS_ORIGIN_RE.test(configured) ? configured : null
}
