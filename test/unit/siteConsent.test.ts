import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CONSENT_LOCALES,
  CONSENT_PAGE_KEY,
  COOKIE_DEFAULT_COLORS,
  COOKIE_TEXTS,
  DEMO_DEFAULT_COLORS,
  cookiePalette,
  cookieText,
  defaultCookieNotice,
  defaultDemoNotice,
  defaultSiteConsent,
  demoNoticeStorageKey,
  demoPalette,
  demoText,
  normalizeCookieNotice,
  normalizeDemoNotice,
  normalizeSiteConsent,
} from '../../utils/siteConsent'
import { consentVersion, NO_COOKIE_PROVIDERS } from '../../utils/cookieConsent'
import { SITE_PAGE_KEYS } from '../../utils/siteBuilder/pages'
import { FOOTER_PAGE_KEY } from '../../utils/siteFooter'
import { messages } from '../../i18n/messages'
import { relativeLuminance } from '../../utils/contactTone'

/**
 * La presentación configurable del aviso de cookies y del aviso de
 * demostración (megaprompt «cookies»): el modelo compartido de
 * utils/siteConsent.ts. Lo que la web enseña sale siempre de aquí: la
 * normalización de lo guardado, los textos por idioma con los de la web de
 * respaldo, los colores de la empresa siempre legibles, y —sobre todo— que
 * nada de esto toca la lógica del consentimiento.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const es = (messages as any).es as Record<string, string>
const t = (key: string) => es[key] ?? `??${key}`
const contrast = (bg: string) => 1.05 / (relativeLuminance([1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16)) as [number, number, number]) + 0.05)

describe('los avisos de partida: los de siempre', () => {
  const d = defaultSiteConsent()
  it('aviso de cookies centrado, blanco cálido, con logo, radio 24 y los tres textos vacíos (= los de la web)', () => {
    expect(d.cookie.layout.position).toBe('center')
    expect(d.cookie.design.showLogo).toBe(true)
    expect(d.cookie.design.radius).toBe(24)
    expect(d.cookie.design.categoryIcons).toBe(true)
    for (const locale of CONSENT_LOCALES) for (const def of COOKIE_TEXTS) expect(d.cookie.texts[locale][def.key]).toBe('')
  })
  it('aviso de demostración activo, arriba a la izquierda, con cierre que dura la visita', () => {
    expect(d.demo.enabled).toBe(true)
    expect(d.demo.position).toBe('top-left')
    expect(d.demo.closable).toBe(true)
    expect(d.demo.rememberClose).toBe('session')
  })
  it('la clave reservada «consent» no es una página del Constructor ni choca con el pie', () => {
    expect(SITE_PAGE_KEYS).not.toContain(CONSENT_PAGE_KEY)
    expect(CONSENT_PAGE_KEY).not.toBe(FOOTER_PAGE_KEY)
  })
  it('cada texto configurable tiene su clave de i18n en los seis idiomas', () => {
    for (const def of COOKIE_TEXTS) for (const locale of CONSENT_LOCALES) expect((messages as any)[locale][def.i18nKey], `${def.i18nKey} en ${locale}`).toBeTruthy()
    for (const locale of CONSENT_LOCALES) for (const k of ['demo.notice.title', 'demo.notice.text', 'demo.notice.close']) expect((messages as any)[locale][k], `${k} en ${locale}`).toBeTruthy()
  })
})

describe('normalización: todo lo guardado pasa por aquí', () => {
  it('nada, basura o un array → los avisos de partida', () => {
    for (const raw of [null, undefined, 'x', 7, [], { cookie: 'no', demo: [] }]) expect(normalizeSiteConsent(raw)).toEqual(defaultSiteConsent())
  })
  it('colores sólo #rrggbb, números acotados, opciones cerradas; lo demás, de partida', () => {
    const c = normalizeCookieNotice({
      design: { background: 'red', accent: '#ABCDEF', overlayOpacity: 500, radius: -3, shadow: 'neon', titleFont: 'comic', buttonShape: 'pill' },
      layout: { position: 'top', maxWidth: 10, edgeOffset: 'x', maxHeight: 99, mobile: 'drawer' },
      behavior: { animation: 'bounce', showChangeText: 'no' },
    })
    expect(c.design.background).toBe('')
    expect(c.design.accent).toBe('#abcdef')
    expect(c.design.overlayOpacity).toBe(80)
    expect(c.design.radius).toBe(0)
    expect(c.design.shadow).toBe('soft')
    expect(c.design.titleFont).toBe('serif')
    expect(c.layout.position).toBe('center')
    expect(c.layout.maxWidth).toBe(360)
    expect(c.layout.edgeOffset).toBe(24)
    expect(c.layout.maxHeight).toBe(95)
    expect(c.layout.mobile).toBe('sheet')
    expect(c.behavior.animation).toBe('fade')
    expect(c.behavior.showChangeText).toBe(true)
    expect(normalizeCookieNotice({ design: { categoryIcons: false } }).design.categoryIcons).toBe(false)
    expect(normalizeCookieNotice({ design: { categoryIcons: 'no' } }).design.categoryIcons).toBe(true)
  })
  it('textos: con tope, sin caracteres de control, sólo en los idiomas de la web y sólo las claves conocidas', () => {
    const c = normalizeCookieNotice({ texts: { es: { title: '  Hola\u0007 mundo ', intro: 'a\nb', extra: 'x' }, kl: { title: 'klingon' }, en: 'no' } })
    expect(c.texts.es.title).toBe('Hola  mundo')
    expect(c.texts.es.intro).toBe('a\nb')
    expect((c.texts as any).kl).toBeUndefined()
    expect((c.texts.es as any).extra).toBeUndefined()
    expect(c.texts.en.title).toBe('')
    const long = normalizeCookieNotice({ texts: { es: { title: 'x'.repeat(500) } } })
    expect(long.texts.es.title.length).toBe(120)
  })
  it('el logo propio nunca es javascript:/data:', () => {
    expect(normalizeCookieNotice({ design: { logo: 'javascript:alert(1)' } }).design.logo).toBe('')
    expect(normalizeCookieNotice({ design: { logo: 'data:image/png;base64,AAAA' } }).design.logo).toBe('')
    expect(normalizeCookieNotice({ design: { logo: 'site-builder/logo.png' } }).design.logo).toBe('site-builder/logo.png')
  })
  it('aviso de demostración: lo mismo, con sus propios topes', () => {
    const d = normalizeDemoNotice({ enabled: 'yes', icon: 'rocket', position: 'middle', offset: 1000, design: { maxWidth: 1, radius: 99, background: '#123456' }, rememberClose: 'forever', texts: { es: { title: 'Demo', text: 'x'.repeat(400) } } })
    expect(d.enabled).toBe(true)
    expect(d.icon).toBe('info')
    expect(d.position).toBe('top-left')
    expect(d.offset).toBe(48)
    expect(d.design.maxWidth).toBe(240)
    expect(d.design.radius).toBe(32)
    expect(d.design.background).toBe('#123456')
    expect(d.rememberClose).toBe('session')
    expect(d.texts.es.title).toBe('Demo')
    expect(d.texts.es.text.length).toBe(300)
    expect(normalizeDemoNotice({ enabled: false }).enabled).toBe(false)
  })
  it('es idempotente: normalizar lo normalizado no cambia nada', () => {
    const once = normalizeSiteConsent({ cookie: { design: { accent: '#112233', radius: 10 }, layout: { position: 'bottom' } }, demo: { position: 'bottom-right' } })
    expect(normalizeSiteConsent(once)).toEqual(once)
  })
})

describe('lo que no se puede configurar: la lógica del consentimiento', () => {
  it('no existe ningún ajuste que oculte botones, premarque categorías, quite los enlaces legales o cierre sin decidir', () => {
    const c = defaultCookieNotice() as any
    const keys = [...Object.keys(c.design), ...Object.keys(c.layout), ...Object.keys(c.behavior)]
    for (const k of keys) expect(k, k).not.toMatch(/reject|accept|button(?!Shape)|legal|preselect|prechecked|close|dismiss|hideReject|hideLegal/i)
  })
  it('la versión del consentimiento no depende de la presentación: cambiar colores o textos no vuelve a preguntar', () => {
    // consentVersion sólo mira los proveedores (utils/cookieConsent.ts); la presentación no entra en ella.
    expect(consentVersion(NO_COOKIE_PROVIDERS)).toBe(consentVersion(NO_COOKIE_PROVIDERS))
    const src = readFileSync(join(ROOT, 'utils', 'cookieConsent.ts'), 'utf8')
    expect(src).not.toMatch(/siteConsent/)
  })
  it('el aviso pinta los enlaces legales y los tres botones en los dos estados, sin depender de la configuración', () => {
    const vue = readFileSync(join(ROOT, 'components', 'CookieConsent.vue'), 'utf8')
    for (const id of ['cookie-configure', 'cookie-reject', 'cookie-accept', 'cookie-back', 'cookie-reject-settings', 'cookie-save', 'cookie-policy-link', 'cookie-privacy-link']) {
      expect(vue, id).toContain(`data-testid="${id}"`)
    }
    // Los enlaces legales no llevan ningún v-if de configuración.
    const legal = vue.slice(vue.indexOf('data-testid="cookie-legal"') - 200, vue.indexOf('data-testid="cookie-legal"'))
    expect(legal).not.toMatch(/v-if="cfg/)
    // La X sólo cuando ya hay decisión (o en la muestra del Constructor).
    expect(vue).toMatch(/v-if="decided \|\| sandbox"/)
  })
})

describe('textos: los propios por idioma o, si no, los de la web en ese idioma', () => {
  const c = normalizeCookieNotice({ texts: { es: { title: 'Cookies en Norte Astur' }, en: { reject: 'No, thanks' } } })
  it('usa el propio cuando existe y el de i18n cuando no', () => {
    expect(cookieText(c, 'es', 'title', t)).toBe('Cookies en Norte Astur')
    expect(cookieText(c, 'es', 'reject', t)).toBe(es['cookie.reject'])
    expect(cookieText(c, 'en', 'title', (k) => (messages as any).en[k])).toBe((messages as any).en['cookie.title'])
    expect(cookieText(c, 'en', 'reject', (k) => (messages as any).en[k])).toBe('No, thanks')
  })
  it('un idioma desconocido cae al español', () => {
    expect(cookieText(c, 'xx', 'title', t)).toBe('Cookies en Norte Astur')
  })
  it('el aviso de demostración igual, con sus textos de partida honestos', () => {
    const d = defaultDemoNotice()
    expect(demoText(d, 'es', 'title', t)).toBe('Entorno de demostración')
    expect(demoText(d, 'es', 'text', t)).toContain('no se envían fuera de la plataforma')
    expect(demoText(normalizeDemoNotice({ texts: { es: { title: 'Prueba' } } }), 'es', 'title', t)).toBe('Prueba')
  })
})

describe('colores: los de la empresa, siempre legibles', () => {
  it('sin elegir nada: blanco cálido y la tinta de la web; con marca, la marca en el botón principal', () => {
    const p = cookiePalette(defaultCookieNotice().design, null)
    expect(p.background).toBe(COOKIE_DEFAULT_COLORS.background)
    expect(p.accent).toBe(COOKIE_DEFAULT_COLORS.ink)
    expect(p.link).toBe(p.title)
    expect(cookiePalette(defaultCookieNotice().design, '#1d4ed8').accent).toBe('#1d4ed8')
  })
  it('una marca clara se oscurece hasta que el texto blanco del botón se lea (≥ 4.5)', () => {
    const p = cookiePalette(defaultCookieNotice().design, '#ffd166')
    expect(p.accent).not.toBe('#ffd166')
    expect(contrast(p.accent)).toBeGreaterThanOrEqual(4.5)
  })
  it('lo elegido manda sobre la marca', () => {
    const p = cookiePalette({ ...defaultCookieNotice().design, accent: '#0f3d3a', link: '#aa0000', background: '#ffffff' }, '#1d4ed8')
    expect(p.accent).toBe('#0f3d3a')
    expect(p.link).toBe('#aa0000')
    expect(p.background).toBe('#ffffff')
  })
  it('aviso de demostración: verde petróleo y blanco de partida; el icono hereda el texto', () => {
    expect(demoPalette(defaultDemoNotice().design)).toEqual({ background: DEMO_DEFAULT_COLORS.background, text: DEMO_DEFAULT_COLORS.text, icon: DEMO_DEFAULT_COLORS.text })
    expect(contrast(DEMO_DEFAULT_COLORS.background)).toBeGreaterThanOrEqual(7)
    expect(demoPalette({ ...defaultDemoNotice().design, text: '#111111' }).icon).toBe('#111111')
  })
  it('la clave del cierre del aviso de demostración es por web', () => {
    expect(demoNoticeStorageKey(3)).not.toBe(demoNoticeStorageKey(4))
  })
})
