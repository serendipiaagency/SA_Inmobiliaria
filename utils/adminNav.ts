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
  /**
   * Otras rutas que esta entrada «posee» además de `to`: se marcan activas con
   * ella y heredan su área de permisos, aunque no sean su prefijo. Lo usa
   * «Gestión de contactos» (Cola 15), que unifica tres secciones del CRM
   * —Leads, Contactos y Clientes— en una sola entrada: las tres rutas siguen
   * existiendo y protegidas como `crm`, pero el menú enseña una entrada.
   */
  match?: string[]
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
  // Reorganización Cola 16 (oct-2026, aprobada por el propietario): siete
  // categorías por tarea del día a día —«Dashboard operativo», «Mi negocio»,
  // «Chatbot», «Comunicación y mensajes», «Web y contenido», «Sistema» y
  // «Ayuda»—. Es un cambio SÓLO de presentación: cada entrada conserva su
  // ruta, su etiqueta y su ÁREA de permisos. Al mover una entrada a una
  // categoría de otra área, lleva su `area` propia explícita para no cambiar
  // quién la abre (lo comprueba test/unit/adminNav.test.ts). Se reutilizan los
  // id 'general', 'crm', 'web', 'system' y 'help' (y así el menú no pierde su
  // estado abierto/cerrado guardado) aunque cambie su etiqueta; 'chatbot' y
  // 'comunicacion' son nuevos.
  {
    id: 'general',
    label: 'Dashboard operativo',
    area: 'general',
    defaultOpen: true,
    items: [
      { label: 'Dashboard', to: '/admin', icon: 'grid' },
      { label: 'Analytics', to: '/admin/analytics', icon: 'chart' },
    ],
  },
  {
    // «Mi negocio»: todo el ciclo comercial (CRM) y las finanzas, juntos. El id
    // sigue siendo 'crm' (era la categoría CRM) para no perder su estado del menú.
    id: 'crm',
    label: 'Mi negocio',
    area: 'crm',
    items: [
      // Ciclo comercial: lead → contacto → compatibilidades → visita → oferta → operación.
      // «Gestión de contactos» (Cola 15) unifica Leads, Contactos y Clientes en
      // una entrada con pestañas; `match` mantiene las tres rutas como área crm.
      { label: 'Gestión de contactos', to: '/admin/contactos', icon: 'users', match: ['/admin/leads', '/admin/clientes'] },
      { label: 'Compatibilidades', to: '/admin/compatibilidades', icon: 'sparkles' },
      { label: 'Visitas', to: '/admin/visitas', icon: 'calendar' },
      { label: 'Reservas', to: '/admin/reservas', icon: 'bookmark' },
      { label: 'Analítica de citas', to: '/admin/citas-analytics', icon: 'chart' },
      { label: 'Tareas', to: '/admin/tareas', icon: 'checklist' },
      { label: 'Ofertas', to: '/admin/ofertas', icon: 'badge' },
      { label: 'Operaciones', to: '/admin/deal-operations', icon: 'layers' },
      { label: 'Referidos', to: '/admin/referidos', icon: 'sparkles' },
      { label: 'Rendimiento', to: '/admin/rendimiento', icon: 'chart' },
      { label: 'Automatizaciones', to: '/admin/automatizaciones', icon: 'bolt' },
      { label: 'Enrutamiento y SLA', to: '/admin/enrutamiento', icon: 'bolt' },
      { label: 'Campos personalizados', to: '/admin/campos-personalizados', icon: 'layers' },
      // Su permiso es el de Portal Web, no el de la categoría.
      { label: 'Comerciales', to: '/admin/comerciales', icon: 'badge', area: 'web' },
      { label: 'Oficinas', to: '/admin/offices', icon: 'building' },
      { label: 'Equipos', to: '/admin/teams', icon: 'team' },
      // Finanzas & Growth, ahora dentro de «Mi negocio». Cada una conserva su
      // permiso de Finanzas (`area: 'finance'`), distinto del de la categoría.
      { label: 'Facturación', to: '/admin/facturacion', icon: 'invoice', area: 'finance' },
      // La pantalla antigua (tabla legacy `deals`). «Operaciones» (arriba) es el
      // pipeline completo (/admin/deal-operations); ésta mantiene su URL.
      { label: 'Cierres y comisiones', to: '/admin/operaciones', icon: 'invoice', area: 'finance' },
      { label: 'Ingresos', to: '/admin/ingresos', icon: 'chart', area: 'finance' },
      { label: 'Contratos', to: '/admin/contratos', icon: 'doc', area: 'finance' },
      { label: 'Depósitos', to: '/admin/depositos', icon: 'key', area: 'finance' },
      { label: 'Tasador (AVM)', to: '/admin/tasador', icon: 'badge', area: 'finance' },
      { label: 'AI Studio', to: '/admin/ai', icon: 'sparkles', area: 'finance' },
    ],
  },
  {
    // «Chatbot»: el asistente interno INMO y el chat de la web pública.
    id: 'chatbot',
    label: 'Chatbot',
    area: 'crm',
    items: [
      // INMO: el asistente interno del equipo (trabaja sobre los datos del CRM).
      { label: 'INMO', to: '/admin/inmo', icon: 'chat' },
      // Base de conocimiento, memoria y cerebros de INMO.
      { label: 'INMO: conocimiento', to: '/admin/inmo-ajustes', icon: 'doc' },
      // El chat de cara al visitante se activa y se ajusta en la configuración
      // de Comunicaciones (apartado «chat de la web»); misma área (crm).
      { label: 'Chat de la web', to: '/admin/comunicaciones/configuracion', icon: 'chat' },
    ],
  },
  {
    // «Comunicación y mensajes»: todo lo de hablar con la gente. El área de la
    // categoría es inbox; las entradas de otra área llevan la suya propia.
    id: 'comunicacion',
    label: 'Comunicación y mensajes',
    area: 'inbox',
    items: [
      // Centro de comunicaciones (WhatsApp/voz); su permiso es crm.
      { label: 'Comunicaciones', to: '/admin/comunicaciones', icon: 'chat', area: 'crm' },
      { label: 'Mensajes', to: '/admin/contact-messages', icon: 'contact' },
      { label: 'Solicitudes', to: '/admin/visitor-submissions', icon: 'inbox' },
      { label: 'Proveedores', to: '/admin/vendor-registrations', icon: 'inbox' },
      // Emails de la plataforma; su permiso sigue siendo Sistema.
      { label: 'Emails', to: '/admin/emails', icon: 'mail', area: 'system' },
      // La lista del «Suscríbete» del pie de la web; su permiso sigue siendo Portal Web.
      { label: 'Suscriptores', to: '/admin/suscriptores', icon: 'mail', area: 'web' },
      // Newsletter (Cola 17): redactar campañas y plantillas con el editor de
      // bloques y exportarlas para enviar. Mismos suscriptores y marca → Portal Web.
      { label: 'Newsletter', to: '/admin/newsletter', icon: 'mail', area: 'web', match: ['/admin/newsletter'] },
    ],
  },
  {
    // «Web y contenido»: el Portal Web y el Blog & CMS juntos. El id sigue
    // siendo 'web'. Las entradas del blog conservan su permiso (`area: 'cms'`).
    id: 'web',
    label: 'Web y contenido',
    area: 'web',
    items: [
      { label: 'Propiedades (web)', to: '/admin/developer-properties', icon: 'building' },
      { label: 'Propiedades 2ª mano', to: '/admin/properties', icon: 'layers' },
      { label: 'Constructor Web', to: '/admin/site-builder', icon: 'widget' },
      { label: 'Comunidades', to: '/admin/communities', icon: 'store' },
      { label: 'Zonas', to: '/admin/zones', icon: 'map' },
      { label: 'Publicación multicanal', to: '/admin/scheduler', icon: 'bolt' },
      // Su permiso es el de Finanzas & Growth, no el de la categoría.
      { label: 'Widgets', to: '/admin/widgets', icon: 'widget', area: 'finance' },
      { label: 'Brand Kit', to: '/admin/asset-export/brand-kit', icon: 'sparkles' },
      // «Plantillas» unifica en una sola entrada las de Asset Export y las de
      // cartel; dentro, dos pestañas las separan. Las dos antiguas rutas
      // (/admin/asset-export/templates y /admin/carteles/plantillas) dejan de
      // existir como páginas; la API de cada módulo sigue igual.
      { label: 'Plantillas', to: '/admin/plantillas', icon: 'layers' },
      { label: 'Piezas generadas', to: '/admin/asset-export/projects', icon: 'doc' },
      { label: 'Catálogos combinados', to: '/admin/asset-export/catalogs', icon: 'doc' },
      { label: 'Exportación masiva', to: '/admin/asset-export/batches', icon: 'bolt' },
      // Carteles de escaparate (Cola 20): módulo independiente, mismo permiso Portal Web.
      { label: 'Carteles', to: '/admin/carteles/piezas', icon: 'doc' },
      // Blog & CMS, ahora dentro de «Web y contenido». Permiso Blog & CMS (cms).
      { label: 'Dashboard', to: '/admin/cms', icon: 'sparkles', area: 'cms' },
      { label: 'Artículos', to: '/admin/cms/articles', icon: 'doc', area: 'cms' },
      { label: 'Categorías', to: '/admin/cms-categories', icon: 'layers', area: 'cms' },
      { label: 'Etiquetas', to: '/admin/cms-tags', icon: 'badge', area: 'cms' },
      { label: 'Autores', to: '/admin/cms-authors', icon: 'team', area: 'cms' },
      { label: 'Media Library', to: '/admin/cms/media', icon: 'widget', area: 'cms' },
      { label: 'Comentarios', to: '/admin/cms-comments', icon: 'contact', area: 'cms' },
      { label: 'Redirecciones', to: '/admin/cms-redirects', icon: 'code', area: 'cms' },
      { label: 'Papelera', to: '/admin/cms/papelera', icon: 'inbox', area: 'cms' },
      { label: 'Config. Blog', to: '/admin/cms/configuracion', icon: 'settings', area: 'cms' },
      // Su permiso sigue siendo el de Contenido.
      { label: 'Blog (legacy)', to: '/admin/blogs', icon: 'doc', area: 'content' },
    ],
  },
  {
    id: 'system',
    label: 'Sistema',
    area: 'system',
    items: [
      { label: 'Empresas', to: '/admin/organizations', icon: 'store', superAdminOnly: true },
      { label: 'Usuarios', to: '/admin/users', icon: 'key' },
      { label: 'Configuración', to: '/admin/configuracion', icon: 'settings' },
      { label: 'Webhooks', to: '/admin/webhooks', icon: 'code' },
      // Su permiso es el de Finanzas & Growth.
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
  {
    id: 'help',
    label: 'Ayuda',
    items: [{ label: 'Ayuda y documentación', to: '/admin/ayuda', icon: 'help' }],
  },
]

/** El área de permisos de una entrada: la suya, si la tiene, o la de su grupo. */
export function itemArea(group: NavGroup, item: NavItem): AdminArea | null {
  return item.area ?? group.area ?? null
}

function cleanAdminPath(path: string): string {
  return (path.split('?')[0].split('#')[0] || '/admin').replace(/\/+$/, '') || '/admin'
}

/** Todas las rutas que una entrada reclama: su `to` y sus `match`. */
function itemPaths(item: NavItem): string[] {
  return item.match?.length ? [item.to, ...item.match] : [item.to]
}

/**
 * Longitud del prefijo más largo de la entrada (su `to` o un `match`) que
 * contiene `clean`, o -1 si ninguno. Así una entrada con `match` gana la ruta a
 * la que apunta ese `match` igual que si fuera su propia ruta.
 *
 * `/admin` (el Dashboard) se trata distinto en cada consumidor y por eso es un
 * parámetro: para MARCAR la entrada activa sólo casa su ruta exacta (si no, el
 * Dashboard saldría activo en todas las páginas); para resolver el ÁREA de
 * permisos sí es el prefijo comodín que reclama cualquier `/admin/*` sin
 * entrada propia (área «general»), comportamiento histórico.
 */
function itemMatchLength(item: NavItem, clean: string, dashboardIsPrefix = false): number {
  let best = -1
  for (const p of itemPaths(item)) {
    const matches = p === '/admin' && !dashboardIsPrefix ? clean === '/admin' : clean === p || clean.startsWith(`${p}/`)
    if (matches && p.length > best) best = p.length
  }
  return best
}

/**
 * La entrada del menú que se marca como activa para una URL: la de ruta más
 * larga que la contiene, así «Artículos» (/admin/cms/articles) gana a
 * «Dashboard» de Blog (/admin/cms) y sólo una entrada sale marcada (antes
 * salían las dos). El Dashboard general (/admin) sólo para /admin exacto.
 */
export function navMatchForPath(path: string, groups: NavGroup[] = ADMIN_NAV): { group: NavGroup; item: NavItem } | null {
  const clean = cleanAdminPath(path)
  let best: { group: NavGroup; item: NavItem; length: number } | null = null
  for (const group of groups) {
    for (const item of group.items) {
      const length = itemMatchLength(item, clean)
      if (length >= 0 && (!best || length > best.length)) best = { group, item, length }
    }
  }
  return best ? { group: best.group, item: best.item } : null
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
      // Considera `to` y los `match` de la entrada: una ruta unificada bajo
      // «Gestión de contactos» hereda su área igual que las propias. Aquí
      // `/admin` es el prefijo comodín (área «general») como siempre.
      const length = itemMatchLength(item, clean, true)
      if (length < 0) continue
      // El área de la ENTRADA, no la de su categoría: mover una entrada de
      // categoría no cambia quién puede abrirla.
      if (!best || length > best.length) best = { length, area: itemArea(group, item) }
    }
  }
  return best ? best.area : null
}

/** True when the page is one of the platform-owner-only entries. */
export function isSuperAdminOnlyAdminPath(path: string): boolean {
  const clean = (path.split('?')[0].split('#')[0] || '/admin').replace(/\/+$/, '') || '/admin'
  return ADMIN_NAV.some((g) => g.items.some((i) => i.superAdminOnly && (clean === i.to || clean.startsWith(`${i.to}/`))))
}
