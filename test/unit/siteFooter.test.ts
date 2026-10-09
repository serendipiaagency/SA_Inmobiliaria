import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  FOOTER_DEFAULT_COLORS,
  FOOTER_TARGETS,
  darkenForWhiteText,
  defaultFooterConfig,
  footerLinkProblem,
  footerPalette,
  normalizeFooterConfig,
  resolveFooterContact,
  resolveFooterLinks,
  resolveFooterSocial,
  safeExternalUrl,
  socialLinksFromBrandKit,
  telHref,
  validSocialUrl,
  type FooterConfig,
} from '../../utils/siteFooter'
import { SITE_PAGE_KEYS } from '../../utils/siteBuilder/pages'
import { relativeLuminance } from '../../utils/contactTone'

/**
 * El pie global de la web (megaprompt «footer»): el modelo compartido de
 * utils/siteFooter.ts. Lo que la web enseña sale siempre de aquí: la
 * normalización de lo guardado, los enlaces con identificador estable, las
 * redes y el contacto sin nada inventado, y los colores de la empresa
 * siempre legibles.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const t = (_k: string, fallback: string) => fallback
const contrast = (bg: string) => 1.05 / (relativeLuminance([1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16)) as [number, number, number]) + 0.05)

describe('el pie de partida: el de siempre, en cinco columnas y sin páginas inexistentes', () => {
  const d = defaultFooterConfig()
  it('cinco columnas en orden, todas visibles, con las redes y el contacto', () => {
    expect(d.order).toEqual(['identity', 'explore', 'company', 'services', 'newsletter'])
    expect(Object.values(d.show).every(Boolean)).toBe(true)
    expect(d.landscape.mode).toBe('none')
  })
  it('cada enlace de partida apunta a una página real de la web (ruta de pages/)', () => {
    const PAGE_FILES = ['/propiedades', '/mapa', '/zonas', '/promotoras', '/nosotros', '/equipo', '/blog', '/servicios', '/contacto', '/visitante', '/vender', '/mi-cuenta', '/favoritos', '/proveedores/registro', '/reclamaciones', '/privacidad', '/terminos', '/cookies']
    for (const target of FOOTER_TARGETS) {
      const path = target.path.split('?')[0]!
      expect(PAGE_FILES, `${target.id} → ${target.path}`).toContain(path)
    }
    for (const col of Object.values(d.columns)) for (const l of col.links) expect(FOOTER_TARGETS.map((x) => x.id)).toContain(l.target)
  })
  it('«Servicios» sólo cuando esa página del Constructor está publicada; «Promotores» no va de partida', () => {
    expect(FOOTER_TARGETS.find((x) => x.id === 'services')?.requiresPublished).toBe('servicios')
    expect(SITE_PAGE_KEYS).toContain('servicios')
    expect(d.columns.company.links.map((l) => l.target)).toContain('services')
    expect(Object.values(d.columns).flatMap((c) => c.links.map((l) => l.target))).not.toContain('developers')
  })
})

describe('normalización: todo lo guardado pasa por aquí', () => {
  it('cualquier basura da un pie completo y de partida', () => {
    expect(normalizeFooterConfig(null)).toEqual(defaultFooterConfig())
    expect(normalizeFooterConfig('x')).toEqual(defaultFooterConfig())
    expect(normalizeFooterConfig({ order: ['zzz', 'newsletter', 'newsletter'], show: { identity: 'no' } }).order).toEqual(['newsletter', 'identity', 'explore', 'company', 'services'])
  })
  it('textos con tope, colores sólo #rrggbb, opciones cerradas y números acotados', () => {
    const c = normalizeFooterConfig({
      description: ' hola\u0000 ' + 'x'.repeat(500),
      design: { background: 'red', text: '#ABCDEF', fontSize: 'xl', socialStyle: 'solid' },
      landscape: { mode: 'image', image: 'javascript:alert(1)', opacity: 500, height: 1, position: 'left' },
      bottom: { showLanguage: 'yes' },
    })
    expect(c.description.length).toBe(400)
    expect(c.description.startsWith('hola  x')).toBe(true)
    expect(c.design).toMatchObject({ background: '', text: '#abcdef', fontSize: 'md', socialStyle: 'solid' })
    expect(c.landscape).toMatchObject({ mode: 'image', image: '', opacity: 60, height: 80, position: 'bottom' })
    expect(c.bottom.showLanguage).toBe(true)
  })
  it('los enlaces conservan su id, descartan lo malformado y no pasan de 12; un destino desaparecido NO se borra', () => {
    const links = [
      { id: 'a', kind: 'page', target: 'buy', label: 'Compra' },
      { id: 'a', kind: 'page', target: 'map' },
      { kind: 'url', target: 'https://ejemplo.com/x', visible: false },
      { kind: 'page', target: 'pagina-que-ya-no-existe' },
      null,
      { kind: 'page', target: '' },
      ...Array.from({ length: 20 }, (_, i) => ({ kind: 'page', target: 'blog', id: `b${i}` })),
    ]
    const c = normalizeFooterConfig({ columns: { explore: { title: 'Descubre', links } } })
    expect(c.columns.explore.title).toBe('Descubre')
    expect(c.columns.explore.links).toHaveLength(12)
    expect(c.columns.explore.links.slice(0, 4)).toEqual([
      { id: 'a', kind: 'page', target: 'buy', label: 'Compra', visible: true },
      { id: 'a-1', kind: 'page', target: 'map', label: '', visible: true },
      { id: 'l-2', kind: 'url', target: 'https://ejemplo.com/x', label: '', visible: false },
      { id: 'l-3', kind: 'page', target: 'pagina-que-ya-no-existe', label: '', visible: true },
    ])
    // Las otras columnas, de partida.
    expect(c.columns.company).toEqual(defaultFooterConfig().columns.company)
  })
  it('redes: null = las del Brand Kit; una lista guarda lo escrito (la web filtra)', () => {
    expect(normalizeFooterConfig({}).social).toBeNull()
    expect(normalizeFooterConfig({ social: [] }).social).toEqual([])
    expect(normalizeFooterConfig({ social: [{ network: 'instagram', url: 'x' }, { network: 'myspace', url: 'https://myspace.com' }] }).social).toEqual([{ network: 'instagram', url: 'x' }])
  })
  it('lo guardado con el modelo de hoy vuelve igual (sin pérdidas al releer)', () => {
    const d = defaultFooterConfig()
    d.description = 'Somos una inmobiliaria de barrio.'
    d.columns.services.links.push({ id: 'ext', kind: 'url', target: 'https://valoracion.ejemplo.com', label: 'Valoración', visible: true })
    d.hideOnMobile = ['landscape', 'social']
    d.contact.hours = 'Lun - Vie 9:00 - 18:00'
    expect(normalizeFooterConfig(JSON.parse(JSON.stringify(d)))).toEqual(d)
  })
})

describe('enlaces: identificadores estables, destinos reales y externos seguros', () => {
  it('externos: http(s) con dominio, mailto: y tel:; nada más', () => {
    expect(safeExternalUrl('https://ejemplo.com/ruta?x=1')).toBe('https://ejemplo.com/ruta?x=1')
    expect(safeExternalUrl('mailto:hola@ejemplo.com')).toBe('mailto:hola@ejemplo.com')
    expect(safeExternalUrl('tel:+34 985 000 100')).toBe('tel:+34985000100')
    for (const bad of ['javascript:alert(1)', 'ftp://x.com', 'https://localhost', 'https://user:pw@ejemplo.com', 'ejemplo.com', '']) expect(safeExternalUrl(bad), bad).toBeNull()
  })
  it('qué se enseña: visibles con destino; lo demás, con su motivo', () => {
    const col: FooterConfig['columns']['explore'] = {
      title: '',
      links: [
        { id: '1', kind: 'page', target: 'buy', label: '', visible: true },
        { id: '2', kind: 'page', target: 'services', label: '', visible: true },
        { id: '3', kind: 'page', target: 'nope', label: '', visible: true },
        { id: '4', kind: 'url', target: 'javascript:x', label: 'Mal', visible: true },
        { id: '5', kind: 'url', target: 'https://ejemplo.com/', label: '', visible: true },
        { id: '6', kind: 'page', target: 'map', label: 'Oculto', visible: false },
      ],
    }
    expect(resolveFooterLinks(col, { publishedPages: [] }, t)).toEqual([
      { id: '1', label: 'Comprar', to: '/propiedades?operacion=venta', external: false },
      { id: '5', label: 'ejemplo.com', to: 'https://ejemplo.com/', external: true },
    ])
    expect(resolveFooterLinks(col, { publishedPages: ['servicios'] }, t).map((l) => l.id)).toEqual(['1', '2', '5'])
    expect(footerLinkProblem(col.links[1]!, { publishedPages: [] })).toBe('unpublished-page')
    expect(footerLinkProblem(col.links[2]!, null)).toBe('unknown-page')
    expect(footerLinkProblem(col.links[3]!, null)).toBe('invalid-url')
    expect(footerLinkProblem(col.links[0]!, null)).toBeNull()
  })
})

describe('redes sociales: sólo las configuradas y sólo hacia su propia red', () => {
  it('URL válida = https y dominio (o subdominio) de esa red', () => {
    expect(validSocialUrl('instagram', 'https://www.instagram.com/norteastur/')).toBe('https://www.instagram.com/norteastur/')
    expect(validSocialUrl('x', 'https://twitter.com/a')).toBe('https://twitter.com/a')
    expect(validSocialUrl('instagram', 'https://instagram.com.evil.io/x')).toBeNull()
    expect(validSocialUrl('instagram', 'http://instagram.com/x')).toBeNull()
    expect(validSocialUrl('facebook', 'https://instagram.com/x')).toBeNull()
    expect(validSocialUrl('instagram', 'https://norteastur.example/instagram')).toBeNull()
  })
  it('del Brand Kit sólo salen las reales; «twitter» cuenta como X', () => {
    const json = JSON.stringify({ instagram: 'https://instagram.com/a', facebook: 'https://facebook.example/a', twitter: 'https://x.com/a', youtube: '' })
    expect(socialLinksFromBrandKit(json)).toEqual([
      { network: 'instagram', url: 'https://instagram.com/a' },
      { network: 'x', url: 'https://x.com/a' },
    ])
    expect(socialLinksFromBrandKit('{bad')).toEqual([])
    expect(socialLinksFromBrandKit(null)).toEqual([])
  })
  it('el pie usa las suyas si las eligió, si no las del Brand Kit, y nunca repite una red', () => {
    const profile = { phone: null, location: null, mapQuery: null, social: [{ network: 'facebook' as const, url: 'https://facebook.com/kit' }] }
    const cfg = defaultFooterConfig()
    expect(resolveFooterSocial(cfg, profile)).toEqual(profile.social)
    cfg.social = [
      { network: 'instagram', url: 'https://instagram.com/x' },
      { network: 'instagram', url: 'https://instagram.com/y' },
      { network: 'linkedin', url: 'no' },
    ]
    expect(resolveFooterSocial(cfg, profile)).toEqual([{ network: 'instagram', url: 'https://instagram.com/x' }])
    cfg.social = []
    expect(resolveFooterSocial(cfg, profile)).toEqual([])
  })
})

describe('contacto: lo escrito o lo de la empresa; sin datos, nada', () => {
  it('teléfono → tel:; horario sólo si se escribe; «Ver en el mapa» con la dirección de la oficina', () => {
    const cfg = defaultFooterConfig()
    const profile = { phone: '+34 985 000 100', location: 'Oviedo, Asturias', mapQuery: 'Calle Uría 1, 33003, Oviedo, Asturias', social: [] }
    const c = resolveFooterContact(cfg, profile)
    expect(c.phone).toEqual({ label: '+34 985 000 100', href: 'tel:+34985000100' })
    expect(c.hours).toBe('')
    expect(c.location?.label).toBe('Oviedo, Asturias')
    expect(c.location?.mapUrl).toContain('google.com/maps/search/?api=1&query=Calle%20Ur%C3%ADa%201')
    cfg.contact = { phone: '900 11 22 33', hours: 'Lun - Vie 9:00 - 18:00', location: 'Gijón', showMap: false }
    const own = resolveFooterContact(cfg, profile)
    expect(own.phone?.href).toBe('tel:900112233')
    expect(own.hours).toBe('Lun - Vie 9:00 - 18:00')
    expect(own.location).toEqual({ label: 'Gijón', mapUrl: null })
  })
  it('sin empresa con datos, nada que enseñar (ni teléfono inventado ni ciudad)', () => {
    const c = resolveFooterContact(defaultFooterConfig(), { phone: null, location: null, mapQuery: null, social: [] })
    expect(c).toEqual({ phone: null, hours: '', location: null })
    expect(telHref('sin número')).toBeNull()
  })
})

describe('colores: los de la empresa, siempre legibles', () => {
  it('de partida: blanco cálido, melocotón y el color de marca oscurecido hasta contraste AA', () => {
    const p = footerPalette(defaultFooterConfig().design, '#f2d31c')
    expect(p.background).toBe(FOOTER_DEFAULT_COLORS.background)
    expect(p.headingBackground).toBe(FOOTER_DEFAULT_COLORS.headingBackground)
    expect(contrast(p.accent)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(p.bottomBackground)).toBeGreaterThanOrEqual(7)
    expect(footerPalette(defaultFooterConfig().design, '#1f4a3f').accent).toBe('#1f4a3f')
    expect(footerPalette(defaultFooterConfig().design, null).accent).toBe(FOOTER_DEFAULT_COLORS.ink)
  })
  it('lo elegido en el Constructor manda', () => {
    const d = { ...defaultFooterConfig().design, background: '#ffffff', bottomBackground: '#101010', accent: '#7a3f26' }
    expect(footerPalette(d, '#1f4a3f')).toMatchObject({ background: '#ffffff', bottomBackground: '#101010', accent: '#7a3f26' })
    expect(darkenForWhiteText('#ffffff')).not.toBe('#ffffff')
    expect(darkenForWhiteText('no-color')).toBe('no-color')
  })
})

describe('el componente: lo que el megaprompt exige, en el código', () => {
  const footer = readFileSync(join(ROOT, 'components/site/SiteFooter.vue'), 'utf8')
  const newsletter = readFileSync(join(ROOT, 'components/site/FooterNewsletter.vue'), 'utf8')
  it('conserva «Configurar cookies» con el panel real y el bloque de marca', () => {
    expect(footer).toMatch(/data-testid="footer-cookie-settings"[^>]*@click="cookieConsent\.openSettings\(\)"/)
    expect(footer).toMatch(/<Logo /)
    expect(footer).toContain('© {{ year }}')
  })
  it('enlaces externos y redes con noopener; el formulario con consentimiento, campo trampa y sin envíos', () => {
    expect((footer.match(/target="_blank" rel="noopener noreferrer"/g) || []).length).toBeGreaterThanOrEqual(3)
    expect(newsletter).toContain('privacyAccepted: true')
    expect(newsletter).toContain('name="website"')
    expect(newsletter).not.toMatch(/sendEmail|resend/i)
  })
  it('el servidor del newsletter no envía nada ni guarda tokens en claro', () => {
    const srv = readFileSync(join(ROOT, 'server/utils/newsletter.ts'), 'utf8')
    expect(srv).not.toMatch(/sendEmail|sendTransactional|resend/i)
    expect(srv).toMatch(/unsubscribeTokenHash: await hashToken/)
    expect(srv).not.toMatch(/unsubscribeToken:\s*unsubscribeToken\s*,?\s*\n.*insert/)
  })
})
