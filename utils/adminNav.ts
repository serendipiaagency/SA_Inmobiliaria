import type { AdminArea } from './adminAreas'

/**
 * The admin panel's navigation, and the one place that says which permission
 * area each admin page belongs to.
 *
 * It lives in root `utils/` rather than inside layouts/admin.vue because two
 * different consumers need the same answer and must not drift apart
 * (bloque 01, "alinea menú, botones y API"):
 *
 *  - layouts/admin.vue renders it, hiding the groups the account can't read.
 *  - middleware/admin.ts refuses to *navigate* to a page whose area the
 *    account can't read, so a restricted admin who types the URL by hand
 *    lands somewhere they're allowed instead of on a shell full of 403s.
 *
 * The server-side counterpart is server/utils/adminRouteMatrix.ts, which maps
 * the API endpoints those pages call. Both read their area names from
 * utils/adminAreas.ts.
 */

export interface NavItem {
  label: string
  to: string
  icon: string
  /**
   * Área de permisos de ESTA entrada cuando no es la de su grupo. Al
   * reorganizar el menú (categorías desplegables, oct-2026) varias entradas
   * cambiaron de categoría, pero no de permiso: «API» sigue siendo de
   * Finanzas & Growth aunque ahora se vea en Sistema, porque eso es lo que
   * protege su API en el servidor (server/utils/adminRouteMatrix.ts). Mover
   * una entrada de sitio nunca debe cambiar quién puede abrirla.
   */
  area?: AdminArea
  /** Not set by any item today — the template already supports it for a future per-item counter/notice. */
  badge?: string
  /** Not set by any item today — the template already supports it for a future "beta"/"nuevo" style label. */
  tag?: string
  /** Platform-owner pages: hidden from, and never navigable by, an org admin. */
  superAdminOnly?: boolean
}

export interface NavGroup {
  /** Identificador estable: lo usan el estado abierto/cerrado guardado y los data-testid. */
  id: string
  label: string
  items: NavItem[]
  /** Permissions area (utils/adminAreas.ts) of the group's entries, unless an entry sets its own. Omit only for "Ayuda", which stays visible to everyone. */
  area?: AdminArea
  /** Abierta al entrar aunque no contenga la página actual (sólo «General», con el Dashboard). */
  defaultOpen?: boolean
}

/**
 * El menú lateral: categorías desplegables con sus entradas ordenadas por
 * flujo de trabajo. Reorganizado en oct-2026 sin quitar ninguna entrada ni
 * ninguna ruta — la prueba de inventario (test/unit/adminNav.test.ts) lo
 * comprueba entrada a entrada. Lo que cambió de categoría:
 *  - «Comerciales» (Portal Web → CRM): es la ficha profesional del comercial
 *    (datos laborales, propiedades asignadas, rendimiento), junto a Oficinas
 *    y Equipos; el perfil público es sólo una parte.
 *  - «Widgets» (Finanzas & Growth → Portal Web): fragmentos de la web para
 *    insertar en otras webs.
 *  - «API» y «Marketplace» (Finanzas & Growth → Sistema): integraciones.
 *  - «Blog (legacy)» (Contenido → Blog & CMS): todo el blog en una categoría.
 *    «Contenido» se queda sin entradas y deja de pintarse como categoría,
 *    pero su área de permisos sigue existiendo.
 * Cada una conserva su área de permisos (`area`).
 */
