-- Migration number: 0059    Second-hand property builder parity with off-plan
--
-- The 2nd-hand property builder (agent_properties) was missing most of the
-- fields the off-plan builder (developer_properties) already has, even
-- though they're equally applicable to a resale listing: amenities
-- (pool/garage/terrace/garden/elevator/pets/accessible), orientation, energy
-- rating, year built, a reduced-price marker, key highlights, extra gallery
-- photo slots (drone/night/before-after/AI staged), exclusivity/reservation/
-- virtual-tour flags, rental yield, annual service charge, and an optional
-- payment plan. Off-plan-only concepts genuinely tied to a multi-unit
-- development under construction (handover date/percentages, master plan,
-- promoter logo, unit typologies) are deliberately NOT added here — a single
-- resale unit isn't "under construction" and isn't "a menu of typologies".
--
-- Also adds agent_property_floor_plans — a resale unit can have its own
-- floor plan too, just like an off-plan one — mirroring the existing
-- floor_plans table exactly, following this codebase's established pattern
-- of one table per property type per child concept (see project-images vs
-- gallery-images, social-media vs agent-property-social-media) rather than
-- a shared table with a dual-nullable parent FK.
--
-- Purely additive (ADD COLUMN / CREATE TABLE, all nullable or zero-defaulted)
-- — no existing row changes behavior, no rebuild.

ALTER TABLE agent_properties ADD COLUMN year_built INTEGER;
ALTER TABLE agent_properties ADD COLUMN price_old REAL;
ALTER TABLE agent_properties ADD COLUMN key_highlights TEXT;
ALTER TABLE agent_properties ADD COLUMN orientation TEXT;
ALTER TABLE agent_properties ADD COLUMN energy_rating TEXT;
ALTER TABLE agent_properties ADD COLUMN has_elevator INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_properties ADD COLUMN has_pool INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_properties ADD COLUMN has_garage INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_properties ADD COLUMN has_terrace INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_properties ADD COLUMN has_garden INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_properties ADD COLUMN pets_allowed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_properties ADD COLUMN accessible INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_properties ADD COLUMN is_exclusive INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_properties ADD COLUMN is_reserved INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_properties ADD COLUMN has_tour INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_properties ADD COLUMN rental_yield REAL;
ALTER TABLE agent_properties ADD COLUMN service_charge_annual REAL;
ALTER TABLE agent_properties ADD COLUMN drone_photo TEXT;
ALTER TABLE agent_properties ADD COLUMN night_photo TEXT;
ALTER TABLE agent_properties ADD COLUMN before_photo TEXT;
ALTER TABLE agent_properties ADD COLUMN after_photo TEXT;
ALTER TABLE agent_properties ADD COLUMN ai_staged_photo TEXT;
ALTER TABLE agent_properties ADD COLUMN payment_plan TEXT;

CREATE TABLE agent_property_floor_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES agent_properties(id) ON DELETE CASCADE,
  category TEXT,
  unit_type TEXT,
  floor_details TEXT,
  sizes TEXT,
  type TEXT,
  image TEXT,
  created_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX agent_property_floor_plans_property ON agent_property_floor_plans (property_id);
