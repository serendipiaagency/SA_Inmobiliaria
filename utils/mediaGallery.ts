/**
 * Galería multimedia de la ficha pública (Cola 5): el modelo que pintan el
 * mosaico, la fila de categorías y el visor, construido una sola vez a partir
 * de lo que devuelve /api/public/properties/<slug>. Lógica pura, sin Vue:
 * la usan la ficha, la vista del Constructor y las pruebas.
 *
 * Reglas:
 *  - Las categorías salen SÓLO si tienen contenido real; ninguna se inventa.
 *  - «Todas las fotos» es la portada (si la hay) y la galería del editor, en
 *    su orden y sin repetir; las fotos sin estancia siguen ahí (nada se
 *    infiere del nombre del archivo).
 *  - Vídeos, planos, 360°, tour y el resto vienen de sus tablas: el backend
 *    es la fuente única; el Constructor sólo decide la presentación.
 */
import type { PublicFloorPlan } from './floorPlans'
import { isMediaRoom, MEDIA_ROOMS, type MediaRoom } from './mediaRooms'
import { videoEmbed, tourEmbed } from './videoEmbed'

export type GalleryCategoryKey = 'photos' | 'videos' | 'plans' | 'pano360' | 'tour' | 'renders' | 'drone' | 'night' | 'compare' | 'staging' | 'social'

/** Orden canónico de las categorías del visor. */
export const GALLERY_CATEGORY_ORDER: GalleryCategoryKey[] = ['photos', 'videos', 'plans', 'pano360', 'tour', 'renders', 'drone', 'night', 'compare', 'staging', 'social']

export const GALLERY_CATEGORY_ICON: Record<GalleryCategoryKey, string> = {
  photos: 'photos',
  videos: 'video',
  plans: 'plan',
  pano360: 'pano360',
  tour: 'tour',
  renders: 'renders',
  drone: 'drone',
  night: 'night',
  compare: 'compare',
  staging: 'staging',
  social: 'social',
}

export type GalleryItemKind = 'image' | 'video' | 'embed' | 'link' | 'plan' | 'pano' | 'compare' | 'social'

export interface GalleryItem {
  /** Única en toda la galería (`p12`, `v34`, `f5`, `cover`…). */
  key: string
  category: GalleryCategoryKey
  kind: GalleryItemKind
  /** Recurso a tamaño completo (ya como URL). */
  src: string
  /** Miniatura (la generada en el panel o, si no la hay, el original). */
  thumb: string
  alt: string
  title: string | null
  description: string | null
  room: MediaRoom | null
  width: number | null
  height: number | null
  /** Reproductor de un tercero (YouTube, Vimeo, Matterport), sólo con consentimiento. */
  embed: { provider: 'youtube' | 'vimeo' | 'matterport'; src: string } | null
  /** Enlace externo que se abre aparte (proveedor no incrustable). */
  href: string | null
  plan?: PublicFloorPlan
  compare?: { before: string; after: string; beforeLabel: string | null; afterLabel: string | null }
  social?: { platform: 'instagram' | 'tiktok'; url: string; caption?: string | null }
}

export interface GalleryCategory {
  key: GalleryCategoryKey
  label: string
  icon: string
  count: number
  /** Miniatura de la categoría: su primer elemento con imagen, o la portada. */
  thumb: string | null
  items: GalleryItem[]
}

export interface GalleryRoomFilter {
  key: MediaRoom
  label: string
  count: number
  thumb: string
}

export interface GalleryModel {
  /** «Todas las fotos», portada primero. */
  photos: GalleryItem[]
  categories: GalleryCategory[]
  /** Estancias con alguna foto, en el orden del catálogo. */
  rooms: GalleryRoomFilter[]
  /** Fotos sin estancia. */
  unclassified: number
  /** Número real de fotos: lo que dice «Ver todas las fotos (n)». */
  total: number
  cover: GalleryItem | null
}

export interface GalleryInputPhoto {
  id?: number
  image?: string | null
  title?: string | null
  alt?: string | null
  caption?: string | null
  description?: string | null
  room?: string | null
  thumb?: string | null
  width?: number | null
  height?: number | null
}
export interface GalleryInputMedia {
  id?: number
  mediaType: string
  url: string
  isFile?: boolean
  title?: string | null
  alt?: string | null
  caption?: string | null
  isMain?: boolean
  thumb?: string | null
  room?: string | null
}
export interface GalleryInput {
  project: Record<string, any>
  gallery?: GalleryInputPhoto[] | null
  media?: GalleryInputMedia[] | null
  floorPlans?: PublicFloorPlan[] | null
  socialMedia?: { platform?: string | null; url: string; caption?: string | null }[] | null
  details?: { virtualTourUrl?: string | null } | null
}

