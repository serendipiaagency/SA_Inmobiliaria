import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * La entrada sin login de desarrollo (`DEV_AUTH_BYPASS`, ver
 * `devBypassUser()` en server/utils/auth.ts) descansa en una sola idea: que
 * `import.meta.dev` es una **constante de compilación**, así que en el build
 * de producción esa rama —y la función entera— se eliminan del bundle. No es
 * una comprobación en tiempo de ejecución que alguien pueda saltarse
 * configurando la variable en el Worker desplegado: es que el código no está.
 *
 * Esta prueba existe porque esa idea es exactamente el tipo de cosa que se
 * cree y no se comprueba. Si un cambio futuro la rompiera —sustituir
 * `import.meta.dev` por una variable de entorno, mover la función a un módulo
 * que no se pueda podar— el panel de producción pasaría a tener un
 * interruptor para abrirse, y nadie se enteraría.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const AUTH_SOURCE = join(ROOT, 'server', 'utils', 'auth.ts')
const SERVER_OUTPUT = join(ROOT, '.output', 'server')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.(mjs|js|cjs|json)$/.test(entry)) out.push(full)
  }
  return out
}

describe('entrada sin login de desarrollo', () => {
  const source = readFileSync(AUTH_SOURCE, 'utf8')

  it('sigue estando detrás de import.meta.dev, no de una variable de entorno', () => {
    // Una comprobación en tiempo de ejecución (`env.NODE_ENV !== 'production'`,
    // `process.env.DEV`, una bandera de runtimeConfig…) se puede activar en el
    // Worker desplegado. Una constante de compilación, no.
    expect(source, 'devBypassUser ya no está protegida por import.meta.dev: podría llegar a producción').toMatch(
      /if \(import\.meta\.dev\) \{\s*const devUser = await devBypassUser\(event\)/,
    )
  })

  it('el usuario del bypass sale de la base de datos, no está inventado', () => {
    // Si se fabricara un usuario ficticio, requireOrgScope() se quedaría sin
    // organización real a la que acotar y el aislamiento entre agencias
    // dejaría de comportarse como en producción justo mientras se desarrolla.
    const fn = source.slice(source.indexOf('async function devBypassUser'))
    expect(fn.slice(0, 800)).toMatch(/from\(schema\.users\)/)
  })

  it('el mecanismo NO llega al build de producción', () => {
    // Requiere haber compilado antes (`npm run build`). Sin .output no hay
    // nada que mirar y no tiene sentido inventarse un fallo — el paso de
    // build de CI corre antes que los tests, así que allí sí se comprueba.
    if (!existsSync(SERVER_OUTPUT)) return

    // Lo que se busca es el *mecanismo*, no la cadena "DEV_AUTH_BYPASS" a
    // secas: esa aparece también en el texto del aviso del panel
    // (layouts/admin.vue), que es copia inerte —nunca se pinta, porque el
    // servidor manda `devAuthBypass: false` constante— y buscarla haría que
    // esta prueba fallara por el motivo equivocado.
    const mechanisms: [string, RegExp][] = [
      ['la función que carga el usuario del bypass', /devBypassUser/],
      ['la lectura de la variable de entorno', /env[?.\][]*['"]?DEV_AUTH_BYPASS/],
    ]
    const offenders: string[] = []
    for (const file of walk(SERVER_OUTPUT)) {
      const content = readFileSync(file, 'utf8')
      for (const [what, pattern] of mechanisms) {
        if (pattern.test(content)) offenders.push(`${file.replace(ROOT, '')} — ${what}`)
      }
    }
    expect(
      offenders,
      'el bundle de producción conserva el mecanismo de entrada sin login: la rama de desarrollo ya no se elimina al compilar, así que el panel desplegado tendría un interruptor para abrirse',
    ).toEqual([])
  })
})
