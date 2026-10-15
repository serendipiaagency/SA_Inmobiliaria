import { describe, expect, it } from 'vitest'
import { GALLERY_CATEGORY_ORDER, GALLERY_DEFAULTS, GALLERY_RADIUS_MAX, buildGalleryModel, compactGalleryOptions, galleryUrl, mosaicLayout, normalizeGalleryOptions } from '../../utils/mediaGallery'
import { MEDIA_ROOMS, isMediaRoom, normalizeMediaRoom } from '../../utils/mediaRooms'
import { GALLERY_ICON_KEYS, galleryIconSvg } from '../../utils/mediaGalleryIcons'
import { tourEmbed, videoEmbed } from '../../utils/videoEmbed'
import { thumbFileName, thumbSize } from '../../utils/imageThumb'
import { PAGE_CORE_OPTIONS, fichaDisplayOptions, sanitizeCoreOptions } from '../../utils/siteBuilder/pages'

/**
 * Galería multimedia de la ficha (Cola 5): el modelo de categorías, el
 * mosaico, las estancias, los tours incrustables, las miniaturas y las
 * opciones del Constructor. Todo puro: sin base de datos ni navegador.
 */
const t = (_k: string, fallback: string) => fallback
const project = { name: 'Ático Centro', coverImage: 'k/portada.jpg' }

