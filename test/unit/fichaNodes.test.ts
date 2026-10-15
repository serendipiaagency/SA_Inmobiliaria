import { describe, expect, it } from 'vitest'
import {
  FICHA_NODES,
  FICHA_TEXT_FIELDS,
  FICHA_TEXT_MAX,
  fichaNode,
  fichaText,
  fichaTree,
  filterFichaNodeStyles,
  isFichaNodeField,
  sanitizeFichaTexts,
} from '../../utils/siteBuilder/fichaNodes'
import { FICHA_SECTIONS, PAGE_CORE_TYPE, seedPageBlocks } from '../../utils/siteBuilder/pages'
import { isValidNodeKey, nodeId, nodeSelector } from '../../utils/siteBuilder/nodes'
import { buildPageCss } from '../../utils/siteBuilder/pageCss'
import { validatePageDocument } from '../../server/utils/sitePages'

/**
 * La ficha de propiedad editable: el registro de nodos (qué se puede
 * seleccionar y estilizar), lo que el servidor guarda de ellos y la hoja de
 * estilos que sale de lo guardado. Los datos de la propiedad nunca se guardan.
 */

const core = (extra: Record<string, unknown> = {}) => ({
  id: 'zona',
  type: PAGE_CORE_TYPE,
  version: 1,
  content: { core: 'property-detail', ...extra },
})

describe('registro de nodos de la ficha', () => {
  it('cada nodo tiene una clave válida, única y un nombre', () => {
    const fields = FICHA_NODES.map((n) => n.field)
    expect(new Set(fields).size).toBe(fields.length)
    for (const n of FICHA_NODES) {
      expect(isValidNodeKey(n.field), n.field).toBe(true)
      expect(n.label.trim().length, n.field).toBeGreaterThan(0)
    }
  })

  it('cada padre existe, y no hay más nodos de los que admite un bloque', () => {
    for (const n of FICHA_NODES) if (n.parent) expect(isFichaNodeField(n.parent), `${n.field} → ${n.parent}`).toBe(true)
    // Un bloque del Constructor admite hasta MAX_NODES_PER_BLOCK estilos de nodo.
    expect(FICHA_NODES.length).toBeLessThanOrEqual(80)
  })

  it('cada sección que se ordena u oculta tiene su bloque, y sólo ellas', () => {
    const withSection = FICHA_NODES.filter((n) => n.section).map((n) => n.section)
    expect(withSection.sort()).toEqual(FICHA_SECTIONS.map((s) => s.key).sort())
    for (const n of FICHA_NODES.filter((x) => x.section)) expect(n.field).toBe(`s.${n.section}`)
  })

  it('los datos dicen de dónde vienen y no guardan texto; los textos tienen el de partida', () => {
    for (const n of FICHA_NODES) {
      if (n.role === 'data') expect(n.dynamic, n.field).toBeTruthy()
      if (n.role === 'text') expect(n.defaultText, n.field).toBeTruthy()
      if (n.role !== 'text') expect(FICHA_TEXT_FIELDS).not.toContain(n.field)
    }
    expect(FICHA_TEXT_FIELDS.length).toBeGreaterThan(10)
  })

  it('la galería, la tarjeta principal, el precio y «Atendido por» son nodos', () => {
    for (const f of ['b.gallery', 'b.summary', 'b.price', 'b.contact', 'd.title', 'd.location', 'b.description', 'b.keyfacts', 's.energia', 's.ubicacion', 's.hipoteca']) {
      expect(isFichaNodeField(f), f).toBe(true)
    }
    expect(fichaNode('d.title')).toMatchObject({ role: 'data', kind: 'heading', dynamic: 'Propiedades → Nombre' })
    expect(fichaNode('nope')).toBeUndefined()
  })
})

describe('textos fijos de la plantilla', () => {
  it('sin texto guardado se enseña el de partida; con él, el nuevo', () => {
    expect(fichaText({}, 't.ubicacion.title')).toBe('Dónde está')
    expect(fichaText({ 't.ubicacion.title': 'Su barrio' }, 't.ubicacion.title')).toBe('Su barrio')
    expect(fichaText({ 't.ubicacion.title': '   ' }, 't.ubicacion.title')).toBe('Dónde está')
    expect(fichaText(null, 'd.title')).toBe('')
  })

  it('el servidor sólo guarda los textos de los nodos de texto, limpios y acotados', () => {
    const out = sanitizeFichaTexts({
      't.ubicacion.title': '  Dónde   vivirás\n\t ',
      't.hipoteca.title': 'x'.repeat(500),
      't.historia.title': '',
      't.precio.title': 42,
      'd.title': 'No se reescribe un dato',
      'b.gallery': 'Ni un contenedor',
      'texto.inventado': 'Ni una clave que no existe',
      core: 'property-detail',
    })
    expect(out).toEqual({ 't.ubicacion.title': 'Dónde vivirás', 't.hipoteca.title': 'x'.repeat(FICHA_TEXT_MAX) })
  })

  it('quita los caracteres de control', () => {
    expect(sanitizeFichaTexts({ 't.ubicacion.title': 'A\u0000B\u0007C' })).toEqual({ 't.ubicacion.title': 'A B C' })
  })
})

describe('estilos de los nodos', () => {
  it('sólo se conservan los de nodos que existen', () => {
    expect(filterFichaNodeStyles({ 'b.price': { color: '#111111' }, inventado: { color: '#222222' } })).toEqual({ 'b.price': { color: '#111111' } })
    expect(filterFichaNodeStyles({ inventado: { color: '#222222' } })).toBeUndefined()
    expect(filterFichaNodeStyles(undefined)).toBeUndefined()
  })
})

