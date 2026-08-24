-- Migration number: 0042    Per-tenant slug uniqueness (multi-domain hardening)
--
-- agent_properties.slug, developer_properties.slug, blogs.slug and
-- team_members.slug were declared UNIQUE on their own since migration 0001 —
-- a global constraint across every tenant sharing this D1 database. Two
-- unrelated agencies both wanting a property/post/team-member slug like
-- "downtown-loft" is a real collision now that each tenant can be reached on
-- its own domain: the second agency to pick that slug gets a hard 500 caused
-- entirely by a stranger's data. SQLite/D1 can't relax a column-level UNIQUE
-- via ALTER TABLE, so each table is rebuilt with a composite
-- unique(organization_id, slug) instead — same technique as migration 0023
-- (metrics_daily). All other columns, indexes, and row ids are preserved
-- exactly; ids matter here because floor_plans/images/property_types/etc.
-- reference developer_properties.id and agent_properties.id by foreign key.

-- --- agent_properties --------------------------------------------------
CREATE TABLE agent_properties_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT,
  location TEXT,
  property_type TEXT,
  transaction_type TEXT,
  price REAL,
  area REAL,
  bedrooms INTEGER,
  bathrooms INTEGER,
  main_image TEXT,
  status TEXT NOT NULL DEFAULT 'available',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  organization_id INTEGER NOT NULL DEFAULT 1
);

INSERT INTO agent_properties_new SELECT
  id, slug, location, property_type, transaction_type, price, area, bedrooms, bathrooms,
  main_image, status, created_at, updated_at, organization_id
FROM agent_properties;

DROP TABLE agent_properties;
ALTER TABLE agent_properties_new RENAME TO agent_properties;

CREATE UNIQUE INDEX IF NOT EXISTS agent_properties_org_slug ON agent_properties (organization_id, slug);
CREATE INDEX IF NOT EXISTS agent_properties_org ON agent_properties (organization_id);

-- --- developer_properties ------------------------------------------------
CREATE TABLE developer_properties_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT,
  developer_id INTEGER NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  price REAL,
  description TEXT,
  key_highlights TEXT,
  payment_plan TEXT,
  handover_date TEXT,
  handover_percentage TEXT,
  down_percentage TEXT,
  construction_percentage TEXT,
  logo TEXT,
  cover_image TEXT,
  community TEXT,
  master_plan_image TEXT,
  location_map TEXT,
  master_plan_description TEXT,
  floor_plan_description TEXT,
  location_map_description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  property_type_main TEXT,
  bedrooms INTEGER,
  bathrooms INTEGER,
  area REAL,
  year_built INTEGER,
  energy_rating TEXT,
  orientation TEXT,
  has_elevator INTEGER NOT NULL DEFAULT 0,
  has_pool INTEGER NOT NULL DEFAULT 0,
  has_garage INTEGER NOT NULL DEFAULT 0,
  has_terrace INTEGER NOT NULL DEFAULT 0,
  has_garden INTEGER NOT NULL DEFAULT 0,
  pets_allowed INTEGER NOT NULL DEFAULT 0,
  accessible INTEGER NOT NULL DEFAULT 0,
  price_old REAL,
  is_exclusive INTEGER NOT NULL DEFAULT 0,
  is_reserved INTEGER NOT NULL DEFAULT 0,
  has_tour INTEGER NOT NULL DEFAULT 0,
  rental_yield REAL,
  published_at TEXT,
  ai_summary TEXT,
  lat REAL,
  lng REAL,
  street TEXT,
  postal_code TEXT,
  video_url TEXT,
  drone_photo TEXT,
  night_photo TEXT,
  before_photo TEXT,
  after_photo TEXT,
  ai_staged_photo TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  favorite_count INTEGER NOT NULL DEFAULT 0,
  service_charge_annual REAL,
  organization_id INTEGER NOT NULL DEFAULT 1
);

