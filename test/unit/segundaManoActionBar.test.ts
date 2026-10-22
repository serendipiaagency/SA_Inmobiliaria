import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Barra superior de acciones en Propiedades 2ª mano (encargo): el editor es el
 * mismo componente para obra nueva y 2ª mano (PropertyBuilder); se habilitan
 * para 2ª mano las acciones que funcionan de verdad en ese catálogo — Dossier y
 * creatividades y Vista previa (WhatsApp y Guardar ya estaban). IA Generar
 * contenido queda pendiente (necesita que su endpoint y su página admitan 2ª
 * mano), así que de momento sigue sólo en obra nueva para no ofrecer un botón
 * que no funciona.
 */
const ROOT = join(import.meta.dirname, '../..')
const builder = readFileSync(join(ROOT, 'components/property-builder/PropertyBuilder.vue'), 'utf8')

describe('barra de acciones de 2ª mano', () => {
  it('Dossier y creatividades ya no está limitado a obra nueva y recibe el catálogo', () => {
    const line = builder.split('\n').find((l) => l.includes('AdminAssetExportButton')) || ''
    expect(line).not.toContain("resource === 'developer-properties' &&")
    expect(line).toContain(":asset-kind=\"resource === 'developer-properties' ? 'developer_property' : 'agent_property'\"")
  })

  it('Vista previa vale para 2ª mano cuando hay slug público', () => {
    const line = builder.split('\n').find((l) => l.includes('/propiedades/') && l.includes('Vista previa</a>')) || ''
    expect(line).toContain("resource === 'developer-properties' || form.slug")
  })

  it('Compartir por WhatsApp sigue disponible para ambos catálogos', () => {
    const line = builder.split('\n').find((l) => l.includes('property-share-whatsapp')) || ''
    expect(line).toContain("v-if=\"!isNew && !trashedAt\"")
  })

  it('IA Generar contenido sigue sólo en obra nueva (pendiente de soporte 2ª mano)', () => {
    const line = builder.split('\n').find((l) => l.includes('/admin/ai?id=')) || ''
    expect(line).toContain("resource === 'developer-properties'")
  })
})
