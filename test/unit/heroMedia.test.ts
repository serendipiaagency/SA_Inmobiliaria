import { describe, expect, it } from 'vitest'
import { HERO_SLIDE_SECONDS, heroBackgroundMode, heroFrames } from '../../utils/siteBuilder/heroMedia'

/**
 * Fondo del Hero (Constructor Web › Hero › Multimedia): bucle de imágenes o
 * imagen fija. Lo ya guardado (sin `backgroundMode`) sigue siendo el bucle.
 */
const DEFAULTS = ['d1.jpg', 'd2.jpg', 'd3.jpg']

describe('heroFrames — qué imágenes pinta el Hero', () => {
  it('sin modo guardado es el bucle de siempre, con las imágenes subidas o, si no hay, las de por defecto', () => {
    expect(heroBackgroundMode(undefined)).toBe('slideshow')
    expect(heroBackgroundMode('cualquier cosa')).toBe('slideshow')
    expect(heroFrames({ mode: undefined, slides: ['a.jpg', 'b.jpg'], fallback: DEFAULTS })).toEqual(['a.jpg', 'b.jpg'])
    expect(heroFrames({ mode: 'slideshow', slides: [], fallback: DEFAULTS })).toEqual(DEFAULTS)
    expect(heroFrames({ mode: 'slideshow', slides: ['', '  ', null, 'a.jpg'], fallback: DEFAULTS })).toEqual(['a.jpg'])
  })

  it('«Imagen fija»: una sola imagen — la elegida, o la primera del bucle, o la primera por defecto', () => {
    expect(heroFrames({ mode: 'static', image: 'fija.jpg', slides: ['a.jpg', 'b.jpg'], fallback: DEFAULTS })).toEqual(['fija.jpg'])
    expect(heroFrames({ mode: 'static', image: '', slides: ['a.jpg', 'b.jpg'], fallback: DEFAULTS })).toEqual(['a.jpg'])
    expect(heroFrames({ mode: 'static', image: null, slides: [], fallback: DEFAULTS })).toEqual(['d1.jpg'])
    expect(heroFrames({ mode: 'static', slides: [], fallback: [] })).toEqual([])
  })

  it('cada imagen del bucle se ve 7 segundos', () => {
    expect(HERO_SLIDE_SECONDS).toBe(7)
  })
})
