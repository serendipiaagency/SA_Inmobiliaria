/**
 * Vídeos de YouTube y Vimeo incrustados en la ficha pública (FASE 7).
 *
 * Sólo se incrusta lo que se reconoce con un id válido, y siempre con el
 * reproductor «sin cookies» de cada proveedor (`youtube-nocookie.com`,
 * `dnt=1` en Vimeo): esos dos orígenes, y ningún otro, están en el
 * `frame-src` de la CSP (server/middleware/security-headers.ts). Cualquier
 * otro enlace externo se sigue abriendo aparte.
 */
export interface VideoEmbed {
  provider: 'youtube' | 'vimeo'
  id: string
  src: string
}

const YOUTUBE_ID = /^[\w-]{11}$/
const VIMEO_ID = /^\d{6,12}$/

export function videoEmbed(raw: string | null | undefined): VideoEmbed | null {
  if (!raw) return null
  let url: URL
  try {
    url = new URL(String(raw).trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const host = url.hostname.toLowerCase().replace(/^www\.|^m\./, '')
  const parts = url.pathname.split('/').filter(Boolean)

  let youtubeId: string | null = null
  if (host === 'youtu.be') youtubeId = parts[0] || null
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (parts[0] === 'watch') youtubeId = url.searchParams.get('v')
    else if (['embed', 'shorts', 'live', 'v'].includes(parts[0] || '')) youtubeId = parts[1] || null
  }
  if (youtubeId && YOUTUBE_ID.test(youtubeId)) {
    return { provider: 'youtube', id: youtubeId, src: `https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0` }
  }

  let vimeoId: string | null = null
  if (host === 'vimeo.com') vimeoId = parts.find((p) => VIMEO_ID.test(p)) || null
  else if (host === 'player.vimeo.com' && parts[0] === 'video') vimeoId = parts[1] || null
  if (vimeoId && VIMEO_ID.test(vimeoId)) {
    return { provider: 'vimeo', id: vimeoId, src: `https://player.vimeo.com/video/${vimeoId}?dnt=1` }
  }
  return null
}

/**
 * Tours virtuales incrustables (Cola 5 + Cola 21): los proveedores cuyo visor
 * público se puede incrustar sin cuenta y siempre por HTTPS — Matterport,
 * Kuula y Floorfy. Cada `origin` está en el `frame-src` de la CSP
 * (server/middleware/security-headers.ts usa TOUR_FRAME_ORIGINS) y se carga
 * sólo tras el consentimiento de «Contenido de terceros». Cualquier otro
 * proveedor se sigue ofreciendo como enlace que se abre aparte: no se
 * presenta como incrustable lo que no se ha comprobado, y el id/ruta se valida
 * siempre (nada de reflejar una URL arbitraria dentro de un iframe).
 */
export type TourProvider = 'matterport' | 'kuula' | 'floorfy'

export interface TourEmbed {
  provider: TourProvider
  id: string
  src: string
}

const MATTERPORT_ID = /^[\w-]{6,64}$/
const KUULA_ID = /^[\w-]{3,80}$/
const FLOORFY_ID = /^[\w-]{3,80}$/

interface TourProviderDef {
  provider: TourProvider
  /** Origen (esquema + host) que carga el iframe; va al frame-src de la CSP. */
  origin: string
  /** Devuelve {id, src} si la URL es un tour incrustable de este proveedor, o null. */
  resolve(url: URL): { id: string; src: string } | null
}

/** Visor público de Matterport: `my.matterport.com/show/?m=<id>`. */
const matterport: TourProviderDef = {
  provider: 'matterport',
  origin: 'https://my.matterport.com',
  resolve(url) {
    if (url.hostname.toLowerCase() !== 'my.matterport.com') return null
    const id = url.searchParams.get('m')
    if (!id || !MATTERPORT_ID.test(id)) return null
    return { id, src: `https://my.matterport.com/show/?m=${encodeURIComponent(id)}&play=1` }
  },
}

/** Kuula: páginas públicas `kuula.co/share/<id>`, `/share/collection/<id>` o `/post/<id>`, incrustables tal cual. */
const kuula: TourProviderDef = {
  provider: 'kuula',
  origin: 'https://kuula.co',
  resolve(url) {
    if (url.hostname.toLowerCase().replace(/^www\./, '') !== 'kuula.co') return null
    const parts = url.pathname.split('/').filter(Boolean)
    const head = parts[0]
    if (head !== 'share' && head !== 'post') return null
    // Todos los segmentos de la ruta deben ser seguros (ids, nunca una ruta arbitraria).
    if (!parts.every((p) => KUULA_ID.test(p))) return null
    const id = parts[parts.length - 1]!
    return { id, src: `https://kuula.co/${parts.join('/')}` }
  },
}

/** Floorfy: tour público `floorfy.com/tour/<id>` (con un prefijo de idioma opcional). */
const floorfy: TourProviderDef = {
  provider: 'floorfy',
  origin: 'https://floorfy.com',
  resolve(url) {
    if (url.hostname.toLowerCase().replace(/^www\./, '') !== 'floorfy.com') return null
    const parts = url.pathname.split('/').filter(Boolean)
    // Prefijo de idioma opcional de 2 letras (p. ej. /es/tour/<id>).
    const rest = parts.length && /^[a-z]{2}$/.test(parts[0]!) ? parts.slice(1) : parts
    if (rest[0] !== 'tour' || !rest[1] || !FLOORFY_ID.test(rest[1])) return null
    return { id: rest[1], src: `https://floorfy.com/tour/${rest[1]}` }
  },
}

const TOUR_PROVIDERS: TourProviderDef[] = [matterport, kuula, floorfy]

/** Orígenes de los proveedores de tour incrustables, para el frame-src de la CSP. */
export const TOUR_FRAME_ORIGINS: string[] = TOUR_PROVIDERS.map((p) => p.origin)

export function tourEmbed(raw: string | null | undefined): TourEmbed | null {
  if (!raw) return null
  let url: URL
  try {
    url = new URL(String(raw).trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  for (const def of TOUR_PROVIDERS) {
    const hit = def.resolve(url)
    if (hit) return { provider: def.provider, id: hit.id, src: hit.src }
  }
  return null
}
