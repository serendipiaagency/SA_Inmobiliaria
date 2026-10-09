import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ADMIN_NAV, areaForAdminPath, isSuperAdminOnlyAdminPath, itemArea, navMatchForPath, visibleAdminNav, type NavGroup } from '../../utils/adminNav'
import { ADMIN_AREAS, type AdminArea } from '../../utils/adminAreas'
import { adminResources } from '../../server/utils/adminResources'

/**
 * Menú lateral reorganizado en categorías desplegables (oct-2026). La regla:
 * reubicar, nunca quitar. Este inventario es el menú TAL COMO ERA antes de
 * reorganizarlo — ruta, etiqueta, área de permisos y si era sólo de super
 * admin —, y cada entrada tiene que seguir existiendo con el mismo permiso.
 */
const BEFORE: Array<[to: string, label: string, area: AdminArea | null, superAdminOnly: boolean]> = [
  ['/admin', 'Dashboard', 'general', false], ['/admin/analytics', 'Analytics', 'general', false],
  ['/admin/rendimiento', 'Rendimiento', 'crm', false], ['/admin/inmo', 'INMO', 'crm', false], ['/admin/inmo-ajustes', 'INMO: conocimiento', 'crm', false],
  ['/admin/contactos', 'Contactos', 'crm', false], ['/admin/compatibilidades', 'Compatibilidades', 'crm', false], ['/admin/leads', 'Leads', 'crm', false],
  ['/admin/enrutamiento', 'Enrutamiento y SLA', 'crm', false], ['/admin/campos-personalizados', 'Campos personalizados', 'crm', false],
  ['/admin/offices', 'Oficinas', 'crm', false], ['/admin/teams', 'Equipos', 'crm', false], ['/admin/clientes', 'Clientes', 'crm', false],
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
]

const entries = ADMIN_NAV.flatMap((group) => group.items.map((item) => ({ group, item })))
const ALL_AREAS = ADMIN_AREAS.map((a) => a.key)

function groupOf(to: string): NavGroup {
  return entries.find((e) => e.item.to === to)!.group
}

describe('menú lateral — inventario: reubicar, nunca quitar', () => {
  it('las 67 entradas de antes siguen existiendo, con la misma ruta, etiqueta, permiso y restricción de super admin', () => {
    expect(BEFORE).toHaveLength(67)
    expect(entries).toHaveLength(BEFORE.length + ADDED.length)
    for (const [to, label, area, superAdminOnly] of [...BEFORE, ...ADDED]) {
      const found = entries.find((e) => e.item.to === to && e.item.label === label)
      expect(found, `${label} (${to})`).toBeTruthy()
      expect(itemArea(found!.group, found!.item), `permiso de ${label}`).toBe(area)
      expect(!!found!.item.superAdminOnly, `super admin de ${label}`).toBe(superAdminOnly)
    }
  })

  it('las cinco entradas que cambiaron de categoría están donde deben', () => {
    expect(groupOf('/admin/comerciales').label).toBe('CRM')
    expect(groupOf('/admin/widgets').label).toBe('Portal Web')
    expect(groupOf('/admin/api').label).toBe('Sistema')
    expect(groupOf('/admin/marketplace').label).toBe('Sistema')
    expect(groupOf('/admin/blogs').label).toBe('Blog & CMS')
    // Y sólo esas: el resto sigue en su categoría de siempre.
    const moved = BEFORE.filter(([to, , area]) => {
      const g = groupOf(to)
      return g.area !== area && !(g.area === undefined && area === null)
    }).map(([to]) => to)
    expect(moved.sort()).toEqual(['/admin/api', '/admin/blogs', '/admin/comerciales', '/admin/marketplace', '/admin/widgets'])
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

  it('el super admin ve Empresas, Errores y Estado del sistema; un admin de empresa no', () => {
    const sa = visibleAdminNav(ADMIN_NAV, { isSuperAdmin: true, allowed: ALL_AREAS }).flatMap((g) => g.items.map((i) => i.label))
    const admin = visibleAdminNav(ADMIN_NAV, { isSuperAdmin: false, allowed: ALL_AREAS }).flatMap((g) => g.items.map((i) => i.label))
    for (const label of ['Empresas', 'Errores', 'Estado del sistema']) {
      expect(sa).toContain(label)
      expect(admin).not.toContain(label)
    }
    const addedForAll = ADDED.filter(([, , , superAdminOnly]) => !superAdminOnly).length
    expect(sa).toHaveLength(67 + ADDED.length)
    expect(admin).toHaveLength(64 + addedForAll)
  })

  it('un comercial con sólo CRM ve el CRM (sin Comerciales, que es de Portal Web) y la Ayuda, y ninguna categoría vacía', () => {
    const nav = visibleAdminNav(ADMIN_NAV, { isSuperAdmin: false, allowed: ['crm'] })
    expect(nav.map((g) => g.label)).toEqual(['CRM', 'Ayuda'])
    expect(nav[0].items.map((i) => i.label)).not.toContain('Comerciales')
    expect(nav.every((g) => g.items.length > 0)).toBe(true)
  })

  it('cada entrada movida la ve quien tenía su permiso, en su categoría nueva', () => {
    const web = visibleAdminNav(ADMIN_NAV, { isSuperAdmin: false, allowed: ['web'] })
    expect(web.find((g) => g.id === 'crm')?.items.map((i) => i.label)).toEqual(['Comerciales'])
    expect(web.find((g) => g.id === 'web')?.items.map((i) => i.label)).not.toContain('Widgets')

    const finance = visibleAdminNav(ADMIN_NAV, { isSuperAdmin: false, allowed: ['finance'] })
    expect(finance.find((g) => g.id === 'system')?.items.map((i) => i.label)).toEqual(['API', 'Marketplace'])
    expect(finance.find((g) => g.id === 'web')?.items.map((i) => i.label)).toEqual(['Widgets'])

    const content = visibleAdminNav(ADMIN_NAV, { isSuperAdmin: false, allowed: ['content'] })
    expect(content.find((g) => g.id === 'cms')?.items.map((i) => i.label)).toEqual(['Blog (legacy)'])

    // Sin ningún área, sólo la Ayuda.
    expect(visibleAdminNav(ADMIN_NAV, { isSuperAdmin: false, allowed: [] }).map((g) => g.label)).toEqual(['Ayuda'])
  })
})

describe('menú lateral — entrada activa', () => {
  it('marca la entrada de ruta más larga: Artículos, no el Dashboard del blog', () => {
    expect(navMatchForPath('/admin/cms/articles/5')?.item.label).toBe('Artículos')
    expect(navMatchForPath('/admin/cms/articles/5')?.group.id).toBe('cms')
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