INSERT INTO developer_properties_new SELECT
  id, slug, developer_id, name, status, price, description, key_highlights, payment_plan,
  handover_date, handover_percentage, down_percentage, construction_percentage, logo,
  cover_image, community, master_plan_image, location_map, master_plan_description,
  floor_plan_description, location_map_description, created_at, updated_at,
  property_type_main, bedrooms, bathrooms, area, year_built, energy_rating, orientation,
  has_elevator, has_pool, has_garage, has_terrace, has_garden, pets_allowed, accessible,
  price_old, is_exclusive, is_reserved, has_tour, rental_yield, published_at, ai_summary,
  lat, lng, street, postal_code, video_url, drone_photo, night_photo, before_photo,
  after_photo, ai_staged_photo, view_count, favorite_count, service_charge_annual, organization_id
FROM developer_properties;

DROP TABLE developer_properties;
ALTER TABLE developer_properties_new RENAME TO developer_properties;

CREATE UNIQUE INDEX IF NOT EXISTS developer_properties_org_slug ON developer_properties (organization_id, slug);
CREATE INDEX IF NOT EXISTS developer_properties_developer ON developer_properties (developer_id);
CREATE INDEX IF NOT EXISTS developer_properties_status ON developer_properties (status);
CREATE INDEX IF NOT EXISTS developer_properties_price ON developer_properties (price);
CREATE INDEX IF NOT EXISTS developer_properties_bedrooms ON developer_properties (bedrooms);
CREATE INDEX IF NOT EXISTS developer_properties_type ON developer_properties (property_type_main);
CREATE INDEX IF NOT EXISTS developer_properties_org ON developer_properties (organization_id);

-- --- blogs -----------------------------------------------------------
CREATE TABLE blogs_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  image TEXT,
  target_audience TEXT NOT NULL DEFAULT 'UAE',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  organization_id INTEGER NOT NULL DEFAULT 1
);

INSERT INTO blogs_new SELECT
  id, slug, image, target_audience, created_at, updated_at, organization_id
FROM blogs;

DROP TABLE blogs;
ALTER TABLE blogs_new RENAME TO blogs;

CREATE UNIQUE INDEX IF NOT EXISTS blogs_org_slug ON blogs (organization_id, slug);
CREATE INDEX IF NOT EXISTS blogs_org ON blogs (organization_id);

-- --- team_members ------------------------------------------------------
CREATE TABLE team_members_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  position TEXT NOT NULL,
  description TEXT,
  experience TEXT,
  languages TEXT,
  nid TEXT,
  specialties TEXT,
  image TEXT,
  facebook TEXT,
  twitter TEXT,
  linkedin TEXT,
  instagram TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  phone TEXT,
  organization_id INTEGER NOT NULL DEFAULT 1,
  slot_duration_minutes INTEGER NOT NULL DEFAULT 60,
  buffer_minutes INTEGER NOT NULL DEFAULT 0,
  max_appointments_per_day INTEGER,
  ical_token TEXT
);

INSERT INTO team_members_new SELECT
  id, name, slug, email, position, description, experience, languages, nid, specialties,
  image, facebook, twitter, linkedin, instagram, created_at, updated_at, phone,
  organization_id, slot_duration_minutes, buffer_minutes, max_appointments_per_day, ical_token
FROM team_members;

DROP TABLE team_members;
ALTER TABLE team_members_new RENAME TO team_members;

CREATE UNIQUE INDEX IF NOT EXISTS team_members_org_slug ON team_members (organization_id, slug);
CREATE INDEX IF NOT EXISTS team_members_org ON team_members (organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS team_members_ical_token ON team_members (ical_token) WHERE ical_token IS NOT NULL;

-- --- organizations.domain: normalize any pre-existing value ------------
-- No organization has a domain set yet in practice, but this keeps the
-- column consistent with the normalization now enforced on write
-- (server/utils/adminResources.ts, organizations.prepare): lowercase, no
-- scheme/path/port, no leading "www.".
UPDATE organizations
SET domain = lower(domain)
WHERE domain IS NOT NULL AND domain != lower(domain);
