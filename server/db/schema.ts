import { sqliteTable, text, integer, real, uniqueIndex, index } from 'drizzle-orm/sqlite-core'

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  password: text('password').notNull(), // pbkdf2$<iterations>$<salt>$<hash>
  role: text('role').notNull().default('user'), // 'admin' | 'user'
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
  createdAt: text('created_at').notNull().default(''),
  updatedAt: text('updated_at').notNull().default(''),
})

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
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  email: text('email').notNull().unique(),
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
