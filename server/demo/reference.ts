import { sql, type SQL } from 'drizzle-orm'
import { isDemoOrg } from '../utils/demo/tenant'

/**
 * Las propiedades de referencia de la cuenta demo («Norte Astur Inmobiliaria»):
 * dos por catálogo —las mejor documentadas— que la demo enseña primero y con
 * marco dorado, para que quien entre vea de un vistazo cómo queda una ficha
 * trabajada a fondo (docs/demo.md).
 *
 * Es una configuración de fixtures, no una función de promociones: la marca no
 * vive en las propiedades de ninguna otra empresa y sólo se aplica cuando la
 * empresa activa es la demo (`isDemoOrg`: el origen de alta `demo`, nunca un
 * nombre ni un dominio). La propiedad se reconoce por su referencia de agencia
 * (`NA-P10`, la que le da el seed), no por su posición en una lista ni por su
 * id: sobrevive a regenerar la demo, y una propiedad que se borra, se retira o
 * se despublica simplemente deja de coincidir. Este fichero no importa el
 * dataset (lo carga el listado en cada petición): el dataset importa éste.
 */
export type DemoReferenceKind = 'developer' | 'agent'

export const DEMO_REFERENCE_PROPERTIES: { key: string; kind: DemoReferenceKind; ref: string }[] = [
  // Propiedades (web): el chalet y el ático.
  { key: 'p10', kind: 'developer', ref: 'NA-P10' },
  { key: 'p02', kind: 'developer', ref: 'NA-P02' },
  // Propiedades 2ª mano: el piso y la casa.
  { key: 'p11', kind: 'agent', ref: 'NA-P11' },
  { key: 'p19', kind: 'agent', ref: 'NA-P19' },
]

/** Las referencias de agencia de un catálogo, en el orden en que salen (la 1.ª, primero). */
export function demoReferenceRefs(kind: DemoReferenceKind): string[] {
  return DEMO_REFERENCE_PROPERTIES.filter((p) => p.kind === kind).map((p) => p.ref)
}

/** ¿Es de referencia esta propiedad? Para el cliente y las pruebas; el listado usa el SQL de abajo. */
export function isDemoReferenceRef(kind: DemoReferenceKind, agencyReference: string | null | undefined): boolean {
  return !!agencyReference && demoReferenceRefs(kind).includes(agencyReference)
}

/**
 * Lo que el listado del panel necesita de la demo: si la empresa activa lo es
 * (y, si no, `null`: nada cambia para ninguna otra empresa), y las referencias
 * del catálogo.
 */
export async function demoReferenceFor(db: any, orgId: number | null | undefined, kind: DemoReferenceKind): Promise<{ refs: string[] } | null> {
  if (!orgId || !(await isDemoOrg(db, orgId))) return null
  return { refs: demoReferenceRefs(kind) }
}

/** 0, 1, 2… según el puesto de la propiedad entre las de referencia, y `refs.length` para el resto: orden estable y sin tocar la ordenación de lo demás. */
export function referenceRankSql(column: unknown, refs: string[]): SQL<number> {
  if (!refs.length) return sql<number>`0`
  const whens = refs.map((r, i) => sql`when ${column} = ${r} then ${i}`)
  return sql<number>`case ${sql.join(whens, sql` `)} else ${refs.length} end`
}

/** 1 si la propiedad es de referencia, 0 si no (la columna `demoReference` de las filas del listado). */
export function referenceFlagSql(column: unknown, refs: string[]): SQL<number> {
  if (!refs.length) return sql<number>`0`
  return sql<number>`case when ${column} in (${sql.join(refs.map((r) => sql`${r}`), sql`, `)}) then 1 else 0 end`
}
