-- Migration number: 0048    Granular location + map coords on agent_properties (Propiedades 2ª mano)
--
-- Brings "Propiedades 2ª mano" location up to parity with the granular
-- address + map (lat/lng) already on developer_properties (migration 0046).
-- All nullable, additive only — the existing free-text `location` column is
-- kept as-is (not dropped) so current rows and any code still reading it
-- keep working; the Property Builder's Ubicación section now renders both
-- the new granular fields and a map picker for this resource too.
--
-- agent_id already existed on this table (migration 0047) but had no UI to
-- assign it from — that's a Property Builder change, not a schema change.

ALTER TABLE agent_properties ADD COLUMN country TEXT;
ALTER TABLE agent_properties ADD COLUMN city TEXT;
ALTER TABLE agent_properties ADD COLUMN street TEXT;
ALTER TABLE agent_properties ADD COLUMN street_number TEXT;
ALTER TABLE agent_properties ADD COLUMN community TEXT;
ALTER TABLE agent_properties ADD COLUMN block TEXT;
ALTER TABLE agent_properties ADD COLUMN portal TEXT;
ALTER TABLE agent_properties ADD COLUMN floor TEXT;
ALTER TABLE agent_properties ADD COLUMN door_letter TEXT;
ALTER TABLE agent_properties ADD COLUMN postal_code TEXT;
ALTER TABLE agent_properties ADD COLUMN district TEXT;
ALTER TABLE agent_properties ADD COLUMN lat REAL;
ALTER TABLE agent_properties ADD COLUMN lng REAL;