type Translate = (key: string, fallback: string) => string

/** La URL pública de una clave de R2 (o un enlace absoluto tal cual); la misma regla que composables/useMedia.ts. */
export function galleryUrl(key: string | null | undefined): string {
  if (!key) return ''
  if (key.startsWith('http') || key.startsWith('/')) return key
  return `/api/media/${key}`
}

const isExternal = (url: string) => /^https?:\/\//i.test(url)

export function galleryCategoryLabel(key: GalleryCategoryKey, t: Translate): string {
  const labels: Record<GalleryCategoryKey, [string, string]> = {
    photos: ['gallery.cat.photos', 'Todas las fotos'],
    videos: ['gallery.cat.videos', 'Vídeos'],
    plans: ['gallery.cat.plans', 'Planos'],
    pano360: ['gallery.cat.pano360', 'Vista 360°'],
    tour: ['gallery.cat.tour', 'Tour virtual'],
    renders: ['gallery.cat.renders', 'Renders'],
    drone: ['gallery.cat.drone', 'Vista aérea'],
    night: ['gallery.cat.night', 'Nocturna'],
    compare: ['gallery.cat.compare', 'Antes y después'],
    staging: ['gallery.cat.staging', 'Decoración virtual'],
    social: ['gallery.cat.social', 'Redes sociales'],
  }
  const [k, f] = labels[key]
  return t(k, f)
}

const ROOM_FALLBACK: Record<MediaRoom, string> = {
  living: 'Salón',
  kitchen: 'Cocina',
  dining: 'Comedor',
  bedroom: 'Dormitorios',
  bathroom: 'Baños',
  office: 'Despacho',
  hall: 'Recibidor',
  laundry: 'Lavadero',
  terrace: 'Terraza',
  balcony: 'Balcón',
  garden: 'Jardín',
  pool: 'Piscina',
  exterior: 'Exterior',
  facade: 'Fachada',
  views: 'Vistas',
  garage: 'Garaje',
  storage: 'Trastero',
  common: 'Zonas comunes',
  other: 'Otros',
}
export function galleryRoomLabel(room: MediaRoom, t: Translate): string {
  return t(`gallery.room.${room}`, ROOM_FALLBACK[room])
}

