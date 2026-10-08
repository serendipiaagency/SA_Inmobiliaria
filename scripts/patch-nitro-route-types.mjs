#!/usr/bin/env node
/**
 * Corrige el coste cuadrático de los tipos de rutas de Nitro (TS2589).
 *
 * Se ejecuta en `postinstall`, antes de `nuxt prepare`. Sólo toca ficheros de
 * declaración de tipos (`.d.ts`/`.d.mts`) de nitropack: no cambia nada de lo
 * que se ejecuta, ni en el navegador ni en el Worker.
 *
 * ## El problema
 *
 * Nitro tipa `$fetch`/`useFetch` contra la lista de rutas (`InternalApi`, en
 * `.nuxt/types/nitro-routes.d.ts`). Para una URL concreta, `MatchedRoutes`
 * la compara con todas las claves: coste lineal en el número de rutas, sin
 * problema.
 *
 * El problema es la URL **sin concretar**. El genérico `R` de `$fetch` está
 * restringido a `NitroFetchRequest`, que es la unión de *todas* las claves más
 * `string`, y dos caminos acaban repartiendo esa unión entera por los
 * condicionales distributivos de `AvailableRouterMethod` y
 * `TypedInternalResponse`, calculando `MatchedRoutes` de cada clave contra
 * todas las demás — coste **cuadrático** en el número de rutas:
 *
 *  1. Con `R` concreto e igual a la unión: `$fetch<T>(…)`/`useFetch<T>(…)` con
 *     genérico explícito (TypeScript no infiere el resto de genéricos, así que
 *     `R` toma su valor por defecto, `NitroFetchRequest`), y `$fetch<any>` /
 *     `useFetch<any>`.
 *  2. Con `R` genérico: al calcular la varianza de la interfaz
 *     `NitroFetchOptions<R, M extends AvailableRouterMethod<R>>` —lo hace la
 *     primera llamada a `$fetch` del programa, con o sin genérico— TypeScript
 *     pide la restricción base de `AvailableRouterMethod<R>`, y la obtiene
 *     instanciando el condicional distributivo `R extends string ? …` con la
 *     restricción de `R`: otra vez la unión completa.
 *
 * Con 274 claves eso eran ~10 millones de instanciaciones, el doble del
 * presupuesto de TypeScript por sentencia (5 millones): la sentencia a la que
 * le tocaba pagar fallaba con TS2589 «Type instantiation is excessively deep and
 * possibly infinite» y arrastraba a decenas de llamadas más.
 *
 * Y el resultado de todo ese trabajo es trivial. Medido con TypeScript sin
 * límite de presupuesto:
 *
 *   - `AvailableRouterMethod<NitroFetchRequest>` = `RouterMethod` (los 9
 *     métodos HTTP), igual que `AvailableRouterMethod<string>`.
 *   - `TypedInternalResponse<NitroFetchRequest, D>` = `D` (`unknown` o `any`),
 *     igual que `TypedInternalResponse<string, D>`.
 *
 * Es así por construcción: en cuanto la unión contiene `string`, el miembro
 * `string` aporta `RouterMethod` (o `D`), que absorbe al resto de miembros.
 *
 * ## El arreglo
 *
 * Se reescriben esos dos alias con el mismo resultado para cualquier tipo
 * concreto, cambiando sólo cómo se llega a él:
 *
 *  - `string extends R ? <resultado> :` delante. Si la URL incluye `string`
 *    (la unión completa, una variable `string`) devuelve directamente lo que
 *    ya daba, sin repartir la unión. Arregla el camino 1.
 *  - `[R] extends [infer U] ? (U extends string ? … U …) : never` en lugar de
 *    `R extends string ? … R …`. Con `R` concreto es lo mismo (`U` = `R` y el
 *    reparto ocurre igual, ahora sobre `U`). Con `R` genérico el condicional
 *    queda diferido, `U` no se infiere y vale `unknown`, y la restricción sale
 *    `RouterMethod` sin recorrer ninguna clave. Arregla el camino 2.
 *
 * Con una URL literal o de plantilla (`/api/x/${id}`) `string extends R` es
 * falso y se evalúa exactamente lo mismo que antes, así que el tipado de las
 * respuestas y de los métodos permitidos no cambia.
 * test/unit/nitroRouteTypes.test.ts comprueba que el parche está aplicado;
 * docs/production-hardening-audit.md (P1-14) tiene las mediciones.
 *
 * ## Si Nitro cambia
 *
 * Si una versión nueva de nitropack cambia esas líneas, el parche no encuentra
 * qué sustituir: avisa por consola y termina con código 0 para no romper la
 * instalación (ni los despliegues, que también instalan). Quien lo detiene es
 * `npm test`, cuyo test falla explicando qué revisar. Si la versión nueva ya
 * trae un arreglo equivalente, basta con borrar este script, su llamada en
 * `postinstall` y su test.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Ficheros de tipos de nitropack que resuelve `nitropack/types`. */
