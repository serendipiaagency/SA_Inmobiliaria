import { readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { actionForMethod, isAdminApiPath, resolveAdminRouteAccess } from '../../server/utils/adminRouteMatrix'
import { ADMIN_AREAS } from '../../server/utils/permissions'
import { adminResources } from '../../server/utils/adminResources'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ADMIN_API_DIR = join(ROOT, 'server', 'api', 'admin')

/** Sample values for Nitro's dynamic segments, so a file path becomes a real request path. */
const SEGMENT_SAMPLES: Record<string, string> = {
  '[resource]': 'properties',
  '[id]': '123',
  '[pageKey]': 'home',
  '[uploadId]': 'up_123',
  '[versionId]': '7',
  '[timeOffId]': '9',
  '[key]': 'instagram',
}

interface AdminRoute {
  /** e.g. /api/admin/saas/apikeys */
  path: string
  /** e.g. POST */
  method: string
  /** the source file, for failure messages */
  file: string
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (entry.endsWith('.ts')) out.push(full)
  }
  return out
}

/** Turns server/api/admin/saas/apikeys/[id].patch.ts into PATCH /api/admin/saas/apikeys/123. */
function toRoute(file: string): AdminRoute {
  const rel = relative(ADMIN_API_DIR, file).replace(/\\/g, '/').replace(/\.ts$/, '')
  const segments = rel.split('/')
  const last = segments.pop() as string
  const dotIndex = last.lastIndexOf('.')
  const name = dotIndex === -1 ? last : last.slice(0, dotIndex)
  const method = (dotIndex === -1 ? 'get' : last.slice(dotIndex + 1)).toUpperCase()
  if (name !== 'index') segments.push(name)
  const resolved = segments.map((s) => SEGMENT_SAMPLES[s] ?? s)
  return { path: `/api/admin/${resolved.join('/')}`.replace(/\/$/, ''), method, file: relative(ROOT, file) }
}

const ROUTES = walk(ADMIN_API_DIR).map(toRoute)

describe('admin route inventory', () => {
  it('finds every admin endpoint on disk', () => {
    // Guards the guard: if this ever drops to a handful, the walk broke and
    // the coverage assertion below would pass vacuously.
    expect(ROUTES.length).toBeGreaterThan(140)
  })

  it('every admin endpoint resolves to an explicit access rule', () => {
    const unclassified = ROUTES.filter((r) => resolveAdminRouteAccess(r.path, r.method) == null)
    expect(
      unclassified.map((r) => `${r.method} ${r.path}  (${r.file})`),
      'estas rutas admin no tienen entrada en server/utils/adminRouteMatrix.ts y por tanto se deniegan a cualquier admin restringido',
    ).toEqual([])
  })

  it('every resolved area is a real admin area', () => {
    const valid = new Set(ADMIN_AREAS.map((a) => a.key))
    for (const route of ROUTES) {
      const access = resolveAdminRouteAccess(route.path, route.method)
      if (access?.kind !== 'area') continue
      expect(valid.has(access.area), `${route.file} → área desconocida "${access.area}"`).toBe(true)
    }
  })
})

describe('actionForMethod', () => {
  it('treats only GET/HEAD as reads', () => {
    expect(actionForMethod('GET')).toBe('read')
    expect(actionForMethod('head')).toBe('read')
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) expect(actionForMethod(m)).toBe('write')
  })
})

describe('isAdminApiPath', () => {
  it('matches admin API paths only', () => {
    expect(isAdminApiPath('/api/admin/saas/leads')).toBe(true)
    expect(isAdminApiPath('/api/admin/stats?from=2026-01-01')).toBe(true)
    expect(isAdminApiPath('/api/public/properties')).toBe(false)
    expect(isAdminApiPath('/api/auth/login')).toBe(false)
    expect(isAdminApiPath('/api/media/foo/bar.jpg')).toBe(false)
    // Not a prefix match on the string "admin" — a public route that merely
    // starts with the same letters must not be swept in.
    expect(isAdminApiPath('/api/administrative-thing')).toBe(false)
  })
})

