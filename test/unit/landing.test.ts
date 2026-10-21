import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  LANDING_BUILDER,
  LANDING_CRM,
  LANDING_CTA,
  LANDING_DEMO_FORM,
  LANDING_FAQ,
  LANDING_FEATURES,
  LANDING_HERO,
  LANDING_INTRO,
  LANDING_MODULES,
  LANDING_NAV,
  LANDING_PHOTOS,
  LANDING_PROPERTIES,
  LANDING_REQUEST,
  LANDING_SHOTS,
  LANDING_STEPS,
  LANDING_STRIP_INTRO,
  LANDING_TEAM,
  LANDING_FOOTER,
  LANDING_FORBIDDEN_CLAIMS,
} from '../../utils/landing'

/**
 * La landing comercial de INMO (utils/landing.ts, components/landing/*): lo
 * que dice tiene que ser verdad. Aquí se vigila que no vuelvan las promesas
 * retiradas (Mapbox, Idealista, «6 canales», «gratis»…), que cada enlace del
 * menú apunte a una sección que existe, que cada captura y cada foto
 * referenciada sea un archivo real de /public/landing y que las acciones
 * lleven al flujo real (registro, acceso y solicitud de demo).
 */
const ROOT = join(import.meta.dirname, '../..')
const COMPONENTS = join(ROOT, 'components/landing')

/** Todo el texto de la landing: contenido + plantillas de las secciones. */
function allLandingText(): string {
  const content = JSON.stringify([LANDING_NAV, LANDING_CTA, LANDING_HERO, LANDING_STRIP_INTRO, LANDING_MODULES, LANDING_INTRO, LANDING_BUILDER, LANDING_CRM, LANDING_PROPERTIES, LANDING_TEAM, LANDING_FEATURES, LANDING_REQUEST, LANDING_STEPS, LANDING_DEMO_FORM, LANDING_FAQ, LANDING_FOOTER, LANDING_PHOTOS])
  const templates = readdirSync(COMPONENTS)
    .filter((f) => f.endsWith('.vue'))
    .map((f) => readFileSync(join(COMPONENTS, f), 'utf8'))
    .join('\n')
  return content + '\n' + templates + '\n' + readFileSync(join(ROOT, 'pages/index.vue'), 'utf8')
}

describe('landing de INMO — sin promesas falsas', () => {
  it('no menciona ninguna capacidad retirada ni afirmación prohibida', () => {
    const text = allLandingText().toLowerCase()
    for (const claim of LANDING_FORBIDDEN_CLAIMS) {
      expect(text, `la landing no puede decir «${claim}»`).not.toContain(claim.toLowerCase())
    }
    // Ni cifras de clientes, ni premios, ni «confían en nosotros».
    expect(text).not.toMatch(/\+\s?\d{2,}\s?(inmobiliarias|clientes|agencias)/)
    expect(text).not.toMatch(/confían en nosotros|premio|galardon/)
    expect(text).not.toMatch(/sin tarjeta|prueba gratuita|gratis/)
  })

  it('sin antetítulos (eyebrows): el rediseño los elimina', () => {
    const templates = readdirSync(COMPONENTS)
      .filter((f) => f.endsWith('.vue'))
      .map((f) => readFileSync(join(COMPONENTS, f), 'utf8'))
      .join('\n')
    expect(templates).not.toContain('lp-eyebrow')
  })

  it('«Funcionalidades» sólo marca como disponible lo que existe y lo demás lleva su estado', () => {
    const intelligence = LANDING_FEATURES.find((g) => g.key === 'intelligence')!
    expect(intelligence.items.filter((i) => /asistente INMO|AI Studio/i.test(i.text)).every((i) => i.state === 'with-ai')).toBe(true)
    const portals = LANDING_FEATURES.flatMap((g) => g.items).find((i) => /portales/i.test(i.text))
    expect(portals?.state).toBe('soon')
  })

  it('no publica precios: remite a consultar condiciones en la FAQ', () => {
    const faqText = JSON.stringify(LANDING_FAQ).toLowerCase()
    expect(faqText).not.toMatch(/\d+\s?€|€\s?\d+|eur\b|\/mes/)
    const planes = LANDING_FAQ.find((f) => /planes y precios/i.test(f.q))
    expect(planes, 'una pregunta sobre planes y precios').toBeTruthy()
    expect(planes!.a.toLowerCase()).toContain('consúltanos')
  })
})

