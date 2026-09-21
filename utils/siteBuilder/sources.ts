/**
 * De dónde sale el contenido dinámico que pintan los bloques del
 * Constructor Web, y dónde se edita. Un nodo dinámico (el nombre de una
 * propiedad, la foto de un comercial) lleva una de estas fuentes para que el
 * inspector pueda decir "Este contenido procede de Propiedades" y ofrecer
 * "Editar en Propiedades" en vez de convertir el dato en texto estático.
 */
export interface DynamicSource {
  label: string
  href: string
}

export const SOURCES = {
  property: { label: 'Propiedades (web)', href: '/admin/developer-properties' },
  community: { label: 'Comunidades', href: '/admin/communities' },
  blog: { label: 'Blog', href: '/admin/cms/articles' },
  team: { label: 'Comerciales', href: '/admin/comerciales' },
  site: { label: 'Textos del sitio (idioma)', href: '/admin/configuracion' },
} as const satisfies Record<string, DynamicSource>

export type SourceKey = keyof typeof SOURCES

/** "Propiedades (web) → Nombre": lo que el inspector enseña como origen del dato. */
export function dynamicLabel(source: SourceKey, what: string): string {
  return `${SOURCES[source].label} → ${what}`
}
