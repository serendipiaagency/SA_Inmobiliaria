import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { schema, now, slugify } from './db'
import { hashPassword } from './auth'

export type FieldType = 'text' | 'textarea' | 'number' | 'image' | 'file' | 'select' | 'json'

export interface FieldDef {
  type: FieldType
  label: string
  required?: boolean
  options?: string[]
}

export interface ResourceDef {
  table: any
  label: string
  /** Editable columns (camelCase property names of the drizzle table). */
  fields: Record<string, FieldDef>
  /** Columns shown in the admin list view. */
  listFields: string[]
  /** Free-text search columns. */
  searchFields: string[]
  hasTimestamps?: boolean
  hasUpdatedAt?: boolean
  /** Readonly resources only allow list/show/delete. */
  readonly?: boolean
  /** False for resources whose table has no organization_id column — child
   *  tables that inherit tenant scoping transitively through their parent's
   *  FK (e.g. floor plans belong to a developer property, which is itself
   *  org-scoped). Defaults to true. */
  orgScoped?: boolean
  /** True only for the `organizations` resource itself — managed by the
   *  platform super_admin, not by any single tenant's admin. */
  superAdminOnly?: boolean
  /** Generate `slug` column from this field when missing. */
  slugFrom?: string
  /** Translation child table (locale/title/description pattern). */
  translations?: { table: any; foreignKey: string }
  /** Transform payload before insert/update. */
  prepare?: (data: Record<string, any>, isCreate: boolean) => Promise<Record<string, any>>
}

