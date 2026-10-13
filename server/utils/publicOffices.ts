import { and, asc, desc, eq, isNull } from 'drizzle-orm'
import { schema } from './db'
import { googleMapsSearchUrl } from '../../utils/siteFooter'

/**
 * Lo que la web pública enseña de una oficina (docs/home-corporativa.md):
 * el bloque «Nuestras oficinas» de la portada, la página /oficinas y los
 * datos estructurados de SEO local. Misma disciplina que publicTeam.ts:
 * nunca `select()` a secas sobre `offices`; toda columna está clasificada
 * aquí o en NEVER_PUBLIC_OFFICE_COLUMNS, y
 * `test/unit/publicOfficesProjection.test.ts` obliga a decidirlo al añadir
 * una columna nueva.
 */
export const PUBLIC_OFFICE_COLUMNS = {
  id: schema.offices.id,
  name: schema.offices.name,
  email: schema.offices.email,
  phone: schema.offices.phone,
  address: schema.offices.address,
  city: schema.offices.city,
  province: schema.offices.province,
  postalCode: schema.offices.postalCode,
  country: schema.offices.country,
  photo: schema.offices.photo,
  description: schema.offices.description,
  openingHours: schema.offices.openingHours,
  lat: schema.offices.lat,
  lng: schema.offices.lng,
  isMain: schema.offices.isMain,
  sortOrder: schema.offices.sortOrder,
} as const

/** Lo que nunca sale de la agencia, con el motivo (la prueba lo lee). */
export const NEVER_PUBLIC_OFFICE_COLUMNS: Record<string, string> = {
  organizationId: 'el inquilino propietario: el filtro, no un dato que enseñar',
  code: 'código interno de la oficina (OVI, GIJ…), sin sentido para un visitante',
  timezone: 'operativa interna: con ella se calculan las citas y los recordatorios',
  status: 'estado interno; en la web sólo se publican las activas, el valor no se expone',
  showOnWeb: 'el interruptor de publicación: decide si la fila sale, no es un dato de la oficina',
  createdBy: 'usuario del panel que la dio de alta',
  createdAt: 'fecha interna de alta',
  updatedAt: 'fecha interna de modificación',
  deletedAt: 'borrado suave: las borradas no se publican, y la fecha es interna',
}

export interface PublicOffice {
  id: number
  name: string
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  province: string | null
  postalCode: string | null
  country: string | null
  photo: string | null
  description: string | null
  openingHours: string | null
  lat: number | null
  lng: number | null
  isMain: number
  sortOrder: number
  /** Enlace «Cómo llegar»: por coordenadas si las hay, si no por la dirección; null sin ninguna de las dos. */
  mapsUrl: string | null
}

const clean = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

export function officeMapsUrl(o: { lat?: number | null; lng?: number | null; address?: string | null; postalCode?: string | null; city?: string | null; province?: string | null }): string | null {
  if (typeof o.lat === 'number' && typeof o.lng === 'number' && Number.isFinite(o.lat) && Number.isFinite(o.lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${o.lat},${o.lng}`)}`
  }
  const query = [clean(o.address), clean(o.postalCode), clean(o.city), clean(o.province)].filter(Boolean).join(', ')
  return query ? googleMapsSearchUrl(query) : null
}

/**
 * Las oficinas publicadas de una inmobiliaria: activas, con «mostrar en la
 * web», no borradas; la principal primero y después por orden y nombre.
 */
export async function publicOffices(db: any, orgId: number, limit = 12): Promise<PublicOffice[]> {
  const O = schema.offices
  const rows: Array<Omit<PublicOffice, 'mapsUrl'>> = await db
    .select(PUBLIC_OFFICE_COLUMNS)
    .from(O)
    .where(and(eq(O.organizationId, orgId), eq(O.status, 'active'), eq(O.showOnWeb, 1), isNull(O.deletedAt)))
    .orderBy(desc(O.isMain), asc(O.sortOrder), asc(O.name))
    .limit(limit)
  return rows.map((r) => ({ ...r, mapsUrl: officeMapsUrl(r) }))
}
