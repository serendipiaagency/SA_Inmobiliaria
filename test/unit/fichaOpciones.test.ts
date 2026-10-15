import { describe, expect, it } from 'vitest'
import { FICHA_CHOICES, PAGE_CORE_TYPE, fichaChoice, fichaDisplayOptions, sanitizeCoreOptions } from '../../utils/siteBuilder/pages'
import { FICHA_TEXT_FIELDS, fichaNode, fichaNodeHasOptions, fichaText, sanitizeFichaTexts } from '../../utils/siteBuilder/fichaNodes'
import { validatePageDocument } from '../../server/utils/sitePages'

/**
 * Ficha editable (Cola 7, paso 2): las opciones propias de cada bloque. Sólo
 * presentación, acotadas a una lista cerrada, y sin guardar lo que es igual a
 * lo que la web ya enseña (las fichas existentes no cambian hasta que se
 * personalizan).
 */

const doc = (content: Record<string, unknown>) => ({
  blocks: [{ id: 'zona', type: PAGE_CORE_TYPE, version: 1, content: { core: 'property-detail', ...content } }],
  seo: {},
})

describe('opciones de elección de la ficha', () => {
  it('sin nada guardado, la web enseña lo de siempre', () => {
    const d = fichaDisplayOptions({})
    expect(d.descriptionLines).toBe(4)
    expect(d.factsColumns).toBe('auto')
    expect(d.mapHeight).toBe('standard')
  })

  it('un valor de la lista se respeta, también si llega como texto', () => {
    expect(fichaChoice({ descriptionLines: 8 }, 'descriptionLines')).toBe(8)
    expect(fichaChoice({ descriptionLines: '6' }, 'descriptionLines')).toBe(6)
    expect(fichaChoice({ factsColumns: '3' }, 'factsColumns')).toBe(3)
    expect(fichaChoice({ factsColumns: 'auto' }, 'factsColumns')).toBe('auto')
    expect(fichaChoice({ mapHeight: 'tall' }, 'mapHeight')).toBe('tall')
  })

  it('un valor fuera de la lista vuelve al de partida', () => {
    expect(fichaChoice({ descriptionLines: 99 }, 'descriptionLines')).toBe(4)
    expect(fichaChoice({ descriptionLines: 'muchas' }, 'descriptionLines')).toBe(4)
    expect(fichaChoice({ factsColumns: 7 }, 'factsColumns')).toBe('auto')
    expect(fichaChoice({ mapHeight: 'gigante' }, 'mapHeight')).toBe('standard')
    expect(fichaChoice(null, 'mapHeight')).toBe('standard')
  })

  it('cada opción tiene su valor de partida en la lista', () => {
    for (const spec of Object.values(FICHA_CHOICES)) expect((spec.values as readonly unknown[]).includes(spec.fallback)).toBe(true)
  })

  it('sólo se guarda lo que difiere de lo de partida', () => {
    expect(sanitizeCoreOptions('property-detail', { descriptionLines: 4, factsColumns: 'auto', mapHeight: 'standard' })).toEqual({})
    expect(sanitizeCoreOptions('property-detail', { descriptionLines: 8, factsColumns: 2, mapHeight: 'tall' })).toEqual({ descriptionLines: 8, factsColumns: 2, mapHeight: 'tall' })
    expect(sanitizeCoreOptions('property-detail', { descriptionLines: 99, factsColumns: 'x', mapHeight: '<script>' })).toEqual({})
  })

  it('el servidor las guarda con la ficha y no en otras páginas', () => {
    const saved = validatePageDocument(doc({ descriptionLines: 6, factsColumns: 3, mapHeight: 'compact' }), 'ficha-propiedad')
    expect(saved.blocks[0]!.content).toMatchObject({ descriptionLines: 6, factsColumns: 3, mapHeight: 'compact' })
    const other = validatePageDocument({ blocks: [{ id: 'zona', type: PAGE_CORE_TYPE, version: 1, content: { core: 'properties-listing', descriptionLines: 6, mapHeight: 'tall' } }], seo: {} }, 'propiedades')
    expect(other.blocks[0]!.content).not.toHaveProperty('descriptionLines')
    expect(other.blocks[0]!.content).not.toHaveProperty('mapHeight')
  })
})

describe('«Atendido por»: textos de la plantilla y bloques con opciones', () => {
  it('el título, la frase, la etiqueta y el botón son textos fijos con su texto de partida', () => {
    expect(fichaNode('t.contact.eyebrow')).toMatchObject({ role: 'text', parent: 'b.contact', defaultText: 'Atendido por' })
    expect(fichaNode('t.contact.title')?.defaultText).toBe('Cuéntanos qué necesitas')
    expect(fichaNode('t.contact.lead')?.defaultText).toBe('Te ayudamos con los detalles de esta propiedad.')
    expect(fichaNode('t.contact.submit')).toMatchObject({ kind: 'button', defaultText: 'Enviar mensaje' })
    for (const f of ['t.contact.eyebrow', 't.contact.title', 't.contact.lead', 't.contact.submit']) expect(FICHA_TEXT_FIELDS).toContain(f)
  })

  it('el servidor guarda esos textos, acotados; los campos del formulario no son nodos', () => {
    const saved = validatePageDocument(doc({ 't.contact.title': '  ¿Hablamos?  ', 't.contact.submit': 'Quiero una visita', 'contact.consent': 'Sin consentimiento', 'contact.email': 'a@example.com' }), 'ficha-propiedad')
    const c = saved.blocks[0]!.content
    expect(c['t.contact.title']).toBe('¿Hablamos?')
    expect(c['t.contact.submit']).toBe('Quiero una visita')
    expect(c).not.toHaveProperty('contact.consent')
    expect(c).not.toHaveProperty('contact.email')
    expect(sanitizeFichaTexts({ 't.contact.lead': '   ' })).toEqual({})
    expect(fichaText({ 't.contact.lead': '   ' }, 't.contact.lead')).toBe('Te ayudamos con los detalles de esta propiedad.')
  })

  it('los bloques con opciones propias son los que de verdad las tienen', () => {
    for (const f of ['b.summary', 'b.description', 'b.keyfacts', 'b.gallery', 's.energia', 's.ubicacion', 'b.contact', 'b.similar']) expect(fichaNodeHasOptions(f), f).toBe(true)
    for (const f of ['b.price', 'b.nav', 's.datos', 'd.title']) expect(fichaNodeHasOptions(f), f).toBe(false)
  })
})
