import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Cola 33 — Un único menú de acciones «···» en todo el panel. Se construye un
 * componente compartido `AdminActionsMenu` (components/admin/ActionsMenu.vue)
 * que teletransporta su panel al <body> con posición fija, de modo que ningún
 * contenedor con overflow lo recorte (el defecto de los cuatro menús ad-hoc, en
 * especial la tabla de clientes dentro de `overflow-x-auto`). Cierra por
 * clic-fuera, Escape y scroll/resize, con aria y teclado completos. Los cuatro
 * menús ad-hoc se sustituyen por él.
 */
const ROOT = join(import.meta.dirname, '../..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

describe('Cola 33: componente compartido AdminActionsMenu', () => {
  const menu = read('components/admin/ActionsMenu.vue')

  it('teletransporta el panel al body para no recortarse', () => {
    expect(menu).toContain('<Teleport to="body">')
    expect(menu).toContain('class="fixed')
  })

  it('tiene aria y rol de menú completos', () => {
    expect(menu).toContain('aria-haspopup="menu"')
    expect(menu).toContain(':aria-expanded="open"')
    expect(menu).toContain('role="menu"')
    expect(menu).toContain('role="menuitem"')
  })

  it('cierra por clic-fuera, Escape y scroll/resize', () => {
    expect(menu).toContain("addEventListener('pointerdown'")
    expect(menu).toContain("addEventListener('scroll'")
    expect(menu).toContain("addEventListener('resize'")
    expect(menu).toContain('@keydown.esc')
  })

  it('soporta teclado (flechas y Home/End)', () => {
    expect(menu).toContain('@keydown.down')
    expect(menu).toContain('@keydown.up')
    expect(menu).toContain('@keydown.home')
    expect(menu).toContain('@keydown.end')
    expect(menu).toContain('function move(')
  })

  it('acepta items con enlace, acción, peligro y separador', () => {
    expect(menu).toContain('interface AdminActionItem')
    expect(menu).toContain('danger')
    expect(menu).toContain('divider')
    expect(menu).toContain('onClick')
  })
})

describe('Cola 33: los cuatro menús ad-hoc usan el compartido', () => {
  const files = [
    'components/client-builder/ClientRowMenu.vue',
    'components/admin/AgentCard.vue',
    'components/admin/AgentPropertyCard.vue',
    'components/admin/DeveloperPropertyCard.vue',
  ]

  it('ninguno conserva su propio menú artesanal (menuOpen/onDocClick inline)', () => {
    for (const f of files) {
      const src = read(f)
      expect(src, `${f} no debe declarar su propio estado de menú`).not.toContain('const menuOpen = ref')
      expect(src, `${f} no debe registrar su propio click-fuera`).not.toContain('function onDocClick')
    }
  })

  it('todos renderizan AdminActionsMenu', () => {
    for (const f of files) {
      expect(read(f), `${f} debe usar AdminActionsMenu`).toContain('AdminActionsMenu')
    }
  })
})