/** Construye el modelo a partir de la respuesta de la ficha. */
export function buildGalleryModel(d: GalleryInput, t: Translate): GalleryModel {
  const p = d.project || {}
  const name = String(p.name || '').trim()
  const items: GalleryItem[] = []
  const base = (over: Partial<GalleryItem> & Pick<GalleryItem, 'key' | 'category' | 'kind' | 'src'>): GalleryItem => ({
    thumb: over.src,
    alt: name,
    title: null,
    description: null,
    room: null,
    width: null,
    height: null,
    embed: null,
    href: null,
    ...over,
  })

  // --- Fotos: portada + galería (ya filtrada por el servidor), sin repetir ---
  const photos: GalleryItem[] = []
  const seen = new Set<string>()
  const galleryRows = d.gallery || []
  const coverKey = p.coverImage ? String(p.coverImage) : ''
  if (coverKey) {
    seen.add(coverKey)
    // Si la portada está también en la galería, sus datos (estancia, título, miniatura) valen.
    const row = galleryRows.find((g) => g.image === coverKey)
    photos.push(
      base({
        key: 'cover',
        category: 'photos',
        kind: 'image',
        src: galleryUrl(coverKey),
        thumb: galleryUrl(row?.thumb || coverKey),
        alt: row?.alt || row?.title || name,
        title: row?.title || null,
        description: row?.description || row?.caption || null,
        room: isMediaRoom(row?.room) ? row!.room : null,
        width: row?.width ?? null,
        height: row?.height ?? null,
      }),
    )
  }
  galleryRows.forEach((g, i) => {
    if (!g.image || seen.has(g.image)) return
    seen.add(g.image)
    photos.push(
      base({
        key: `p${g.id ?? i}`,
        category: 'photos',
        kind: 'image',
        src: galleryUrl(g.image),
        thumb: galleryUrl(g.thumb || g.image),
        alt: g.alt || g.title || `${name} ${photos.length + 1}`.trim(),
        title: g.title || null,
        description: g.description || g.caption || null,
        room: isMediaRoom(g.room) ? g.room : null,
        width: g.width ?? null,
        height: g.height ?? null,
      }),
    )
  })
  items.push(...photos)

  // --- Multimedia por tipo (el «principal» primero), sin repetir URL ---
  const media = d.media || []
  const byType = (type: string) => media.filter((m) => m.mediaType === type).sort((a, b) => Number(!!b.isMain) - Number(!!a.isMain))
  const seenUrl = new Set<string>()
  const videos: GalleryInputMedia[] = []
  if (p.videoUrl) {
    const url = isExternal(String(p.videoUrl)) ? String(p.videoUrl) : galleryUrl(String(p.videoUrl))
    seenUrl.add(url)
    videos.push({ mediaType: 'video', url, isFile: !isExternal(String(p.videoUrl)), title: null })
  }
  for (const v of byType('video')) {
    if (seenUrl.has(v.url)) continue
    seenUrl.add(v.url)
    videos.push(v)
  }
  const coverThumb = photos[0]?.thumb || ''
  videos.forEach((v, i) => {
    const embed = videoEmbed(v.url)
    const isFile = !!v.isFile || !isExternal(v.url)
    items.push(
      base({
        key: `v${v.id ?? i}`,
        category: 'videos',
        kind: isFile ? 'video' : embed ? 'embed' : 'link',
        src: v.url,
        thumb: galleryUrl(v.thumb || '') || coverThumb,
        alt: v.alt || v.title || `${name} — ${t('gallery.cat.videos', 'Vídeos')}`,
        title: v.title || null,
        description: v.caption || null,
        embed: embed ? { provider: embed.provider, src: embed.src } : null,
        href: !isFile && !embed ? v.url : null,
      }),
    )
  })

  // --- Planos: los de la vivienda y, al final, el de la promoción ---
  const plans: PublicFloorPlan[] = [...(d.floorPlans || []).filter((f) => !!f.image)]
  if (p.masterPlanImage) plans.push({ id: -1, title: t('mediaGallery.plan.masterPlan', 'Plano de la promoción'), image: String(p.masterPlanImage), sizes: null, floorDetails: null })
  plans.forEach((f) => {
    items.push(base({ key: `f${f.id}`, category: 'plans', kind: 'plan', src: galleryUrl(f.image), alt: `${name} — ${f.title}`, title: f.title, description: f.floorDetails || null, plan: f }))
  })

  // --- 360° (fotos esféricas subidas) ---
  byType('pano360').forEach((m, i) => {
    items.push(base({ key: `o${m.id ?? i}`, category: 'pano360', kind: 'pano', src: m.url, thumb: galleryUrl(m.thumb || '') || m.url, alt: m.alt || m.title || `${name} 360°`, title: m.title || null, description: m.caption || null, room: isMediaRoom(m.room) ? m.room : null }))
  })

  // --- Tour virtual: de la multimedia y del enlace de la ficha ampliada ---
  const tours: { id?: number; url: string; title?: string | null; thumb?: string | null }[] = byType('virtual_tour').map((m) => ({ id: m.id, url: m.url, title: m.title, thumb: m.thumb }))
  const tourUrl = d.details?.virtualTourUrl ? String(d.details.virtualTourUrl) : ''
  if (tourUrl && !tours.some((x) => x.url === tourUrl)) tours.push({ url: tourUrl, title: null })
  tours.forEach((x, i) => {
    const embed = tourEmbed(x.url)
    items.push(
      base({
        key: `t${x.id ?? `u${i}`}`,
        category: 'tour',
        kind: embed ? 'embed' : 'link',
        src: x.url,
        thumb: galleryUrl(x.thumb || '') || coverThumb,
        alt: x.title || `${name} — ${t('gallery.cat.tour', 'Tour virtual')}`,
        title: x.title || null,
        embed: embed ? { provider: embed.provider, src: embed.src } : null,
        href: embed ? null : x.url,
      }),
    )
  })

  // --- Renders ---
  byType('render').forEach((m, i) => {
    items.push(base({ key: `r${m.id ?? i}`, category: 'renders', kind: 'image', src: m.url, thumb: galleryUrl(m.thumb || '') || m.url, alt: m.alt || m.title || name, title: m.title || null, description: m.caption || null, room: isMediaRoom(m.room) ? m.room : null }))
  })

  // --- Vista aérea: la foto suelta y los recursos «drone» (foto o vídeo) ---
  if (p.dronePhoto) items.push(base({ key: 'drone', category: 'drone', kind: 'image', src: galleryUrl(String(p.dronePhoto)), alt: `${name} — ${t('mediaGallery.drone.alt', 'vista aérea')}` }))
  byType('drone').forEach((m, i) => {
    const isVideo = /\.(mp4|webm)(\?|$)/i.test(m.url)
    items.push(base({ key: `d${m.id ?? i}`, category: 'drone', kind: isVideo ? 'video' : 'image', src: m.url, thumb: galleryUrl(m.thumb || '') || (isVideo ? coverThumb : m.url), alt: m.alt || m.title || `${name} — ${t('mediaGallery.drone.alt', 'vista aérea')}`, title: m.title || null, description: m.caption || null }))
  })

  // --- Nocturna, antes/después y decoración virtual: las fotos sueltas de siempre ---
  if (p.nightPhoto) items.push(base({ key: 'night', category: 'night', kind: 'image', src: galleryUrl(String(p.nightPhoto)), alt: `${name} — ${t('mediaGallery.night.alt', 'vista nocturna')}` }))
  if (p.beforePhoto && p.afterPhoto) {
    items.push(base({ key: 'compare', category: 'compare', kind: 'compare', src: galleryUrl(String(p.afterPhoto)), thumb: galleryUrl(String(p.afterPhoto)), alt: `${name} — ${t('gallery.cat.compare', 'Antes y después')}`, compare: { before: galleryUrl(String(p.beforePhoto)), after: galleryUrl(String(p.afterPhoto)), beforeLabel: null, afterLabel: null } }))
  }
  if (p.aiStagedPhoto && photos[0]) {
    items.push(base({ key: 'staging', category: 'staging', kind: 'compare', src: galleryUrl(String(p.aiStagedPhoto)), thumb: galleryUrl(String(p.aiStagedPhoto)), alt: `${name} — ${t('gallery.cat.staging', 'Decoración virtual')}`, compare: { before: photos[0].src, after: galleryUrl(String(p.aiStagedPhoto)), beforeLabel: t('mediaGallery.compare.emptyBefore', 'Vacío'), afterLabel: t('mediaGallery.compare.withAi', 'Con IA') } }))
  }

  // --- Redes: sólo las plataformas que se saben incrustar ---
  ;(d.socialMedia || []).forEach((s, i) => {
    if (s.platform !== 'instagram' && s.platform !== 'tiktok') return
    items.push(base({ key: `s${i}`, category: 'social', kind: 'social', src: s.url, thumb: coverThumb, alt: `${name} — ${s.platform}`, title: s.caption || null, href: s.url, social: { platform: s.platform, url: s.url, caption: s.caption } }))
  })

  // --- Categorías no vacías, en el orden canónico ---
  const categories: GalleryCategory[] = GALLERY_CATEGORY_ORDER.map((key) => {
    const list = items.filter((x) => x.category === key)
    const withThumb = list.find((x) => x.thumb)
    return { key, label: galleryCategoryLabel(key, t), icon: GALLERY_CATEGORY_ICON[key], count: list.length, thumb: withThumb?.thumb || coverThumb || null, items: list }
  }).filter((c) => c.count > 0)

  // --- Estancias con fotos ---
  const rooms: GalleryRoomFilter[] = MEDIA_ROOMS.map((key) => {
    const list = photos.filter((x) => x.room === key)
    return { key, label: galleryRoomLabel(key, t), count: list.length, thumb: list[0]?.thumb || '' }
  }).filter((r) => r.count > 0)

  return {
    photos,
    categories,
    rooms,
    unclassified: photos.filter((x) => !x.room).length,
    total: photos.length,
    cover: photos[0] || null,
  }
}

