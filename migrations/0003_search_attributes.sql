-- Migration number: 0003    Search & filter attributes on developer_properties

ALTER TABLE developer_properties ADD COLUMN property_type_main TEXT;
ALTER TABLE developer_properties ADD COLUMN bedrooms INTEGER;
ALTER TABLE developer_properties ADD COLUMN bathrooms INTEGER;
ALTER TABLE developer_properties ADD COLUMN area REAL;
ALTER TABLE developer_properties ADD COLUMN year_built INTEGER;
ALTER TABLE developer_properties ADD COLUMN energy_rating TEXT;
ALTER TABLE developer_properties ADD COLUMN orientation TEXT;
ALTER TABLE developer_properties ADD COLUMN has_elevator INTEGER NOT NULL DEFAULT 0;
ALTER TABLE developer_properties ADD COLUMN has_pool INTEGER NOT NULL DEFAULT 0;
ALTER TABLE developer_properties ADD COLUMN has_garage INTEGER NOT NULL DEFAULT 0;
ALTER TABLE developer_properties ADD COLUMN has_terrace INTEGER NOT NULL DEFAULT 0;
ALTER TABLE developer_properties ADD COLUMN has_garden INTEGER NOT NULL DEFAULT 0;
ALTER TABLE developer_properties ADD COLUMN pets_allowed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE developer_properties ADD COLUMN accessible INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS developer_properties_price ON developer_properties(price);
CREATE INDEX IF NOT EXISTS developer_properties_bedrooms ON developer_properties(bedrooms);
CREATE INDEX IF NOT EXISTS developer_properties_type ON developer_properties(property_type_main);
