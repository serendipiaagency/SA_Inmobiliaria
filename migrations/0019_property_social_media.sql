-- Real Instagram/TikTok video embeds per property, curated by the admin
-- team (no scraping, no fabricated posts). Empty until a real post/reel
-- URL is added for that listing; the gallery's "Redes" tab shows an honest
-- request-a-video teaser until then, same as the drone/night-photo tabs.
CREATE TABLE property_social_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  developer_property_id INTEGER NOT NULL REFERENCES developer_properties(id) ON DELETE CASCADE,
  platform TEXT NOT NULL, -- 'instagram' | 'tiktok'
  url TEXT NOT NULL,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX property_social_media_property ON property_social_media(developer_property_id, sort_order);