// ---------------------------------------------------------------------------
// Mosaico (portada grande + secundarias)
// ---------------------------------------------------------------------------

export type MosaicLayout = 'none' | 'one' | 'two' | 'three' | 'four' | 'five'

/** Cuántas fotos pinta el mosaico y con qué rejilla; el resto queda tras «Ver todas las fotos (n)». */
export function mosaicLayout(count: number): { layout: MosaicLayout; shown: number; hidden: number } {
  const n = Math.max(0, Math.floor(count))
  const layout: MosaicLayout = n <= 0 ? 'none' : n === 1 ? 'one' : n === 2 ? 'two' : n === 3 ? 'three' : n === 4 ? 'four' : 'five'
  const shown = Math.min(n, 5)
  return { layout, shown, hidden: n - shown }
}

// ---------------------------------------------------------------------------
// Presentación (Constructor Web): sólo cómo se ve, nunca qué se enseña
// ---------------------------------------------------------------------------

export type GalleryHeight = 'compact' | 'standard' | 'tall'
export type GalleryCategoriesStyle = 'chips' | 'cards' | 'hidden'
export type GalleryIconStyle = 'outline' | 'solid'

export interface GalleryDisplayOptions {
  /** Altura del mosaico en escritorio (proporción de la portada). */
  height: GalleryHeight
  /** Separación entre fotos, en px. */
  gap: 0 | 2 | 4 | 8 | 12
  /** Radio de las esquinas, en px (0–24). */
  radius: number
  /** Contador «1 / N» sobre la portada. */
  showCounter: boolean
  /** Botón «Ver todas las fotos (n)». */
  showAllButton: boolean
  iconStyle: GalleryIconStyle
  /** Fila de categorías bajo el mosaico: chips, tarjetas con miniatura o nada (el visor las sigue teniendo). */
  categories: GalleryCategoriesStyle
  /** Color de los estados activos (chip activo, botón «Ver todas»); vacío = color de marca. */
  accent: string | null
  /** Tipografía de etiquetas y contadores: la del texto o la de los títulos del sitio. */
  font: 'inherit' | 'display'
}

