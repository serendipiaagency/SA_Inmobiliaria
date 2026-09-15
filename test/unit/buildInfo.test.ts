import { describe, expect, it } from 'vitest'
import { UNKNOWN, detectBuilder, resolveBuildInfo, shortSha } from '../../scripts/build-info.mjs'

/**
 * La identidad del build se resuelve al compilar y se hornea en el bundle
 * (`runtimeConfig.buildInfo`), así que si esto se equivoca nadie se entera
 * hasta que hay un incidente y /api/health/ready contesta una mentira.
 *
 * Lo que más importa aquí no es el SHA sino `source`: es lo que distingue un
 * despliegue que pasó por el pipeline de uno que se lo saltó.
 */

const NOW = new Date('2026-09-15T08:00:00.000Z')
type GitReader = (...args: string[]) => string | null

/** Un git que no existe: la máquina de build sin repo, o el tarball de un release. */
const noGit: GitReader = () => null

function resolve(env: Record<string, string>, git: GitReader = noGit) {
  return resolveBuildInfo({ env, git, now: () => NOW })
}

describe('shortSha', () => {
  it('acorta un SHA real a 7 caracteres', () => {
    expect(shortSha('8215970abc1234567890abcdef1234567890abcd')).toBe('8215970')
    expect(shortSha('  8215970ABC  ')).toBe('8215970')
  })

  it('no inventa un SHA a partir de algo que no lo es', () => {
    // Un valor basura convertido en "SHA" sería peor que no tener ninguno:
    // parecería una respuesta.
    for (const bad of ['', null, undefined, 'HEAD', 'no-es-un-sha', 'abc', '$(whoami)', 'zzzzzzz']) {
      expect(shortSha(bad), String(bad)).toBe(UNKNOWN)
    }
  })
})

describe('detectBuilder', () => {
  it('reconoce GitHub Actions', () => {
    expect(detectBuilder({ GITHUB_SHA: 'abc1234def', GITHUB_REF_NAME: 'main' })).toEqual({
      source: 'github-actions',
      commit: 'abc1234def',
      branch: 'main',
    })
  })

  it('reconoce Workers Builds — el despliegue que se salta el pipeline', () => {
    expect(detectBuilder({ WORKERS_CI_COMMIT_SHA: 'abc1234def', WORKERS_CI_BRANCH: 'una-rama' })).toEqual({
      source: 'workers-builds',
      commit: 'abc1234def',
      branch: 'una-rama',
    })
  })

  it('reconoce Cloudflare Pages', () => {
    expect(detectBuilder({ CF_PAGES_COMMIT_SHA: 'abc1234def', CF_PAGES_BRANCH: 'main' }).source).toBe('cloudflare-pages')
  })

  it('da prioridad a GitHub Actions cuando coinciden varias', () => {
    // Si el pipeline correcto está presente, es el que manda: lo contrario
    // haría que un build legítimo se etiquetara como sospechoso.
    expect(detectBuilder({ GITHUB_SHA: 'aaaaaaa', WORKERS_CI_COMMIT_SHA: 'bbbbbbb' }).source).toBe('github-actions')
  })

  it('no reconoce nada cuando no hay CI', () => {
    expect(detectBuilder({})).toEqual({})
  })
})

describe('resolveBuildInfo', () => {
  it('usa los datos de GitHub Actions cuando existen, sin preguntar a git', () => {
    const info = resolve({ GITHUB_SHA: '8215970abc1234', GITHUB_REF_NAME: 'main' }, () => {
      throw new Error('no debería consultar git cuando el CI ya lo dice')
    })
    expect(info).toEqual({ commit: '8215970', branch: 'main', builtAt: NOW.toISOString(), source: 'github-actions' })
  })

  it('etiqueta como workers-builds lo que publica Workers Builds', () => {
    // Éste es el caso que importa: un `source: "workers-builds"` en
    // producción es la prueba de que el despliegue no pasó por el pipeline.
    const info = resolve({ WORKERS_CI_COMMIT_SHA: 'da21509ffff', WORKERS_CI_BRANCH: 'claude/algo' })
    expect(info).toMatchObject({ commit: 'da21509', branch: 'claude/algo', source: 'workers-builds' })
  })

  it('cae a git y se etiqueta como "local" cuando nadie ha compilado en CI', () => {
    const git = (...args: string[]) => (args[1] === 'HEAD' ? '8215970abcdef' : 'claude/una-rama')
    expect(resolve({}, git)).toMatchObject({ commit: '8215970', branch: 'claude/una-rama', source: 'local' })
  })

  it('sin CI y sin git devuelve "unknown" en vez de fingir una identidad', () => {
    expect(resolve({})).toEqual({ commit: UNKNOWN, branch: UNKNOWN, builtAt: NOW.toISOString(), source: UNKNOWN })
  })

  it('un HEAD suelto (detached) no se hace pasar por una rama', () => {
    const git = (...args: string[]) => (args[1] === 'HEAD' ? '8215970abcdef' : 'HEAD')
    expect(resolve({}, git).branch).toBe(UNKNOWN)
  })

  it('sanea el nombre de rama: ni saltos de línea ni longitudes absurdas', () => {
    // Va a una respuesta HTTP pública; no puede arrastrar caracteres de
    // control ni convertirse en una cadena de kilobytes.
    expect(resolve({ GITHUB_SHA: 'abc1234', GITHUB_REF_NAME: 'ma\nin\t ' }).branch).toBe('main')
    expect(resolve({ GITHUB_SHA: 'abc1234', GITHUB_REF_NAME: 'x'.repeat(500) }).branch).toHaveLength(120)
  })

  it('sólo expone los cuatro campos previstos — nada de rutas, repos ni entorno', () => {
    expect(Object.keys(resolve({ GITHUB_SHA: 'abc1234' })).sort()).toEqual(['branch', 'builtAt', 'commit', 'source'])
  })
})
