import { adminResources } from './adminResources'
import type { AdminArea, PermissionAction } from './permissions'

/**
 * Explicit server-side authorization matrix for `/api/admin/**` (bloque 01).
 *
 * Before this file, `requireOrgScope(event)` was called with no area on 147
 * of the 156 admin endpoints, so granular permissions only ever applied to
 * the nine routes of the generic resource engine. Every bespoke endpoint —
 * API keys, contracts, GDPR export, the CMS, the scheduler, the asset
 * exporter — was reachable by any admin of the organisation regardless of
 * what the permissions editor said, and the nav filtering in
 * layouts/admin.vue was the only thing standing in the way (i.e. nothing,
 * for a direct HTTP request).
 *
 * This matrix is the single, reviewable place where "which area owns this
 * endpoint" is decided, and server/middleware/01.admin-rbac.ts enforces it
 * ahead of every handler. Two properties make it trustworthy:
 *
 *  - **Complete.** test/unit/adminRouteMatrix.test.ts walks every file under
 *    server/api/admin/ and fails if any route resolves to no rule, so a new
 *    endpoint cannot be added without classifying it.
 *  - **Fail closed.** An admin route with no matching rule is denied for a
 *    restricted account rather than allowed. Unrestricted accounts (every
 *    account today) are unaffected either way.
 *
 * The areas mirror the nav groups in layouts/admin.vue, so "what the menu
 * shows" and "what the API allows" come from the same list
 * (utils/adminAreas.ts). Where an endpoint's owning page is not obvious from
 * its path, the comment names the page that consumes it.
 *
 * Deliberately NOT covered here: `/api/media/**`. It is the R2 serving
 * boundary shared by every area (a property photo, a CMS image and a signed
 * contract all come through it) and it already enforces per-object tenant
 * ownership plus an access log. Pinning it to an area would require an
 * area per stored object, which belongs with the materials work, not here.
 */

export type RouteAccess =
  /** Needs `area` at `action` level. */
  | { kind: 'area'; area: AdminArea; action: PermissionAction }
  /** Shared across every area — needs write access somewhere, not anywhere specific. */
  | { kind: 'any-write' }
  /** Platform owner only; the handler already enforces it, this just documents it. */
  | { kind: 'super-admin' }
  /** Panel metadata every admin needs to render anything at all. */
  | { kind: 'admin-metadata' }

type Rule = {
  /** Matched against the path with the `/api/admin/` prefix already stripped. */
  pattern: RegExp
  resolve: (action: PermissionAction) => RouteAccess
}

const area = (a: AdminArea): Rule['resolve'] => (action) => ({ kind: 'area', area: a, action })
const fixed = (a: AdminArea, action: PermissionAction): Rule['resolve'] => () => ({ kind: 'area', area: a, action })
const constant = (access: RouteAccess): Rule['resolve'] => () => access

/**
 * First match wins, so specific patterns come before general ones. Every
 * entry is anchored at the start of the stripped path; `(?:/|$)` is the
 * "this segment or anything under it" tail.
 */
