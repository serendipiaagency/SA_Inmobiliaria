-- Migration number: 0046    Granular location fields on developer_properties + gallery ordering
--
-- 1. developer_properties already has street/postal_code/lat/lng/community
--    (the last one doubling as "urbanización" — a named residential
--    development, the same concept, so it's reused rather than duplicated).
--    Adds the remaining fields the Property Builder's Ubicación section
--    needs: country, city, street number, block, portal, floor, door
--    letter, district. All nullable — existing rows keep working with them
--    empty.
--
-- 2. images (developer_properties gallery) and property_gallery_images
--    (agent_properties gallery) get a sort_order column so drag-and-drop
--    reordering has somewhere to persist to. Backfilled from each row's
--    existing insertion order (id ASC) per parent, so current galleries
--    keep their current order after this migration.

ALTER TABLE developer_properties ADD COLUMN country TEXT;
ALTER TABLE developer_properties ADD COLUMN city TEXT;
ALTER TABLE developer_properties ADD COLUMN street_number TEXT;
ALTER TABLE developer_properties ADD COLUMN block TEXT;
ALTER TABLE developer_properties ADD COLUMN portal TEXT;
ALTER TABLE developer_properties ADD COLUMN floor TEXT;
ALTER TABLE developer_properties ADD COLUMN door_letter TEXT;
ALTER TABLE developer_properties ADD COLUMN district TEXT;

ALTER TABLE images ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE property_gallery_images ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

UPDATE images SET sort_order = (
  SELECT COUNT(*) FROM images AS earlier
  WHERE earlier.developer_property_id = images.developer_property_id AND earlier.id < images.id
);

UPDATE property_gallery_images SET sort_order = (
  SELECT COUNT(*) FROM property_gallery_images AS earlier
  WHERE earlier.property_id = property_gallery_images.property_id AND earlier.id < property_gallery_images.id
);
