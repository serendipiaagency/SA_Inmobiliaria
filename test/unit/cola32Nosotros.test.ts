import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BLOCK_TYPE_LABELS } from '../../composables/useSiteBuilderRegistry'

/**
 * Cola 32 — «Sobre nosotros» y «Nuestro Equipo» en el Constructor. Parte 1:
 * renombrar los bloques (about-agency → «Sobre nosotros», team → «Nuestro
 * Equipo») y hacer editable el único texto fijo visible del equipo editorial
 * («Ver perfil»). Se fija por el registro y por fuente.
 */
describe('Cola 32: renombrado de bloques', () => {
  it('about-agency se llama «Sobre nosotros» y team «Nuestro Equipo»', () => {
    expect(BLOCK_TYPE_LABELS['about-agency']).toBe('Sobre nosotros')
    expect(BLOCK_TYPE_LABELS.team).toBe('Nuestro Equipo')
  })
})

describe('Cola 32: «Ver perfil» editable', () => {
  const ROOT = join(import.meta.dirname, '../..')
  it('el bloque usa content.profileLabel con «Ver perfil» de reserva', () => {
    const block = readFileSync(join(ROOT, 'components/site-builder/blocks/TeamBlock.vue'), 'utf8')
    expect(block).toContain("content.profileLabel || t('team.block.profile', 'Ver perfil')")
  })
  it('el inspector ofrece el campo «Texto del enlace de perfil»', () => {
    const insp = readFileSync(join(ROOT, 'components/site-builder/inspectors/TeamInspector.vue'), 'utf8')
    expect(insp).toContain('content.profileLabel')
    expect(insp).toContain('Texto del enlace de perfil')
  })
})
