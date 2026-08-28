-- Migration number: 0049    Video field + social links table on agent_properties (Propiedades 2ª mano)
--
-- Closes the remaining Property Builder parity gaps between "Propiedades
-- 2ª mano" and "Propiedades (web)" (0048 already brought the granular
-- address + map): a video field, and a social-links child table mirroring
-- property_social_media so the same SocialLinksManager.vue works for both
-- resources without a shared FK between two unrelated parent tables.
--
-- Both additive/new — no existing column or table is touched.

ALTER TABLE agent_properties ADD COLUMN video_url TEXT;

CREATE TABLE agent_property_social_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES agent_properties(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  url TEXT NOT NULL,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX agent_property_social_media_property ON agent_property_social_media (property_id, sort_order);
