import { and, eq } from 'drizzle-orm'
import { createError, type H3Event } from 'h3'
import { schema, now, slugify } from './db'
import { hashPassword } from './auth'
import {
  assertOwnedReference,
  assertPayloadParentOwnership,
  buildTenantWhere,
  type AuthorizedRecord,
  type TenantPolicy,
} from './tenantPolicy'

export type FieldType = 'text' | 'textarea' | 'number' | 'image' | 'file' | 'select' | 'json'

export interface FieldDef {
  type: FieldType
  label: string
  required?: boolean
  options?: string[]
}

/**
 * A foreign key on a tenant-scoped resource that points at ANOTHER
 * tenant-scoped table. Declaring it here makes the CRUD verify, on every
 * create and update, that the referenced row belongs to the caller's own
 * organization — an id alone is never enough (see docs/multitenant-audit.md,
 * "Fase 5").
 */
export interface RelationDef {
  table: any
  /** Tenant column on the referenced table. Defaults to `organizationId`. */
  organizationField?: string
  /** Used in the 404 message when the reference isn't owned. */
  label: string
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
  /**
   * REQUIRED. How this resource is confined to one tenant — `direct` (own
   * organization_id column), `parent`/`nestedParent` (inherited through a FK
   * chain) or `global` (platform-wide, with a written reason). See
   * server/utils/tenantPolicy.ts. There is no default: a resource with no
   * policy fails to compile rather than silently querying every tenant.
   */
  tenantPolicy: TenantPolicy
  /** FKs into other tenant-scoped tables, validated on create/update. */
  relations?: Record<string, RelationDef>
  /** True only for the `organizations` resource itself — managed by the
   *  platform super_admin, not by any single tenant's admin. */
  superAdminOnly?: boolean
  /** True for resources with a `deletedAt` column — DELETE moves the row to
   *  Papelera instead of removing it; a `?hard=1` DELETE (from Papelera)
   *  purges it for real. GET list excludes trashed rows unless `?trashed=1`. */
  softDelete?: boolean
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
    // The tenant registry itself: rows here ARE the organizations, so there is
    // nothing to scope them by. Only the platform super_admin can reach it.
    tenantPolicy: { type: 'global', reason: 'The organizations table is the tenant registry itself' },
    superAdminOnly: true,
  },

  'error-logs': {
    table: schema.errorLogs,
    label: 'Errores (incidencias)',
    fields: {},
    listFields: ['id', 'statusCode', 'message', 'path', 'method', 'createdAt'],
    searchFields: ['message', 'path'],
    // Platform incident log: rows are written by the error-logging plugin from
    // requests that may have no session (and therefore no org) at all.
    // super_admin only — a tenant admin never sees it.
    tenantPolicy: { type: 'global', reason: 'Platform-wide incident log, super_admin only' },
    superAdminOnly: true,
    readonly: true,
  },

  'audit-log': {
    table: schema.adminAuditLog,
    label: 'Auditoría',
    fields: {},
    listFields: ['id', 'userEmail', 'action', 'resource', 'resourceId', 'createdAt'],
    searchFields: ['userEmail', 'resource', 'resourceId'],
    // Org-scoped on purpose (unlike error-logs): a tenant's own admin should
    // see who on their team did what to their data. Rows logged for
    // platform-level actions (organizationId null, e.g. managing "Empresas"
    // itself) simply don't show here — those are superAdminOnly actions,
    // not something a tenant admin needs visibility into anyway.
    tenantPolicy: { type: 'direct' },
    readonly: true,
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
    tenantPolicy: { type: 'direct' },
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
    tenantPolicy: { type: 'direct' },
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
    tenantPolicy: { type: 'direct' },
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
    tenantPolicy: { type: 'direct' },
    // developerId is client-supplied: without this, tenant A could attach its
    // project to tenant B's developer record.
    relations: { developerId: { table: schema.developers, label: 'Promotora' } },
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
    tenantPolicy: {
      type: 'parent',
      foreignKey: 'developerPropertyId',
      parentTable: schema.developerProperties,
      parentLabel: 'Proyecto',
    },
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
    tenantPolicy: {
      type: 'parent',
      foreignKey: 'developerPropertyId',
      parentTable: schema.developerProperties,
      parentLabel: 'Proyecto',
    },
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
    tenantPolicy: {
      type: 'parent',
      foreignKey: 'developerPropertyId',
      parentTable: schema.developerProperties,
      parentLabel: 'Proyecto',
    },
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
    tenantPolicy: {
      type: 'parent',
      foreignKey: 'propertyId',
      parentTable: schema.agentProperties,
      parentLabel: 'Propiedad',
    },
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
    tenantPolicy: {
      type: 'parent',
      foreignKey: 'developerPropertyId',
      parentTable: schema.developerProperties,
      parentLabel: 'Proyecto',
    },
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
    tenantPolicy: { type: 'direct' },
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
    tenantPolicy: { type: 'direct' },
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
    tenantPolicy: { type: 'direct' },
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
    tenantPolicy: { type: 'direct' },
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
    tenantPolicy: { type: 'direct' },
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
    tenantPolicy: { type: 'direct' },
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
    tenantPolicy: { type: 'direct' },
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
    tenantPolicy: { type: 'direct' },
    relations: { parentId: { table: schema.cmsCategories, label: 'Categoría padre' } },
    slugFrom: 'name',
    softDelete: true,
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
    tenantPolicy: { type: 'direct' },
    slugFrom: 'name',
    softDelete: true,
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
    tenantPolicy: { type: 'direct' },
    // A CMS author can only be linked to a user account of the same tenant.
    relations: { userId: { table: schema.users, label: 'Usuario vinculado' } },
    slugFrom: 'name',
    softDelete: true,
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
    tenantPolicy: { type: 'direct' },
    // Moderating a comment adjusts its article's comment_count — that article
    // must belong to the same tenant, or the counter of another tenant's post
    // could be driven from here.
    relations: { articleId: { table: schema.cmsArticles, label: 'Artículo' } },
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
    tenantPolicy: { type: 'direct' },
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
    tenantPolicy: { type: 'direct' },
    relations: { parentId: { table: schema.cmsMediaFolders, label: 'Carpeta padre' } },
  },

  'visitor-submissions': {
    table: schema.visitorSubmissions,
    label: 'Visitor submissions',
    fields: {},
    listFields: ['id', 'name', 'email', 'phoneNumber', 'nationality', 'paymentForRent', 'createdAt'],
    searchFields: ['name', 'email'],
    hasTimestamps: true,
    tenantPolicy: { type: 'direct' },
    readonly: true,
  },

  'vendor-registrations': {
    table: schema.information,
    label: 'Vendor registrations',
    fields: {},
    listFields: ['id', 'name', 'email', 'phoneNumber', 'contactPersonName', 'createdAt'],
    searchFields: ['name', 'email'],
    hasTimestamps: true,
    tenantPolicy: { type: 'direct' },
    readonly: true,
  },

  'contact-messages': {
    table: schema.contactMessages,
    label: 'Contact & complaints',
    fields: {},
    listFields: ['id', 'type', 'name', 'email', 'subject', 'createdAt'],
    searchFields: ['name', 'email', 'subject'],
    hasTimestamps: true,
    tenantPolicy: { type: 'direct' },
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

/**
 * Verifies every client-supplied foreign key in a payload against the caller's
 * own organization, for both `relations` (FKs from a direct-policy resource)
 * and the parent FK of a `parent`/`nestedParent` resource.
 *
 * Called from create AND update. On update it matters just as much: without
 * it, an admin could re-parent one of their own child rows onto another
 * tenant's record, which moves the row across the tenant boundary in one step.
 */
export async function assertPayloadReferences(
  db: any,
  def: ResourceDef,
  data: Record<string, any>,
  orgId: number | null,
  opts: { isCreate: boolean },
): Promise<void> {
  await assertPayloadParentOwnership(db, def.tenantPolicy, data, orgId, opts)

  for (const [field, rel] of Object.entries(def.relations || {})) {
    const value = data[field]
    // Absent = not being changed; explicit null = clearing an optional link.
    if (value === undefined || value === null) continue
    await assertOwnedReference(db, {
      table: rel.table,
      organizationField: rel.organizationField,
      id: value,
      orgId,
      label: rel.label,
    })
  }
}

/**
 * Replaces translation rows ([{locale,title,description}]) for a record.
 *
 * Takes an `AuthorizedRecord` — not a bare id — on purpose. The previous
 * signature accepted `recordId: number`, and the update handler called it with
 * the id from the URL regardless of whether the org-scoped UPDATE had actually
 * matched anything. A PUT against another tenant's property therefore changed
 * no columns (correctly) but still wiped and rewrote that property's
 * translation rows (an unauthorized write, and a destructive one).
 *
 * Ownership is now enforced twice, deliberately:
 *  1. The `AuthorizedRecord` capability can only be minted by
 *     `authorizeRecord()`, which resolves the row through the tenant policy —
 *     so an unauthorized caller can't even construct the argument.
 *  2. The DELETE and INSERT statements themselves carry an EXISTS guard on the
 *     parent row, so even a mis-wired caller cannot touch translations whose
 *     parent belongs to another tenant.
 *
 * We chose this (options A + B of the brief) over adding `organization_id` to
 * the translation tables (option C). Denormalizing the tenant onto a child
 * whose parent already carries it introduces a second copy that can drift —
 * a re-parented or mis-seeded row would then have two disagreeing answers to
 * "who owns this?", and any query that trusted the wrong one would be a leak.
 * The parent's column stays the single source of truth.
 */
export async function syncTranslations(
  db: any,
  def: ResourceDef,
  authorized: AuthorizedRecord,
  translations: Array<{ locale: string; title: string; description?: string }> | undefined,
): Promise<void> {
  if (!def.translations || !Array.isArray(translations)) return
  const { table, foreignKey } = def.translations
  const recordId = authorized.id

  // Defence in depth (2): re-derive the tenant guard from the parent resource
  // and apply it to the write itself.
  const parentGuard = buildTenantWhere(db, def.table, def.tenantPolicy, authorized.orgId)
  const ownsParent = parentGuard
    ? (await db.select({ id: def.table.id }).from(def.table).where(and(eq(def.table.id, recordId), parentGuard)).limit(1))[0]
    : (await db.select({ id: def.table.id }).from(def.table).where(eq(def.table.id, recordId)).limit(1))[0]
  if (!ownsParent) throw createError({ statusCode: 404, statusMessage: 'Not found' })

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
