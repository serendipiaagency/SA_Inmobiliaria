import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A } from './global-setup'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`

/**
 * Auditoría de lo sensible, sobre HTTP real: que un cambio de contraseña,
 * una concesión de rol, un cambio de permisos, el alta y la revocación de
 * una clave de API y la rotación del secreto de un webhook dejen una fila
 * en admin_audit_log que diga QUÉ pasó — y que ningún valor secreto (hash
 * de contraseña, clave, secreto) aparezca en ella.
 *
 * Todo con la sesión de STATE_A (super_admin, organización 1): ningún login
 * adicional, por el límite de intentos por IP.
 */
test.describe('Auditoría de operaciones sensibles', () => {
  let a: APIRequestContext
  let userId: number
  let apiKeyId: number
  let webhookId: number

  test.beforeAll(async () => {
    a = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STATE_A })
  })

  test.afterAll(async () => {
    if (userId) await a.delete(`/api/admin/users/${userId}`).catch(() => null)
    if (webhookId) await a.delete(`/api/admin/saas/webhooks/${webhookId}`).catch(() => null)
    await a?.dispose()
  })

  /** Las últimas filas de auditoría de la organización activa, más recientes primero. */
  async function auditRows(): Promise<any[]> {
    const res = await a.get('/api/admin/audit-log', { params: { perPage: '50', sort: 'id', dir: 'desc' } })
    expect(res.ok()).toBeTruthy()
    const rows = (await res.json()).rows as any[]
    return rows.sort((x, y) => y.id - x.id)
  }

  test('alta de usuario, contraseña, rol y permisos constan con detalle y sin valores', async () => {
    const password = `Secreta-${RUN}-xyz`
    const created = await a.post('/api/admin/users', {
      data: { name: `Audit ${RUN}`, email: `audit-${RUN}@sa-inmobiliaria.com`, password, role: 'admin' },
    })
    expect(created.ok(), await created.text()).toBeTruthy()
    userId = (await created.json()).id

    let rows = await auditRows()
    const creation = rows.find((r) => r.resource === 'users' && r.action === 'create' && String(r.resourceId) === String(userId))
    expect(creation, 'el alta debe constar').toBeTruthy()
    expect(creation.detail).toBe('rol: admin')

    // Cambiar sólo el nombre no anota nada sensible.
    await a.put(`/api/admin/users/${userId}`, { data: { name: `Audit ${RUN} renombrado`, email: `audit-${RUN}@sa-inmobiliaria.com`, role: 'admin' } })
    rows = await auditRows()
    const rename = rows.find((r) => r.resource === 'users' && r.action === 'update' && String(r.resourceId) === String(userId))
    expect(rename).toBeTruthy()
    expect(rename.detail).toBeNull()

    // Contraseña + permisos en el mismo guardado.
    const newPassword = `Otra-${RUN}-abc`
    const put = await a.put(`/api/admin/users/${userId}`, {
      data: { name: `Audit ${RUN}`, email: `audit-${RUN}@sa-inmobiliaria.com`, role: 'admin', password: newPassword, permissions: '["crm:read"]' },
    })
    expect(put.ok(), await put.text()).toBeTruthy()
    rows = await auditRows()
    const sensitive = rows.find((r) => r.resource === 'users' && r.action === 'update' && String(r.resourceId) === String(userId) && r.detail)
    expect(sensitive).toBeTruthy()
    expect(sensitive.detail).toContain('contraseña cambiada')
    expect(sensitive.detail).toContain('permisos: sin restricción → ["crm:read"]')
    // Ni la contraseña en claro ni su hash llegan a la auditoría.
    expect(JSON.stringify(rows)).not.toContain(newPassword)
    expect(JSON.stringify(rows)).not.toContain('pbkdf2$')
  })

  test('el alta y la revocación de una clave de API constan, sin la clave', async () => {
    const created = await a.post('/api/admin/saas/apikeys', { data: { name: `Audit key ${RUN}`, environment: 'test', scopes: 'read' } })
    expect(created.ok(), await created.text()).toBeTruthy()
    const key = await created.json()
    apiKeyId = key.id

    const revoked = await a.patch(`/api/admin/saas/apikeys/${apiKeyId}`)
    expect(revoked.ok()).toBeTruthy()

    const rows = await auditRows()
    const creation = rows.find((r) => r.resource === 'api-key' && r.action === 'create' && String(r.resourceId) === String(apiKeyId))
    const revocation = rows.find((r) => r.resource === 'api-key' && r.action === 'revoke' && String(r.resourceId) === String(apiKeyId))
    expect(creation).toBeTruthy()
    expect(revocation).toBeTruthy()
    expect(creation.detail).toContain(key.prefix)
    expect(creation.detail).toContain('test, read')
    expect(JSON.stringify(rows)).not.toContain(key.plainKey)
  })

  test('rotar el secreto de un webhook devuelve uno nuevo una sola vez y consta como rotación', async () => {
    const created = await a.post('/api/admin/saas/webhooks', { data: { url: `https://example.com/hook-${RUN}`, events: ['lead.created'] } })
    expect(created.ok(), await created.text()).toBeTruthy()
    const endpoint = await created.json()
    webhookId = endpoint.id

    const rotated = await a.post(`/api/admin/saas/webhooks/${webhookId}/rotate-secret`)
    expect(rotated.ok(), await rotated.text()).toBeTruthy()
    const body = await rotated.json()
    expect(body.secret).toMatch(/^[0-9a-f]{48}$/)
    expect(body.secret).not.toBe(endpoint.secret)

    // El listado nunca devuelve el secreto entero, ni antes ni después.
    const list = await (await a.get('/api/admin/saas/webhooks')).json()
    expect(JSON.stringify(list)).not.toContain(body.secret)

    const rows = await auditRows()
    const rotation = rows.find((r) => r.resource === 'webhook-endpoint' && r.action === 'rotate' && String(r.resourceId) === String(webhookId))
    expect(rotation).toBeTruthy()
    expect(rotation.detail).toContain('secreto HMAC rotado')
    expect(JSON.stringify(rows)).not.toContain(body.secret)
    expect(JSON.stringify(rows)).not.toContain(endpoint.secret)
  })

  test('un webhook de otra organización no se puede rotar', async () => {
    const res = await a.post(`/api/admin/saas/webhooks/999999/rotate-secret`)
    expect(res.status()).toBe(404)
  })
})
