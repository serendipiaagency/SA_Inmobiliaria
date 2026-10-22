import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * «IA Generar contenido» en Propiedades 2ª mano (cierre del encargo): el botón,
 * la página AI Studio y el endpoint admiten el catálogo agent. Como las 2ª mano
 * no tienen nombre propio, el endpoint deriva el título con agentCatalogTitle.
 * Los ids se solapan entre catálogos, así que la selección es `catalog:id`.
 */
const ROOT = join(import.meta.dirname, '../..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')

describe('endpoint de IA admite 2ª mano', () => {
  const src = read('server/api/admin/ai/generate.post.ts')
  it('acepta catalog agent, carga de agentProperties y deriva el título', () => {
    expect(src).toContain("body?.catalog === 'agent'")
    expect(src).toContain('schema.agentProperties')
    expect(src).toContain('agentCatalogTitle(row)')
  })
})

describe('AI Studio selecciona por catalog:id', () => {
  const page = read('pages/admin/ai.vue')
  it('la selección distingue catálogo e id y envía catalog al generar', () => {
    expect(page).toContain('selectedKey')
    expect(page).toContain('`${p.catalog}:${p.id}`')
    expect(page).toContain("route.query.kind === 'agent'")
    expect(page).toContain('catalog: sel.value.catalog')
  })
})

describe('el enlace IA del editor vale para 2ª mano', () => {
  const builder = read('components/property-builder/PropertyBuilder.vue')
  it('ya no está limitado a obra nueva y pasa kind=agent en 2ª mano', () => {
    const line = builder.split('\n').find((l) => l.includes('/admin/ai?id=')) || ''
    expect(line).toContain('v-if="!isNew && canEdit"')
    expect(line).toContain("resource === 'properties' ? '&kind=agent' : ''")
  })
})
