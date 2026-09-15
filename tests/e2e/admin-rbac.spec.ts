import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { STATE_A, STATE_B } from './global-setup'

/**
 * Bloque 01 — permisos efectivos en todas las APIs.
 *
 * The unit suites prove the pieces (test/unit/permissions.test.ts for the
 * three permission states, test/unit/adminRouteMatrix.test.ts for the
 * completeness of the area matrix). This proves the whole thing over real
 * HTTP against the running Worker: a restricted admin session, a real
 * cookie, real handlers, real D1.
 *
 * One login, many roles. `/api/auth/login` is rate-limited to 10 attempts per
 * 10 minutes per IP (server/utils/rateLimit.ts) and the whole local suite
 * shares one address, so this spec signs its throwaway admin in exactly once
 * and then rewrites that user's `permissions` column between phases through
 * the super_admin API. That works because permissions are read from the user
 * row on every request — which is itself worth asserting: revoking an area
 * takes effect on the next call, without waiting for the session to expire.
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8788'
const RUN = `${Date.now()}-${Math.floor(Math.random() * 1000)}`
const RESTRICTED = { email: `rbac-${RUN}@sa-inmobiliaria.com`, password: 'ChangeMe123!' }

function sessionFor(storageState: string): Promise<APIRequestContext> {
  return pwRequest.newContext({ baseURL: BASE_URL, storageState })
}

// Serial: each test rewrites the same fixture user's permissions, so they
// build on one another. Without this, a single failure makes Playwright
// restart the worker and re-run beforeAll — minting a *new* fixture user, so
// every later test fails for a reason unrelated to what actually broke.
test.describe.configure({ mode: 'serial' })

test.describe('RBAC: permisos efectivos en todas las APIs (bloque 01)', () => {
  /** admin@sa-inmobiliaria.com — super_admin, the only account that may set permissions. */
  let owner: APIRequestContext
  /** Skyline Estates (org 2) — used to prove org isolation still applies inside a granted area. */
  let tenantB: APIRequestContext
  /** The throwaway org-1 admin whose permissions each phase rewrites. */
  let restricted: APIRequestContext
  let restrictedUserId: number
  let tenantBPropertyId: number

  /** Rewrites the throwaway admin's areas. Takes effect on their very next request. */
  async function setPermissions(permissions: string | null) {
    const res = await owner.put(`/api/admin/users/${restrictedUserId}`, {
      data: { name: 'RBAC fixture', email: RESTRICTED.email, role: 'admin', permissions },
    })
    expect(res.ok(), `no se pudieron fijar los permisos ${permissions}: ${res.status()} ${await res.text()}`).toBeTruthy()
  }

  test.beforeAll(async () => {
    owner = await sessionFor(STATE_A)
    tenantB = await sessionFor(STATE_B)

    const created = await owner.post('/api/admin/users', {
      data: { name: 'RBAC fixture', email: RESTRICTED.email, password: RESTRICTED.password, role: 'admin' },
    })
    expect(created.ok(), `no se pudo crear el usuario de prueba: ${created.status()} ${await created.text()}`).toBeTruthy()
    restrictedUserId = (await created.json()).id
    expect(restrictedUserId).toBeGreaterThan(0)

    // A record owned by the *other* agency, to prove an area grant never
    // widens tenant scope.
    const bProperty = await tenantB.post('/api/admin/properties', {
      data: { name: `Skyline RBAC ${RUN}`, price: 1_000_000, propertyType: 'Apartment' },
    })
    expect(bProperty.ok(), `tenant B no pudo crear una propiedad: ${bProperty.status()} ${await bProperty.text()}`).toBeTruthy()
    tenantBPropertyId = (await bProperty.json()).id

    restricted = await pwRequest.newContext({ baseURL: BASE_URL })
    const login = await restricted.post('/api/auth/login', { data: RESTRICTED })
    expect(login.ok(), `login del usuario restringido falló: ${login.status()}`).toBeTruthy()
  })

  test.afterAll(async () => {
    // Leave nothing behind that could grant access on a later run.
    if (restrictedUserId) await owner.delete(`/api/admin/users/${restrictedUserId}`).catch(() => null)
    if (tenantBPropertyId) await tenantB.delete(`/api/admin/properties/${tenantBPropertyId}`).catch(() => null)
    await Promise.all([owner.dispose(), tenantB.dispose(), restricted.dispose()])
  })

  test('sin permisos explícitos (NULL) el admin sigue siendo irrestricto — compatibilidad con las cuentas existentes', async () => {
    await setPermissions(null)
    for (const path of ['/api/admin/saas/leads', '/api/admin/saas/apikeys', '/api/admin/cms/articles', '/api/admin/users']) {
      expect((await restricted.get(path)).status(), path).toBe(200)
    }
  })

  test('un comercial (solo CRM) no puede crear claves de API ni exportar datos por petición directa', async () => {
    await setPermissions('["crm:write"]')

    // Lo que sí puede: su propia área.
    expect((await restricted.get('/api/admin/saas/leads')).status()).toBe(200)
    expect((await restricted.get('/api/admin/saas/clients')).status()).toBe(200)

    // Claves de API — área "finance".
    expect((await restricted.get('/api/admin/saas/apikeys')).status()).toBe(403)
    expect((await restricted.post('/api/admin/saas/apikeys', { data: { name: `k-${RUN}`, environment: 'test' } })).status()).toBe(403)

    // Exportación de datos personales — área "system".
    expect((await restricted.post('/api/admin/saas/gdpr/export', { data: { email: 'alguien@example.com' } })).status()).toBe(403)
    expect((await restricted.get('/api/admin/saas/gdpr/requests')).status()).toBe(403)

    // Estado del canal de email — también "system". Es un diagnóstico, no un
    // listado, pero delata volumen de envíos y el motivo de los fallos.
    expect((await restricted.get('/api/admin/saas/email-health')).status()).toBe(403)

    // Exportación de materiales — área "web".
    expect((await restricted.post('/api/admin/asset-export/batches', { data: { templateId: 1, assetIds: [1] } })).status()).toBe(403)
  })

  test('todos los métodos quedan cubiertos, no sólo GET', async () => {
    await setPermissions('["crm:write"]')
    const denied: [string, () => Promise<{ status(): number }>][] = [
      ['GET /api/admin/saas/invoices', () => restricted.get('/api/admin/saas/invoices')],
      ['POST /api/admin/cms/articles', () => restricted.post('/api/admin/cms/articles', { data: { title: 'x' } })],
      ['PUT /api/admin/site-pages/home', () => restricted.put('/api/admin/site-pages/home', { data: { blocks: [] } })],
      ['PATCH /api/admin/saas/deals/1', () => restricted.patch('/api/admin/saas/deals/1', { data: { stage: 'won' } })],
      ['DELETE /api/admin/saas/webhooks/1', () => restricted.delete('/api/admin/saas/webhooks/1')],
    ]
    for (const [label, call] of denied) {
      expect((await call()).status(), label).toBe(403)
    }

    // /api/admin/upload can't tell which area a file belongs to, so it only
    // asks for write access *somewhere* — a comercial has it, and gets as far
    // as the handler's own validation (422, no file in the body). The
    // read-only case below is where it must deny.
    expect((await restricted.post('/api/admin/upload')).status()).toBe(422)
  })

  test('el área denegada gana antes que el ámbito de organización, y dentro del área concedida el ámbito sigue aplicando', async () => {
    // Sin "web": la propiedad de la otra agencia ni siquiera se evalúa.
    await setPermissions('["crm:write"]')
    expect((await restricted.get(`/api/admin/properties/${tenantBPropertyId}`)).status()).toBe(403)

    // Con "web": el área deja pasar, pero el id es de otra agencia → 404
    // (nunca 403, que confirmaría que el id existe en otra cuenta).
    await setPermissions('["web:write"]')
    expect((await restricted.get(`/api/admin/properties/${tenantBPropertyId}`)).status()).toBe(404)
    expect((await restricted.put(`/api/admin/properties/${tenantBPropertyId}`, { data: { name: 'robado' } })).status()).toBe(404)
    expect((await restricted.delete(`/api/admin/properties/${tenantBPropertyId}`)).status()).toBe(404)
  })

  test('un editor puede editar los contenidos autorizados y nada más', async () => {
    await setPermissions('["cms:write"]')

    const created = await restricted.post('/api/admin/cms/articles', {
      data: { title: `Artículo RBAC ${RUN}`, slug: `articulo-rbac-${RUN}`, status: 'draft' },
    })
    expect(created.ok(), `el editor no pudo crear un artículo: ${created.status()} ${await created.text()}`).toBeTruthy()
    const articleId = (await created.json()).id

    expect((await restricted.get(`/api/admin/cms/articles/${articleId}`)).status()).toBe(200)
    expect((await restricted.put(`/api/admin/cms/articles/${articleId}`, { data: { title: `Artículo RBAC ${RUN} (editado)` } })).status()).toBe(200)
    expect((await restricted.delete(`/api/admin/cms/articles/${articleId}`)).status()).toBe(200)

    // Fuera de su área, nada.
    expect((await restricted.get('/api/admin/saas/leads')).status()).toBe(403)
    expect((await restricted.get('/api/admin/saas/invoices')).status()).toBe(403)
    expect((await restricted.get('/api/admin/users')).status()).toBe(403)
  })

  test('un permiso de sólo lectura deja ver pero no escribir, ni siquiera subir archivos', async () => {
    await setPermissions('["cms:read"]')
    expect((await restricted.get('/api/admin/cms/articles')).status()).toBe(200)
    expect((await restricted.post('/api/admin/cms/articles', { data: { title: `no-${RUN}` } })).status()).toBe(403)
    // /api/admin/upload no sabe a qué área pertenece el archivo, así que
    // exige permiso de escritura en alguna: sólo lectura no basta.
    expect((await restricted.post('/api/admin/upload')).status()).toBe(403)
  })

  test('una lista de permisos vacía deniega por defecto — ya no significa "acceso total"', async () => {
    await setPermissions('[]')
    for (const path of ['/api/admin/saas/leads', '/api/admin/cms/articles', '/api/admin/users', '/api/admin/stats', '/api/admin/saas/overview']) {
      expect((await restricted.get(path)).status(), path).toBe(403)
    }
    // El armazón del panel sigue respondiendo: si no, la cuenta no podría ni
    // ver la pantalla que le explica que no tiene permisos.
    expect((await restricted.get('/api/admin/resources')).status()).toBe(200)
    expect((await restricted.get('/api/admin/active-org-info')).status()).toBe(200)
  })

  test('la API rechaza guardar una configuración de permisos inválida', async () => {
    for (const bad of ['no es json', '{"crm":"read"}', '["crm:borrar"]', '["area-inventada:read"]']) {
      const res = await owner.put(`/api/admin/users/${restrictedUserId}`, {
        data: { name: 'RBAC fixture', email: RESTRICTED.email, role: 'admin', permissions: bad },
      })
      expect(res.status(), `permissions=${bad}`).toBe(422)
    }
    // Y la fila anterior sigue intacta: un intento rechazado no deja al admin
    // a medias entre dos configuraciones.
    const row = await owner.get(`/api/admin/users/${restrictedUserId}`)
    expect((await row.json()).row.permissions).toBe('[]')
  })

  test('el super_admin no se ve afectado por ninguna restricción', async () => {
    await setPermissions('[]')
    for (const path of ['/api/admin/saas/apikeys', '/api/admin/users', '/api/admin/saas/gdpr/requests']) {
      expect((await owner.get(path)).status(), path).toBe(200)
    }
    await setPermissions(null)
  })
})
