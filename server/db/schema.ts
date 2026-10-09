import { sqliteTable, text, integer, real, uniqueIndex, index } from 'drizzle-orm/sqlite-core'

// ---------------------------------------------------------------------------
// Multi-tenant: organizations ("empresas")
// ---------------------------------------------------------------------------
// One shared D1 database serves every tenant. Every tenant-scoped table below
// carries an `organizationId` column pointing here (app-level FK only — D1
// doesn't enforce FKs added via ALTER TABLE). Org id 1 is the pre-existing
// tenant ("M&M Real Estate"), created by the 0021 migration as part of the
// backfill so historical data has a real row to point at.

export const organizations = sqliteTable('organizations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  domain: text('domain').unique(), // custom domain/subdomain once assigned; null until then
  companyName: text('company_name'), // public-facing brand name; falls back to `name`
  logo: text('logo'),
  brandColor: text('brand_color'),
  status: text('status').notNull().default('active'), // active | suspended
  createdAt: text('created_at').notNull().default(''),
  updatedAt: text('updated_at').notNull().default(''),
  // Added by 0039. Reconciled from media_assets — see server/utils/mediaQuota.ts.
  storageBytesUsed: integer('storage_bytes_used').notNull().default(0),
  storageBytesLimit: integer('storage_bytes_limit').notNull().default(5_368_709_120), // 5 GiB
  // Added by 0044 — per-org email identity (server/utils/email/). All
  // nullable/defaulted: an org with none of this set falls back to the
  // platform defaults in server/utils/email/send.ts.
  emailSenderName: text('email_sender_name'),
  emailSenderAddress: text('email_sender_address'),
  // Set by checking Resend's Domains API when emailSenderAddress is saved
  // (server/utils/email/resendDomains.ts) — never a manual toggle.
  emailSenderDomainVerified: integer('email_sender_domain_verified').notNull().default(0),
  emailSenderDomainCheckedAt: text('email_sender_domain_checked_at'),
  emailReplyTo: text('email_reply_to'),
  // JSON array of staff email addresses notified on new leads/contact
  // messages/complaints — internal-operations mail, not sent to the org's
  // own public sender address.
  emailInternalRecipientsJson: text('email_internal_recipients_json').notNull().default('[]'),
  emailLocale: text('email_locale').notNull().default('es'), // es | en
  // Added by 0045 — real data-controller identity for privacy/terms pages
  // (pages/privacidad.vue, pages/terminos.vue). Nullable: those pages show
  // "por confirmar" rather than a fabricated value until an org fills these in.
  legalCompanyName: text('legal_company_name'),
  taxId: text('tax_id'), // CIF/NIF or equivalent
  legalAddress: text('legal_address'),
  legalEmail: text('legal_email'),
  legalPhone: text('legal_phone'),
  // Added by 0085 — dimensiones separadas que combina la política de acceso
  // (server/utils/organizations/access.ts): `status` es el estado operativo
  // que decide el super admin; éstas dicen cómo se dio de alta y si falta
  // aprobación o pago. Defaults = comportamiento previo (acceso normal).
  registrationSource: text('registration_source').notNull().default('admin'), // admin | self_service
  approvalStatus: text('approval_status').notNull().default('approved'), // approved | pending | rejected
  billingStatus: text('billing_status').notNull().default('not_required'), // not_required | pending | active | past_due
})

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // Null only for 'super_admin' — the platform owner's account, which belongs
  // to no single org and can view/manage every organization.
  organizationId: integer('organization_id').references(() => organizations.id),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  password: text('password').notNull(), // pbkdf2$<iterations>$<salt>$<hash>
  role: text('role').notNull().default('user'), // 'super_admin' | 'admin' | 'user'
  // Nullable JSON array of "<area>:<action>" strings (server/utils/permissions.ts).
  // NULL = unrestricted (full access within the org) — the default, and the
  // only value any pre-existing account has, so this is purely additive to
  // current behavior. super_admin always bypasses this regardless of value.
  permissions: text('permissions'),
  createdAt: text('created_at').notNull().default(''),
  updatedAt: text('updated_at').notNull().default(''),
  // Segundo factor TOTP (migración 0063, server/utils/twoFactor.ts). El
  // secreto va cifrado con TOTP_ENCRYPTION_KEY; enabled_at NULL = no activo.
  totpSecret: text('totp_secret'),
  totpSecretIv: text('totp_secret_iv'),
  totpEnabledAt: text('totp_enabled_at'),
  totpLastUsedStep: integer('totp_last_used_step'),
})

/** Códigos de recuperación del 2FA: sólo el hash; un uso cada uno (migración 0063). */
export const userRecoveryCodes = sqliteTable(
  'user_recovery_codes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    usedAt: text('used_at'),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('user_recovery_codes_user').on(t.userId, t.usedAt)],
)

/**
 * Contraseña correcta pero segundo factor pendiente (migración 0063). La
 * sesión no existe hasta que el código pasa; esto es lo único que hay entre
 * medias, y caduca en minutos.
 */
export const loginChallenges = sqliteTable(
  'login_challenges',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: text('expires_at').notNull(),
    attempts: integer('attempts').notNull().default(0),
    consumedAt: text('consumed_at'),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('login_challenges_user').on(t.userId, t.expiresAt)],
)

export const sessions = sqliteTable('sessions', {
  // Opaque internal id, unrelated to the session cookie's raw token — see
  // tokenHash below. NULL only briefly impossible; always set on insert.
  id: text('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull().default(''),
  // SHA-256 hex of the raw session token (server/utils/auth.ts) — the raw
  // token itself is never stored, only ever held by the client's cookie.
  // Nullable for backward compatibility with sessions created before this
  // column existed (migration 0052); those rows are matched via the legacy
  // `id = token` fallback in getSessionUser() and rotated to a real hash on
  // their next valid use.
  tokenHash: text('token_hash'),
})

// ---------------------------------------------------------------------------
// Agents & secondary-sale properties
// ---------------------------------------------------------------------------

export const agents = sqliteTable(
  'agents',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    profileImage: text('profile_image'),
    licenseNumber: text('license_number'),
    bio: text('bio'),
    status: text('status').notNull().default('active'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  // email is scoped (organizationId, email), not globally unique — migration 0053.
  (t) => [uniqueIndex('agents_org_email').on(t.organizationId, t.email), index('agents_org').on(t.organizationId)],
)

// slug is scoped (organizationId, slug), not globally unique — migration
// 0042. Two unrelated agencies can both use "downtown-loft".
export const agentProperties = sqliteTable(
  'agent_properties',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    slug: text('slug'),
    location: text('location'),
    country: text('country'),
    city: text('city'),
    street: text('street'),
    streetNumber: text('street_number'),
    community: text('community'),
    block: text('block'),
    portal: text('portal'),
    floor: text('floor'),
    doorLetter: text('door_letter'),
    postalCode: text('postal_code'),
    district: text('district'),
    lat: real('lat'),
    lng: real('lng'),
    propertyType: text('property_type'),
    transactionType: text('transaction_type'), // sale | rent
    price: real('price'),
    area: real('area'),
    bedrooms: integer('bedrooms'),
    bathrooms: integer('bathrooms'),
    mainImage: text('main_image'),
    videoUrl: text('video_url'),
    status: text('status').notNull().default('available'), // available | sold
    agentId: integer('agent_id'),
    // --- Parity with developer_properties (added 0059) — equally applicable
    // to a resale unit; see migrations/0059_second_hand_property_parity.sql
    // for what was deliberately left out (off-plan/multi-unit-development-
    // only concepts like handover dates or unit typologies).
    yearBuilt: integer('year_built'),
    priceOld: real('price_old'),
    keyHighlights: text('key_highlights'),
    orientation: text('orientation'),
    energyRating: text('energy_rating'),
    hasElevator: integer('has_elevator').notNull().default(0),
    hasPool: integer('has_pool').notNull().default(0),
    hasGarage: integer('has_garage').notNull().default(0),
    hasTerrace: integer('has_terrace').notNull().default(0),
    hasGarden: integer('has_garden').notNull().default(0),
    petsAllowed: integer('pets_allowed').notNull().default(0),
    accessible: integer('accessible').notNull().default(0),
    isExclusive: integer('is_exclusive').notNull().default(0),
    isReserved: integer('is_reserved').notNull().default(0),
    hasTour: integer('has_tour').notNull().default(0),
    rentalYield: real('rental_yield'),
    serviceChargeAnnual: real('service_charge_annual'),
    dronePhoto: text('drone_photo'),
    nightPhoto: text('night_photo'),
    beforePhoto: text('before_photo'),
    afterPhoto: text('after_photo'),
    aiStagedPhoto: text('ai_staged_photo'),
    paymentPlan: text('payment_plan'), // JSON string
    /**
     * Cuándo se repasaron las características (has_*). Esas columnas son NOT
     * NULL DEFAULT 0, así que sin esto un 0 no se puede leer: podría ser "no
     * lo tiene" o "nadie lo ha rellenado". El motor de matching lo necesita
     * para distinguir NO de DESCONOCIDO (migración 0067).
     */
    featuresReviewedAt: text('features_reviewed_at'),
    featuresReviewedBy: integer('features_reviewed_by'),
    // --- Property Core — identificación, ubicación/privacidad, superficies,
    // distribución, características (migración 0068). Ver esa migración para
    // el porqué de cada default/backfill.
    reference: text('reference'),
    externalSource: text('external_source'),
    externalReference: text('external_reference'),
    agencyReference: text('agency_reference'),
    mandateType: text('mandate_type'),
    exclusiveFrom: text('exclusive_from'),
    exclusiveUntil: text('exclusive_until'),
    captureDate: text('capture_date'),
    captureSource: text('capture_source'),
    publishedAt: text('published_at'),
    locationPrivacy: text('location_privacy').notNull().default('exact'), // exact | approximate | hidden_number
    locationPrivacyRadius: real('location_privacy_radius'),
    usableArea: real('usable_area'),
    plotArea: real('plot_area'),
    terraceArea: real('terrace_area'),
    gardenArea: real('garden_area'),
    balconyArea: real('balcony_area'),
    storageArea: real('storage_area'),
    toilets: integer('toilets'),
    livingRooms: integer('living_rooms'),
    kitchens: integer('kitchens'),
    garageSpaces: integer('garage_spaces'),
    condition: text('condition'), // new | excellent | good | to_renovate | to_reform — estado físico, distinto de `status` (comercial)
    furnished: text('furnished'), // yes | no | partially — NULL = no especificado
    // Migración 0086 — autor del alta y borrado lógico (Papelera).
    createdBy: integer('created_by'),
    deletedAt: text('deleted_at'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [
    uniqueIndex('agent_properties_org_slug').on(t.organizationId, t.slug),
    index('agent_properties_org').on(t.organizationId),
    uniqueIndex('agent_properties_org_reference').on(t.organizationId, t.reference),
  ],
)

// Estancias personalizadas de una propiedad 2ª mano (FASE 3) — mismo
// concepto que developerPropertyRooms, tabla separada porque este proyecto
// usa una tabla hija por tipo de propiedad por concepto (ver floorPlans vs
// agentPropertyFloorPlans más abajo), no una tabla polimórfica.
export const agentPropertyRooms = sqliteTable(
  'agent_property_rooms',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    propertyId: integer('property_id')
      .notNull()
      .references(() => agentProperties.id, { onDelete: 'cascade' }),
    type: text('type'),
    name: text('name'),
    area: real('area'),
    floor: text('floor'),
    orientation: text('orientation'),
    notes: text('notes'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [index('agent_property_rooms_parent').on(t.propertyId)],
)

export const propertyTranslations = sqliteTable(
  'property_translations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    propertyId: integer('property_id')
      .notNull()
      .references(() => agentProperties.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(), // 'en' | 'ar'
    title: text('title').notNull(),
    description: text('description'),
  },
  (t) => [uniqueIndex('property_translations_property_locale').on(t.propertyId, t.locale)],
)

export const propertyGalleryImages = sqliteTable('property_gallery_images', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  propertyId: integer('property_id')
    .notNull()
    .references(() => agentProperties.id, { onDelete: 'cascade' }),
  image: text('image').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  // Migración 0086 — metadatos por recurso (FASE 7).
  title: text('title'),
  alt: text('alt'),
  caption: text('caption'),
  language: text('language'),
  isPublishable: integer('is_publishable').notNull().default(1),
  isPrivate: integer('is_private').notNull().default(0),
  isHidden: integer('is_hidden').notNull().default(0),
  createdAt: text('created_at').notNull().default(''),
})

// Mirrors floor_plans (developer properties) — added 0059 so a resale unit
// can carry its own floor plan too, following this codebase's one-table-
// per-property-type-per-child-concept convention.
export const agentPropertyFloorPlans = sqliteTable('agent_property_floor_plans', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  propertyId: integer('property_id')
    .notNull()
    .references(() => agentProperties.id, { onDelete: 'cascade' }),
  category: text('category'),
  unitType: text('unit_type'),
  floorDetails: text('floor_details'),
  sizes: text('sizes'),
  type: text('type'),
  image: text('image'),
  // Migración 0091 (#110): título que se lee en la ficha, orden y si sale en la web.
  title: text('title'),
  sortOrder: integer('sort_order').notNull().default(0),
  isPublic: integer('is_public').notNull().default(1),
  createdAt: text('created_at').notNull().default(''),
})

// Property Search — Saved Filter / Saved View / Shared View (FASE 27
// incremento 2, migración 0080). Una sola tabla para las tres: un "Saved
// Filter" es kind='filter' con columnsJson/density en NULL; un "Saved View"
// es kind='view' con esos dos rellenos; "Shared View" no es una entidad
// aparte, es visibility='shared' sobre la misma fila (ver el comentario de
// cabecera de la migración 0080 para el porqué). `userId` nunca es
// client-editable (no está en `fields` en adminResources.ts) — sólo lo fija
// el servidor a partir de la sesión, y sólo su creador puede editarla o
// borrarla aunque sea compartida.
export const propertySavedViews = sqliteTable(
  'property_saved_views',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    userId: integer('user_id').notNull(),
    resource: text('resource').notNull(), // properties | developer-properties
    kind: text('kind').notNull().default('filter'), // filter | view
    name: text('name').notNull(),
    visibility: text('visibility').notNull().default('private'), // private | shared
    queryJson: text('query_json').notNull(),
    columnsJson: text('columns_json'),
    density: text('density'), // comfortable | compact
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('property_saved_views_org_resource').on(t.organizationId, t.resource), index('property_saved_views_user').on(t.userId)],
)

// Bulk Actions (FASE 28, migración 0081) — framework genérico, no un hack
// por acción (§84-106). Una sola pareja de tablas job+items para Properties
// y Leads: entityType reutiliza el mismo vocabulario 'agent'|'developer' que
// ya usan tasks.propertyKind/activities.propertyKind, más 'lead'. Ver el
// comentario de cabecera de la migración 0081 para el resto del porqué.
export const bulkActionJobs = sqliteTable(
  'bulk_action_jobs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    entityType: text('entity_type').notNull(), // agent | developer | lead
    action: text('action').notNull(),
    paramsJson: text('params_json').notNull(),
    status: text('status').notNull().default('pending'), // pending | processing | completed | failed | partial
    totalCount: integer('total_count').notNull().default(0),
    completedCount: integer('completed_count').notNull().default(0),
    failedCount: integer('failed_count').notNull().default(0),
    requestedBy: integer('requested_by'),
    createdAt: text('created_at').notNull(),
    completedAt: text('completed_at'),
  },
  (t) => [index('bulk_action_jobs_org').on(t.organizationId, t.createdAt)],
)

export const bulkActionJobItems = sqliteTable(
  'bulk_action_job_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    jobId: integer('job_id')
      .notNull()
      .references(() => bulkActionJobs.id, { onDelete: 'cascade' }),
    targetId: integer('target_id').notNull(),
    status: text('status').notNull().default('pending'), // pending | processing | done | failed
    errorMessage: text('error_message'),
    createdAt: text('created_at').notNull(),
    completedAt: text('completed_at'),
  },
  (t) => [uniqueIndex('bulk_action_job_items_unique').on(t.jobId, t.targetId), index('bulk_action_job_items_job_status').on(t.jobId, t.status)],
)

