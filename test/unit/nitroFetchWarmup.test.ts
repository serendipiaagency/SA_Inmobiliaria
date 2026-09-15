import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Protege las dos invariantes de las que depende nitro-fetch-warmup.ts. El
 * fichero explica el mecanismo completo; el resumen es que TypeScript le carga
 * el coste único de tipar las rutas de Nitro a la **primera** sentencia del
 * proyecto que use `$fetch`/`useFetch`, y que pasado cierto número de rutas esa
 * sentencia sola revienta el presupuesto de instanciaciones (TS2589).
 *
 * Si alguna de estas comprobaciones falla, `npm run typecheck` todavía puede
 * estar verde: lo que se ha roto es la red de seguridad, y el fallo llegará más
 * tarde, en la rama de otra persona y señalando un fichero que no tiene nada
 * que ver.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const WARMUP = 'nitro-fetch-warmup.ts'

/**
 * Número de claves de ruta con el que se ha comprobado a mano que
 * `npm run typecheck` sigue limpio (ver docs/production-hardening-audit.md).
 * Sin el fichero de calentamiento el techo real estaba en 198.
 */
const VERIFIED_ROUTE_CEILING = 347

/** Extensiones que TypeScript mete en el programa desde la raíz del proyecto. */
const SOURCE_EXT = /\.(ts|tsx|vue|js|mjs|cjs)$/

function rootSourceFiles(): string[] {
  return readdirSync(ROOT)
    .filter((name) => SOURCE_EXT.test(name) && statSync(join(ROOT, name)).isFile())
    .sort()
}

describe('nitro-fetch-warmup', () => {
  it('sigue existiendo en la raíz del proyecto', () => {
    // En la raíz y no en un subdirectorio: TypeScript recorre los ficheros de
    // un directorio antes que sus subdirectorios, así que sólo desde aquí se
    // garantiza que ésta es la primera llamada que se comprueba.
    expect(existsSync(join(ROOT, WARMUP)), `falta ${WARMUP}; sin él, una sola ruta nueva puede romper npm run typecheck`).toBe(true)
  })

  it('sigue conteniendo la llamada que absorbe el coste, silenciada', () => {
    const source = readFileSync(join(ROOT, WARMUP), 'utf8')
    expect(source, `${WARMUP} ya no llama a $fetch: sin la llamada no hay nada que absorba el coste`).toMatch(/\$fetch\(/)
    expect(source, `${WARMUP} necesita el @ts-ignore: es la única línea del proyecto que debe pasarse del presupuesto`).toMatch(/@ts-ignore/)
  })

  it('es el único fichero de la raíz que llama a $fetch o useFetch', () => {
    // Cualquier otro fichero de la raíz que llame a $fetch podría comprobarse
    // antes y quedarse con la factura, y entonces el TS2589 saldría ahí.
    const offenders = rootSourceFiles().filter(
      (name) => name !== WARMUP && /\$fetch\s*[<(]|useFetch\s*[<(]/.test(readFileSync(join(ROOT, name), 'utf8')),
    )
    expect(
      offenders,
      `estos ficheros de la raíz llaman a $fetch/useFetch y pueden adelantarse a ${WARMUP}; muévelos a un subdirectorio (composables/, utils/, components/…)`,
    ).toEqual([])
  })

  it('el número de rutas sigue dentro de lo comprobado a mano', () => {
    const generated = join(ROOT, '.nuxt', 'types', 'nitro-routes.d.ts')
    // Lo genera `nuxt prepare` (postinstall). Si no está, no hay nada que
    // medir y no tiene sentido inventarse un fallo.
    if (!existsSync(generated)) return

    const routeKeys = (readFileSync(generated, 'utf8').match(/^\s+'\/[^']*':\s*\{$/gm) || []).length
    expect(routeKeys, 'no se han podido contar las rutas generadas; ¿ha cambiado el formato de nitro-routes.d.ts?').toBeGreaterThan(100)
    expect(
      routeKeys,
      `el proyecto tiene ${routeKeys} rutas y sólo se ha comprobado que typecheck aguanta hasta ${VERIFIED_ROUTE_CEILING}. Vuelve a medir el techo (docs/production-hardening-audit.md explica cómo) y sube esta constante, o reduce rutas.`,
    ).toBeLessThanOrEqual(VERIFIED_ROUTE_CEILING)
  })
})
