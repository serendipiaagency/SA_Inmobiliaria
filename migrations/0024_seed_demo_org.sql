-- Migration number: 0024    Seed a fully-populated demo tenant ("Skyline Estates")
-- Demonstrates the platform is genuinely multi-tenant: a second real estate
-- agency with its own admin user, developer, community, properties, leads,
-- clients, visits and reservations — all isolated from org 1 (M&M) by
-- organization_id. IDs are resolved via unique slugs/emails rather than
-- hardcoded, so this migration is safe to run regardless of current
-- autoincrement state.

INSERT INTO organizations (name, slug, company_name, brand_color, status, created_at, updated_at)
VALUES ('Skyline Estates', 'skyline-estates', 'Skyline Estates', '#0f766e', 'active', datetime('now'), datetime('now'));

-- Admin user for the new tenant — same known-good pbkdf2 hash as the
-- platform seed admin (migrations/0002_seed_admin.sql), password: ChangeMe123!
INSERT INTO users (organization_id, name, email, password, role, created_at, updated_at)
VALUES (
  (SELECT id FROM organizations WHERE slug = 'skyline-estates'),
  'Skyline Estates Admin',
  'admin@skyline-estates.com',
  'pbkdf2$100000$wfgvsa+eIivOLFePGXyzPA==$bGbT5zz2Uh1G/llKCuAFDLTc1JWXB3zTp9MECuxtY+c=',
  'admin',
  datetime('now'), datetime('now')
);

INSERT INTO developers (organization_id, name, email, phone, description, status, created_at, updated_at)
VALUES (
  (SELECT id FROM organizations WHERE slug = 'skyline-estates'),
  'Skyline Developments',
  'contact@skylinedevelopments.ae',
  '+971 4 555 0199',
  'Boutique developer behind Skyline Estates'' waterfront and city-view portfolios.',
  'active',
  datetime('now'), datetime('now')
);

INSERT INTO communities (organization_id, name, description, feature_description, location, created_at, updated_at)
VALUES (
  (SELECT id FROM organizations WHERE slug = 'skyline-estates'),
  'Skyline Waterfront',
  'A master-planned waterfront community with marina views, retail promenades and family amenities.',
  'Private marina berths, waterfront running track, resident-only beach club.',
  'Skyline Waterfront, Dubai',
  datetime('now'), datetime('now')
);

INSERT INTO developer_properties (
  organization_id, slug, developer_id, name, status, price, description, key_highlights,
  cover_image, community, property_type_main, bedrooms, bathrooms, area, created_at, updated_at
) VALUES
(
  (SELECT id FROM organizations WHERE slug = 'skyline-estates'),
  'skyline-tower-one',
  (SELECT id FROM developers WHERE email = 'contact@skylinedevelopments.ae'),
  'Skyline Tower One',
  'under_construction',
  1450000,
  'A landmark waterfront tower with panoramic marina views and resort-style amenities.',
  'Infinity pool, private marina access, concierge lobby',
  'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1600',
  'Skyline Waterfront',
  'Apartment', 2, 2, 118,
  datetime('now'), datetime('now')
),
(
  (SELECT id FROM organizations WHERE slug = 'skyline-estates'),
  'bay-view-residences',
  (SELECT id FROM developers WHERE email = 'contact@skylinedevelopments.ae'),
  'Bay View Residences',
  'ready',
  2650000,
  'Move-in-ready villas facing the bay, finished with premium materials throughout.',
  'Private garden, smart home system, covered parking for 2 cars',
  'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1600',
  'Skyline Waterfront',
  'Villa', 4, 4, 320,
  datetime('now'), datetime('now')
),
(
  (SELECT id FROM organizations WHERE slug = 'skyline-estates'),
  'harbor-point-apartments',
  (SELECT id FROM developers WHERE email = 'contact@skylinedevelopments.ae'),
  'Harbor Point Apartments',
  'new',
  980000,
  'Compact, efficient apartments launching off-plan with flexible payment plans.',
  'Flexible 60/40 payment plan, gym and co-working lounge, pet friendly',
  'https://images.unsplash.com/photo-1567496898669-ee935f5f647a?w=1600',
  'Skyline Waterfront',
  'Apartment', 1, 1, 72,
  datetime('now'), datetime('now')
);