// Tag transversal (§89, §99) — no existía ninguno fuera del Blog
// (cmsTags/cmsArticleTags). tagLinks es polimórfica (sin FK real), mismo
// criterio ya documentado para activities.propertyId/propertyKind.
export const tags = sqliteTable(
  'tags',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    color: text('color'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [uniqueIndex('tags_org_slug').on(t.organizationId, t.slug), index('tags_org').on(t.organizationId)],
)

export const tagLinks = sqliteTable(
  'tag_links',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(), // agent | developer | lead
    entityId: integer('entity_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [uniqueIndex('tag_links_unique').on(t.tagId, t.entityType, t.entityId), index('tag_links_entity').on(t.organizationId, t.entityType, t.entityId)],
)

// Paridad de price_history (más abajo en este archivo, developer_properties-
// only) para 2ª mano — ver el comentario de cabecera de la migración 0081
// para el porqué de una tabla propia en vez de generalizar la existente.
export const agentPropertyPriceHistory = sqliteTable(
  'agent_property_price_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    propertyId: integer('property_id')
      .notNull()
      .references(() => agentProperties.id, { onDelete: 'cascade' }),
    price: real('price').notNull(),
    recordedAt: text('recorded_at').notNull(),
    // Migración 0086 — precio anterior, quién lo cambió (users.id) y por qué.
    previousPrice: real('previous_price'),
    changedBy: integer('changed_by'),
    reason: text('reason'),
  },
  (t) => [index('agent_property_price_history_property').on(t.propertyId)],
)

// ---------------------------------------------------------------------------
// Developers & off-plan projects
// ---------------------------------------------------------------------------

export const developers = sqliteTable(
  'developers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    name: text('name').notNull(),
    email: text('email'),
    phone: text('phone'),
    logo: text('logo'),
    description: text('description'),
    status: text('status').notNull().default('active'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  // email is scoped (organizationId, email), not globally unique — migration 0053.
  (t) => [uniqueIndex('developers_org_email').on(t.organizationId, t.email), index('developers_org').on(t.organizationId)],
)

// slug is scoped (organizationId, slug), not globally unique — migration 0042.
export const developerProperties = sqliteTable(
  'developer_properties',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    slug: text('slug'),
    developerId: integer('developer_id')
      .notNull()
      .references(() => developers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    status: text('status').notNull().default('new'), // new | under_construction | ready
    price: real('price'),
    description: text('description'),
    keyHighlights: text('key_highlights'),
    paymentPlan: text('payment_plan'), // JSON string
    handoverDate: text('handover_date'),
    handoverPercentage: text('handover_percentage'),
    downPercentage: text('down_percentage'),
    constructionPercentage: text('construction_percentage'),
    logo: text('logo'),
    coverImage: text('cover_image'),
    community: text('community'),
    masterPlanImage: text('master_plan_image'),
    locationMap: text('location_map'),
    masterPlanDescription: text('master_plan_description'),
    floorPlanDescription: text('floor_plan_description'),
    locationMapDescription: text('location_map_description'),
    // --- Search & filter attributes (added 0003) ---
    propertyType: text('property_type_main'), // Apartment | Villa | Townhouse | Penthouse | Studio
    bedrooms: integer('bedrooms'),
    bathrooms: integer('bathrooms'),
    area: real('area'), // built m²
    yearBuilt: integer('year_built'),
    energyRating: text('energy_rating'), // A..G
    orientation: text('orientation'), // N, S, E, W, SE, SW, NE, NW
    hasElevator: integer('has_elevator').notNull().default(0),
    hasPool: integer('has_pool').notNull().default(0),
    hasGarage: integer('has_garage').notNull().default(0),
    hasTerrace: integer('has_terrace').notNull().default(0),
    hasGarden: integer('has_garden').notNull().default(0),
    petsAllowed: integer('pets_allowed').notNull().default(0),
    accessible: integer('accessible').notNull().default(0),
    // --- Card attributes (added 0005) ---
    priceOld: real('price_old'),
    isExclusive: integer('is_exclusive').notNull().default(0),
    isReserved: integer('is_reserved').notNull().default(0),
    hasTour: integer('has_tour').notNull().default(0),
    rentalYield: real('rental_yield'),
    publishedAt: text('published_at'),
    aiSummary: text('ai_summary'),
    lat: real('lat'),
    lng: real('lng'),
    // --- Address facets (added 0010) — postalCode stays null for markets
    // without a postal/ZIP system (e.g. the UAE); the search simply won't
    // surface that facet until a listing actually has one.
    street: text('street'),
    postalCode: text('postal_code'),
    // --- Granular address fields (added 0046) — community (above) already
    // covers "urbanización" (a named residential development), reused
    // rather than duplicated. All nullable; existing rows keep working
    // empty.
    country: text('country'),
    city: text('city'),
    streetNumber: text('street_number'),
    block: text('block'),
    portal: text('portal'),
    floor: text('floor'),
    doorLetter: text('door_letter'),
    district: text('district'),
    // Optional showcase clip (added 0012) — null until a real walkthrough
    // video is attached; the card's hover-video and "Vídeo" badge stay
    // dormant until then rather than faking footage.
    videoUrl: text('video_url'),
    // Optional premium gallery assets (added 0013) — all null until the real
    // shot exists. The gallery shows a "request this" teaser (drone/night) or
    // hides the tab entirely (before/after, AI staging) rather than reusing a
    // regular photo under a misleading label.
    dronePhoto: text('drone_photo'),
    nightPhoto: text('night_photo'),
    beforePhoto: text('before_photo'),
    afterPhoto: text('after_photo'),
    aiStagedPhoto: text('ai_staged_photo'),
    // Cumulative engagement counters (added 0017) — real, server-incremented
    // counts of page views and favorite actions. Start at 0 and only grow
    // from genuine activity; never a fabricated "N viewing now" figure.
    viewCount: integer('view_count').notNull().default(0),
    favoriteCount: integer('favorite_count').notNull().default(0),
    // Real annual service charge (added 0018) — null until a real figure is
    // entered for that building; the decision panel shows "Consultar" rather
    // than guessing a number when it's missing.
    serviceChargeAnnual: real('service_charge_annual'),
    // Commercial assignment (added 0047) — null until a Comercial is
    // assigned; no such relationship existed on this table before.
    agentId: integer('agent_id'),
    // --- Property Core — identificación, ubicación/privacidad, superficies,
    // distribución, características (migración 0068). Ver esa migración
    // para el porqué de cada default/backfill.
    reference: text('reference'),
    externalSource: text('external_source'),
    externalReference: text('external_reference'),
    agencyReference: text('agency_reference'),
    transactionType: text('transaction_type').notNull().default('sale'), // sale | rent — obra nueva era venta implícita hasta ahora
    mandateType: text('mandate_type'),
    exclusiveFrom: text('exclusive_from'),
    exclusiveUntil: text('exclusive_until'),
    captureDate: text('capture_date'),
    captureSource: text('capture_source'),
    locationPrivacy: text('location_privacy').notNull().default('exact'), // exact | approximate | hidden_number
    locationPrivacyRadius: real('location_privacy_radius'),
    usableArea: real('usable_area'),
    plotArea: real('plot_area'),
    terraceArea: real('terrace_area'),
    gardenArea: real('garden_area'),
    balconyArea: real('balcony_area'),
    storageArea: real('storage_area'),
    toilets: integer('toilets'),
    livingRooms: integer('living_rooms'),
    kitchens: integer('kitchens'),
    garageSpaces: integer('garage_spaces'),
    condition: text('condition'), // new | excellent | good | to_renovate | to_reform — estado físico, distinto de `status` (comercial)
    furnished: text('furnished'), // yes | no | partially — NULL = no especificado
    featuresReviewedAt: text('features_reviewed_at'),
    featuresReviewedBy: integer('features_reviewed_by'),
    // Migración 0086 — autor del alta y borrado lógico (Papelera).
    createdBy: integer('created_by'),
    deletedAt: text('deleted_at'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [
    uniqueIndex('developer_properties_org_slug').on(t.organizationId, t.slug),
    index('developer_properties_org').on(t.organizationId),
    uniqueIndex('developer_properties_org_reference').on(t.organizationId, t.reference),
  ],
)

// Estancias personalizadas de un proyecto sobre plano (FASE 3).
export const developerPropertyRooms = sqliteTable(
  'developer_property_rooms',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    developerPropertyId: integer('developer_property_id')
      .notNull()
      .references(() => developerProperties.id, { onDelete: 'cascade' }),
    type: text('type'),
    name: text('name'),
    area: real('area'),
    floor: text('floor'),
    orientation: text('orientation'),
    notes: text('notes'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [index('developer_property_rooms_parent').on(t.developerPropertyId)],
)

export const priceHistory = sqliteTable('price_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  developerPropertyId: integer('developer_property_id')
    .notNull()
    .references(() => developerProperties.id, { onDelete: 'cascade' }),
  price: real('price').notNull(),
  recordedAt: text('recorded_at').notNull(),
  // Migración 0086 — precio anterior, quién lo cambió (users.id) y por qué.
  previousPrice: real('previous_price'),
  changedBy: integer('changed_by'),
  reason: text('reason'),
})

// Per-view timestamp log (added 0018) — enables real time-windowed counts
// ("vistas esta semana") rather than only an all-time total.
export const propertyViews = sqliteTable(
  'property_views',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    developerPropertyId: integer('developer_property_id')
      .notNull()
      .references(() => developerProperties.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').notNull(),
    // Anonymous per-browser id (server/utils/visitor.ts) — lets
    // view.post.ts dedupe repeat views from the same visitor within a
    // short window instead of counting every request. Nullable: rows
    // recorded before this column existed (migration 0055) have none.
    visitorId: text('visitor_id'),
  },
  (t) => [index('property_views_property_created').on(t.developerPropertyId, t.createdAt)],
)

// Real per-visitor favorites (added 0055) — replaces a raw
// developerProperties.favoriteCount counter that any script could drive
// arbitrarily by replaying { id, on: true/false } with no identity behind
// it (docs/production-hardening-audit.md, P1-7). One row per (org,
// property, visitor) — favoriteCount stays as a cached aggregate, but now
// only ever moves by ±1 per visitor, driven by a real insert/delete here.
export const favorites = sqliteTable(
  'favorites',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    developerPropertyId: integer('developer_property_id')
      .notNull()
      .references(() => developerProperties.id, { onDelete: 'cascade' }),
    visitorId: text('visitor_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('favorites_org_property_visitor').on(t.organizationId, t.developerPropertyId, t.visitorId),
    index('favorites_property').on(t.developerPropertyId),
  ],
)

// Real Instagram/TikTok video embeds per property (added 0019) — admin
// curated URLs to real public posts/reels, never scraped or fabricated.
export const propertySocialMedia = sqliteTable(
  'property_social_media',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    developerPropertyId: integer('developer_property_id')
      .notNull()
      .references(() => developerProperties.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(), // 'instagram' | 'tiktok'
    url: text('url').notNull(),
    caption: text('caption'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('property_social_media_property').on(t.developerPropertyId, t.sortOrder)],
)

export const agentPropertySocialMedia = sqliteTable(
  'agent_property_social_media',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    propertyId: integer('property_id')
      .notNull()
      .references(() => agentProperties.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(),
    url: text('url').notNull(),
    caption: text('caption'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('agent_property_social_media_property').on(t.propertyId, t.sortOrder)],
)

export const images = sqliteTable('images', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  developerPropertyId: integer('developer_property_id')
    .notNull()
    .references(() => developerProperties.id, { onDelete: 'cascade' }),
  image: text('image').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  // Migración 0086 — metadatos por recurso (FASE 7).
  title: text('title'),
  alt: text('alt'),
  caption: text('caption'),
  language: text('language'),
  isPublishable: integer('is_publishable').notNull().default(1),
  isPrivate: integer('is_private').notNull().default(0),
  isHidden: integer('is_hidden').notNull().default(0),
  createdAt: text('created_at').notNull().default(''),
})

export const floorPlans = sqliteTable('floor_plans', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  developerPropertyId: integer('developer_property_id')
    .notNull()
    .references(() => developerProperties.id, { onDelete: 'cascade' }),
  category: text('category'),
  unitType: text('unit_type'),
  floorDetails: text('floor_details'),
  sizes: text('sizes'),
  type: text('type'),
  image: text('image'),
  // Migración 0091 (#110): título que se lee en la ficha, orden y si sale en la web.
  title: text('title'),
  sortOrder: integer('sort_order').notNull().default(0),
  isPublic: integer('is_public').notNull().default(1),
  createdAt: text('created_at').notNull().default(''),
})

export const masterPlans = sqliteTable('master_plans', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  organizationId: integer('organization_id').notNull(),
  name: text('name').notNull(),
  image: text('image').notNull(),
  createdAt: text('created_at').notNull().default(''),
})

export const developerPropertyMasterPlan = sqliteTable('developer_property_master_plan', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  developerPropertyId: integer('developer_property_id')
    .notNull()
    .references(() => developerProperties.id, { onDelete: 'cascade' }),
  masterPlanId: integer('master_plan_id')
    .notNull()
    .references(() => masterPlans.id, { onDelete: 'cascade' }),
})

export const propertyTypes = sqliteTable('property_types', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  developerPropertyId: integer('developer_property_id')
    .notNull()
    .references(() => developerProperties.id, { onDelete: 'cascade' }),
  propertyType: text('property_type').notNull(), // Apartment, Villa, Townhouse…
  unitType: text('unit_type').notNull(),
  size: text('size').notNull(),
  createdAt: text('created_at').notNull().default(''),
})

// ---------------------------------------------------------------------------
// Locations, amenities, communities
// ---------------------------------------------------------------------------

export const locations = sqliteTable('locations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  organizationId: integer('organization_id').notNull(),
  name: text('name').notNull(),
  image: text('image'),
  createdAt: text('created_at').notNull().default(''),
})

export const developerPropertyLocation = sqliteTable('developer_property_location', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  developerPropertyId: integer('developer_property_id')
    .notNull()
    .references(() => developerProperties.id, { onDelete: 'cascade' }),
  locationId: integer('location_id')
    .notNull()
    .references(() => locations.id, { onDelete: 'cascade' }),
  distance: integer('distance').notNull().default(0),
})

export const amenities = sqliteTable('amenities', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  organizationId: integer('organization_id').notNull(),
  name: text('name').notNull(),
  logo: text('logo'),
  description: text('description'),
  createdAt: text('created_at').notNull().default(''),
})

export const amenityDeveloperProperty = sqliteTable('amenity_developer_property', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  amenityId: integer('amenity_id')
    .notNull()
    .references(() => amenities.id, { onDelete: 'cascade' }),
  developerPropertyId: integer('developer_property_id')
    .notNull()
    .references(() => developerProperties.id, { onDelete: 'cascade' }),
})

export const communities = sqliteTable('communities', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  organizationId: integer('organization_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  featureDescription: text('feature_description'),
  image: text('image'),
  location: text('location'),
  createdAt: text('created_at').notNull().default(''),
  updatedAt: text('updated_at').notNull().default(''),
})

export const amenityCommunity = sqliteTable('amenity_community', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  communityId: integer('community_id')
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  amenityId: integer('amenity_id')
    .notNull()
    .references(() => amenities.id, { onDelete: 'cascade' }),
})

// ---------------------------------------------------------------------------
// Content: blogs & team
// ---------------------------------------------------------------------------

// slug is scoped (organizationId, slug), not globally unique — migration 0042.
export const blogs = sqliteTable(
  'blogs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    slug: text('slug').notNull(),
    image: text('image'),
    targetAudience: text('target_audience').notNull().default('UAE'), // UAE | International
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [uniqueIndex('blogs_org_slug').on(t.organizationId, t.slug), index('blogs_org').on(t.organizationId)],
)

export const blogTranslations = sqliteTable(
  'blog_translations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    blogId: integer('blog_id')
      .notNull()
      .references(() => blogs.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
  },
  (t) => [uniqueIndex('blog_translations_blog_locale').on(t.blogId, t.locale)],
)

// slug is scoped (organizationId, slug), not globally unique — migration 0042.
export const teamMembers = sqliteTable(
  'team_members',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    position: text('position').notNull(),
    description: text('description'),
    experience: text('experience'),
    languages: text('languages'),
    nid: text('nid'),
    specialties: text('specialties'),
    image: text('image'),
    facebook: text('facebook'),
    twitter: text('twitter'),
    linkedin: text('linkedin'),
    instagram: text('instagram'),
    slotDurationMinutes: integer('slot_duration_minutes').notNull().default(60),
    bufferMinutes: integer('buffer_minutes').notNull().default(0),
    maxAppointmentsPerDay: integer('max_appointments_per_day'),
    icalToken: text('ical_token'),
    // Laboral (Comerciales ficha) — office_name/department are plain text:
    // no Offices/Departments entity exists yet to reference.
    employeeCode: text('employee_code'),
    department: text('department'),
    officeName: text('office_name'),
    managerId: integer('manager_id'),
    hireDate: text('hire_date'),
    contractType: text('contract_type'),
    employmentStatus: text('employment_status').notNull().default('active'),
    workingHours: text('working_hours'),
    // Comercial — JSON arrays, same storage pattern as
    // developerProperties.paymentPlan. `specialties`/`languages` above are
    // reused for their overlapping concepts, not duplicated.
    zones: text('zones'),
    propertyTypes: text('property_types'),
    whatsapp: text('whatsapp'),
    // Perfil Web — defaults preserve today's actual behavior (every agent
    // publicly visible, in id order) so this migration never unpublishes
    // anyone by accident.
    showOnWeb: integer('show_on_web').notNull().default(1),
    sortOrder: integer('sort_order').notNull().default(0),
    // Migración 0086 — oficina y equipo como entidades (offices/teams), y el
    // usuario del panel que ES este comercial (users.id, único).
    officeId: integer('office_id'),
    teamId: integer('team_id'),
    userId: integer('user_id'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [
    uniqueIndex('team_members_org_slug').on(t.organizationId, t.slug),
    // email is scoped (organizationId, email), not globally unique — migration 0053.
    uniqueIndex('team_members_org_email').on(t.organizationId, t.email),
    index('team_members_org').on(t.organizationId),
  ],
)

export const teamMemberDocuments = sqliteTable(
  'team_member_documents',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    teamMemberId: integer('team_member_id').notNull(),
    fileKey: text('file_key').notNull(),
    label: text('label').notNull(),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('team_member_documents_member').on(t.teamMemberId), index('team_member_documents_org').on(t.organizationId)],
)

// ---------------------------------------------------------------------------
// Forms: vendor registration, visitor submissions, contact/complaints
// ---------------------------------------------------------------------------

export const information = sqliteTable('information', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  organizationId: integer('organization_id').notNull(),
  name: text('name'),
  email: text('email'),
  phoneNumber: text('phone_number'),
  tradeLicense: text('trade_license'),
  emiratesId: text('emirates_id'),
  passport: text('passport'),
  bankAccountNo: text('bank_account_no'),
  ibanLetter: text('iban_letter'),
  vatRegistrationNo: text('vat_registration_no'),
  contactPersonName: text('contact_person_name'),
  officeAddress: text('office_address'),
  createdAt: text('created_at').notNull().default(''),
})

export const visitorSubmissions = sqliteTable('visitor_submissions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  organizationId: integer('organization_id').notNull(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  phoneNumber: text('phone_number').notNull(),
  nationality: text('nationality').notNull(),
  propertyType: text('property_type'),
  specifications: text('specifications'),
  preferredLocation: text('preferred_location'),
  budgetRange: text('budget_range'),
  paymentForRent: text('payment_for_rent').notNull().default('Personal'), // Personal | Company
  numberOfFamilyMembers: integer('number_of_family_members'),
  passportPdf: text('passport_pdf'),
  emiratesIdPdf: text('emirates_id_pdf'),
  bankStatementPdf: text('bank_statement_pdf'),
  tradeLicensePdf: text('trade_license_pdf'),
  vatRegistrationCertificatePdf: text('vat_registration_certificate_pdf'),
  etihadCreditBureauPdf: text('etihad_credit_bureau_pdf'),
  createdAt: text('created_at').notNull().default(''),
})

export const contactMessages = sqliteTable(
  'contact_messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    type: text('type').notNull().default('contact'), // contact | complaint
    name: text('name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    subject: text('subject'),
    message: text('message').notNull(),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('contact_messages_type').on(t.type)],
)

// ---------------------------------------------------------------------------
// SaaS CRM & operations (Block 7)
// ---------------------------------------------------------------------------

