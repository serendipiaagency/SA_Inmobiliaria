/**
 * Datos estructurados (schema.org) de la inmobiliaria y sus oficinas para el
 * SEO local (docs/home-corporativa.md). Sólo con lo que existe: cada campo
 * se añade si tiene valor y nunca se rellena con valoraciones, reseñas,
 * fechas de fundación ni cifras que la plataforma no tenga.
 */
export interface SchemaCompany {
  companyName: string
  logoUrl?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  social?: Array<{ url: string }> | null
}

export interface SchemaOffice {
  id: number
  name: string
  address?: string | null
  city?: string | null
  province?: string | null
  postalCode?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
  photoUrl?: string | null
  lat?: number | null
  lng?: number | null
  isMain?: number | boolean | null
  description?: string | null
}

const clean = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

export function postalAddress(o: SchemaOffice): Record<string, string> | null {
  const out: Record<string, string> = { '@type': 'PostalAddress' }
  const street = clean(o.address)
  const city = clean(o.city)
  const region = clean(o.province)
  const postal = clean(o.postalCode)
  const country = clean(o.country)
  if (street) out.streetAddress = street
  if (city) out.addressLocality = city
  if (region && region !== city) out.addressRegion = region
  if (postal) out.postalCode = postal
  if (country) out.addressCountry = country
  return Object.keys(out).length > 1 ? out : null
}

export const ORGANIZATION_ID = '#organization'

/** Una oficina como RealEstateAgent (es un LocalBusiness) dependiente de la empresa. */
export function officeJsonLd(origin: string, company: SchemaCompany, office: SchemaOffice): Record<string, unknown> {
  const node: Record<string, unknown> = {
    '@type': 'RealEstateAgent',
    '@id': `${origin}/oficinas#oficina-${office.id}`,
    name: `${company.companyName} · ${office.name}`,
    url: `${origin}/oficinas#oficina-${office.id}`,
    parentOrganization: { '@id': `${origin}/${ORGANIZATION_ID}` },
  }
  const address = postalAddress(office)
  if (address) node.address = address
  const phone = clean(office.phone)
  if (phone) node.telephone = phone
  const email = clean(office.email)
  if (email) node.email = email
  const photo = clean(office.photoUrl)
  if (photo) node.image = photo
  const description = clean(office.description)
  if (description) node.description = description
  if (typeof office.lat === 'number' && typeof office.lng === 'number' && Number.isFinite(office.lat) && Number.isFinite(office.lng)) {
    node.geo = { '@type': 'GeoCoordinates', latitude: office.lat, longitude: office.lng }
  }
  return node
}

/**
 * La inmobiliaria como RealEstateAgent, con sus oficinas publicadas como
 * `department` (cada una con su dirección, teléfono y coordenadas cuando las
 * tiene). La dirección de la empresa es la de su oficina principal.
 */
export function realEstateAgentJsonLd(origin: string, company: SchemaCompany, offices: SchemaOffice[]): Record<string, unknown> {
  const node: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    '@id': `${origin}/${ORGANIZATION_ID}`,
    name: company.companyName,
    url: `${origin}/`,
  }
  const logo = clean(company.logoUrl)
  if (logo) node.logo = logo
  const phone = clean(company.phone)
  if (phone) node.telephone = phone
  const email = clean(company.email)
  if (email) node.email = email
  const sameAs = (company.social || []).map((s) => clean(s.url)).filter((u): u is string => Boolean(u))
  if (sameAs.length) node.sameAs = sameAs
  const main = offices.find((o) => Number(o.isMain) === 1 || o.isMain === true) || offices[0]
  const address = main ? postalAddress(main) : null
  if (address) node.address = address
  if (main && typeof main.lat === 'number' && typeof main.lng === 'number' && Number.isFinite(main.lat) && Number.isFinite(main.lng)) {
    node.geo = { '@type': 'GeoCoordinates', latitude: main.lat, longitude: main.lng }
  }
  if (offices.length) node.department = offices.map((o) => officeJsonLd(origin, company, o))
  return node
}

/** Un comercial publicado como Person que trabaja para la inmobiliaria: sólo lo que su ficha pública ya enseña. */
export function teamMemberJsonLd(origin: string, company: SchemaCompany, member: { slug: string; name: string; position?: string | null; imageUrl?: string | null; phone?: string | null; email?: string | null; languages?: string[] | null }): Record<string, unknown> {
  const node: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: member.name,
    url: `${origin}/equipo/${encodeURIComponent(member.slug)}`,
    worksFor: { '@type': 'RealEstateAgent', '@id': `${origin}/${ORGANIZATION_ID}`, name: company.companyName },
  }
  const position = clean(member.position)
  if (position) node.jobTitle = position
  const image = clean(member.imageUrl)
  if (image) node.image = image
  const phone = clean(member.phone)
  if (phone) node.telephone = phone
  const email = clean(member.email)
  if (email) node.email = email
  const langs = (member.languages || []).map((l) => clean(l)).filter((l): l is string => Boolean(l))
  if (langs.length) node.knowsLanguage = langs
  return node
}