export const GALLERY_DEFAULTS: GalleryDisplayOptions = {
  height: 'standard',
  gap: 4,
  radius: 14,
  showCounter: true,
  showAllButton: true,
  iconStyle: 'outline',
  categories: 'chips',
  accent: null,
  font: 'inherit',
}

export const GALLERY_GAPS = [0, 2, 4, 8, 12] as const
export const GALLERY_RADIUS_MAX = 24

/** Proporción de la portada del mosaico por altura, en escritorio (ancho / alto). */
export const GALLERY_COVER_RATIO: Record<GalleryHeight, number> = { compact: 1.9, standard: 1.55, tall: 1.3 }

export function normalizeGalleryOptions(value: unknown): GalleryDisplayOptions {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const gapN = Number(v.gap)
  const radiusN = Number(v.radius)
  const accent = typeof v.accent === 'string' && /^#[0-9a-f]{6}$/i.test(v.accent) ? v.accent.toLowerCase() : null
  return {
    height: v.height === 'compact' || v.height === 'tall' ? v.height : 'standard',
    gap: (GALLERY_GAPS as readonly number[]).includes(gapN) ? (gapN as GalleryDisplayOptions['gap']) : GALLERY_DEFAULTS.gap,
    radius: Number.isFinite(radiusN) && v.radius !== '' && v.radius !== null && v.radius !== undefined ? Math.min(GALLERY_RADIUS_MAX, Math.max(0, Math.round(radiusN))) : GALLERY_DEFAULTS.radius,
    showCounter: v.showCounter !== false,
    showAllButton: v.showAllButton !== false,
    iconStyle: v.iconStyle === 'solid' ? 'solid' : 'outline',
    categories: v.categories === 'cards' || v.categories === 'hidden' ? v.categories : 'chips',
    accent,
    font: v.font === 'display' ? 'display' : 'inherit',
  }
}

/** Sólo lo que difiere de lo de partida, para guardar poco en el bloque. */
export function compactGalleryOptions(o: GalleryDisplayOptions): Partial<GalleryDisplayOptions> {
  const out: Partial<GalleryDisplayOptions> = {}
  for (const k of Object.keys(GALLERY_DEFAULTS) as (keyof GalleryDisplayOptions)[]) {
    if (o[k] !== GALLERY_DEFAULTS[k]) (out as any)[k] = o[k]
  }
  return out
}
