import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ADMIN_NAV, areaForAdminPath, isSuperAdminOnlyAdminPath, itemArea, navMatchForPath, visibleAdminNav, type NavGroup } from '../../utils/adminNav'
import { ADMIN_AREAS, type AdminArea } from '../../utils/adminAreas'
import { adminResources } from '../../server/utils/adminResources'

/**
 * Menú lateral. La regla de fondo: una entrada puede cambiar de categoría o de
 * etiqueta, pero NUNCA de permiso. Este inventario fija, por ruta, la etiqueta,
 * el ÁREA de permisos y si es sólo de super admin; da igual en qué categoría
 * esté — lo que se protege es su `area` efectiva.
 *
 * Reorganizaciones aplicadas:
 *  - Cola 15: «Leads», «Contactos» y «Clientes» se unen en «Gestión de
 *    contactos» (las rutas de Leads y Clientes siguen como crm, vía `match`;
 *    ver UNIFIED_ROUTES).
 *  - Cola 16: el menú se reagrupa en siete categorías por tarea («Dashboard
 *    operativo», «Mi negocio» = CRM+Finanzas, «Chatbot», «Comunicación y
 *    mensajes», «Web y contenido» = Portal Web+Blog&CMS, «Sistema», «Ayuda»).
 *    NINGUNA entrada cambia de permiso; las que caen en una categoría de otra
 *    área llevan `area` propia. La única entrada NUEVA es «Chat de la web»
 *    (ADDED), que abre los ajustes del chat público.
 */
const BEFORE: Array<[to: string, label: string, area: AdminArea | null, superAdminOnly: boolean]> = [
  ['/admin', 'Dashboard', 'general', false], ['/admin/analytics', 'Analytics', 'general', false],
  ['/admin/rendimiento', 'Rendimiento', 'crm', false], ['/admin/inmo', 'INMO', 'crm', false], ['/admin/inmo-ajustes', 'INMO: conocimiento', 'crm', false],
  ['/admin/contactos', 'Gestión de contactos', 'crm', false], ['/admin/compatibilidades', 'Compatibilidades', 'crm', false],
  ['/admin/enrutamiento', 'Enrutamiento y SLA', 'crm', false], ['/admin/campos-personalizados', 'Campos personalizados', 'crm', false],
  ['/admin/offices', 'Oficinas', 'crm', false], ['/admin/teams', 'Equipos', 'crm', false],
  ['/admin/comunicaciones', 'Comunicaciones', 'crm', false], ['/admin/visitas', 'Visitas', 'crm', false], ['/admin/tareas', 'Tareas', 'crm', false],
  ['/admin/automatizaciones', 'Automatizaciones', 'crm', false], ['/admin/ofertas', 'Ofertas', 'crm', false], ['/admin/deal-operations', 'Operaciones', 'crm', false],
  ['/admin/citas-analytics', 'Analítica de citas', 'crm', false], ['/admin/reservas', 'Reservas', 'crm', false], ['/admin/referidos', 'Referidos', 'crm', false],
  ['/admin/developer-properties', 'Propiedades (web)', 'web', false], ['/admin/site-builder', 'Constructor Web', 'web', false], ['/admin/properties', 'Propiedades 2ª mano', 'web', false],
  ['/admin/comerciales', 'Comerciales', 'web', false], ['/admin/communities', 'Comunidades', 'web', false], ['/admin/scheduler', 'Publicación multicanal', 'web', false],
  ['/admin/asset-export/brand-kit', 'Brand Kit', 'web', false], ['/admin/asset-export/templates', 'Plantillas de Export', 'web', false],
  ['/admin/asset-export/projects', 'Piezas generadas', 'web', false], ['/admin/asset-export/batches', 'Exportación masiva', 'web', false],
  ['/admin/asset-export/catalogs', 'Catálogos combinados', 'web', false],
  ['/admin/facturacion', 'Facturación', 'finance', false], ['/admin/operaciones', 'Cierres y comisiones', 'finance', false], ['/admin/ingresos', 'Ingresos', 'finance', false],
  ['/admin/contratos', 'Contratos', 'finance', false], ['/admin/depositos', 'Depósitos', 'finance', false], ['/admin/tasador', 'Tasador (AVM)', 'finance', false],
  ['/admin/ai', 'AI Studio', 'finance', false], ['/admin/widgets', 'Widgets', 'finance', false], ['/admin/marketplace', 'Marketplace', 'finance', false], ['/admin/api', 'API', 'finance', false],
  ['/admin/cms', 'Dashboard', 'cms', false], ['/admin/cms/articles', 'Artículos', 'cms', false], ['/admin/cms-categories', 'Categorías', 'cms', false],
  ['/admin/cms-tags', 'Etiquetas', 'cms', false], ['/admin/cms-authors', 'Autores', 'cms', false], ['/admin/cms/media', 'Media Library', 'cms', false],
  ['/admin/cms-comments', 'Comentarios', 'cms', false], ['/admin/cms-redirects', 'Redirecciones', 'cms', false], ['/admin/cms/papelera', 'Papelera', 'cms', false],
  ['/admin/cms/configuracion', 'Config. Blog', 'cms', false], ['/admin/blogs', 'Blog (legacy)', 'content', false],
  ['/admin/visitor-submissions', 'Solicitudes', 'inbox', false], ['/admin/vendor-registrations', 'Proveedores', 'inbox', false], ['/admin/contact-messages', 'Mensajes', 'inbox', false],
  ['/admin/ayuda', 'Ayuda y documentación', null, false],
  ['/admin/configuracion', 'Configuración', 'system', false], ['/admin/users', 'Usuarios', 'system', false], ['/admin/webhooks', 'Webhooks', 'system', false],
  ['/admin/emails', 'Emails', 'system', false], ['/admin/privacidad', 'Privacidad (RGPD)', 'system', false], ['/admin/audit-log', 'Auditoría', 'system', false],
  ['/admin/organizations', 'Empresas', 'system', true], ['/admin/error-logs', 'Errores', 'system', true], ['/admin/estado', 'Estado del sistema', 'system', true],
]

