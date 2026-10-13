import { and, eq, isNull, sql } from 'drizzle-orm'
import { schema } from './db'
import { buildPublicSearch } from './properties/publicSearch'
import { socialLinksFromBrandKit, type FooterSocialLink } from '../../utils/siteFooter'

/**
 * La inmobiliaria detrás de la web (docs/home-corporativa.md): su perfil
 * público y sus cifras REALES. Nada de aquí se escribe a mano: el perfil
 * sale de la organización y del Brand Kit, y cada cifra es un recuento de la
 * base de datos en el momento de pedirla. Lo que no existe es `null` o 0, y
 * la web no lo enseña.
 */
export interface PublicCompanyProfile {
  name: string
  companyName: string
  /** Clave de R2 del logotipo (el isotipo de la organización) o null. */
  logo: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  website: string | null
  legalAddress: string | null
  social: FooterSocialLink[]
}

const clean = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

export async function publicCompanyProfile(db: any, orgId: number): Promise<PublicCompanyProfile | null> {
  const [orgRows, kitRows] = await Promise.all([
    db
      .select({ name: schema.organizations.name, companyName: schema.organizations.companyName, logo: schema.organizations.logo, legalPhone: schema.organizations.legalPhone, legalAddress: schema.organizations.legalAddress })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, orgId))
      .limit(1),
    db
      .select({ logo: schema.brandKits.logo, phone: schema.brandKits.phone, whatsapp: schema.brandKits.whatsapp, email: schema.brandKits.email, website: schema.brandKits.website, socialLinksJson: schema.brandKits.socialLinksJson })
      .from(schema.brandKits)
      .where(eq(schema.brandKits.organizationId, orgId))
      .limit(1),
  ])
  const org = orgRows[0]
  if (!org) return null
  const kit = kitRows[0]
  return {
    name: org.name,
    companyName: clean(org.companyName) || org.name,
    logo: clean(org.logo) || clean(kit?.logo),
    phone: clean(kit?.phone) || clean(org.legalPhone),
    whatsapp: clean(kit?.whatsapp),
    email: clean(kit?.email),
    website: clean(kit?.website),
    legalAddress: clean(org.legalAddress),
    social: socialLinksFromBrandKit(kit?.socialLinksJson),
  }
}

export interface CompanyStats {
  /** Oficinas publicadas en la web. */
  offices: number
  /** Comerciales con «mostrar en la web». */
  team: number
  /** Viviendas que el catálogo público enseña ahora mismo (misma búsqueda que /propiedades sin filtros). */
  properties: number
  /** Guías de zona publicadas (zonas con texto propio). */
  zones: number
  /** Idiomas distintos en los que atiende el equipo publicado. */
  languages: number
}

function parseLanguages(raw: unknown): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map(String)
  const s = String(raw).trim()
  if (!s) return []
  try {
    const parsed = JSON.parse(s)
    if (Array.isArray(parsed)) return parsed.map(String)
  } catch {
    /* texto separado por comas */
  }
  return s.split(',')
}

export async function companyStats(db: any, orgId: number): Promise<CompanyStats> {
  const O = schema.offices
  const T = schema.teamMembers
  const Z = schema.zones
  const P = schema.developerProperties
  const search = await buildPublicSearch(db, orgId, {})
  const [offices, teamRows, zones, properties] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(O).where(and(eq(O.organizationId, orgId), eq(O.status, 'active'), eq(O.showOnWeb, 1), isNull(O.deletedAt))),
    db.select({ languages: T.languages }).from(T).where(and(eq(T.organizationId, orgId), eq(T.showOnWeb, 1))),
    db.select({ n: sql<number>`count(*)` }).from(Z).where(and(eq(Z.organizationId, orgId), eq(Z.status, 'published'), isNull(Z.deletedAt), sql`${Z.intro} IS NOT NULL AND trim(${Z.intro}) <> ''`)),
    db.select({ n: sql<number>`count(*)` }).from(P).where(and(...search.conds)),
  ])
  const languages = new Set<string>()
  for (const r of teamRows) for (const l of parseLanguages(r.languages)) if (l.trim()) languages.add(l.trim().toLowerCase())
  return {
    offices: Number(offices[0]?.n || 0),
    team: teamRows.length,
    properties: Number(properties[0]?.n || 0),
    zones: Number(zones[0]?.n || 0),
    languages: languages.size,
  }
}
