import { and, eq, inArray, or } from 'drizzle-orm'
import { createError, type H3Event } from 'h3'
import { schema, now, slugify, useDb, cfEnv } from './db'
import { hashPassword, createPasswordResetToken } from './auth'
import { normalizeHost, isReservedHost, isValidHostname } from './domain'
import { sendTransactionalEmail } from './email/send'
import {
  assertOwnedReference,
  assertPayloadParentOwnership,
  buildTenantWhere,
  type AuthorizedRecord,
  type TenantPolicy,
} from './tenantPolicy'
import type { AdminArea } from '../../utils/adminAreas'
import { getRequestId } from './requestId'
import { selectInChunks } from './sqlChunks'
import { DOCUMENT_VISIBILITIES, DOCUMENT_VISIBILITY_LABELS, PROPERTY_DOCUMENT_TYPES, PROPERTY_DOCUMENT_TYPE_LABELS, PROPERTY_TYPES, PROPERTY_TYPE_LABELS } from '../../utils/propertySheet'
import {
  CONTACT_SOURCES,
  CONTACT_SOURCE_LABELS,
  CONTACT_STATUSES,
  CONTACT_STATUS_LABELS,
  LANGUAGE_LABELS,
  LANGUAGE_OPTIONS,
  NEXT_ACTION_LABELS,
  NEXT_ACTION_TYPES,
  NOTE_ENTITY_TYPES,
  PROPERTY_CONTACT_ROLES,
  PROPERTY_CONTACT_ROLE_LABELS,
} from '../../utils/crmCatalog'
import { LEAD_PRIORITIES, LEAD_PRIORITY_LABELS, LEAD_SOURCES, LEAD_SOURCE_LABELS, ROUTING_SCOPES, ROUTING_SCOPE_LABELS } from '../../utils/leadCatalog'
import { MEDIA_LANGUAGES, MEDIA_LANGUAGE_LABELS, PROPERTY_MEDIA_TYPES, PROPERTY_MEDIA_TYPE_LABELS } from '../../utils/propertyMediaCatalog'
import { normalizeMediaMetadata } from './properties/media'
import { decorateDocumentRows } from './properties/documents'
import { CUSTOM_FIELD_ENTITY_LABELS, CUSTOM_FIELD_ENTITY_TYPES, CUSTOM_FIELD_TYPES, CUSTOM_FIELD_TYPE_LABELS } from '../../utils/customFieldCatalog'
import { countValuesByDefinition } from './customFields/service'
import { prepareKnowledgeDocument } from './knowledge/documents'
import { INMO_BRAINS, prepareBrainSettings } from './inmo/brainCatalog'

/** Oficinas y equipos: nombre con contenido, email con forma de email y zona horaria IANA real. */
function validateOfficeOrTeam(data: Record<string, any>): Record<string, any> {
  if (typeof data.name === 'string') {
    data.name = data.name.trim()
    if (!data.name) throw createError({ statusCode: 422, statusMessage: 'El nombre es obligatorio' })
    if (data.name.length > 120) throw createError({ statusCode: 422, statusMessage: 'El nombre admite como máximo 120 caracteres' })
  }
  if (typeof data.email === 'string' && data.email) {
    data.email = data.email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) throw createError({ statusCode: 422, statusMessage: 'El email no tiene un formato válido' })
  }
  if (typeof data.timezone === 'string' && data.timezone) {
    try {
      new Intl.DateTimeFormat('es-ES', { timeZone: data.timezone })
    } catch {
      throw createError({ statusCode: 422, statusMessage: 'Zona horaria no válida (usa el formato Europe/Madrid)' })
    }
  }
  if (data.status != null && !['active', 'inactive'].includes(data.status)) throw createError({ statusCode: 422, statusMessage: 'Estado no válido' })
  return data
}

export type FieldType = 'text' | 'textarea' | 'number' | 'image' | 'file' | 'select' | 'json'

export interface FieldDef {
  type: FieldType
  label: string
  required?: boolean
  options?: string[]
  /** Etiqueta legible por valor de un `select` (el valor guardado no cambia). */
  optionLabels?: Record<string, string>
  /**
   * Campo que guarda el id de otro recurso del panel: el formulario genérico
   * lo pinta como un desplegable con los registros de `resource` (por su
   * `labelField`) en vez de pedir un número. La pertenencia a la organización
   * la sigue validando `relations` en el servidor.
   */
  relation?: { resource: string; labelField?: string }
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
  /**
   * Columnas por las que el listado genérico admite un filtro exacto por
   * query (`?entityType=contact&entityId=5`). Sólo estas: nunca una columna
   * arbitraria que mande el cliente.
   */
  filterFields?: string[]
  /**
   * Completa las filas del listado genérico con datos de otras tablas (el
   * nombre del contacto de un propietario, el autor de una nota) — siempre
   * acotado a `orgId`.
   */
  decorateRows?: (db: any, orgId: number, rows: any[]) => Promise<any[]>
}

/**
 * A short, human-scannable reference suffix (base36, uppercase — "K3F9QZ").
 * Not sequential: the row's `id` isn't known until after insert, and adding
 * a per-org counter table just for this would be new infrastructure for a
 * cosmetic property. 6 chars of base36 is ~2.2 billion combinations, scoped
 * per organization by the unique index — the same collision-tolerance
 * `slugFrom` above already accepts with its 4-digit random suffix.
 */
export function generateReferenceCode(): string {
  return Math.floor(Math.random() * 36 ** 6)
    .toString(36)
    .toUpperCase()
    .padStart(6, '0')
}

/**
 * Metadatos por foto de galería (FASE 7, migración 0086) — los mismos en los
 * dos catálogos: título, alt, pie, idioma y los tres interruptores que deciden
 * si sale fuera del panel (publicable, privada, oculta). Ver
 * server/utils/properties/media.ts.
 */
