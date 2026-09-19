import { describe, expect, it } from 'vitest'
import { describeOrganizationChanges, describeUserChanges, describeUserCreation } from '../../server/utils/sensitiveAudit'

/**
 * Lo que va al campo `detail` de admin_audit_log cuando cambia algo
 * sensible. Dos cosas tienen que ser ciertas a la vez: que un cambio real
 * conste, y que un guardado que no toca nada sensible no invente uno.
 */
describe('describeUserChanges', () => {
  it('un guardado que sólo cambia el nombre no anota nada sensible', () => {
    expect(describeUserChanges({ role: 'admin', permissions: null }, { name: 'Otro nombre' })).toBeUndefined()
  })

  it('el valor de `permissions` que vuelve igual del formulario no cuenta como cambio', () => {
    // El formulario reenvía el valor actual en cada guardado. `''` y `null`
    // son la misma cosa (sin restricción) para el servidor y aquí también.
    expect(describeUserChanges({ role: 'admin', permissions: null }, { permissions: '' })).toBeUndefined()
    expect(describeUserChanges({ role: 'admin', permissions: '["crm:write"]' }, { permissions: '["crm:write"]' })).toBeUndefined()
  })

  it('una contraseña nueva consta como cambiada, sin el valor', () => {
    const detail = describeUserChanges({ role: 'admin', permissions: null }, { password: 'pbkdf2$100000$salt$hash' })
    expect(detail).toBe('contraseña cambiada')
    expect(detail).not.toContain('pbkdf2')
  })

  it('subir a super_admin queda marcado de forma inconfundible', () => {
    const detail = describeUserChanges({ role: 'admin', permissions: null }, { role: 'super_admin' })!
    expect(detail).toContain('rol: admin → super_admin')
    expect(detail).toContain('CONCEDIDO super_admin')
  })

  it('un cambio de permisos anota el antes y el después', () => {
    expect(describeUserChanges({ role: 'admin', permissions: null }, { permissions: '["crm:read"]' })).toBe('permisos: sin restricción → ["crm:read"]')
    expect(describeUserChanges({ role: 'admin', permissions: '["crm:read"]' }, { permissions: null })).toBe('permisos: ["crm:read"] → sin restricción')
  })

  it('varios cambios sensibles a la vez se separan con punto y coma', () => {
    const detail = describeUserChanges({ role: 'user', permissions: null }, { password: 'x', role: 'admin', permissions: '[]' })!
    expect(detail.split('; ')).toEqual(['contraseña cambiada', 'rol: user → admin', 'permisos: sin restricción → []'])
  })
})

describe('describeUserCreation', () => {
  it('siempre anota el rol, y el super_admin concedido cuando lo es', () => {
    expect(describeUserCreation({ role: 'admin', password: 'hash' })).toBe('rol: admin')
    expect(describeUserCreation({ role: 'super_admin' })).toBe('rol: super_admin; CONCEDIDO super_admin')
    expect(describeUserCreation({})).toBe('rol: user')
  })

  it('nunca incluye la contraseña', () => {
    expect(describeUserCreation({ role: 'admin', password: 'pbkdf2$secreto' })).not.toContain('secreto')
  })
})

describe('describeOrganizationChanges', () => {
  it('un dominio que se asigna, cambia o retira consta con el antes y el después', () => {
    expect(describeOrganizationChanges({ domain: null, status: 'active' }, { domain: 'inmobiliaria.ejemplo.com' })).toBe('dominio: (ninguno) → inmobiliaria.ejemplo.com')
    expect(describeOrganizationChanges({ domain: 'a.com', status: 'active' }, { domain: null })).toBe('dominio: a.com → (ninguno)')
  })

  it('reenviar el mismo dominio no es un cambio', () => {
    expect(describeOrganizationChanges({ domain: 'a.com', status: 'active' }, { domain: 'a.com', name: 'X' })).toBeUndefined()
  })

  it('suspender una agencia consta', () => {
    expect(describeOrganizationChanges({ domain: null, status: 'active' }, { status: 'suspended' })).toBe('estado: active → suspended')
  })
})
