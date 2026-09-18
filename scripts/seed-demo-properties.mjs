#!/usr/bin/env node
/**
 * Siembra un catálogo de propiedades de demostración, con la ficha completa.
 *
 * ## Por qué
 *
 * Un panel vacío no se puede valorar: ni el Constructor Web (los bloques de
 * propiedades no tienen qué mostrar), ni la ficha del cliente (sus
 * "propiedades relacionadas" salen de visitas y operaciones sobre
 * propiedades reales), ni el listado, ni los filtros. Esto rellena el
 * catálogo con contenido coherente y **todas** las secciones del Property
 * Builder cubiertas: identificación, ubicación con coordenadas, precio con
 * plan de pagos, características y equipamiento, descripción, multimedia,
 * galería, planos, tipos de unidad, redes sociales y datos de inversión.
 *
 * ## Seguridad
 *
 * - `--org` es **obligatorio**: no hay valor por defecto que pueda sembrar en
 *   la agencia equivocada.
 * - Escribe en la base **local** salvo que se pase `--remote`, y `--remote`
 *   exige además `--confirm APLICAR`. Sembrar en producción mete propiedades
 *   en el catálogo de una inmobiliaria real, y eso lo decide su dueño.
 * - Es **idempotente**: todo lo que crea lleva el prefijo `demo-` en el slug.
 *   Al empezar borra lo sembrado antes para esa organización, así que
 *   ejecutarlo dos veces no duplica nada.
 * - `--wipe` borra lo sembrado y no crea nada.
 *
 * Nada de esto toca propiedades que no haya creado este script.
 *
 * ## Imágenes
 *
 * URLs absolutas (Unsplash). `mediaUrl()` las deja pasar tal cual, así que no
 * hace falta subir nada a R2 ni manejar binarios, y funciona igual en local y
 * en remoto.
 *
 * ## Precios
 *
 * Se guardan en AED, que es lo que espera `useCurrency()` para convertir a la
 * moneda elegida. Los importes de aquí equivalen a precios de mercado en
 * euros (AED ≈ 0,2532 €).
 *
 * Uso:
 *   node scripts/seed-demo-properties.mjs --org 1
 *   node scripts/seed-demo-properties.mjs --org 1 --wipe
 *   node scripts/seed-demo-properties.mjs --org 1 --remote --confirm APLICAR
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DB_NAME = 'sa_inmobiliaria'
const SLUG_PREFIX = 'demo-'

const args = process.argv.slice(2)
function flag(name) {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? null : args[i + 1]
}
const has = (name) => args.includes(`--${name}`)

const orgId = parseInt(flag('org') || '', 10)
const remote = has('remote')
const wipeOnly = has('wipe')

if (!orgId) {
  console.error('Falta --org <id>. Sin organización no se siembra nada: es la diferencia entre rellenar tu agencia y rellenar la de otro.')
  process.exit(2)
}
if (remote && flag('confirm') !== 'APLICAR') {
  console.error('--remote escribe en la base de datos de producción. Añade --confirm APLICAR si es lo que quieres.')
  process.exit(2)
}

const LOCATION = remote ? '--remote' : '--local'

/** AED → €. Los importes se escriben en euros y se convierten al guardar. */
const EUR_TO_AED = 1 / 0.2532
const aed = (euros) => Math.round(euros * EUR_TO_AED)