/** Entradas nuevas desde la reorganización (cada una con su página y su permiso). */
const ADDED: Array<[to: string, label: string, area: AdminArea | null, superAdminOnly: boolean]> = [
  // Megaprompt «footer»: la lista del «Suscríbete» del pie de la web.
  ['/admin/suscriptores', 'Suscriptores', 'web', false],
  // Landing comercial de INMO: la bandeja de solicitudes de demo (sólo super admin).
  ['/admin/solicitudes-demo', 'Solicitudes de demo', 'system', true],
  // Guías de zonas (migración 0095): la jerarquía región → municipio → barrio de la web.
  ['/admin/zones', 'Zonas', 'web', false],
  // Cola 16: acceso directo a los ajustes del chat de la web pública (bajo «Chatbot»); mismo permiso crm.
  ['/admin/comunicaciones/configuracion', 'Chat de la web', 'crm', false],
  // Cola 17: el módulo de newsletter (campañas y plantillas) en «Comunicación y mensajes»; permiso Portal Web.
  ['/admin/newsletter', 'Newsletter', 'web', false],
]

/**
 * Cola 15: rutas que antes eran entradas sueltas del CRM y ahora viven bajo
 * «Gestión de contactos» (/admin/contactos) como pestañas. Ya no son entradas
 * del menú, pero su página y su permiso (crm) siguen intactos: lo comprueba
 * la sección de permisos más abajo.
 */
const UNIFIED_ROUTES: Array<[to: string, area: AdminArea]> = [
  ['/admin/leads', 'crm'],
  ['/admin/clientes', 'crm'],
]