describe('modelo de la galería', () => {
  it('«Todas las fotos» lleva la portada primero y la galería en su orden, sin repetir; las fotos sin estancia siguen ahí', () => {
    const m = buildGalleryModel(
      { project, gallery: [{ id: 1, image: 'k/portada.jpg', room: 'living' }, { id: 2, image: 'k/a.jpg', room: 'kitchen', title: 'Cocina' }, { id: 3, image: 'k/b.jpg' }, { id: 4, image: 'k/a.jpg' }] },
      t,
    )
    expect(m.photos.map((x) => x.key)).toEqual(['cover', 'p2', 'p3'])
    expect(m.total).toBe(3)
    // La portada toma los datos de su fila de galería (estancia).
    expect(m.photos[0]!.room).toBe('living')
    expect(m.photos[1]!.title).toBe('Cocina')
    expect(m.unclassified).toBe(1)
    expect(m.rooms.map((r) => [r.key, r.count])).toEqual([['living', 1], ['kitchen', 1]])
    expect(m.photos[0]!.src).toBe('/api/media/k/portada.jpg')
  })

  it('una estancia fuera del catálogo se trata como «sin clasificar» (nada inventado)', () => {
    const m = buildGalleryModel({ project: { name: 'X' }, gallery: [{ id: 1, image: 'k/a.jpg', room: 'sotano-raro' }] }, t)
    expect(m.photos[0]!.room).toBeNull()
    expect(m.rooms).toEqual([])
  })

  it('sólo salen las categorías con contenido, en su orden canónico', () => {
    const none = buildGalleryModel({ project: { name: 'X' } }, t)
    expect(none.categories).toEqual([])
    expect(none.total).toBe(0)
    const m = buildGalleryModel(
      {
        project: { ...project, videoUrl: 'https://youtu.be/dQw4w9WgXcQ', masterPlanImage: 'k/master.png', dronePhoto: 'k/drone.jpg', nightPhoto: 'k/noche.jpg' },
        gallery: [{ id: 1, image: 'k/a.jpg' }],
        floorPlans: [{ id: 5, title: 'Planta baja', image: 'k/planta.png', sizes: null, floorDetails: null }],
        media: [
          { id: 9, mediaType: 'virtual_tour', url: 'https://my.matterport.com/show/?m=AbCdEfGh123', title: 'Tour' },
          { id: 10, mediaType: 'pano360', url: '/api/media/k/pano.jpg', title: 'Salón 360' },
          { id: 11, mediaType: 'render', url: '/api/media/k/render.jpg' },
        ],
        socialMedia: [{ platform: 'instagram', url: 'https://instagram.com/p/x' }, { platform: 'facebook', url: 'https://facebook.com/x' }],
      },
      t,
    )
    expect(m.categories.map((c) => c.key)).toEqual(['photos', 'videos', 'plans', 'pano360', 'tour', 'renders', 'drone', 'night', 'social'])
    expect(m.categories.map((c) => c.key)).toEqual(GALLERY_CATEGORY_ORDER.filter((k) => m.categories.some((c) => c.key === k)))
    // Los planos: el de la vivienda y, al final, el de la promoción. Las redes: sólo las que se saben incrustar.
    expect(m.categories.find((c) => c.key === 'plans')!.items.map((x) => x.title)).toEqual(['Planta baja', 'Plano de la promoción'])
    expect(m.categories.find((c) => c.key === 'social')!.count).toBe(1)
  })

  it('vídeo: YouTube y Vimeo se incrustan (nocookie/dnt); un archivo subido se reproduce; otro enlace se abre aparte', () => {
    const m = buildGalleryModel(
      {
        project: { name: 'X', videoUrl: 'https://youtu.be/dQw4w9WgXcQ' },
        media: [
          { id: 1, mediaType: 'video', url: 'https://vimeo.com/123456789' },
          { id: 2, mediaType: 'video', url: '/api/media/k/video.mp4', isFile: true },
          { id: 3, mediaType: 'video', url: 'https://example.com/v.mp4' },
          { id: 4, mediaType: 'video', url: 'https://youtu.be/dQw4w9WgXcQ' },
        ],
      },
      t,
    )
    const v = m.categories.find((c) => c.key === 'videos')!.items
    expect(v).toHaveLength(4) // el repetido no cuenta
    expect(v.map((x) => x.kind)).toEqual(['embed', 'embed', 'video', 'link'])
    expect(v[0]!.embed!.src).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(v[1]!.embed!.src).toContain('player.vimeo.com/video/123456789?dnt=1')
    expect(v[3]!.href).toBe('https://example.com/v.mp4')
    expect(v[3]!.embed).toBeNull()
  })

  it('tour: sólo Matterport se incrusta; Kuula y compañía se ofrecen como enlace, nunca como funcional', () => {
    expect(tourEmbed('https://my.matterport.com/show/?m=AbCdEfGh123')!.src).toBe('https://my.matterport.com/show/?m=AbCdEfGh123&play=1')
    expect(tourEmbed('http://my.matterport.com/show/?m=AbCdEfGh123')).toBeNull()
    expect(tourEmbed('https://my.matterport.com.evil.com/show/?m=AbCdEfGh123')).toBeNull()
    expect(tourEmbed('https://my.matterport.com/show/?m=<script>')).toBeNull()
    expect(tourEmbed('https://kuula.co/share/abc')).toBeNull()
    const m = buildGalleryModel({ project: { name: 'X' }, details: { virtualTourUrl: 'https://kuula.co/share/abc' } }, t)
    const tour = m.categories.find((c) => c.key === 'tour')!.items[0]!
    expect(tour.kind).toBe('link')
    expect(tour.href).toBe('https://kuula.co/share/abc')
    expect(videoEmbed('https://my.matterport.com/show/?m=AbCdEfGh123')).toBeNull()
  })

  it('miniatura: la de cada foto si la tiene y, si no, el original (compatibilidad con lo existente)', () => {
    const m = buildGalleryModel({ project: { name: 'X' }, gallery: [{ id: 1, image: 'k/a.jpg', thumb: 'k/a.thumb.webp' }, { id: 2, image: 'k/b.jpg' }] }, t)
    expect(m.photos[0]!.thumb).toBe('/api/media/k/a.thumb.webp')
    expect(m.photos[0]!.src).toBe('/api/media/k/a.jpg')
    expect(m.photos[1]!.thumb).toBe('/api/media/k/b.jpg')
    expect(galleryUrl('https://x.test/a.jpg')).toBe('https://x.test/a.jpg')
    expect(galleryUrl('')).toBe('')
  })
})

describe('mosaico', () => {
  it('portada grande y hasta cuatro secundarias; el resto, tras «Ver todas las fotos (n)»', () => {
    expect(mosaicLayout(0)).toEqual({ layout: 'none', shown: 0, hidden: 0 })
    expect(mosaicLayout(1)).toEqual({ layout: 'one', shown: 1, hidden: 0 })
    expect(mosaicLayout(2).layout).toBe('two')
    expect(mosaicLayout(3).layout).toBe('three')
    expect(mosaicLayout(4).layout).toBe('four')
    expect(mosaicLayout(5)).toEqual({ layout: 'five', shown: 5, hidden: 0 })
    expect(mosaicLayout(50)).toEqual({ layout: 'five', shown: 5, hidden: 45 })
  })
})

