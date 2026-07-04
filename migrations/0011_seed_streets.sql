-- Migration number: 0011    Seed street names for existing demo projects
-- postal_code intentionally left NULL — see 0010 note.

UPDATE developer_properties SET street = 'Marina Promenade' WHERE slug = 'marina-crest-tower';
UPDATE developer_properties SET street = 'Waterfront Boulevard' WHERE slug = 'azure-bay-apartments';
UPDATE developer_properties SET street = 'Palm Grove Avenue' WHERE slug = 'palm-grove-residences';
UPDATE developer_properties SET street = 'Beachfront Drive' WHERE slug = 'palma-beachfront-estates';
UPDATE developer_properties SET street = 'Downtown Boulevard' WHERE slug = 'downtown-one';
UPDATE developer_properties SET street = 'Skyline Avenue' WHERE slug = 'skyline-business-lofts';
UPDATE developer_properties SET street = 'Central Park Drive' WHERE slug = 'oasis-sky-penthouses';
UPDATE developer_properties SET street = 'Harbour Promenade' WHERE slug = 'creek-harbour-views';
UPDATE developer_properties SET street = 'Manara Walk' WHERE slug = 'manara-gardens';
UPDATE developer_properties SET street = 'Creek Drive' WHERE slug = 'harbour-lights-residences';
UPDATE developer_properties SET street = 'Hillside Avenue' WHERE slug = 'the-oasis-villas';
UPDATE developer_properties SET street = 'Serenity Park Road' WHERE slug = 'serenity-park-townhouses';
