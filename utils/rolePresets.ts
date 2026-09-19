import { ADMIN_AREAS, type AdminArea } from './adminAreas'

/**
 * Plantillas de permisos con nombre.
 *
 * ## Qué son y qué NO son
 *
 * Los permisos del panel son por área desde el bloque 01: ocho áreas × ver /
 * editar, guardadas en `users.permissions` y aplicadas en el servidor
 * (utils/permissions.ts, docs/rbac-authorization-matrix.md). Eso ya deja
 * separar a un comercial de quien lleva la facturación o el RGPD; lo que
 * faltaba era que alguien tuviera que *saber* qué casillas marcar para
 * cada perfil.
 *
 * Una plantilla es sólo eso: una lista de `"<área>:<acción>"` con nombre.
 * Al elegirla en el editor se rellenan las casillas y se guarda el mismo
 * JSON de siempre. **No hay un segundo sistema de roles**: `users.role`
 * sigue siendo admin / user / super_admin, la columna `permissions` sigue
 * siendo la única fuente de verdad, y una cuenta creada con una plantilla es
 * indistinguible de una con las mismas casillas marcadas a mano — también
 * para el servidor, que no sabe que las plantillas existen.
 *
 * Por eso las plantillas viven en `utils/` (cliente) y no tienen tabla ni
 * endpoint: cambiar una plantilla aquí no cambia ninguna cuenta ya guardada,
 * y eso es deliberado.
 */

export interface RolePreset {
  key: string
  label: string
  /** Qué puede y qué no puede hacer, en una frase: es lo que lee quien elige. */
  description: string
  /** `null` = sin restricción (el estado de cualquier admin al que nadie ha restringido). */
  permissions: string[] | null
}

const read = (area: AdminArea) => `${area}:read`
const write = (area: AdminArea) => `${area}:write`

export const ROLE_PRESETS: RolePreset[] = [
  {
    key: 'full',
    label: 'Acceso completo',
    description: 'Todo el panel, sin restricciones. Es lo que tiene cualquier admin al que nadie ha limitado.',
    permissions: null,
  },
  {
    key: 'comercial',
    label: 'Comercial',
    description: 'Lleva el CRM entero (leads, clientes, visitas, reservas, referidos) y consulta el catálogo y la bandeja. No ve facturación, contratos, RGPD ni usuarios.',
    permissions: [read('general'), write('crm'), read('web'), read('inbox')],
  },
  {
    key: 'marketing',
    label: 'Marketing y web',
    description: 'Portal web, constructor, publicación multicanal, piezas gráficas, blog y bandeja. Consulta el CRM para segmentar. No toca facturación ni sistema.',
    permissions: [read('general'), write('web'), write('cms'), write('content'), write('inbox'), read('crm')],
  },
  {
    key: 'finanzas',
    label: 'Facturación y operaciones',
    description: 'Facturación, operaciones, ingresos, contratos, depósitos, automatizaciones y claves de API. Consulta el CRM. No ve RGPD ni usuarios.',
    permissions: [read('general'), write('finance'), read('crm')],
  },
  {
    key: 'administracion',
    label: 'Administración y RGPD',
    description: 'Sistema: usuarios, webhooks, emails, privacidad (exportar y anonimizar datos), auditoría. Consulta el resto del panel sin poder cambiarlo.',
    permissions: [read('general'), write('system'), read('crm'), read('web'), read('finance'), read('cms'), read('content'), read('inbox')],
  },
  {
    key: 'lectura',
    label: 'Sólo consulta',
    description: 'Ve todo el panel y no puede cambiar nada. Para dirección, auditores o alguien en formación.',
    permissions: ADMIN_AREAS.map((a) => read(a.key)),
  },
]

export function findPreset(key: string): RolePreset | undefined {
  return ROLE_PRESETS.find((p) => p.key === key)
}

/**
 * La plantilla que equivale EXACTAMENTE a un valor de `permissions`, o
 * `null` si es una combinación hecha a mano. Se compara como conjunto: el
 * orden no importa, y `write` implica `read`, así que `["crm:write",
 * "crm:read"]` es lo mismo que `["crm:write"]`.
 */
export function matchPreset(permissions: string | null | undefined): RolePreset | null {
  const current = normalizeGrants(permissions)
  if (current === null) return ROLE_PRESETS.find((p) => p.permissions === null) ?? null
  for (const preset of ROLE_PRESETS) {
    if (preset.permissions === null) continue
    const wanted = normalizeGrants(JSON.stringify(preset.permissions))
    if (wanted && wanted.size === current.size && [...wanted].every((g) => current.has(g))) return preset
  }
  return null
}

/** Un valor de `permissions` como conjunto canónico de concesiones (`write` absorbe `read`), o `null` si no restringe. */
function normalizeGrants(raw: string | null | undefined): Set<string> | null {
  if (raw == null || String(raw).trim() === '') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(String(raw))
  } catch {
    return new Set()
  }
  if (!Array.isArray(parsed)) return new Set()
  const grants = new Set(parsed.filter((v): v is string => typeof v === 'string'))
  for (const g of [...grants]) {
    const [area, action] = g.split(':')
    if (action === 'write') grants.delete(`${area}:read`)
  }
  return grants
}