describe('estancias e iconos', () => {
  it('catálogo cerrado: una estancia válida o ninguna', () => {
    expect(isMediaRoom('kitchen')).toBe(true)
    expect(isMediaRoom('sotano')).toBe(false)
    expect(normalizeMediaRoom('')).toBeNull()
    expect(normalizeMediaRoom(null)).toBeNull()
    expect(normalizeMediaRoom('living')).toBe('living')
    expect(normalizeMediaRoom('nope')).toBeNull()
  })

  it('cada estancia y cada categoría tiene su icono SVG, con el mismo trazo y sin datos dentro', () => {
    for (const r of MEDIA_ROOMS) expect(GALLERY_ICON_KEYS, r).toContain(r)
    for (const k of ['photos', 'video', 'plan', 'pano360', 'tour', 'renders', 'drone', 'night', 'compare', 'staging', 'social', 'back', 'close', 'prev', 'next', 'download', 'zoomIn', 'play', 'external']) expect(GALLERY_ICON_KEYS, k).toContain(k)
    const svg = galleryIconSvg('living', 20)
    expect(svg).toContain('stroke-width="1.7"')
    expect(svg).toContain('aria-hidden="true"')
    expect(galleryIconSvg('living', 20, 'solid')).toContain('stroke-width="2.2"')
    expect(galleryIconSvg('no-existe')).toBe('')
  })
})

describe('miniaturas', () => {
  it('nunca más grandes que el original y sin deformar', () => {
    expect(thumbSize(4000, 3000)).toEqual({ width: 640, height: 480 })
    expect(thumbSize(500, 300)).toEqual({ width: 500, height: 300 })
    expect(thumbSize(0, 300)).toEqual({ width: 0, height: 0 })
    expect(thumbFileName('Salón principal 1.JPG')).toBe('Sal-n-principal-1.thumb.webp')
  })
})

describe('opciones del Constructor', () => {
  it('valores de partida y validación; sólo se guarda lo que difiere', () => {
    expect(normalizeGalleryOptions(undefined)).toEqual(GALLERY_DEFAULTS)
    const o = normalizeGalleryOptions({ height: 'tall', gap: 8, radius: 99, showCounter: false, categories: 'cards', iconStyle: 'solid', accent: '#1F4A3F', font: 'display', showAllButton: 'no' })
    expect(o).toMatchObject({ height: 'tall', gap: 8, radius: GALLERY_RADIUS_MAX, showCounter: false, categories: 'cards', iconStyle: 'solid', accent: '#1f4a3f', font: 'display', showAllButton: true })
    expect(normalizeGalleryOptions({ height: 'gigante', gap: 7, radius: -3, accent: 'rojo', categories: 'x' })).toEqual({ ...GALLERY_DEFAULTS, radius: 0 })
    expect(compactGalleryOptions(GALLERY_DEFAULTS)).toEqual({})
    expect(compactGalleryOptions(normalizeGalleryOptions({ gap: 8 }))).toEqual({ gap: 8 })
  })

  it('el servidor guarda `gallery` en la zona de la ficha y descarta lo que no vale; la clasificación no es del Constructor', () => {
    expect(PAGE_CORE_OPTIONS['property-detail']).toHaveProperty('gallery', 'gallery')
    expect(sanitizeCoreOptions('property-detail', { gallery: { height: 'compact', gap: 2, radius: 'x', categories: 'hidden', room: 'living', kinds: ['video'] } })).toEqual({ gallery: { height: 'compact', gap: 2, categories: 'hidden' } })
    expect(sanitizeCoreOptions('property-detail', { gallery: { height: 'standard' } })).toEqual({})
    expect(fichaDisplayOptions({}).gallery).toEqual(GALLERY_DEFAULTS)
    expect(fichaDisplayOptions({ gallery: { gap: 12 } }).gallery.gap).toBe(12)
  })
})
