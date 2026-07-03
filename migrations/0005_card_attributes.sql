-- Migration number: 0005    Card attributes (badges, yield, price drop, tour, publish date)

ALTER TABLE developer_properties ADD COLUMN price_old REAL;
ALTER TABLE developer_properties ADD COLUMN is_exclusive INTEGER NOT NULL DEFAULT 0;
ALTER TABLE developer_properties ADD COLUMN is_reserved INTEGER NOT NULL DEFAULT 0;
ALTER TABLE developer_properties ADD COLUMN has_tour INTEGER NOT NULL DEFAULT 0;
ALTER TABLE developer_properties ADD COLUMN rental_yield REAL;
ALTER TABLE developer_properties ADD COLUMN published_at TEXT;
ALTER TABLE developer_properties ADD COLUMN ai_summary TEXT;
