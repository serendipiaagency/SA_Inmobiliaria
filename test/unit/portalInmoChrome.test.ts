import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Branding del SaaS «Portal INMO» (Cola 28): el chrome de la plataforma —login
 * del panel, registro de empresa, recuperación/restablecer contraseña, la
 * landing y el panel— lleva el título de pestaña y el favicon de Portal INMO,
 * SIN tocar el branding de las webs públicas de las agencias (que conservan su
 * propio `/favicon.svg` y su título por tenant). Es una comprobación de
 * exhaustividad sobre el código fuente: lo que atrapa es la superficie que se
 * olvidó de marcar, o el branding de agencia que se tocó por error.
 */
const ROOT = join(import.meta.dirname, '../..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')

describe('Portal INMO: activos y composable del chrome', () => {
  it('existe el favicon/monograma del SaaS como SVG propio', () => {
    expect(existsSync(join(ROOT, 'public/portal-inmo.svg')), 'falta public/portal-inmo.svg').toBe(true)
    const svg = read('public/portal-inmo.svg')
    expect(svg).toContain('<svg')
    expect(svg).toContain('Portal INMO')
  })

  it('el componente de logo pinta la marca de la plataforma, no la de un tenant', () => {
    const c = read('components/PortalInmoLogo.vue')
    expect(c).toContain('Portal')
    expect(c).toContain('INMO')
    // No depende del Brand Kit de ningún tenant: colores de marca fijos.
    expect(c).not.toContain('useTenant')
    expect(c).not.toContain('brandColor')
  })

  it('el composable fija título + favicon propio del SaaS', () => {
    const s = read('composables/usePortalInmoChrome.ts')
    expect(s).toContain("PORTAL_INMO_BRAND = 'Portal INMO'")
    expect(s).toContain("PORTAL_INMO_FAVICON = '/portal-inmo.svg'")
    expect(s).toContain('useHead')
    expect(s).toContain("rel: 'icon'")
  })
})

describe('Portal INMO: todas las superficies del SaaS marcadas', () => {
  // [fichero, cómo se marca el título] — cada superficie del chrome del SaaS.
  const SURFACES: Array<[string, RegExp]> = [
    ['pages/admin/login.vue', /usePortalInmoChrome\(['"]Acceder — Portal INMO/],
    ['pages/registro-empresa.vue', /usePortalInmoChrome\(['"]Registro de empresa — Portal INMO/],
    ['pages/forgot-password.vue', /usePortalInmoChrome\(['"]Recuperar contraseña — Portal INMO/],
    ['pages/reset-password/[token].vue', /usePortalInmoChrome\(['"]Restablecer contraseña — Portal INMO/],
  ]
  it.each(SURFACES)('%s usa el chrome Portal INMO y muestra el logo', (file, titleRe) => {
    const src = read(file)
    expect(src, `${file} no fija el título Portal INMO`).toMatch(titleRe)
    expect(src, `${file} no muestra el logo del SaaS`).toContain('<PortalInmoLogo')
    // Las páginas de auth son chrome del SaaS, no de la agencia: sin layout de tenant.
    expect(src, `${file} debería usar layout:false`).toContain('layout: false')
  })

  it('la landing del SaaS pone el título de pestaña y el favicon de Portal INMO', () => {
    const src = read('pages/index.vue')
    expect(src).toContain("tabTitle = 'Portal INMO — Tu inmobiliaria, a otro nivel'")
    expect(src).toContain('title: tabTitle')
    expect(src).toContain("href: '/portal-inmo.svg'")
  })

  it('el panel (layout admin) lleva favicon y título Portal INMO, quitando el sufijo de tenant', () => {
    const src = read('layouts/admin.vue')
    expect(src).toContain('titleTemplate')
    expect(src).toContain('Portal INMO')
    expect(src).toContain("href: '/portal-inmo.svg'")
    // Quita el sufijo heredado «— M&M Real Estate» de los títulos de página.
    expect(src).toContain('M&M Real Estate')
  })
})

describe('Portal INMO: las webs públicas de agencia conservan su branding', () => {
  it('el favicon global de nuxt.config sigue siendo /favicon.svg (el que heredan los tenants)', () => {
    const cfg = read('nuxt.config.ts')
    expect(cfg).toContain("href: '/favicon.svg'")
  })

  it('los layouts públicos de tenant NO imponen el favicon del SaaS', () => {
    for (const f of ['layouts/default.vue', 'layouts/root.vue']) {
      expect(read(f), `${f} no debe forzar el favicon del SaaS`).not.toContain('portal-inmo.svg')
    }
  })
})