describe('landing de INMO — estructura', () => {
  it('cada enlace del menú y del pie apunta a una sección con ese id', () => {
    const templates = readdirSync(COMPONENTS)
      .filter((f) => f.endsWith('.vue'))
      .map((f) => readFileSync(join(COMPONENTS, f), 'utf8'))
      .join('\n')
    const ids = new Set([...templates.matchAll(/\sid="([a-z-]+)"/g)].map((m) => m[1]))
    const anchors = [
      ...LANDING_NAV.map((n) => n.href),
      ...LANDING_MODULES.map((m) => m.href),
      ...(LANDING_FOOTER.columns as readonly { links: readonly { href: string }[] }[]).flatMap((c) => c.links.map((l) => l.href)),
      LANDING_CTA.demo.to,
      LANDING_HERO.primary.to,
      LANDING_HERO.explore.to,
      LANDING_INTRO.cta.to,
      LANDING_BUILDER.cta.to,
      LANDING_CRM.cta.to,
      LANDING_TEAM.cta.to,
    ].filter((h) => h.startsWith('#'))
    expect(anchors.length).toBeGreaterThan(8)
    for (const href of anchors) expect(ids, `falta la sección ${href}`).toContain(href.slice(1))
  })

  it('las acciones principales llevan al flujo real: registro, acceso del panel y solicitud de demo', () => {
    expect(LANDING_CTA.register).toEqual({ label: 'Crear mi inmobiliaria', to: '/registro-empresa' })
    expect(LANDING_CTA.login.to).toBe('/admin/login')
    expect(LANDING_CTA.demo.to).toBe('#solicitar-demo')
    expect(LANDING_HERO.secondary.to).toBe('/registro-empresa')
    expect((LANDING_FOOTER.columns as readonly { links: readonly { href: string }[] }[]).flatMap((c) => c.links).some((l) => l.href === '/registro-empresa')).toBe(true)
  })

  it('tiene cuatro enlaces de módulos, seis pasos, diez preguntas y el hero del rediseño', () => {
    expect(LANDING_MODULES).toHaveLength(4)
    expect(LANDING_STEPS).toHaveLength(6)
    expect(LANDING_FAQ).toHaveLength(10)
    expect(LANDING_HERO.title.join(' ')).toBe('Tu inmobiliaria. Todo conectado. Otro nivel.')
    expect(LANDING_HERO.stack).toHaveLength(3)
    expect(LANDING_FAQ.every((f) => f.q.endsWith('?') && f.a.length > 40)).toBe(true)
  })

  it('cada captura referenciada existe en /public/landing y lleva texto alternativo', () => {
    const existing = new Set(readdirSync(join(ROOT, 'public/landing')))
    for (const [key, shot] of Object.entries(LANDING_SHOTS)) {
      expect(shot.src.startsWith('/landing/')).toBe(true)
      expect(existing, `falta la captura ${key} (${shot.src})`).toContain(shot.src.replace('/landing/', ''))
      expect(shot.alt.length).toBeGreaterThan(20)
      expect(shot.width).toBeGreaterThan(0)
      expect(shot.height).toBeGreaterThan(0)
    }
    for (const step of LANDING_STEPS) expect(LANDING_SHOTS[step.shot]).toBeTruthy()
    for (const tab of LANDING_BUILDER.tabs) expect(LANDING_SHOTS[tab.shot as keyof typeof LANDING_SHOTS]).toBeTruthy()
  })

  it('cada fotografía de ambiente existe en /public/landing, es webp y lleva texto alternativo', () => {
    const existing = new Set(readdirSync(join(ROOT, 'public/landing')))
    for (const [key, photo] of Object.entries(LANDING_PHOTOS)) {
      expect(photo.src).toMatch(/^\/landing\/[a-z-]+\.webp$/)
      expect(existing, `falta la foto ${key} (${photo.src})`).toContain(photo.src.replace('/landing/', ''))
      expect(photo.alt.length).toBeGreaterThan(20)
      expect(photo.width).toBeGreaterThan(0)
      expect(photo.height).toBeGreaterThan(0)
    }
    // El hero y la galería de propiedades usan sólo fotos definidas.
    for (const s of LANDING_HERO.stack) expect(LANDING_PHOTOS[s.photo]).toBeTruthy()
    for (const g of LANDING_PROPERTIES.gallery) expect(LANDING_PHOTOS[g.photo]).toBeTruthy()
    for (const p of LANDING_TEAM.photos) expect(LANDING_PHOTOS[p]).toBeTruthy()
  })

  it('«Funcionalidades» es un inventario completo con estados honestos y ocho áreas', () => {
    expect(LANDING_FEATURES.length).toBe(8)
    const items = LANDING_FEATURES.flatMap((g) => g.items)
    expect(items.length).toBeGreaterThanOrEqual(35)
    expect(new Set(items.map((i) => i.text)).size).toBe(items.length)
    // Los portales no están conectados: nunca «Disponible».
    const portals = items.find((i) => /portales/i.test(i.text))
    expect(portals?.state).toBe('soon')
    // Lo que depende de la IA o de un proveedor lo dice.
    expect(items.filter((i) => /asistente INMO|AI Studio/i.test(i.text)).every((i) => i.state === 'with-ai')).toBe(true)
    expect(items.filter((i) => /Stripe|WhatsApp/i.test(i.text)).every((i) => i.state === 'with-provider')).toBe(true)
    for (const g of LANDING_FEATURES) expect(g.items.length, g.key).toBeGreaterThanOrEqual(4)
  })

  it('el bloque de solicitud no promete lo que no hay', () => {
    const text = JSON.stringify(LANDING_REQUEST).toLowerCase()
    expect(text).not.toMatch(/tarjeta|gratis|inmediat/)
    expect(LANDING_REQUEST.steps).toHaveLength(3)
    expect(LANDING_REQUEST.signature.email).toBe('info@serendipiaagency.com')
  })

  it('el formulario de demo ofrece las mismas opciones en la landing y en el servidor', () => {
    expect(LANDING_DEMO_FORM.teamSizes.map((o) => o.value)).toEqual(['solo', '2-5', '6-15', '16+'])
    expect(LANDING_DEMO_FORM.interests.map((o) => o.value)).toEqual(['web', 'crm', 'properties', 'team', 'all'])
  })
})
