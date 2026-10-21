import { describe, expect, it } from 'vitest'
import { brandThemeCss, brandFontsHref, type BrandIdentity } from '../../utils/brandTheme'

/**
 * Tema de marca de la web pública (Cola 22): variables de color + tipografías
 * POR DEFECTO. Lo clave: las reglas de fuente NO llevan !important, para que lo
 * que fije el Constructor (globalStyles, con !important) siempre gane.
 */
const full: BrandIdentity = {
  colors: { primary: '#1F4A3F', secondary: '#B08D57', background: '#FFFFFF', text: '#16150F', accents: ['#087CFA', '#000000'] },
  fonts: { heading: 'Playfair Display', body: 'Inter', alt: 'Lora' },
}

describe('brandThemeCss', () => {
  it('sin marca no produce nada', () => {
    expect(brandThemeCss(null)).toBe('')
    expect(brandThemeCss(undefined)).toBe('')
    expect(brandThemeCss({ colors: { primary: null, secondary: null, background: null, text: null, accents: [] }, fonts: { heading: null, body: null, alt: null } })).toBe('')
  })

  it('emite variables de color (sólo las que existen) y las de acento numeradas', () => {
    const css = brandThemeCss(full)
    expect(css).toContain('--brand-primary:#1F4A3F')
    expect(css).toContain('--brand-secondary:#B08D57')
    expect(css).toContain('--brand-background:#FFFFFF')
    expect(css).toContain('--brand-text:#16150F')
    expect(css).toContain('--brand-accent-1:#087CFA')
    expect(css).toContain('--brand-accent-2:#000000')
    // Sólo las presentes.
    const partial = brandThemeCss({ colors: { primary: '#111111', secondary: null, background: null, text: null, accents: [] }, fonts: { heading: null, body: null, alt: null } })
    expect(partial).toContain('--brand-primary:#111111')
    expect(partial).not.toContain('--brand-secondary')
  })

  it('las fuentes por defecto se aplican al cuerpo y a los títulos SIN !important (el Constructor gana)', () => {
    const css = brandThemeCss(full)
    expect(css).toContain('[data-site-page]{font-family:"Inter"')
    expect(css).toContain('[data-site-page] h1')
    expect(css).toContain('"Playfair Display"')
    expect(css).not.toContain('!important')
  })

  it('sin tipografías, sólo las variables de color', () => {
    const css = brandThemeCss({ colors: { primary: '#111111', secondary: null, background: null, text: null, accents: [] }, fonts: { heading: null, body: null, alt: null } })
    expect(css).toBe(':root{--brand-primary:#111111}')
  })
})

describe('brandFontsHref', () => {
  it('pide a Google Fonts las familias de marca presentes', () => {
    const href = brandFontsHref(full)!
    expect(href).toContain('fonts.googleapis.com')
    expect(href).toContain('Playfair+Display')
    expect(href).toContain('Lora')
    // Inter ya la precarga el sitio: googleFontsHref la omite.
    expect(href).not.toContain('family=Inter')
  })

  it('sin marca o sin fuentes, null', () => {
    expect(brandFontsHref(null)).toBeNull()
    expect(brandFontsHref({ colors: { primary: '#111', secondary: null, background: null, text: null, accents: [] }, fonts: { heading: null, body: null, alt: null } })).toBeNull()
  })
})
