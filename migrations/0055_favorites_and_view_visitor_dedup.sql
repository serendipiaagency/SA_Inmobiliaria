-- Migration number: 0055    Real per-visitor favorites + view dedup identity
--
-- server/api/public/favorite.post.ts trusted the client-supplied `on`
-- boolean to increment/decrement developer_properties.favorite_count
-- directly, with no identity behind it at all — a script could inflate or
-- zero out any listing's count by replaying the same request. Real
-- per-visitor state (server/utils/visitor.ts's anonymous cookie) makes
-- "favorite" mean something: one row per (org, property, visitor), so the
-- cached favorite_count column can only ever move by ±1 per visitor, driven
-- by a real insert/delete here rather than trusted client input
-- (docs/production-hardening-audit.md, P1-7).
--
-- property_views.visitor_id lets the same dedup identity be reused to stop
-- view.post.ts counting the same visitor's repeat requests as new views
-- within a short window (P1-6).
--
-- Purely additive (CREATE TABLE + ADD COLUMN, nullable) — no rebuild.

CREATE TABLE favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  developer_property_id INTEGER NOT NULL REFERENCES developer_properties(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS favorites_org_property_visitor ON favorites (organization_id, developer_property_id, visitor_id);
CREATE INDEX IF NOT EXISTS favorites_property ON favorites (developer_property_id);

ALTER TABLE property_views ADD COLUMN visitor_id TEXT;
