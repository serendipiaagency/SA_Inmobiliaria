CREATE TABLE price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  developer_property_id INTEGER NOT NULL REFERENCES developer_properties(id) ON DELETE CASCADE,
  price REAL NOT NULL,
  recorded_at TEXT NOT NULL
);
CREATE INDEX idx_price_history_property ON price_history(developer_property_id);

-- Backfill from data the schema already tracks — no invented price points.
-- Original price point: price_old if the listing ever had a price drop
-- recorded, otherwise the current price, at the real listing date.
INSERT INTO price_history (developer_property_id, price, recorded_at)
SELECT id, COALESCE(price_old, price), COALESCE(published_at, datetime('now'))
FROM developer_properties
WHERE price IS NOT NULL OR price_old IS NOT NULL;

-- Current price point, only for listings whose price actually changed from
-- price_old — recorded at migration time since we don't know exactly when
-- the drop happened, only that it did.
INSERT INTO price_history (developer_property_id, price, recorded_at)
SELECT id, price, datetime('now')
FROM developer_properties
WHERE price_old IS NOT NULL AND price_old != price AND price IS NOT NULL;
