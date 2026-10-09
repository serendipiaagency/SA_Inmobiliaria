import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOCALES, messages } from '../../i18n/messages'

/**
 * Cada texto de la web pública que se pide con `t('clave', 'respaldo')` tiene
 * que estar traducido en todos los idiomas que ofrece la web. Si falta, quien
 * la ve en inglés, alemán, portugués, francés o árabe lee ese trozo en
 * español (el respaldo). El español no hace falta en el diccionario: su texto
 * es el propio respaldo del componente. El panel (/admin) sólo está en español.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DIRS = ['components', 'pages', 'composables', 'layouts']
const SKIP = new Set(['admin', 'node_modules', '.nuxt', '.output'])

function files(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (!SKIP.has(name)) out.push(...files(p))
    } else if (/\.(vue|ts)$/.test(name)) out.push(p)
  }
  return out
}

function usedKeys(): Map<string, string> {
  const used = new Map<string, string>()
  for (const f of DIRS.flatMap((d) => files(join(ROOT, d)))) {
    const src = readFileSync(f, 'utf8')
    for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z]\w*(?:\.\w+)+)'\s*,\s*(['"`])/g)) {
      if (!used.has(m[1])) used.set(m[1], relative(ROOT, f))
    }
  }
  return used
}

describe('traducciones de la web pública', () => {
  const used = usedKeys()

  it('encuentra los textos de la web (la búsqueda no se ha quedado vacía)', () => {
    expect(used.size).toBeGreaterThan(400)
    expect(used.has('bookAppointment.title')).toBe(true)
    expect(used.has('contactCard.submit')).toBe(true)
  })

  for (const { code } of LOCALES.filter((l) => l.code !== 'es')) {
    it(`todos están traducidos en «${code}»`, () => {
      const missing = [...used].filter(([k]) => !messages[code]?.[k]).map(([k, f]) => `${k} (${f})`)
      expect(missing, `sin traducir en ${code}`).toEqual([])
    })
  }
})
