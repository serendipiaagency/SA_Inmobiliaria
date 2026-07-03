-- Migration number: 0004    Populate search attributes for demo projects

UPDATE developer_properties SET property_type_main='Apartment', bedrooms=2, bathrooms=3, area=105, year_built=2028, energy_rating='A', orientation='SW', has_elevator=1, has_pool=1, has_garage=1, has_terrace=1 WHERE id=1;
UPDATE developer_properties SET property_type_main='Villa', bedrooms=3, bathrooms=4, area=190, year_built=2027, energy_rating='A', orientation='W', has_pool=1, has_garage=1, has_terrace=1, has_garden=1, pets_allowed=1 WHERE id=2;
UPDATE developer_properties SET property_type_main='Apartment', bedrooms=2, bathrooms=2, area=110, year_built=2029, energy_rating='B', orientation='S', has_elevator=1, has_pool=1, has_garage=1, has_terrace=1 WHERE id=3;
UPDATE developer_properties SET property_type_main='Apartment', bedrooms=2, bathrooms=2, area=115, year_built=2027, energy_rating='B', orientation='SE', has_elevator=1, has_pool=1, has_garage=1, has_terrace=1 WHERE id=4;
UPDATE developer_properties SET property_type_main='Villa', bedrooms=5, bathrooms=6, area=520, year_built=2027, energy_rating='A', orientation='S', has_pool=1, has_garage=1, has_terrace=1, has_garden=1, pets_allowed=1, accessible=1 WHERE id=5;
UPDATE developer_properties SET property_type_main='Apartment', bedrooms=1, bathrooms=1, area=65, year_built=2024, energy_rating='C', orientation='W', has_elevator=1, has_pool=1, has_garage=1 WHERE id=6;
UPDATE developer_properties SET property_type_main='Apartment', bedrooms=1, bathrooms=1, area=90, year_built=2028, energy_rating='B', orientation='N', has_elevator=1, has_garage=1, has_terrace=1 WHERE id=7;
UPDATE developer_properties SET property_type_main='Apartment', bedrooms=2, bathrooms=2, area=105, year_built=2028, energy_rating='B', orientation='E', has_elevator=1, has_pool=1, has_garage=1, has_garden=1, pets_allowed=1 WHERE id=8;
UPDATE developer_properties SET property_type_main='Villa', bedrooms=6, bathrooms=7, area=900, year_built=2028, energy_rating='A', orientation='W', has_pool=1, has_garage=1, has_terrace=1, has_garden=1, pets_allowed=1, accessible=1 WHERE id=9;
UPDATE developer_properties SET property_type_main='Penthouse', bedrooms=4, bathrooms=5, area=380, year_built=2029, energy_rating='A', orientation='S', has_elevator=1, has_pool=1, has_garage=1, has_terrace=1, accessible=1 WHERE id=10;
UPDATE developer_properties SET property_type_main='Apartment', bedrooms=2, bathrooms=2, area=108, year_built=2024, energy_rating='C', orientation='SE', has_elevator=1, has_pool=1, has_garage=1, pets_allowed=1 WHERE id=11;
UPDATE developer_properties SET property_type_main='Townhouse', bedrooms=3, bathrooms=3, area=210, year_built=2028, energy_rating='B', orientation='S', has_garage=1, has_terrace=1, has_garden=1, pets_allowed=1 WHERE id=12;
