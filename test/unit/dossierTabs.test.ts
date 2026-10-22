import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * «Dossier y creatividades» (encargo): una pantalla con dos pestañas Export |
 * Cartel, cada una con su galería de plantillas reales, su vista previa y su
 * botón de descarga, reutilizando los dos motores existentes (asset-export y
 * carteles) con los datos reales de la propiedad. Export debe funcionar también
 * para 2ª mano (agent_property). Se fija por fuente para que no se revierta.
 */
const ROOT = join(import.meta.dirname, '../..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')

describe('Dossier: dos pestañas Export | Cartel', () => {
  const btn = read('components/admin/AssetExportButton.vue')

  it('tiene pestañas export y cartel con sus botones de descarga', () => {
    expect(btn).toContain('dossier-tab-${t.key}')
    expect(btn).toContain('dossier-download-${tab}')
    expect(btn).toMatch(/key: 'export'/)
    expect(btn).toMatch(/key: 'cartel'/)
  })

  it('reutiliza los dos motores existentes (no duplica) y pasa el catálogo real', () => {
    // Las listas de plantillas de cada motor:
    expect(btn).toContain('/api/admin/asset-export/templates')
    expect(btn).toContain('/api/admin/carteles/templates')
    // La generación usa el endpoint del motor de la pestaña activa (base + /projects):
    expect(btn).toContain("'/api/admin/asset-export'")
    expect(btn).toContain("'/api/admin/carteles'")
    expect(btn).toContain('${base}/projects')
    expect(btn).toContain('${base}/projects/${project.id}/render')
    expect(btn).toContain('assetKind: assetKind.value')
    expect(btn).toContain('AdminTemplateDesignPreview')
  })

  it('acepta el catálogo de la propiedad (obra nueva o 2ª mano)', () => {
    expect(btn).toContain("assetKind?: 'developer_property' | 'agent_property'")
  })
})

describe('Export admite 2ª mano en el servidor', () => {
  const src = read('server/api/admin/asset-export/projects.post.ts')
  it('projects.post acepta agent_property y lo carga de agentProperties', () => {
    expect(src).toContain("body.assetKind !== 'developer_property' && body.assetKind !== 'agent_property'")
    expect(src).toContain('schema.agentProperties')
  })
})
