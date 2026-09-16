import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ADMIN_NAV } from '../../utils/adminNav'
import { useHelpContent } from '../../composables/useHelpContent'

/**
 * Una sola palabra para una sola persona.
 *
 * La misma ficha de `team_members` se llamaba «Comercial» en el menú,
 * «Agente» en diez pantallas del panel y «Equipo» en un módulo aparte que
 * editaba su horario. Para una inmobiliaria que abre el panel por primera vez
 * parecían tres cosas distintas (hallazgo RE05).
 *
 * ## Qué vigila esta prueba
 *
 * La palabra española **«agente»** no aparece en identificadores —esos están
 * en inglés (`agentId`, `agentName`, `AgentCard`, `/api/v1/agents`)— así que
 * encontrarla en el código del panel significa, casi siempre, que se ha
 * colado en un texto que alguien va a leer. Es una comprobación tosca a
 * propósito, igual que adminRouteMatrix.test.ts: lo que atrapa es el olvido.
 *
 * ## Qué NO cambia
 *
 * Los nombres en inglés se quedan: la tabla `team_members`, los endpoints
 * `/api/admin/team` y el endpoint público `/api/v1/agents`, que es contrato
 * publicado hacia fuera. Esto es vocabulario de cara al usuario, no un
 * renombrado de la base de datos.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** La palabra suelta, en cualquier capitalización y en singular o plural. */
const SPANISH_AGENT = /\bagentes?\b/i

function vueFilesIn(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...vueFilesIn(full))
    else if (entry.endsWith('.vue')) out.push(full)
  }
  return out
}

describe('vocabulario: «Comercial», nunca «Agente»', () => {
  it('ninguna página del panel usa la palabra «agente»', () => {
    const offenders: string[] = []
    for (const file of vueFilesIn(join(ROOT, 'pages', 'admin'))) {
      const source = readFileSync(file, 'utf8')
      for (const [i, line] of source.split('\n').entries()) {
        if (SPANISH_AGENT.test(line)) offenders.push(`${relative(ROOT, file)}:${i + 1}: ${line.trim()}`)
      }
    }
    expect(offenders, `Usa «comercial»:\n${offenders.join('\n')}`).toEqual([])
  })

  it('el módulo de ayuda tampoco', () => {
    const { sections, faqs } = useHelpContent()
    const texts = [
      ...sections.flatMap((s) => [s.title, s.summary, ...s.steps]),
      ...faqs.flatMap((f) => [f.question, f.answer, ...f.tags]),
    ]
    expect(texts.filter((t) => SPANISH_AGENT.test(t))).toEqual([])
  })

  it('el menú lleva a un solo módulo de comerciales', () => {
    const items = ADMIN_NAV.flatMap((group) => group.items)
    const comerciales = items.filter((i) => /comercial/i.test(i.label))
    expect(comerciales).toHaveLength(1)
    expect(comerciales[0].to).toBe('/admin/comerciales')

    // "Equipo" editaba el horario de estas mismas personas desde otra sección
    // del menú. Ya no existe como entrada propia: el horario vive dentro de
    // la ficha del comercial.
    expect(items.map((i) => i.to)).not.toContain('/admin/team')
    expect(items.map((i) => i.to)).not.toContain('/admin/agents')
  })

  it('la ayuda apunta a la ruta nueva y no documenta un módulo «Equipo» aparte', () => {
    const { sections } = useHelpContent()
    const routes = sections.map((s) => s.route)
    expect(routes).toContain('/admin/comerciales')
    expect(routes).not.toContain('/admin/team')
    expect(routes).not.toContain('/admin/agents')
  })
})