export const leads = sqliteTable(
  'leads',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    name: text('name').notNull(),
    email: text('email'),
    phone: text('phone'),
    whatsapp: text('whatsapp'),
    source: text('source').notNull().default('web'), // web | portal | referral | ads | social | call
    /** Más específico que `source` sin acoplar el modelo a un proveedor concreto: source=portal, sourceDetail="Idealista". */
    sourceDetail: text('source_detail'),
    campaign: text('campaign'),
    utmSource: text('utm_source'),
    utmMedium: text('utm_medium'),
    utmCampaign: text('utm_campaign'),
    utmContent: text('utm_content'),
    utmTerm: text('utm_term'),
    /** Preparado para integraciones de portales inmobiliarios — ningún flujo real lo rellena todavía (migración 0069). */
    portal: text('portal'),
    landingPage: text('landing_page'),
    referrer: text('referrer'),
    /** El mensaje de captación tal cual llegó — nunca reescrito por IA; `notes` es para anotaciones internas posteriores. */
    originalMessage: text('original_message'),
    status: text('status').notNull().default('new'), // new | contacted | qualified | proposal | won | lost
    /**
     * Posición real en el pipeline (FASE 13, migración 0069) — deliberadamente
     * distinta de `status`, que 20+ rutas ya consultan con su significado
     * actual y que server/utils/leads/pipeline.ts mantiene sincronizado en
     * cada transición para no romperlas. `stage` es la fuente de verdad del
     * Kanban y de lead_stage_history.
     */
    stage: text('stage').notNull().default('new'), // new | contacted | qualifying | qualified | viewing | offer | negotiation | won
    /** Sólo tiene sentido cuando status = 'lost'. No confundir con `status` en sí. */
    lostReason: text('lost_reason'), // no_response | not_interested | duplicate | other
    /** Explícita y distinta de `score` (intención vs urgencia percibida). */
    priority: text('priority'), // low | medium | high | urgent
    score: integer('score').notNull().default(0), // 0..100
    budget: real('budget'),
    propertyId: integer('property_id'),
    /** Migración 0089 — de qué catálogo es `propertyId`: agent (2ª mano) | developer (obra nueva). NULL = no consta (filas anteriores). */
    propertyKind: text('property_kind'),
    propertyName: text('property_name'),
    agentId: integer('agent_id'),
    agentName: text('agent_name'),
    notes: text('notes'),
    lastContactAt: text('last_contact_at'),
    /** Preparado (FASE 12 §76): sólo lo rellena una respuesta real, nunca createdAt. */
    firstResponseAt: text('first_response_at'),
    /** Proyección/caché para cuando exista Task/Appointment reales — no es una segunda agenda manual. */
    nextActionAt: text('next_action_at'),
    /** FASE 22, migración 0077. Acompaña a `nextActionAt`: tipo de la Task o 'appointment' que la origina. Mismo criterio de proyección sincronizada — ver server/utils/leads/nextAction.ts. */
    nextActionType: text('next_action_type'),
    /** FASE 16, migración 0071. Primera vez que alcanza el stage 'qualified' — nunca se recalcula si el lead retrocede. */
    qualifiedAt: text('qualified_at'),
    /** FASE 16, migración 0071. Cuándo se consiguió la primera cita (creación de la visita, no su fecha futura). */
    firstAppointmentAt: text('first_appointment_at'),
    /**
     * La persona detrás de la oportunidad (migración 0066). NULLable a
     * propósito: un lead puede entrar antes de que su identidad esté
     * resuelta, y convertirlo nunca lo elimina — los datos de captación
     * (name/email/phone de arriba) son la foto de la entrada original y se
     * conservan aunque el Contact evolucione después.
     */
    contactId: integer('contact_id'),
    /**
     * FASE 32, migración 0083 — proyección del Lead Score explicable
     * (server/utils/leads/score.ts): el desglose vigente de `score`, cuándo
     * se calculó (NULL = puntuación heredada del "bump" antiguo, sin
     * desglose) y cuándo caduca su primera señal temporal (el cron horario
     * recalcula sólo esos). El historial vive en lead_score_snapshots.
     */
    scoreBreakdownJson: text('score_breakdown_json'),
    scoreComputedAt: text('score_computed_at'),
    scoreExpiresAt: text('score_expires_at'),
    // Migración 0086 — oficina/equipo, autor, borrado lógico, primer contacto
    // (cualquier canal, humano o no), conversión, idioma e ID externo. El
    // contacto al que se convierte es contactId; converted_contact_id existe
    // sólo en producción y staging (deriva de 0069) y no se usa.
    officeId: integer('office_id'),
    teamId: integer('team_id'),
    createdBy: integer('created_by'),
    deletedAt: text('deleted_at'),
    firstContactAt: text('first_contact_at'),
    convertedAt: text('converted_at'),
    language: text('language'),
    externalId: text('external_id'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [
    index('leads_status').on(t.status),
    index('leads_stage').on(t.stage),
    index('leads_source').on(t.source),
    index('leads_contact').on(t.contactId),
    index('leads_score_expires').on(t.scoreExpiresAt),
  ],
)

/**
 * FASE 32, migración 0083 — reglas del Lead Score por agencia. Sin filas =
 * reglas por defecto del código (server/utils/leads/score.ts); una fila por
 * criterio sólo cuando la agencia lo cambia. `criterion` pertenece a un
 * catálogo cerrado en código, nunca una expresión libre.
 */
export const leadScoreRules = sqliteTable(
  'lead_score_rules',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    criterion: text('criterion').notNull(),
    points: integer('points').notNull(),
    enabled: integer('enabled').notNull().default(1),
    priority: integer('priority').notNull().default(0),
    configJson: text('config_json'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [uniqueIndex('lead_score_rules_org_criterion').on(t.organizationId, t.criterion)],
)

/**
 * FASE 32, migración 0083 — historial del Lead Score: una fila sólo cuando
 * cambia la puntuación o su desglose, con las reglas efectivas usadas
 * (reproducibilidad, §69). Sólo INSERT.
 */
export const leadScoreSnapshots = sqliteTable(
  'lead_score_snapshots',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    leadId: integer('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    score: integer('score').notNull(),
    breakdownJson: text('breakdown_json').notNull(),
    rulesJson: text('rules_json').notNull(),
    engineVersion: integer('engine_version').notNull(),
    reason: text('reason').notNull(), // created | signal | rules | manual | expiry | legacy
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('lead_score_snapshots_lead').on(t.organizationId, t.leadId, t.createdAt)],
)

/**
 * FASE 31, migración 0084 — traza de cada llamada a una Domain Tool
 * (server/utils/tools/): herramienta, quién, resultado o error tipado,
 * entidad afectada y latencia. Nunca el prompt ni el input completo.
 * `resultJson` sólo en escrituras con clave de idempotencia.
 */
export const domainToolCalls = sqliteTable(
  'domain_tool_calls',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    userId: integer('user_id'),
    tool: text('tool').notNull(),
    kind: text('kind').notNull(), // read | write
    source: text('source').notNull().default('api'), // api | inmo
    status: text('status').notNull(), // ok | error
    errorCode: text('error_code'),
    targetType: text('target_type'),
    targetId: integer('target_id'),
    idempotencyKey: text('idempotency_key'),
    resultJson: text('result_json'),
    latencyMs: integer('latency_ms').notNull().default(0),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('domain_tool_calls_org').on(t.organizationId, t.createdAt)],
)

/**
 * FASE 31, migración 0084 — selección persistente de propiedades para una
 * persona (create_property_selection), de los dos catálogos. Concepto
 * propio: ningún modelo existente lo representaba (ver la migración).
 */
export const propertySelections = sqliteTable(
  'property_selections',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    contactId: integer('contact_id').notNull(),
    leadId: integer('lead_id'),
    buyerRequirementId: integer('buyer_requirement_id'),
    title: text('title').notNull(),
    notes: text('notes'),
    createdBy: integer('created_by'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('property_selections_contact').on(t.organizationId, t.contactId)],
)

export const propertySelectionItems = sqliteTable(
  'property_selection_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    selectionId: integer('selection_id')
      .notNull()
      .references(() => propertySelections.id, { onDelete: 'cascade' }),
    propertyId: integer('property_id').notNull(),
    propertyKind: text('property_kind').notNull(), // agent | developer
    position: integer('position').notNull().default(0),
    note: text('note'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [uniqueIndex('property_selection_items_unique').on(t.selectionId, t.propertyKind, t.propertyId)],
)

/**
 * Historial inmutable de transiciones de stage (FASE 13, migración 0069).
 * Sólo INSERT — ninguna ruta actualiza o borra una fila de aquí. Cada
 * movimiento real del pipeline (drag&drop, cambio manual) pasa por
 * server/utils/leads/pipeline.ts, que es lo único que escribe en esta tabla.
 */
export const leadStageHistory = sqliteTable(
  'lead_stage_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    leadId: integer('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    userId: integer('user_id'),
    fromStage: text('from_stage'),
    toStage: text('to_stage').notNull(),
    reason: text('reason'),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('lead_stage_history_lead').on(t.leadId, t.createdAt), index('lead_stage_history_org').on(t.organizationId, t.createdAt)],
)

/**
 * Reglas de Lead Routing (FASE 15, migración 0071). Se evalúan en orden de
 * `priority` (menor primero). No existe entidad Office ni Team en el
 * repositorio — "Team" se resuelve con `teamMembers.department` (texto ya
 * existente), reutilizado aquí en vez de inventar una tabla `teams` para un
 * concepto que hoy sólo es una etiqueta.
 */
export const leadRoutingRules = sqliteTable(
  'lead_routing_rules',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    name: text('name').notNull(),
    priority: integer('priority').notNull().default(0),
    scope: text('scope').notNull(), // property | zone | language | property_type | new_build | department
    matchValue: text('match_value'),
    /** team_members.id — sin FK real, mismo criterio que leads.agentId/visits.agentId. */
    targetCommercialId: integer('target_commercial_id'),
    targetDepartment: text('target_department'),
    strategy: text('strategy').notNull().default('round_robin'), // round_robin | workload — sólo si targetCommercialId es null
    enabled: integer('enabled').notNull().default(1),
    // Migración 0086 — reparto dentro de una oficina y franja horaria en la que
    // aplica la regla ({ days: [1..7], from: 'HH:MM', to: 'HH:MM', timezone }).
    targetOfficeId: integer('target_office_id'),
    scheduleJson: text('schedule_json'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [index('lead_routing_rules_org_priority').on(t.organizationId, t.priority)],
)

/** Historial de asignaciones de Lead → Comercial (FASE 15). `assignedBy` null = lo decidió el routing automático. */
export const leadAssignmentHistory = sqliteTable(
  'lead_assignment_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    leadId: integer('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    fromCommercialId: integer('from_commercial_id'),
    toCommercialId: integer('to_commercial_id'),
    ruleId: integer('rule_id').references(() => leadRoutingRules.id, { onDelete: 'set null' }),
    reason: text('reason').notNull(),
    assignedBy: integer('assigned_by'),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('lead_assignment_history_lead').on(t.leadId, t.createdAt), index('lead_assignment_history_org').on(t.organizationId, t.createdAt)],
)

/** Estado persistente del round robin por (organización, ámbito). Concurrency-safe vía compare-and-swap en el servicio, no por transacción de D1. */
export const leadRoundRobinState = sqliteTable(
  'lead_round_robin_state',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    scopeKey: text('scope_key').notNull(), // 'org' o un nombre de department
    lastAssignedCommercialId: integer('last_assigned_commercial_id'),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [uniqueIndex('lead_round_robin_state_scope').on(t.organizationId, t.scopeKey)],
)

/** Umbrales de SLA por organización (FASE 16, migración 0071). Nunca una regla universal hardcodeada. */
export const slaSettings = sqliteTable('sla_settings', {
  organizationId: integer('organization_id').primaryKey(),
  newLeadUnattendedMinutes: integer('new_lead_unattended_minutes').notNull().default(30),
  qualifiedWithoutActionHours: integer('qualified_without_action_hours').notNull().default(24),
  inactiveLeadDays: integer('inactive_lead_days').notNull().default(7),
  /** Preparada (FASE 16 §33); el cálculo de esta fase usa tiempo natural, no horario comercial. */
  useBusinessHours: integer('use_business_hours').notNull().default(0),
  createdAt: text('created_at').notNull().default(''),
  updatedAt: text('updated_at').notNull().default(''),
})

/** Alertas de SLA con ciclo de vida (FASE 16). El índice único parcial (sólo status='open') impide duplicados sin check-then-insert. */
export const leadSlaAlerts = sqliteTable(
  'lead_sla_alerts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    leadId: integer('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // unattended | qualified_no_action | inactive
    status: text('status').notNull().default('open'), // open | resolved
    openedAt: text('opened_at').notNull().default(''),
    resolvedAt: text('resolved_at'),
    resolvedReason: text('resolved_reason'), // auto | manual
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('lead_sla_alerts_org_status').on(t.organizationId, t.status)],
)

export const clients = sqliteTable(
  'clients',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    name: text('name').notNull(),
    email: text('email'),
    phone: text('phone'),
    type: text('type').notNull().default('buyer'), // buyer | seller | tenant | investor
    stage: text('stage').notNull().default('active'), // active | closed | inactive
    lifetimeValue: real('lifetime_value').notNull().default(0),
    dealsCount: integer('deals_count').notNull().default(0),
    agentName: text('agent_name'),
    location: text('location'),
    notes: text('notes'),
    /** La persona detrás de la relación comercial (migración 0066). */
    contactId: integer('contact_id'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [index('clients_type').on(t.type), index('clients_stage').on(t.stage), index('clients_contact').on(t.contactId)],
)

export const visits = sqliteTable(
  'visits',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    clientName: text('client_name').notNull(),
    propertyId: integer('property_id'),
    propertyName: text('property_name'),
    agentId: integer('agent_id'),
    agentName: text('agent_name'),
    scheduledAt: text('scheduled_at').notNull(),
    durationMinutes: integer('duration_minutes').notNull().default(60),
    endsAt: text('ends_at'),
    status: text('status').notNull().default('scheduled'), // scheduled | completed | cancelled | no_show
    channel: text('channel').notNull().default('in_person'), // in_person | video | phone — CÓMO
    /** FASE 17, migración 0072. PARA QUÉ es la cita — eje distinto de `channel` (CÓMO). */
    type: text('type').notNull().default('property_viewing'), // property_viewing | call | other
    /** FASE 17, migración 0072. Confirmación explícita del cliente — distinta de `status` (ciclo de vida interno). */
    confirmationStatus: text('confirmation_status').notNull().default('pending'), // pending | confirmed
    confirmedAt: text('confirmed_at'),
    /** FASE 17, migración 0072. Antes no existía ninguna FK real entre visits y leads — el cruce era por nombre/email. */
    leadId: integer('lead_id'),
    notes: text('notes'),
    clientEmail: text('client_email'),
    clientPhone: text('client_phone'),
    clientBudget: real('client_budget'),
    clientInterest: text('client_interest'),
    managementToken: text('management_token'),
    reminder24hSentAt: text('reminder_24h_sent_at'),
    reminder1hSentAt: text('reminder_1h_sent_at'),
    videoLink: text('video_link'),
    /** FASE 18, migración 0073. Cuando esta cita es una parada de un tour — nullable: la inmensa mayoría de citas no lo son. */
    tourId: integer('tour_id'),
    /** FASE 18, migración 0073. Posición de esta parada dentro de su tour (0-based). Sólo tiene sentido junto a tourId. */
    tourStopOrder: integer('tour_stop_order'),
    /**
     * FASE 19, migración 0074. Percepción del comercial sobre esta visita —
     * nunca un hecho sobre el inmueble ni sobre lo que busca el comprador.
     * server/utils/appointments/outcome.ts es lo único que escribe estas tres
     * columnas, y nunca toca agent_properties/developer_properties/
     * buyer_requirements.
     */
    outcome: text('outcome'), // interested | wants_to_think | not_interested
    outcomeNotes: text('outcome_notes'),
    outcomeRecordedAt: text('outcome_recorded_at'),
    /**
     * FASE 20, migración 0075. `property_id` referenciaba sólo
     * `developer_properties` hasta ahora (la reserva pública nunca ofreció
     * 2ª mano); este discriminador dice a qué catálogo pertenece — igual que
     * `matching/service.ts`'s `PropertyKind`, sin FK real (mismo criterio ya
     * usado en el resto de columnas *_id de esta tabla).
     */
    propertyKind: text('property_kind'), // agent | developer
    /** FASE 20: sólo almacenamiento preparado para una futura sincronización con Google/Outlook — nada los escribe todavía. */
    calendarProvider: text('calendar_provider'),
    externalCalendarId: text('external_calendar_id'),
    externalEventId: text('external_event_id'),
    calendarSyncStatus: text('calendar_sync_status'),
    /** FASE 24, migración 0079. Una cita de notaría/firma de un Deal — sigue siendo una Appointment real, aparece en Calendar sin ningún mecanismo aparte. */
    dealId: integer('deal_id'),
    // Migración 0086 — FASES 17 y 19: contacto, oficina, zona horaria, punto
    // de encuentro, notas internas, cancelación, recordatorio, autoría,
    // borrado lógico y el resultado estructurado de la visita.
    contactId: integer('contact_id'),
    officeId: integer('office_id'),
    timezone: text('timezone'),
    meetingPoint: text('meeting_point'),
    internalNotes: text('internal_notes'),
    cancellationReason: text('cancellation_reason'),
    cancelledAt: text('cancelled_at'),
    reminderStatus: text('reminder_status'), // pending | sent | failed | not_applicable
    createdBy: integer('created_by'),
    updatedAt: text('updated_at'),
    deletedAt: text('deleted_at'),
    interestLevel: integer('interest_level'), // 1-5
    outcomeLiked: text('outcome_liked'),
    outcomeDisliked: text('outcome_disliked'),
    pricePerception: text('price_perception'), // cheap | fair | expensive
    locationRating: integer('location_rating'), // 1-5
    conditionRating: integer('condition_rating'), // 1-5
    layoutRating: integer('layout_rating'), // 1-5
    wantsSecondVisit: integer('wants_second_visit'),
    wantsToOffer: integer('wants_to_offer'),
    discarded: integer('discarded'),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [
    index('visits_status').on(t.status),
    index('visits_agent_scheduled').on(t.agentId, t.scheduledAt),
    index('visits_tour').on(t.tourId, t.tourStopOrder),
    index('visits_deal').on(t.dealId),
  ],
)

/**
 * Cabecera de un Tour (FASE 18, migración 0073): un cliente viendo varios
 * inmuebles en una misma salida, guiado por un comercial. Cada parada sigue
 * siendo una fila real de `visits` (hora, comercial, estado y confirmación
 * viven ahí — enlazadas por `visits.tourId`/`tourStopOrder`), así que nunca
 * puede haber dos versiones del horario de una parada que se contradigan.
 * Esta tabla sólo guarda de quién es el tour y sus notas.
 */
export const propertyTours = sqliteTable(
  'property_tours',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    clientName: text('client_name').notNull(),
    clientEmail: text('client_email'),
    clientPhone: text('client_phone'),
    leadId: integer('lead_id'),
    notes: text('notes'),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('property_tours_org').on(t.organizationId, t.createdAt)],
)

/** Weekly recurring working hours per agent — the real availability source for the appointment booker. */
export const agentAvailability = sqliteTable(
  'agent_availability',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    agentId: integer('agent_id').notNull(),
    dayOfWeek: integer('day_of_week').notNull(), // 0=domingo .. 6=sábado
    startTime: text('start_time').notNull(), // 'HH:MM'
    endTime: text('end_time').notNull(),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('agent_availability_agent').on(t.agentId)],
)

/** One-off blocked dates (vacation, sick day) that override the weekly rule for that agent. */
export const agentTimeOff = sqliteTable(
  'agent_time_off',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    agentId: integer('agent_id').notNull(),
    date: text('date').notNull(), // 'YYYY-MM-DD'
    reason: text('reason'),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('agent_time_off_agent_date').on(t.agentId, t.date)],
)

/**
 * Real trail for every appointment-related notice (confirmation, reminder,
 * cancellation). `delivered` stays honestly 0 for channels with no connected
 * provider (email/whatsapp) rather than pretending a send happened —
 * `internal` is always available in the admin panel regardless.
 */
export const appointmentNotifications = sqliteTable(
  'appointment_notifications',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    visitId: integer('visit_id').notNull(),
    type: text('type').notNull(), // confirmation | reminder_24h | reminder_1h | cancelled | rescheduled
    channel: text('channel').notNull().default('internal'), // internal | email | whatsapp
    recipient: text('recipient'),
    message: text('message').notNull(),
    delivered: integer('delivered').notNull().default(0),
    errorMessage: text('error_message'),
    readAt: text('read_at'),
    createdAt: text('created_at').notNull().default(''),
    // SID del mensaje en Twilio para el canal whatsapp (migración 0064): el
    // webhook de estado actualiza `delivered`/`error_message` por esta clave.
    externalId: text('external_id'),
  },
  (t) => [index('appointment_notifications_visit').on(t.visitId, t.createdAt), index('appointment_notifications_org_read').on(t.organizationId, t.readAt)],
)

export const reservations = sqliteTable(
  'reservations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    reference: text('reference').notNull(),
    clientName: text('client_name').notNull(),
    propertyId: integer('property_id'),
    propertyName: text('property_name'),
    amount: real('amount').notNull().default(0),
    deposit: real('deposit').notNull().default(0),
    status: text('status').notNull().default('pending'), // pending | confirmed | cancelled | completed
    reservedAt: text('reserved_at').notNull(),
    /** Migración 0086 — la operación (deal_operations) a la que pertenece esta reserva. */
    dealOperationId: integer('deal_operation_id'),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('reservations_status').on(t.status)],
)

// Not org-scoped: billing stays centralized/global, managed by the platform
// owner across all tenants (explicit decision — everything else is per-org).
export const invoices = sqliteTable(
  'invoices',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    // Added by 0038. 0021 left billing global; that made every tenant's
    // /admin/facturacion list and total every other tenant's invoices.
    organizationId: integer('organization_id').notNull(),
    number: text('number').notNull(),
    clientName: text('client_name').notNull(),
    concept: text('concept'),
    amount: real('amount').notNull().default(0),
    tax: real('tax').notNull().default(0),
    status: text('status').notNull().default('draft'), // draft | pending | paid | overdue | void
    issuedAt: text('issued_at').notNull(),
    dueAt: text('due_at'),
    paidAt: text('paid_at'),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [
    index('invoices_status').on(t.status),
    index('invoices_org').on(t.organizationId, t.status),
    // number is scoped (organizationId, number), not globally unique — migration 0053.
    uniqueIndex('invoices_org_number').on(t.organizationId, t.number),
  ],
)

/**
 * Automatizaciones. Las filas `engine = 'legacy'` son las de demostración que
 * sembró 0009_seed_saas.sql (contadores inventados, acciones que no existen):
 * nunca se ejecutan ni se pueden activar. Las `engine = 'v1'` las crea el panel
 * y las ejecuta server/utils/automations/engine.ts (migración 0088).
 */
