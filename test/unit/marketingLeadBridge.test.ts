import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CONTACT_SOURCES, CONTACT_SOURCE_LABELS } from '../../utils/crmCatalog'

/**
 * Puente marketing → CRM (Cola 30): la suscripción al newsletter (footer) y el
 * alta de una alerta de propiedades crean también un lead en el CRM con su
 * origen («Newsletter» / «Alertas»), reutilizando `upsertLead` (dedup por
 * email). Se comprueba el catálogo de orígenes y que ambos endpoints públicos
 * llaman al puente, para que no se pierda ninguna de las dos conexiones.
 */
const ROOT = join(import.meta.dirname, '../..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')

describe('orígenes de lead Newsletter y Alertas', () => {
  it('el catálogo de orígenes incluye newsletter y alerts con etiqueta', () => {
    expect(CONTACT_SOURCES).toContain('newsletter')
    expect(CONTACT_SOURCES).toContain('alerts')
    expect(CONTACT_SOURCE_LABELS.newsletter).toBe('Newsletter')
    expect(CONTACT_SOURCE_LABELS.alerts).toBe('Alertas de propiedades')
  })
})

describe('puente al CRM desde la web pública', () => {
  it('leads.ts expone captureMarketingLead (best-effort, dedup por upsertLead)', () => {
    const src = read('server/utils/leads.ts')
    expect(src).toContain('export async function captureMarketingLead')
    expect(src).toContain('upsertLead(')
    // Best-effort: envuelto en try/catch para no tumbar la acción pública.
    expect(src).toMatch(/captureMarketingLead[\s\S]*try\s*\{[\s\S]*upsertLead/)
  })

  it('la suscripción al newsletter crea un lead origen «newsletter»', () => {
    const src = read('server/api/public/newsletter.post.ts')
    expect(src).toContain('captureMarketingLead')
    expect(src).toContain("source: 'newsletter'")
    // Sólo en una suscripción nueva (no en reenvíos de quien ya estaba).
    expect(src).toContain('result.created')
  })

  it('el alta de una alerta de propiedades crea un lead origen «alerts»', () => {
    const src = read('server/api/public/saved-searches.post.ts')
    expect(src).toContain('captureMarketingLead')
    expect(src).toContain("source: 'alerts'")
  })
})
