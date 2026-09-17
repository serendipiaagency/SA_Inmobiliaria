import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BLOCK_PRESETS,
  BLOCK_CATEGORIES,
  BLOCK_INSPECTORS,
  BLOCK_TYPE_LABELS,
  blockLabel,
  blockSubtitle,
} from '../../composables/useSiteBuilderRegistry'

/**
 * Un bloque del Constructor Web no es un fichero: son seis piezas que tienen
 * que existir a la vez —preset en el registro, componente en `blocks/`, caso
 * en `SiteBlockRenderer.vue`, inspector propio en `inspectors/`, etiqueta y
 * subtítulo— y el modo de romperlo es olvidar una.
 *
 * El síntoma de cada olvido es distinto y ninguno es un error rojo: sin caso
 * en el renderizador el bloque sale como «Tipo de bloque desconocido»; sin
 * inspector se selecciona y el panel derecho se queda vacío; sin subtítulo
 * la lista de Estructura muestra dos tarjetas idénticas; sin miniatura la
 * biblioteca enseña un rectángulo gris. Todos se descubren por casualidad.
 *
 * Es una comprobación de exhaustividad —igual que tenantScopeCoverage— y por
 * eso recorre el código fuente: lo que atrapa es la pieza que falta, no el
 * comportamiento de la que está.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const RENDERER = readFileSync(join(ROOT, 'components/site-builder/SiteBlockRenderer.vue'), 'utf8')
const SECTION_PREVIEW = readFileSync(join(ROOT, 'components/site-builder/shell/SectionPreview.vue'), 'utf8')

const TYPES = [...new Set(BLOCK_PRESETS.map((p) => p.type))].sort()

describe('catálogo de bloques del Constructor Web', () => {
  it('hay al menos un preset por tipo, y ningún tipo huérfano en el registro', () => {
    expect(TYPES.length).toBeGreaterThan(0)
    // Un tipo con etiqueta pero sin preset no se puede añadir desde la
    // biblioteca: existiría sólo para páginas ya guardadas.
    expect(Object.keys(BLOCK_TYPE_LABELS).sort()).toEqual(TYPES)
  })

  it.each(TYPES)('«%s» tiene inspector propio', (type) => {
    expect(BLOCK_INSPECTORS[type], `falta la entrada en BLOCK_INSPECTORS`).toBeTruthy()
    expect(BLOCK_INSPECTORS[type].component).toBeTruthy()
  })

  it.each(TYPES)('«%s» lo pinta SiteBlockRenderer', (type) => {
    // Sin este caso el bloque cae en el else final: "Tipo de bloque
    // desconocido" en el lienzo y nada en la web publicada.
    expect(RENDERER, `SiteBlockRenderer no tiene caso para "${type}"`).toContain(`block.type === '${type}'`)
  })

  it.each(TYPES)('«%s» tiene etiqueta y subtítulo propios', (type) => {
    expect(blockLabel(type)).not.toBe(type) // blockLabel devuelve el type crudo si falta
    // El subtítulo es lo único que distingue dos bloques del mismo tipo en la
    // lista de Estructura; vacío significa dos tarjetas indistinguibles.
    const preset = BLOCK_PRESETS.find((p) => p.type === type)!
    expect(blockSubtitle({ type, content: preset.createContent() }), `blockSubtitle("${type}") está vacío`).not.toBe('')
  })

  it.each(TYPES)('«%s» tiene miniatura en la biblioteca', (type) => {
    expect(SECTION_PREVIEW, `SectionPreview no dibuja "${type}"`).toContain(`type === '${type}'`)
  })

  it('cada preset declara una categoría existente', () => {
    for (const preset of BLOCK_PRESETS) {
      expect(BLOCK_CATEGORIES, `preset "${preset.presetId}" usa una categoría desconocida`).toContain(preset.category as any)
    }
  })

  it('cada preset produce contenido inicial, y los presetId son únicos', () => {
    const ids = BLOCK_PRESETS.map((p) => p.presetId)
    expect(new Set(ids).size).toBe(ids.length)
    for (const preset of BLOCK_PRESETS) {
      expect(preset.createContent(), `"${preset.presetId}" no crea contenido`).toBeTypeOf('object')
      expect(preset.label).toBeTruthy()
      expect(preset.description).toBeTruthy()
    }
  })

  it('no hay componentes de bloque ni inspectores sueltos', () => {
    // El caso contrario al de arriba: un fichero que ya no usa nadie. Se
    // queda compilando y dando la impresión de que la función existe.
    const blockFiles = readdirSync(join(ROOT, 'components/site-builder/blocks')).filter((f) => f.endsWith('.vue'))
    const orphanBlocks = blockFiles.filter((f) => !RENDERER.includes(`blocks/${f}`))
    expect(orphanBlocks, `Componentes en blocks/ que el renderizador no usa: ${orphanBlocks.join(', ')}`).toEqual([])

    const registrySource = readFileSync(join(ROOT, 'composables/useSiteBuilderRegistry.ts'), 'utf8')
    const inspectorFiles = readdirSync(join(ROOT, 'components/site-builder/inspectors')).filter((f) => f.endsWith('.vue'))
    const orphanInspectors = inspectorFiles.filter((f) => !registrySource.includes(`inspectors/${f}`))
    expect(orphanInspectors, `Inspectores que el registro no importa: ${orphanInspectors.join(', ')}`).toEqual([])
  })
})

describe('el bloque de comerciales', () => {
  const presets = BLOCK_PRESETS.filter((p) => p.type === 'team')

  it('ofrece los dos diseños y ninguno guarda copias de las personas', () => {
    expect(presets.map((p) => p.presetId).sort()).toEqual(['team-cards', 'team-compact'])
    for (const preset of presets) {
      const content = preset.createContent()
      // Lo mismo que garantiza R4 para propiedades: el bloque guarda criterio
      // (fuente y número), nunca los datos del comercial.
      expect(content.source).toBe('dynamic')
      expect(Object.keys(content)).not.toContain('members')
      expect(Object.keys(content)).not.toContain('names')
    }
  })

  it('su inspector pide los datos en vivo del catálogo', () => {
    // Sin needsPreviewData el selector manual saldría siempre vacío.
    expect(BLOCK_INSPECTORS.team.needsPreviewData).toBe(true)
  })
})
