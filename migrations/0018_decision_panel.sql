-- Real per-view timestamp log (so "vistas esta semana" is an honest,
-- time-windowed count instead of reusing the all-time view_count scalar
-- added in 0017) and an optional real service-charge figure per property,
-- null until a real one is entered.
CREATE TABLE property_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  developer_property_id INTEGER NOT NULL REFERENCES developer_properties(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE INDEX property_views_property_created ON property_views(developer_property_id, created_at);

ALTER TABLE developer_properties ADD COLUMN service_charge_annual REAL;