export const adminResources: Record<string, ResourceDef> = {
  organizations: {
    table: schema.organizations,
    label: 'Empresas',
    fields: {
      name: { type: 'text', label: 'Nombre', required: true },
      slug: { type: 'text', label: 'Slug' },
      domain: { type: 'text', label: 'Dominio' },
      companyName: { type: 'text', label: 'Nombre comercial' },
      logo: { type: 'image', label: 'Logo' },
      brandColor: { type: 'text', label: 'Color de marca' },
      status: { type: 'select', label: 'Estado', options: ['active', 'suspended'] },
    },
    listFields: ['id', 'name', 'domain', 'status', 'createdAt'],
    searchFields: ['name', 'slug', 'domain'],
    hasTimestamps: true,
    hasUpdatedAt: true,
    slugFrom: 'name',
    orgScoped: false,
    superAdminOnly: true,
  },

  agents: {
    table: schema.agents,
    label: 'Agents',
    fields: {
      name: { type: 'text', label: 'Name', required: true },
      email: { type: 'text', label: 'Email', required: true },
      phone: { type: 'text', label: 'Phone' },
      profileImage: { type: 'image', label: 'Profile image' },
      licenseNumber: { type: 'text', label: 'License number' },
      bio: { type: 'textarea', label: 'Bio' },
      status: { type: 'select', label: 'Status', options: ['active', 'inactive'] },
    },
    listFields: ['id', 'name', 'email', 'phone', 'status'],
    searchFields: ['name', 'email'],
    hasTimestamps: true,
    hasUpdatedAt: true,
  },

  developers: {
    table: schema.developers,
    label: 'Developers',
    fields: {
      name: { type: 'text', label: 'Name', required: true },
      email: { type: 'text', label: 'Email' },
      phone: { type: 'text', label: 'Phone' },
      logo: { type: 'image', label: 'Logo' },
      description: { type: 'textarea', label: 'Description' },
      status: { type: 'select', label: 'Status', options: ['active', 'inactive'] },
    },
    listFields: ['id', 'name', 'email', 'phone', 'status'],
    searchFields: ['name', 'email'],
    hasTimestamps: true,
    hasUpdatedAt: true,
  },

  properties: {
    table: schema.agentProperties,
    label: 'Properties (secondary sale)',
    fields: {
      slug: { type: 'text', label: 'Slug' },
      location: { type: 'text', label: 'Location' },
      propertyType: { type: 'text', label: 'Property type' },
      transactionType: { type: 'select', label: 'Transaction', options: ['sale', 'rent'] },
      price: { type: 'number', label: 'Price (AED)' },
      area: { type: 'number', label: 'Area (sqft)' },
      bedrooms: { type: 'number', label: 'Bedrooms' },
      bathrooms: { type: 'number', label: 'Bathrooms' },
      mainImage: { type: 'image', label: 'Main image' },
      status: { type: 'select', label: 'Status', options: ['available', 'sold'] },
    },
    listFields: ['id', 'slug', 'location', 'propertyType', 'price', 'status'],
    searchFields: ['slug', 'location', 'propertyType'],
    hasTimestamps: true,
    hasUpdatedAt: true,
    translations: { table: schema.propertyTranslations, foreignKey: 'propertyId' },
  },

  'developer-properties': {
    table: schema.developerProperties,
    label: 'Off-plan projects',
    fields: {
      developerId: { type: 'number', label: 'Developer ID', required: true },
      name: { type: 'text', label: 'Name', required: true },
      slug: { type: 'text', label: 'Slug' },
      status: { type: 'select', label: 'Status', options: ['new', 'under_construction', 'ready'] },
      price: { type: 'number', label: 'Starting price (AED)' },
      description: { type: 'textarea', label: 'Description' },
      keyHighlights: { type: 'textarea', label: 'Key highlights' },
      paymentPlan: { type: 'json', label: 'Payment plan (JSON)' },
      handoverDate: { type: 'text', label: 'Handover date' },
      handoverPercentage: { type: 'text', label: 'Handover %' },
      downPercentage: { type: 'text', label: 'Down payment %' },
      constructionPercentage: { type: 'text', label: 'During construction %' },
      logo: { type: 'image', label: 'Logo' },
      coverImage: { type: 'image', label: 'Cover image' },
      community: { type: 'text', label: 'Community' },
      masterPlanImage: { type: 'image', label: 'Master plan image' },
      locationMap: { type: 'image', label: 'Location map' },
      masterPlanDescription: { type: 'textarea', label: 'Master plan description' },
      floorPlanDescription: { type: 'textarea', label: 'Floor plan description' },
      locationMapDescription: { type: 'textarea', label: 'Location map description' },
    },
    listFields: ['id', 'name', 'slug', 'community', 'price', 'status'],
    searchFields: ['name', 'slug', 'community'],
    hasTimestamps: true,
    hasUpdatedAt: true,
    slugFrom: 'name',
  },

  'floor-plans': {
    table: schema.floorPlans,
    label: 'Floor plans',
    fields: {
      developerPropertyId: { type: 'number', label: 'Project ID', required: true },
      category: { type: 'text', label: 'Category' },
      unitType: { type: 'text', label: 'Unit type' },
      floorDetails: { type: 'text', label: 'Floor details' },
      sizes: { type: 'text', label: 'Sizes' },
      type: { type: 'text', label: 'Type' },
      image: { type: 'image', label: 'Image' },
    },
    listFields: ['id', 'developerPropertyId', 'category', 'unitType', 'type'],
    searchFields: ['category', 'unitType', 'type'],
    hasTimestamps: true,
    orgScoped: false,
  },

  'property-types': {
    table: schema.propertyTypes,
    label: 'Unit types',
    fields: {
      developerPropertyId: { type: 'number', label: 'Project ID', required: true },
      propertyType: { type: 'text', label: 'Property type', required: true },
      unitType: { type: 'text', label: 'Unit type', required: true },
      size: { type: 'text', label: 'Size', required: true },
    },
    listFields: ['id', 'developerPropertyId', 'propertyType', 'unitType', 'size'],
    searchFields: ['propertyType', 'unitType'],
    hasTimestamps: true,
    orgScoped: false,
  },

  'project-images': {
    table: schema.images,
    label: 'Project gallery',
    fields: {
      developerPropertyId: { type: 'number', label: 'Project ID', required: true },
      image: { type: 'image', label: 'Image', required: true },
    },
    listFields: ['id', 'developerPropertyId', 'image'],
    searchFields: [],
    hasTimestamps: true,
    orgScoped: false,
  },

  'gallery-images': {
    table: schema.propertyGalleryImages,
    label: 'Property gallery',
    fields: {
      propertyId: { type: 'number', label: 'Property ID', required: true },
      image: { type: 'image', label: 'Image', required: true },
    },
    listFields: ['id', 'propertyId', 'image'],
    searchFields: [],
    hasTimestamps: true,
    orgScoped: false,
  },

  'social-media': {
    table: schema.propertySocialMedia,
    label: 'Property social media',
    fields: {
      developerPropertyId: { type: 'number', label: 'Project ID', required: true },
      platform: { type: 'select', label: 'Platform', options: ['instagram', 'tiktok'], required: true },
      url: { type: 'text', label: 'Post/reel URL', required: true },
      caption: { type: 'text', label: 'Caption' },
      sortOrder: { type: 'number', label: 'Sort order' },
    },
    listFields: ['id', 'developerPropertyId', 'platform', 'url'],
    searchFields: ['url', 'caption'],
    hasTimestamps: true,
    orgScoped: false,
  },

  'master-plans': {
    table: schema.masterPlans,
    label: 'Master plans',
    fields: {
      name: { type: 'text', label: 'Name', required: true },
      image: { type: 'image', label: 'Image', required: true },
    },
    listFields: ['id', 'name', 'image'],
    searchFields: ['name'],
    hasTimestamps: true,
  },

  locations: {
    table: schema.locations,
    label: 'Locations',
    fields: {
      name: { type: 'text', label: 'Name', required: true },
      image: { type: 'image', label: 'Image' },
    },
    listFields: ['id', 'name'],
    searchFields: ['name'],
    hasTimestamps: true,
  },

  amenities: {
    table: schema.amenities,
    label: 'Amenities',
    fields: {
      name: { type: 'text', label: 'Name', required: true },
      logo: { type: 'image', label: 'Logo' },
      description: { type: 'text', label: 'Description' },
    },
    listFields: ['id', 'name', 'description'],
    searchFields: ['name'],
    hasTimestamps: true,
  },

  communities: {
    table: schema.communities,
    label: 'Communities',
    fields: {
      name: { type: 'text', label: 'Name', required: true },
      description: { type: 'textarea', label: 'Description' },
      featureDescription: { type: 'textarea', label: 'Feature description' },
      image: { type: 'image', label: 'Image' },
      location: { type: 'text', label: 'Location' },
    },
    listFields: ['id', 'name', 'location'],
    searchFields: ['name', 'location'],
    hasTimestamps: true,
    hasUpdatedAt: true,
  },

  blogs: {
    table: schema.blogs,
    label: 'Blog posts',
    fields: {
      slug: { type: 'text', label: 'Slug', required: true },
      image: { type: 'image', label: 'Image' },
      targetAudience: { type: 'select', label: 'Audience', options: ['UAE', 'International'] },
    },
    listFields: ['id', 'slug', 'targetAudience'],
    searchFields: ['slug'],
    hasTimestamps: true,
    hasUpdatedAt: true,
    translations: { table: schema.blogTranslations, foreignKey: 'blogId' },
  },

  team: {
    table: schema.teamMembers,
    label: 'Team members',
    fields: {
      name: { type: 'text', label: 'Name', required: true },
      slug: { type: 'text', label: 'Slug' },
      email: { type: 'text', label: 'Email', required: true },
      position: { type: 'text', label: 'Position', required: true },
      description: { type: 'textarea', label: 'Description' },
      experience: { type: 'textarea', label: 'Experience' },
      languages: { type: 'text', label: 'Languages' },
      specialties: { type: 'text', label: 'Specialties' },
      image: { type: 'image', label: 'Photo' },
      facebook: { type: 'text', label: 'Facebook' },
      twitter: { type: 'text', label: 'Twitter' },
      linkedin: { type: 'text', label: 'LinkedIn' },
      instagram: { type: 'text', label: 'Instagram' },
    },
    listFields: ['id', 'name', 'position', 'email'],
    searchFields: ['name', 'position'],
    hasTimestamps: true,
    hasUpdatedAt: true,
    slugFrom: 'name',
  },

  users: {
    table: schema.users,
    label: 'Users',
    fields: {
      name: { type: 'text', label: 'Name', required: true },
      email: { type: 'text', label: 'Email', required: true },
      password: { type: 'text', label: 'Password' },
      role: { type: 'select', label: 'Role', options: ['admin', 'user'] },
    },
    listFields: ['id', 'name', 'email', 'role'],
    searchFields: ['name', 'email'],
    hasTimestamps: true,
    hasUpdatedAt: true,
    prepare: async (data, isCreate) => {
      if (data.password) {
        data.password = await hashPassword(String(data.password))
      } else if (isCreate) {
        throw createError({ statusCode: 422, statusMessage: 'Password is required' })
      } else {
        delete data.password
      }
      if (data.email) data.email = String(data.email).toLowerCase().trim()
      return data
    },
  },

  'cms-categories': {
    table: schema.cmsCategories,
    label: 'Categorías (Blog)',
    fields: {
      name: { type: 'text', label: 'Nombre', required: true },
      slug: { type: 'text', label: 'Slug' },
      parentId: { type: 'number', label: 'Categoría padre (ID)' },
      color: { type: 'text', label: 'Color' },
      icon: { type: 'text', label: 'Icono' },
      image: { type: 'image', label: 'Imagen' },
      description: { type: 'textarea', label: 'Descripción' },
      seoTitle: { type: 'text', label: 'Título SEO' },
      seoDescription: { type: 'textarea', label: 'Meta descripción SEO' },
    },
    listFields: ['id', 'name', 'slug', 'parentId'],
    searchFields: ['name', 'slug'],
    hasTimestamps: true,
    hasUpdatedAt: true,
    slugFrom: 'name',
  },

  'cms-tags': {
    table: schema.cmsTags,
    label: 'Etiquetas (Blog)',
    fields: {
      name: { type: 'text', label: 'Nombre', required: true },
      slug: { type: 'text', label: 'Slug' },
    },
    listFields: ['id', 'name', 'slug'],
    searchFields: ['name', 'slug'],
    hasTimestamps: true,
    slugFrom: 'name',
  },

  'cms-authors': {
    table: schema.cmsAuthors,
    label: 'Autores (Blog)',
    fields: {
      name: { type: 'text', label: 'Nombre', required: true },
      slug: { type: 'text', label: 'Slug' },
      userId: { type: 'number', label: 'Usuario vinculado (ID)' },
      photo: { type: 'image', label: 'Foto' },
      bio: { type: 'textarea', label: 'Biografía' },
      specialty: { type: 'text', label: 'Especialidad' },
      facebook: { type: 'text', label: 'Facebook' },
      twitter: { type: 'text', label: 'Twitter' },
      linkedin: { type: 'text', label: 'LinkedIn' },
      instagram: { type: 'text', label: 'Instagram' },
    },
    listFields: ['id', 'name', 'slug', 'specialty'],
    searchFields: ['name', 'specialty'],
    hasTimestamps: true,
    hasUpdatedAt: true,
    slugFrom: 'name',
  },

  'cms-comments': {
    table: schema.cmsComments,
    label: 'Comentarios (Blog)',
    fields: {
      articleId: { type: 'number', label: 'Artículo (ID)', required: true },
      authorName: { type: 'text', label: 'Nombre', required: true },
      authorEmail: { type: 'text', label: 'Email' },
      content: { type: 'textarea', label: 'Comentario', required: true },
      status: { type: 'select', label: 'Estado', options: ['pending', 'approved', 'spam', 'trash'] },
    },
    listFields: ['id', 'articleId', 'authorName', 'status', 'createdAt'],
    searchFields: ['authorName', 'authorEmail', 'content'],
    hasTimestamps: true,
  },

  'cms-redirects': {
    table: schema.cmsRedirects,
    label: 'Redirecciones (Blog)',
    fields: {
      fromPath: { type: 'text', label: 'Desde (ruta)', required: true },
      toPath: { type: 'text', label: 'Hacia (ruta)', required: true },
      statusCode: { type: 'number', label: 'Código (301 o 302)' },
    },
    listFields: ['id', 'fromPath', 'toPath', 'statusCode', 'hits'],
    searchFields: ['fromPath', 'toPath'],
    hasTimestamps: true,
  },

  'cms-media-folders': {
    table: schema.cmsMediaFolders,
    label: 'Carpetas de media (Blog)',
    fields: {
      name: { type: 'text', label: 'Nombre', required: true },
      parentId: { type: 'number', label: 'Carpeta padre (ID)' },
    },
    listFields: ['id', 'name', 'parentId'],
    searchFields: ['name'],
    hasTimestamps: true,
  },

  'visitor-submissions': {
    table: schema.visitorSubmissions,
    label: 'Visitor submissions',
    fields: {},
    listFields: ['id', 'name', 'email', 'phoneNumber', 'nationality', 'paymentForRent', 'createdAt'],
    searchFields: ['name', 'email'],
    hasTimestamps: true,
    readonly: true,
  },

  'vendor-registrations': {
    table: schema.information,
    label: 'Vendor registrations',
    fields: {},
    listFields: ['id', 'name', 'email', 'phoneNumber', 'contactPersonName', 'createdAt'],
    searchFields: ['name', 'email'],
    hasTimestamps: true,
    readonly: true,
  },

  'contact-messages': {
    table: schema.contactMessages,
    label: 'Contact & complaints',
    fields: {},
    listFields: ['id', 'type', 'name', 'email', 'subject', 'createdAt'],
    searchFields: ['name', 'email', 'subject'],
    hasTimestamps: true,
    readonly: true,
  },
}