const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`)
const n = (v) => (v === null || v === undefined ? 'NULL' : String(v))
const NOW = new Date().toISOString().replace('T', ' ').slice(0, 19)

// Fotografías reales de Unsplash, agrupadas por tipo para que la galería de
// una villa no mezcle rascacielos.
const PHOTOS = {
  villa: [
    'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1600',
    'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1600',
    'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1600',
    'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=1600',
  ],
  apartment: [
    'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1600',
    'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1600',
    'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1600',
    'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=1600',
  ],
  penthouse: [
    'https://images.unsplash.com/photo-1567496898669-ee935f5f647a?w=1600',
    'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=1600',
    'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=1600',
  ],
  townhouse: [
    'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=1600',
    'https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83?w=1600',
    'https://images.unsplash.com/photo-1598228723793-52759bba239c?w=1600',
  ],
  studio: [
    'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1600',
    'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1600',
  ],
  plans: [
    'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=1200',
    'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=1200',
  ],
  maps: ['https://images.unsplash.com/photo-1524661135-423995f22d0b?w=1200'],
  logos: ['https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=400'],
}


/**
 * Comercial asignado. Se toma de los `team_members` reales de la
 * organización, rotando, en vez de inventar un id: una propiedad apuntando a
 * un comercial inexistente rompe la ficha y el "Rendimiento" del comercial.
 * Si la agencia no tiene ninguno todavía, queda sin asignar, que es un estado
 * válido.
 */
const agentRef = (i) =>
  `(SELECT id FROM team_members WHERE organization_id = ${orgId} ORDER BY sort_order, id LIMIT 1 OFFSET ${i} % (SELECT max(1, count(*)) FROM team_members WHERE organization_id = ${orgId}))`

const paymentPlan = (entrada, construccion, entrega) =>
  JSON.stringify([
    { label: 'A la reserva', percentage: entrada, note: 'Contrato de reserva y due diligence' },
    { label: 'Durante la construcción', percentage: construccion, note: 'En hitos certificados por la dirección de obra' },
    { label: 'A la entrega de llaves', percentage: entrega, note: 'Firma de escritura' },
  ])

// ---------------------------------------------------------------------------
// Obra nueva (developer_properties)
// ---------------------------------------------------------------------------
const DEVELOPERS = [
  { key: 'costasur', name: 'Costa Sur Desarrollos', email: 'info@costasur.demo', phone: '+34 952 100 200', description: 'Promotora especializada en residencial de costa con certificación energética A.' },
  { key: 'altamar', name: 'Altamar Promociones', email: 'hola@altamar.demo', phone: '+34 952 300 400', description: 'Obra nueva de diseño en primera línea y golf.' },
]

const NEW_BUILDS = [
  {
    slug: 'residencial-mirador-del-mar',
    developer: 'costasur',
    name: 'Residencial Mirador del Mar',
    status: 'under_construction',
    propertyType: 'Apartment',
    price: 485000, priceOld: 512000,
    bedrooms: 3, bathrooms: 2, area: 118, yearBuilt: 2027,
    orientation: 'S', energyRating: 'A',
    features: { elevator: 1, pool: 1, garage: 1, terrace: 1, garden: 1, pets: 1, accessible: 1 },
    country: 'España', city: 'Estepona', district: 'Playa del Cristo', community: 'Mirador del Mar',
    street: 'Avenida del Carmen', streetNumber: '42', block: 'B', portal: '2', floor: '4', doorLetter: 'A', postalCode: '29680',
    lat: 36.4212, lng: -5.1489,
    handoverDate: 'Q2 2027', handoverPercentage: '30%', downPercentage: '20%', constructionPercentage: '50%',
    plan: paymentPlan(20, 50, 30),
    photos: 'apartment',
    rentalYield: 5.4, serviceCharge: 1680, exclusive: 1, reserved: 0, tour: 1,
    published: true,
    description:
      '<p>Promoción de 48 viviendas a 300 metros de la playa del Cristo, con orientación sur y vistas abiertas al Mediterráneo desde todas las terrazas.</p><p>Cocinas equipadas con electrodomésticos de alta gama, aerotermia, suelo radiante y carpintería de aluminio con rotura de puente térmico. Zonas comunes con piscina de agua salada, gimnasio y sala coworking.</p>',
    highlights: 'A 300 m de la playa · Aerotermia y suelo radiante · Piscina de agua salada · Plaza de garaje y trastero incluidos · Certificación energética A',
    masterPlan: 'Cuatro bloques de baja altura escalonados hacia el mar, con un 60 % de la parcela destinado a zonas ajardinadas.',
    floorPlanDesc: 'Tipologías de 1, 2 y 3 dormitorios; todas con terraza de al menos 14 m² y cocina abierta al salón.',
    locationMapDesc: 'A 5 minutos en coche del centro de Estepona, 35 de Marbella y 50 del aeropuerto de Málaga.',
    units: [
      { propertyType: 'Apartment', unitType: '1 dormitorio', size: '68 m² + 14 m² terraza' },
      { propertyType: 'Apartment', unitType: '2 dormitorios', size: '92 m² + 20 m² terraza' },
      { propertyType: 'Apartment', unitType: '3 dormitorios', size: '118 m² + 28 m² terraza' },
    ],
  },
  {
    slug: 'villas-la-quinta-golf',
    developer: 'altamar',
    name: 'Villas La Quinta Golf',
    status: 'new',
    propertyType: 'Villa',
    price: 1450000, priceOld: null,
    bedrooms: 4, bathrooms: 4, area: 320, yearBuilt: 2026,
    orientation: 'SW', energyRating: 'A',
    features: { elevator: 1, pool: 1, garage: 1, terrace: 1, garden: 1, pets: 1, accessible: 0 },
    country: 'España', city: 'Benahavís', district: 'La Quinta', community: 'La Quinta Golf',
    street: 'Camino de la Quinta', streetNumber: '7', block: null, portal: null, floor: null, doorLetter: null, postalCode: '29679',
    lat: 36.5098, lng: -4.9721,
    handoverDate: 'Q4 2026', handoverPercentage: '40%', downPercentage: '15%', constructionPercentage: '45%',
    plan: paymentPlan(15, 45, 40),
    photos: 'villa',
    rentalYield: 4.1, serviceCharge: 3400, exclusive: 1, reserved: 0, tour: 1,
    published: true,
    description:
      '<p>Doce villas independientes sobre el campo de golf de La Quinta, con parcelas desde 800 m² y piscina infinity privada orientada al suroeste.</p><p>Distribuidas en tres plantas con ascensor privado, sótano diáfano habilitable y domótica integral. Materiales de primera calidad y grandes ventanales de suelo a techo.</p>',
    highlights: 'Parcela desde 800 m² · Piscina infinity privada · Ascensor en vivienda · Domótica integral · Vistas a golf y mar',
    masterPlan: 'Doce parcelas en pastilla única con acceso rodado privado y control de accesos.',
    floorPlanDesc: 'Planta baja con salón a doble altura, planta primera con cuatro suites y sótano de 120 m².',
    locationMapDesc: 'A 10 minutos de Puerto Banús y 15 del centro de Marbella.',
    units: [
      { propertyType: 'Villa', unitType: '4 dormitorios', size: '320 m² + parcela 800 m²' },
      { propertyType: 'Villa', unitType: '5 dormitorios', size: '385 m² + parcela 1.100 m²' },
    ],
  },
  {
    slug: 'atico-torre-marina',
    developer: 'altamar',
    name: 'Ático Torre Marina',
    status: 'ready',
    propertyType: 'Penthouse',
    price: 890000, priceOld: 940000,
    bedrooms: 3, bathrooms: 3, area: 165, yearBuilt: 2024,
    orientation: 'SE', energyRating: 'B',
    features: { elevator: 1, pool: 1, garage: 1, terrace: 1, garden: 0, pets: 1, accessible: 1 },
    country: 'España', city: 'Málaga', district: 'Muelle Uno', community: 'Torre Marina',
    street: 'Paseo del Muelle Uno', streetNumber: '3', block: 'A', portal: '1', floor: '12', doorLetter: 'B', postalCode: '29016',
    lat: 36.7156, lng: -4.4148,
    handoverDate: 'Entrega inmediata', handoverPercentage: '90%', downPercentage: '10%', constructionPercentage: '0%',
    plan: paymentPlan(10, 0, 90),
    photos: 'penthouse',
    rentalYield: 6.2, serviceCharge: 2400, exclusive: 0, reserved: 1, tour: 1,
    published: true,
    description:
      '<p>Ático dúplex en la planta 12 con 90 m² de terraza envolvente y vistas de 270° sobre el puerto y la Alcazaba.</p><p>Entrega inmediata, totalmente amueblado por estudio de interiorismo. Dos plazas de garaje y trastero incluidos.</p>',
    highlights: '90 m² de terraza · Vistas 270° al puerto · Entrega inmediata · Amueblado por interiorista · Dos plazas de garaje',
    masterPlan: 'Torre residencial de 14 plantas con conserjería 24 h, piscina en azotea y gimnasio.',
    floorPlanDesc: 'Dúplex: planta inferior con zona de día y dos suites, planta superior con suite principal y solárium.',
    locationMapDesc: 'En el Muelle Uno, a pie del centro histórico de Málaga y de la playa de la Malagueta.',
    units: [{ propertyType: 'Penthouse', unitType: 'Dúplex 3 dormitorios', size: '165 m² + 90 m² terraza' }],
  },
  {
    slug: 'adosados-el-pinar',
    developer: 'costasur',
    name: 'Adosados El Pinar',
    status: 'under_construction',
    propertyType: 'Townhouse',
    price: 395000, priceOld: null,
    bedrooms: 3, bathrooms: 3, area: 145, yearBuilt: 2027,
    orientation: 'SE', energyRating: 'A',
    features: { elevator: 0, pool: 1, garage: 1, terrace: 1, garden: 1, pets: 1, accessible: 0 },
    country: 'España', city: 'Mijas', district: 'La Cala de Mijas', community: 'El Pinar',
    street: 'Calle de los Pinos', streetNumber: '18', block: null, portal: null, floor: null, doorLetter: null, postalCode: '29649',
    lat: 36.5083, lng: -4.6879,
    handoverDate: 'Q1 2027', handoverPercentage: '35%', downPercentage: '15%', constructionPercentage: '50%',
    plan: paymentPlan(15, 50, 35),
    photos: 'townhouse',
    rentalYield: 5.0, serviceCharge: 1200, exclusive: 0, reserved: 0, tour: 0,
    published: true,
    description:
      '<p>Veinte adosados con jardín privado de 60 m² y solárium, en una urbanización cerrada a 900 metros de la playa de La Cala.</p><p>Tres dormitorios, aseo de cortesía y garaje privado en cada vivienda. Zona común con piscina, pádel y área infantil.</p>',
    highlights: 'Jardín privado de 60 m² · Solárium · Urbanización cerrada · Pista de pádel · A 900 m de la playa',
    masterPlan: 'Dos hileras de diez viviendas en torno a la zona común ajardinada.',
    floorPlanDesc: 'Planta baja con salón-cocina y aseo, primera con tres dormitorios, y solárium accesible por escalera exterior.',
    locationMapDesc: 'A 20 minutos de Marbella y 25 del aeropuerto de Málaga.',
    units: [{ propertyType: 'Townhouse', unitType: '3 dormitorios', size: '145 m² + 60 m² jardín' }],
  },
]

// ---------------------------------------------------------------------------
// Segunda mano (agent_properties)
// ---------------------------------------------------------------------------
const RESALES = [
  {
    slug: 'piso-reformado-soho-malaga',
    title: 'Piso reformado en el Soho',
    propertyType: 'Apartment',
    transactionType: 'sale',
    status: 'available',
    price: 329000, priceOld: 355000,
    bedrooms: 2, bathrooms: 2, area: 86, yearBuilt: 1972,
    orientation: 'E', energyRating: 'D',
    features: { elevator: 1, pool: 0, garage: 0, terrace: 1, garden: 0, pets: 1, accessible: 1 },
    country: 'España', city: 'Málaga', district: 'Soho', community: 'Ensanche Centro',
    street: 'Calle Tomás Heredia', streetNumber: '24', block: null, portal: null, floor: '3', doorLetter: 'C', postalCode: '29001',
    lat: 36.7175, lng: -4.4248,
    photos: 'apartment',
    rentalYield: 6.8, serviceCharge: 960, exclusive: 1, reserved: 0, tour: 1,
    highlights: 'Reforma integral de 2023 · Aire acondicionado por conductos · Ascensor · A 5 minutos del Muelle Uno',
    description:
      'Vivienda reformada íntegramente en 2023 en pleno barrio del Soho. Dos dormitorios, dos baños completos, cocina abierta con isla y terraza de 8 m². Edificio con ascensor y portal rehabilitado. Alta rentabilidad por su ubicación y demanda de alquiler.',
  },
  {
    slug: 'villa-mediterranea-nueva-andalucia',
    title: 'Villa mediterránea en Nueva Andalucía',
    propertyType: 'Villa',
    transactionType: 'sale',
    status: 'available',
    price: 1190000, priceOld: null,
    bedrooms: 5, bathrooms: 4, area: 340, yearBuilt: 2006,
    orientation: 'S', energyRating: 'C',
    features: { elevator: 0, pool: 1, garage: 1, terrace: 1, garden: 1, pets: 1, accessible: 0 },
    country: 'España', city: 'Marbella', district: 'Nueva Andalucía', community: 'Valle del Golf',
    street: 'Calle Lirio', streetNumber: '11', block: null, portal: null, floor: null, doorLetter: null, postalCode: '29660',
    lat: 36.5041, lng: -4.9542,
    photos: 'villa',
    rentalYield: 4.6, serviceCharge: 2100, exclusive: 1, reserved: 0, tour: 1,
    highlights: 'Parcela de 1.000 m² · Piscina climatizada · Cinco dormitorios · Garaje para tres coches',
    description:
      'Villa de estilo mediterráneo en el Valle del Golf, sobre parcela de 1.000 m² con jardín maduro y piscina climatizada. Cinco dormitorios, cuatro baños, salón con chimenea y cocina office. Garaje cerrado para tres vehículos y casa de invitados independiente.',
  },
  {
    slug: 'apartamento-alquiler-larga-temporada-fuengirola',
    title: 'Apartamento en alquiler de larga temporada',
    propertyType: 'Apartment',
    transactionType: 'rent',
    status: 'available',
    price: 1450, priceOld: null,
    bedrooms: 2, bathrooms: 1, area: 74, yearBuilt: 1998,
    orientation: 'SW', energyRating: 'E',
    features: { elevator: 1, pool: 1, garage: 1, terrace: 1, garden: 0, pets: 0, accessible: 1 },
    country: 'España', city: 'Fuengirola', district: 'Los Boliches', community: 'Residencial Azul',
    street: 'Paseo Marítimo Rey de España', streetNumber: '88', block: 'C', portal: '3', floor: '5', doorLetter: 'D', postalCode: '29640',
    lat: 36.5373, lng: -4.6217,
    photos: 'apartment',
    rentalYield: null, serviceCharge: 1140, exclusive: 0, reserved: 0, tour: 0,
    highlights: 'Primera línea de playa · Piscina comunitaria · Plaza de garaje · Amueblado',
    description:
      'Apartamento amueblado en primera línea de playa, con terraza orientada al suroeste y vistas al mar. Dos dormitorios, cocina independiente y plaza de garaje. Comunidad con piscina y acceso directo al paseo marítimo. Alquiler de larga temporada, fianza de dos mensualidades.',
  },
  {
    slug: 'estudio-centro-historico-vendido',
    title: 'Estudio en el centro histórico',
    propertyType: 'Studio',
    transactionType: 'sale',
    status: 'sold',
    price: 185000, priceOld: 199000,
    bedrooms: 1, bathrooms: 1, area: 42, yearBuilt: 1950,
    orientation: 'N', energyRating: 'F',
    features: { elevator: 0, pool: 0, garage: 0, terrace: 0, garden: 0, pets: 1, accessible: 0 },
    country: 'España', city: 'Málaga', district: 'Centro Histórico', community: 'La Merced',
    street: 'Calle Granada', streetNumber: '57', block: null, portal: null, floor: '2', doorLetter: 'A', postalCode: '29015',
    lat: 36.7226, lng: -4.4189,
    photos: 'studio',
    rentalYield: 7.1, serviceCharge: 540, exclusive: 0, reserved: 0, tour: 0,
    highlights: 'Junto a la plaza de la Merced · Alta demanda turística · Vendido en 2026',
    description:
      'Estudio de 42 m² a un paso de la plaza de la Merced, ideal como inversión. Operación cerrada en 2026; se mantiene en el catálogo como referencia histórica de la zona.',
  },
]

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------
const sql = []

// Limpieza previa: sólo lo que este script creó (slug con prefijo demo-).
sql.push(`DELETE FROM images WHERE developer_property_id IN (SELECT id FROM developer_properties WHERE organization_id = ${orgId} AND slug LIKE '${SLUG_PREFIX}%');`)
sql.push(`DELETE FROM floor_plans WHERE developer_property_id IN (SELECT id FROM developer_properties WHERE organization_id = ${orgId} AND slug LIKE '${SLUG_PREFIX}%');`)
sql.push(`DELETE FROM property_types WHERE developer_property_id IN (SELECT id FROM developer_properties WHERE organization_id = ${orgId} AND slug LIKE '${SLUG_PREFIX}%');`)
sql.push(`DELETE FROM property_social_media WHERE developer_property_id IN (SELECT id FROM developer_properties WHERE organization_id = ${orgId} AND slug LIKE '${SLUG_PREFIX}%');`)
sql.push(`DELETE FROM developer_properties WHERE organization_id = ${orgId} AND slug LIKE '${SLUG_PREFIX}%';`)
sql.push(`DELETE FROM property_gallery_images WHERE property_id IN (SELECT id FROM agent_properties WHERE organization_id = ${orgId} AND slug LIKE '${SLUG_PREFIX}%');`)
sql.push(`DELETE FROM agent_property_floor_plans WHERE property_id IN (SELECT id FROM agent_properties WHERE organization_id = ${orgId} AND slug LIKE '${SLUG_PREFIX}%');`)
sql.push(`DELETE FROM agent_property_social_media WHERE property_id IN (SELECT id FROM agent_properties WHERE organization_id = ${orgId} AND slug LIKE '${SLUG_PREFIX}%');`)
sql.push(`DELETE FROM property_translations WHERE property_id IN (SELECT id FROM agent_properties WHERE organization_id = ${orgId} AND slug LIKE '${SLUG_PREFIX}%');`)
sql.push(`DELETE FROM agent_properties WHERE organization_id = ${orgId} AND slug LIKE '${SLUG_PREFIX}%';`)
sql.push(`DELETE FROM developers WHERE organization_id = ${orgId} AND name LIKE '%(demo)';`)

if (!wipeOnly) {
  for (const d of DEVELOPERS) {
    sql.push(
      `INSERT INTO developers (organization_id, name, email, phone, logo, description, status, created_at, updated_at) VALUES (${orgId}, ${q(`${d.name} (demo)`)}, ${q(d.email)}, ${q(d.phone)}, ${q(PHOTOS.logos[0])}, ${q(d.description)}, 'active', ${q(NOW)}, ${q(NOW)});`,
    )
  }

  for (const p of NEW_BUILDS) {
    const slug = SLUG_PREFIX + p.slug
    const photos = PHOTOS[p.photos]
    const devName = DEVELOPERS.find((d) => d.key === p.developer).name
    sql.push(
      `INSERT INTO developer_properties (
        organization_id, developer_id, slug, name, status, price, price_old, description, key_highlights, payment_plan,
        handover_date, handover_percentage, down_percentage, construction_percentage,
        logo, cover_image, community, master_plan_image, location_map,
        master_plan_description, floor_plan_description, location_map_description,
        property_type_main, bedrooms, bathrooms, area, year_built, energy_rating, orientation,
        has_elevator, has_pool, has_garage, has_terrace, has_garden, pets_allowed, accessible,
        is_exclusive, is_reserved, has_tour, rental_yield, service_charge_annual, agent_id,
        lat, lng, country, city, street, street_number, block, portal, floor, door_letter, postal_code, district,
        video_url, drone_photo, night_photo, before_photo, after_photo, ai_staged_photo,
        published_at, created_at, updated_at
      ) VALUES (
        ${orgId},
        (SELECT id FROM developers WHERE organization_id = ${orgId} AND name = ${q(`${devName} (demo)`)} LIMIT 1),
        ${q(slug)}, ${q(p.name)}, ${q(p.status)}, ${n(aed(p.price))}, ${n(p.priceOld ? aed(p.priceOld) : null)},
        ${q(p.description)}, ${q(p.highlights)}, ${q(p.plan)},
        ${q(p.handoverDate)}, ${q(p.handoverPercentage)}, ${q(p.downPercentage)}, ${q(p.constructionPercentage)},
        ${q(PHOTOS.logos[0])}, ${q(photos[0])}, ${q(p.community)}, ${q(PHOTOS.plans[0])}, ${q(PHOTOS.maps[0])},
        ${q(p.masterPlan)}, ${q(p.floorPlanDesc)}, ${q(p.locationMapDesc)},
        ${q(p.propertyType)}, ${n(p.bedrooms)}, ${n(p.bathrooms)}, ${n(p.area)}, ${n(p.yearBuilt)}, ${q(p.energyRating)}, ${q(p.orientation)},
        ${n(p.features.elevator)}, ${n(p.features.pool)}, ${n(p.features.garage)}, ${n(p.features.terrace)}, ${n(p.features.garden)}, ${n(p.features.pets)}, ${n(p.features.accessible)},
        ${n(p.exclusive)}, ${n(p.reserved)}, ${n(p.tour)}, ${n(p.rentalYield)}, ${n(aed(p.serviceCharge))}, ${agentRef(NEW_BUILDS.indexOf(p))},
        ${n(p.lat)}, ${n(p.lng)}, ${q(p.country)}, ${q(p.city)}, ${q(p.street)}, ${q(p.streetNumber)}, ${q(p.block)}, ${q(p.portal)}, ${q(p.floor)}, ${q(p.doorLetter)}, ${q(p.postalCode)}, ${q(p.district)},
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ', ${q(photos[1] || photos[0])}, ${q(photos[2] || photos[0])}, ${q(photos[0])}, ${q(photos[1] || photos[0])}, ${q(photos[2] || photos[0])},
        ${p.published ? q(NOW) : 'NULL'}, ${q(NOW)}, ${q(NOW)}
      );`,
    )
    const ref = `(SELECT id FROM developer_properties WHERE organization_id = ${orgId} AND slug = ${q(slug)} LIMIT 1)`
    photos.forEach((img, i) => {
      sql.push(`INSERT INTO images (developer_property_id, image, sort_order, created_at) VALUES (${ref}, ${q(img)}, ${i}, ${q(NOW)});`)
    })
    PHOTOS.plans.forEach((img, i) => {
      sql.push(
        `INSERT INTO floor_plans (developer_property_id, category, unit_type, floor_details, sizes, type, image, created_at) VALUES (${ref}, ${q(i === 0 ? 'Planta tipo' : 'Planta ático')}, ${q(p.units[0].unitType)}, ${q(i === 0 ? 'Distribución estándar' : 'Última planta con solárium')}, ${q(p.units[0].size)}, 'Plano acotado', ${q(img)}, ${q(NOW)});`,
      )
    })
    for (const u of p.units) {
      sql.push(`INSERT INTO property_types (developer_property_id, property_type, unit_type, size, created_at) VALUES (${ref}, ${q(u.propertyType)}, ${q(u.unitType)}, ${q(u.size)}, ${q(NOW)});`)
    }
    const socials = [
      { platform: 'instagram', url: 'https://instagram.com/demo', caption: 'Avance de obra' },
      { platform: 'youtube', url: 'https://youtube.com/@demo', caption: 'Tour virtual' },
    ]
    socials.forEach((s, i) => {
      sql.push(`INSERT INTO property_social_media (developer_property_id, platform, url, caption, sort_order, created_at) VALUES (${ref}, ${q(s.platform)}, ${q(s.url)}, ${q(s.caption)}, ${i}, ${q(NOW)});`)
    })
  }

  for (const p of RESALES) {
    const slug = SLUG_PREFIX + p.slug
    const photos = PHOTOS[p.photos]
    sql.push(
      `INSERT INTO agent_properties (
        organization_id, slug, location, property_type, transaction_type, price, price_old, area, bedrooms, bathrooms,
        main_image, status, year_built, key_highlights, orientation, energy_rating,
        has_elevator, has_pool, has_garage, has_terrace, has_garden, pets_allowed, accessible,
        is_exclusive, is_reserved, has_tour, rental_yield, service_charge_annual, agent_id,
        lat, lng, country, city, street, street_number, community, block, portal, floor, door_letter, postal_code, district,
        video_url, drone_photo, night_photo, before_photo, after_photo, ai_staged_photo, payment_plan,
        created_at, updated_at
      ) VALUES (
        ${orgId}, ${q(slug)}, ${q(`${p.district}, ${p.city}`)}, ${q(p.propertyType)}, ${q(p.transactionType)},
        ${n(p.transactionType === 'rent' ? aed(p.price) : aed(p.price))}, ${n(p.priceOld ? aed(p.priceOld) : null)},
        ${n(p.area)}, ${n(p.bedrooms)}, ${n(p.bathrooms)},
        ${q(photos[0])}, ${q(p.status)}, ${n(p.yearBuilt)}, ${q(p.highlights)}, ${q(p.orientation)}, ${q(p.energyRating)},
        ${n(p.features.elevator)}, ${n(p.features.pool)}, ${n(p.features.garage)}, ${n(p.features.terrace)}, ${n(p.features.garden)}, ${n(p.features.pets)}, ${n(p.features.accessible)},
        ${n(p.exclusive)}, ${n(p.reserved)}, ${n(p.tour)}, ${n(p.rentalYield)}, ${n(aed(p.serviceCharge))}, ${agentRef(RESALES.indexOf(p))},
        ${n(p.lat)}, ${n(p.lng)}, ${q(p.country)}, ${q(p.city)}, ${q(p.street)}, ${q(p.streetNumber)}, ${q(p.community)}, ${q(p.block)}, ${q(p.portal)}, ${q(p.floor)}, ${q(p.doorLetter)}, ${q(p.postalCode)}, ${q(p.district)},
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ', ${q(photos[1] || photos[0])}, ${q(photos[0])}, ${q(photos[0])}, ${q(photos[1] || photos[0])}, ${q(photos[1] || photos[0])},
        ${q(paymentPlan(10, 0, 90))}, ${q(NOW)}, ${q(NOW)}
      );`,
    )
    const ref = `(SELECT id FROM agent_properties WHERE organization_id = ${orgId} AND slug = ${q(slug)} LIMIT 1)`
    photos.forEach((img, i) => {
      sql.push(`INSERT INTO property_gallery_images (property_id, image, sort_order, created_at) VALUES (${ref}, ${q(img)}, ${i}, ${q(NOW)});`)
    })
    sql.push(
      `INSERT INTO agent_property_floor_plans (property_id, category, unit_type, floor_details, sizes, type, image, created_at) VALUES (${ref}, 'Plano de la vivienda', ${q(p.propertyType)}, 'Distribución actual', ${q(`${p.area} m²`)}, 'Plano acotado', ${q(PHOTOS.plans[1])}, ${q(NOW)});`,
    )
    sql.push(
      `INSERT INTO agent_property_social_media (property_id, platform, url, caption, sort_order, created_at) VALUES (${ref}, 'instagram', 'https://instagram.com/demo', 'Fotos del inmueble', 0, ${q(NOW)});`,
    )
    // La ficha de 2ª mano guarda título y descripción como traducciones.
    sql.push(`INSERT INTO property_translations (property_id, locale, title, description) VALUES (${ref}, 'es', ${q(p.title)}, ${q(p.description)});`)
    sql.push(`INSERT INTO property_translations (property_id, locale, title, description) VALUES (${ref}, 'en', ${q(p.title)}, ${q(p.description)});`)
  }
}

// ---------------------------------------------------------------------------
// Ejecución
// ---------------------------------------------------------------------------
const file = join(tmpdir(), `seed-demo-properties-${Date.now()}.sql`)
writeFileSync(file, sql.join('\n'), 'utf8')

function d1(args) {
  return execFileSync('npx', ['wrangler', 'd1', 'execute', DB_NAME, LOCATION, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

console.log(`\n=== Sembrando catálogo de demostración ===`)
console.log(`   organización: ${orgId}`)
console.log(`   destino: ${remote ? 'REMOTO (producción)' : 'local'}`)
console.log(`   modo: ${wipeOnly ? 'sólo limpieza' : `${NEW_BUILDS.length} obra nueva + ${RESALES.length} segunda mano`}\n`)

try {
  d1(['--file', file, '--yes'])
} catch (err) {
  const detail = [err.stderr, err.stdout].filter(Boolean).join('\n').trim()
  console.error(`\nError al ejecutar el SQL:\n${detail || err.message}`)
  process.exit(1)
} finally {
  try {
    unlinkSync(file)
  } catch {
    // El fichero temporal es desechable; que no se pueda borrar no es un fallo.
  }
}

// Comprobación: contar lo que ha quedado de verdad, no dar por hecho que fue bien.
try {
  const out = d1([
    '--json',
    '--command',
    `SELECT
       (SELECT count(*) FROM developer_properties WHERE organization_id = ${orgId} AND slug LIKE '${SLUG_PREFIX}%') AS obra_nueva,
       (SELECT count(*) FROM agent_properties WHERE organization_id = ${orgId} AND slug LIKE '${SLUG_PREFIX}%') AS segunda_mano,
       (SELECT count(*) FROM images WHERE developer_property_id IN (SELECT id FROM developer_properties WHERE organization_id = ${orgId} AND slug LIKE '${SLUG_PREFIX}%')) AS fotos_obra_nueva,
       (SELECT count(*) FROM property_gallery_images WHERE property_id IN (SELECT id FROM agent_properties WHERE organization_id = ${orgId} AND slug LIKE '${SLUG_PREFIX}%')) AS fotos_segunda_mano,
       (SELECT count(*) FROM property_types WHERE developer_property_id IN (SELECT id FROM developer_properties WHERE organization_id = ${orgId} AND slug LIKE '${SLUG_PREFIX}%')) AS tipos_de_unidad`,
  ])
  const rows = JSON.parse(out.slice(out.indexOf('[')))[0]?.results || []
  console.log('Resultado real en la base de datos:')
  for (const [k, v] of Object.entries(rows[0] || {})) console.log(`   ${k.replace(/_/g, ' ')}: ${v}`)
} catch (err) {
  console.log(`(no se pudo verificar el recuento: ${err.message})`)
}

console.log('')