export const ADMIN_NAV: NavGroup[] = [
  {
    id: 'general',
    label: 'General',
    area: 'general',
    defaultOpen: true,
    items: [
      { label: 'Dashboard', to: '/admin', icon: 'grid' },
      { label: 'Analytics', to: '/admin/analytics', icon: 'chart' },
    ],
  },
  {
    id: 'crm',
    label: 'CRM',
    area: 'crm',
    items: [
      // Ciclo comercial: lead → contacto → compatibilidades → visita → oferta → operación.
      { label: 'Leads', to: '/admin/leads', icon: 'contact' },
      { label: 'Contactos', to: '/admin/contactos', icon: 'users' },
      { label: 'Clientes', to: '/admin/clientes', icon: 'users' },
      { label: 'Compatibilidades', to: '/admin/compatibilidades', icon: 'sparkles' },
      { label: 'Visitas', to: '/admin/visitas', icon: 'calendar' },
      { label: 'Reservas', to: '/admin/reservas', icon: 'bookmark' },
      { label: 'Analítica de citas', to: '/admin/citas-analytics', icon: 'chart' },
      { label: 'Tareas', to: '/admin/tareas', icon: 'checklist' },
      // Bloque N6 (FASES 23-24): las ofertas de toda la agencia y el pipeline
      // de operaciones (Kanban por etapas). Área CRM, como su API.
      { label: 'Ofertas', to: '/admin/ofertas', icon: 'badge' },
      { label: 'Operaciones', to: '/admin/deal-operations', icon: 'layers' },
      { label: 'Comunicaciones', to: '/admin/comunicaciones', icon: 'chat' },
      { label: 'Referidos', to: '/admin/referidos', icon: 'sparkles' },
      { label: 'Rendimiento', to: '/admin/rendimiento', icon: 'chart' },
      // INMO y las automatizaciones trabajan sobre los datos del CRM.
      { label: 'INMO', to: '/admin/inmo', icon: 'chat' },
      // Bloque N8b: base de conocimiento, memoria y cerebros de INMO.
      { label: 'INMO: conocimiento', to: '/admin/inmo-ajustes', icon: 'doc' },
      // Bloque N8b: automatizaciones reales sobre eventos de CRM (antes, una
      // demo en Finanzas que no ejecutaba nada).
      { label: 'Automatizaciones', to: '/admin/automatizaciones', icon: 'bolt' },
      // Configuración del CRM y del equipo comercial.
      { label: 'Enrutamiento y SLA', to: '/admin/enrutamiento', icon: 'bolt' },
      // Bloque N7b (FASE 0): los campos extra de propiedades, contactos, leads,
      // citas y operaciones de la agencia. Área CRM, como su recurso.
      { label: 'Campos personalizados', to: '/admin/campos-personalizados', icon: 'layers' },
      // Antes en Portal Web; su permiso sigue siendo el de Portal Web.
      { label: 'Comerciales', to: '/admin/comerciales', icon: 'badge', area: 'web' },
      { label: 'Oficinas', to: '/admin/offices', icon: 'building' },
      { label: 'Equipos', to: '/admin/teams', icon: 'team' },
    ],
  },
  {
    id: 'web',
    label: 'Portal Web',
    area: 'web',
    items: [
      { label: 'Propiedades (web)', to: '/admin/developer-properties', icon: 'building' },
      { label: 'Propiedades 2ª mano', to: '/admin/properties', icon: 'layers' },
      { label: 'Constructor Web', to: '/admin/site-builder', icon: 'widget' },
      { label: 'Suscriptores', to: '/admin/suscriptores', icon: 'mail' },
      { label: 'Comunidades', to: '/admin/communities', icon: 'store' },
      { label: 'Publicación multicanal', to: '/admin/scheduler', icon: 'bolt' },
      // Antes en Finanzas & Growth; su permiso sigue siendo el de Finanzas & Growth.
      { label: 'Widgets', to: '/admin/widgets', icon: 'widget', area: 'finance' },
      { label: 'Brand Kit', to: '/admin/asset-export/brand-kit', icon: 'sparkles' },
      { label: 'Plantillas de Export', to: '/admin/asset-export/templates', icon: 'layers' },
      { label: 'Piezas generadas', to: '/admin/asset-export/projects', icon: 'doc' },
      { label: 'Catálogos combinados', to: '/admin/asset-export/catalogs', icon: 'doc' },
      { label: 'Exportación masiva', to: '/admin/asset-export/batches', icon: 'bolt' },
    ],
  },
  {
    id: 'finance',
    label: 'Finanzas & Growth',
    area: 'finance',
    items: [
      { label: 'Facturación', to: '/admin/facturacion', icon: 'invoice' },
      // La pantalla antigua (tabla legacy `deals`: cierres ya hechos y su
      // comisión). Mantiene su URL para no romper enlaces; «Operaciones» en
      // CRM es ahora el pipeline completo (/admin/deal-operations).
      { label: 'Cierres y comisiones', to: '/admin/operaciones', icon: 'invoice' },
      { label: 'Ingresos', to: '/admin/ingresos', icon: 'chart' },
      { label: 'Contratos', to: '/admin/contratos', icon: 'doc' },
      { label: 'Depósitos', to: '/admin/depositos', icon: 'key' },
      { label: 'Tasador (AVM)', to: '/admin/tasador', icon: 'badge' },
      { label: 'AI Studio', to: '/admin/ai', icon: 'sparkles' },
    ],
  },
  {
    id: 'cms',
    label: 'Blog & CMS',
    area: 'cms',
    items: [
      { label: 'Dashboard', to: '/admin/cms', icon: 'sparkles' },
      { label: 'Artículos', to: '/admin/cms/articles', icon: 'doc' },
      { label: 'Categorías', to: '/admin/cms-categories', icon: 'layers' },
      { label: 'Etiquetas', to: '/admin/cms-tags', icon: 'badge' },
      { label: 'Autores', to: '/admin/cms-authors', icon: 'team' },
      { label: 'Media Library', to: '/admin/cms/media', icon: 'widget' },
      { label: 'Comentarios', to: '/admin/cms-comments', icon: 'contact' },
      { label: 'Redirecciones', to: '/admin/cms-redirects', icon: 'code' },
      { label: 'Papelera', to: '/admin/cms/papelera', icon: 'inbox' },
      { label: 'Config. Blog', to: '/admin/cms/configuracion', icon: 'settings' },
      // Antes en «Contenido»; su permiso sigue siendo el de Contenido.
      // ("Equipo" también vivía en Contenido y editaba el horario de las
      // mismas personas que "Comerciales"; el horario es ahora una subruta de
      // la ficha del comercial, /admin/comerciales/:id/horario.)
      { label: 'Blog (legacy)', to: '/admin/blogs', icon: 'doc', area: 'content' },
    ],
  },
  {
    id: 'inbox',
    label: 'Bandeja',
    area: 'inbox',
    items: [
      { label: 'Solicitudes', to: '/admin/visitor-submissions', icon: 'inbox' },
      { label: 'Proveedores', to: '/admin/vendor-registrations', icon: 'inbox' },
      { label: 'Mensajes', to: '/admin/contact-messages', icon: 'contact' },
    ],
  },
  {
    id: 'help',
    label: 'Ayuda',
    items: [{ label: 'Ayuda y documentación', to: '/admin/ayuda', icon: 'help' }],
  },
  {
    id: 'system',
    label: 'Sistema',
    area: 'system',
    items: [
      { label: 'Empresas', to: '/admin/organizations', icon: 'store', superAdminOnly: true },
      { label: 'Usuarios', to: '/admin/users', icon: 'key' },
      { label: 'Configuración', to: '/admin/configuracion', icon: 'settings' },
      { label: 'Emails', to: '/admin/emails', icon: 'mail' },
      { label: 'Webhooks', to: '/admin/webhooks', icon: 'code' },
      // Antes en Finanzas & Growth; su permiso sigue siendo el de Finanzas & Growth.
      { label: 'API', to: '/admin/api', icon: 'code', area: 'finance' },
      { label: 'Marketplace', to: '/admin/marketplace', icon: 'store', area: 'finance' },
      { label: 'Privacidad (RGPD)', to: '/admin/privacidad', icon: 'alert' },
      // Org-scoped: shows this org's own team activity (server/utils/audit.ts).
      { label: 'Auditoría', to: '/admin/audit-log', icon: 'doc' },
      // Platform-wide incident log (server/plugins/error-logging.ts) — ops
      // concern for the whole platform, not a tenant's business data, so it's
      // super_admin-only like "Empresas" above.
      { label: 'Errores', to: '/admin/error-logs', icon: 'alert', superAdminOnly: true },
      // Configuración de la plataforma entera (qué integraciones están vivas,
      // dormidas o mal configuradas) — misma razón que las dos de arriba.
      { label: 'Estado del sistema', to: '/admin/estado', icon: 'settings', superAdminOnly: true },
      // Quien pide una demo desde la landing de INMO (platform_demo_requests): de la plataforma, no de una empresa.
      { label: 'Solicitudes de demo', to: '/admin/solicitudes-demo', icon: 'mail', superAdminOnly: true },
    ],
  },
]

