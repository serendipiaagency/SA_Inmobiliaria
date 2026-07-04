-- Fase 4: premium gallery — optional showcase assets.
-- All nullable and unseeded: each stays dormant (tab hidden or shown as a
-- "request this" teaser) until a listing actually has the real asset, rather
-- than fabricating aerial/night/before-after/AI-staging imagery that doesn't exist.
ALTER TABLE developer_properties ADD COLUMN drone_photo TEXT;
ALTER TABLE developer_properties ADD COLUMN night_photo TEXT;
ALTER TABLE developer_properties ADD COLUMN before_photo TEXT;
ALTER TABLE developer_properties ADD COLUMN after_photo TEXT;
ALTER TABLE developer_properties ADD COLUMN ai_staged_photo TEXT;
