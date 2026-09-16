import { describe, expect, it } from 'vitest'
import { PROPERTY_LIST_CONFIG, PROPERTY_LIST_TYPES, LIST_CHIP_CLASSES } from '../../composables/usePropertyListConfig'
import { PROPERTY_BUILDER_SECTIONS } from '../../composables/usePropertyBuilderConfig'

/**
 * Los dos catálogos de propiedades compartían dos páginas de listado casi
 * idénticas —95 líneas de diferencia— y toda mejora había que hacerla dos
 * veces (hallazgo RE06). Ahora hay un solo `PropertyList.vue` y lo que
 * cambia está declarado en `PROPERTY_LIST_CONFIG`.
 *
 * Esta prueba vigila la forma de fallar que sustituye a la anterior: que
 * alguien añada un catálogo (o una acción) a medias. No comprueba cómo se
 * pinta —de eso se encargan las e2e de cada listado, que siguen pasando sin
 * tocarlas— sino que cada entrada esté completa y sea coherente consigo
 * misma.
 */

const RESOURCES = Object.keys(PROPERTY_LIST_CONFIG)

describe('PROPERTY_LIST_CONFIG', () => {
  it('cubre exactamente los mismos recursos que el editor', () => {
    // Un catálogo con editor y sin listado (o al revés) es una pantalla rota.
    expect(RESOURCES.sort()).toEqual(Object.keys(PROPERTY_BUILDER_SECTIONS).sort())
  })

  it.each(RESOURCES)('«%s» declara todo lo que el listado necesita', (resource) => {
    const c = PROPERTY_LIST_CONFIG[resource]
    expect(c.resource).toBe(resource) // la clave y el segmento de URL no pueden divergir
    expect(c.title).toBeTruthy()
    expect(c.searchPlaceholder).toBeTruthy()
    expect(c.viewStorageKey).toMatch(/^sa-admin-/)
    expect(c.statusOptions.length).toBeGreaterThan(0)
    expect(c.sortOptions.length).toBeGreaterThan(0)
    expect(['developer', 'agent']).toContain(c.card)
  })

  it('cada catálogo guarda su preferencia de vista en su propia clave', () => {
    const keys = RESOURCES.map((r) => PROPERTY_LIST_CONFIG[r].viewStorageKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('el evento de la tarjeta coincide con la tarjeta que se monta', () => {
    // Enlazar un listener con el nombre equivocado no falla: simplemente el
    // botón de la tarjeta deja de hacer nada. Por eso se comprueba aquí.
    expect(PROPERTY_LIST_CONFIG['developer-properties'].cardToggleEvent).toBe('publish')
    expect(PROPERTY_LIST_CONFIG.properties.cardToggleEvent).toBe('toggle-sold')
  })

  it('todos los tonos de chip usados existen en la tabla de clases', () => {
    const sample = { status: 'sold', publishedAt: null, transactionType: 'rent' }
    for (const resource of RESOURCES) {
      for (const chip of PROPERTY_LIST_CONFIG[resource].rowChips(sample)) {
        expect(LIST_CHIP_CLASSES[chip.tone], `tono "${chip.tone}" sin clase`).toBeTruthy()
      }
    }
  })
})

/**
 * La acción principal es la que de verdad escribe en la base de datos, y es
 * donde un descuido se nota: el cuerpo del PUT y el mensaje que se enseña
 * tienen que describir el MISMO cambio. Ambos reciben la fila *antes* de
 * tocarla, que es el error fácil de cometer al leerlos por separado.
 */
describe('la acción principal de cada catálogo', () => {
  const dev = PROPERTY_LIST_CONFIG['developer-properties'].toggle
  const agent = PROPERTY_LIST_CONFIG.properties.toggle

  it('obra nueva: sin publicar → publica, y lo dice', () => {
    const row = { publishedAt: null }
    expect(dev.label(row)).toBe('Publicar')
    expect(dev.body(row).publishedAt).toBeTruthy()
    expect(dev.successMessage(row)).toBe('Propiedad publicada')
  })

  it('obra nueva: publicada → despublica, y lo dice', () => {
    const row = { publishedAt: '2026-01-01 00:00:00' }
    expect(dev.label(row)).toBe('Despublicar')
    expect(dev.body(row).publishedAt).toBeNull()
    expect(dev.successMessage(row)).toBe('Propiedad despublicada')
  })

  it('2ª mano: disponible → vendida, y lo dice', () => {
    const row = { status: 'available' }
    expect(agent.label(row)).toBe('Marcar vendida')
    expect(agent.body(row).status).toBe('sold')
    expect(agent.successMessage(row)).toBe('Propiedad marcada como vendida')
  })

  it('2ª mano: vendida → disponible, y lo dice', () => {
    const row = { status: 'sold' }
    expect(agent.label(row)).toBe('Marcar disponible')
    expect(agent.body(row).status).toBe('available')
    expect(agent.successMessage(row)).toBe('Propiedad marcada como disponible')
  })
})

describe('cómo se pinta cada fila', () => {
  it('obra nueva muestra el nombre del proyecto; 2ª mano, el tipo de vivienda', () => {
    expect(PROPERTY_LIST_CONFIG['developer-properties'].rowTitle({ name: 'Torre Marina' })).toBe('Torre Marina')
    expect(PROPERTY_LIST_CONFIG.properties.rowTitle({ propertyType: 'Villa' })).toBe('Villa')
    // Una vivienda sin tipo sigue necesitando algo que mostrar.
    expect(PROPERTY_LIST_CONFIG.properties.rowTitle({})).toBe('Vivienda')
  })

  it('2ª mano cae al campo de ubicación heredado cuando no hay dirección granular', () => {
    const cfg = PROPERTY_LIST_CONFIG.properties
    expect(cfg.rowLocation({ city: 'Málaga', country: 'España' })).toBe('Málaga · España')
    expect(cfg.rowLocation({ location: 'Centro histórico' })).toBe('Centro histórico')
    expect(cfg.rowLocation({})).toBe('—')
  })

  it('solo obra nueva tiene ficha pública que previsualizar', () => {
    expect(PROPERTY_LIST_CONFIG['developer-properties'].previewHref?.({ slug: 'torre-marina', id: 7 })).toBe('/propiedades/torre-marina')
    expect(PROPERTY_LIST_CONFIG['developer-properties'].previewHref?.({ id: 7 })).toBe('/propiedades/7')
    expect(PROPERTY_LIST_CONFIG.properties.previewHref).toBeNull()
  })

  it('el filtro venta/alquiler solo existe donde significa algo', () => {
    expect(PROPERTY_LIST_CONFIG.properties.hasTransactionFilter).toBe(true)
    expect(PROPERTY_LIST_CONFIG['developer-properties'].hasTransactionFilter).toBe(false)
  })

  it('los tipos de propiedad del filtro son los mismos que ofrece el editor', () => {
    const editorTypes = PROPERTY_BUILDER_SECTIONS.properties
      .flatMap((s) => ('fields' in s ? s.fields : []))
      .find((f) => f.key === 'propertyType')?.options
    expect(PROPERTY_LIST_TYPES).toEqual(editorTypes)
  })
})
