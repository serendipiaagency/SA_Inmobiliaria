import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { computed, nextTick, reactive, ref, watch } from 'vue'

/**
 * composables/useAdminRouteParam.ts: las páginas genéricas del panel
 * (/admin/[resource]) no deben dar un 404 al salir de ellas hacia una página
 * que no es genérica — en producción, Oficinas → Equipos → Propiedades (web)
 * sin esperar acababa en «Esta página no existe».
 */

vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)
vi.stubGlobal('watch', watch)
const route = reactive<{ params: Record<string, unknown> }>({ params: {} })
vi.stubGlobal('useRoute', () => route)
const { useAdminRouteParam } = await import('../../composables/useAdminRouteParam')

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

describe('useAdminRouteParam', () => {
  it('en su ruta: el valor de la ruta, y es «su» ruta', () => {
    route.params = { resource: 'teams' }
    const p = useAdminRouteParam('resource')
    expect(p.value.value).toBe('teams')
    expect(p.onThisRoute.value).toBe(true)
  })

  it('entre dos recursos (Oficinas → Equipos): sigue a la ruta', async () => {
    route.params = { resource: 'offices' }
    const p = useAdminRouteParam('resource')
    route.params = { resource: 'teams' }
    await nextTick()
    expect(p.value.value).toBe('teams')
    expect(p.onThisRoute.value).toBe(true)
  })

  it('al salir hacia una página que no es genérica: conserva el último recurso y deja de ser «su» ruta', async () => {
    route.params = { resource: 'teams' }
    const p = useAdminRouteParam('resource')
    route.params = {}
    await nextTick()
    expect(p.value.value, 'nada de «undefined»').toBe('teams')
    expect(p.onThisRoute.value, 'no hay 404 que lanzar').toBe(false)
  })

  it('montado ya con la ruta nueva (sin recurso): vacío y sin 404', () => {
    route.params = {}
    const p = useAdminRouteParam('resource')
    expect(p.value.value).toBe('')
    expect(p.onThisRoute.value).toBe(false)
  })

  it('las dos páginas genéricas sólo lanzan «Recurso desconocido» en su propia ruta', () => {
    for (const file of ['pages/admin/[resource]/index.vue', 'pages/admin/[resource]/[id].vue']) {
      const src = readFileSync(join(ROOT, file), 'utf8')
      expect(src, file).toContain("useAdminRouteParam('resource')")
      expect(src, `${file}: lee el parámetro a pelo`).not.toMatch(/String\(route\.params\.resource\)/)
      const lines = src.split('\n')
      const throws = lines.map((l, i) => [l, i] as const).filter(([l]) => l.includes("'Recurso desconocido'"))
      expect(throws.length, file).toBeGreaterThan(0)
      // La condición va en la misma línea o en la del `if` justo encima.
      for (const [, i] of throws) expect(lines.slice(Math.max(0, i - 1), i + 1).join('\n'), `${file}: 404 sin comprobar la ruta`).toMatch(/onThisRoute\.value/)
    }
  })
})
