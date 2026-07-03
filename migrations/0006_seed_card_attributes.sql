-- Migration number: 0006    Populate card attributes (demo)

UPDATE developer_properties SET has_tour=1, rental_yield=7.1, published_at=datetime('now','-3 days'), ai_summary='Luz espectacular todo el día y las mejores vistas al puerto deportivo del edificio.' WHERE id=1;
UPDATE developer_properties SET is_exclusive=1, rental_yield=6.2, published_at=datetime('now','-9 days') WHERE id=2;
UPDATE developer_properties SET price_old=1990000, has_tour=1, published_at=datetime('now','-1 days') WHERE id=3;
UPDATE developer_properties SET rental_yield=6.8, published_at=datetime('now','-20 days') WHERE id=4;
UPDATE developer_properties SET is_exclusive=1, has_tour=1, rental_yield=5.4, published_at=datetime('now','-30 days'), ai_summary='Villa con jardín y piscina privada, ideal para familias que buscan tranquilidad y golf.' WHERE id=5;
UPDATE developer_properties SET is_reserved=1, rental_yield=7.6, published_at=datetime('now','-45 days') WHERE id=6;
UPDATE developer_properties SET price_old=1790000, published_at=datetime('now','-6 days') WHERE id=7;
UPDATE developer_properties SET rental_yield=6.9, published_at=datetime('now','-12 days'), ai_summary='Comunidad familiar con jardines, guardería y colegios a un paso.' WHERE id=8;
UPDATE developer_properties SET is_exclusive=1, has_tour=1, published_at=datetime('now','-2 days') WHERE id=9;
UPDATE developer_properties SET is_exclusive=1, rental_yield=5.0, has_tour=1, published_at=datetime('now','-4 days') WHERE id=10;
UPDATE developer_properties SET is_reserved=1, rental_yield=7.4, published_at=datetime('now','-60 days') WHERE id=11;
UPDATE developer_properties SET price_old=2290000, rental_yield=6.5, published_at=datetime('now','-15 days') WHERE id=12;
