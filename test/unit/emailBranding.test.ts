import { describe, expect, it } from 'vitest'
import { renderEmailLayout } from '../../server/utils/email/layout'
import { absoluteEmailLogo } from '../../server/utils/email/send'

/**
 * Marca unificada en los emails (Cola 22·4): el color de acento y las
 * tipografías del Brand Kit se aplican al layout del correo, con reserva
 * web-safe para los clientes que no cargan la fuente.
 */
const base = { locale: 'es' as const, title: 'Hola', bodyHtml: '<p>cuerpo</p>', kind: 'transactional' as const }

describe('renderEmailLayout · marca del Brand Kit', () => {
  it('usa el color de marca como acento y las tipografías con su reserva', () => {
    const html = renderEmailLayout({
      ...base,
      branding: { companyName: 'Alpha', brandColor: '#1F4A3F', fonts: { heading: 'Playfair Display', body: 'Inter' } },
    })
    // Acento del Brand Kit en el filete del encabezado.
    expect(html).toContain('border-bottom:3px solid #1F4A3F')
    // Cuerpo con la familia de marca + reserva web-safe.
    expect(html).toContain("font-family:'Inter',-apple-system")
    // Titulares por <style> (lo honran Gmail/Apple Mail; Outlook cae al cuerpo).
    expect(html).toContain("h1,h2,h3{font-family:'Playfair Display',-apple-system")
    // Google Fonts enlazado para las familias de marca.
    expect(html).toMatch(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^"]*Playfair\+Display/)
  })

  it('sin marca: acento por defecto, tipografía del sistema y sin enlace de fuentes', () => {
    const html = renderEmailLayout({ ...base, branding: { companyName: 'Alpha' } })
    expect(html).toContain('border-bottom:3px solid #111827')
    expect(html).toContain('font-family:-apple-system,BlinkMacSystemFont')
    expect(html).not.toContain('fonts.googleapis.com')
  })

  it('una fuente no estándar no entra (el resolver ya filtra, pero el layout sólo pide a Google lo que reconoce)', () => {
    // El layout confía en que `fonts` ya viene saneado; si llegara una familia
    // desconocida, googleFontsHref no la pide (no está en el catálogo).
    const html = renderEmailLayout({ ...base, branding: { companyName: 'Alpha', fonts: { heading: 'Comic Sans MS', body: null } } })
    expect(html).not.toContain('fonts.googleapis.com')
  })

  it('pide esquema de color claro para que el modo oscuro no invierta la tarjeta (logo/colores)', () => {
    const html = renderEmailLayout({ ...base, branding: { companyName: 'Alpha', brandColor: '#1F4A3F' } })
    expect(html).toContain('<meta name="color-scheme" content="light">')
    expect(html).toContain('<meta name="supported-color-schemes" content="light">')
    expect(html).toMatch(/color-scheme:light/)
  })

  it('con logo: lo pinta como <img> (ya debe venir como URL absoluta desde send.ts)', () => {
    const html = renderEmailLayout({
      ...base,
      branding: { companyName: 'Alpha', logo: 'https://inmobiliaria.serendipiaagency.com/api/media/marca/logo.png' },
    })
    expect(html).toContain('<img src="https://inmobiliaria.serendipiaagency.com/api/media/marca/logo.png"')
  })
})

/**
 * El logo del email tiene que ser una URL ABSOLUTA y pública: una clave de R2 o
 * una ruta relativa se ve como imagen rota en el cliente de correo (el bug
 * reportado). `absoluteEmailLogo` convierte lo que haya guardado la empresa.
 */
describe('absoluteEmailLogo', () => {
  const base = 'https://inmobiliaria.serendipiaagency.com'

  it('una clave de R2 pasa a /api/media/<clave> sobre el dominio público', () => {
    expect(absoluteEmailLogo('marca/logo.png', base)).toBe(`${base}/api/media/marca/logo.png`)
  })

  it('una ruta relativa se ancla al dominio público', () => {
    expect(absoluteEmailLogo('/api/media/marca/logo.png', base)).toBe(`${base}/api/media/marca/logo.png`)
  })

  it('una URL absoluta se respeta tal cual', () => {
    expect(absoluteEmailLogo('https://cdn.example.com/logo.png', base)).toBe('https://cdn.example.com/logo.png')
  })

  it('sin base pública o sin logo devuelve null (mejor el nombre que una imagen rota)', () => {
    expect(absoluteEmailLogo('marca/logo.png', null)).toBeNull()
    expect(absoluteEmailLogo('', base)).toBeNull()
    expect(absoluteEmailLogo(null, base)).toBeNull()
  })
})