const RULES: Rule[] = [
  // --- Panel metadata / org switcher -------------------------------------
  // Both are needed to render the shell itself (resource labels and field
  // definitions; the current organisation's name and logo), so gating them
  // behind an area would break the panel for every restricted admin before
  // they reach the page they *are* allowed to see. Neither returns tenant
  // business data.
  { pattern: /^resources$/, resolve: constant({ kind: 'admin-metadata' }) },
  { pattern: /^active-org-info$/, resolve: constant({ kind: 'admin-metadata' }) },
  { pattern: /^active-org$/, resolve: constant({ kind: 'super-admin' }) },
  // Configuración de la plataforma entera (qué secretos faltan, qué
  // integraciones están dormidas), no datos de ningún inquilino.
  { pattern: /^system-status$/, resolve: constant({ kind: 'super-admin' }) }, // pages/admin/estado.vue

  // --- General (Dashboard, Analytics) ------------------------------------
  { pattern: /^stats$/, resolve: area('general') },
  { pattern: /^saas\/overview$/, resolve: area('general') }, // pages/admin/index.vue
  { pattern: /^saas\/analytics$/, resolve: area('general') }, // pages/admin/analytics.vue

  // --- CRM ----------------------------------------------------------------
  { pattern: /^saas\/leads(?:\/|$)/, resolve: area('crm') },
  { pattern: /^saas\/clients(?:\/|$)/, resolve: area('crm') },
  // FASE 10: la persona (contacts) y su necesidad inmobiliaria
  // (buyer-requirements). Buscar duplicados es lectura aunque se invoque con
  // POST: sólo consulta candidatos dentro del propio tenant para que alguien
  // decida, no crea ni fusiona nada.
  { pattern: /^saas\/contacts\/check-duplicates$/, resolve: fixed('crm', 'read') },
  { pattern: /^saas\/contacts(?:\/|$)/, resolve: area('crm') },
  { pattern: /^saas\/buyer-requirements(?:\/|$)/, resolve: area('crm') },
  // FASE 11: el motor de matching. Consultar compatibilidades es lectura;
  // guardar la decisión comercial (seleccionar/descartar) y marcar las
  // características como revisadas son escrituras.
  { pattern: /^saas\/matching\/(?:requirement|property)\//, resolve: fixed('crm', 'read') },
  { pattern: /^saas\/matching(?:\/|$)/, resolve: area('crm') },
  { pattern: /^saas\/visits(?:\/|$)/, resolve: area('crm') },
  { pattern: /^saas\/reservations(?:\/|$)/, resolve: area('crm') },
  { pattern: /^saas\/appointments-analytics$/, resolve: area('crm') },
  { pattern: /^saas\/referrals(?:\/|$)/, resolve: area('crm') },
  { pattern: /^saas\/referral-links(?:\/|$)/, resolve: area('crm') },
  // Centro de Comunicaciones (pages/admin/comunicaciones.vue). Los números
  // conectados, sus credenciales y los ajustes son configuración de la
  // agencia → `system`, como Configuración; la bandeja, los hilos y las
  // llamadas son trabajo de CRM. Marcar un hilo como leído y el sondeo de
  // cambios no modifican datos de negocio: quedan a nivel de lectura.
  { pattern: /^comms\/channels(?:\/|$)/, resolve: area('system') },
  { pattern: /^comms\/settings(?:\/|$)/, resolve: area('system') },
  { pattern: /^comms\/templates\/\d+$/, resolve: area('system') }, // borrar una plantilla
  { pattern: /^comms\/templates$/, resolve: (action) => (action === 'read' ? { kind: 'area', area: 'crm', action: 'read' } : { kind: 'area', area: 'system', action: 'write' }) },
  { pattern: /^comms\/updates$/, resolve: fixed('crm', 'read') },
  { pattern: /^comms\/conversations\/\d+\/read$/, resolve: fixed('crm', 'read') },
  { pattern: /^comms(?:\/|$)/, resolve: area('crm') },

  // --- Portal Web ---------------------------------------------------------
  { pattern: /^geocode$/, resolve: area('web') }, // components/property-builder/LocationSection.vue
  { pattern: /^site-pages(?:\/|$)/, resolve: area('web') }, // Constructor Web
  // Disponibilidad y bloqueos de un comercial (`team_members`). A pesar del
  // path `saas/agents`, respaldan pages/admin/comerciales/[id]/horario.vue.
  //
  // Estaban en `content` porque el horario vivía en un módulo aparte llamado
  // "Equipo", en esa sección del menú. Al pasar el horario a ser una pantalla
  // de la ficha del comercial (RE05), el área tiene que seguirle: si no, una
  // cuenta con `web` abriría la pantalla y recibiría 403 en cada llamada, y
  // una cuenta con `content` conservaría acceso a una pantalla que ya no
  // aparece en su menú. **Esto cambia quién puede editar horarios**: pasa de
  // `content` a `web`, la misma área que ya gobierna Comerciales.
  { pattern: /^saas\/agents(?:\/|$)/, resolve: area('web') },
  // Marking a publication notification as read acknowledges something the
  // caller is already allowed to see; it changes no business data, so it
  // stays at read level (the bell itself is hidden without web:read).
  { pattern: /^scheduler\/notifications(?:\/|$)/, resolve: fixed('web', 'read') },
  { pattern: /^scheduler(?:\/|$)/, resolve: area('web') }, // Publicación multicanal
  { pattern: /^asset-export(?:\/|$)/, resolve: area('web') }, // Brand Kit, plantillas, piezas, catálogos

  // --- Finanzas & Growth --------------------------------------------------
  { pattern: /^saas\/invoices(?:\/|$)/, resolve: area('finance') },
  { pattern: /^saas\/deals-revenue$/, resolve: area('finance') }, // pages/admin/ingresos.vue
  { pattern: /^saas\/deals(?:\/|$)/, resolve: area('finance') }, // pages/admin/operaciones.vue
  { pattern: /^saas\/contract-templates(?:\/|$)/, resolve: area('finance') },
  { pattern: /^saas\/contracts(?:\/|$)/, resolve: area('finance') },
  { pattern: /^saas\/deposits(?:\/|$)/, resolve: area('finance') },
  { pattern: /^saas\/stripe-events$/, resolve: area('finance') }, // pages/admin/depositos.vue
  { pattern: /^saas\/valuations(?:\/|$)/, resolve: area('finance') }, // Tasador (AVM)
  { pattern: /^saas\/automations(?:\/|$)/, resolve: area('finance') },
  { pattern: /^saas\/apikeys(?:\/|$)/, resolve: area('finance') }, // pages/admin/api.vue
  { pattern: /^ai\/generate$/, resolve: area('finance') }, // AI Studio

  // --- Blog & CMS ---------------------------------------------------------
  // Only the `cms/` directory: the generic resources `cms-categories`,
  // `cms-tags`, … do not match this and fall through to the resource lookup
  // below, which already tags them as `cms`.
  { pattern: /^cms(?:\/|$)/, resolve: area('cms') },

  // --- Sistema ------------------------------------------------------------
  { pattern: /^saas\/settings(?:\/|$)/, resolve: area('system') }, // pages/admin/configuracion.vue
  { pattern: /^saas\/email-log$/, resolve: area('system') }, // pages/admin/emails.vue
  { pattern: /^saas\/email-health$/, resolve: area('system') }, // estado del canal de email, misma pantalla
  { pattern: /^saas\/webhooks(?:\/|$)/, resolve: area('system') },
  { pattern: /^saas\/gdpr(?:\/|$)/, resolve: area('system') }, // Privacidad (RGPD): export + delete

  // --- Subidas compartidas ------------------------------------------------
  // One upload endpoint serves the property builder (web), the CMS (cms),
  // the site builder (web), the asset exporter (web) and the generic
  // resource forms (any area), and nothing in the request says which. It
  // therefore requires write access *somewhere* — enough to stop a
  // read-only account from pushing objects into the org's R2 bucket, while
  // staying honest about what the endpoint can actually distinguish.
  { pattern: /^upload(?:\/|$)/, resolve: constant({ kind: 'any-write' }) },
]

/** Default action for a method: only GET/HEAD are reads. */
export function actionForMethod(method: string): PermissionAction {
  const m = method.toUpperCase()
  return m === 'GET' || m === 'HEAD' ? 'read' : 'write'
}

/**
 * Resolves the access a request to `path` with `method` requires. Returns
 * `null` both for a path that isn't an admin route at all and for an admin
 * route no rule claims — the middleware tells them apart with
 * `isAdminApiPath`, and denies only the second.
 */
export function resolveAdminRouteAccess(path: string, method: string): RouteAccess | null {
  const stripped = stripAdminPrefix(path)
  if (stripped == null) return null
  const action = actionForMethod(method)

  for (const rule of RULES) {
    if (rule.pattern.test(stripped)) return rule.resolve(action)
  }

  // Generic resource engine (server/api/admin/[resource]/**): the area is
  // already declared once per resource in adminResources.ts — read it from
  // there instead of restating 31 more rules that could drift out of sync.
  const key = stripped.split('/')[0]
  const def = adminResources[key as keyof typeof adminResources]
  if (def) return { kind: 'area', area: def.area, action }

  return null
}

/** True for any path served by server/api/admin/**. */
export function isAdminApiPath(path: string): boolean {
  return stripAdminPrefix(path) != null
}

function stripAdminPrefix(path: string): string | null {
  const clean = path.split('?')[0].replace(/\/+$/, '')
  if (clean === '/api/admin') return ''
  if (!clean.startsWith('/api/admin/')) return null
  return clean.slice('/api/admin/'.length)
}