export const automations = sqliteTable('automations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  organizationId: integer('organization_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  trigger: text('trigger').notNull(), // lead.created | lead.unattended | lead.stage_changed | visit.completed | offer.accepted | deal.stage_changed | task.overdue
  action: text('action').notNull(), // create_task | assign_lead | change_lead_stage | create_note | notify_team
  enabled: integer('enabled').notNull().default(1),
  runsCount: integer('runs_count').notNull().default(0),
  lastRunAt: text('last_run_at'),
  createdAt: text('created_at').notNull().default(''),
  /** Migración 0088. */
  engine: text('engine').notNull().default('legacy'), // legacy | v1
  conditionsJson: text('conditions_json'),
  actionConfigJson: text('action_config_json'),
  createdBy: integer('created_by'), // users.id — las acciones se ejecutan con sus permisos
  cursorId: integer('cursor_id').notNull().default(0),
  activeSince: text('active_since'),
  errorCount: integer('error_count').notNull().default(0),
  lastError: text('last_error'),
  updatedAt: text('updated_at'),
  deletedAt: text('deleted_at'),
})

/** Registro de ejecuciones de automatizaciones y de workflows guiados de INMO (migración 0088). */
export const workflowRuns = sqliteTable(
  'workflow_runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    kind: text('kind').notNull(), // automation | inmo_workflow
    automationId: integer('automation_id'),
    workflowKey: text('workflow_key'),
    trigger: text('trigger'),
    eventKey: text('event_key'),
    entityType: text('entity_type'),
    entityId: integer('entity_id'),
    executedAs: integer('executed_as'),
    status: text('status').notNull(), // running | waiting | ok | error | skipped | cancelled
    currentStep: integer('current_step').notNull().default(0),
    stateJson: text('state_json'),
    stepsJson: text('steps_json'),
    errorCode: text('error_code'),
    message: text('message'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    finishedAt: text('finished_at'),
  },
  (t) => [index('workflow_runs_org').on(t.organizationId, t.kind, t.id), index('workflow_runs_automation').on(t.automationId, t.id)],
)

/** Conversaciones persistentes de INMO: de un usuario, dentro de su agencia (migración 0088). */
export const inmoConversations = sqliteTable(
  'inmo_conversations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    userId: integer('user_id').notNull(),
    title: text('title').notNull(),
    brainKey: text('brain_key'),
    messagesJson: text('messages_json').notNull().default('[]'),
    stateJson: text('state_json').notNull().default('{}'),
    turnsJson: text('turns_json').notNull().default('[]'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('inmo_conversations_user').on(t.organizationId, t.userId, t.updatedAt)],
)

/** Ajustes de cada agencia sobre los cerebros de INMO del código (migración 0088). */
export const inmoBrainSettings = sqliteTable(
  'inmo_brain_settings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    brainKey: text('brain_key').notNull(),
    enabled: integer('enabled').notNull().default(1),
    instructions: text('instructions'),
    toolsJson: text('tools_json'),
    updatedBy: integer('updated_by'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [uniqueIndex('inmo_brain_settings_org_key').on(t.organizationId, t.brainKey)],
)

/** Base de conocimiento de cada agencia: documentos de texto que INMO cita (migración 0088). */
export const knowledgeDocuments = sqliteTable(
  'knowledge_documents',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    tags: text('tags'),
    status: text('status').notNull().default('active'), // active | archived
    searchText: text('search_text').notNull().default(''),
    createdBy: integer('created_by'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
    deletedAt: text('deleted_at'),
  },
  (t) => [index('knowledge_documents_org').on(t.organizationId, t.status)],
)

export const apiKeys = sqliteTable('api_keys', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  organizationId: integer('organization_id').notNull(),
  name: text('name').notNull(),
  prefix: text('prefix').notNull(), // sa_live_xxxx (shown)
  keyHash: text('key_hash').notNull(),
  scopes: text('scopes').notNull().default('read'), // csv: read,write
  environment: text('environment').notNull().default('live'), // live | test
  lastUsedAt: text('last_used_at'),
  revoked: integer('revoked').notNull().default(0),
  createdAt: text('created_at').notNull().default(''),
})

// Not org-scoped yet: metrics_daily's `day` column is globally unique, so
// per-org aggregation would need unique(org_id, day) — deferred to the
// documented follow-up phase alongside the rest of the bespoke SaaS surface.
export const metricsDaily = sqliteTable(
  'metrics_daily',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    day: text('day').notNull(), // YYYY-MM-DD, unique per org (see metrics_daily_org_day)
    visitors: integer('visitors').notNull().default(0),
    pageviews: integer('pageviews').notNull().default(0),
    leads: integer('leads').notNull().default(0),
    visitsBooked: integer('visits_booked').notNull().default(0),
    reservations: integer('reservations').notNull().default(0),
    revenue: real('revenue').notNull().default(0),
  },
  (t) => [uniqueIndex('metrics_daily_org_day').on(t.organizationId, t.day), index('metrics_daily_day').on(t.day)],
)

// Not org-scoped yet: a flat global key-value store used only by the admin's
// own settings page today. Per-org branding (domain, logo, colors) is a
// documented follow-up (see organizations table for where those fields land).
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: text('updated_at').notNull().default(''),
})

// ---------------------------------------------------------------------------
// Blog & CMS editorial module — multi-tenant from the start (organization_id
// on every table). Phase 1 is the data architecture only: the article editor
// stores its content as a JSON block array from day one (`contentJson`), even
// though the premium block-based editor UI itself lands in a later phase —
// this way nothing here needs a breaking migration once that UI exists.
// ---------------------------------------------------------------------------

export const cmsCategories = sqliteTable(
  'cms_categories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    parentId: integer('parent_id'), // self-referencing FK (app-level) for infinite hierarchy
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    color: text('color'),
    icon: text('icon'),
    image: text('image'),
    description: text('description'),
    seoTitle: text('seo_title'),
    seoDescription: text('seo_description'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
    deletedAt: text('deleted_at'), // soft delete → Papelera; null = active
  },
  (t) => [uniqueIndex('cms_categories_org_slug').on(t.organizationId, t.slug), index('cms_categories_org').on(t.organizationId)],
)

export const cmsTags = sqliteTable(
  'cms_tags',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    createdAt: text('created_at').notNull().default(''),
    deletedAt: text('deleted_at'),
  },
  (t) => [uniqueIndex('cms_tags_org_slug').on(t.organizationId, t.slug), index('cms_tags_org').on(t.organizationId)],
)

export const cmsAuthors = sqliteTable(
  'cms_authors',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    userId: integer('user_id').references(() => users.id), // optional link to a real staff login
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    photo: text('photo'),
    bio: text('bio'),
    specialty: text('specialty'),
    facebook: text('facebook'),
    twitter: text('twitter'),
    linkedin: text('linkedin'),
    instagram: text('instagram'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
    deletedAt: text('deleted_at'),
  },
  (t) => [uniqueIndex('cms_authors_org_slug').on(t.organizationId, t.slug), index('cms_authors_org').on(t.organizationId)],
)

export const cmsArticles = sqliteTable(
  'cms_articles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    authorId: integer('author_id').references(() => cmsAuthors.id),
    categoryId: integer('category_id').references(() => cmsCategories.id),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    excerpt: text('excerpt'),
    // JSON array of editor blocks, e.g. [{type:'paragraph',text:'...'}, ...].
    // Phase 1 stores/reads it opaquely; the block editor (phase 3) is the
    // first real writer of structured, multi-block content.
    contentJson: text('content_json').notNull().default('[]'),
    coverImage: text('cover_image'),
    language: text('language').notNull().default('es'),
    status: text('status').notNull().default('draft'), // draft | scheduled | published
    publishedAt: text('published_at'),
    scheduledAt: text('scheduled_at'),
    expiresAt: text('expires_at'), // auto-hidden past this date by a Cron Trigger (see server/cron/expire-articles.ts)
    readingTimeMinutes: integer('reading_time_minutes').notNull().default(0),
    viewCount: integer('view_count').notNull().default(0),
    commentCount: integer('comment_count').notNull().default(0),
    // SEO (phase 5 builds the dedicated tab/UI; the columns exist from day one
    // so nothing here needs a later migration).
    seoTitle: text('seo_title'),
    seoDescription: text('seo_description'),
    seoCanonical: text('seo_canonical'),
    seoRobots: text('seo_robots').notNull().default('index,follow'),
    ogImage: text('og_image'),
    focusKeyword: text('focus_keyword'),
    seoScore: integer('seo_score').notNull().default(0), // 0..100, recomputed on save
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
    deletedAt: text('deleted_at'), // soft delete → Papelera; null = active
  },
  (t) => [
    uniqueIndex('cms_articles_org_slug').on(t.organizationId, t.slug),
    index('cms_articles_org_status').on(t.organizationId, t.status),
  ],
)

export const cmsArticleTags = sqliteTable(
  'cms_article_tags',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    articleId: integer('article_id')
      .notNull()
      .references(() => cmsArticles.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => cmsTags.id, { onDelete: 'cascade' }),
  },
  (t) => [uniqueIndex('cms_article_tags_unique').on(t.articleId, t.tagId)],
)

// Snapshot on every save — powers Fase 7's version history / restore / diff.
export const cmsArticleVersions = sqliteTable(
  'cms_article_versions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    articleId: integer('article_id')
      .notNull()
      .references(() => cmsArticles.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    contentJson: text('content_json').notNull().default('[]'),
    editedBy: integer('edited_by').references(() => users.id),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('cms_article_versions_article').on(t.articleId, t.createdAt)],
)

export const cmsMediaFolders = sqliteTable(
  'cms_media_folders',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    parentId: integer('parent_id'),
    name: text('name').notNull(),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('cms_media_folders_org').on(t.organizationId)],
)

export const cmsMedia = sqliteTable(
  'cms_media',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    folderId: integer('folder_id').references(() => cmsMediaFolders.id),
    filename: text('filename').notNull(),
    url: text('url').notNull(), // /api/media/<r2-key>
    type: text('type').notNull(), // image | video | pdf | svg | doc
    altText: text('alt_text'),
    width: integer('width'),
    height: integer('height'),
    sizeBytes: integer('size_bytes').notNull().default(0),
    favorite: integer('favorite').notNull().default(0),
    createdAt: text('created_at').notNull().default(''),
    deletedAt: text('deleted_at'),
  },
  (t) => [index('cms_media_org').on(t.organizationId)],
)

export const cmsComments = sqliteTable(
  'cms_comments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    articleId: integer('article_id')
      .notNull()
      .references(() => cmsArticles.id, { onDelete: 'cascade' }),
    parentId: integer('parent_id'), // reply-to, self-referencing
    authorName: text('author_name').notNull(),
    authorEmail: text('author_email'),
    content: text('content').notNull(),
    status: text('status').notNull().default('pending'), // pending | approved | spam | trash
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('cms_comments_org_status').on(t.organizationId, t.status), index('cms_comments_article').on(t.articleId)],
)

export const cmsRedirects = sqliteTable(
  'cms_redirects',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    fromPath: text('from_path').notNull(),
    toPath: text('to_path').notNull(),
    statusCode: integer('status_code').notNull().default(301),
    hits: integer('hits').notNull().default(0),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [uniqueIndex('cms_redirects_org_from').on(t.organizationId, t.fromPath)],
)

/**
 * Ajustes de la web pública de una organización que no son diseño
 * (migración 0092). Hoy: los proveedores sujetos a consentimiento de cookies.
 * Sin fila = sin proveedores. Los IDs son públicos (van al HTML), no secretos.
 */
export const siteSettings = sqliteTable('site_settings', {
  organizationId: integer('organization_id').primaryKey(),
  ga4MeasurementId: text('ga4_measurement_id'),
  metaPixelId: text('meta_pixel_id'),
  consentRevision: integer('consent_revision').notNull().default(0),
  updatedBy: integer('updated_by'),
  updatedAt: text('updated_at').notNull().default(''),
})

// One row per organization — real module settings (Fase 1 scope: language
// default and comment moderation policy), not a hardcoded stub.
export const cmsSettings = sqliteTable('cms_settings', {
  organizationId: integer('organization_id').primaryKey(),
  defaultLanguage: text('default_language').notNull().default('es'),
  commentsEnabled: integer('comments_enabled').notNull().default(1),
  commentsRequireApproval: integer('comments_require_approval').notNull().default(1),
  defaultAuthorId: integer('default_author_id').references(() => cmsAuthors.id),
  updatedAt: text('updated_at').notNull().default(''),
})

// ---------------------------------------------------------------------------
// Publication Scheduler — fully decoupled multi-channel publishing engine.
// Every channel adapter (Idealista, Fotocasa, Facebook, WhatsApp, ...) has no
// real API credentials configured anywhere yet, so publication_executions
// honestly records `connected = 0` until real secrets are added — the engine
// itself (scheduling, queueing, retries, dependencies, history) is real.
// ---------------------------------------------------------------------------

export const publicationChannelConfigs = sqliteTable(
  'publication_channel_configs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    channelKey: text('channel_key').notNull(),
    enabled: integer('enabled').notNull().default(1),
    windowStart: text('window_start'),
    windowEnd: text('window_end'),
    defaultPriority: text('default_priority').notNull().default('normal'), // low | normal | high | urgent
    defaultDelaySeconds: integer('default_delay_seconds').notNull().default(0),
    maxRetries: integer('max_retries').notNull().default(3),
    retryBackoffSeconds: integer('retry_backoff_seconds').notNull().default(300),
    maxDurationSeconds: integer('max_duration_seconds').notNull().default(120),
    dependsOnChannelKeys: text('depends_on_channel_keys'), // JSON array of channel_key
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [uniqueIndex('publication_channel_configs_org_channel').on(t.organizationId, t.channelKey)],
)

export const publicationTemplates = sqliteTable(
  'publication_templates',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    stepsJson: text('steps_json').notNull().default('[]'), // [{channelKey, offsetMinutes, priority}]
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [index('publication_templates_org').on(t.organizationId)],
)

export const publicationSchedules = sqliteTable(
  'publication_schedules',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    developerPropertyId: integer('developer_property_id')
      .notNull()
      .references(() => developerProperties.id, { onDelete: 'cascade' }),
    templateId: integer('template_id').references(() => publicationTemplates.id),
    name: text('name'),
    baseScheduledAt: text('base_scheduled_at').notNull(),
    timezone: text('timezone').notNull().default('Asia/Dubai'),
    status: text('status').notNull().default('scheduled'), // draft | scheduled | running | completed | failed | cancelled
    createdBy: integer('created_by').references(() => users.id),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [index('publication_schedules_org_status').on(t.organizationId, t.status), index('publication_schedules_property').on(t.developerPropertyId)],
)

export const publicationJobs = sqliteTable(
  'publication_jobs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    scheduleId: integer('schedule_id')
      .notNull()
      .references(() => publicationSchedules.id, { onDelete: 'cascade' }),
    channelKey: text('channel_key').notNull(),
    runAt: text('run_at').notNull(),
    // Set once at creation from the staged-launch step, never touched by
    // retries/reschedules (which only mutate `runAt`) — duplicate.post.ts
    // reads this to preserve the original stagger, not whatever `runAt`
    // happens to be after a retry backoff shifted it.
    offsetMinutes: integer('offset_minutes').notNull().default(0),
    priority: text('priority').notNull().default('normal'),
    priorityWeight: integer('priority_weight').notNull().default(50),
    dependsOnJobId: integer('depends_on_job_id'),
    conditionJson: text('condition_json'), // e.g. {"type":"min_photos","value":15}
    status: text('status').notNull().default('pending'), // pending|queued|running|success|failed|retrying|cancelled|skipped|paused
    action: text('action').notNull().default('publish'), // publish|update_images|update_text|unpublish
    maxRetries: integer('max_retries').notNull().default(3),
    retryCount: integer('retry_count').notNull().default(0),
    retryBackoffSeconds: integer('retry_backoff_seconds').notNull().default(300),
    maxDurationSeconds: integer('max_duration_seconds').notNull().default(120),
    externalId: text('external_id'),
    // Filled in only by a real channel adapter on an actual successful
    // publish — see server/utils/publication/adapters/types.ts PublishResult.
    externalUrl: text('external_url'),
    publishedAt: text('published_at'),
    lastSyncAt: text('last_sync_at'),
    lastError: text('last_error'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [index('publication_jobs_dispatch').on(t.status, t.runAt), index('publication_jobs_schedule').on(t.scheduleId), index('publication_jobs_org').on(t.organizationId)],
)

export const publicationQueue = sqliteTable(
  'publication_queue',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    jobId: integer('job_id')
      .notNull()
      .references(() => publicationJobs.id, { onDelete: 'cascade' }),
    claimedAt: text('claimed_at'),
    claimedBy: text('claimed_by'),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('publication_queue_job').on(t.jobId), index('publication_queue_unclaimed').on(t.claimedAt)],
)

export const publicationExecutions = sqliteTable(
  'publication_executions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    jobId: integer('job_id')
      .notNull()
      .references(() => publicationJobs.id, { onDelete: 'cascade' }),
    attemptNumber: integer('attempt_number').notNull().default(1),
    startedAt: text('started_at').notNull(),
    finishedAt: text('finished_at'),
    result: text('result'), // success | error
    connected: integer('connected').notNull().default(0), // was a real channel adapter configured?
    responseSummary: text('response_summary'),
    errorMessage: text('error_message'),
    durationMs: integer('duration_ms'),
  },
  (t) => [index('publication_executions_job').on(t.jobId)],
)

export const publicationRetries = sqliteTable(
  'publication_retries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    jobId: integer('job_id')
      .notNull()
      .references(() => publicationJobs.id, { onDelete: 'cascade' }),
    attemptNumber: integer('attempt_number').notNull(),
    scheduledAt: text('scheduled_at').notNull(),
    backoffSeconds: integer('backoff_seconds').notNull(),
    executed: integer('executed').notNull().default(0),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('publication_retries_job').on(t.jobId)],
)

export const publicationHistory = sqliteTable(
  'publication_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    scheduleId: integer('schedule_id')
      .notNull()
      .references(() => publicationSchedules.id, { onDelete: 'cascade' }),
    jobId: integer('job_id').references(() => publicationJobs.id),
    event: text('event').notNull(),
    message: text('message').notNull(),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('publication_history_schedule').on(t.scheduleId, t.createdAt)],
)

export const publicationLogs = sqliteTable(
  'publication_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    level: text('level').notNull().default('info'), // info | warn | error
    message: text('message').notNull(),
    jobId: integer('job_id').references(() => publicationJobs.id),
    scheduleId: integer('schedule_id').references(() => publicationSchedules.id),
    actorUserId: integer('actor_user_id').references(() => users.id),
    contextJson: text('context_json'),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('publication_logs_org_created').on(t.organizationId, t.createdAt)],
)

export const publicationAutomationRules = sqliteTable(
  'publication_automation_rules',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    name: text('name').notNull(),
    triggerType: text('trigger_type').notNull(), // price_drop|photo_change|description_change|status_change
    actionType: text('action_type').notNull(), // update_all|update_images|update_text|unpublish
    enabled: integer('enabled').notNull().default(1),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('publication_automation_rules_org').on(t.organizationId)],
)

export const publicationNotifications = sqliteTable(
  'publication_notifications',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    userId: integer('user_id').references(() => users.id),
    scheduleId: integer('schedule_id').references(() => publicationSchedules.id),
    jobId: integer('job_id').references(() => publicationJobs.id),
    type: text('type').notNull(),
    channel: text('channel').notNull().default('internal'), // internal|email|whatsapp|telegram|slack
    delivered: integer('delivered').notNull().default(0),
    message: text('message').notNull(),
    readAt: text('read_at'),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('publication_notifications_org_read').on(t.organizationId, t.readAt)],
)

export const publicationAiTimeSuggestions = sqliteTable(
  'publication_ai_time_suggestions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    channelKey: text('channel_key').notNull(),
    propertyType: text('property_type').notNull(),
    suggestedHour: integer('suggested_hour').notNull(),
    confidence: real('confidence').notNull().default(0),
    sampleSize: integer('sample_size').notNull().default(0),
    computedAt: text('computed_at').notNull().default(''),
  },
  (t) => [uniqueIndex('publication_ai_time_suggestions_key').on(t.organizationId, t.channelKey, t.propertyType)],
)

