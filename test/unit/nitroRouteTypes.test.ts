import { existsSync, readFileSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { NITRO_TYPE_FILES, PATCHES, PATCH_MARK, patchNitroTypes } from '../../scripts/patch-nitro-route-types.mjs'

/**
 * Guarda de scripts/patch-nitro-route-types.mjs, que quita el coste
 * cuadrático de los tipos de rutas de Nitro (el TS2589 que rompía
 * `npm run typecheck` al añadir una o dos rutas; P1-14 en
 * docs/production-hardening-audit.md).
 *
 * El script nunca hace fallar `npm ci` —también lo ejecutan los despliegues—,
 * así que si una versión nueva de nitropack cambia las líneas que parchea, el
 * aviso se queda en el log de la instalación. Este test es lo que lo convierte
 * en un fallo visible.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const ORIGINAL_SOURCE = ['// cabecera', ...PATCHES.map((p) => p.original), '// pie'].join('\n')

describe('patchNitroTypes', () => {
  it('sustituye cada alias por su versión parcheada, marcada', () => {
    const { source, missing } = patchNitroTypes(ORIGINAL_SOURCE)
    expect(missing).toEqual([])
    for (const { original, patched } of PATCHES) {
      expect(source).toContain(patched)
      expect(source).not.toContain(original)
    }
    expect(source.split(PATCH_MARK).length - 1).toBe(PATCHES.length)
  })

  it('es idempotente', () => {
    const once = patchNitroTypes(ORIGINAL_SOURCE).source
    const twice = patchNitroTypes(once)
    expect(twice.source).toBe(once)
    expect(twice.missing).toEqual([])
  })

  it('avisa, sin tocar nada, si la línea original ya no existe', () => {
    const changed = ORIGINAL_SOURCE.replace('R extends string ?', 'R extends `${string}` ?')
    const { source, missing } = patchNitroTypes(changed)
    expect(missing).toEqual(['AvailableRouterMethod'])
    expect(source).not.toContain(PATCHES.find((p) => p.name === 'AvailableRouterMethod')!.patched)
  })
})

describe('tipos de nitropack instalados', () => {
  it('llevan el parche aplicado', () => {
    const files = NITRO_TYPE_FILES.filter((file) => existsSync(file))
    expect(files.length, 'no se encuentran los tipos de nitropack en node_modules; ¿ha cambiado su estructura?').toBeGreaterThan(0)
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const { name, patched } of PATCHES) {
        expect(
          source.includes(patched),
          `${relative(ROOT, file)} no tiene el parche de ${name}. Ejecuta \`node scripts/patch-nitro-route-types.mjs\`: ` +
            'si avisa de que no encuentra la definición original, nitropack ha cambiado y hay que revisar el script ' +
            '(o borrarlo, si la versión nueva ya trae un arreglo equivalente). Sin el parche, una o dos rutas nuevas ' +
            'vuelven a romper `npm run typecheck` con TS2589.',
        ).toBe(true)
      }
    }
  })

  it('se aplica en postinstall, antes de nuxt prepare', () => {
    const { scripts } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> }
    const postinstall = scripts.postinstall ?? ''
    const patch = postinstall.indexOf('scripts/patch-nitro-route-types.mjs')
    expect(patch, 'postinstall ya no ejecuta scripts/patch-nitro-route-types.mjs').toBeGreaterThanOrEqual(0)
    expect(postinstall.indexOf('nuxt prepare'), 'el parche tiene que ir antes de nuxt prepare').toBeGreaterThan(patch)
  })
})