const entries = ADMIN_NAV.flatMap((group) => group.items.map((item) => ({ group, item })))
const ALL_AREAS = ADMIN_AREAS.map((a) => a.key)

function groupOf(to: string): NavGroup {
  return entries.find((e) => e.item.to === to)!.group
}

describe('menú lateral — inventario: reubicar, nunca quitar', () => {
  it('las 65 entradas vigentes existen, con la misma ruta, etiqueta, permiso y restricción de super admin', () => {
    expect(BEFORE).toHaveLength(65)
    expect(entries).toHaveLength(BEFORE.length + ADDED.length)
    for (const [to, label, area, superAdminOnly] of [...BEFORE, ...ADDED]) {
      const found = entries.find((e) => e.item.to === to && e.item.label === label)
      expect(found, `${label} (${to})`).toBeTruthy()
      expect(itemArea(found!.group, found!.item), `permiso de ${label}`).toBe(area)
      expect(!!found!.item.superAdminOnly, `super admin de ${label}`).toBe(superAdminOnly)
    }
  })

  it('las siete categorías de Cola 16, con su id, etiqueta y algunas entradas representativas', () => {
    expect(ADMIN_NAV.map((g) => [g.id, g.label])).toEqual([
      ['general', 'Dashboard operativo'],
      ['crm', 'Mi negocio'],
      ['chatbot', 'Chatbot'],
      ['comunicacion', 'Comunicación y mensajes'],
      ['web', 'Web y contenido'],
      ['system', 'Sistema'],
      ['help', 'Ayuda'],
    ])
    // «Mi negocio» = CRM + Finanzas: contiene lo comercial y lo financiero.
    expect(groupOf('/admin/contactos').id).toBe('crm')
    expect(groupOf('/admin/facturacion').id).toBe('crm')
    expect(groupOf('/admin/ai').id).toBe('crm')
    // «Chatbot» = INMO interno + chat de la web.
    expect(groupOf('/admin/inmo').id).toBe('chatbot')
    expect(groupOf('/admin/comunicaciones/configuracion').id).toBe('chatbot')
    // «Comunicación y mensajes».
    expect(groupOf('/admin/comunicaciones').id).toBe('comunicacion')
    expect(groupOf('/admin/emails').id).toBe('comunicacion')
    expect(groupOf('/admin/suscriptores').id).toBe('comunicacion')
    // «Web y contenido» = Portal Web + Blog & CMS.
    expect(groupOf('/admin/developer-properties').id).toBe('web')
    expect(groupOf('/admin/cms/articles').id).toBe('web')
    expect(groupOf('/admin/blogs').id).toBe('web')
  })

  it('cada entrada es navegable: ruta única de /admin, icono, y una página real detrás', () => {
    const tos = entries.map((e) => e.item.to)
    expect(new Set(tos).size).toBe(tos.length)
    expect(new Set(ADMIN_NAV.map((g) => g.id)).size).toBe(ADMIN_NAV.length)
    for (const { item } of entries) {
      expect(item.to).toMatch(/^\/admin(\/[a-z0-9-]+)*$/)
      expect(item.icon, item.label).toBeTruthy()
      const rel = item.to.replace(/^\//, '')
      const page = ['.vue', '/index.vue'].some((ext) => existsSync(join(process.cwd(), 'pages', `${rel}${ext}`)))
      const generic = /^admin\/[a-z0-9-]+$/.test(rel) && existsSync(join(process.cwd(), 'pages/admin/[resource]/index.vue')) && rel.slice(6) in adminResources
      expect(page || generic, `${item.label}: sin página para ${item.to}`).toBe(true)
    }
  })
})

describe('menú lateral — permisos', () => {
  it('areaForAdminPath da el mismo área que antes para cada página, aunque haya cambiado de categoría', () => {
    for (const [to, , area] of BEFORE) {
      // «Ayuda» no tiene área (null): la ve todo el mundo.
      expect(areaForAdminPath(to), to).toBe(area)
      expect(areaForAdminPath(`${to}/123`), `${to}/123`).toBe(area)
    }
    expect(areaForAdminPath('/admin/api')).toBe('finance')
    expect(areaForAdminPath('/admin/comerciales/7/horario')).toBe('web')
    // Como siempre, /admin («Dashboard») reclama lo que ninguna otra entrada reclama.
    expect(areaForAdminPath('/admin/floor-plans')).toBe('general')
    expect(isSuperAdminOnlyAdminPath('/admin/organizations/new')).toBe(true)
    expect(isSuperAdminOnlyAdminPath('/admin/users')).toBe(false)
  })

  it('Cola 15: las rutas unificadas bajo «Gestión de contactos» siguen protegidas como crm y la marcan activa', () => {
    for (const [to, area] of UNIFIED_ROUTES) {
      // Ya no son entradas del menú…
      expect(entries.find((e) => e.item.to === to), `${to} ya no es entrada suelta`).toBeFalsy()
      // …pero su permiso (crm) se preserva por el `match` de «Gestión de contactos».
      expect(areaForAdminPath(to), to).toBe(area)
      expect(areaForAdminPath(`${to}/123`), `${to}/123`).toBe(area)
      // …y navegar a ellas marca activa la entrada unificada.
      expect(navMatchForPath(to)?.item.label, to).toBe('Gestión de contactos')
      expect(navMatchForPath(`${to}/123`)?.item.label, `${to}/123`).toBe('Gestión de contactos')
    }
  })

  it('el super admin ve Empresas, Errores y Estado del sistema; un admin de empresa no', () => {
    const sa = visibleAdminNav(ADMIN_NAV, { isSuperAdmin: true, allowed: ALL_AREAS }).flatMap((g) => g.items.map((i) => i.label))
    const admin = visibleAdminNav(ADMIN_NAV, { isSuperAdmin: false, allowed: ALL_AREAS }).flatMap((g) => g.items.map((i) => i.label))
    for (const label of ['Empresas', 'Errores', 'Estado del sistema', 'Solicitudes de demo']) {
      expect(sa).toContain(label)
      expect(admin).not.toContain(label)
    }
    // Derivado de las entradas reales: el super admin las ve todas; el admin de
    // empresa, todas menos las superAdminOnly.
    const superOnlyCount = entries.filter((e) => e.item.superAdminOnly).length
    expect(sa).toHaveLength(entries.length)
    expect(admin).toHaveLength(entries.length - superOnlyCount)
  })

  it('un comercial con sólo CRM ve las categorías con entradas crm y la Ayuda, sin Comerciales (Portal Web) ni categorías vacías', () => {
    const nav = visibleAdminNav(ADMIN_NAV, { isSuperAdmin: false, allowed: ['crm'] })
    // Las entradas crm se reparten en «Mi negocio», «Chatbot» y «Comunicación y mensajes»; más la Ayuda.
    expect(nav.map((g) => g.label)).toEqual(['Mi negocio', 'Chatbot', 'Comunicación y mensajes', 'Ayuda'])
    // «Comerciales» es área web: no la ve, aunque viva en «Mi negocio».
    expect(nav.find((g) => g.id === 'crm')?.items.map((i) => i.label)).not.toContain('Comerciales')
    // En «Comunicación y mensajes» sólo ve Comunicaciones (crm), no Emails (system) ni Suscriptores (web).
    expect(nav.find((g) => g.id === 'comunicacion')?.items.map((i) => i.label)).toEqual(['Comunicaciones'])
    expect(nav.every((g) => g.items.length > 0)).toBe(true)
  })

  it('cada entrada movida la ve quien tenía su permiso, en su categoría nueva', () => {
    const web = visibleAdminNav(ADMIN_NAV, { isSuperAdmin: false, allowed: ['web'] })
    // Área web: Comerciales (en «Mi negocio»), Suscriptores (en «Comunicación y mensajes») y el Portal Web (en «Web y contenido»), sin los del blog ni Widgets.
    expect(web.find((g) => g.id === 'crm')?.items.map((i) => i.label)).toEqual(['Comerciales'])
    expect(web.find((g) => g.id === 'comunicacion')?.items.map((i) => i.label)).toEqual(['Suscriptores', 'Newsletter'])
    const webItems = web.find((g) => g.id === 'web')?.items.map((i) => i.label) ?? []
    expect(webItems).toContain('Propiedades (web)')
    expect(webItems).not.toContain('Widgets') // área finance
    expect(webItems).not.toContain('Artículos') // área cms

    const finance = visibleAdminNav(ADMIN_NAV, { isSuperAdmin: false, allowed: ['finance'] })
    // Finanzas vive dentro de «Mi negocio»; API/Marketplace en «Sistema»; Widgets en «Web y contenido».
    expect(finance.find((g) => g.id === 'crm')?.items.map((i) => i.label)).toEqual(['Facturación', 'Cierres y comisiones', 'Ingresos', 'Contratos', 'Depósitos', 'Tasador (AVM)', 'AI Studio'])
    expect(finance.find((g) => g.id === 'system')?.items.map((i) => i.label)).toEqual(['API', 'Marketplace'])
    expect(finance.find((g) => g.id === 'web')?.items.map((i) => i.label)).toEqual(['Widgets'])

    // El blog vive ahora en «Web y contenido».
    const cms = visibleAdminNav(ADMIN_NAV, { isSuperAdmin: false, allowed: ['cms'] })
    expect(cms.find((g) => g.id === 'web')?.items.map((i) => i.label)).toEqual(['Dashboard', 'Artículos', 'Categorías', 'Etiquetas', 'Autores', 'Media Library', 'Comentarios', 'Redirecciones', 'Papelera', 'Config. Blog'])
    const content = visibleAdminNav(ADMIN_NAV, { isSuperAdmin: false, allowed: ['content'] })
    expect(content.find((g) => g.id === 'web')?.items.map((i) => i.label)).toEqual(['Blog (legacy)'])

    // Emails (system) se muestra en «Comunicación y mensajes».
    const system = visibleAdminNav(ADMIN_NAV, { isSuperAdmin: false, allowed: ['system'] })
    expect(system.find((g) => g.id === 'comunicacion')?.items.map((i) => i.label)).toEqual(['Emails'])

    // Sin ningún área, sólo la Ayuda.
    expect(visibleAdminNav(ADMIN_NAV, { isSuperAdmin: false, allowed: [] }).map((g) => g.label)).toEqual(['Ayuda'])
  })
})

describe('menú lateral — entrada activa', () => {
  it('marca la entrada de ruta más larga: Artículos, no el Dashboard del blog', () => {
    expect(navMatchForPath('/admin/cms/articles/5')?.item.label).toBe('Artículos')
    // El blog vive ahora en «Web y contenido» (Cola 16).
    expect(navMatchForPath('/admin/cms/articles/5')?.group.id).toBe('web')
    expect(navMatchForPath('/admin/cms')?.item.label).toBe('Dashboard')
    expect(navMatchForPath('/admin')?.item.to).toBe('/admin')
    expect(navMatchForPath('/admin/site-builder?x=1')?.group.id).toBe('web')
    expect(navMatchForPath('/admin/comerciales/3')?.group.id).toBe('crm')
    // Una página sin entrada en el menú no marca nada (antes «Dashboard» parecía activo en todas).
    expect(navMatchForPath('/admin/cuenta')).toBeNull()
    expect(navMatchForPath('/admin/floor-plans')).toBeNull()
  })

  it('sólo «General» está abierta por defecto', () => {
    expect(ADMIN_NAV.filter((g) => g.defaultOpen).map((g) => g.id)).toEqual(['general'])
  })
})
