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

/**
 * Dos bloques tienen **efecto real**: el formulario de captación crea un lead
 * en el CRM y dispara un aviso por email, y la reserva de visita ocupa un
 * hueco en la agenda de un comercial y envía su confirmación.
 *
 * El lienzo intercepta el clic, así que ahí no pasa nada — pero **Vista
 * previa navega y dispara handlers de verdad**, que es justo para lo que
 * existe. Sin un bloqueo explícito, revisar la portada antes de publicarla
 * llenaría el CRM de leads inventados y la agenda de citas falsas.
 *
 * Es una comprobación sobre el código fuente a propósito: lo que tiene que
 * saltar es el bloque nuevo con efectos que nadie se acuerde de proteger.
 */
describe('los bloques con efecto real no disparan nada desde el editor', () => {
  const SIDE_EFFECT_BLOCKS: Record<string, string> = {
    'lead-form': 'LeadFormBlock.vue',
    'book-visit': 'BookVisitBlock.vue',
  }

  it.each(Object.entries(SIDE_EFFECT_BLOCKS))('el renderizador le pasa `mode` a «%s»', (type) => {
    // Sin `:mode` el bloque cae en su valor por defecto ('production') y se
    // creería publicado también dentro del constructor.
    const line = RENDERER.split('\n').find((l) => l.includes(`block.type === '${type}'`))
    expect(line, `no hay caso para "${type}"`).toBeTruthy()
    expect(line, `el caso de "${type}" no recibe :mode`).toContain(':mode="mode"')
  })

  it.each(Object.values(SIDE_EFFECT_BLOCKS))('%s se bloquea fuera de producción', (file) => {
    const source = readFileSync(join(ROOT, 'components/site-builder/blocks', file), 'utf8')
    expect(source, 'no comprueba el modo').toContain("mode !== 'production'")
    // Y el bloqueo tiene que cortar de verdad el envío, no sólo pintar un
    // botón deshabilitado: un `disabled` en el HTML no protege de un submit
    // con Enter desde un campo de texto.
    expect(source, 'el bloqueo no corta la acción').toMatch(/if \(locked\.value\) return/)
  })

  it('ningún otro bloque hace peticiones de escritura', () => {
    // Si un bloque nuevo empieza a hacer POST/PUT/DELETE, es que tiene efecto
    // real y le toca entrar en la lista de arriba.
    const dir = join(ROOT, 'components/site-builder/blocks')
    const offenders: string[] = []
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.vue'))) {
      if (Object.values(SIDE_EFFECT_BLOCKS).includes(file)) continue
      const source = readFileSync(join(dir, file), 'utf8')
      if (/method:\s*'(POST|PUT|DELETE|PATCH)'/i.test(source)) offenders.push(file)
    }
    expect(
      offenders,
      `Estos bloques escriben pero no declaran efecto real: ${offenders.join(', ')}. Añádelos a SIDE_EFFECT_BLOCKS y protégelos con \`mode\`.`,
    ).toEqual([])
  })
})

/**
 * El editor visual no es un parche por bloque: cada bloque expone sus
 * textos, botones e imágenes como nodos (components/site-builder/nodes/*)
 * y es eso lo que los hace seleccionables y editables desde el lienzo. Un
 * bloque nuevo que pinte un `<h2>{{ content.title }}</h2>` a pelo se vería
 * igual en la web pero no se podría pulsar — y nadie lo notaría hasta que
 * un usuario lo intentase. Esta comprobación lo atrapa antes.
 */
describe('todos los bloques exponen nodos editables', () => {
  const dir = join(ROOT, 'components/site-builder/blocks')
  const files = readdirSync(dir).filter((f) => f.endsWith('.vue'))
  // El hero y la fila de propiedades delegan en componentes compartidos; sus
  // nodos viven allí.
  const DELEGATES: Record<string, string> = { 'HeroBlock.vue': 'components/HeroSearch.vue', 'PropertiesBlock.vue': 'components/SectionRow.vue' }

  it.each(files)('%s usa al menos un nodo (SbText/SbLink/SbImage/SbBox/SbButton)', (file) => {
    const own = readFileSync(join(dir, file), 'utf8')
    const delegate = DELEGATES[file] ? readFileSync(join(ROOT, DELEGATES[file]), 'utf8') : ''
    expect(own + delegate, `${file} no usa ningún nodo editable`).toMatch(/<Sb(Text|Link|Image|Box|Button)\b/)
  })

  it('ningún bloque pinta un título estático fuera de un nodo', () => {
    // Un <h2>/<h3> con interpolación directa es un título que no se puede pulsar.
    const offenders: string[] = []
    for (const file of files) {
      const source = readFileSync(join(dir, file), 'utf8')
      if (/<h[1-3][^>]*>\s*\{\{/.test(source)) offenders.push(file)
    }
    expect(offenders, `Títulos sin nodo en: ${offenders.join(', ')}`).toEqual([])
  })

  it('los datos dinámicos se marcan como tales (nunca como texto editable)', () => {
    // Todo nodo que pinte un dato de una entidad (propiedad, comunidad,
    // comercial, artículo) lleva `dynamic`: el inspector enseña de dónde
    // sale y no ofrece cambiar el texto. El campo se llama `card.*` o
    // `agent.*` por convención — un `card.name` sin `dynamic` sería el
    // nombre real de una propiedad convertido en texto estático.
    const offenders: string[] = []
    for (const file of [...files.map((f) => join(dir, f)), join(ROOT, 'components/ProjectCard.vue')]) {
      const source = readFileSync(file, 'utf8')
      const tags = source.match(/<Sb(?:Text|Link|Image|Box)\b[^>]*field="(?:card|agent)\.[^"]*"[^>]*>/g) || []
      for (const tag of tags) if (!/:dynamic=|\bdynamic=/.test(tag)) offenders.push(`${file.split('/').pop()}: ${tag.slice(0, 60)}…`)
    }
    expect(offenders, 'Nodos de datos sin marcar como dinámicos').toEqual([])
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