const GALLERY_METADATA_FIELDS: Record<string, FieldDef> = {
  title: { type: 'text', label: 'Título' },
  alt: { type: 'text', label: 'Texto alternativo (alt)' },
  caption: { type: 'textarea', label: 'Pie de foto' },
  language: { type: 'select', label: 'Idioma', options: [...MEDIA_LANGUAGES], optionLabels: MEDIA_LANGUAGE_LABELS },
  isPublishable: { type: 'number', label: 'Publicable' },
  isPrivate: { type: 'number', label: 'Privada' },
  isHidden: { type: 'number', label: 'Oculta' },
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
    // emailSenderAddress is deliberately NOT in `fields`: a sender address only
    // changes through the verified flow (server/utils/email/orgSender.ts —
    // domain ownership per company + Resend verification), never a raw PUT.
    // emailSenderDomainVerified/emailSenderDomainCheckedAt are deliberately
    // NOT in `fields` above — they're never client-editable, only ever set
    // by the real Resend check in `prepare` below, visible here read-only.
    listFields: ['id', 'name', 'domain', 'status', 'registrationSource', 'emailSenderAddress', 'emailSenderDomainVerified', 'createdAt'],
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
    async prepare(data) {
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
      propertyType: { type: 'select', label: 'Tipo de inmueble', options: [...PROPERTY_TYPES], optionLabels: PROPERTY_TYPE_LABELS },
      transactionType: { type: 'select', label: 'Operación', options: ['sale', 'rent'], optionLabels: { sale: 'Venta', rent: 'Alquiler' } },
      price: { type: 'number', label: 'Precio' },
      area: { type: 'number', label: 'Superficie construida (m²)' },
      bedrooms: { type: 'number', label: 'Dormitorios' },
      bathrooms: { type: 'number', label: 'Baños' },
      mainImage: { type: 'image', label: 'Imagen principal' },
      videoUrl: { type: 'text', label: 'URL del vídeo' },
      // «Disponibilidad», no «Estado»: el estado comercial común (reservada,
      // alquilada, retirada…) es otro dato, de la ficha ampliada (cierre D1p,
      // utils/propertyCommercialStatus.ts).
      status: { type: 'select', label: 'Disponibilidad', options: ['available', 'sold'], optionLabels: { available: 'Disponible', sold: 'Vendida' } },
      agentId: { type: 'number', label: 'Comercial', relation: { resource: 'team', labelField: 'name' } },
      // Parity with developer-properties (migration 0059) — see that
      // resource's fields above for the same `type: 'number'` boolean-coercion
      // note on the has*/is* flags.
      yearBuilt: { type: 'number', label: 'Año de construcción' },
      priceOld: { type: 'number', label: 'Precio anterior' },
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
      serviceChargeAnnual: { type: 'number', label: 'Gastos de comunidad anuales' },
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
    // Texto libre del listado (y de «todos los filtrados»): las tres
    // referencias y la calle (cierre D1p), más el código comercial de la
    // ficha ampliada (`propertyTextSearchCond`, searchService.ts).
    searchFields: ['reference', 'externalReference', 'agencyReference', 'slug', 'location', 'street', 'city', 'district', 'postalCode', 'propertyType'],
    hasTimestamps: true,
    hasUpdatedAt: true,
    tenantPolicy: { type: 'direct' },
    relations: { agentId: { table: schema.teamMembers, label: 'Comercial' } },
    translations: { table: schema.propertyTranslations, foreignKey: 'propertyId' },
    referencePrefix: 'S',
    // Papelera (deleted_at, migración 0086): borrar la manda allí; qué
    // consultas la excluyen está en server/utils/properties/trash.ts.
    softDelete: true,
  },

  'developer-properties': {
    area: 'web',
    table: schema.developerProperties,
    label: 'Proyectos sobre plano',
    fields: {
      developerId: { type: 'number', label: 'Promotora (ID)', required: true },
      name: { type: 'text', label: 'Nombre', required: true },
      slug: { type: 'text', label: 'Slug' },
      // «Estado de la obra»: la fase de construcción, no el estado comercial (cierre D1p).
      status: { type: 'select', label: 'Estado de la obra', options: ['new', 'under_construction', 'ready'], optionLabels: { new: 'Obra nueva', under_construction: 'En construcción', ready: 'Lista' } },
      price: { type: 'number', label: 'Precio desde' },
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
      propertyType: { type: 'select', label: 'Tipo de inmueble', options: [...PROPERTY_TYPES], optionLabels: PROPERTY_TYPE_LABELS },
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
      priceOld: { type: 'number', label: 'Precio anterior' },
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
      serviceChargeAnnual: { type: 'number', label: 'Gastos de comunidad anuales' },
      agentId: { type: 'number', label: 'Comercial', relation: { resource: 'team', labelField: 'name' } },
      // --- Property Core (migración 0068) ---
      // Identificación (FASE 1): la referencia interna la genera
      // referencePrefix si se deja vacía; el resto son opcionales y se
      // dejan NULL hasta que alguien los rellene a propósito — nunca se
      // inventa una fecha de captación o un mandato que no existía.
      reference: { type: 'text', label: 'Referencia interna' },
      externalSource: { type: 'text', label: 'Origen externo' },
      externalReference: { type: 'text', label: 'Referencia externa' },
      agencyReference: { type: 'text', label: 'Referencia de agencia' },
      transactionType: { type: 'select', label: 'Operación', options: ['sale', 'rent'], optionLabels: { sale: 'Venta', rent: 'Alquiler' } },
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
    // Ver `properties`: las tres referencias, más el código comercial (cierre D1p).
    searchFields: ['reference', 'externalReference', 'agencyReference', 'name', 'slug', 'community', 'street', 'city', 'district', 'postalCode'],
    hasTimestamps: true,
    hasUpdatedAt: true,
    tenantPolicy: { type: 'direct' },
    // developerId/agentId are client-supplied: without this, tenant A could
    // attach its project to tenant B's developer or commercial record.
    relations: { developerId: { table: schema.developers, label: 'Promotora' }, agentId: { table: schema.teamMembers, label: 'Comercial' } },
    slugFrom: 'name',
    referencePrefix: 'W',
    // Papelera (deleted_at, migración 0086), igual que 2ª mano.
    softDelete: true,
  },

  /**
   * Saved Filter / Saved View / Shared View sobre Property Search (FASE 27
   * incremento 2, migración 0080) — una sola tabla para las tres, ver el
   * comentario de cabecera de esa migración. `userId` deliberadamente NO
   * está en `fields`: nunca es client-editable, sólo lo fija el servidor a
   * partir de la sesión (mismo patrón que `organizationId` en cualquier
   * recurso `direct`) — ver los branches `isPropertySavedViews` en
   * `[resource]/index.get.ts`/`index.post.ts`/`[id].put.ts`/`[id].delete.ts`
   * para la visibilidad de lectura y el guardado de que sólo el creador
   * pueda editar/borrar, aunque la fila sea compartida.
   */
  'property-saved-views': {
    area: 'web',
    table: schema.propertySavedViews,
    label: 'Filtros y vistas guardadas',
    fields: {
      resource: { type: 'select', label: 'Catálogo', required: true, options: ['properties', 'developer-properties'] },
      kind: { type: 'select', label: 'Tipo', required: true, options: ['filter', 'view'] },
      name: { type: 'text', label: 'Nombre', required: true },
      visibility: { type: 'select', label: 'Visibilidad', options: ['private', 'shared'] },
      queryJson: { type: 'json', label: 'Filtro (JSON)', required: true },
      columnsJson: { type: 'json', label: 'Columnas (JSON)' },
      density: { type: 'select', label: 'Densidad', options: ['comfortable', 'compact'] },
    },
    listFields: ['id', 'resource', 'kind', 'name', 'visibility', 'updatedAt'],
    searchFields: ['name'],
    hasTimestamps: true,
    hasUpdatedAt: true,
    tenantPolicy: { type: 'direct' },
  },

  /**
   * Bulk Actions sobre Propiedades (FASE 28, migración 0081) — el framework
   * genérico de job+items (server/utils/bulkActions/service.ts), nunca un
   * hack por acción. `fields` está vacío a propósito: crear un job y
   * procesar su siguiente elemento son operaciones con forma propia, no un
   * alta/edición de campos — los branches `key === 'property-bulk-jobs'` en
   * `index.post.ts`/`[id].put.ts` interceptan antes de llegar a
   * `buildPayload()`. GET/LIST sí usan el motor genérico tal cual (un job es
   * una fila más, visible para toda la organización — no es privado como un
   * filtro guardado).
   */
  'property-bulk-jobs': {
    area: 'web',
    table: schema.bulkActionJobs,
    label: 'Acciones masivas (propiedades)',
    fields: {},
    listFields: ['id', 'entityType', 'action', 'status', 'totalCount', 'completedCount', 'failedCount', 'createdAt'],
    searchFields: [],
    hasTimestamps: true,
    tenantPolicy: { type: 'direct' },
  },

  /**
   * Bulk Actions sobre Leads (FASE 28 incremento 3) — la misma tabla
   * genérica `bulk_action_jobs` que ya usa `property-bulk-jobs`
   * (`entityType: 'lead'` las distingue), nunca una segunda tabla de jobs.
   * Área `crm`, igual que `lead-routing-rules`/`clients`: es donde vive el
   * resto de RBAC de Leads, no `web`.
   */
  'lead-bulk-jobs': {
    area: 'crm',
    table: schema.bulkActionJobs,
    label: 'Acciones masivas (leads)',
    fields: {},
    listFields: ['id', 'entityType', 'action', 'status', 'totalCount', 'completedCount', 'failedCount', 'createdAt'],
    searchFields: [],
    hasTimestamps: true,
    tenantPolicy: { type: 'direct' },
  },

  /**
   * Domain Tools API (FASE 31). `POST /api/admin/domain-tools` ejecuta una
   * herramienta y `GET ?view=catalog` lista las que el RBAC del usuario
   * permite: ambos interceptados en [resource]/index.{post,get}.ts, con el
   * área de cada herramienta comprobada en executeTool(). El listado
   * genérico de este recurso es la TRAZA (domain_tool_calls) — observabilidad
   * del área Sistema, de sólo lectura e imborrable.
   */
  'domain-tools': {
    area: 'system',
    table: schema.domainToolCalls,
    label: 'Domain Tools (traza)',
    fields: {},
    listFields: ['id', 'tool', 'kind', 'source', 'status', 'errorCode', 'targetType', 'targetId', 'latencyMs', 'userId', 'createdAt'],
    searchFields: ['tool', 'errorCode'],
    tenantPolicy: { type: 'direct' },
    readonly: true,
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
      ...GALLERY_METADATA_FIELDS,
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
    // La galería de UNA propiedad (antes el gestor pedía 100 filas de toda la agencia y filtraba en el navegador).
    filterFields: ['developerPropertyId'],
    prepare: async (data) => normalizeMediaMetadata(data),
  },

  'gallery-images': {
    area: 'web',
    table: schema.propertyGalleryImages,
    label: 'Galería de la propiedad',
    fields: {
      propertyId: { type: 'number', label: 'Propiedad (ID)', required: true },
      image: { type: 'image', label: 'Imagen', required: true },
      sortOrder: { type: 'number', label: 'Orden' },
      ...GALLERY_METADATA_FIELDS,
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
    filterFields: ['propertyId'],
    prepare: async (data) => normalizeMediaMetadata(data),
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

  /**
   * Reglas de Lead Routing (FASE 15, migración 0071). `priority` decide el
   * orden de evaluación (menor primero) — server/utils/leads/routing.ts es
   * quien las lee y decide, este CRUD sólo las mantiene. `targetDepartment`
   * reutiliza `team_members.department` (texto libre ya existente).
   *
   * Cierre del núcleo: el panel ya no usa el formulario genérico para este
   * recurso sino components/admin/leads/RoutingRuleEditor.vue (desplegables
   * de oficinas, equipos e idiomas y editor de horario). `matchValue` sigue
   * siendo texto —el id de la oficina o del equipo, el código del idioma—, y
   * `validateRoutingRule()` lo comprueba al guardar.
   */
  'lead-routing-rules': {
    area: 'crm',
    table: schema.leadRoutingRules,
    label: 'Reglas de enrutado de leads',
    fields: {
      name: { type: 'text', label: 'Nombre', required: true },
      priority: { type: 'number', label: 'Prioridad (menor = antes)' },
      scope: { type: 'select', label: 'Ámbito', required: true, options: [...ROUTING_SCOPES], optionLabels: ROUTING_SCOPE_LABELS },
      matchValue: { type: 'text', label: 'Valor a comparar' },
      targetCommercialId: { type: 'number', label: 'Comercial fijo (opcional)', relation: { resource: 'team', labelField: 'name' } },
      targetOfficeId: { type: 'number', label: 'Repartir dentro de la oficina', relation: { resource: 'offices', labelField: 'name' } },
      targetDepartment: { type: 'text', label: 'Departamento destino (reparto)' },
      strategy: { type: 'select', label: 'Reparto', options: ['round_robin', 'workload'], optionLabels: { round_robin: 'Por turnos (round robin)', workload: 'Por carga de trabajo' } },
      scheduleJson: { type: 'json', label: 'Horario' },
      enabled: { type: 'number', label: 'Activa (1/0)' },
    },
    listFields: ['id', 'name', 'priority', 'scope', 'matchValue', 'targetOfficeId', 'targetDepartment', 'strategy', 'enabled'],
    searchFields: ['name', 'scope', 'matchValue', 'targetDepartment'],
    hasTimestamps: true,
    hasUpdatedAt: true,
    tenantPolicy: { type: 'direct' },
    relations: { targetCommercialId: { table: schema.teamMembers, label: 'Comercial' }, targetOfficeId: { table: schema.offices, label: 'Oficina' } },
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
      // Oficina y equipo como entidades (migración 0086); `officeName` queda
      // como texto heredado de las fichas anteriores.
      officeId: { type: 'number', label: 'Oficina', relation: { resource: 'offices', labelField: 'name' } },
      teamId: { type: 'number', label: 'Equipo', relation: { resource: 'teams', labelField: 'name' } },
      // El usuario del panel que ES este comercial: lo que permite a cada
      // comercial ver "lo suyo" (sus leads, visitas y tareas).
      userId: { type: 'number', label: 'Usuario del panel', relation: { resource: 'users', labelField: 'name' } },
      officeName: { type: 'text', label: 'Oficina (texto anterior)' },
      managerId: { type: 'number', label: 'Responsable', relation: { resource: 'team', labelField: 'name' } },
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
    // manager at tenant B's team member. Same for the office, team and panel
    // user links (migración 0086).
    relations: {
      managerId: { table: schema.teamMembers, label: 'Responsable' },
      officeId: { table: schema.offices, label: 'Oficina' },
      teamId: { table: schema.teams, label: 'Equipo' },
      userId: { table: schema.users, label: 'Usuario del panel' },
    },
    slugFrom: 'name',
  },

  /**
   * Oficinas (núcleo inmobiliario, migración 0086). Lo que filtra, enruta y
   * segmenta por oficina es este id — leads, citas, propiedades, comerciales
   * y reglas de reparto lo referencian. Borrar una oficina la manda a la
   * Papelera: lo que la referenciaba conserva el id (y su historia).
   */
  offices: {
    area: 'crm',
    table: schema.offices,
    label: 'Oficinas',
    fields: {
      name: { type: 'text', label: 'Nombre', required: true },
      code: { type: 'text', label: 'Código' },
      email: { type: 'text', label: 'Email' },
      phone: { type: 'text', label: 'Teléfono' },
      address: { type: 'text', label: 'Dirección' },
      city: { type: 'text', label: 'Localidad' },
      province: { type: 'text', label: 'Provincia' },
      postalCode: { type: 'text', label: 'Código postal' },
      country: { type: 'text', label: 'País' },
      timezone: { type: 'text', label: 'Zona horaria (p. ej. Europe/Madrid)' },
      status: { type: 'select', label: 'Estado', options: ['active', 'inactive'], optionLabels: { active: 'Activa', inactive: 'Inactiva' } },
    },
    listFields: ['id', 'name', 'code', 'city', 'phone', 'status'],
    searchFields: ['name', 'code', 'city', 'email', 'phone'],
    hasTimestamps: true,
    hasUpdatedAt: true,
    tenantPolicy: { type: 'direct' },
    softDelete: true,
    prepare: async (data) => validateOfficeOrTeam(data),
  },

  /**
   * Contactos (FASES 8-9) en el motor genérico: es lo que da la edición
   * (PUT) que no existía, la papelera y las opciones de los selectores de
   * contacto. El alta y la edición pasan por server/utils/contacts/crm.ts
   * (normalización, deduplicación, roles), no por el guardado genérico.
   * El listado y la ficha 360 siguen en /api/admin/saas/contacts*.
   */
  contacts: {
    area: 'crm',
    table: schema.contacts,
    label: 'Contactos',
    fields: {
      name: { type: 'text', label: 'Nombre', required: true },
      kind: { type: 'select', label: 'Tipo', options: ['person', 'company'], optionLabels: { person: 'Persona', company: 'Empresa' } },
      email: { type: 'text', label: 'Email' },
      phone: { type: 'text', label: 'Teléfono' },
      whatsapp: { type: 'text', label: 'WhatsApp' },
      language: { type: 'select', label: 'Idioma', options: [...LANGUAGE_OPTIONS], optionLabels: LANGUAGE_LABELS },
      country: { type: 'text', label: 'País' },
      source: { type: 'select', label: 'Origen', options: [...CONTACT_SOURCES], optionLabels: CONTACT_SOURCE_LABELS },
      assignedCommercialId: { type: 'number', label: 'Comercial responsable', relation: { resource: 'team', labelField: 'name' } },
      officeId: { type: 'number', label: 'Oficina', relation: { resource: 'offices', labelField: 'name' } },
      status: { type: 'select', label: 'Estado', options: [...CONTACT_STATUSES], optionLabels: CONTACT_STATUS_LABELS },
      nextActionType: { type: 'select', label: 'Próxima acción', options: [...NEXT_ACTION_TYPES], optionLabels: NEXT_ACTION_LABELS },
      nextActionAt: { type: 'text', label: 'Fecha de la próxima acción' },
      notes: { type: 'textarea', label: 'Notas' },
    },
    listFields: ['id', 'name', 'email', 'phone', 'status'],
    searchFields: ['name', 'email', 'phone', 'whatsapp'],
    hasTimestamps: true,
    hasUpdatedAt: true,
    tenantPolicy: { type: 'direct' },
    relations: { assignedCommercialId: { table: schema.teamMembers, label: 'Comercial' }, officeId: { table: schema.offices, label: 'Oficina' } },
    softDelete: true,
  },

  /**
   * Leads (FASES 12-16). El alta, la edición y la ficha pasan por
   * server/utils/leads/admin.ts (deduplicación, enrutado, historiales); la
   * etapa, el resultado y el comercial se cambian por sus propias rutas
   * (saas/leads/:id y /reassign), que son las que dejan historial. Un lead no
   * se borra desde aquí: se marca como perdido.
   */
  leads: {
    area: 'crm',
    table: schema.leads,
    label: 'Leads',
    fields: {
      name: { type: 'text', label: 'Nombre', required: true },
      email: { type: 'text', label: 'Email' },
      phone: { type: 'text', label: 'Teléfono' },
      whatsapp: { type: 'text', label: 'WhatsApp' },
      source: { type: 'select', label: 'Origen', required: true, options: [...LEAD_SOURCES], optionLabels: LEAD_SOURCE_LABELS },
      sourceDetail: { type: 'text', label: 'Detalle del origen' },
      priority: { type: 'select', label: 'Prioridad', options: [...LEAD_PRIORITIES], optionLabels: LEAD_PRIORITY_LABELS },
      language: { type: 'select', label: 'Idioma', options: [...LANGUAGE_OPTIONS], optionLabels: LANGUAGE_LABELS },
      budget: { type: 'number', label: 'Presupuesto' },
      officeId: { type: 'number', label: 'Oficina', relation: { resource: 'offices', labelField: 'name' } },
      teamId: { type: 'number', label: 'Equipo', relation: { resource: 'teams', labelField: 'name' } },
      notes: { type: 'textarea', label: 'Notas' },
    },
    listFields: ['id', 'name', 'email', 'phone', 'source', 'stage', 'agentName'],
    searchFields: ['name', 'email', 'phone', 'propertyName'],
    hasTimestamps: true,
    hasUpdatedAt: true,
    tenantPolicy: { type: 'direct' },
    relations: {
      officeId: { table: schema.offices, label: 'Oficina' },
      teamId: { table: schema.teams, label: 'Equipo' },
      agentId: { table: schema.teamMembers, label: 'Comercial' },
      contactId: { table: schema.contacts, label: 'Contacto' },
    },
  },

  /**
   * Contactos de una propiedad (PropertyContact, FASE 8): propietario,
   * copropietario, apoderado, inquilino o contacto, con % de propiedad. La
   * propiedad se valida por catálogo (propertyKind) en
   * server/utils/contacts/crm.ts#validatePropertyContact.
   */
  'property-contacts': {
    area: 'crm',
    table: schema.propertyContacts,
    label: 'Propietarios y contactos de la propiedad',
    fields: {
      propertyKind: { type: 'select', label: 'Catálogo', required: true, options: ['agent', 'developer'], optionLabels: { agent: '2ª mano', developer: 'Web / obra nueva' } },
      propertyId: { type: 'number', label: 'Propiedad', required: true },
      contactId: { type: 'number', label: 'Contacto', required: true, relation: { resource: 'contacts', labelField: 'name' } },
      role: { type: 'select', label: 'Papel', required: true, options: [...PROPERTY_CONTACT_ROLES], optionLabels: PROPERTY_CONTACT_ROLE_LABELS },
      ownershipPct: { type: 'number', label: '% de propiedad' },
      isPrimary: { type: 'number', label: 'Principal' },
      notes: { type: 'textarea', label: 'Notas' },
    },
    listFields: ['id', 'propertyKind', 'propertyId', 'contactId', 'role', 'ownershipPct'],
    searchFields: [],
    hasTimestamps: true,
    hasUpdatedAt: true,
    tenantPolicy: { type: 'direct' },
    relations: { contactId: { table: schema.contacts, label: 'Contacto' } },
    softDelete: true,
    filterFields: ['propertyKind', 'propertyId', 'contactId', 'role'],
    decorateRows: async (db, orgId, rows) => {
      const ids = [...new Set(rows.map((r) => r.contactId))]
      if (!ids.length) return rows
      const contacts = await selectInChunks(ids, (part) =>
        db
          .select({ id: schema.contacts.id, name: schema.contacts.name, email: schema.contacts.email, phone: schema.contacts.phone })
          .from(schema.contacts)
          .where(and(eq(schema.contacts.organizationId, orgId), inArray(schema.contacts.id, part))),
      )
      const byId = new Map<number, any>(contacts.map((c: any) => [c.id, c]))
      return rows.map((r) => ({ ...r, contact: byId.get(r.contactId) || null }))
    },
  },

  /**
   * Selecciones de propiedades de una persona (FASE 11, cierre C2): la vista
   * propia de una selección (pages/admin/contactos/selecciones/[id].vue) sin ruta
   * nueva. `GET /:id` trae la selección con su contacto, su necesidad y sus
   * propiedades de los dos catálogos (foto, precio, estado); `PUT /:id` con
   * `{ action: 'reorder' | 'remove' | 'add' }` reordena, quita o añade
   * (server/utils/selections/service.ts, mismas reglas que al crearla). Se
   * crean desde una compatibilidad o con INMO, con su validación propia: el
   * alta genérica responde 405 y por eso `fields` está vacío. Borrar una
   * selección se lleva sus propiedades (FK en cascada). Área CRM.
   */
  'property-selections': {
    area: 'crm',
    table: schema.propertySelections,
    label: 'Selecciones de propiedades',
    fields: {},
    listFields: ['id', 'title', 'contactId', 'updatedAt'],
    searchFields: ['title'],
    hasTimestamps: true,
    hasUpdatedAt: true,
    tenantPolicy: { type: 'direct' },
    filterFields: ['contactId'],
  },

  /**
   * Documentos de una propiedad (FASE 6, bloque N7a), de los dos catálogos.
   * El alta va con su fichero por `POST …/property-documents/private-upload`
   * (server/utils/properties/documents.ts); el motor genérico lista, edita
   * metadatos, manda a la papelera, restaura y borra. `PUT` con
   * `{ action: 'grant' | 'revoke', contactId }` concede o revoca el acceso a
   * un contacto. El fichero, el tamaño y el autor no son editables: los
   * fija el servidor.
   */
  'property-documents': {
    area: 'web',
    table: schema.propertyDocuments,
    label: 'Documentos de la propiedad',
    fields: {
      propertyKind: { type: 'select', label: 'Catálogo', required: true, options: ['agent', 'developer'], optionLabels: { agent: '2ª mano', developer: 'Web / obra nueva' } },
      propertyId: { type: 'number', label: 'Propiedad', required: true },
      docType: { type: 'select', label: 'Tipo de documento', required: true, options: [...PROPERTY_DOCUMENT_TYPES], optionLabels: PROPERTY_DOCUMENT_TYPE_LABELS },
      title: { type: 'text', label: 'Título', required: true },
      visibility: { type: 'select', label: 'Quién puede verlo', options: [...DOCUMENT_VISIBILITIES], optionLabels: DOCUMENT_VISIBILITY_LABELS },
      issuedAt: { type: 'text', label: 'Fecha de emisión' },
      expiresAt: { type: 'text', label: 'Fecha de caducidad' },
      notes: { type: 'textarea', label: 'Notas' },
    },
    listFields: ['id', 'title', 'docType', 'visibility', 'expiresAt', 'createdAt'],
    searchFields: ['title', 'fileName', 'notes'],
    hasTimestamps: true,
    hasUpdatedAt: true,
    tenantPolicy: { type: 'direct' },
    softDelete: true,
    filterFields: ['propertyKind', 'propertyId', 'docType', 'visibility'],
    decorateRows: (db, orgId, rows) => decorateDocumentRows(db, orgId, rows),
  },

  /**
   * Multimedia de una propiedad que no es una foto de galería ni un plano
   * (FASE 7, bloque N7a): vídeos (varios), tours virtuales, renders, PDF,
   * drone y fotos 360, con título, alt, pie, idioma, principal, publicable,
   * privado y oculto. Validado en server/utils/properties/media.ts.
   */
  'property-media': {
    area: 'web',
    table: schema.propertyMedia,
    label: 'Multimedia de la propiedad',
    fields: {
      propertyKind: { type: 'select', label: 'Catálogo', required: true, options: ['agent', 'developer'], optionLabels: { agent: '2ª mano', developer: 'Web / obra nueva' } },
      propertyId: { type: 'number', label: 'Propiedad', required: true },
      mediaType: { type: 'select', label: 'Tipo de recurso', required: true, options: [...PROPERTY_MEDIA_TYPES], optionLabels: PROPERTY_MEDIA_TYPE_LABELS },
      url: { type: 'text', label: 'Enlace (https://)' },
      r2Key: { type: 'file', label: 'Fichero' },
      ...GALLERY_METADATA_FIELDS,
      isMain: { type: 'number', label: 'Principal de su tipo' },
      sortOrder: { type: 'number', label: 'Orden' },
    },
    listFields: ['id', 'mediaType', 'title', 'isPublishable', 'isPrivate', 'isHidden'],
    searchFields: ['title', 'caption'],
    hasTimestamps: true,
    hasUpdatedAt: true,
    tenantPolicy: { type: 'direct' },
    softDelete: true,
    filterFields: ['propertyKind', 'propertyId', 'mediaType'],
  },

  /** Nota como entidad (FASE 0): de un contacto, lead, propiedad, cita u operación. */
  notes: {
    area: 'crm',
    table: schema.notes,
    label: 'Notas',
    fields: {
      entityType: { type: 'select', label: 'Sobre', required: true, options: [...NOTE_ENTITY_TYPES] },
      entityId: { type: 'number', label: 'Registro', required: true },
      propertyKind: { type: 'select', label: 'Catálogo (si es una propiedad)', options: ['agent', 'developer'] },
      body: { type: 'textarea', label: 'Nota', required: true },
      isPinned: { type: 'number', label: 'Fijada' },
    },
    listFields: ['id', 'entityType', 'entityId', 'body', 'createdAt'],
    searchFields: ['body'],
    hasTimestamps: true,
    hasUpdatedAt: true,
    tenantPolicy: { type: 'direct' },
    softDelete: true,
    // `source` (migración 0088): la «Memoria» de INMO lista las notas con source = inmo.
    filterFields: ['entityType', 'entityId', 'propertyKind', 'contactId', 'leadId', 'propertyId', 'appointmentId', 'dealOperationId', 'source'],
    decorateRows: async (db, orgId, rows) => {
      const ids = [...new Set(rows.map((r) => r.createdBy).filter(Boolean))]
      if (!ids.length) return rows
      const users = await selectInChunks(ids, (part) =>
        db
          .select({ id: schema.users.id, name: schema.users.name })
          .from(schema.users)
          .where(and(inArray(schema.users.id, part), or(eq(schema.users.organizationId, orgId), eq(schema.users.role, 'super_admin')))),
      )
      const byId = new Map<number, string>(users.map((u: any) => [u.id, u.name]))
      return rows.map((r) => ({ ...r, authorName: byId.get(r.createdBy) || null }))
    },
  },

  /**
   * Campos personalizados (FASE 0, bloque N7b): la DEFINICIÓN de un campo
   * extra de propiedades, contactos, leads, citas u operaciones. Página
   * CRM → Campos personalizados. La validación (clave inmutable, opciones de
   * las listas, tipo que no cambia con valores ya guardados, «público» sólo en
   * propiedades) está en server/utils/customFields/service.ts, llamada desde
   * los POST/PUT genéricos. Borrar la manda a la Papelera; archivar la oculta
   * de las fichas sin perder los valores.
   */
  'custom-fields': {
    area: 'crm',
    table: schema.customFieldDefinitions,
    label: 'Campos personalizados',
    fields: {
      entityType: { type: 'select', label: 'Se aplica a', required: true, options: [...CUSTOM_FIELD_ENTITY_TYPES], optionLabels: CUSTOM_FIELD_ENTITY_LABELS },
      key: { type: 'text', label: 'Clave interna' },
      label: { type: 'text', label: 'Etiqueta', required: true },
      fieldType: { type: 'select', label: 'Tipo de campo', required: true, options: [...CUSTOM_FIELD_TYPES], optionLabels: CUSTOM_FIELD_TYPE_LABELS },
      optionsJson: { type: 'json', label: 'Opciones (lista)' },
      isRequired: { type: 'number', label: 'Obligatorio' },
      section: { type: 'text', label: 'Sección' },
      sortOrder: { type: 'number', label: 'Orden' },
      helpText: { type: 'textarea', label: 'Ayuda' },
      isPublic: { type: 'number', label: 'Visible en la web pública' },
      status: { type: 'select', label: 'Estado', options: ['active', 'archived'], optionLabels: { active: 'Activo', archived: 'Archivado' } },
    },
    listFields: ['id', 'entityType', 'label', 'fieldType', 'section', 'status'],
    searchFields: ['label', 'key', 'section'],
    hasTimestamps: true,
    hasUpdatedAt: true,
    tenantPolicy: { type: 'direct' },
    softDelete: true,
    filterFields: ['entityType', 'status'],
    // Cuántos registros tienen valor en cada campo: el panel avisa antes de cambiarlo o borrarlo.
    decorateRows: async (db, orgId, rows) => {
      const counts = await countValuesByDefinition(db, orgId, rows.map((r) => r.id))
      return rows.map((r) => ({ ...r, valuesCount: counts.get(r.id) || 0 }))
    },
  },

  /**
   * Valores de los campos personalizados de UNA ficha. Dos recursos sobre la
   * misma tabla porque el área de permisos la pone la entidad: propiedades
   * (los dos catálogos) → Portal Web; el resto → CRM. GET y POST los atiende
   * server/utils/customFields/service.ts (`{ entityType, entityKind, entityId }`
   * comprobado contra la organización; valores validados por tipo); PUT y
   * DELETE por fila no existen (405).
   */
  'property-custom-field-values': {
    area: 'web',
    table: schema.customFieldValues,
    label: 'Campos personalizados (propiedades)',
    fields: {},
    listFields: ['id', 'definitionId', 'entityKind', 'entityId'],
    searchFields: [],
    hasTimestamps: true,
    hasUpdatedAt: true,
    tenantPolicy: { type: 'direct' },
  },
  'custom-field-values': {
    area: 'crm',
    table: schema.customFieldValues,
    label: 'Campos personalizados (CRM)',
    fields: {},
    listFields: ['id', 'definitionId', 'entityType', 'entityId'],
    searchFields: [],
    hasTimestamps: true,
    hasUpdatedAt: true,
    tenantPolicy: { type: 'direct' },
  },

  /**
   * Etiquetas a mano (FASE 0, bloque N7b): añadir (POST, por nombre o por id
   * de una etiqueta de la agencia) y quitar (DELETE del enlace) desde una
   * ficha; el GET da las de un registro o el catálogo de la agencia. Mismo
   * Tag transversal que la acción masiva (server/utils/tags/service.ts). Dos
   * recursos por el área: propiedades → Portal Web; leads y contactos → CRM.
   */
  'property-tags': {
    area: 'web',
    table: schema.tagLinks,
    label: 'Etiquetas (propiedades)',
    fields: {},
    listFields: ['id', 'tagId', 'entityType', 'entityId'],
    searchFields: [],
    hasTimestamps: true,
    tenantPolicy: { type: 'direct' },
  },
  'crm-tags': {
    area: 'crm',
    table: schema.tagLinks,
    label: 'Etiquetas (contactos y leads)',
    fields: {},
    listFields: ['id', 'tagId', 'entityType', 'entityId'],
    searchFields: [],
    hasTimestamps: true,
    tenantPolicy: { type: 'direct' },
  },

  /**
   * Automatizaciones (bloque N8b, migración 0088): reglas reales «cuando pase
   * X, si se cumple Y, haz Z» que ejecuta server/utils/automations/engine.ts.
   * Alta y edición tienen forma propia (disparador, condiciones, acción y su
   * configuración, validadas y con el permiso de quien la configura): las
   * interceptan [resource]/index.post.ts y [id].put.ts antes de buildPayload,
   * por eso `fields` está vacío. La ficha (GET /:id) trae su registro de
   * ejecuciones. Borrar = borrado lógico (deja de ejecutarse). Área CRM: sus
   * disparadores y acciones son de CRM.
   */
  automations: {
    area: 'crm',
    table: schema.automations,
    label: 'Automatizaciones',
    fields: {},
    listFields: ['id', 'name', 'trigger', 'action', 'enabled', 'runsCount', 'lastRunAt'],
    searchFields: ['name', 'description'],
    tenantPolicy: { type: 'direct' },
    softDelete: true,
    filterFields: ['engine', 'trigger', 'enabled'],
    decorateRows: async (db, orgId, rows) => (await import('./automations/service')).decorateAutomations(db, orgId, rows),
  },

  /**
   * Base de conocimiento de INMO (bloque N8b, migración 0088): documentos de
   * texto de la agencia que INMO consulta y cita (search_knowledge). Por
   * agencia, con borrado lógico. `search_text` lo calcula el servidor.
   */
  'knowledge-documents': {
    area: 'crm',
    table: schema.knowledgeDocuments,
    label: 'Base de conocimiento',
    fields: {
      title: { type: 'text', label: 'Título', required: true },
      body: { type: 'textarea', label: 'Texto', required: true },
      tags: { type: 'text', label: 'Etiquetas (separadas por comas)' },
      status: { type: 'select', label: 'Estado', options: ['active', 'archived'], optionLabels: { active: 'Activo (INMO lo consulta)', archived: 'Archivado (INMO no lo consulta)' } },
    },
    listFields: ['id', 'title', 'tags', 'status', 'updatedAt'],
    searchFields: ['title', 'tags'],
    hasTimestamps: true,
    hasUpdatedAt: true,
    tenantPolicy: { type: 'direct' },
    softDelete: true,
    filterFields: ['status'],
    // En la edición la valida [id].put.ts con la fila existente (search_text necesita el documento entero).
    prepare: async (data, isCreate) => (isCreate ? prepareKnowledgeDocument(data, true) : data),
  },

  /**
   * Ajustes de la agencia sobre los cerebros de INMO (bloque N8b, migración
   * 0088): activar/desactivar, indicaciones propias y RECORTAR herramientas —
   * nunca añadir ninguna que el perfil no tenga (422). Área Sistema: cambia
   * cómo trabaja INMO para toda la agencia. Leer los cerebros efectivos
   * (para elegir uno en INMO) va por GET /api/admin/domain-tools?view=brains.
   */
  'inmo-brains': {
    area: 'system',
    table: schema.inmoBrainSettings,
    label: 'Cerebros de INMO',
    fields: {
      brainKey: { type: 'select', label: 'Perfil', required: true, options: INMO_BRAINS.map((b) => b.key), optionLabels: Object.fromEntries(INMO_BRAINS.map((b) => [b.key, b.label])) },
      enabled: { type: 'number', label: 'Activo' },
      instructions: { type: 'textarea', label: 'Indicaciones de la agencia' },
      toolsJson: { type: 'json', label: 'Herramientas permitidas (subconjunto del perfil)' },
    },
    listFields: ['id', 'brainKey', 'enabled', 'updatedAt'],
    searchFields: ['brainKey'],
    hasTimestamps: true,
    hasUpdatedAt: true,
    tenantPolicy: { type: 'direct' },
    prepare: async (data, isCreate) => (isCreate ? prepareBrainSettings(data, true) : data),
  },

  /** Equipos comerciales (migración 0086), opcionalmente dentro de una oficina. */
  teams: {
    area: 'crm',
    table: schema.teams,
    label: 'Equipos',
    fields: {
      name: { type: 'text', label: 'Nombre', required: true },
      officeId: { type: 'number', label: 'Oficina', relation: { resource: 'offices', labelField: 'name' } },
      leadMemberId: { type: 'number', label: 'Responsable del equipo', relation: { resource: 'team', labelField: 'name' } },
      description: { type: 'textarea', label: 'Descripción' },
      status: { type: 'select', label: 'Estado', options: ['active', 'inactive'], optionLabels: { active: 'Activo', inactive: 'Inactivo' } },
    },
    listFields: ['id', 'name', 'officeId', 'leadMemberId', 'status'],
    searchFields: ['name', 'description'],
    hasTimestamps: true,
    hasUpdatedAt: true,
    tenantPolicy: { type: 'direct' },
    relations: { officeId: { table: schema.offices, label: 'Oficina' }, leadMemberId: { table: schema.teamMembers, label: 'Responsable del equipo' } },
    softDelete: true,
    prepare: async (data) => validateOfficeOrTeam(data),
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

/**
 * Un índice único que salta (nombre de oficina repetido, slug o referencia ya
 * usados…) es un error del usuario, no del servidor: 409 con un mensaje que
 * se pueda leer, en vez del 500 crudo de D1.
 */
export function rethrowUniqueViolation(err: unknown): never {
  const msg = String((err as any)?.cause?.message || (err as any)?.message || '')
  if (msg.includes('UNIQUE constraint failed')) {
    throw createError({ statusCode: 409, statusMessage: 'Ya existe otro registro con ese mismo valor (el mismo nombre, referencia, código o usuario vinculado). Usa otro.' })
  }
  throw err
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