export const publicationAiTimeRules = sqliteTable('publication_ai_time_rules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  organizationId: integer('organization_id').notNull().unique(),
  autoApply: integer('auto_apply').notNull().default(0),
  minConfidence: real('min_confidence').notNull().default(0.6),
  minSampleSize: integer('min_sample_size').notNull().default(5),
  createdAt: text('created_at').notNull().default(''),
  updatedAt: text('updated_at').notNull().default(''),
})

// Per-organization channel credentials, AES-GCM encrypted at rest (see
// server/utils/publication/credentials.ts) — for when a tenant connects its
// own portal account instead of relying on the Worker-wide secret in
// channels.ts `secretEnvVar`. Nothing reads from this table yet: no channel
// has a real adapter to consume it, but the storage is real and tested so
// wiring a real adapter later doesn't also require inventing this part.
export const publicationChannelCredentials = sqliteTable(
  'publication_channel_credentials',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    channelKey: text('channel_key').notNull(),
    ciphertext: text('ciphertext').notNull(),
    iv: text('iv').notNull(),
    keyVersion: integer('key_version').notNull().default(1),
    createdBy: integer('created_by'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [uniqueIndex('publication_channel_credentials_org_channel').on(t.organizationId, t.channelKey)],
)

// ---------------------------------------------------------------------------
// Platform error log (production monitoring) — see migrations/0027
// ---------------------------------------------------------------------------
export const errorLogs = sqliteTable(
  'error_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    statusCode: integer('status_code').notNull().default(500),
    message: text('message').notNull(),
    stack: text('stack'),
    method: text('method'),
    path: text('path'),
    organizationId: integer('organization_id'),
    userId: integer('user_id'),
    createdAt: text('created_at').notNull().default(''),
    // Correlation id (server/utils/requestId.ts, usually Cloudflare's own
    // cf-ray) — lets an error be matched to the webhook_deliveries row
    // its same request may have also produced. Nullable: rows recorded
    // before this column existed (migration 0056) have none.
    requestId: text('request_id'),
  },
  (t) => [index('error_logs_created_at').on(t.createdAt), index('error_logs_status').on(t.statusCode)],
)

// ---------------------------------------------------------------------------
// Generic admin audit log — see migrations/0028
// ---------------------------------------------------------------------------
export const adminAuditLog = sqliteTable(
  'admin_audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id'),
    userId: integer('user_id').notNull(),
    userEmail: text('user_email').notNull(),
    action: text('action').notNull(),
    resource: text('resource').notNull(),
    resourceId: text('resource_id'),
    detail: text('detail'),
    ip: text('ip'),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [
    index('admin_audit_log_org_created').on(t.organizationId, t.createdAt),
    index('admin_audit_log_resource').on(t.resource, t.resourceId),
  ],
)

/**
 * Activity (FASE 21, migración 0076): "qué ocurrió" en el negocio — deliberadamente
 * distinta de `adminAuditLog` ("qué cambio técnico/administrativo se hizo").
 * `admin_audit_log` dice "Laura cambió Lead.stage de QUALIFYING a QUALIFIED";
 * esta tabla dice "Lead cualificado". No se duplica una dentro de la otra.
 * Relaciones en columnas propias, no dentro de `metadataJson`, para poder
 * listar "toda la actividad de este contacto/lead/inmueble/cita" con un
 * índice. Append-only: ningún código hace UPDATE ni DELETE sobre esta tabla.
 */
export const activities = sqliteTable(
  'activities',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    eventType: text('event_type').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: integer('entity_id').notNull(),
    contactId: integer('contact_id'),
    leadId: integer('lead_id'),
    propertyId: integer('property_id'),
    propertyKind: text('property_kind'), // agent | developer
    appointmentId: integer('appointment_id'),
    buyerRequirementId: integer('buyer_requirement_id'),
    actorType: text('actor_type').notNull(), // user | contact | system | ai
    actorId: integer('actor_id'),
    metadataJson: text('metadata_json'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('activities_org_created').on(t.organizationId, t.createdAt),
    index('activities_contact').on(t.contactId, t.createdAt),
    index('activities_lead').on(t.leadId, t.createdAt),
    index('activities_property').on(t.propertyId, t.propertyKind, t.createdAt),
    index('activities_appointment').on(t.appointmentId, t.createdAt),
    index('activities_entity').on(t.entityType, t.entityId, t.createdAt),
  ],
)

/**
 * Task (FASE 22, migración 0077) — trabajo pendiente, deliberadamente
 * distinta de Appointment (tiempo reservado) y de Activity (algo que ya
 * ocurrió). No copia datos de sus relaciones (nombre de contacto, dirección
 * de propiedad): sólo guarda los ids y los consume al mostrarla.
 */
export const tasks = sqliteTable(
  'tasks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    type: text('type').notNull(), // call | whatsapp | email | follow_up | document | viewing | offer | signature | other
    title: text('title').notNull(),
    assigneeId: integer('assignee_id'), // team_members.id
    dueAt: text('due_at'),
    priority: text('priority').notNull().default('medium'), // low | medium | high | urgent
    status: text('status').notNull().default('open'), // open | in_progress | completed | cancelled
    contactId: integer('contact_id'),
    leadId: integer('lead_id'),
    propertyId: integer('property_id'),
    propertyKind: text('property_kind'), // agent | developer
    appointmentId: integer('appointment_id'),
    /** Sin FK real todavía — Deal no existe hasta FASE 24. Mismo precedente que visits.propertyId/propertyKind. */
    dealId: integer('deal_id'),
    /** Migración 0089 — oficina de la tarea. NULL = la de su responsable. */
    officeId: integer('office_id'),
    createdBy: integer('created_by'), // users.id
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    completedAt: text('completed_at'),
    /** Migración 0086 — borrado lógico. */
    deletedAt: text('deleted_at'),
  },
  (t) => [
    index('tasks_org_status_due').on(t.organizationId, t.status, t.dueAt),
    index('tasks_assignee_status_due').on(t.assigneeId, t.status, t.dueAt),
    index('tasks_contact').on(t.contactId),
    index('tasks_lead').on(t.leadId),
    index('tasks_property').on(t.propertyId, t.propertyKind),
    index('idx_tasks_org_office').on(t.organizationId, t.officeId),
    index('tasks_appointment').on(t.appointmentId),
    index('tasks_deal').on(t.dealId),
  ],
)

/**
 * Offer (FASE 23, migración 0078) — propuesta económica negociable.
 * `currentAmount`/`current*` son una proyección del estado actual; el
 * histórico real, inmutable, vive en `offerRevisions`. Referencia Contact
 * real para comprador y vendedor(es) (`offerSellers`) — nunca una entidad
 * Buyer/Seller paralela, y sin tabla PropertyContact (no existe en este
 * proyecto): quién es vendedor lo decide quien crea la oferta.
 */
export const offers = sqliteTable(
  'offers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    propertyId: integer('property_id').notNull(),
    propertyKind: text('property_kind').notNull(), // agent | developer
    buyerContactId: integer('buyer_contact_id').notNull(),
    leadId: integer('lead_id'),
    buyerRequirementId: integer('buyer_requirement_id'),
    matchId: integer('match_id'), // property_matches.id
    commercialId: integer('commercial_id'), // team_members.id
    currentAmount: real('current_amount').notNull(),
    currency: text('currency').notNull().default('eur'),
    currentConditions: text('current_conditions'),
    currentFinanceCondition: text('current_finance_condition'),
    expiration: text('expiration'),
    status: text('status').notNull().default('draft'), // draft | submitted | countered | accepted | rejected | withdrawn | expired
    currentRevisionId: integer('current_revision_id'),
    createdBy: integer('created_by'), // users.id
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    index('offers_org_status').on(t.organizationId, t.status),
    index('offers_property').on(t.propertyId, t.propertyKind),
    index('offers_buyer_contact').on(t.buyerContactId),
    index('offers_lead').on(t.leadId),
    index('offers_commercial').on(t.commercialId),
  ],
)

export const offerSellers = sqliteTable(
  'offer_sellers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    offerId: integer('offer_id').notNull(),
    contactId: integer('contact_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [uniqueIndex('offer_sellers_unique').on(t.offerId, t.contactId)],
)

/** Append-only — ningún código de este proyecto hace UPDATE ni DELETE aquí. */
export const offerRevisions = sqliteTable(
  'offer_revisions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    offerId: integer('offer_id').notNull(),
    type: text('type').notNull(), // created | submitted | countered | accepted | rejected | withdrawn | expired
    amount: real('amount').notNull(),
    currency: text('currency').notNull(),
    conditions: text('conditions'),
    financeCondition: text('finance_condition'),
    expiration: text('expiration'),
    actorType: text('actor_type').notNull(), // buyer | seller | user | system
    actorId: integer('actor_id'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('offer_revisions_offer').on(t.offerId, t.createdAt)],
)

/**
 * Deal Operation (FASE 24, migración 0079) — la operación en
 * ejecución/cierre. Distinta de Lead (oportunidad) y Offer (negociación).
 * Nace de una acción real ("Crear operación") sobre una Offer ya
 * `accepted` — nunca automática (§94 del encargo) — una por oferta (índice
 * único). `agreedAmount`/`currency` se copian de la oferta aceptada al
 * crear.
 *
 * Nombrada `dealOperations`/`deal_operations`, no `deals`: ya existe una
 * tabla `deals` (más abajo, junto a `valuations`) — el registro plano de
 * una venta/alquiler YA CERRADA para comisiones (`pages/admin/operaciones.vue`,
 * `deals-revenue.get.ts`), sembrada y con consumidores reales desde antes de
 * esta FASE. Son dos entidades distintas: aquélla es un apunte contable
 * histórico sin pipeline; ésta es la operación completa, con etapas,
 * comprador/vendedor reales y su propia oferta aceptada. `closeDeal()` en
 * `server/utils/deals/service.ts` crea un apunte en la tabla legacy `deals`
 * al cerrar — así los informes de comisiones ya existentes ven también lo
 * cerrado por este pipeline, sin tocar su esquema ni sus consumidores. Ver
 * docs/deals.md.
 */
export const dealOperations = sqliteTable(
  'deal_operations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    propertyId: integer('property_id').notNull(),
    propertyKind: text('property_kind').notNull(), // agent | developer
    buyerContactId: integer('buyer_contact_id').notNull(),
    acceptedOfferId: integer('accepted_offer_id').notNull(),
    leadId: integer('lead_id'),
    buyerRequirementId: integer('buyer_requirement_id'),
    commercialId: integer('commercial_id'), // team_members.id
    stage: text('stage').notNull().default('accepted_offer'), // accepted_offer | reservation | deposit_contract | financing | documentation | notary | signature | closed
    status: text('status').notNull().default('active'), // active | closed | cancelled
    agreedAmount: real('agreed_amount').notNull(),
    currency: text('currency').notNull(),
    openedAt: text('opened_at').notNull(),
    closedAt: text('closed_at'),
    cancelledAt: text('cancelled_at'),
    cancelReason: text('cancel_reason'),
    /** El apunte que este cierre creó en la tabla legacy `deals`, si lo creó — trazabilidad del puente entre las dos. */
    legacyDealId: integer('legacy_deal_id'),
    createdBy: integer('created_by'), // users.id
    // Migración 0086 — oficina y borrado lógico.
    officeId: integer('office_id'),
    deletedAt: text('deleted_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('deal_operations_accepted_offer').on(t.acceptedOfferId),
    index('deal_operations_org_status').on(t.organizationId, t.status),
    index('deal_operations_property').on(t.propertyId, t.propertyKind),
    index('deal_operations_buyer_contact').on(t.buyerContactId),
    index('deal_operations_commercial').on(t.commercialId),
    index('deal_operations_stage').on(t.stage),
  ],
)

export const dealOperationSellers = sqliteTable(
  'deal_operation_sellers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    dealOperationId: integer('deal_operation_id').notNull(),
    contactId: integer('contact_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [uniqueIndex('deal_operation_sellers_unique').on(t.dealOperationId, t.contactId)],
)

/** Append-only, mismo principio que leadStageHistory (FASE 13) — nunca se sobrescribe un movimiento de etapa anterior. */
export const dealOperationStageHistory = sqliteTable(
  'deal_operation_stage_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    dealOperationId: integer('deal_operation_id').notNull(),
    fromStage: text('from_stage'), // NULL en la primera fila (creación)
    toStage: text('to_stage').notNull(),
    actorType: text('actor_type').notNull(), // user | system
    actorId: integer('actor_id'),
    reason: text('reason'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('deal_operation_stage_history_deal').on(t.dealOperationId, t.createdAt)],
)

// ---------------------------------------------------------------------------
// Asset Export Studio — see migrations/0029 for full column rationale
// ---------------------------------------------------------------------------

export const brandKits = sqliteTable(
  'brand_kits',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull().unique(),
    logo: text('logo'),
    logoAlt: text('logo_alt'),
    logoLight: text('logo_light'),
    logoDark: text('logo_dark'),
    isotype: text('isotype'),
    favicon: text('favicon'),
    colorPrimary: text('color_primary'),
    colorSecondary: text('color_secondary'),
    colorAccentsJson: text('color_accents_json').notNull().default('[]'),
    colorBackground: text('color_background'),
    colorText: text('color_text'),
    fontHeading: text('font_heading'),
    fontBody: text('font_body'),
    fontAlt: text('font_alt'),
    buttonStyle: text('button_style'),
    iconStyle: text('icon_style'),
    cardStyle: text('card_style'),
    phone: text('phone'),
    whatsapp: text('whatsapp'),
    email: text('email'),
    website: text('website'),
    socialLinksJson: text('social_links_json').notNull().default('{}'),
    legalText: text('legal_text'),
    updatedBy: integer('updated_by'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [index('brand_kits_org').on(t.organizationId)],
)

export const brandKitVersions = sqliteTable(
  'brand_kit_versions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    brandKitId: integer('brand_kit_id')
      .notNull()
      .references(() => brandKits.id, { onDelete: 'cascade' }),
    snapshotJson: text('snapshot_json').notNull(),
    editedBy: integer('edited_by'),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('brand_kit_versions_kit').on(t.brandKitId, t.createdAt)],
)

// organizationId NULL = system template (shipped by us, read-only — a tenant
// duplicates it to get an editable copy; enforced in the API, see
// server/api/admin/asset-export/templates.*).
export const assetExportTemplates = sqliteTable(
  'asset_export_templates',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id'),
    name: text('name').notNull(),
    description: text('description'),
    category: text('category').notNull().default('modern'),
    formatKey: text('format_key').notNull(),
    assetTypeScope: text('asset_type_scope'),
    isSystem: integer('is_system').notNull().default(0),
    status: text('status').notNull().default('draft'),
    structureJson: text('structure_json').notNull().default('{"pages":[]}'),
    duplicatedFromId: integer('duplicated_from_id'),
    createdBy: integer('created_by'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [index('asset_export_templates_org').on(t.organizationId), index('asset_export_templates_format').on(t.formatKey)],
)

export const assetExportTemplateVersions = sqliteTable(
  'asset_export_template_versions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    templateId: integer('template_id')
      .notNull()
      .references(() => assetExportTemplates.id, { onDelete: 'cascade' }),
    structureJson: text('structure_json').notNull(),
    editedBy: integer('edited_by'),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('asset_export_template_versions_template').on(t.templateId, t.createdAt)],
)

// assetKind + assetId point at developer_properties or agent_properties —
// two separate flat tables today (see audit), so this can't be a single FK.
export const assetExportProjects = sqliteTable(
  'asset_export_projects',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    templateId: integer('template_id').references(() => assetExportTemplates.id),
    assetKind: text('asset_kind').notNull(),
    assetId: integer('asset_id').notNull(),
    name: text('name').notNull(),
    formatKey: text('format_key').notNull(),
    language: text('language').notNull().default('es'),
    status: text('status').notNull().default('draft'),
    structureJson: text('structure_json').notNull().default('{"pages":[]}'),
    lockMode: text('lock_mode').notNull().default('live'),
    priceAtCreation: real('price_at_creation'),
    createdBy: integer('created_by'),
    approvedBy: integer('approved_by'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [index('asset_export_projects_org').on(t.organizationId), index('asset_export_projects_asset').on(t.assetKind, t.assetId)],
)

export const assetExportProjectVersions = sqliteTable(
  'asset_export_project_versions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => assetExportProjects.id, { onDelete: 'cascade' }),
    structureJson: text('structure_json').notNull(),
    status: text('status').notNull(),
    editedBy: integer('edited_by'),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('asset_export_project_versions_project').on(t.projectId, t.createdAt)],
)

export const assetExportRenders = sqliteTable(
  'asset_export_renders',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    projectId: integer('project_id')
      .notNull()
      .references(() => assetExportProjects.id, { onDelete: 'cascade' }),
    outputType: text('output_type').notNull(),
    formatKey: text('format_key').notNull(),
    status: text('status').notNull().default('pending'),
    r2Key: text('r2_key'),
    fileSizeBytes: integer('file_size_bytes'),
    errorMessage: text('error_message'),
    requestedBy: integer('requested_by'),
    /** JSON RenderValidationResult (server/utils/assetExport/renderValidation.ts) — real QR round-trip decode + PDF open/page-count check, null if never validated. */
    validationJson: text('validation_json'),
    createdAt: text('created_at').notNull().default(''),
    completedAt: text('completed_at'),
  },
  (t) => [index('asset_export_renders_org').on(t.organizationId, t.createdAt), index('asset_export_renders_project').on(t.projectId)],
)

// The QR image always encodes a stable short URL of ours (/q/{code}), never
// the destination directly, so the destination can change without
// reprinting anything.
export const dynamicQrCodes = sqliteTable(
  'dynamic_qr_codes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    code: text('code').notNull().unique(),
    destinationUrl: text('destination_url').notNull(),
    destinationType: text('destination_type').notNull().default('custom'),
    assetKind: text('asset_kind'),
    assetId: integer('asset_id'),
    label: text('label'),
    utmJson: text('utm_json').notNull().default('{}'),
    styleJson: text('style_json').notNull().default('{}'),
    active: integer('active').notNull().default(1),
    expiresAt: text('expires_at'),
    scanCount: integer('scan_count').notNull().default(0),
    createdBy: integer('created_by'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [index('dynamic_qr_codes_org').on(t.organizationId), uniqueIndex('dynamic_qr_codes_code').on(t.code)],
)

// No IP-geolocation provider is wired up (would need an external credential)
// — ipHash exists for abuse/dedup only, never a raw IP, and there is no
// country/city column so nothing here can be misread as real geo data that
// was never actually looked up.
export const qrScans = sqliteTable(
  'qr_scans',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    qrCodeId: integer('qr_code_id')
      .notNull()
      .references(() => dynamicQrCodes.id, { onDelete: 'cascade' }),
    organizationId: integer('organization_id').notNull(),
    scannedAt: text('scanned_at').notNull().default(''),
    userAgent: text('user_agent'),
    referer: text('referer'),
    ipHash: text('ip_hash'),
  },
  (t) => [index('qr_scans_qr').on(t.qrCodeId, t.scannedAt), index('qr_scans_org').on(t.organizationId, t.scannedAt)],
)

export const exportBatches = sqliteTable(
  'export_batches',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    name: text('name').notNull(),
    status: text('status').notNull().default('pending'),
    totalCount: integer('total_count').notNull().default(0),
    completedCount: integer('completed_count').notNull().default(0),
    failedCount: integer('failed_count').notNull().default(0),
    requestedBy: integer('requested_by'),
    createdAt: text('created_at').notNull().default(''),
    completedAt: text('completed_at'),
  },
  (t) => [index('export_batches_org').on(t.organizationId, t.createdAt)],
)

export const exportBatchItems = sqliteTable(
  'export_batch_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    batchId: integer('batch_id')
      .notNull()
      .references(() => exportBatches.id, { onDelete: 'cascade' }),
    assetKind: text('asset_kind').notNull(),
    assetId: integer('asset_id').notNull(),
    templateId: integer('template_id').references(() => assetExportTemplates.id),
    formatKey: text('format_key').notNull(),
    status: text('status').notNull().default('pending'),
    renderId: integer('render_id').references(() => assetExportRenders.id),
    errorMessage: text('error_message'),
    createdAt: text('created_at').notNull().default(''),
    completedAt: text('completed_at'),
  },
  (t) => [index('export_batch_items_batch').on(t.batchId)],
)

