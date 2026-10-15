import { and, desc, eq, like, or } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'
import { livePropertyCond } from '../../../utils/properties/trash'

/**
 * Las propiedades entre las que se elige la de ejemplo de la página «Ficha de
 * propiedad» del Constructor Web («Previsualizar con: …»). Sólo las de la
 * empresa activa (requireOrgScope) y fuera de la papelera: el selector nunca
 * enseña una propiedad de otra inmobiliaria. Lo justo para reconocer cada una
 * (nombre, zona, estado, portada), no su ficha; `q` filtra por nombre o zona.
 */
const LIMIT = 30

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const P = schema.developerProperties
  const raw = String(getQuery(event).q ?? '').trim().slice(0, 80)
  // `%` y `_` son comodines de LIKE: se escapan para que una búsqueda sea literal.
  const term = raw.replace(/[\\%_]/g, (c) => `\\${c}`)
  const match = raw ? or(like(P.name, `%${term}%`), like(P.community, `%${term}%`)) : undefined
  const columns = { id: P.id, name: P.name, community: P.community, status: P.status, coverImage: P.coverImage }
  // `id`: reconocer la elegida aunque no esté entre los 30 resultados (siempre dentro de la empresa activa).
  const rawId = Number(getQuery(event).id)
  const [rows, selected] = await Promise.all([
    db.select(columns).from(P).where(and(eq(P.organizationId, orgId), livePropertyCond(P), match)).orderBy(desc(P.id)).limit(LIMIT),
    Number.isInteger(rawId) && rawId > 0 ? db.select(columns).from(P).where(and(eq(P.organizationId, orgId), eq(P.id, rawId), livePropertyCond(P))).limit(1) : Promise.resolve([]),
  ])
  return { properties: rows, selected: selected[0] ?? null }
})
