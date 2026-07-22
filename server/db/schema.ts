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
  createdAt: text('created_at').notNull().default(''),
  updatedAt: text('updated_at').notNull().default(''),
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(), // random token
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull().default(''),
})

// ---------------------------------------------------------------------------
// Agents & secondary-sale properties
// ---------------------------------------------------------------------------

export const agents = sqliteTable('agents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  organizationId: integer('organization_id').notNull().default(1),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  phone: text('phone'),
  profileImage: text('profile_image'),
  licenseNumber: text('license_number'),
  bio: text('bio'),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull().default(''),
  updatedAt: text('updated_at').notNull().default(''),
})

export const agentProperties = sqliteTable('agent_properties', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  organizationId: integer('organization_id').notNull().default(1),
  slug: text('slug').unique(),
  location: text('location'),
  propertyType: text('property_type'),
  transactionType: text('transaction_type'), // sale | rent
  price: real('price'),
  area: real('area'),
  bedrooms: integer('bedrooms'),
  bathrooms: integer('bathrooms'),
  mainImage: text('main_image'),
  status: text('status').notNull().default('available'), // available | sold
  createdAt: text('created_at').notNull().default(''),
  updatedAt: text('updated_at').notNull().default(''),
})

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
  createdAt: text('created_at').notNull().default(''),
})

// ---------------------------------------------------------------------------
// Developers & off-plan projects
// ---------------------------------------------------------------------------

export const developers = sqliteTable('developers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  organizationId: integer('organization_id').notNull().default(1),
  name: text('name').notNull(),
  email: text('email').unique(),
  phone: text('phone'),
  logo: text('logo'),
  description: text('description'),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull().default(''),
  updatedAt: text('updated_at').notNull().default(''),
})

export const developerProperties = sqliteTable('developer_properties', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  organizationId: integer('organization_id').notNull().default(1),
  slug: text('slug').unique(),
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
  createdAt: text('created_at').notNull().default(''),
  updatedAt: text('updated_at').notNull().default(''),
})

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
  },
  (t) => [index('property_views_property_created').on(t.developerPropertyId, t.createdAt)],
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

export const images = sqliteTable('images', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  developerPropertyId: integer('developer_property_id')
    .notNull()
    .references(() => developerProperties.id, { onDelete: 'cascade' }),
  image: text('image').notNull(),
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
  organizationId: integer('organization_id').notNull().default(1),
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
  organizationId: integer('organization_id').notNull().default(1),
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
  organizationId: integer('organization_id').notNull().default(1),
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
  organizationId: integer('organization_id').notNull().default(1),
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

export const blogs = sqliteTable('blogs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  organizationId: integer('organization_id').notNull().default(1),
  slug: text('slug').notNull().unique(),
  image: text('image'),
  targetAudience: text('target_audience').notNull().default('UAE'), // UAE | International
  createdAt: text('created_at').notNull().default(''),
  updatedAt: text('updated_at').notNull().default(''),
})

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

export const teamMembers = sqliteTable('team_members', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  organizationId: integer('organization_id').notNull().default(1),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  email: text('email').notNull().unique(),
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
  createdAt: text('created_at').notNull().default(''),
  updatedAt: text('updated_at').notNull().default(''),
})

// ---------------------------------------------------------------------------
// Forms: vendor registration, visitor submissions, contact/complaints
// ---------------------------------------------------------------------------

export const information = sqliteTable('information', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  organizationId: integer('organization_id').notNull().default(1),
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
  organizationId: integer('organization_id').notNull().default(1),
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
    organizationId: integer('organization_id').notNull().default(1),
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
    organizationId: integer('organization_id').notNull().default(1),
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
    organizationId: integer('organization_id').notNull().default(1),
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
    organizationId: integer('organization_id').notNull().default(1),
    clientName: text('client_name').notNull(),
    propertyId: integer('property_id'),
    propertyName: text('property_name'),
    agentName: text('agent_name'),
    scheduledAt: text('scheduled_at').notNull(),
    status: text('status').notNull().default('scheduled'), // scheduled | completed | cancelled | no_show
    channel: text('channel').notNull().default('in_person'), // in_person | video | phone
    notes: text('notes'),
    createdAt: text('created_at').notNull().default(''),
  },
  (t) => [index('visits_status').on(t.status)],
)

export const reservations = sqliteTable(
  'reservations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organizationId: integer('organization_id').notNull().default(1),
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
    number: text('number').notNull().unique(),
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
  (t) => [index('invoices_status').on(t.status)],
)

export const automations = sqliteTable('automations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  organizationId: integer('organization_id').notNull().default(1),
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
  organizationId: integer('organization_id').notNull().default(1),
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
    day: text('day').notNull().unique(), // YYYY-MM-DD
    visitors: integer('visitors').notNull().default(0),
    pageviews: integer('pageviews').notNull().default(0),
    leads: integer('leads').notNull().default(0),
    visitsBooked: integer('visits_booked').notNull().default(0),
    reservations: integer('reservations').notNull().default(0),
    revenue: real('revenue').notNull().default(0),
  },
  (t) => [index('metrics_daily_day').on(t.day)],
)

// Not org-scoped yet: a flat global key-value store used only by the admin's
// own settings page today. Per-org branding (domain, logo, colors) is a
// documented follow-up (see organizations table for where those fields land).
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: text('updated_at').notNull().default(''),
})
