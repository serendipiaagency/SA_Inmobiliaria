import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTableColumns } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import * as schema from '../../server/db/schema'
import { PUBLIC_TEAM_COLUMNS, NEVER_PUBLIC_TEAM_COLUMNS } from '../../server/utils/publicTeam'

/**
 * Los endpoints públicos de comerciales hacían `db.select()` sin proyección
 * y devolvían la fila entera de `team_members` a cualquiera, sin sesión.
 * Entre ellas iba **`icalToken`**, que no es un dato sino una credencial:
 * `/calendar/<token>.ics` está sin autenticar a propósito (una app de
 * calendario no puede mandar cookies), así que quien tenga el token lee las
 * visitas futuras del comercial con **nombre de cliente, hora y enlace de
 * videollamada**. También salían `nid` (documento de identidad),
 * `employeeCode`, `hireDate`, `contractType` y `employmentStatus`.
 *
 * Lo que vigila esta prueba no es "que no salga el token hoy" —eso ya está
 * arreglado— sino **la forma en que volvería a pasar**: una columna nueva en
 * `team_members` que nadie clasifique. Por eso es una comprobación de
 * exhaustividad, igual que tenantScopeCoverage.test.ts: toda columna tiene
 * que estar de un lado o del otro, y añadir una sin decidirlo rompe aquí.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const allColumns = Object.keys(getTableColumns(schema.teamMembers)).sort()
const publicColumns = Object.keys(PUBLIC_TEAM_COLUMNS).sort()
const privateColumns = Object.keys(NEVER_PUBLIC_TEAM_COLUMNS).sort()

describe('proyección pública de team_members', () => {
  it('clasifica TODAS las columnas: ninguna queda sin decidir', () => {
    const classified = [...publicColumns, ...privateColumns].sort()
    const unclassified = allColumns.filter((c) => !classified.includes(c))
    expect(
      unclassified,
      `Columnas nuevas en team_members sin clasificar. Decide si son públicas ` +
        `(PUBLIC_TEAM_COLUMNS) o no (NEVER_PUBLIC_TEAM_COLUMNS, con el motivo escrito): ${unclassified.join(', ')}`,
    ).toEqual([])
  })

  it('no clasifica columnas que ya no existen', () => {
    const ghosts = [...publicColumns, ...privateColumns].filter((c) => !allColumns.includes(c))
    expect(ghosts, `Clasificadas pero inexistentes en la tabla: ${ghosts.join(', ')}`).toEqual([])
  })

  it('ninguna columna está a la vez en las dos listas', () => {
    expect(publicColumns.filter((c) => privateColumns.includes(c))).toEqual([])
  })

  it('cada columna privada dice POR QUÉ lo es', () => {
    // Una exención sin motivo es un agujero con permiso — mismo criterio que
    // la lista de exenciones de tenantScopeCoverage.
    for (const [col, reason] of Object.entries(NEVER_PUBLIC_TEAM_COLUMNS)) {
      expect(reason.length, `"${col}" no explica por qué no es público`).toBeGreaterThan(20)
    }
  })

  it('el token de calendario y el documento de identidad nunca son públicos', () => {
    // Las dos que provocaron todo esto, fijadas por nombre para que ningún
    // refactor las devuelva por accidente.
    expect(publicColumns).not.toContain('icalToken')
    expect(publicColumns).not.toContain('nid')
    expect(privateColumns).toContain('icalToken')
    expect(privateColumns).toContain('nid')
  })
})

describe('los endpoints públicos usan la proyección', () => {
  const FILES = ['server/api/public/team.get.ts', 'server/api/public/team/[slug].get.ts']

  it.each(FILES)('%s selecciona columnas explícitas, nunca la fila entera', (file) => {
    const source = readFileSync(join(ROOT, file), 'utf8')
    expect(source).toContain('PUBLIC_TEAM_COLUMNS')
    // `select()` sin argumentos sobre teamMembers es exactamente el fallo
    // original: devuelve todo lo que tenga la tabla en ese momento.
    expect(source, 'usa select() sin proyección').not.toMatch(/\.select\(\)\s*\n?\s*\.from\(schema\.teamMembers\)/)
  })
})
