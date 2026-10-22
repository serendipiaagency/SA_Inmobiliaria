import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Sistema → Usuarios · claridad del campo «Rol» (sin romper nada): el rol
 * sigue existiendo (lo usan las cuentas de cliente de «Mi cuenta» y el alta de
 * comerciales), pero el formulario lo explica — etiquetas legibles, texto de
 * ayuda, valor por defecto «admin» y un aviso al elegir «user». Se comprueba
 * sobre el código fuente para que no se pierda ninguna de esas piezas.
 */
const ROOT = join(import.meta.dirname, '../..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')

describe('Usuarios: el campo Rol, claro pero intacto', () => {
  it('el recurso users conserva el rol con etiquetas, ayuda y por defecto «admin»', () => {
    const src = read('server/utils/adminResources.ts')
    // Sigue existiendo el rol con sus dos valores (no se elimina: lo usan Mi cuenta y comerciales).
    expect(src).toMatch(/role:\s*\{[\s\S]*options:\s*\['admin',\s*'user'\]/)
    // Etiquetas legibles para cada valor.
    expect(src).toContain("admin: 'Administrador (accede al panel)'")
    expect(src).toContain('Mi cuenta')
    // Ayuda y valor por defecto admin.
    expect(src).toMatch(/hint:\s*'Administrador = tu equipo/)
    expect(src).toMatch(/default:\s*'admin'/)
  })

  it('FieldDef admite hint y default, y el formulario genérico los pinta/aplica', () => {
    const res = read('server/utils/adminResources.ts')
    expect(res).toContain('hint?: string')
    expect(res).toContain('default?: string')
    const page = read('pages/admin/[resource]/[id].vue')
    // Ayuda bajo el campo.
    expect(page).toContain('fd.hint')
    // Valor por defecto en un registro nuevo.
    expect(page).toContain('fd.default != null')
    // Aviso al elegir «user» en Usuarios.
    expect(page).toContain("resource === 'users' && field === 'role' && form[field] === 'user'")
  })
})