describe('lo que guarda el servidor de la ficha', () => {
  const doc = (block: Record<string, unknown>) => ({ blocks: [block], seo: {} })

  it('guarda estilos y textos de la plantilla; ignora lo demás (sin datos de la propiedad)', () => {
    const saved = validatePageDocument(
      doc({
        ...core({ 't.ubicacion.title': 'Su barrio', 'd.title': 'Un título que no se guarda', price: 999999, name: 'Casa' }),
        nodeStyles: {
          'b.price': { background: '#fdf1e7', radius: 18, responsive: { mobile: { paddingY: 8 } } },
          'd.title': { color: '#1c1b19', fontSize: 44 },
          inventado: { color: '#ff0000' },
        },
      }),
      'ficha-propiedad',
    )
    const block = saved.blocks[0]!
    expect(block.content['t.ubicacion.title']).toBe('Su barrio')
    expect(block.content).not.toHaveProperty('d.title')
    expect(block.content).not.toHaveProperty('price')
    expect(block.content).not.toHaveProperty('name')
    expect(Object.keys(block.nodeStyles || {}).sort()).toEqual(['b.price', 'd.title'])
    expect(block.nodeStyles!['b.price']).toMatchObject({ background: '#fdf1e7', radius: 18, responsive: { mobile: { paddingY: 8 } } })
    expect(block.style).toBeUndefined()
    expect(block.visibility).toBeUndefined()
  })

  it('un valor de estilo fuera de lo permitido no se guarda', () => {
    const saved = validatePageDocument(doc({ ...core(), nodeStyles: { 'b.price': { color: 'red; background:url(x)', fontSize: 9999, radius: -5 } } }), 'ficha-propiedad')
    expect(saved.blocks[0]!.nodeStyles?.['b.price'] || {}).not.toHaveProperty('color')
    const fs = saved.blocks[0]!.nodeStyles?.['b.price']?.fontSize
    expect(fs === undefined || fs <= 200).toBe(true)
  })

  it('el orden y las opciones de siempre se siguen guardando', () => {
    const saved = validatePageDocument(doc(core({ sections: [{ key: 'energia', visible: false }, { key: 'datos', visible: true }], showReference: false })), 'ficha-propiedad')
    expect(saved.blocks[0]!.content.showReference).toBe(false)
    expect((saved.blocks[0]!.content.sections as { key: string; visible: boolean }[])[0]).toEqual({ key: 'energia', visible: false })
  })

  it('en las demás páginas con zona dinámica no se guardan estilos de nodo', () => {
    const catalog = { id: 'zona', type: PAGE_CORE_TYPE, version: 1, content: { core: 'properties-listing' }, nodeStyles: { 'b.price': { color: '#111111' } } }
    const saved = validatePageDocument(doc(catalog), 'propiedades')
    expect(saved.blocks[0]!.nodeStyles).toBeUndefined()
  })

  it('la ficha sin personalizar sigue igual: sin estilos ni textos en el borrador de partida', () => {
    const seed = seedPageBlocks('ficha-propiedad')
    const saved = validatePageDocument({ blocks: seed, seo: {} }, 'ficha-propiedad')
    const block = saved.blocks.find((b) => b.type === PAGE_CORE_TYPE)!
    expect(block.nodeStyles).toBeUndefined()
    expect(Object.keys(block.content).filter((k) => FICHA_TEXT_FIELDS.includes(k))).toEqual([])
  })
})

describe('hoja de estilos de la ficha', () => {
  it('sale con el selector del nodo del bloque de la zona, también por tamaño', () => {
    const saved = validatePageDocument(
      { blocks: [{ ...core(), nodeStyles: { 'b.price': { background: '#fdf1e7', paddingY: 20, responsive: { mobile: { paddingY: 8 } } } } }], seo: {} },
      'ficha-propiedad',
    )
    const css = buildPageCss({ blocks: saved.blocks })
    expect(css).toContain(nodeSelector('zona', 'b.price'))
    expect(css).toContain('background-color:#fdf1e7')
    expect(css).toContain('@media (max-width: 639.98px)')
    expect(nodeId('zona', 'b.price')).toBe('zona:b.price')
  })

  it('sin estilos no hay hoja', () => {
    expect(buildPageCss({ blocks: [core()] })).toBe('')
  })
})

describe('árbol de la ficha para «Estructura»', () => {
  it('sigue el orden de la lista de secciones y trae sus hijos', () => {
    const order = FICHA_SECTIONS.map((s) => s.key).reverse()
    const { top } = fichaTree(order, new Set())
    const fields = top.map((n) => n.def.field)
    expect(fields.slice(0, 4)).toEqual(['b.breadcrumbs', 'b.gallery', 'b.summary', 'b.nav'])
    expect(fields.indexOf('s.historia')).toBeLessThan(fields.indexOf('s.datos'))
    const summary = top.find((n) => n.def.field === 'b.summary')!
    expect(summary.children.map((c) => c.def.field)).toContain('d.title')
    expect(summary.children.find((c) => c.def.field === 'b.description')!.children.map((c) => c.def.field)).toEqual(['t.description.title', 'd.description'])
    expect(top.find((n) => n.def.field === 's.ubicacion')!.children.map((c) => c.def.field)).toEqual(['t.ubicacion.title'])
  })

  it('toda sección está en el árbol aunque el orden guardado no la conozca', () => {
    const { top } = fichaTree(['energia', 'energia', 'desconocida'], new Set())
    for (const s of FICHA_SECTIONS) expect(top.filter((n) => n.def.section === s.key), s.key).toHaveLength(1)
    // Lo que el orden dio, primero; lo que faltaba, detrás.
    const fields = top.map((n) => n.def.field)
    expect(fields.indexOf('s.energia')).toBeLessThan(fields.indexOf('s.datos'))
  })
})
