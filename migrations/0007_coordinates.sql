-- Migration number: 0007    Geo coordinates for the map

ALTER TABLE developer_properties ADD COLUMN lat REAL;
ALTER TABLE developer_properties ADD COLUMN lng REAL;

UPDATE developer_properties SET lat=25.078, lng=55.140 WHERE id=1;
UPDATE developer_properties SET lat=25.112, lng=55.138 WHERE id=2;
UPDATE developer_properties SET lat=25.197, lng=55.274 WHERE id=3;
UPDATE developer_properties SET lat=25.202, lng=55.350 WHERE id=4;
UPDATE developer_properties SET lat=25.055, lng=55.170 WHERE id=5;
UPDATE developer_properties SET lat=25.081, lng=55.145 WHERE id=6;
UPDATE developer_properties SET lat=25.185, lng=55.263 WHERE id=7;
UPDATE developer_properties SET lat=25.210, lng=55.345 WHERE id=8;
UPDATE developer_properties SET lat=25.118, lng=55.130 WHERE id=9;
UPDATE developer_properties SET lat=25.193, lng=55.279 WHERE id=10;
UPDATE developer_properties SET lat=25.205, lng=55.352 WHERE id=11;
UPDATE developer_properties SET lat=25.050, lng=55.175 WHERE id=12;
