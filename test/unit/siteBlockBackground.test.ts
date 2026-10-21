import { describe, expect, it } from 'vitest'
import { blockBackgroundRender, sanitizeBlockStyle } from '../../utils/siteBuilder/background'

/**
 * Fondo de sección del Constructor Web (Cola 27): color de tema, «Color
 * corporativo» (token `brand`, resuelto en vivo contra el Brand Kit, nunca un
 * HEX congelado) o imagen con encaje, posición, repetición, superposición de
 * color y color de respaldo. El servidor sanea el `style` a lo que el render
 * entiende; el render traduce eso a clases y/o estilo en línea. Ambos usan
 * esta misma lógica pura.
 */
describe('sanitizeBlockStyle', () => {
  it('conserva los tokens de fondo conocidos (incluido el corporativo) y descarta los demás', () => {
    expect(sanitizeBlockStyle({ background: 'surface' })).toEqual({ background: 'surface' })
    expect(sanitizeBlockStyle({ background: 'brand' })).toEqual({ background: 'brand' })
    expect(sanitizeBlockStyle({ background: '#ff0000' })).toBeUndefined() // el fondo base no admite HEX arbitrario
    expect(sanitizeBlockStyle({ background: 'rojo' })).toBeUndefined()
  })

  it('slugifica el ancla y limita el espaciado al enum', () => {
    expect(sanitizeBlockStyle({ anchorId: ' Contacto Directo ' })).toEqual({ anchorId: 'contacto-directo' })
    expect(sanitizeBlockStyle({ paddingTop: 'sm', paddingBottom: 'enorme' })).toEqual({ paddingTop: 'sm' })
  })

  it('acepta una referencia de imagen segura y descarta las peligrosas (anti-inyección en url())', () => {
    expect(sanitizeBlockStyle({ backgroundImage: 'site-builder/foto.jpg' })!.backgroundImage).toBe('site-builder/foto.jpg')
    expect(sanitizeBlockStyle({ backgroundImage: 'https://cdn.example/x.png' })!.backgroundImage).toBe('https://cdn.example/x.png')
    expect(sanitizeBlockStyle({ backgroundImage: '/api/media/abc' })!.backgroundImage).toBe('/api/media/abc')
    // Un valor que rompería url(...) se descarta entero (y con él las opciones de imagen).
    expect(sanitizeBlockStyle({ backgroundImage: 'x.jpg"); background:url(evil)' })).toBeUndefined()
    expect(sanitizeBlockStyle({ backgroundImage: 'foo bar.jpg' })).toBeUndefined()
  })

  it('las opciones de imagen sólo se guardan si hay imagen, y la superposición necesita color Y opacidad', () => {
    // Sin imagen, las opciones de imagen no se conservan.
    expect(sanitizeBlockStyle({ backgroundSize: 'contain', backgroundRepeat: true, overlayColor: '#000000', overlayOpacity: 50 })).toBeUndefined()
    const s = sanitizeBlockStyle({
      backgroundImage: 'k.jpg',
      backgroundSize: 'contain',
      backgroundPosition: 'top',
      backgroundRepeat: true,
      overlayColor: '#112233',
      overlayOpacity: 150, // se recorta a 100
    })!
    expect(s).toMatchObject({ backgroundImage: 'k.jpg', backgroundSize: 'contain', backgroundPosition: 'top', backgroundRepeat: true, overlayColor: '#112233', overlayOpacity: 100 })
    // Encaje inválido → cover; opacidad 0 o sin color → sin superposición.
    const s2 = sanitizeBlockStyle({ backgroundImage: 'k.jpg', backgroundSize: 'raro', overlayColor: '#000000', overlayOpacity: 0 })!
    expect(s2.backgroundSize).toBe('cover')
    expect(s2.overlayColor).toBeUndefined()
    expect(s2.overlayOpacity).toBeUndefined()
  })

  it('devuelve undefined cuando no queda nada', () => {
    expect(sanitizeBlockStyle({})).toBeUndefined()
    expect(sanitizeBlockStyle(null)).toBeUndefined()
    expect(sanitizeBlockStyle('x')).toBeUndefined()
  })
})

describe('blockBackgroundRender', () => {
  it('un token de tema sin imagen sigue siendo una clase (como siempre)', () => {
    expect(blockBackgroundRender({ background: 'surface' })).toEqual({ classes: ['bg-surface'], inline: {} })
    expect(blockBackgroundRender({ background: 'ink' }).classes).toEqual(['bg-ink'])
  })

  it('«Color corporativo» se resuelve en vivo al color de marca (no un HEX congelado)', () => {
    const r = blockBackgroundRender({ background: 'brand' }, { brandColor: '#c07a54' })
    expect(r.classes).toEqual([])
    expect(r.inline).toEqual({ backgroundColor: '#c07a54' })
    // Sin color de marca, no pinta nada (deja el fondo propio del bloque).
    expect(blockBackgroundRender({ background: 'brand' }, { brandColor: null })).toEqual({ classes: [], inline: {} })
  })

  it('con imagen: la pinta en línea con encaje, posición, repetición, respaldo y superposición', () => {
    const r = blockBackgroundRender(
      { background: 'ink', backgroundImage: 'k.jpg', backgroundSize: 'contain', backgroundPosition: 'top', backgroundRepeat: true, overlayColor: '#000000', overlayOpacity: 50 },
      { imageUrl: '/api/media/k.jpg' },
    )
    expect(r.classes).toEqual([])
    expect(r.inline.backgroundImage).toBe('linear-gradient(0deg, rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url("/api/media/k.jpg")')
    expect(r.inline.backgroundSize).toBe('contain')
    expect(r.inline.backgroundPosition).toBe('top')
    expect(r.inline.backgroundRepeat).toBe('repeat')
    expect(r.inline.backgroundColor).toBe('#16150f') // respaldo del token ink
  })

  it('con imagen y fondo corporativo, el respaldo es el color de marca; sin superposición, sólo la imagen', () => {
    const r = blockBackgroundRender({ background: 'brand', backgroundImage: 'k.jpg' }, { brandColor: '#abcdef', imageUrl: '/api/media/k.jpg' })
    expect(r.inline.backgroundImage).toBe('url("/api/media/k.jpg")')
    expect(r.inline.backgroundRepeat).toBe('no-repeat')
    expect(r.inline.backgroundColor).toBe('#abcdef')
  })
})