INSERT INTO leads (organization_id, name, email, phone, source, status, score, budget, property_name, agent_name, last_contact_at, created_at, updated_at) VALUES
((SELECT id FROM organizations WHERE slug = 'skyline-estates'), 'Noah Bergström', 'noah.bergstrom@example.com', '+971 50 111 2233', 'web', 'qualified', 68, 1400000, 'Skyline Tower One', 'Skyline Estates Admin', '2026-07-18 11:00:00', '2026-07-10 09:00:00', '2026-07-18 11:00:00'),
((SELECT id FROM organizations WHERE slug = 'skyline-estates'), 'Amara Osei', 'amara.osei@example.com', '+971 50 222 3344', 'referral', 'contacted', 45, 2600000, 'Bay View Residences', 'Skyline Estates Admin', '2026-07-15 15:30:00', '2026-07-12 10:00:00', '2026-07-15 15:30:00'),
((SELECT id FROM organizations WHERE slug = 'skyline-estates'), 'Diego Fernández', 'diego.fernandez@example.com', '+971 50 333 4455', 'portal', 'new', 20, 950000, 'Harbor Point Apartments', 'Skyline Estates Admin', NULL, '2026-07-20 12:00:00', '2026-07-20 12:00:00');

INSERT INTO clients (organization_id, name, email, phone, type, stage, lifetime_value, deals_count, agent_name, location, created_at, updated_at) VALUES
((SELECT id FROM organizations WHERE slug = 'skyline-estates'), 'Isabela Rocha', 'isabela.rocha@example.com', '+971 50 444 5566', 'buyer', 'active', 0, 0, 'Skyline Estates Admin', 'Skyline Waterfront', '2026-06-01 09:00:00', '2026-06-01 09:00:00'),
((SELECT id FROM organizations WHERE slug = 'skyline-estates'), 'Marcus Lindqvist', 'marcus.lindqvist@example.com', '+971 50 555 6677', 'investor', 'closed', 2650000, 1, 'Skyline Estates Admin', 'Skyline Waterfront', '2026-05-02 09:00:00', '2026-07-05 09:00:00'),
((SELECT id FROM organizations WHERE slug = 'skyline-estates'), 'Priya Nair', 'priya.nair@example.com', '+971 50 666 7788', 'tenant', 'active', 42000, 1, 'Skyline Estates Admin', 'Skyline Waterfront', '2026-06-20 09:00:00', '2026-06-20 09:00:00');

INSERT INTO visits (organization_id, client_name, property_id, property_name, agent_name, scheduled_at, status, channel, created_at) VALUES
((SELECT id FROM organizations WHERE slug = 'skyline-estates'), 'Isabela Rocha', (SELECT id FROM developer_properties WHERE slug = 'skyline-tower-one'), 'Skyline Tower One', 'Skyline Estates Admin', '2026-07-28 14:00:00', 'scheduled', 'in_person', '2026-07-20 09:00:00'),
((SELECT id FROM organizations WHERE slug = 'skyline-estates'), 'Marcus Lindqvist', (SELECT id FROM developer_properties WHERE slug = 'bay-view-residences'), 'Bay View Residences', 'Skyline Estates Admin', '2026-07-06 11:00:00', 'completed', 'in_person', '2026-07-01 09:00:00'),
((SELECT id FROM organizations WHERE slug = 'skyline-estates'), 'Diego Fernández', (SELECT id FROM developer_properties WHERE slug = 'harbor-point-apartments'), 'Harbor Point Apartments', 'Skyline Estates Admin', '2026-07-25 16:00:00', 'scheduled', 'video', '2026-07-20 12:30:00');

INSERT INTO reservations (organization_id, reference, client_name, property_id, property_name, amount, deposit, status, reserved_at, created_at) VALUES
((SELECT id FROM organizations WHERE slug = 'skyline-estates'), 'SKY-2026-0001', 'Marcus Lindqvist', (SELECT id FROM developer_properties WHERE slug = 'bay-view-residences'), 'Bay View Residences', 2650000, 265000, 'confirmed', '2026-07-05 09:00:00', '2026-07-05 09:00:00'),
((SELECT id FROM organizations WHERE slug = 'skyline-estates'), 'SKY-2026-0002', 'Isabela Rocha', (SELECT id FROM developer_properties WHERE slug = 'skyline-tower-one'), 'Skyline Tower One', 1450000, 145000, 'pending', '2026-07-19 09:00:00', '2026-07-19 09:00:00'),
((SELECT id FROM organizations WHERE slug = 'skyline-estates'), 'SKY-2026-0003', 'Priya Nair', (SELECT id FROM developer_properties WHERE slug = 'harbor-point-apartments'), 'Harbor Point Apartments', 980000, 98000, 'cancelled', '2026-06-28 09:00:00', '2026-06-28 09:00:00');