// A catalog is one combined PDF (cover + index + per-asset sections) built
// from per-asset fragments — distinct from export_batches, which produces N
// independent documents. Assembly happens with pdf-lib's copyPages once every
// fragment has rendered (see server/utils/assetExport/catalogRenderer.ts).
export const assetExportCatalogs = sqliteTable(
  'asset_export_catalogs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    name: text('name').notNull(),
    templateId: integer('template_id')
      .notNull()
      .references(() => assetExportTemplates.id),
    formatKey: text('format_key').notNull(),
    coverTitle: text('cover_title'),
    status: text('status').notNull().default('pending'),
    totalCount: integer('total_count').notNull().default(0),
    completedCount: integer('completed_count').notNull().default(0),
    failedCount: integer('failed_count').notNull().default(0),
    r2Key: text('r2_key'),
    fileSizeBytes: integer('file_size_bytes'),
    errorMessage: text('error_message'),
    requestedBy: integer('requested_by'),
    validationJson: text('validation_json'),
    createdAt: text('created_at').notNull().default(''),
    completedAt: text('completed_at'),
  },
  (t) => [index('asset_export_catalogs_org').on(t.organizationId, t.createdAt)],
)

export const assetExportCatalogItems = sqliteTable(
  'asset_export_catalog_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    catalogId: integer('catalog_id')
      .notNull()
      .references(() => assetExportCatalogs.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    assetId: integer('asset_id').notNull(),
    status: text('status').notNull().default('pending'),
    title: text('title'),
    pageCount: integer('page_count'),
    r2Key: text('r2_key'),
    errorMessage: text('error_message'),
    validationJson: text('validation_json'),
    createdAt: text('created_at').notNull().default(''),
    completedAt: text('completed_at'),
  },
  (t) => [index('asset_export_catalog_items_catalog').on(t.catalogId, t.position)],
)

// ---------------------------------------------------------------------------
// 10 novedades (migration 0037): contratos, referidos, alertas de búsqueda,
// operaciones cerradas (ingresos + comisiones), tasador (AVM), depósito
// Stripe, webhooks salientes, RGPD.
// ---------------------------------------------------------------------------

export const contractTemplates = sqliteTable(
  'contract_templates',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    name: text('name').notNull(),
    type: text('type').notNull().default('reserva'), // reserva | arras | alquiler | compraventa
    bodyTemplate: text('body_template').notNull().default(''),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [index('contract_templates_org').on(t.organizationId)],
)

export const contracts = sqliteTable(
  'contracts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    templateId: integer('template_id').references(() => contractTemplates.id),
    title: text('title').notNull(),
    assetKind: text('asset_kind'),
    assetId: integer('asset_id'),
    clientName: text('client_name').notNull(),
    clientEmail: text('client_email'),
    /** Bindings already resolved at creation time — a contract is a frozen snapshot, not a live template. */
    bodyText: text('body_text').notNull(),
    status: text('status').notNull().default('draft'), // draft | sent | accepted | void
    managementToken: text('management_token'),
    acceptedByName: text('accepted_by_name'),
    acceptedIp: text('accepted_ip'),
    acceptedUserAgent: text('accepted_user_agent'),
    acceptedAt: text('accepted_at'),
    r2Key: text('r2_key'),
    createdBy: integer('created_by'),
    /** Migración 0086 — la operación (deal_operations) a la que pertenece este contrato. */
    dealOperationId: integer('deal_operation_id'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [index('contracts_org').on(t.organizationId, t.createdAt)],
)

export const referralLinks = sqliteTable(
  'referral_links',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    code: text('code').notNull(),
    referrerType: text('referrer_type').notNull().default('client'), // client | agent
    referrerName: text('referrer_name').notNull(),
    referrerEmail: text('referrer_email'),
    rewardType: text('reward_type').notNull().default('cash'), // cash | discount | commission
    rewardAmount: real('reward_amount'),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [uniqueIndex('referral_links_code').on(t.code), index('referral_links_org').on(t.organizationId)],
)

export const referrals = sqliteTable(
  'referrals',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    referralLinkId: integer('referral_link_id')
      .notNull()
      .references(() => referralLinks.id, { onDelete: 'cascade' }),
    refereeName: text('referee_name').notNull(),
    refereeEmail: text('referee_email'),
    refereePhone: text('referee_phone'),
    leadId: integer('lead_id'),
    status: text('status').notNull().default('pending'), // pending | converted | rewarded | expired
    convertedAt: text('converted_at'),
    rewardedAt: text('rewarded_at'),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('referrals_org').on(t.organizationId, t.status), index('referrals_link').on(t.referralLinkId)],
)

export const savedSearches = sqliteTable(
  'saved_searches',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    email: text('email').notNull(),
    filtersJson: text('filters_json').notNull().default('{}'),
    unsubscribeToken: text('unsubscribe_token').notNull(),
    lastNotifiedAt: text('last_notified_at'),
    active: integer('active').notNull().default(1),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('saved_searches_org').on(t.organizationId, t.active), uniqueIndex('saved_searches_unsubscribe_token').on(t.unsubscribeToken)],
)

// Suscripciones al newsletter de cada inmobiliaria (0093): el formulario
// «Suscríbete» del pie de la web. Una fila por persona y empresa; los tokens
// de baja y de confirmación (doble opt-in), sólo como SHA-256.
export const newsletterSubscriptions = sqliteTable(
  'newsletter_subscriptions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    email: text('email').notNull(),
    status: text('status').notNull().default('subscribed'), // subscribed | pending | unsubscribed
    source: text('source').notNull().default('footer'),
    locale: text('locale'),
    consentAt: text('consent_at').notNull(),
    unsubscribeTokenHash: text('unsubscribe_token_hash'),
    confirmTokenHash: text('confirm_token_hash'),
    confirmExpiresAt: text('confirm_expires_at'),
    confirmedAt: text('confirmed_at'),
    unsubscribedAt: text('unsubscribed_at'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [
    uniqueIndex('newsletter_subscriptions_org_email').on(t.organizationId, t.email),
    index('newsletter_subscriptions_org_status').on(t.organizationId, t.status, t.createdAt),
    uniqueIndex('newsletter_subscriptions_unsubscribe_token').on(t.unsubscribeTokenHash),
    uniqueIndex('newsletter_subscriptions_confirm_token').on(t.confirmTokenHash),
  ],
)

export const deals = sqliteTable(
  'deals',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    leadId: integer('lead_id'),
    clientName: text('client_name').notNull(),
    propertyId: integer('property_id'),
    propertyName: text('property_name'),
    agentId: integer('agent_id'),
    agentName: text('agent_name'),
    dealType: text('deal_type').notNull().default('sale'), // sale | rental
    dealValue: real('deal_value').notNull(),
    commissionRate: real('commission_rate').notNull().default(0),
    commissionAmount: real('commission_amount').notNull().default(0),
    commissionPaid: integer('commission_paid').notNull().default(0),
    paidAt: text('paid_at'),
    closedAt: text('closed_at').notNull(),
    createdBy: integer('created_by'),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('deals_org').on(t.organizationId, t.closedAt), index('deals_agent').on(t.agentId)],
)

export const valuations = sqliteTable(
  'valuations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    propertyType: text('property_type'),
    community: text('community'),
    area: real('area').notNull(),
    bedrooms: integer('bedrooms'),
    estimatedLow: real('estimated_low'),
    estimatedAvg: real('estimated_avg'),
    estimatedHigh: real('estimated_high'),
    pricePerSqmAvg: real('price_per_sqm_avg'),
    comparablesJson: text('comparables_json').notNull().default('[]'),
    requestedBy: integer('requested_by'),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('valuations_org').on(t.organizationId, t.createdAt)],
)

export const depositPayments = sqliteTable(
  'deposit_payments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    contractId: integer('contract_id').references(() => contracts.id),
    amount: real('amount').notNull(),
    currency: text('currency').notNull().default('eur'),
    status: text('status').notNull().default('pending'), // pending | not_connected | processing | paid | failed | refunded
    // The Checkout Session id (createDepositCheckout's sessionId) — set at
    // creation, before Stripe has even created a PaymentIntent.
    stripeCheckoutSessionId: text('stripe_checkout_session_id'),
    // The real PaymentIntent id — only known once a checkout.session.completed
    // webhook reveals it (server/api/stripe/webhook.post.ts). Needed to match
    // later payment_intent.payment_failed / charge.refunded events, which key
    // off the PaymentIntent, not the Checkout Session.
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    errorMessage: text('error_message'),
    /** Migración 0086 — la operación (deal_operations) a la que pertenecen estas arras. */
    dealOperationId: integer('deal_operation_id'),
    createdAt: text('created_at').notNull().default(''),
    paidAt: text('paid_at'),
    refundedAt: text('refunded_at'),
  },
  (t) => [
    index('deposit_payments_org').on(t.organizationId, t.createdAt),
    uniqueIndex('deposit_payments_session').on(t.stripeCheckoutSessionId),
    index('deposit_payments_payment_intent').on(t.stripePaymentIntentId),
  ],
)

export const stripeWebhookEvents = sqliteTable(
  'stripe_webhook_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    // Stripe's event id (evt_...) — the idempotency key. A redelivered event
    // (Stripe's delivery is at-least-once) hits this unique index and is
    // recognized as already-processed rather than reapplied.
    eventId: text('event_id').notNull().unique(),
    type: text('type').notNull(),
    organizationId: integer('organization_id'),
    depositId: integer('deposit_id').references(() => depositPayments.id),
    payloadJson: text('payload_json').notNull(),
    processedOk: integer('processed_ok').notNull().default(1),
    note: text('note'),
    receivedAt: text('received_at').notNull().default(''),
  },
  (t) => [index('stripe_webhook_events_org').on(t.organizationId, t.receivedAt)],
)

export const webhookEndpoints = sqliteTable(
  'webhook_endpoints',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    url: text('url').notNull(),
    secret: text('secret').notNull(),
    eventsJson: text('events_json').notNull().default('[]'),
    active: integer('active').notNull().default(1),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('webhook_endpoints_org').on(t.organizationId, t.active)],
)

export const webhookDeliveries = sqliteTable(
  'webhook_deliveries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    endpointId: integer('endpoint_id')
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
    event: text('event').notNull(),
    payloadJson: text('payload_json').notNull(),
    status: text('status').notNull().default('pending'), // pending | queued | delivered | failed
    responseCode: integer('response_code'),
    errorMessage: text('error_message'),
    attempts: integer('attempts').notNull().default(0),
    createdAt: text('created_at').notNull().default(''),
    deliveredAt: text('delivered_at'),
    // Backoff schedule for 'queued' rows — server/tasks/notifications/retry-webhook-queue.ts
    // picks these up past this timestamp, same pattern as email_log.nextRetryAt.
    nextRetryAt: text('next_retry_at'),
    // Correlation id (server/utils/requestId.ts) of the request that
    // triggered this delivery — set once at creation, not re-derived on
    // retries (a retry is a background job, not tied to the original
    // request). Nullable: rows recorded before this column existed
    // (migration 0056) have none.
    requestId: text('request_id'),
  },
  (t) => [index('webhook_deliveries_endpoint').on(t.endpointId, t.createdAt)],
)

export const gdprRequests = sqliteTable(
  'gdpr_requests',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    requestType: text('request_type').notNull(), // export | delete
    subjectEmail: text('subject_email').notNull(),
    rowsAffected: integer('rows_affected').notNull().default(0),
    requestedBy: integer('requested_by'),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('gdpr_requests_org').on(t.organizationId, t.createdAt)],
)

// ---------------------------------------------------------------------------
// Media Asset Manager (migration 0039) — every R2 object that isn't
// unconditionally public gets a row here. The row, not the R2 key, is the
// authorization boundary: /api/media/* looks this table up before it will
// ever stream bytes for a private or confidential key. See
// docs/r2-architecture.md for the full design.
// ---------------------------------------------------------------------------

export const mediaAssets = sqliteTable(
  'media_assets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    r2Key: text('r2_key').notNull().unique(),
    originalFilename: text('original_filename'),
    mimeType: text('mime_type').notNull(),
    extension: text('extension').notNull(),
    sizeBytes: integer('size_bytes').notNull().default(0),
    checksum: text('checksum'), // sha-256 hex of the real bytes
    visibility: text('visibility').notNull().default('private'), // public | private | confidential
    category: text('category').notNull().default('upload'), // property-photo | logo | blog-image | kyc-document | contract | export | catalog | upload
    entityType: text('entity_type'),
    entityId: integer('entity_id'),
    createdBy: integer('created_by'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
    deletedAt: text('deleted_at'), // soft-delete: grace period before the purge job removes the R2 object
    purgedAt: text('purged_at'),
    metadata: text('metadata'), // free-form JSON (image dimensions, source, backfill markers…)
  },
  (t) => [
    index('media_assets_org').on(t.organizationId, t.createdAt),
    index('media_assets_visibility').on(t.visibility),
    index('media_assets_entity').on(t.entityType, t.entityId),
    index('media_assets_checksum').on(t.organizationId, t.checksum),
    index('media_assets_purge').on(t.deletedAt, t.purgedAt),
  ],
)

// Tracks an in-progress R2 multipart upload (P1-8, docs/production-hardening-audit.md)
// so a later request (uploading part N, or completing/aborting) can prove it
// owns that `upload_id` before touching it — the R2 upload_id itself is an
// unguessable capability, but ownership is still meant to come from a D1 row
// everywhere else in this codebase (see buildStructuredKey's own comment),
// not from trusting an opaque string alone. Rows are cleaned up by
// server/tasks/system/media-lifecycle.ts once a `media_assets` row exists
// (status='completed') or the upload is abandoned (status='aborted').
export const mediaMultipartUploads = sqliteTable(
  'media_multipart_uploads',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    uploadId: text('upload_id').notNull().unique(),
    r2Key: text('r2_key').notNull(),
    mimeType: text('mime_type').notNull(),
    extension: text('extension').notNull(),
    category: text('category').notNull(),
    entityType: text('entity_type'),
    entityId: integer('entity_id'),
    originalFilename: text('original_filename'),
    declaredSizeBytes: integer('declared_size_bytes').notNull(),
    createdBy: integer('created_by'),
    status: text('status').notNull().default('pending'), // pending | completed | aborted
    createdAt: text('created_at').notNull().default(''),
    completedAt: text('completed_at'),
  },
  (t) => [index('media_multipart_uploads_org').on(t.organizationId, t.status), index('media_multipart_uploads_stale').on(t.status, t.createdAt)],
)

// Every read of a confidential object is logged — who, when, from where, and
// whether it was actually allowed. `denied` rows matter as much as
// `download` ones: a burst of denials against one tenant's documents is the
// signal an incident investigation would look for.
export const mediaAccessLog = sqliteTable(
  'media_access_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    userId: integer('user_id'),
    userEmail: text('user_email'),
    mediaAssetId: integer('media_asset_id'),
    r2Key: text('r2_key').notNull(),
    action: text('action').notNull(), // download | denied
    visibility: text('visibility'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('media_access_log_org').on(t.organizationId, t.createdAt), index('media_access_log_asset').on(t.mediaAssetId, t.createdAt)],
)

// ---------------------------------------------------------------------------
// Constructor Web — el "Portal Web" (público) deja de ser una plantilla fija
// por tenant y pasa a estar compuesto de bloques editables. `draftJson` es lo
// que el builder edita; `publishedJson` es lo que sirve el sitio público.
// Ambos son independientes a propósito: los datos dinámicos (propiedades,
// comunidades, agentes) NUNCA se guardan aquí — los bloques solo guardan
// criterios de selección, y se resuelven en vivo contra las tablas reales en
// cada render. Ver docs/site-builder.md.
// ---------------------------------------------------------------------------

export const sitePages = sqliteTable(
  'site_pages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    pageKey: text('page_key').notNull().default('home'), // multi-página futura: hoy solo 'home'
    draftJson: text('draft_json').notNull().default('{"blocks":[],"seo":{}}'),
    publishedJson: text('published_json'), // null = nunca publicada
    version: integer('version').notNull().default(0),
    publishedAt: text('published_at'),
    publishedBy: integer('published_by'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [uniqueIndex('site_pages_org_key').on(t.organizationId, t.pageKey)],
)

// Un snapshot por cada Publish (no por cada autoguardado) — mismo patrón que
// cms_article_versions. Es la base para el historial/restauración futuros.
export const sitePageVersions = sqliteTable(
  'site_page_versions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    pageId: integer('page_id')
      .notNull()
      .references(() => sitePages.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    snapshotJson: text('snapshot_json').notNull(),
    publishedBy: integer('published_by'),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('site_page_versions_page').on(t.pageId, t.version)],
)

// ---------------------------------------------------------------------------
// Transactional email (0044) — see server/utils/email/
// ---------------------------------------------------------------------------

/**
 * One row per send attempt. `status` only ever becomes 'delivered',
 * 'bounced' or 'complained' via the Resend webhook
 * (server/api/resend/webhook.post.ts) confirming it — never from the
 * synchronous API call succeeding, which only proves Resend *accepted* the
 * request, not that a mailbox received it. Also the retry queue: a failed
 * attempt stays 'queued' with `nextRetryAt` set until `attempts` reaches the
 * configured max, at which point it becomes permanently 'failed'.
 */
export const emailLog = sqliteTable(
  'email_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    template: text('template').notNull(),
    kind: text('kind').notNull().default('transactional'), // transactional | commercial
    recipient: text('recipient').notNull(),
    fromHeader: text('from_header').notNull(),
    replyTo: text('reply_to'),
    subject: text('subject').notNull(),
    // The exact rendered HTML sent (or queued to send) — makes a retry
    // self-contained and doubles as a real audit trail.
    html: text('html').notNull(),
    locale: text('locale').notNull().default('es'),
    provider: text('provider').notNull().default('resend'),
    status: text('status').notNull().default('queued'), // queued | sent | delivered | bounced | complained | failed
    externalId: text('external_id'), // Resend's email id — how the webhook matches a delivery event back to this row
    attempts: integer('attempts').notNull().default(0),
    nextRetryAt: text('next_retry_at'),
    errorMessage: text('error_message'),
    sentAt: text('sent_at'),
    deliveredAt: text('delivered_at'),
    bouncedAt: text('bounced_at'),
    complainedAt: text('complained_at'),
    createdAt: text('created_at').notNull().default(''),
    // Correlation id (server/utils/requestId.ts) of the request that triggered
    // this send — lets it be matched to an error_logs/webhook_deliveries row
    // from the same request. Nullable: a send from a scheduled task (reminders,
    // saved-search alerts) has no HTTP request to correlate with, and rows
    // recorded before this column existed (migration 0060) have none either.
    requestId: text('request_id'),
  },
  (t) => [
    index('email_log_org').on(t.organizationId, t.createdAt),
    index('email_log_retry').on(t.status, t.nextRetryAt),
    index('email_log_external_id').on(t.externalId),
  ],
)

/** Idempotency for Resend's webhook deliveries (Svix event ids) — same claim-then-process pattern as stripe_webhook_events (0043). */
export const resendWebhookEvents = sqliteTable(
  'resend_webhook_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    svixId: text('svix_id').notNull().unique(),
    type: text('type').notNull(),
    emailLogId: integer('email_log_id').references(() => emailLog.id),
    organizationId: integer('organization_id'),
    payloadJson: text('payload_json').notNull(),
    processedOk: integer('processed_ok').notNull().default(1),
    note: text('note'),
    receivedAt: text('received_at').notNull().default(''),
  },
  (t) => [index('resend_webhook_events_org').on(t.organizationId, t.receivedAt)],
)

/**
 * Resultado de cada comprobación sintética de un dominio personalizado
 * (server/tasks/system/check-custom-domains.ts, migración 0062). El aviso
 * sólo sale cuando `ok` cambia respecto a la fila anterior de la misma
 * organización; Estado del sistema enseña la última por dominio.
 */
