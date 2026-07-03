-- Migration number: 0001    Initial schema (ported from Laravel migrations)

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX sessions_user_id ON sessions(user_id);

CREATE TABLE agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  profile_image TEXT,
  license_number TEXT,
  bio TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE agent_properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE,
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
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE property_translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES agent_properties(id) ON DELETE CASCADE,
  locale TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  UNIQUE (property_id, locale)
);
CREATE INDEX property_translations_locale ON property_translations(locale);

CREATE TABLE property_gallery_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES agent_properties(id) ON DELETE CASCADE,
  image TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE developers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  logo TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE developer_properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE,
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
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX developer_properties_developer ON developer_properties(developer_id);
CREATE INDEX developer_properties_status ON developer_properties(status);

CREATE TABLE images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  developer_property_id INTEGER NOT NULL REFERENCES developer_properties(id) ON DELETE CASCADE,
  image TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE floor_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  developer_property_id INTEGER NOT NULL REFERENCES developer_properties(id) ON DELETE CASCADE,
  category TEXT,
  unit_type TEXT,
  floor_details TEXT,
  sizes TEXT,
  type TEXT,
  image TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE master_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  image TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE developer_property_master_plan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  developer_property_id INTEGER NOT NULL REFERENCES developer_properties(id) ON DELETE CASCADE,
  master_plan_id INTEGER NOT NULL REFERENCES master_plans(id) ON DELETE CASCADE
);

CREATE TABLE property_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  developer_property_id INTEGER NOT NULL REFERENCES developer_properties(id) ON DELETE CASCADE,
  property_type TEXT NOT NULL,
  unit_type TEXT NOT NULL,
  size TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  image TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE developer_property_location (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  developer_property_id INTEGER NOT NULL REFERENCES developer_properties(id) ON DELETE CASCADE,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  distance INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE amenities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  logo TEXT,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE amenity_developer_property (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  amenity_id INTEGER NOT NULL REFERENCES amenities(id) ON DELETE CASCADE,
  developer_property_id INTEGER NOT NULL REFERENCES developer_properties(id) ON DELETE CASCADE
);

CREATE TABLE communities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  feature_description TEXT,
  image TEXT,
  location TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE amenity_community (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  amenity_id INTEGER NOT NULL REFERENCES amenities(id) ON DELETE CASCADE
);

CREATE TABLE blogs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  image TEXT,
  target_audience TEXT NOT NULL DEFAULT 'UAE',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE blog_translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  blog_id INTEGER NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
  locale TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  UNIQUE (blog_id, locale)
);

CREATE TABLE team_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
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
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE information (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  email TEXT,
  phone_number TEXT,
  trade_license TEXT,
  emirates_id TEXT,
  passport TEXT,
  bank_account_no TEXT,
  iban_letter TEXT,
  vat_registration_no TEXT,
  contact_person_name TEXT,
  office_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE visitor_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  nationality TEXT NOT NULL,
  property_type TEXT,
  specifications TEXT,
  preferred_location TEXT,
  budget_range TEXT,
  payment_for_rent TEXT NOT NULL DEFAULT 'Personal',
  number_of_family_members INTEGER,
  passport_pdf TEXT,
  emirates_id_pdf TEXT,
  bank_statement_pdf TEXT,
  trade_license_pdf TEXT,
  vat_registration_certificate_pdf TEXT,
  etihad_credit_bureau_pdf TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE contact_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL DEFAULT 'contact',
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  subject TEXT,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX contact_messages_type ON contact_messages(type);
