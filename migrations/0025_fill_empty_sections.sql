-- Migration number: 0025    Fill previously-empty admin sections for M&M (org 1)
-- Content found empty during the endpoint-by-endpoint backend audit: team
-- members, secondary-sale agents/properties, master plans, and CMS taxonomy
-- (categories/tags/authors/redirects). CMS articles/media are created
-- separately via the real admin API so reading time/SEO score/uploads go
-- through the same real computation and validation a human editor would hit.

-- ---------------------------------------------------------------------------
-- Team members (had only 1 of 3+)
-- ---------------------------------------------------------------------------
INSERT INTO team_members (organization_id, name, slug, email, phone, position, description, experience, languages, specialties, image, created_at, updated_at) VALUES
(1, 'Ahmed Al Rashid', 'ahmed-al-rashid', 'ahmed.alrashid@mm-realestate.com', '+971501234567', 'Director Comercial', 'Lidero el equipo comercial de M&M Real Estate, centrado en comunidades familiares y operaciones de reventa. Negocio cada operación buscando el mejor equilibrio entre precio, plazos y garantías para ambas partes.', '12 años en el sector inmobiliario de Dubái', 'العربية, English, Español', 'Comunidades familiares, reventa, negociación', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400', datetime('now'), datetime('now')),
(1, 'Sofía Bianchi', 'sofia-bianchi', 'sofia.bianchi@mm-realestate.com', '+971507654321', 'Especialista en Inversión Internacional', 'Asesoro a inversores extranjeros que compran en Dubái desde fuera de los Emiratos: análisis de rentabilidad, comparativa off-plan vs. reventa, y gestión remota de todo el proceso de compra.', '6 años en el sector inmobiliario de Dubái', 'Italiano, English, Español', 'Inversión extranjera, rentabilidad, off-plan', 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400', datetime('now'), datetime('now'));

-- ---------------------------------------------------------------------------
-- Secondary-sale agents + properties (were completely empty: 0 rows)
-- ---------------------------------------------------------------------------
INSERT INTO agents (organization_id, name, email, phone, profile_image, license_number, bio, status, created_at, updated_at) VALUES
(1, 'Laura Jiménez', 'laura.jimenez@mm-realestate.com', '+971501112233', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400', 'RERA-48213', 'Agente certificada RERA especializada en reventa en Dubai Marina y JBR. Gestiono todo el proceso, desde la valoración hasta la firma en el Dubai Land Department.', 'active', datetime('now'), datetime('now')),
(1, 'Karim El-Sayed', 'karim.elsayed@mm-realestate.com', '+971502223344', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400', 'RERA-51907', 'Especializado en villas familiares en Arabian Ranches y Dubai Hills. Trabajo tanto con compradores como con propietarios que quieren vender rápido y al mejor precio.', 'active', datetime('now'), datetime('now')),
(1, 'Wei Chen', 'wei.chen@mm-realestate.com', '+971503334455', 'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=400', 'RERA-53664', 'Ayudo a inquilinos e inversores asiáticos a encontrar alquileres y estudios de inversión en zonas emergentes como JVC y Dubai South.', 'active', datetime('now'), datetime('now'));

INSERT INTO agent_properties (slug, location, property_type, transaction_type, price, area, bedrooms, bathrooms, main_image, status, created_at, updated_at) VALUES
('marina-resale-apartment-2br', 'Dubai Marina, Dubai', 'Apartment', 'sale', 1650000, 98, 2, 2, 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200', 'available', datetime('now'), datetime('now')),
('arabian-ranches-resale-villa', 'Arabian Ranches, Dubai', 'Villa', 'sale', 4200000, 340, 4, 5, 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200', 'available', datetime('now'), datetime('now')),
('jvc-resale-studio', 'Jumeirah Village Circle, Dubai', 'Studio', 'rent', 55000, 42, 0, 1, 'https://images.unsplash.com/photo-1560520653-9e0e4c89eb11?w=1200', 'available', datetime('now'), datetime('now'));

INSERT INTO property_translations (property_id, locale, title, description) VALUES
((SELECT id FROM agent_properties WHERE slug = 'marina-resale-apartment-2br'), 'en', '2-Bedroom Resale Apartment in Dubai Marina', 'A bright, move-in-ready two-bedroom apartment on a high floor with full Marina views, an open-plan kitchen, and access to the building''s pool, gym, and 24/7 concierge. Ready for immediate handover with no waiting period.'),
((SELECT id FROM agent_properties WHERE slug = 'marina-resale-apartment-2br'), 'ar', 'شقة بغرفتين نوم لإعادة البيع في دبي مارينا', 'شقة مشرقة وجاهزة للسكن الفوري بغرفتين نوم في طابق مرتفع مع إطلالة كاملة على المارينا، ومطبخ مفتوح، وإمكانية الوصول إلى المسبح والصالة الرياضية وخدمة الاستقبال على مدار الساعة في المبنى. جاهزة للتسليم الفوري دون فترة انتظار.'),
((SELECT id FROM agent_properties WHERE slug = 'arabian-ranches-resale-villa'), 'en', '4-Bedroom Family Villa in Arabian Ranches', 'A well-maintained detached villa with a private garden, covered parking for two cars, and direct access to the community''s parks and cycling tracks. Popular with families for its schools and low-density layout.'),
((SELECT id FROM agent_properties WHERE slug = 'arabian-ranches-resale-villa'), 'ar', 'فيلا عائلية بأربع غرف نوم في المرابع العربية', 'فيلا مستقلة بحالة جيدة مع حديقة خاصة، وموقف مغطى لسيارتين، ووصول مباشر إلى الحدائق ومسارات ركوب الدراجات في المجتمع السكني. مفضّلة لدى العائلات بسبب قربها من المدارس وتصميمها منخفض الكثافة السكانية.'),
((SELECT id FROM agent_properties WHERE slug = 'jvc-resale-studio'), 'en', 'Studio for Rent in Jumeirah Village Circle', 'A compact, well-priced studio close to JVC''s cafes and supermarkets. Fitted kitchen, built-in wardrobe, and shared pool and gym access. Available on a 12-month contract, ideal for young professionals.'),
((SELECT id FROM agent_properties WHERE slug = 'jvc-resale-studio'), 'ar', 'استوديو للإيجار في قرية جميرا الدائرية', 'استوديو صغير وبسعر مناسب بالقرب من مقاهي وأسواق قرية جميرا الدائرية. يحتوي على مطبخ مجهز وخزانة حائط مدمجة، مع إمكانية استخدام المسبح والصالة الرياضية المشتركة. متاح بعقد لمدة 12 شهرًا، مثالي للمهنيين الشباب.');

INSERT INTO property_gallery_images (property_id, image, created_at) VALUES
((SELECT id FROM agent_properties WHERE slug = 'marina-resale-apartment-2br'), 'https://images.unsplash.com/photo-1560185893-a55cbc8c57e8?w=1200', datetime('now')),
((SELECT id FROM agent_properties WHERE slug = 'marina-resale-apartment-2br'), 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200', datetime('now')),
((SELECT id FROM agent_properties WHERE slug = 'arabian-ranches-resale-villa'), 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200', datetime('now')),
((SELECT id FROM agent_properties WHERE slug = 'arabian-ranches-resale-villa'), 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1200', datetime('now')),
((SELECT id FROM agent_properties WHERE slug = 'jvc-resale-studio'), 'https://images.unsplash.com/photo-1494526585095-c41746248156?w=1200', datetime('now')),
((SELECT id FROM agent_properties WHERE slug = 'jvc-resale-studio'), 'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=1200', datetime('now'));

-- ---------------------------------------------------------------------------
-- Master plans (were empty: 0 rows) — linked to two existing off-plan projects
-- ---------------------------------------------------------------------------
INSERT INTO master_plans (organization_id, name, image, created_at) VALUES
(1, 'Master plan — Marina Vista', 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=1600', datetime('now')),
(1, 'Master plan — Palm Grove', 'https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?w=1600', datetime('now'));

INSERT INTO developer_property_master_plan (developer_property_id, master_plan_id) VALUES
((SELECT id FROM developer_properties WHERE slug = 'marina-crest-tower'), (SELECT id FROM master_plans WHERE name = 'Master plan — Marina Vista')),
((SELECT id FROM developer_properties WHERE slug = 'palm-grove-residences'), (SELECT id FROM master_plans WHERE name = 'Master plan — Palm Grove'));

-- ---------------------------------------------------------------------------
-- CMS taxonomy (were empty: 0 categories/tags/authors/redirects)
-- ---------------------------------------------------------------------------
INSERT INTO cms_categories (organization_id, name, slug, color, description, created_at, updated_at) VALUES
(1, 'Guías del comprador', 'guias-del-comprador', '#0f766e', 'Guías paso a paso para comprar tu primera propiedad en Dubái.', datetime('now'), datetime('now')),
(1, 'Mercado inmobiliario', 'mercado-inmobiliario', '#1d4ed8', 'Análisis de zonas, tendencias y comparativas entre comunidades de Dubái.', datetime('now'), datetime('now')),
(1, 'Estilo de vida en Dubái', 'estilo-de-vida-dubai', '#b45309', 'Todo sobre vivir en Dubái: comunidades, servicios y vida cotidiana.', datetime('now'), datetime('now')),
(1, 'Inversión y financiación', 'inversion-y-financiacion', '#7c3aed', 'Rentabilidad, hipotecas y estrategias de inversión inmobiliaria en Dubái.', datetime('now'), datetime('now'));

INSERT INTO cms_tags (organization_id, name, slug, created_at) VALUES
(1, 'Dubai Marina', 'dubai-marina', datetime('now')),
(1, 'Off-plan', 'off-plan', datetime('now')),
(1, 'Hipotecas', 'hipotecas', datetime('now')),
(1, 'Downtown Dubai', 'downtown-dubai', datetime('now')),
(1, 'Primera vivienda', 'primera-vivienda', datetime('now')),
(1, 'Rentabilidad', 'rentabilidad', datetime('now'));

INSERT INTO cms_authors (organization_id, name, slug, photo, bio, specialty, created_at, updated_at) VALUES
(1, 'Perla Maria Melgarejo', 'perla-maria-melgarejo', '68725.png', 'Especialista en propiedades off-plan y de lujo en Dubái. Acompaña a compradores internacionales en cada paso, desde la selección hasta la entrega de llaves.', 'Off-plan y propiedades de lujo', datetime('now'), datetime('now')),
(1, 'Ahmed Al Rashid', 'ahmed-al-rashid', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400', 'Director comercial de M&M Real Estate, centrado en comunidades familiares y operaciones de reventa.', 'Comunidades familiares y reventa', datetime('now'), datetime('now'));

INSERT INTO cms_redirects (organization_id, from_path, to_path, status_code, created_at) VALUES
(1, '/blog-antiguo', '/blog', 301, datetime('now')),
(1, '/guia-compra-dubai', '/blog', 301, datetime('now'));