/** El área de permisos de una entrada: la suya, si la tiene, o la de su grupo. */
export function itemArea(group: NavGroup, item: NavItem): AdminArea | null {
  return item.area ?? group.area ?? null
}

function cleanAdminPath(path: string): string {
  return (path.split('?')[0].split('#')[0] || '/admin').replace(/\/+$/, '') || '/admin'
}

/**
 * La entrada del menú que se marca como activa para una URL: la de ruta más
 * larga que la contiene, así «Artículos» (/admin/cms/articles) gana a
 * «Dashboard» de Blog (/admin/cms) y sólo una entrada sale marcada (antes
 * salían las dos). El Dashboard general (/admin) sólo para /admin exacto.
 */
export function navMatchForPath(path: string, groups: NavGroup[] = ADMIN_NAV): { group: NavGroup; item: NavItem } | null {
  const clean = cleanAdminPath(path)
  let best: { group: NavGroup; item: NavItem } | null = null
  for (const group of groups) {
    for (const item of group.items) {
      const matches = item.to === '/admin' ? clean === '/admin' : clean === item.to || clean.startsWith(`${item.to}/`)
      if (matches && (!best || item.to.length > best.item.to.length)) best = { group, item }
    }
  }
  return best
}

/**
 * El menú que ve una cuenta: sin las entradas de super admin si no lo es, sin
 * las de un área que no puede leer, y sin las categorías que se quedan
 * vacías — nunca una cabecera «Sistema» sin nada debajo. `allowed` son las
 * áreas que puede leer (utils/permissions.ts `allowedAreas`).
 */
