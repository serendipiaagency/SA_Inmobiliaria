import { and, eq } from 'drizzle-orm'
import { createError, type H3Event } from 'h3'
import { schema, now, slugify, useDb, cfEnv } from './db'
import { hashPassword, createPasswordResetToken } from './auth'
import { normalizeHost, isReservedHost, isValidHostname } from './domain'
import { sendTransactionalEmail } from './email/send'
import { checkResendDomainVerified } from './email/resendClient'
import {
  assertOwnedReference,
  assertPayloadParentOwnership,
  buildTenantWhere,
  type AuthorizedRecord,
  type TenantPolicy,
} from './tenantPolicy'
import type { AdminArea } from '../../utils/adminAreas'
import { getRequestId } from './requestId'

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
  /**
   * REQUIRED. Which permissions-editor area (server/utils/permissions.ts,
   * utils/adminAreas.ts) this resource's CRUD is gated behind for a
   * restricted admin — wired into requireOrgScope() by every
   * server/api/admin/[resource]/** route. No default: forgetting to tag a
   * new resource here is a compile error, not a silently-unrestricted
   * endpoint.
   */
  area: AdminArea
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
  /**
   * Generate `reference` (a stable internal identifier, independent of
   * `slug`'s SEO-facing role) as `${referencePrefix}-${randomCode}` when
   * missing on create — same mechanism/timing as slugFrom, just a different
   * column. Existing rows are backfilled once in the migration that adds the
   * column (deterministic `'<prefix>-'||id`, not random).
   */
  referencePrefix?: string
  /** Translation child table (locale/title/description pattern). */
  translations?: { table: any; foreignKey: string }
  /** Transform payload before insert/update. `event` is available for prepare hooks that need Worker bindings (e.g. checking a domain against Resend's API). */
  prepare?: (data: Record<string, any>, isCreate: boolean, event?: H3Event) => Promise<Record<string, any>>
  /** Side effect after a successful create (e.g. the welcome email for a new user) — never blocks or fails the create itself. */
  afterCreate?: (event: H3Event, id: number, data: Record<string, any>) => Promise<void>
}

/**
 * A short, human-scannable reference suffix (base36, uppercase — "K3F9QZ").
 * Not sequential: the row's `id` isn't known until after insert, and adding
 * a per-org counter table just for this would be new infrastructure for a
 * cosmetic property. 6 chars of base36 is ~2.2 billion combinations, scoped
 * per organization by the unique index — the same collision-tolerance
 * `slugFrom` above already accepts with its 4-digit random suffix.
 */
function generateReferenceCode(): string {
  return Math.floor(Math.random() * 36 ** 6)
    .toString(36)
    .toUpperCase()
    .padStart(6, '0')
}

