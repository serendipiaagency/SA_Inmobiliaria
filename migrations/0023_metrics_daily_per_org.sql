-- Migration number: 0023    metrics_daily becomes per-organization
--
-- metrics_daily.day was UNIQUE on its own (migration 0008) — two orgs could
-- never both have a "2026-07-23" row. SQLite/D1 can't relax a column-level
-- UNIQUE via ALTER TABLE, so this rebuilds the table with a composite
-- unique(organization_id, day) instead, backfilling every existing row to
-- org id=1 ("M&M Real Estate", the pre-existing tenant) — same pattern as
-- migration 0021's organization_id backfill.

CREATE TABLE metrics_daily_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL DEFAULT 1,
  day TEXT NOT NULL,
  visitors INTEGER NOT NULL DEFAULT 0,
  pageviews INTEGER NOT NULL DEFAULT 0,
  leads INTEGER NOT NULL DEFAULT 0,
  visits_booked INTEGER NOT NULL DEFAULT 0,
  reservations INTEGER NOT NULL DEFAULT 0,
  revenue REAL NOT NULL DEFAULT 0
);

INSERT INTO metrics_daily_new (id, organization_id, day, visitors, pageviews, leads, visits_booked, reservations, revenue)
SELECT id, 1, day, visitors, pageviews, leads, visits_booked, reservations, revenue FROM metrics_daily;

DROP TABLE metrics_daily;
ALTER TABLE metrics_daily_new RENAME TO metrics_daily;

CREATE UNIQUE INDEX IF NOT EXISTS metrics_daily_org_day ON metrics_daily (organization_id, day);
CREATE INDEX IF NOT EXISTS metrics_daily_day ON metrics_daily (day);