export function visibleAdminNav(groups: NavGroup[], opts: { isSuperAdmin: boolean; allowed: readonly AdminArea[] }): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.superAdminOnly && !opts.isSuperAdmin) return false
        const area = itemArea(group, item)
        return !area || opts.allowed.includes(area)
      }),
    }))
    .filter((group) => group.items.length > 0)
}

/**
 * The area that owns an admin page URL, or `null` when no nav entry claims it
 * — the generic `[resource]` pages for resources that have no menu entry
 * (floor-plans, amenities, …) are reachable only by deep link, and the server
 * matrix is what actually guards them. `null` therefore means "don't block
 * this navigation", never "this page is public".
 *
 * Matching is segment-aware and longest-first, so `/admin/api` never swallows
 * `/admin/apikeys` and `/admin/cms/articles` wins over `/admin/cms`.
 */
export function areaForAdminPath(path: string): AdminArea | null {
  const clean = (path.split('?')[0].split('#')[0] || '/admin').replace(/\/+$/, '') || '/admin'
  let best: { length: number; area: AdminArea | null } | null = null
  for (const group of ADMIN_NAV) {
    for (const item of group.items) {
      if (clean !== item.to && !clean.startsWith(`${item.to}/`)) continue
      // El área de la ENTRADA, no la de su categoría: mover una entrada de
      // categoría no cambia quién puede abrirla.
      if (!best || item.to.length > best.length) best = { length: item.to.length, area: itemArea(group, item) }
    }
  }
  return best ? best.area : null
}

/** True when the page is one of the platform-owner-only entries. */
export function isSuperAdminOnlyAdminPath(path: string): boolean {
  const clean = (path.split('?')[0].split('#')[0] || '/admin').replace(/\/+$/, '') || '/admin'
  return ADMIN_NAV.some((g) => g.items.some((i) => i.superAdminOnly && (clean === i.to || clean.startsWith(`${i.to}/`))))
}
