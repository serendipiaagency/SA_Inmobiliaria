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
})

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
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [uniqueIndex('agent_properties_org_slug').on(t.organizationId, t.slug), index('agent_properties_org').on(t.organizationId)],
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
  createdAt: text('created_at').notNull().default(''),
})

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
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [uniqueIndex('developer_properties_org_slug').on(t.organizationId, t.slug), index('developer_properties_org').on(t.organizationId)],
)

export const priceHistory = sqliteTable('price_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  developerPropertyId: integer('developer_property_id')
    .notNull()
    .references(() => developerProperties.id, { onDelete: 'cascade' }),
  price: real('price').notNull(),
  recordedAt: text('recorded_at').notNull(),
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
    source: text('source').notNull().default('web'), // web | portal | referral | ads | social | call
    status: text('status').notNull().default('new'), // new | contacted | qualified | proposal | won | lost
    score: integer('score').notNull().default(0), // 0..100
    budget: real('budget'),
    propertyId: integer('property_id'),
    propertyName: text('property_name'),
    agentId: integer('agent_id'),
    agentName: text('agent_name'),
    notes: text('notes'),
    lastContactAt: text('last_contact_at'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [index('leads_status').on(t.status), index('leads_source').on(t.source)],
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
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull().default(''),
  },
  (t) => [index('clients_type').on(t.type), index('clients_stage').on(t.stage)],
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
    channel: text('channel').notNull().default('in_person'), // in_person | video | phone
    notes: text('notes'),
    clientEmail: text('client_email'),
    clientPhone: text('client_phone'),
    clientBudget: real('client_budget'),
    clientInterest: text('client_interest'),
    managementToken: text('management_token'),
    reminder24hSentAt: text('reminder_24h_sent_at'),
    reminder1hSentAt: text('reminder_1h_sent_at'),
    videoLink: text('video_link'),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('visits_status').on(t.status), index('visits_agent_scheduled').on(t.agentId, t.scheduledAt)],
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

export const automations = sqliteTable('automations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  organizationId: integer('organization_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  trigger: text('trigger').notNull(), // lead.created | visit.completed | reservation.confirmed | ...
  action: text('action').notNull(), // send_email | assign_agent | create_task | notify_slack | ...
  enabled: integer('enabled').notNull().default(1),
  runsCount: integer('runs_count').notNull().default(0),
  lastRunAt: text('last_run_at'),
  createdAt: text('created_at').notNull().default(''),
})

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
