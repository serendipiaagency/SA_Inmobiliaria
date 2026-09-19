import { describe, expect, it } from 'vitest'
import { ADMIN_AREAS } from '../../utils/adminAreas'
import { hasAreaAccess, validatePermissionsInput } from '../../utils/permissions'
import { findPreset, matchPreset, ROLE_PRESETS } from '../../utils/rolePresets'

/**
 * Las plantillas son azúcar sobre `users.permissions`, y sólo valen si
 * producen valores que el sistema de permisos real acepta y entiende. Estas
 * pruebas usan el mismo `hasAreaAccess` que aplica el servidor, no una
 * interpretación propia de lo que "debería" permitir cada plantilla.
 */
describe('plantillas de permisos', () => {
  it('cada plantilla produce un valor que el servidor aceptaría guardar', () => {
    for (const preset of ROLE_PRESETS) {
      const raw = preset.permissions === null ? null : JSON.stringify(preset.permissions)
      expect(validatePermissionsInput(raw), preset.key).toBeNull()
    }
  })

  it('las claves son únicas y cada plantilla explica qué puede y qué no', () => {
    expect(new Set(ROLE_PRESETS.map((p) => p.key)).size).toBe(ROLE_PRESETS.length)
    for (const p of ROLE_PRESETS) {
      expect(p.label.length, p.key).toBeGreaterThan(3)
      expect(p.description.length, p.key).toBeGreaterThan(40)
    }
  })

  it('un comercial lleva el CRM pero no toca facturación, RGPD ni usuarios', () => {
    const user = { role: 'admin', permissions: JSON.stringify(findPreset('comercial')!.permissions) }
    expect(hasAreaAccess(user, 'crm', 'write')).toBe(true)
    expect(hasAreaAccess(user, 'web', 'read')).toBe(true)
    expect(hasAreaAccess(user, 'web', 'write')).toBe(false)
    expect(hasAreaAccess(user, 'finance', 'read')).toBe(false)
    expect(hasAreaAccess(user, 'system', 'read')).toBe(false)
  })

  it('quien lleva facturación no ve usuarios ni RGPD, y quien lleva administración no factura', () => {
    const finanzas = { role: 'admin', permissions: JSON.stringify(findPreset('finanzas')!.permissions) }
    expect(hasAreaAccess(finanzas, 'finance', 'write')).toBe(true)
    expect(hasAreaAccess(finanzas, 'system', 'read')).toBe(false)

    const admin = { role: 'admin', permissions: JSON.stringify(findPreset('administracion')!.permissions) }
    expect(hasAreaAccess(admin, 'system', 'write')).toBe(true)
    expect(hasAreaAccess(admin, 'finance', 'read')).toBe(true)
    expect(hasAreaAccess(admin, 'finance', 'write')).toBe(false)
  })

  it('"sólo consulta" ve todas las áreas y no escribe en ninguna', () => {
    const user = { role: 'admin', permissions: JSON.stringify(findPreset('lectura')!.permissions) }
    for (const a of ADMIN_AREAS) {
      expect(hasAreaAccess(user, a.key, 'read'), a.key).toBe(true)
      expect(hasAreaAccess(user, a.key, 'write'), a.key).toBe(false)
    }
  })

  it('toda área tiene al menos una plantilla que la concede con escritura: ninguna función del panel queda huérfana', () => {
    for (const a of ADMIN_AREAS) {
      if (a.key === 'general') continue // el dashboard es de sólo lectura por naturaleza
      const covered = ROLE_PRESETS.some((p) => p.permissions?.includes(`${a.key}:write`))
      expect(covered, `ninguna plantilla concede ${a.key}:write`).toBe(true)
    }
  })

  it('matchPreset reconoce cada plantilla, sin importar el orden ni el read redundante, y devuelve null para lo hecho a mano', () => {
    for (const p of ROLE_PRESETS) {
      const raw = p.permissions === null ? null : JSON.stringify([...p.permissions].reverse())
      expect(matchPreset(raw)?.key, p.key).toBe(p.key)
    }
    expect(matchPreset('["crm:write","crm:read","general:read","web:read","inbox:read"]')?.key).toBe('comercial')
    expect(matchPreset('')?.key).toBe('full')
    expect(matchPreset('["crm:write"]')).toBeNull()
    expect(matchPreset('[]')).toBeNull()
    expect(matchPreset('no es json')).toBeNull()
  })
})