export const domainChecks = sqliteTable(
  'domain_checks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    domain: text('domain').notNull(),
    ok: integer('ok').notNull().default(0),
    httpStatus: integer('http_status'),
    latencyMs: integer('latency_ms'),
    error: text('error'),
    checkedAt: text('checked_at').notNull().default(''),
  },
  (t) => [index('domain_checks_org_checked').on(t.organizationId, t.checkedAt)],
)

/** The "recuperación de contraseña" email needs a real reset flow — only the token's SHA-256 hash is ever stored, same principle as api_keys. */
export const passwordResetTokens = sqliteTable(
  'password_reset_tokens',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: text('expires_at').notNull(),
    usedAt: text('used_at'),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('password_reset_tokens_user').on(t.userId, t.expiresAt)],
)

// ---------------------------------------------------------------------------
// Centro de Comunicaciones (migración 0065) — WhatsApp Business + llamadas
// ---------------------------------------------------------------------------
// Bandeja de conversaciones por agencia con el proveedor detrás de
// server/utils/comms/providers (Meta WhatsApp Cloud API o Twilio). Las
// credenciales del canal van cifradas (server/utils/comms/credentials.ts);
// nada de esto llega en claro al navegador.

/** Ajustes del centro de comunicaciones de una agencia. Una fila por organización; ausente = valores por defecto. */
export const commsSettings = sqliteTable('comms_settings', {
  organizationId: integer('organization_id').primaryKey(),
  /** Prefijo para teléfonos guardados sin "+" (p. ej. "+34"). Sin él, un teléfono sin prefijo internacional se rechaza. */
  defaultCountryPrefix: text('default_country_prefix'),
  /** ask = el contacto desconocido se queda como tal hasta que alguien lo vincule; lead = se crea un lead automáticamente. */
  unknownContactPolicy: text('unknown_contact_policy').notNull().default('ask'),
  notifyInternal: integer('notify_internal').notNull().default(1),
  /** Núcleo N8a (migración 0087): el chat de la web pública, activable por agencia. Apagado por defecto. */
  webChatEnabled: integer('web_chat_enabled').notNull().default(0),
  /** Saludo del chat web; NULL = el texto por defecto. */
  webChatGreeting: text('web_chat_greeting'),
  createdAt: text('created_at').notNull().default(''),
  updatedAt: text('updated_at').notNull().default(''),
})

/**
 * Un número de WhatsApp conectado. `externalPhoneId` es el phone_number_id
 * de Meta o el remitente `whatsapp:+E.164` de Twilio, y (provider,
 * externalPhoneId) es la clave por la que un webhook entrante encuentra la
 * agencia a la que pertenece — antes de fiarse de nada del cuerpo, que sólo
 * se acepta si la firma cuadra con el secreto de ESE canal.
 */
