import { describe, expect, it } from 'vitest'
import { PROPERTY_SHEET_FIELD_MAP, PROPERTY_SUBTYPES, PROPERTY_TYPES, PROPERTY_CONDITIONS, PROPERTY_COMMERCIAL_STATUS_LABELS } from '../../utils/propertySheet'
import { PROPERTIES } from '../../server/demo/dataset/properties'
import { OFFERS } from '../../server/demo/dataset/business'
import { OFFER_FINANCE_CONDITIONS } from '../../utils/pipelineCatalog'
import { MEDIA_ALT } from '../../server/demo/dataset/media'
import { PROPERTY_CONTACT_ROLES } from '../../utils/crmCatalog'

/**
 * El dataset de la cuenta demo usa sólo valores de los catálogos reales de la
 * plataforma: si un catálogo cambia, esto falla aquí y no a mitad de la
 * generación en producción.
 */
describe('dataset de la demo: valores dentro de catálogo', () => {
  it('ficha ampliada y datos legales de las 20 propiedades', () => {
    const problems: string[] = []
    for (const p of PROPERTIES) {
      if (!(PROPERTY_TYPES as readonly string[]).includes(p.propertyType)) problems.push(`${p.key}: tipo ${p.propertyType}`)
      if (!Object.keys(PROPERTY_SUBTYPES[p.propertyType] || {}).includes(p.subtype)) problems.push(`${p.key}: subtipo ${p.subtype}`)
      if (!(PROPERTY_CONDITIONS as readonly string[]).includes(p.condition)) problems.push(`${p.key}: estado ${p.condition}`)
      for (const o of p.owners ?? []) if (!(PROPERTY_CONTACT_ROLES as readonly string[]).includes(o.role)) problems.push(`${p.key}: papel ${o.role}`)
      if (!(p.commercialStatus in PROPERTY_COMMERCIAL_STATUS_LABELS)) problems.push(`${p.key}: estado comercial ${p.commercialStatus}`)
      for (const [key, value] of Object.entries({ ...p.sheet, ...p.legal })) {
        const field = PROPERTY_SHEET_FIELD_MAP[key]
        if (!field) {
          problems.push(`${p.key}: campo desconocido ${key}`)
          continue
        }
        if (field.type === 'select' && !field.options!.includes(String(value))) problems.push(`${p.key}: ${key}=${String(value)} (${field.options!.join('|')})`)
        if (field.type === 'bool' && typeof value !== 'boolean') problems.push(`${p.key}: ${key} debería ser sí/no`)
        if ((field.type === 'number' || field.type === 'integer') && typeof value !== 'number') problems.push(`${p.key}: ${key} debería ser un número`)
      }
    }
    expect(problems).toEqual([])
  })

  it('las ofertas usan condiciones de financiación del catálogo', () => {
    for (const o of OFFERS) if (o.financeCondition) expect(OFFER_FINANCE_CONDITIONS).toContain(o.financeCondition)
  })

  it('cada persona del escenario tiene su retrato (con texto alternativo y fichero)', async () => {
    const { existsSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { CONTACTS } = await import('../../server/demo/dataset/crm')
    const { COMMERCIALS, DEMO_ADMIN } = await import('../../server/demo/dataset/company')
    const keys = [DEMO_ADMIN.key, ...COMMERCIALS.map((c) => c.key), ...CONTACTS.map((c) => c.key)]
    for (const k of keys) {
      const path = `personas/${k}.jpg`
      expect(MEDIA_ALT[path], path).toBeTruthy()
      expect(existsSync(join(import.meta.dirname, '../../public/demo-assets/norte-astur', path)), path).toBe(true)
    }
  })

  it('cada foto de galería existe y tiene texto alternativo', () => {
    for (const p of PROPERTIES) {
      expect(p.gallery.length).toBeGreaterThanOrEqual(3)
      for (const path of p.gallery) expect(MEDIA_ALT[path], path).toBeTruthy()
    }
  })
})
