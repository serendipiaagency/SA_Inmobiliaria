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