describe('resolveAdminRouteAccess', () => {
  const cases: [string, string, string, string][] = [
    // path, method, expected area, expected action
    ['/api/admin/saas/apikeys', 'POST', 'finance', 'write'],
    ['/api/admin/saas/apikeys', 'GET', 'finance', 'read'],
    ['/api/admin/saas/apikeys/12', 'PATCH', 'finance', 'write'],
    ['/api/admin/saas/gdpr/export', 'POST', 'system', 'write'],
    ['/api/admin/saas/gdpr/delete', 'POST', 'system', 'write'],
    ['/api/admin/saas/gdpr/requests', 'GET', 'system', 'read'],
    ['/api/admin/saas/leads', 'GET', 'crm', 'read'],
    ['/api/admin/saas/leads/4', 'PATCH', 'crm', 'write'],
    ['/api/admin/saas/visits/4', 'PATCH', 'crm', 'write'],
    ['/api/admin/saas/contracts', 'POST', 'finance', 'write'],
    ['/api/admin/saas/webhooks/3', 'DELETE', 'system', 'write'],
    ['/api/admin/saas/settings', 'POST', 'system', 'write'],
    ['/api/admin/saas/email-log', 'GET', 'system', 'read'],
    ['/api/admin/saas/email-health', 'GET', 'system', 'read'],
    ['/api/admin/saas/agents/2/availability', 'PUT', 'content', 'write'],
    ['/api/admin/cms/articles/5', 'PUT', 'cms', 'write'],
    ['/api/admin/cms/media', 'POST', 'cms', 'write'],
    ['/api/admin/cms/ai', 'POST', 'cms', 'write'],
    ['/api/admin/site-pages/home', 'PUT', 'web', 'write'],
    ['/api/admin/scheduler/create', 'POST', 'web', 'write'],
    ['/api/admin/asset-export/batches', 'POST', 'web', 'write'],
    ['/api/admin/geocode', 'GET', 'web', 'read'],
    ['/api/admin/ai/generate', 'POST', 'finance', 'write'],
    ['/api/admin/stats', 'GET', 'general', 'read'],
    ['/api/admin/saas/overview', 'GET', 'general', 'read'],
    // Generic resource engine — area comes from adminResources, not a rule.
    ['/api/admin/users', 'GET', 'system', 'read'],
    ['/api/admin/users/3', 'PUT', 'system', 'write'],
    ['/api/admin/properties', 'POST', 'web', 'write'],
    ['/api/admin/blogs/2', 'DELETE', 'content', 'write'],
    ['/api/admin/cms-categories', 'GET', 'cms', 'read'],
    ['/api/admin/contact-messages', 'GET', 'inbox', 'read'],
  ]

  it.each(cases)('%s %s → %s:%s', (path, method, expectedArea, expectedAction) => {
    const access = resolveAdminRouteAccess(path, method)
    expect(access).toEqual({ kind: 'area', area: expectedArea, action: expectedAction })
  })

  it('marks the panel-shell metadata endpoints as area-agnostic', () => {
    expect(resolveAdminRouteAccess('/api/admin/resources', 'GET')).toEqual({ kind: 'admin-metadata' })
    expect(resolveAdminRouteAccess('/api/admin/active-org-info', 'GET')).toEqual({ kind: 'admin-metadata' })
  })

  it('marks the org switcher as super_admin only', () => {
    expect(resolveAdminRouteAccess('/api/admin/active-org', 'POST')).toEqual({ kind: 'super-admin' })
  })

  it('marks the platform status page as super_admin only', () => {
    // Dice qué secretos faltan en la plataforma entera: es configuración de
    // operación, no datos de negocio de ningún inquilino.
    expect(resolveAdminRouteAccess('/api/admin/system-status', 'GET')).toEqual({ kind: 'super-admin' })
  })

  it('marks the shared upload endpoints as any-write', () => {
    expect(resolveAdminRouteAccess('/api/admin/upload', 'POST')).toEqual({ kind: 'any-write' })
    expect(resolveAdminRouteAccess('/api/admin/upload/multipart/init', 'POST')).toEqual({ kind: 'any-write' })
  })

  it('keeps notification acknowledgement at read level, and the rest of the scheduler at write', () => {
    expect(resolveAdminRouteAccess('/api/admin/scheduler/notifications', 'GET')).toEqual({ kind: 'area', area: 'web', action: 'read' })
    expect(resolveAdminRouteAccess('/api/admin/scheduler/notifications/read', 'POST')).toEqual({ kind: 'area', area: 'web', action: 'read' })
    expect(resolveAdminRouteAccess('/api/admin/scheduler/pause', 'POST')).toEqual({ kind: 'area', area: 'web', action: 'write' })
  })

  it('returns null for a non-admin path and for an unknown admin path', () => {
    expect(resolveAdminRouteAccess('/api/public/properties', 'GET')).toBeNull()
    // Unknown resource key: fails closed in the middleware rather than being
    // waved through as "not an admin route".
    expect(resolveAdminRouteAccess('/api/admin/not-a-real-thing', 'GET')).toBeNull()
    expect(isAdminApiPath('/api/admin/not-a-real-thing')).toBe(true)
  })

  it('covers every generic resource declared in adminResources', () => {
    for (const key of Object.keys(adminResources)) {
      const access = resolveAdminRouteAccess(`/api/admin/${key}`, 'GET')
      expect(access, `resource "${key}" no resuelve a ninguna regla`).not.toBeNull()
    }
  })
})