export const commsChannels = sqliteTable(
  'comms_channels',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    provider: text('provider').notNull(), // meta_cloud | twilio
    label: text('label').notNull().default(''),
    phoneE164: text('phone_e164').notNull(),
    externalPhoneId: text('external_phone_id').notNull(),
    businessAccountId: text('business_account_id'),
    credentialsCiphertext: text('credentials_ciphertext').notNull(),
    credentialsIv: text('credentials_iv').notNull(),
    keyVersion: integer('key_version').notNull().default(1),
    status: text('status').notNull().default('active'), // active | disabled
    isDefault: integer('is_default').notNull().default(0),
    callingStatus: text('calling_status').notNull().default('unknown'), // unknown | unavailable | disabled | enabled
    callingCheckedAt: text('calling_checked_at'),
    callingNote: text('calling_note'),
    lastError: text('last_error'),
    createdBy: integer('created_by'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [uniqueIndex('comms_channels_provider_phone').on(t.provider, t.externalPhoneId), index('comms_channels_org').on(t.organizationId, t.status)],
)

/** El teléfono con el que se habla, normalizado a E.164, vinculado (o no) a un cliente o un lead. */
export const commsContacts = sqliteTable(
  'comms_contacts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    phoneE164: text('phone_e164').notNull(),
    waId: text('wa_id'),
    /** Nombre de perfil que manda el proveedor; NO es el nombre del cliente del CRM. */
    displayName: text('display_name'),
    clientId: integer('client_id'),
    leadId: integer('lead_id'),
    consentStatus: text('consent_status').notNull().default('unknown'), // unknown | opted_in | opted_out
    consentSource: text('consent_source'),
    consentUpdatedAt: text('consent_updated_at'),
    callPermissionStatus: text('call_permission_status').notNull().default('unknown'), // unknown | temporary | permanent | denied | expired
    callPermissionExpiresAt: text('call_permission_expires_at'),
    callPermissionUpdatedAt: text('call_permission_updated_at'),
    lastInboundAt: text('last_inbound_at'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [
    uniqueIndex('comms_contacts_org_phone').on(t.organizationId, t.phoneE164),
    index('comms_contacts_client').on(t.clientId),
    index('comms_contacts_lead').on(t.leadId),
  ],
)

/** Un hilo por (canal, contacto). `lastInboundAt` es de donde sale la ventana de 24 h de WhatsApp. */
export const commsConversations = sqliteTable(
  'comms_conversations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    channelId: integer('channel_id').notNull(),
    contactId: integer('contact_id').notNull(),
    status: text('status').notNull().default('open'), // open | pending | closed
    assignedAgentId: integer('assigned_agent_id'), // team_members.id
    propertyId: integer('property_id'), // contexto del hilo — developer_properties.id o agent_properties.id, según propertyKind
    /** 'agent' | 'developer'. NULL en filas de antes de la migración 0082 = 'developer' (único catálogo que existía). */
    propertyKind: text('property_kind'),
    lastMessageAt: text('last_message_at'),
    lastMessagePreview: text('last_message_preview'),
    lastInboundAt: text('last_inbound_at'),
    unreadCount: integer('unread_count').notNull().default(0),
    /**
     * Núcleo N8a (migración 0087): el Contact (`contacts.id`) de este hilo,
     * GUARDADO cuando se conoce (al abrir o vincular el hilo) en vez de
     * deducirse en cada lectura. NULL = todavía no se conoce o fila anterior
     * a la 0087; el código sigue deduciéndolo como respaldo.
     */
    crmContactId: integer('crm_contact_id'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [
    uniqueIndex('comms_conversations_channel_contact').on(t.channelId, t.contactId),
    index('comms_conversations_org_last').on(t.organizationId, t.status, t.lastMessageAt),
    index('comms_conversations_contact').on(t.contactId),
    index('comms_conversations_crm_contact').on(t.organizationId, t.crmContactId),
  ],
)

/**
 * Cada mensaje. `direction = note` es una nota interna que nunca se envía.
 * `externalId` (wamid.… / SM…) es único cuando existe: un webhook repetido
 * choca con el índice y no duplica.
 */
export const commsMessages = sqliteTable(
  'comms_messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    conversationId: integer('conversation_id').notNull(),
    direction: text('direction').notNull(), // in | out | note
    type: text('type').notNull().default('text'), // text | image | document | audio | video | template | interactive | location | property_share | unsupported | note
    body: text('body'),
    mediaKey: text('media_key'), // R2 (medios entrantes descargados)
    mediaUrl: text('media_url'), // enlace externo con el que se envió
    mediaMime: text('media_mime'),
    mediaFilename: text('media_filename'),
    templateName: text('template_name'),
    templateLanguage: text('template_language'),
    templateParamsJson: text('template_params_json'),
    propertyId: integer('property_id'),
    propertyKind: text('property_kind'), // agent | developer; NULL en filas de antes de la 0082 = 'developer'
    externalId: text('external_id'),
    status: text('status').notNull().default('queued'), // queued | sent | delivered | read | failed | received
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    sentByUserId: integer('sent_by_user_id'),
    providerTimestamp: text('provider_timestamp'),
    payloadJson: text('payload_json'),
    /** FASE 29 §109/§135 — cada una se rellena sólo la primera vez que `status` alcanza ese punto; nunca se inventa una fecha que el proveedor no confirmó. */
    sentAt: text('sent_at'),
    deliveredAt: text('delivered_at'),
    readAt: text('read_at'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [
    uniqueIndex('comms_messages_external').on(t.externalId),
    index('comms_messages_conversation').on(t.conversationId, t.id),
    index('comms_messages_org_created').on(t.organizationId, t.createdAt),
  ],
)

/** Cada llamada, por WhatsApp Calling o registrada a mano, con su resultado y la visita de seguimiento creada desde ella. */
export const commsCalls = sqliteTable(
  'comms_calls',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    channelId: integer('channel_id'),
    contactId: integer('contact_id').notNull(),
    conversationId: integer('conversation_id'),
    direction: text('direction').notNull(), // inbound | outbound
    provider: text('provider').notNull(), // meta_cloud | manual
    externalId: text('external_id'), // wacid.…
    status: text('status').notNull().default('initiated'), // initiated | ringing | accepted | in_progress | completed | failed | rejected | missed | cancelled
    outcome: text('outcome'), // answered | no_answer | busy | voicemail | wrong_number | callback | not_interested | interested
    notes: text('notes'),
    agentId: integer('agent_id'),
    userId: integer('user_id'),
    propertyId: integer('property_id'),
    propertyKind: text('property_kind'), // agent | developer; NULL en filas de antes de la 0082 = 'developer'
    followUpVisitId: integer('follow_up_visit_id'),
    startedAt: text('started_at'),
    answeredAt: text('answered_at'),
    endedAt: text('ended_at'),
    durationSeconds: integer('duration_seconds'),
    errorMessage: text('error_message'),
    /** SDP de la sesión WebRTC mientras la llamada está viva (oferta entrante / respuesta de Meta). Se vacía al terminar. */
    sessionJson: text('session_json'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [
    uniqueIndex('comms_calls_external').on(t.externalId),
    index('comms_calls_org_created').on(t.organizationId, t.createdAt),
    index('comms_calls_contact').on(t.contactId, t.createdAt),
    index('comms_calls_channel_status').on(t.channelId, t.status),
  ],
)

/** Plantillas aprobadas del número, para escribir fuera de la ventana de 24 h. A mano o sincronizadas desde Meta. */
export const commsTemplates = sqliteTable(
  'comms_templates',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    channelId: integer('channel_id').notNull(),
    name: text('name').notNull(),
    language: text('language').notNull().default('es'),
    category: text('category'),
    /** Texto con {{1}}, {{2}}… tal como lo aprobó Meta: sirve para previsualizar y para guardar lo que se envió. */
    body: text('body').notNull(),
    status: text('status').notNull().default('unknown'), // approved | pending | rejected | paused | unknown
    externalId: text('external_id'),
    syncedAt: text('synced_at'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [uniqueIndex('comms_templates_channel_name_lang').on(t.channelId, t.name, t.language), index('comms_templates_org').on(t.organizationId)],
)

/** Idempotencia de webhooks: (provider, eventKey) único, mismo patrón que stripe_webhook_events. */
export const commsWebhookEvents = sqliteTable(
  'comms_webhook_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    provider: text('provider').notNull(),
    eventKey: text('event_key').notNull(),
    organizationId: integer('organization_id'),
    channelId: integer('channel_id'),
    payloadJson: text('payload_json').notNull(),
    processedOk: integer('processed_ok').notNull().default(1),
    note: text('note'),
    receivedAt: text('received_at').notNull().default(''),
  },
  (t) => [uniqueIndex('comms_webhook_events_key').on(t.provider, t.eventKey), index('comms_webhook_events_org').on(t.organizationId, t.receivedAt)],
)

// ---------------------------------------------------------------------------
// Núcleo N8a (migración 0087) — formularios y chat web como hilos de la bandeja
// ---------------------------------------------------------------------------

/**
 * Un hilo web: un envío de formulario público (`kind = form`) o una
 * conversación del chat de la web (`kind = chat`). No es un hilo de WhatsApp —
 * no hay número de la agencia ni teléfono obligatorio — y por eso vive aparte;
 * la bandeja de Comunicaciones lista los dos juntos
 * (server/utils/comms/web.ts). Contact, Lead y Property se GUARDAN al crearlo.
 * El chat se identifica por un token opaco del visitante del que sólo se
 * guarda el SHA-256 (`sessionTokenHash`).
 */
export const commsWebThreads = sqliteTable(
  'comms_web_threads',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    kind: text('kind').notNull(), // form | chat
    status: text('status').notNull().default('open'), // open | pending | closed
    assignedAgentId: integer('assigned_agent_id'), // team_members.id
    contactId: integer('contact_id'), // contacts.id
    leadId: integer('lead_id'),
    propertyId: integer('property_id'),
    propertyKind: text('property_kind'), // agent | developer
    visitorName: text('visitor_name'),
    visitorEmail: text('visitor_email'),
    visitorPhone: text('visitor_phone'),
    formType: text('form_type'), // contact | lead_form | visit_request | visitor | referral
    pageUrl: text('page_url'),
    sessionTokenHash: text('session_token_hash'),
    sessionExpiresAt: text('session_expires_at'),
    lastMessageAt: text('last_message_at'),
    lastMessagePreview: text('last_message_preview'),
    lastInboundAt: text('last_inbound_at'),
    unreadCount: integer('unread_count').notNull().default(0),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [
    index('comms_web_threads_org_last').on(t.organizationId, t.status, t.lastMessageAt),
    index('comms_web_threads_org_updated').on(t.organizationId, t.updatedAt),
    index('comms_web_threads_contact').on(t.organizationId, t.contactId),
    index('comms_web_threads_lead').on(t.organizationId, t.leadId),
    // En la migración es UNIQUE y parcial (WHERE session_token_hash IS NOT NULL).
    index('comms_web_threads_session').on(t.sessionTokenHash),
  ],
)

/** Cada mensaje de un hilo web: lo que llegó por el formulario o el chat, lo que respondió el equipo (chat o email) y las notas internas. */
export const commsWebMessages = sqliteTable(
  'comms_web_messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    threadId: integer('thread_id').notNull(),
    direction: text('direction').notNull(), // in | out | note
    via: text('via').notNull(), // form | chat | email | note
    body: text('body'),
    fieldsJson: text('fields_json'),
    propertyId: integer('property_id'),
    propertyKind: text('property_kind'),
    status: text('status').notNull().default('received'), // received | sent | queued | failed
    errorMessage: text('error_message'),
    emailLogId: integer('email_log_id'),
    sentByUserId: integer('sent_by_user_id'),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('comms_web_messages_thread').on(t.threadId, t.id), index('comms_web_messages_org').on(t.organizationId, t.createdAt)],
)

/**
 * FASE 32 — enlace personal a una ficha (`/propiedades/<slug>?f=<token>`)
 * enviado por email o por el chat web a una persona concreta. La apertura la
 * registra el navegador al mostrar la ficha (server/utils/comms/shareLinks.ts);
 * es la señal «abrió fichas» del Lead Score para los canales sin confirmación
 * de lectura. Se guarda el hash del token, nunca el token.
 */
export const propertyShareLinks = sqliteTable(
  'property_share_links',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    propertyKind: text('property_kind').notNull(),
    propertyId: integer('property_id').notNull(),
    contactId: integer('contact_id'),
    leadId: integer('lead_id'),
    channel: text('channel').notNull(), // email | chat
    webMessageId: integer('web_message_id'),
    createdBy: integer('created_by'),
    openCount: integer('open_count').notNull().default(0),
    firstOpenedAt: text('first_opened_at'),
    lastOpenedAt: text('last_opened_at'),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [
    uniqueIndex('property_share_links_token').on(t.tokenHash),
    index('property_share_links_lead').on(t.organizationId, t.leadId),
    index('property_share_links_contact').on(t.organizationId, t.contactId),
  ],
)

// ---------------------------------------------------------------------------
// FASE 10 — Contact y Buyer Requirement (migración 0066)
// ---------------------------------------------------------------------------

/**
 * La persona (u organización). Hasta la migración 0066 el dominio no tenía
 * ninguna: `leads` y `clients` guardaban cada uno su propio nombre/email/
 * teléfono sueltos, y para cruzarlos había que comparar los últimos dígitos
 * del teléfono (server/utils/comms/matching.ts). `contacts` es la fuente de
 * verdad de la identidad; `leads` sigue siendo la oportunidad y `clients` la
 * relación comercial, ambos ahora apuntando aquí.
 *
 * Los `normalized*` existen para deduplicar y se rellenan con
 * server/utils/comms/phone.ts (E.164) y el email en minúsculas — nunca se
 * comparan los valores tal y como los escribió una persona.
 */
export const contacts = sqliteTable(
  'contacts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    kind: text('kind').notNull().default('person'), // person | company
    name: text('name').notNull(),
    email: text('email'),
    phone: text('phone'),
    whatsapp: text('whatsapp'),
    normalizedEmail: text('normalized_email'),
    normalizedPhone: text('normalized_phone'),
    normalizedWhatsapp: text('normalized_whatsapp'),
    /** Un id externo sólo es único dentro de su origen: "12345" de Idealista no es "12345" de otro CRM. */
    externalSource: text('external_source'),
    externalId: text('external_id'),
    language: text('language'),
    /** team_members.id — el "Comercial" real del producto. */
    assignedCommercialId: integer('assigned_commercial_id'),
    notes: text('notes'),
    status: text('status').notNull().default('active'), // active | archived
    createdBy: integer('created_by'),
    // Migración 0086 — cabecera CRM 360 (FASE 9).
    country: text('country'),
    source: text('source'),
    officeId: integer('office_id'),
    lastContactAt: text('last_contact_at'),
    nextActionType: text('next_action_type'),
    nextActionAt: text('next_action_at'),
    /** Migración 0090 — foto del contacto: clave de R2 o URL, como team_members.image. */
    photo: text('photo'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
    deletedAt: text('deleted_at'),
  },
  (t) => [
    index('contacts_org_email').on(t.organizationId, t.normalizedEmail),
    index('contacts_org_phone').on(t.organizationId, t.normalizedPhone),
    index('contacts_org_whatsapp').on(t.organizationId, t.normalizedWhatsapp),
    index('contacts_org_created').on(t.organizationId, t.createdAt),
    index('contacts_org_commercial').on(t.organizationId, t.assignedCommercialId),
    uniqueIndex('contacts_org_external').on(t.organizationId, t.externalSource, t.externalId),
  ],
)

/**
 * La necesidad inmobiliaria. Una misma persona puede tener varias a la vez
 * (vivienda habitual, inversión, local) con criterios distintos, por eso es
 * una entidad y no un bloque de campos dentro de Contact.
 *
 * Un campo a NULL significa "no especificado", que NO es lo mismo que 0 ni
 * que "no lo quiere": esa diferencia la respeta el motor de matching.
 */
export const buyerRequirements = sqliteTable(
  'buyer_requirements',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    contactId: integer('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    assignedCommercialId: integer('assigned_commercial_id'),
    title: text('title').notNull().default(''),
    status: text('status').notNull().default('active'), // active | paused | fulfilled | archived
    /** Misma taxonomía que agent_properties.transaction_type, sin capa de equivalencia. */
    operation: text('operation').notNull().default('sale'), // sale | rent
    /** Valores estables del catálogo (Apartment|Villa|Townhouse|Penthouse|Studio), no etiquetas libres. */
    propertyTypesJson: text('property_types_json').notNull().default('[]'),
    priceMin: real('price_min'),
    priceMax: real('price_max'),
    areaMin: real('area_min'),
    areaMax: real('area_max'),
    bedroomsMin: integer('bedrooms_min'),
    bathroomsMin: integer('bathrooms_min'),
    /** Referencias estructuradas {communityId|locationId|city|district|postalCode}, nunca "Chamberí, Salamanca" en un string. */
    desiredZonesJson: text('desired_zones_json').notNull().default('[]'),
    /** Las exclusiones tienen precedencia sobre las zonas deseadas cuando hay conflicto. */
    excludedZonesJson: text('excluded_zones_json').notNull().default('[]'),
    centerLat: real('center_lat'),
    centerLng: real('center_lng'),
    radiusKm: real('radius_km'),
    /** Estado físico del inmueble; no confundir con el estado comercial de la Property. */
    conditionPref: text('condition_pref'), // good | to_reform | any
    /** NUNCA se deduce del módulo de origen: crear una ficha en "2ª mano" no hace que el inmueble lo sea. */
    buildPref: text('build_pref'), // new | second_hand | renovated
    /** Cuándo quiere comprar/alquilar. No es createdAt. */
    desiredDate: text('desired_date'),
    needsMortgage: integer('needs_mortgage'), // NULL = desconocido
    mortgageStatus: text('mortgage_status'), // required | requested | preapproved | approved | not_needed
    financingNotes: text('financing_notes'),
    /** Sólo lo marca una acción real, con autor y fecha: no basta con que el cliente diga una cifra. */
    budgetValidated: integer('budget_validated').notNull().default(0),
    budgetValidatedAt: text('budget_validated_at'),
    budgetValidatedBy: integer('budget_validated_by'),
    urgency: text('urgency'), // low | medium | high | urgent
    notes: text('notes'),
    createdBy: integer('created_by'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
    deletedAt: text('deleted_at'),
  },
  (t) => [
    index('buyer_requirements_org_contact').on(t.organizationId, t.contactId),
    index('buyer_requirements_org_status').on(t.organizationId, t.status, t.operation),
    index('buyer_requirements_commercial').on(t.assignedCommercialId),
  ],
)

/**
 * La importancia de cada criterio: imprescindible / preferible / indiferente.
 *
 * Se resuelve con filas y no con columnas (terraceImportance, garageImportance,
 * poolImportance…) porque esa vía hace el modelo rígido. Pero los valores que
 * se consultan constantemente siguen siendo columnas indexables en
 * buyer_requirements: aquí vive la importancia y los criterios que no merecen
 * columna propia. El valor va tipado en tres columnas en lugar de un blob JSON
 * para poder filtrar sin parsear.
 */
export const buyerRequirementCriteria = sqliteTable(
  'buyer_requirement_criteria',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    buyerRequirementId: integer('buyer_requirement_id')
      .notNull()
      .references(() => buyerRequirements.id, { onDelete: 'cascade' }),
    criterionType: text('criterion_type').notNull(),
    operator: text('operator').notNull().default('eq'), // eq | lte | gte | in | between
    valueNumber: real('value_number'),
    valueText: text('value_text'),
    valueBool: integer('value_bool'),
    importance: text('importance').notNull().default('preferred'), // required | preferred | indifferent
    metadataJson: text('metadata_json'),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [
    index('brc_requirement').on(t.buyerRequirementId, t.criterionType),
    index('brc_org_type').on(t.organizationId, t.criterionType),
    uniqueIndex('brc_requirement_type').on(t.buyerRequirementId, t.criterionType),
  ],
)

/**
 * PropertyMatch — la compatibilidad entre una necesidad y un inmueble, cuando
 * merece la pena guardarla (FASE 11, migración 0067).
 *
 * El motor calcula bajo demanda; aquí sólo se persiste lo que representa una
 * decisión comercial real (seleccionado, enviado, descartado), junto con el
 * desglose con el que se tomó y la versión de las reglas que lo produjo.
 * Guardar cada comparación posible serían millones de filas sin valor.
 */
export const propertyMatches = sqliteTable(
  'property_matches',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    propertyId: integer('property_id')
      .notNull()
      .references(() => agentProperties.id, { onDelete: 'cascade' }),
    buyerRequirementId: integer('buyer_requirement_id')
      .notNull()
      .references(() => buyerRequirements.id, { onDelete: 'cascade' }),
    contactId: integer('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    /** Compatibilidad necesidad ↔ inmueble. NO es el lead score (intención comercial). */
    score: integer('score'),
    eligibility: text('eligibility').notNull().default('eligible'), // eligible | ineligible | needs_review
    confidence: real('confidence'),
    /** Estado comercial, independiente del score: un 95 % puede estar descartado. */
    status: text('status').notNull().default('new'), // new | selected | sent | discarded | viewing | offered
    discardedReason: text('discarded_reason'),
    breakdownJson: text('breakdown_json'),
    rulesVersion: integer('rules_version').notNull().default(1),
    createdBy: integer('created_by'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [
    uniqueIndex('property_matches_pair').on(t.buyerRequirementId, t.propertyId),
    index('property_matches_org_status').on(t.organizationId, t.status),
    index('property_matches_org_property').on(t.organizationId, t.propertyId),
    index('property_matches_org_contact').on(t.organizationId, t.contactId),
  ],
)

/**
 * Gemela de `propertyMatches`, para `developer_properties` (migración 0069).
 * `propertyMatches` nació con FK fija a `agent_properties`: sin esta tabla, el
 * motor de matching era ciego a toda la obra nueva. Misma forma exacta,
 * siguiendo la convención ya establecida ("una tabla por tipo de propiedad y
 * concepto hijo") en vez de una FK polimórfica — ver developerPropertyRooms/
 * agentPropertyRooms para el mismo patrón.
 */
export const developerPropertyMatches = sqliteTable(
  'developer_property_matches',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    propertyId: integer('property_id')
      .notNull()
      .references(() => developerProperties.id, { onDelete: 'cascade' }),
    buyerRequirementId: integer('buyer_requirement_id')
      .notNull()
      .references(() => buyerRequirements.id, { onDelete: 'cascade' }),
    contactId: integer('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    score: integer('score'),
    eligibility: text('eligibility').notNull().default('eligible'),
    confidence: real('confidence'),
    status: text('status').notNull().default('new'),
    discardedReason: text('discarded_reason'),
    breakdownJson: text('breakdown_json'),
    rulesVersion: integer('rules_version').notNull().default(1),
    createdBy: integer('created_by'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [
    uniqueIndex('developer_property_matches_pair').on(t.buyerRequirementId, t.propertyId),
    index('developer_property_matches_org_status').on(t.organizationId, t.status),
    index('developer_property_matches_org_property').on(t.organizationId, t.propertyId),
    index('developer_property_matches_org_contact').on(t.organizationId, t.contactId),
  ],
)

// ---------------------------------------------------------------------------
// Núcleo inmobiliario (migración 0086) — ver docs/auditoria-nucleo-megaprompt.md
// ---------------------------------------------------------------------------

/**
 * Oficinas de una agencia (FASE 0). Hasta 0086 la oficina era el texto libre
 * `team_members.office_name`; ese texto se conserva, pero lo que filtra,
 * enruta y segmenta es `office_id`. El nombre es único entre las oficinas
 * vivas de la organización (índice parcial WHERE deleted_at IS NULL).
 */
export const offices = sqliteTable(
  'offices',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    name: text('name').notNull(),
    code: text('code'),
    email: text('email'),
    phone: text('phone'),
    address: text('address'),
    city: text('city'),
    province: text('province'),
    postalCode: text('postal_code'),
    country: text('country'),
    timezone: text('timezone'),
    status: text('status').notNull().default('active'), // active | inactive
    /** Migración 0090 — foto de la oficina: clave de R2 o URL. */
    photo: text('photo'),
    createdBy: integer('created_by'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
    deletedAt: text('deleted_at'),
  },
  (t) => [index('offices_org').on(t.organizationId)],
)

/** Equipos comerciales (FASE 0), opcionalmente dentro de una oficina. */
export const teams = sqliteTable(
  'teams',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    officeId: integer('office_id'),
    name: text('name').notNull(),
    description: text('description'),
    /** team_members.id del responsable del equipo. */
    leadMemberId: integer('lead_member_id'),
    status: text('status').notNull().default('active'), // active | inactive
    createdBy: integer('created_by'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
    deletedAt: text('deleted_at'),
  },
  (t) => [index('teams_org').on(t.organizationId)],
)

/**
 * Ficha ampliada de una propiedad (FASES 1-4 y tour virtual), 1:1 con la
 * propiedad de cualquiera de los dos catálogos — `property_kind` 'agent'
 * (agent_properties, 2ª mano) o 'developer' (developer_properties). Tabla
 * aparte porque D1 no admite más de 100 columnas por tabla. Columnas tipadas
 * (no JSON) para poder filtrar, buscar y alimentar el matching y la IA.
 */
export const propertyDetails = sqliteTable(
  'property_details',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    propertyKind: text('property_kind').notNull(), // agent | developer
    propertyId: integer('property_id').notNull(),
    commercialCode: text('commercial_code'),
    subtype: text('subtype'),
    officeId: integer('office_id'),
    teamId: integer('team_id'),
    commercialStatus: text('commercial_status'), // available | reserved | sold | rented | withdrawn | draft
    region: text('region'),
    province: text('province'),
    municipality: text('municipality'),
    neighborhood: text('neighborhood'),
    streetType: text('street_type'),
    staircase: text('staircase'),
    officeArea: real('office_area'),
    commercialArea: real('commercial_area'),
    totalArea: real('total_area'),
    computableArea: real('computable_area'),
    roomsTotal: integer('rooms_total'),
    terracesCount: integer('terraces_count'),
    balconiesCount: integer('balconies_count'),
    storeroomsCount: integer('storerooms_count'),
    dressingRoomsCount: integer('dressing_rooms_count'),
    studiesCount: integer('studies_count'),
    floorsCount: integer('floors_count'),
    renovationYear: integer('renovation_year'),
    buildingFloors: integer('building_floors'),
    buildingUnits: integer('building_units'),
    hasConcierge: integer('has_concierge'),
    hasDoorman: integer('has_doorman'),
    facade: text('facade'),
    structure: text('structure'),
    exteriorInterior: text('exterior_interior'), // exterior | interior
    kitchenType: text('kitchen_type'),
    hasBuiltInWardrobes: integer('has_built_in_wardrobes'),
    flooring: text('flooring'),
    carpentry: text('carpentry'),
    glazing: text('glazing'),
    ceilingHeight: real('ceiling_height'),
    isRenovated: integer('is_renovated'),
    heating: text('heating'),
    hotWater: text('hot_water'),
    hasAirConditioning: integer('has_air_conditioning'),
    hasUnderfloorHeating: integer('has_underfloor_heating'),
    hasFireplace: integer('has_fireplace'),
    hasHomeAutomation: integer('has_home_automation'),
    hasAlarm: integer('has_alarm'),
    hasFiber: integer('has_fiber'),
    hasSolarPanels: integer('has_solar_panels'),
    hasAerothermal: integer('has_aerothermal'),
    hasCommunityPool: integer('has_community_pool'),
    hasCommunityGarden: integer('has_community_garden'),
    hasGym: integer('has_gym'),
    hasPaddle: integer('has_paddle'),
    hasTennis: integer('has_tennis'),
    hasPlayground: integer('has_playground'),
    hasCoworking: integer('has_coworking'),
    hasSocialRoom: integer('has_social_room'),
    hasSecurity: integer('has_security'),
    views: text('views'),
    isBeachfront: integer('is_beachfront'),
    hasPrivateGarden: integer('has_private_garden'),
    hasPrivatePool: integer('has_private_pool'),
    hasPorch: integer('has_porch'),
    hasPatio: integer('has_patio'),
    hasBalcony: integer('has_balcony'),
    virtualTourUrl: text('virtual_tour_url'),
    // Migración 0091 (#110): estado del inmueble y del edificio en la ficha pública.
    kitchenEquipment: text('kitchen_equipment'), // equipped | semi_equipped | unequipped
    bathroomsCondition: text('bathrooms_condition'), // new | renovated | good | to_update
    installationsCondition: text('installations_condition'), // new | renovated | good | to_update
    buildingCondition: text('building_condition'), // new | excellent | good | to_renovate
    unitsPerFloor: integer('units_per_floor'),
    // Migración 0092: datos públicos para los filtros del catálogo.
    listingSituation: text('listing_situation'), // bare_ownership | rented | occupied — lo que la agencia anuncia (≠ occupancyStatus, interno)
    rentalTerm: text('rental_term'), // long_term | seasonal
    createdBy: integer('created_by'),
    updatedBy: integer('updated_by'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [
    uniqueIndex('property_details_property').on(t.propertyKind, t.propertyId),
    index('property_details_org').on(t.organizationId),
    index('property_details_office').on(t.organizationId, t.officeId),
  ],
)

/** Datos económicos, comisiones y legales de una propiedad (FASES 5-6), 1:1 como propertyDetails. */
export const propertyLegalEconomics = sqliteTable(
  'property_legal_economics',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    propertyKind: text('property_kind').notNull(),
    propertyId: integer('property_id').notNull(),
    priceMinAuthorized: real('price_min_authorized'),
    priceRecommended: real('price_recommended'),
    rentDeposit: real('rent_deposit'),
    rentGuarantee: real('rent_guarantee'),
    rentExpensesIncluded: integer('rent_expenses_included'),
    communityFeeMonthly: real('community_fee_monthly'),
    ibiAnnual: real('ibi_annual'),
    garbageTaxAnnual: real('garbage_tax_annual'),
    commissionType: text('commission_type'), // percentage | fixed
    commissionValue: real('commission_value'),
    commissionVatPct: real('commission_vat_pct'),
    buyerFee: real('buyer_fee'),
    ownerFee: real('owner_fee'),
    cadastralReference: text('cadastral_reference'),
    registryStatus: text('registry_status'),
    registryPropertyNumber: text('registry_property_number'),
    landRegistry: text('land_registry'),
    encumbrances: text('encumbrances'),
    mortgageStatus: text('mortgage_status'),
    occupancyStatus: text('occupancy_status'),
    licenses: text('licenses'),
    habitabilityCertificate: text('habitability_certificate'),
    iteStatus: text('ite_status'),
    energyCertificateNumber: text('energy_certificate_number'),
    energyCertificateExpiry: text('energy_certificate_expiry'),
    energyConsumption: real('energy_consumption'),
    emissionsRating: text('emissions_rating'),
    emissionsValue: real('emissions_value'),
    createdBy: integer('created_by'),
    updatedBy: integer('updated_by'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [
    uniqueIndex('property_legal_economics_property').on(t.propertyKind, t.propertyId),
    index('property_legal_economics_org').on(t.organizationId),
  ],
)

/**
 * Documentos de una propiedad (FASE 6) con su permiso: internal (sólo el
 * equipo), owner (también los propietarios vinculados en property_contacts),
 * authorized_buyer (además, los contactos concedidos en
 * property_document_access) o public. El fichero vive en R2 (privado).
 */
export const propertyDocuments = sqliteTable(
  'property_documents',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    propertyKind: text('property_kind').notNull(),
    propertyId: integer('property_id').notNull(),
    docType: text('doc_type').notNull(),
    title: text('title').notNull(),
    r2Key: text('r2_key'),
    mediaAssetId: integer('media_asset_id'),
    fileName: text('file_name'),
    mimeType: text('mime_type'),
    sizeBytes: integer('size_bytes'),
    visibility: text('visibility').notNull().default('internal'), // internal | owner | authorized_buyer | public
    issuedAt: text('issued_at'),
    expiresAt: text('expires_at'),
    notes: text('notes'),
    createdBy: integer('created_by'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
    deletedAt: text('deleted_at'),
  },
  (t) => [index('property_documents_property').on(t.organizationId, t.propertyKind, t.propertyId)],
)

/** Contactos autorizados a ver un documento con visibilidad authorized_buyer. */
export const propertyDocumentAccess = sqliteTable(
  'property_document_access',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    documentId: integer('document_id').notNull(),
    contactId: integer('contact_id').notNull(),
    grantedBy: integer('granted_by'),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [uniqueIndex('property_document_access_unique').on(t.documentId, t.contactId)],
)

/** Vídeos, tours virtuales, renders, PDF, drone y 360 de una propiedad (FASE 7). Fotos y planos siguen en sus tablas. */
export const propertyMedia = sqliteTable(
  'property_media',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    propertyKind: text('property_kind').notNull(),
    propertyId: integer('property_id').notNull(),
    mediaType: text('media_type').notNull(), // video | virtual_tour | render | pdf | drone | pano360 | other
    url: text('url'),
    r2Key: text('r2_key'),
    title: text('title'),
    alt: text('alt'),
    caption: text('caption'),
    language: text('language'),
    isMain: integer('is_main').notNull().default(0),
    isPublishable: integer('is_publishable').notNull().default(1),
    isPrivate: integer('is_private').notNull().default(0),
    isHidden: integer('is_hidden').notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0),
    createdBy: integer('created_by'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
    deletedAt: text('deleted_at'),
  },
  (t) => [index('property_media_property').on(t.organizationId, t.propertyKind, t.propertyId)],
)

/** Roles de un contacto (FASE 8) — varios por persona: un comprador puede ser también propietario. */
export const contactRoles = sqliteTable(
  'contact_roles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    contactId: integer('contact_id').notNull(),
    role: text('role').notNull(), // buyer | seller | owner | landlord | tenant | investor | collaborator | supplier | other
    createdBy: integer('created_by'),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [uniqueIndex('contact_roles_unique').on(t.contactId, t.role), index('contact_roles_org').on(t.organizationId, t.role)],
)

/** Contactos de una propiedad (FASE 8): propietario, copropietario, apoderado, inquilino o contacto, con % de propiedad. */
export const propertyContacts = sqliteTable(
  'property_contacts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    propertyKind: text('property_kind').notNull(),
    propertyId: integer('property_id').notNull(),
    contactId: integer('contact_id').notNull(),
    role: text('role').notNull(), // owner | co_owner | attorney | tenant | contact
    ownershipPct: real('ownership_pct'),
    isPrimary: integer('is_primary').notNull().default(0),
    notes: text('notes'),
    createdBy: integer('created_by'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
    deletedAt: text('deleted_at'),
  },
  (t) => [
    index('property_contacts_property').on(t.organizationId, t.propertyKind, t.propertyId),
    index('property_contacts_contact').on(t.organizationId, t.contactId),
  ],
)

/** Nota como entidad (FASE 0): sobre un contacto, lead, propiedad, cita u operación. */
export const notes = sqliteTable(
  'notes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    entityType: text('entity_type').notNull(), // contact | lead | property | appointment | deal
    entityId: integer('entity_id').notNull(),
    propertyKind: text('property_kind'),
    contactId: integer('contact_id'),
    leadId: integer('lead_id'),
    propertyId: integer('property_id'),
    appointmentId: integer('appointment_id'),
    dealOperationId: integer('deal_operation_id'),
    body: text('body').notNull(),
    isPinned: integer('is_pinned').notNull().default(0),
    createdBy: integer('created_by'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
    deletedAt: text('deleted_at'),
    /** Migración 0088 — origen: NULL = panel | inmo (hecho confirmado en INMO) | automation. */
    source: text('source'),
  },
  (t) => [index('notes_entity').on(t.organizationId, t.entityType, t.entityId), index('notes_contact').on(t.organizationId, t.contactId)],
)

/** Campos personalizados por organización (FASE 0): la definición… */
export const customFieldDefinitions = sqliteTable(
  'custom_field_definitions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    entityType: text('entity_type').notNull(), // property | contact | lead | appointment | deal
    key: text('key').notNull(),
    label: text('label').notNull(),
    fieldType: text('field_type').notNull(), // text | textarea | number | boolean | date | select | multiselect
    optionsJson: text('options_json'),
    isRequired: integer('is_required').notNull().default(0),
    section: text('section'),
    sortOrder: integer('sort_order').notNull().default(0),
    helpText: text('help_text'),
    isPublic: integer('is_public').notNull().default(0),
    status: text('status').notNull().default('active'), // active | archived
    createdBy: integer('created_by'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
    deletedAt: text('deleted_at'),
  },
  (t) => [uniqueIndex('custom_field_definitions_key').on(t.organizationId, t.entityType, t.key)],
)

/** …y su valor para una entidad concreta (entity_kind distingue los dos catálogos de propiedades). */
export const customFieldValues = sqliteTable(
  'custom_field_values',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull(),
    definitionId: integer('definition_id').notNull(),
    entityType: text('entity_type').notNull(),
    entityKind: text('entity_kind'),
    entityId: integer('entity_id').notNull(),
    valueText: text('value_text'),
    valueNumber: real('value_number'),
    valueJson: text('value_json'),
    updatedBy: integer('updated_by'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [
    uniqueIndex('custom_field_values_unique').on(t.definitionId, t.entityKind, t.entityId),
    index('custom_field_values_entity').on(t.organizationId, t.entityType, t.entityId),
  ],
)
