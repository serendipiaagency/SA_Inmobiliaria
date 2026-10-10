import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  LANDING_ACCESS,
  LANDING_BUILDER,
  LANDING_CRM,
  LANDING_CTA,
  LANDING_DEMO,
  LANDING_DEMO_FORM,
  LANDING_FAQ,
  LANDING_FINAL,
  LANDING_FOOTER,
  LANDING_FORBIDDEN_CLAIMS,
  LANDING_HERO,
  LANDING_INTELLIGENCE,
  LANDING_MODULES,
  LANDING_NAV,
  LANDING_PROPERTIES,
  LANDING_SHOTS,
  LANDING_STEPS,
} from '../../utils/landing'

/**
 * La landing comercial de INMO (utils/landing.ts, components/landing/*): lo
 * que dice tiene que ser verdad. Aquí se vigila que no vuelvan las promesas
 * retiradas (Mapbox, Idealista, «6 canales», «gratis»…), que cada enlace del
 * menú apunte a una sección que existe, que cada captura referenciada sea un
 * archivo real de /public/landing y que las acciones lleven al flujo real.
 */
const ROOT = join(import.meta.dirname, '../..')
const COMPONENTS = join(ROOT, 'components/landing')

/** Todo el texto de la landing: contenido + plantillas de las secciones. */
function allLandingText(): string {
  const content = JSON.stringify([LANDING_NAV, LANDING_CTA, LANDING_HERO, LANDING_MODULES, LANDING_BUILDER, LANDING_CRM, LANDING_PROPERTIES, LANDING_INTELLIGENCE, LANDING_STEPS, LANDING_DEMO, LANDING_DEMO_FORM, LANDING_ACCESS, LANDING_FAQ, LANDING_FINAL, LANDING_FOOTER])
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

  it('«Inteligencia inmobiliaria» sólo marca como disponible lo que existe y lo demás lleva su estado', () => {
    const statuses = new Set(LANDING_INTELLIGENCE.map((i) => i.status))
    expect([...statuses].every((s) => ['available', 'with-ai', 'soon'].includes(s))).toBe(true)
    expect(LANDING_INTELLIGENCE.find((i) => i.key === 'channels')?.status).toBe('soon')
    expect(LANDING_INTELLIGENCE.find((i) => i.key === 'assistant')?.status).toBe('with-ai')
  })

  it('«Planes y acceso» no publica precios: remite a consultar condiciones', () => {
    const text = JSON.stringify(LANDING_ACCESS).toLowerCase()
    expect(text).not.toMatch(/\d+\s?€|€\s?\d+|eur\b|\/mes/)
    expect(text).toContain('consúltanos')
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
      LANDING_HERO.secondary.to,
      LANDING_BUILDER.cta.to,
      LANDING_DEMO.primary.to,
    ].filter((h) => h.startsWith('#'))
    expect(anchors.length).toBeGreaterThan(8)
    for (const href of anchors) expect(ids, `falta la sección ${href}`).toContain(href.slice(1))
  })

  it('las acciones principales llevan al flujo real: registro y acceso del panel', () => {
    expect(LANDING_CTA.register).toEqual({ label: 'Crear mi inmobiliaria', to: '/registro-empresa' })
    expect(LANDING_CTA.login.to).toBe('/admin/login')
    expect((LANDING_FOOTER.columns as readonly { links: readonly { href: string }[] }[]).flatMap((c) => c.links).some((l) => l.href === '/registro-empresa')).toBe(true)
  })

  it('tiene seis módulos, seis pasos, diez preguntas y el hero pedido', () => {
    expect(LANDING_MODULES).toHaveLength(6)
    expect(LANDING_STEPS).toHaveLength(6)
    expect(LANDING_FAQ).toHaveLength(10)
    expect(LANDING_HERO.title.join(' ')).toBe('Tu inmobiliaria, toda conectada.')
    expect(LANDING_HERO.eyebrow.toUpperCase()).toBe('LA NUEVA FORMA DE GESTIONAR TU INMOBILIARIA')
    expect(LANDING_FAQ.every((f) => f.q.endsWith('?') && f.a.length > 40)).toBe(true)
  })

  it('cada captura referenciada existe en /public/landing y lleva texto alternativo', () => {
    const existing = new Set(readdirSync(join(ROOT, 'public/landing')))
    for (const [key, shot] of Object.entries(LANDING_SHOTS)) {
      expect(shot.src.startsWith('/landing/')).toBe(true)
      expect(existing, `falta la captura ${key} (${shot.src}); genera las capturas con scripts/capturas-landing.mjs`).toContain(shot.src.replace('/landing/', ''))
      expect(shot.alt.length).toBeGreaterThan(20)
      expect(shot.width).toBeGreaterThan(0)
      expect(shot.height).toBeGreaterThan(0)
    }
    for (const step of LANDING_STEPS) expect(LANDING_SHOTS[step.shot]).toBeTruthy()
    for (const tab of [...LANDING_BUILDER.tabs, ...LANDING_PROPERTIES.tabs]) expect(LANDING_SHOTS[tab.shot as keyof typeof LANDING_SHOTS]).toBeTruthy()
  })

  it('el formulario de demo ofrece las mismas opciones en la landing y en el servidor', () => {
    expect(LANDING_DEMO_FORM.teamSizes.map((o) => o.value)).toEqual(['solo', '2-5', '6-15', '16+'])
    expect(LANDING_DEMO_FORM.interests.map((o) => o.value)).toEqual(['web', 'crm', 'properties', 'team', 'all'])
  })
})