export const NITRO_TYPE_FILES = ['index.d.ts', 'index.d.mts'].map((name) =>
  join(ROOT, 'node_modules', 'nitropack', 'dist', 'types', name),
)

/** Marca que deja el parche en cada línea; la busca el test. */
export const PATCH_MARK = '/* SA: ver scripts/patch-nitro-route-types.mjs */'

/** Líneas completas de nitropack 2.13.x y su sustituta. */
export const PATCHES = [
  {
    name: 'TypedInternalResponse',
    original:
      'type TypedInternalResponse<Route, Default = unknown, Method extends RouterMethod = RouterMethod> = Default extends string | boolean | number | null | void | object ? Default : Route extends string ? MiddlewareOf<Route, Method> extends never ? MiddlewareOf<Route, "default"> extends never ? Default : MiddlewareOf<Route, "default"> : MiddlewareOf<Route, Method> : Default;',
    patched:
      `${PATCH_MARK} type TypedInternalResponse<Route, Default = unknown, Method extends RouterMethod = RouterMethod> = Default extends string | boolean | number | null | void | object ? Default : string extends Route ? Default : [Route] extends [infer U] ? U extends string ? MiddlewareOf<U, Method> extends never ? MiddlewareOf<U, "default"> extends never ? Default : MiddlewareOf<U, "default"> : MiddlewareOf<U, Method> : Default : never;`,
  },
  {
    name: 'AvailableRouterMethod',
    original:
      'type AvailableRouterMethod<R extends NitroFetchRequest> = R extends string ? keyof InternalApi[MatchedRoutes<R>] extends undefined ? RouterMethod : Extract<keyof InternalApi[MatchedRoutes<R>], "default"> extends undefined ? Extract<RouterMethod, keyof InternalApi[MatchedRoutes<R>]> : RouterMethod : RouterMethod;',
    patched:
      `${PATCH_MARK} type AvailableRouterMethod<R extends NitroFetchRequest> = string extends R ? RouterMethod : [R] extends [infer U] ? U extends string ? keyof InternalApi[MatchedRoutes<U>] extends undefined ? RouterMethod : Extract<keyof InternalApi[MatchedRoutes<U>], "default"> extends undefined ? Extract<RouterMethod, keyof InternalApi[MatchedRoutes<U>]> : RouterMethod : RouterMethod : never;`,
  },
]

/**
 * Aplica el parche a un fichero de tipos. Idempotente.
 * @param {string} source
 * @returns {{ source: string, missing: string[] }} `missing`: alias que no se
 *   han podido parchear porque su línea original ya no existe.
 */
export function patchNitroTypes(source) {
  const missing = []
  for (const { name, original, patched } of PATCHES) {
    if (source.includes(patched)) continue
    if (!source.includes(original)) {
      missing.push(name)
      continue
    }
    source = source.replace(original, patched)
  }
  return { source, missing }
}

function main() {
  let problems = 0
  for (const file of NITRO_TYPE_FILES) {
    if (!existsSync(file)) continue
    const before = readFileSync(file, 'utf8')
    const { source, missing } = patchNitroTypes(before)
    if (source !== before) writeFileSync(file, source)
    for (const name of missing) {
      problems++
      console.warn(
        `[patch-nitro-route-types] AVISO: no se encuentra la definición original de ${name} en ${relative(ROOT, file)}. ` +
          'Probablemente ha cambiado la versión de nitropack: revisa scripts/patch-nitro-route-types.mjs. ' +
          'Sin el parche, `npm run typecheck` puede volver a fallar con TS2589.',
      )
    }
  }
  if (!problems) console.log('[patch-nitro-route-types] tipos de rutas de Nitro parcheados')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
