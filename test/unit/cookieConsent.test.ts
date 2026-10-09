import { describe, expect, it } from 'vitest'
import {
  allChoices,
  availableCategories,
  buildConsent,
  consentStorageKey,
  consentVersion,
  NO_COOKIE_PROVIDERS,
  normalizeGa4Id,
  normalizeMetaPixelId,
  parseConsent,
  revokedCategories,
} from '../../utils/cookieConsent'
import { cspOriginsForProviders } from '../../server/utils/siteSettings'
import { catalogChips } from '../../utils/catalogChips'

const GA = { ga4: 'G-ABC1234', metaPixel: null, revision: 0 }
const PIXEL = { ga4: null, metaPixel: '123456789', revision: 0 }

describe('aviso de cookies: categorías y versión', () => {
  it('Publicidad sólo existe si la agencia configuró un píxel', () => {
    expect(availableCategories(NO_COOKIE_PROVIDERS)).toEqual(['analytics', 'thirdParty'])
    expect(availableCategories(GA)).toEqual(['analytics', 'thirdParty'])
    expect(availableCategories(PIXEL)).toEqual(['analytics', 'thirdParty', 'marketing'])
  })

  it('la versión cambia al añadir un proveedor o al pedir de nuevo el consentimiento', () => {
    const base = consentVersion(NO_COOKIE_PROVIDERS)
    expect(consentVersion(GA)).not.toBe(base)
    expect(consentVersion(PIXEL)).not.toBe(consentVersion(GA))
    expect(consentVersion({ ...NO_COOKIE_PROVIDERS, revision: 1 })).not.toBe(base)
    // Cambiar el ID de un proveedor que ya estaba no cambia lo que se pide.
    expect(consentVersion({ ...GA, ga4: 'G-ZZZ9999' })).toBe(consentVersion(GA))
  })

  it('una categoría que la web no tiene nunca queda concedida', () => {
    const rec = buildConsent(7, NO_COOKIE_PROVIDERS, allChoices(true))
    expect(rec.c).toEqual({ analytics: true, thirdParty: true, marketing: false })
    expect(rec.org).toBe(7)
  })
})

describe('aviso de cookies: lo guardado en el navegador', () => {
  const raw = (org: number, p = NO_COOKIE_PROVIDERS, c = allChoices(false)) => JSON.stringify(buildConsent(org, p, c))

  it('vale para la misma web y la misma versión', () => {
    const rec = parseConsent(raw(3, NO_COOKIE_PROVIDERS, { analytics: true, thirdParty: false, marketing: false }), 3, NO_COOKIE_PROVIDERS)
    expect(rec?.c.analytics).toBe(true)
    expect(rec?.c.thirdParty).toBe(false)
  })

  it('vuelve a preguntar si es de otra web del mismo origen, de otra versión o está corrupto', () => {
    expect(parseConsent(raw(3), 4, NO_COOKIE_PROVIDERS)).toBeNull()
    expect(parseConsent(raw(3), 3, GA)).toBeNull()
    expect(parseConsent(raw(3, NO_COOKIE_PROVIDERS), 3, { ...NO_COOKIE_PROVIDERS, revision: 2 })).toBeNull()
    expect(parseConsent('{no es json', 3, NO_COOKIE_PROVIDERS)).toBeNull()
    expect(parseConsent('"accepted"', 3, NO_COOKIE_PROVIDERS)).toBeNull() // el valor del aviso antiguo
    expect(parseConsent(null, 3, NO_COOKIE_PROVIDERS)).toBeNull()
  })

  it('la vista previa usa su propia clave y no mira de qué web es', () => {
    expect(consentStorageKey(true)).not.toBe(consentStorageKey(false))
    expect(parseConsent(raw(0), null, NO_COOKIE_PROVIDERS)).not.toBeNull()
  })

  it('sabe qué se retiró en una decisión', () => {
    expect(revokedCategories(null, allChoices(false))).toEqual([])
    expect(revokedCategories(allChoices(true), { analytics: false, thirdParty: true, marketing: false })).toEqual(['analytics', 'marketing'])
  })
})

describe('aviso de cookies: IDs de proveedores', () => {
  it('Google Analytics 4: G-XXXX, sin inventar ni completar', () => {
    expect(normalizeGa4Id(' g-abc1234 ')).toBe('G-ABC1234')
    expect(normalizeGa4Id('')).toBeNull()
    expect(normalizeGa4Id(null)).toBeNull()
    expect(normalizeGa4Id('UA-12345-1')).toBeUndefined()
    expect(normalizeGa4Id('G-<script>')).toBeUndefined()
  })

  it('píxel de Meta: sólo cifras', () => {
    expect(normalizeMetaPixelId('1234 5678 9012')).toBe('123456789012')
    expect(normalizeMetaPixelId('')).toBeNull()
    expect(normalizeMetaPixelId('12a45')).toBeUndefined()
  })

  it('la CSP sólo abre los orígenes del proveedor configurado', () => {
    expect(cspOriginsForProviders(NO_COOKIE_PROVIDERS)).toEqual({ script: [], connect: [], img: [] })
    const ga = cspOriginsForProviders(GA)
    expect(ga.script).toEqual(['https://www.googletagmanager.com'])
    expect(ga.script.join(' ')).not.toContain('facebook')
    const px = cspOriginsForProviders(PIXEL)
    expect(px.script).toEqual(['https://connect.facebook.net'])
    expect(px.script.join(' ')).not.toContain('google')
  })
})

describe('chips del catálogo: obra nueva e inversión', () => {
  const t = (_k: string, f: string) => f
  const chips = (q: Record<string, string>) => catalogChips(q, t, (n) => `${n} €`, (x) => x)
  it('obra nueva, segunda mano y rentabilidad mínima tienen su chip', () => {
    expect(chips({ obra: 'nueva' }).map((c) => c.label)).toEqual(['Obra nueva'])
    expect(chips({ obra: 'segunda' }).map((c) => c.label)).toEqual(['Segunda mano'])
    expect(chips({ minYield: '5' })[0]).toMatchObject({ label: 'Rentabilidad desde 5 %', clear: ['minYield'] })
  })
})