export function getResource(event: H3Event): { key: string; def: ResourceDef } {
  const key = getRouterParam(event, 'resource') || ''
  const def = adminResources[key]
  if (!def) throw createError({ statusCode: 404, statusMessage: `Unknown resource: ${key}` })
  return { key, def }
}

/** Picks only editable fields from the request body and coerces types. */
export async function buildPayload(
  def: ResourceDef,
  body: Record<string, any>,
  isCreate: boolean,
): Promise<Record<string, any>> {
  const data: Record<string, any> = {}
  for (const [field, fd] of Object.entries(def.fields)) {
    if (!(field in body)) continue
    let v = body[field]
    if (v === '' || v === undefined) v = null
    if (v !== null && fd.type === 'number') {
      v = Number(v)
      if (Number.isNaN(v)) throw createError({ statusCode: 422, statusMessage: `Invalid number: ${field}` })
    }
    if (v !== null && fd.type === 'json' && typeof v !== 'string') v = JSON.stringify(v)
    data[field] = v
  }
  if (isCreate) {
    for (const [field, fd] of Object.entries(def.fields)) {
      if (fd.required && (data[field] === null || data[field] === undefined)) {
        throw createError({ statusCode: 422, statusMessage: `Missing required field: ${field}` })
      }
    }
  }
  if (def.slugFrom && isCreate && !data.slug && data[def.slugFrom]) {
    data.slug = `${slugify(String(data[def.slugFrom]))}-${Math.floor(Math.random() * 10000)}`
  }
  if (def.hasTimestamps && isCreate) data.createdAt = now()
  if (def.hasUpdatedAt) data.updatedAt = now()
  return def.prepare ? await def.prepare(data, isCreate) : data
}

/** Replaces translation rows ([{locale,title,description}]) for a record. */
export async function syncTranslations(
  db: any,
  def: ResourceDef,
  recordId: number,
  translations: Array<{ locale: string; title: string; description?: string }> | undefined,
): Promise<void> {
  if (!def.translations || !Array.isArray(translations)) return
  const { table, foreignKey } = def.translations
  await db.delete(table).where(eq(table[foreignKey], recordId))
  for (const tr of translations) {
    if (!tr?.locale || !tr?.title) continue
    await db.insert(table).values({
      [foreignKey]: recordId,
      locale: tr.locale,
      title: tr.title,
      description: tr.description ?? '',
    })
  }
}