export const adminResources: Record<string, ResourceDef> = {
  organizations: {
    area: 'system',
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
      emailSenderName: { type: 'text', label: 'Email — nombre del remitente' },
      emailSenderAddress: { type: 'text', label: 'Email — dirección del remitente' },
      emailReplyTo: { type: 'text', label: 'Email — responder a' },
      // A JSON array of staff addresses, e.g. ["ops@empresa.com","ventas@empresa.com"] — notified on new leads/contact messages/complaints.
      emailInternalRecipientsJson: { type: 'json', label: 'Email — destinatarios internos (JSON)' },
      emailLocale: { type: 'select', label: 'Email — idioma', options: ['es', 'en'] },
      legalCompanyName: { type: 'text', label: 'Legal — razón social' },
      taxId: { type: 'text', label: 'Legal — CIF/NIF' },
      legalAddress: { type: 'text', label: 'Legal — dirección' },
      legalEmail: { type: 'text', label: 'Legal — email de contacto' },
      legalPhone: { type: 'text', label: 'Legal — teléfono' },
    },
    // emailSenderDomainVerified/emailSenderDomainCheckedAt are deliberately
    // NOT in `fields` above — they're never client-editable, only ever set
    // by the real Resend check in `prepare` below, visible here read-only.
    listFields: ['id', 'name', 'domain', 'status', 'emailSenderAddress', 'emailSenderDomainVerified', 'createdAt'],
    searchFields: ['name', 'slug', 'domain'],
    hasTimestamps: true,
    hasUpdatedAt: true,
    slugFrom: 'name',
    // The tenant registry itself: rows here ARE the organizations, so there is
    // nothing to scope them by. Only the platform super_admin can reach it.
    tenantPolicy: { type: 'global', reason: 'The organizations table is the tenant registry itself' },
    superAdminOnly: true,
    // Normalizes `domain` the same way server/middleware/00.tenant.ts
    // normalizes an incoming Host header, so a saved "WWW.Example.com" or
    // "example.com:443" still matches real request traffic. Also rejects the
    // hosts that already mean "the default tenant" (*.workers.dev,
    // localhost) — saving one of those as a *custom* domain would let this
    // org silently hijack every dev/preview deploy's traffic away from the
    // real default tenant.
    async prepare(data, _isCreate, event) {
      if (typeof data.domain === 'string') {
        const normalized = normalizeHost(data.domain)
        if (!normalized) {
          data.domain = null
        } else {
          if (!isValidHostname(normalized)) throw createError({ statusCode: 422, statusMessage: 'Dominio inválido' })
          if (isReservedHost(normalized)) throw createError({ statusCode: 422, statusMessage: 'Ese dominio está reservado por la plataforma y no puede asignarse a una organización' })
          data.domain = normalized
        }
      }
      // "email remitente validado" — a real check against Resend's Domains
      // API (Dashboard → Domains), never a manual toggle: whenever the
      // sender address changes, re-derive its domain and ask Resend whether
      // that domain is verified. Runs on every save (not just when it looks
      // "new") so fixing DNS/SPF/DKIM after the fact and re-saving the same
      // address picks up the now-verified status too.
      if (typeof data.emailSenderAddress === 'string' && data.emailSenderAddress.includes('@') && event) {
        const domain = data.emailSenderAddress.split('@')[1]?.toLowerCase()
        const verified = domain ? await checkResendDomainVerified(cfEnv(event), domain) : null
        data.emailSenderDomainVerified = verified === true ? 1 : 0
        data.emailSenderDomainCheckedAt = verified === null ? null : now()
      }
      return data
    },
  },

  'error-logs': {
    area: 'system',
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
    area: 'system',
    table: schema.adminAuditLog,
    label: 'Auditoría',
    fields: {},
    // `detail` es donde consta lo sensible (server/utils/sensitiveAudit.ts):
    // "contraseña cambiada", "rol admin → super_admin", "secreto rotado".
    // Sin verlo en el listado, la auditoría de esas acciones existiría pero
    // nadie la leería.
    listFields: ['id', 'userEmail', 'action', 'resource', 'resourceId', 'detail', 'createdAt'],
    searchFields: ['userEmail', 'resource', 'resourceId', 'detail'],
    // Org-scoped on purpose (unlike error-logs): a tenant's own admin should
    // see who on their team did what to their data. Rows logged for
    // platform-level actions (organizationId null, e.g. managing "Empresas"
    // itself) simply don't show here — those are superAdminOnly actions,
    // not something a tenant admin needs visibility into anyway.
    tenantPolicy: { type: 'direct' },
    readonly: true,
  },

  agents: {
    area: 'web',
    table: schema.agents,
    label: 'Comerciales',
    fields: {
      name: { type: 'text', label: 'Nombre', required: true },
      email: { type: 'text', label: 'Email', required: true },
      phone: { type: 'text', label: 'Teléfono' },
      profileImage: { type: 'image', label: 'Foto de perfil' },
      licenseNumber: { type: 'text', label: 'Número de licencia' },
      bio: { type: 'textarea', label: 'Biografía' },
      status: { type: 'select', label: 'Estado', options: ['active', 'inactive'] },
    },
    listFields: ['id', 'name', 'email', 'phone', 'status'],
    searchFields: ['name', 'email'],
    hasTimestamps: true,
    hasUpdatedAt: true,
    tenantPolicy: { type: 'direct' },
  },

  developers: {
    area: 'web',
    table: schema.developers,
    label: 'Promotoras',
    fields: {
      name: { type: 'text', label: 'Nombre', required: true },
      email: { type: 'text', label: 'Email' },
      phone: { type: 'text', label: 'Teléfono' },
      logo: { type: 'image', label: 'Logo' },
      description: { type: 'textarea', label: 'Descripción' },
      status: { type: 'select', label: 'Estado', options: ['active', 'inactive'] },
    },
    listFields: ['id', 'name', 'email', 'phone', 'status'],
    searchFields: ['name', 'email'],
    hasTimestamps: true,
    hasUpdatedAt: true,
    tenantPolicy: { type: 'direct' },
  },

  properties: {
    area: 'web',
    table: schema.agentProperties,
    label: 'Propiedades (2ª mano)',
    fields: {
      slug: { type: 'text', label: 'Slug' },
      location: { type: 'text', label: 'Ubicación' },
      country: { type: 'text', label: 'País' },
      city: { type: 'text', label: 'Ciudad' },
      street: { type: 'text', label: 'Calle' },
      streetNumber: { type: 'text', label: 'Número' },
      community: { type: 'text', label: 'Comunidad' },
      block: { type: 'text', label: 'Bloque' },
      portal: { type: 'text', label: 'Portal' },
      floor: { type: 'text', label: 'Planta' },
      doorLetter: { type: 'text', label: 'Letra de puerta' },
      postalCode: { type: 'text', label: 'Código postal' },
      district: { type: 'text', label: 'Distrito' },
      lat: { type: 'number', label: 'Latitud' },
      lng: { type: 'number', label: 'Longitud' },
      propertyType: { type: 'text', label: 'Tipo de inmueble' },
      transactionType: { type: 'select', label: 'Operación', options: ['sale', 'rent'] },
      price: { type: 'number', label: 'Precio (AED)' },
      area: { type: 'number', label: 'Superficie (sqft)' },
      bedrooms: { type: 'number', label: 'Dormitorios' },
      bathrooms: { type: 'number', label: 'Baños' },
      mainImage: { type: 'image', label: 'Imagen principal' },
      videoUrl: { type: 'text', label: 'URL del vídeo' },
      status: { type: 'select', label: 'Estado', options: ['available', 'sold'] },
      agentId: { type: 'number', label: 'Comercial (ID)' },
      // Parity with developer-properties (migration 0059) — see that
      // resource's fields above for the same `type: 'number'` boolean-coercion
      // note on the has*/is* flags.
      yearBuilt: { type: 'number', label: 'Año de construcción' },
      priceOld: { type: 'number', label: 'Precio anterior (AED)' },
      keyHighlights: { type: 'textarea', label: 'Puntos destacados' },
      orientation: { type: 'select', label: 'Orientación', options: ['N', 'S', 'E', 'W', 'SE', 'SW', 'NE', 'NW'] },
      energyRating: { type: 'select', label: 'Certificado energético', options: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] },
      hasElevator: { type: 'number', label: 'Ascensor' },
      hasPool: { type: 'number', label: 'Piscina' },
      hasGarage: { type: 'number', label: 'Garaje' },
      hasTerrace: { type: 'number', label: 'Terraza' },
      hasGarden: { type: 'number', label: 'Jardín' },
      petsAllowed: { type: 'number', label: 'Admite mascotas' },
      accessible: { type: 'number', label: 'Accesible' },
      isExclusive: { type: 'number', label: 'Exclusiva' },
      isReserved: { type: 'number', label: 'Reservado' },
      hasTour: { type: 'number', label: 'Tour virtual' },
      rentalYield: { type: 'number', label: 'Rentabilidad del alquiler (%)' },
      serviceChargeAnnual: { type: 'number', label: 'Gastos de comunidad anuales (AED)' },
      dronePhoto: { type: 'image', label: 'Foto con dron' },
      nightPhoto: { type: 'image', label: 'Foto nocturna' },
      beforePhoto: { type: 'image', label: 'Foto antes' },
      afterPhoto: { type: 'image', label: 'Foto después' },
      aiStagedPhoto: { type: 'image', label: 'Foto con puesta en escena por IA' },
      paymentPlan: { type: 'json', label: 'Plan de pago (JSON)' },
      // --- Property Core (migración 0068) — ver developer-properties más
      // abajo para el mismo bloque comentado; idéntico significado aquí.
      reference: { type: 'text', label: 'Referencia interna' },
      externalSource: { type: 'text', label: 'Origen externo' },
      externalReference: { type: 'text', label: 'Referencia externa' },
      agencyReference: { type: 'text', label: 'Referencia de agencia' },
      mandateType: { type: 'text', label: 'Tipo de mandato' },
      exclusiveFrom: { type: 'text', label: 'Exclusividad — inicio' },
      exclusiveUntil: { type: 'text', label: 'Exclusividad — vencimiento' },
      captureDate: { type: 'text', label: 'Fecha de captación' },
      captureSource: { type: 'text', label: 'Origen de captación' },
      publishedAt: { type: 'text', label: 'Publicado el' },
      locationPrivacy: { type: 'select', label: 'Privacidad de ubicación', options: ['exact', 'approximate', 'hidden_number'] },
      locationPrivacyRadius: { type: 'number', label: 'Radio de privacidad (m)' },
      usableArea: { type: 'number', label: 'Superficie útil (m²)' },
      plotArea: { type: 'number', label: 'Superficie de parcela (m²)' },
      terraceArea: { type: 'number', label: 'Superficie de terraza (m²)' },
      gardenArea: { type: 'number', label: 'Superficie de jardín (m²)' },
      balconyArea: { type: 'number', label: 'Superficie de balcón (m²)' },
      storageArea: { type: 'number', label: 'Superficie de trastero (m²)' },
      toilets: { type: 'number', label: 'Aseos' },
      livingRooms: { type: 'number', label: 'Salones' },
      kitchens: { type: 'number', label: 'Cocinas' },
      garageSpaces: { type: 'number', label: 'Plazas de garaje' },
      condition: { type: 'select', label: 'Estado físico', options: ['new', 'excellent', 'good', 'to_renovate', 'to_reform'] },
      furnished: { type: 'select', label: 'Amueblado', options: ['yes', 'no', 'partially'] },
      featuresReviewedAt: { type: 'text', label: 'Características repasadas el' },
      featuresReviewedBy: { type: 'number', label: 'Características repasadas por (ID)' },
    },
    listFields: ['id', 'reference', 'slug', 'location', 'city', 'propertyType', 'price', 'status'],
    searchFields: ['reference', 'slug', 'location', 'city', 'district', 'postalCode', 'propertyType'],
    hasTimestamps: true,
    hasUpdatedAt: true,
    tenantPolicy: { type: 'direct' },
    relations: { agentId: { table: schema.teamMembers, label: 'Comercial' } },
    translations: { table: schema.propertyTranslations, foreignKey: 'propertyId' },
    referencePrefix: 'S',
  },

  'developer-properties': {
    area: 'web',
    table: schema.developerProperties,
    label: 'Proyectos sobre plano',
    fields: {
      developerId: { type: 'number', label: 'Promotora (ID)', required: true },
      name: { type: 'text', label: 'Nombre', required: true },
      slug: { type: 'text', label: 'Slug' },
      status: { type: 'select', label: 'Estado', options: ['new', 'under_construction', 'ready'] },
      price: { type: 'number', label: 'Precio desde (AED)' },
      description: { type: 'textarea', label: 'Descripción' },
      keyHighlights: { type: 'textarea', label: 'Puntos destacados' },
      paymentPlan: { type: 'json', label: 'Plan de pago (JSON)' },
      handoverDate: { type: 'text', label: 'Fecha de entrega' },
      handoverPercentage: { type: 'text', label: 'En la entrega (%)' },
      downPercentage: { type: 'text', label: 'Entrada (%)' },
      constructionPercentage: { type: 'text', label: 'Durante la construcción (%)' },
      logo: { type: 'image', label: 'Logo' },
      coverImage: { type: 'image', label: 'Imagen de portada' },
      community: { type: 'text', label: 'Comunidad' },
      masterPlanImage: { type: 'image', label: 'Imagen del plan maestro' },
      locationMap: { type: 'image', label: 'Mapa de situación' },
      masterPlanDescription: { type: 'textarea', label: 'Descripción del plan maestro' },
      floorPlanDescription: { type: 'textarea', label: 'Descripción del plano' },
      locationMapDescription: { type: 'textarea', label: 'Descripción del mapa de situación' },
      // The columns below (migrations 0003/0005/0010/0012/0013/0018) have
      // always existed and are read by the public site — they just never had
      // an editable field here, so an admin could never set them by hand.
      // The Property Builder (components/property-builder/) is the first
      // real editor for them; declaring them here is what lets its PUT
      // requests persist. `type: 'number'` on the has*/is* flags is
      // deliberate: buildPayload() coerces via Number(), so a JS boolean
      // from the builder's checkboxes becomes the 0/1 these integer columns
      // already store — there's no boolean FieldType in this generic CRUD.
      propertyType: { type: 'select', label: 'Tipo de inmueble', options: ['Apartment', 'Villa', 'Townhouse', 'Penthouse', 'Studio'] },
      bedrooms: { type: 'number', label: 'Dormitorios' },
      bathrooms: { type: 'number', label: 'Baños' },
      area: { type: 'number', label: 'Superficie (m²)' },
      yearBuilt: { type: 'number', label: 'Año de construcción' },
      energyRating: { type: 'select', label: 'Certificado energético', options: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] },
      orientation: { type: 'select', label: 'Orientación', options: ['N', 'S', 'E', 'W', 'SE', 'SW', 'NE', 'NW'] },
      hasElevator: { type: 'number', label: 'Ascensor' },
      hasPool: { type: 'number', label: 'Piscina' },
      hasGarage: { type: 'number', label: 'Garaje' },
      hasTerrace: { type: 'number', label: 'Terraza' },
      hasGarden: { type: 'number', label: 'Jardín' },
      petsAllowed: { type: 'number', label: 'Admite mascotas' },
      accessible: { type: 'number', label: 'Accesible' },
      priceOld: { type: 'number', label: 'Precio anterior (AED)' },
      isExclusive: { type: 'number', label: 'Exclusiva' },
      isReserved: { type: 'number', label: 'Reservado' },
      publishedAt: { type: 'text', label: 'Publicado el' },
      hasTour: { type: 'number', label: 'Tour virtual' },
      rentalYield: { type: 'number', label: 'Rentabilidad del alquiler (%)' },
      lat: { type: 'number', label: 'Latitud' },
      lng: { type: 'number', label: 'Longitud' },
      street: { type: 'text', label: 'Calle' },
      streetNumber: { type: 'text', label: 'Número' },
      postalCode: { type: 'text', label: 'Código postal' },
      country: { type: 'text', label: 'País' },
      city: { type: 'text', label: 'Ciudad' },
      block: { type: 'text', label: 'Bloque' },
      portal: { type: 'text', label: 'Portal' },
      floor: { type: 'text', label: 'Planta' },
      doorLetter: { type: 'text', label: 'Letra de puerta' },
      district: { type: 'text', label: 'Distrito' },
      videoUrl: { type: 'text', label: 'URL del vídeo' },
      dronePhoto: { type: 'image', label: 'Foto con dron' },
      nightPhoto: { type: 'image', label: 'Foto nocturna' },
      beforePhoto: { type: 'image', label: 'Foto antes' },
      afterPhoto: { type: 'image', label: 'Foto después' },
      aiStagedPhoto: { type: 'image', label: 'Foto con puesta en escena por IA' },
      serviceChargeAnnual: { type: 'number', label: 'Gastos de comunidad anuales (AED)' },
      agentId: { type: 'number', label: 'Comercial (ID)' },
      // --- Property Core (migración 0068) ---
      // Identificación (FASE 1): la referencia interna la genera
      // referencePrefix si se deja vacía; el resto son opcionales y se
      // dejan NULL hasta que alguien los rellene a propósito — nunca se
      // inventa una fecha de captación o un mandato que no existía.
      reference: { type: 'text', label: 'Referencia interna' },
      externalSource: { type: 'text', label: 'Origen externo' },
      externalReference: { type: 'text', label: 'Referencia externa' },
      agencyReference: { type: 'text', label: 'Referencia de agencia' },
      transactionType: { type: 'select', label: 'Operación', options: ['sale', 'rent'] },
      mandateType: { type: 'text', label: 'Tipo de mandato' },
      exclusiveFrom: { type: 'text', label: 'Exclusividad — inicio' },
      exclusiveUntil: { type: 'text', label: 'Exclusividad — vencimiento' },
      captureDate: { type: 'text', label: 'Fecha de captación' },
      captureSource: { type: 'text', label: 'Origen de captación' },
      // Ubicación / privacidad (FASE 2).
      locationPrivacy: { type: 'select', label: 'Privacidad de ubicación', options: ['exact', 'approximate', 'hidden_number'] },
      locationPrivacyRadius: { type: 'number', label: 'Radio de privacidad (m)' },
      // Superficies y distribución (FASE 3).
      usableArea: { type: 'number', label: 'Superficie útil (m²)' },
      plotArea: { type: 'number', label: 'Superficie de parcela (m²)' },
      terraceArea: { type: 'number', label: 'Superficie de terraza (m²)' },
      gardenArea: { type: 'number', label: 'Superficie de jardín (m²)' },
      balconyArea: { type: 'number', label: 'Superficie de balcón (m²)' },
      storageArea: { type: 'number', label: 'Superficie de trastero (m²)' },
      toilets: { type: 'number', label: 'Aseos' },
      livingRooms: { type: 'number', label: 'Salones' },
      kitchens: { type: 'number', label: 'Cocinas' },
      garageSpaces: { type: 'number', label: 'Plazas de garaje' },
      // Características (FASE 4).
      condition: { type: 'select', label: 'Estado físico', options: ['new', 'excellent', 'good', 'to_renovate', 'to_reform'] },
      furnished: { type: 'select', label: 'Amueblado', options: ['yes', 'no', 'partially'] },
      featuresReviewedAt: { type: 'text', label: 'Características repasadas el' },
      featuresReviewedBy: { type: 'number', label: 'Características repasadas por (ID)' },
    },
    listFields: ['id', 'reference', 'name', 'slug', 'community', 'price', 'status'],
    searchFields: ['reference', 'name', 'slug', 'community', 'street', 'city', 'district', 'postalCode'],
    hasTimestamps: true,
    hasUpdatedAt: true,
    tenantPolicy: { type: 'direct' },
    // developerId/agentId are client-supplied: without this, tenant A could
    // attach its project to tenant B's developer or commercial record.
    relations: { developerId: { table: schema.developers, label: 'Promotora' }, agentId: { table: schema.teamMembers, label: 'Comercial' } },
    slugFrom: 'name',
    referencePrefix: 'W',
  },

  'floor-plans': {
    area: 'web',
    table: schema.floorPlans,
    label: 'Planos',
    fields: {
      developerPropertyId: { type: 'number', label: 'Proyecto (ID)', required: true },
      category: { type: 'text', label: 'Categoría' },
      unitType: { type: 'text', label: 'Tipo de unidad' },
      floorDetails: { type: 'text', label: 'Detalle de la planta' },
      sizes: { type: 'text', label: 'Superficies' },
      type: { type: 'text', label: 'Tipo' },
      image: { type: 'image', label: 'Imagen' },
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
    area: 'web',
    table: schema.propertyTypes,
    label: 'Tipos de unidad',
    fields: {
      developerPropertyId: { type: 'number', label: 'Proyecto (ID)', required: true },
      propertyType: { type: 'text', label: 'Tipo de inmueble', required: true },
      unitType: { type: 'text', label: 'Tipo de unidad', required: true },
      size: { type: 'text', label: 'Superficie', required: true },
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

  'developer-property-rooms': {
    area: 'web',
    table: schema.developerPropertyRooms,
    label: 'Estancias personalizadas',
    fields: {
      developerPropertyId: { type: 'number', label: 'Proyecto (ID)', required: true },
      type: { type: 'text', label: 'Tipo' },
      name: { type: 'text', label: 'Nombre' },
      area: { type: 'number', label: 'Superficie (m²)' },
      floor: { type: 'text', label: 'Planta' },
      orientation: { type: 'select', label: 'Orientación', options: ['N', 'S', 'E', 'W', 'SE', 'SW', 'NE', 'NW'] },
      notes: { type: 'textarea', label: 'Notas' },
      sortOrder: { type: 'number', label: 'Orden' },
    },
    listFields: ['id', 'developerPropertyId', 'type', 'name', 'area', 'sortOrder'],
    searchFields: ['type', 'name'],
    hasTimestamps: true,
    hasUpdatedAt: true,
    tenantPolicy: {
      type: 'parent',
      foreignKey: 'developerPropertyId',
      parentTable: schema.developerProperties,
      parentLabel: 'Proyecto',
    },
  },

  'project-images': {
    area: 'web',
    table: schema.images,
    label: 'Galería del proyecto',
    fields: {
      developerPropertyId: { type: 'number', label: 'Proyecto (ID)', required: true },
      image: { type: 'image', label: 'Imagen', required: true },
      sortOrder: { type: 'number', label: 'Orden' },
    },
    listFields: ['id', 'developerPropertyId', 'image', 'sortOrder'],
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
    area: 'web',
    table: schema.propertyGalleryImages,
    label: 'Galería de la propiedad',
    fields: {
      propertyId: { type: 'number', label: 'Propiedad (ID)', required: true },
      image: { type: 'image', label: 'Imagen', required: true },
      sortOrder: { type: 'number', label: 'Orden' },
    },
    listFields: ['id', 'propertyId', 'image', 'sortOrder'],
    searchFields: [],
    hasTimestamps: true,
    tenantPolicy: {
      type: 'parent',
      foreignKey: 'propertyId',
      parentTable: schema.agentProperties,
      parentLabel: 'Propiedad',
    },
  },

  'agent-property-floor-plans': {
    area: 'web',
    table: schema.agentPropertyFloorPlans,
    label: 'Planos (2ª mano)',
    fields: {
      propertyId: { type: 'number', label: 'Propiedad (ID)', required: true },
      category: { type: 'text', label: 'Categoría' },
      unitType: { type: 'text', label: 'Tipo de unidad' },
      floorDetails: { type: 'text', label: 'Detalle de la planta' },
      sizes: { type: 'text', label: 'Superficies' },
      type: { type: 'text', label: 'Tipo' },
      image: { type: 'image', label: 'Imagen' },
    },
    listFields: ['id', 'propertyId', 'category', 'unitType', 'type'],
    searchFields: ['category', 'unitType', 'type'],
    hasTimestamps: true,
    tenantPolicy: {
      type: 'parent',
      foreignKey: 'propertyId',
      parentTable: schema.agentProperties,
      parentLabel: 'Propiedad',
    },
  },

  'agent-property-rooms': {
    area: 'web',
    table: schema.agentPropertyRooms,
    label: 'Estancias personalizadas (2ª mano)',
    fields: {
      propertyId: { type: 'number', label: 'Propiedad (ID)', required: true },
      type: { type: 'text', label: 'Tipo' },
      name: { type: 'text', label: 'Nombre' },
      area: { type: 'number', label: 'Superficie (m²)' },
      floor: { type: 'text', label: 'Planta' },
      orientation: { type: 'select', label: 'Orientación', options: ['N', 'S', 'E', 'W', 'SE', 'SW', 'NE', 'NW'] },
      notes: { type: 'textarea', label: 'Notas' },
      sortOrder: { type: 'number', label: 'Orden' },
    },
    listFields: ['id', 'propertyId', 'type', 'name', 'area', 'sortOrder'],
    searchFields: ['type', 'name'],
    hasTimestamps: true,
    hasUpdatedAt: true,
    tenantPolicy: {
      type: 'parent',
      foreignKey: 'propertyId',
      parentTable: schema.agentProperties,
      parentLabel: 'Propiedad',
    },
  },

  'agent-property-social-media': {
    area: 'web',
    table: schema.agentPropertySocialMedia,
    label: 'Redes sociales (2ª mano)',
    fields: {
      propertyId: { type: 'number', label: 'Propiedad (ID)', required: true },
      platform: {
        type: 'select',
        label: 'Plataforma',
        options: ['instagram', 'facebook', 'linkedin', 'tiktok', 'youtube', 'twitter', 'pinterest', 'whatsapp', 'telegram'],
        required: true,
      },
      url: { type: 'text', label: 'URL del post/reel', required: true },
      caption: { type: 'text', label: 'Pie de foto' },
      sortOrder: { type: 'number', label: 'Orden' },
    },
    listFields: ['id', 'propertyId', 'platform', 'url'],
    searchFields: ['url', 'caption'],
    hasTimestamps: true,
    tenantPolicy: {
      type: 'parent',
      foreignKey: 'propertyId',
      parentTable: schema.agentProperties,
      parentLabel: 'Propiedad',
    },
  },

  'social-media': {
    area: 'web',
    table: schema.propertySocialMedia,
    label: 'Redes sociales (propiedad)',
    fields: {
      developerPropertyId: { type: 'number', label: 'Proyecto (ID)', required: true },
      platform: {
        type: 'select',
        label: 'Plataforma',
        options: ['instagram', 'facebook', 'linkedin', 'tiktok', 'youtube', 'twitter', 'pinterest', 'whatsapp', 'telegram'],
        required: true,
      },
      url: { type: 'text', label: 'URL del post/reel', required: true },
      caption: { type: 'text', label: 'Pie de foto' },
      sortOrder: { type: 'number', label: 'Orden' },
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
    area: 'web',
    table: schema.masterPlans,
    label: 'Planes maestros',
    fields: {
      name: { type: 'text', label: 'Nombre', required: true },
      image: { type: 'image', label: 'Imagen', required: true },
    },
    listFields: ['id', 'name', 'image'],
    searchFields: ['name'],
    hasTimestamps: true,
    tenantPolicy: { type: 'direct' },
  },

  locations: {
    area: 'web',
    table: schema.locations,
    label: 'Ubicaciones',
    fields: {
      name: { type: 'text', label: 'Nombre', required: true },
      image: { type: 'image', label: 'Imagen' },
    },
    listFields: ['id', 'name'],
    searchFields: ['name'],
    hasTimestamps: true,
    tenantPolicy: { type: 'direct' },
  },

  amenities: {
    area: 'web',
    table: schema.amenities,
    label: 'Servicios y zonas comunes',
    fields: {
      name: { type: 'text', label: 'Nombre', required: true },
      logo: { type: 'image', label: 'Logo' },
      description: { type: 'text', label: 'Descripción' },
    },
    listFields: ['id', 'name', 'description'],
    searchFields: ['name'],
    hasTimestamps: true,
    tenantPolicy: { type: 'direct' },
  },

  communities: {
    area: 'web',
    table: schema.communities,
    label: 'Comunidades',
    fields: {
      name: { type: 'text', label: 'Nombre', required: true },
      description: { type: 'textarea', label: 'Descripción' },
      featureDescription: { type: 'textarea', label: 'Descripción destacada' },
      image: { type: 'image', label: 'Imagen' },
      location: { type: 'text', label: 'Ubicación' },
    },
    listFields: ['id', 'name', 'location'],
    searchFields: ['name', 'location'],
    hasTimestamps: true,
    hasUpdatedAt: true,
    tenantPolicy: { type: 'direct' },
  },

  blogs: {
    area: 'content',
    table: schema.blogs,
    label: 'Blog (legacy)',
    fields: {
      slug: { type: 'text', label: 'Slug', required: true },
      image: { type: 'image', label: 'Imagen' },
      targetAudience: { type: 'select', label: 'Público objetivo', options: ['UAE', 'International'] },
    },
    listFields: ['id', 'slug', 'targetAudience'],
    searchFields: ['slug'],
    hasTimestamps: true,
    hasUpdatedAt: true,
    tenantPolicy: { type: 'direct' },
    translations: { table: schema.blogTranslations, foreignKey: 'blogId' },
  },

  /**
   * Clientes. Hasta ahora esta tabla no tenía CRUD: sólo un listado de
   * lectura (`/api/admin/saas/clients.get.ts`) y filas sembradas por las
   * migraciones. Darla de alta aquí le da alta, edición, borrado, ámbito por
   * inquilino y registro en auditoría con el mismo motor que el resto del
   * panel, en vez de cuatro endpoints nuevos que habría que volver a
   * auditar.
   *
   * `lifetimeValue` y `dealsCount` **no son editables a propósito**: son
   * columnas denormalizadas que nadie mantiene (sólo las escriben las
   * migraciones de siembra), así que dejarlas a mano sería dar por buena una
   * cifra inventada. La ficha del cliente enseña en su lugar las operaciones
   * reales de la tabla `deals`.
   *
   * `agentName` es texto libre, no una referencia a `team_members`. No se
   * convierte en FK aquí porque eso es una migración sobre datos vivos, no
   * una decisión de este fichero.
   */
  clients: {
    area: 'crm',
    table: schema.clients,
    label: 'Clientes',
    fields: {
      name: { type: 'text', label: 'Nombre', required: true },
      email: { type: 'text', label: 'Email' },
      phone: { type: 'text', label: 'Teléfono' },
      type: { type: 'select', label: 'Tipo', options: ['buyer', 'seller', 'tenant', 'investor'] },
      stage: { type: 'select', label: 'Estado', options: ['active', 'closed', 'inactive'] },
      agentName: { type: 'text', label: 'Comercial responsable' },
      location: { type: 'text', label: 'Ubicación' },
      notes: { type: 'textarea', label: 'Notas' },
    },
    listFields: ['id', 'name', 'email', 'phone', 'type', 'stage', 'agentName'],
    searchFields: ['name', 'email', 'phone', 'location', 'agentName', 'notes'],
    hasTimestamps: true,
    hasUpdatedAt: true,
    tenantPolicy: { type: 'direct' },
  },

  team: {
    area: 'web',
    table: schema.teamMembers,
    label: 'Equipo',
    fields: {
      name: { type: 'text', label: 'Nombre', required: true },
      slug: { type: 'text', label: 'Slug' },
      email: { type: 'text', label: 'Email', required: true },
      position: { type: 'text', label: 'Puesto', required: true },
      description: { type: 'textarea', label: 'Descripción' },
      experience: { type: 'textarea', label: 'Experiencia' },
      languages: { type: 'text', label: 'Idiomas' },
      specialties: { type: 'text', label: 'Especialidades' },
      image: { type: 'image', label: 'Foto' },
      facebook: { type: 'text', label: 'Facebook' },
      twitter: { type: 'text', label: 'Twitter' },
      linkedin: { type: 'text', label: 'LinkedIn' },
      instagram: { type: 'text', label: 'Instagram' },
      // --- Comerciales ficha (added 0047) ---
      employeeCode: { type: 'text', label: 'Código de empleado' },
      department: { type: 'text', label: 'Departamento' },
      officeName: { type: 'text', label: 'Oficina' },
      managerId: { type: 'number', label: 'Responsable (ID)' },
      hireDate: { type: 'text', label: 'Fecha de alta' },
      contractType: { type: 'text', label: 'Tipo de contrato' },
      employmentStatus: { type: 'select', label: 'Situación laboral', options: ['active', 'inactive', 'on_leave'] },
      workingHours: { type: 'text', label: 'Horario' },
      zones: { type: 'json', label: 'Zonas (JSON)' },
      propertyTypes: { type: 'json', label: 'Tipos de inmueble (JSON)' },
      whatsapp: { type: 'text', label: 'WhatsApp' },
      showOnWeb: { type: 'number', label: 'Mostrar en la web' },
      sortOrder: { type: 'number', label: 'Orden' },
    },
    listFields: ['id', 'name', 'position', 'email', 'department', 'officeName', 'employmentStatus'],
    searchFields: ['name', 'position', 'email', 'phone', 'department', 'officeName', 'zones', 'specialties'],
    hasTimestamps: true,
    hasUpdatedAt: true,
    tenantPolicy: { type: 'direct' },
    // managerId is client-supplied: without this, tenant A could point a
    // manager at tenant B's team member.
    relations: { managerId: { table: schema.teamMembers, label: 'Responsable' } },
    slugFrom: 'name',
  },

  'team-member-documents': {
    area: 'web',
    table: schema.teamMemberDocuments,
    label: 'Documentos del equipo',
    fields: {
      teamMemberId: { type: 'number', label: 'Miembro del equipo (ID)', required: true },
      fileKey: { type: 'text', label: 'Archivo', required: true },
      label: { type: 'text', label: 'Etiqueta', required: true },
    },
    listFields: ['id', 'teamMemberId', 'label', 'fileKey'],
    searchFields: ['label'],
    hasTimestamps: true,
    hasUpdatedAt: false,
    tenantPolicy: { type: 'direct' },
    // Never exposed publicly — this resource has no public/* reader, and
    // never will: internal documents must not leak onto the public
    // Comercial profile.
    relations: { teamMemberId: { table: schema.teamMembers, label: 'Comercial' } },
  },

  users: {
    area: 'system',
    table: schema.users,
    label: 'Usuarios',
    fields: {
      name: { type: 'text', label: 'Nombre', required: true },
      email: { type: 'text', label: 'Email', required: true },
      password: { type: 'text', label: 'Contraseña' },
      role: { type: 'select', label: 'Rol', options: ['admin', 'user'] },
      // Nullable JSON array of "<area>:<action>" strings (server/utils/permissions.ts).
      // Not rendered by the generic field form below — pages/admin/[resource]/[id].vue
      // swaps it for the visual per-area editor (components/admin/UserPermissionsEditor.vue),
      // shown only to a super_admin (see the write guard in [id].put.ts/index.post.ts).
      permissions: { type: 'json', label: 'Permisos' },
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
    // "alta de usuario" — never emails the password the admin just typed
    // (poor practice even for an account you control): instead a
    // set-password link, the same reset-token flow "recuperación de
    // contraseña" uses, so the new user's first real action is choosing
    // their own password.
    afterCreate: async (event, id, data) => {
      try {
        const db = useDb(event)
        const token = await createPasswordResetToken(db, id)
        const setPasswordUrl = `${getRequestURL(event).origin}/reset-password/${token}`
        await sendTransactionalEmail(db, cfEnv(event), {
          organizationId: data.organizationId,
          template: 'user_welcome',
          to: data.email,
          data: { name: data.name, email: data.email, setPasswordUrl },
          requestId: getRequestId(event),
        })
      } catch {
        // The account is already created — a welcome-email failure must never undo that.
      }
    },
  },

  'cms-categories': {
    area: 'cms',
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
    area: 'cms',
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
    area: 'cms',
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
    area: 'cms',
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
    area: 'cms',
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
    area: 'cms',
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
    area: 'inbox',
    table: schema.visitorSubmissions,
    label: 'Solicitudes de visitantes',
    fields: {},
    listFields: ['id', 'name', 'email', 'phoneNumber', 'nationality', 'paymentForRent', 'createdAt'],
    searchFields: ['name', 'email'],
    hasTimestamps: true,
    tenantPolicy: { type: 'direct' },
    readonly: true,
  },

  'vendor-registrations': {
    area: 'inbox',
    table: schema.information,
    label: 'Altas de proveedores',
    fields: {},
    listFields: ['id', 'name', 'email', 'phoneNumber', 'contactPersonName', 'createdAt'],
    searchFields: ['name', 'email'],
    hasTimestamps: true,
    tenantPolicy: { type: 'direct' },
    readonly: true,
  },

  'contact-messages': {
    area: 'inbox',
    table: schema.contactMessages,
    label: 'Mensajes y reclamaciones',
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
  event?: H3Event,
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
  if (def.referencePrefix && isCreate && !data.reference) {
    data.reference = `${def.referencePrefix}-${generateReferenceCode()}`
  }
  if (def.hasTimestamps && isCreate) data.createdAt = now()
  if (def.hasUpdatedAt) data.updatedAt = now()
  return def.prepare ? await def.prepare(data, isCreate, event) : data
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
