/**
 * Las 20 propiedades de la cuenta demo: 10 de obra nueva (las que publica la
 * web) y 10 de segunda mano. Todas ficticias; las calles son genéricas y sin
 * número, y la segunda mano se publica con ubicación aproximada.
 *
 * `gallery` son rutas dentro de public/demo-assets/norte-astur/ (fotos CC0 o de
 * dominio público, ver CREDITOS.md junto a las imágenes); las de asturias/ son
 * fotos del entorno, como en un anuncio real.
 * `days` es el día de captación respecto al anclaje (negativo = pasado).
 * `priceHistory` son los precios ANTERIORES, del más antiguo al más reciente:
 * la propiedad se capta con el primero y, en el día de cada entrada, ese
 * precio se sustituye por el siguiente (o por `price`, el actual) por el
 * motivo indicado.
 */

export type DemoPropertyKind = 'developer' | 'agent'

export interface DemoProperty {
  key: string
  kind: DemoPropertyKind
  title: string
  /** Fotos en orden (la primera es la portada); las de asturias/ son del entorno. */
  gallery: string[]
  commercial: string
  office: string
  team: string
  community?: string
  developer?: string
  propertyType: string
  subtype: string
  transactionType: 'sale' | 'rent'
  price: number
  priceHistory?: { price: number; days: number; reason: string }[]
  city: string
  district: string
  municipality: string
  postalCode: string
  street: string
  streetType: string
  lat: number
  lng: number
  privacy: 'exact' | 'approximate' | 'hidden_number'
  area: number
  usableArea: number
  plotArea?: number
  terraceArea?: number
  gardenArea?: number
  bedrooms: number
  bathrooms: number
  floor?: string
  yearBuilt: number
  renovationYear?: number
  condition: 'new' | 'excellent' | 'good' | 'to_renovate' | 'to_reform'
  energyRating: string
  orientation: string
  features: { elevator?: boolean; garage?: boolean; terrace?: boolean; garden?: boolean; pool?: boolean; pets?: boolean; accessible?: boolean }
  sheet: Record<string, unknown>
  legal: Record<string, unknown>
  description: string
  highlights: string[]
  days: number
  captureSource: string
  mandateType?: string
  exclusive?: { fromDays: number; untilDays: number }
  /** Estado comercial común: available | reserved | sold | rented | withdrawn | draft. */
  commercialStatus: string
  /** Obra nueva: fase de la obra (new | under_construction | ready). */
  buildStatus?: 'new' | 'under_construction' | 'ready'
  handover?: string
  owners?: { contact: string; role: 'owner' | 'co_owner' | 'attorney'; pct?: number; primary?: boolean }[]
  floorPlan?: boolean
  video?: boolean
  serviceChargeAnnual?: number
  rentalYield?: number
}

const ASTURIAS = { region: 'Principado de Asturias', province: 'Asturias' }

export const PROPERTIES: DemoProperty[] = [
  // ─── Obra nueva (catálogo de la web) ───────────────────────────────────────
  {
    key: 'p01', kind: 'developer', title: 'Obra nueva con terraza en Montecerrao', gallery: ['propiedades/p01-01.jpg', 'propiedades/p01-02.jpg', 'propiedades/p01-03.jpg', 'propiedades/p01-04.jpg', 'propiedades/p01-05.jpg', 'propiedades/p01-06.jpg'],
    commercial: 'com-lucia', office: 'o-oviedo', team: 't-oviedo', community: 'cm-montecerrao', developer: 'dev-cantabrico',
    propertyType: 'Apartment', subtype: 'flat', transactionType: 'sale', price: 289_000,
    priceHistory: [{ price: 299_000, days: -96, reason: 'Ajuste de lanzamiento de la segunda fase' }],
    city: 'Oviedo', district: 'Montecerrao', municipality: 'Oviedo', postalCode: '33006', street: 'Calle de Montecerrao', streetType: 'street',
    lat: 43.3486, lng: -5.8318, privacy: 'exact',
    area: 112, usableArea: 96, terraceArea: 18, bedrooms: 3, bathrooms: 2, floor: '4', yearBuilt: 2026, condition: 'new', energyRating: 'A', orientation: 'S',
    features: { elevator: true, garage: true, terrace: true, accessible: true, pets: true },
    sheet: { ...ASTURIAS, neighborhood: 'Montecerrao', kitchenType: 'open', hasBuiltInWardrobes: true, flooring: 'laminate', carpentry: 'aluminium_thermal_break', glazing: 'double', heating: 'radiant_floor', hotWater: 'heat_pump', hasAerothermal: true, hasUnderfloorHeating: true, hasFiber: true, hasCommunityGarden: true, hasPlayground: true, views: 'open', exteriorInterior: 'exterior', buildingFloors: 6, buildingUnits: 42, terracesCount: 1, storeroomsCount: 1, roomsTotal: 5 },
    legal: { communityFeeMonthly: 75, ibiAnnual: 420, commissionType: 'percentage', commissionValue: 3, commissionVatPct: 21, registryStatus: 'pending', energyConsumption: 28, emissionsRating: 'A' },
    description: 'Vivienda de tres dormitorios en la segunda fase del Residencial Montecerrao, con terraza de 18 m² orientada al sur. Cocina abierta al salón, dos baños completos, suelo radiante con aerotermia y plaza de garaje con trastero incluidos. Urbanización con zonas verdes y área infantil, a diez minutos del centro de Oviedo.',
    highlights: ['Terraza de 18 m² al sur', 'Aerotermia y suelo radiante', 'Garaje y trastero incluidos', 'Calificación energética A'],
    days: -150, captureSource: 'Promotora', mandateType: 'Comercialización en exclusiva', exclusive: { fromDays: -150, untilDays: 215 },
    commercialStatus: 'available', buildStatus: 'under_construction', handover: 'T2 2027', floorPlan: true, video: true, serviceChargeAnnual: 900,
  },
  {
    key: 'p02', kind: 'developer', title: 'Ático con terraza junto al Campo San Francisco', gallery: ['propiedades/p02-01.jpg', 'propiedades/p02-02.jpg', 'propiedades/p02-03.jpg', 'propiedades/p02-04.jpg', 'propiedades/p02-05.jpg', 'propiedades/p02-07.jpg', 'asturias/oviedo-03.jpg'],
    commercial: 'com-lucia', office: 'o-oviedo', team: 't-oviedo', developer: 'dev-cantabrico',
    propertyType: 'Penthouse', subtype: 'penthouse', transactionType: 'sale', price: 545_000,
    city: 'Oviedo', district: 'Centro', municipality: 'Oviedo', postalCode: '33003', street: 'Calle Uría', streetType: 'street',
    lat: 43.3622, lng: -5.8478, privacy: 'hidden_number',
    area: 128, usableArea: 110, terraceArea: 42, bedrooms: 3, bathrooms: 2, floor: '7', yearBuilt: 1962, renovationYear: 2026, condition: 'new', energyRating: 'B', orientation: 'SW',
    features: { elevator: true, garage: false, terrace: true, accessible: true },
    sheet: { ...ASTURIAS, neighborhood: 'Centro', kitchenType: 'independent', hasBuiltInWardrobes: true, flooring: 'parquet', carpentry: 'aluminium_thermal_break', glazing: 'acoustic', heating: 'heat_pump', hotWater: 'heat_pump', hasAirConditioning: true, hasHomeAutomation: true, hasFiber: true, hasConcierge: true, views: 'park', exteriorInterior: 'exterior', buildingFloors: 7, buildingUnits: 14, terracesCount: 1, roomsTotal: 5, isRenovated: true },
    legal: { communityFeeMonthly: 140, ibiAnnual: 980, commissionType: 'percentage', commissionValue: 3, commissionVatPct: 21, registryStatus: 'registered', energyConsumption: 55, emissionsRating: 'B' },
    description: 'Ático de 128 m² en un edificio rehabilitado por completo junto al Campo San Francisco, con una terraza de 42 m² y vistas al parque. Tres dormitorios, dos baños, cocina independiente equipada y climatización por bomba de calor. Portero físico y ascensor hasta la planta.',
    highlights: ['Terraza de 42 m² con vistas al parque', 'Rehabilitación integral 2026', 'Portero físico', 'A un paso de la calle Uría'],
    days: -120, captureSource: 'Promotora', mandateType: 'Comercialización en exclusiva', exclusive: { fromDays: -120, untilDays: 60 },
    commercialStatus: 'available', buildStatus: 'ready', handover: 'Inmediata', floorPlan: true, serviceChargeAnnual: 1680,
  },
  {
    key: 'p03', kind: 'developer', title: 'Piso de tres dormitorios con garaje en Jardines de Viesques', gallery: ['propiedades/p03-01.jpg', 'propiedades/p03-02.jpg', 'propiedades/p03-03.jpg', 'propiedades/p03-04.jpg', 'asturias/gijon-03.jpg'],
    commercial: 'com-alvaro', office: 'o-gijon', team: 't-gijon', community: 'cm-viesques', developer: 'dev-cantabrico',
    propertyType: 'Apartment', subtype: 'flat', transactionType: 'sale', price: 259_000,
    priceHistory: [{ price: 269_000, days: -110, reason: 'Revisión tras las primeras visitas' }, { price: 264_000, days: -45, reason: 'Ajuste para cerrar la primera fase' }],
    city: 'Gijón', district: 'Viesques', municipality: 'Gijón', postalCode: '33204', street: 'Avenida de Viesques', streetType: 'avenue',
    lat: 43.5297, lng: -5.6431, privacy: 'exact',
    area: 98, usableArea: 84, bedrooms: 3, bathrooms: 2, floor: '2', yearBuilt: 2026, condition: 'new', energyRating: 'A', orientation: 'E',
    features: { elevator: true, garage: true, accessible: true, pets: true },
    sheet: { ...ASTURIAS, neighborhood: 'Viesques', kitchenType: 'open', hasBuiltInWardrobes: true, flooring: 'laminate', carpentry: 'pvc', glazing: 'double', heating: 'radiant_floor', hotWater: 'heat_pump', hasAerothermal: true, hasFiber: true, hasCommunityPool: true, hasCommunityGarden: true, hasGym: true, views: 'park', exteriorInterior: 'exterior', buildingFloors: 5, buildingUnits: 36, balconiesCount: 1, roomsTotal: 5 },
    legal: { communityFeeMonthly: 85, ibiAnnual: 360, commissionType: 'percentage', commissionValue: 3, commissionVatPct: 21, registryStatus: 'pending', energyConsumption: 26, emissionsRating: 'A' },
    description: 'Piso de tres dormitorios y dos baños en Jardines de Viesques, junto al parque y a un paseo del campus. Cocina abierta, balcón, suelo radiante con aerotermia y plaza de garaje. La urbanización tiene piscina comunitaria, gimnasio y zonas verdes.',
    highlights: ['Piscina y gimnasio comunitarios', 'Garaje incluido', 'Junto al Parque de Viesques'],
    days: -140, captureSource: 'Promotora', mandateType: 'Comercialización compartida',
    commercialStatus: 'available', buildStatus: 'under_construction', handover: 'T4 2026', floorPlan: true, serviceChargeAnnual: 1020,
  },
  {
    key: 'p04', kind: 'developer', title: 'Mirador del Cantábrico: ático con vistas al mar en La Arena', gallery: ['propiedades/p05-01.jpg', 'propiedades/p05-02.jpg', 'propiedades/p05-03.jpg', 'propiedades/p05-04.jpg', 'propiedades/p05-05.jpg', 'propiedades/p05-06.jpg', 'asturias/gijon-02.jpg'],
    commercial: 'com-alvaro', office: 'o-gijon', team: 't-gijon', community: 'cm-mirador', developer: 'dev-cantabrico',
    propertyType: 'Penthouse', subtype: 'penthouse_duplex', transactionType: 'sale', price: 615_000,
    city: 'Gijón', district: 'La Arena', municipality: 'Gijón', postalCode: '33203', street: 'Calle Ezcurdia', streetType: 'street',
    lat: 43.5386, lng: -5.6553, privacy: 'hidden_number',
    area: 138, usableArea: 118, terraceArea: 35, bedrooms: 3, bathrooms: 3, floor: '8', yearBuilt: 2025, condition: 'new', energyRating: 'A', orientation: 'N',
    features: { elevator: true, garage: true, terrace: true, accessible: true },
    sheet: { ...ASTURIAS, neighborhood: 'La Arena', kitchenType: 'open', hasBuiltInWardrobes: true, flooring: 'parquet', carpentry: 'aluminium_thermal_break', glazing: 'low_emissive', heating: 'radiant_floor', hotWater: 'heat_pump', hasAerothermal: true, hasAirConditioning: true, hasHomeAutomation: true, hasFiber: true, views: 'sea', isBeachfront: true, exteriorInterior: 'exterior', buildingFloors: 8, buildingUnits: 24, terracesCount: 2, floorsCount: 2, roomsTotal: 6 },
    legal: { communityFeeMonthly: 160, ibiAnnual: 1150, commissionType: 'percentage', commissionValue: 3, commissionVatPct: 21, registryStatus: 'registered', energyConsumption: 24, emissionsRating: 'A' },
    description: 'Ático dúplex en primera línea de La Arena, con dos terrazas y vistas abiertas a la playa de San Lorenzo. Tres dormitorios en suite, salón de doble altura y cocina abierta de diseño. Domótica, aerotermia y dos plazas de garaje.',
    highlights: ['Vistas al mar desde las dos plantas', 'Dos terrazas (35 m²)', 'Dos plazas de garaje', 'Primera línea de playa'],
    days: -170, captureSource: 'Promotora', mandateType: 'Comercialización en exclusiva', exclusive: { fromDays: -170, untilDays: 12 },
    commercialStatus: 'available', buildStatus: 'ready', handover: 'Inmediata', floorPlan: true, video: true, serviceChargeAnnual: 1920,
  },
  {
    key: 'p05', kind: 'developer', title: 'Piso luminoso de obra nueva en La Magdalena, Avilés', gallery: ['propiedades/p06-01.jpg', 'propiedades/p06-02.jpg', 'propiedades/p06-03.jpg', 'propiedades/p06-04.jpg', 'asturias/aviles-01.jpg', 'asturias/aviles-02.jpg'],
    commercial: 'com-marta', office: 'o-gijon', team: 't-gijon', community: 'cm-magdalena', developer: 'dev-cantabrico',
    propertyType: 'Apartment', subtype: 'flat', transactionType: 'sale', price: 185_000,
    city: 'Avilés', district: 'La Magdalena', municipality: 'Avilés', postalCode: '33402', street: 'Calle de La Magdalena', streetType: 'street',
    lat: 43.5528, lng: -5.9262, privacy: 'exact',
    area: 78, usableArea: 66, bedrooms: 2, bathrooms: 1, floor: '3', yearBuilt: 2026, condition: 'new', energyRating: 'A', orientation: 'SE',
    features: { elevator: true, garage: true, accessible: true },
    sheet: { ...ASTURIAS, neighborhood: 'La Magdalena', kitchenType: 'independent', hasBuiltInWardrobes: true, flooring: 'laminate', carpentry: 'pvc', glazing: 'double', heating: 'heat_pump', hotWater: 'heat_pump', hasAerothermal: true, hasFiber: true, views: 'city', exteriorInterior: 'exterior', buildingFloors: 5, buildingUnits: 28, roomsTotal: 4 },
    legal: { communityFeeMonthly: 60, ibiAnnual: 290, commissionType: 'percentage', commissionValue: 3, commissionVatPct: 21, registryStatus: 'pending', energyConsumption: 30, emissionsRating: 'A' },
    description: 'Piso de dos dormitorios en el Residencial La Magdalena, a cinco minutos andando del casco histórico de Avilés. Muy luminoso, orientado al sureste, con cocina independiente, aerotermia y plaza de garaje opcional.',
    highlights: ['A 5 minutos del casco histórico', 'Aerotermia', 'Muy luminoso'],
    days: -95, captureSource: 'Promotora', mandateType: 'Comercialización compartida',
    commercialStatus: 'available', buildStatus: 'new', handover: 'T1 2028', floorPlan: true, serviceChargeAnnual: 720,
  },
  {
    key: 'p06', kind: 'developer', title: 'Costa de Llanes Residences: apartamento con jardín cerca de la playa de Poo', gallery: ['propiedades/p07-01.jpg', 'propiedades/p08-01.jpg', 'propiedades/p08-02.jpg', 'propiedades/p08-04.jpg', 'asturias/costa-03.jpg', 'asturias/llanes-01.jpg'],
    commercial: 'com-paula', office: 'o-oriente', team: 't-oriente', community: 'cm-llanes', developer: 'dev-sella',
    propertyType: 'Apartment', subtype: 'ground_floor_garden', transactionType: 'sale', price: 329_000,
    priceHistory: [{ price: 345_000, days: -60, reason: 'Ajuste de temporada' }],
    city: 'Llanes', district: 'Poo', municipality: 'Llanes', postalCode: '33509', street: 'Camino de la playa de Poo', streetType: 'way',
    lat: 43.4218, lng: -4.7884, privacy: 'exact',
    area: 76, usableArea: 64, gardenArea: 60, bedrooms: 2, bathrooms: 2, floor: 'Bajo', yearBuilt: 2026, condition: 'new', energyRating: 'A', orientation: 'S',
    features: { garden: true, garage: true, pets: true, accessible: true },
    sheet: { ...ASTURIAS, neighborhood: 'Poo', kitchenType: 'open', hasBuiltInWardrobes: true, flooring: 'tile', carpentry: 'aluminium_thermal_break', glazing: 'double', heating: 'heat_pump', hotWater: 'heat_pump', hasAerothermal: true, hasFiber: true, hasPrivateGarden: true, hasCommunityGarden: true, views: 'mountain', exteriorInterior: 'exterior', buildingFloors: 2, buildingUnits: 12, roomsTotal: 4 },
    legal: { communityFeeMonthly: 70, ibiAnnual: 340, commissionType: 'percentage', commissionValue: 3.5, commissionVatPct: 21, registryStatus: 'pending', energyConsumption: 27, emissionsRating: 'A' },
    description: 'Bajo con 60 m² de jardín privado en un pequeño residencial de doce viviendas, a diez minutos andando de la playa de Poo. Dos dormitorios, dos baños, cocina abierta y plaza de garaje. Ideal como primera o segunda residencia.',
    highlights: ['Jardín privado de 60 m²', 'A 10 minutos a pie de la playa', 'Solo 12 viviendas'],
    days: -160, captureSource: 'Promotora', mandateType: 'Comercialización en exclusiva', exclusive: { fromDays: -160, untilDays: 200 },
    commercialStatus: 'available', buildStatus: 'under_construction', handover: 'T3 2026', floorPlan: true, serviceChargeAnnual: 840,
  },
  {
    key: 'p07', kind: 'developer', title: 'Bajo con terraza junto a la playa de Santa Marina', gallery: ['propiedades/p02-06.jpg', 'propiedades/p08-03.jpg', 'propiedades/p08-05.jpg', 'propiedades/p08-06.jpg', 'asturias/ribadesella-01.jpg', 'asturias/ribadesella-02.jpg'],
    commercial: 'com-paula', office: 'o-oriente', team: 't-oriente', community: 'cm-santamarina', developer: 'dev-sella',
    propertyType: 'Apartment', subtype: 'ground_floor', transactionType: 'sale', price: 365_000,
    city: 'Ribadesella', district: 'Santa Marina', municipality: 'Ribadesella', postalCode: '33560', street: 'Calle de la playa de Santa Marina', streetType: 'street',
    lat: 43.4637, lng: -5.0651, privacy: 'exact',
    area: 92, usableArea: 78, terraceArea: 28, bedrooms: 2, bathrooms: 2, floor: 'Bajo', yearBuilt: 2025, condition: 'new', energyRating: 'B', orientation: 'W',
    features: { terrace: true, elevator: true, garage: true, accessible: true },
    sheet: { ...ASTURIAS, neighborhood: 'Santa Marina', kitchenType: 'open', hasBuiltInWardrobes: true, flooring: 'tile', carpentry: 'aluminium_thermal_break', glazing: 'double', heating: 'heat_pump', hotWater: 'heat_pump', hasFiber: true, views: 'sea', exteriorInterior: 'exterior', buildingFloors: 3, buildingUnits: 18, terracesCount: 1, roomsTotal: 4 },
    legal: { communityFeeMonthly: 95, ibiAnnual: 410, commissionType: 'percentage', commissionValue: 3.5, commissionVatPct: 21, registryStatus: 'registered', energyConsumption: 48, emissionsRating: 'B' },
    description: 'Bajo con una terraza de 28 m² a cincuenta metros de la playa de Santa Marina. Dos dormitorios, dos baños y salón-cocina con salida directa a la terraza. Edificio terminado, entrega inmediata.',
    highlights: ['A 50 m de la playa', 'Terraza de 28 m²', 'Entrega inmediata'],
    days: -130, captureSource: 'Promotora', mandateType: 'Comercialización compartida',
    commercialStatus: 'reserved', buildStatus: 'ready', handover: 'Inmediata', serviceChargeAnnual: 1140,
  },
  {
    key: 'p08', kind: 'developer', title: 'Casa de obra nueva con parcela en Amandi', gallery: ['propiedades/p09-01.jpg', 'propiedades/p09-02.jpg', 'propiedades/p04-02.jpg', 'propiedades/p04-05.jpg', 'asturias/rural-01.jpg'],
    commercial: 'com-javier', office: 'o-oriente', team: 't-oriente', community: 'cm-amandi', developer: 'dev-sella',
    propertyType: 'House', subtype: 'detached', transactionType: 'sale', price: 420_000,
    city: 'Villaviciosa', district: 'Amandi', municipality: 'Villaviciosa', postalCode: '33300', street: 'Camino de Amandi', streetType: 'way',
    lat: 43.4741, lng: -5.4287, privacy: 'exact',
    area: 165, usableArea: 142, plotArea: 820, gardenArea: 700, bedrooms: 4, bathrooms: 3, yearBuilt: 2026, condition: 'new', energyRating: 'A', orientation: 'S',
    features: { garden: true, garage: true, terrace: true, pets: true },
    sheet: { ...ASTURIAS, neighborhood: 'Amandi', kitchenType: 'office', hasBuiltInWardrobes: true, flooring: 'parquet', carpentry: 'aluminium_thermal_break', glazing: 'triple', heating: 'radiant_floor', hotWater: 'heat_pump', hasAerothermal: true, hasSolarPanels: true, hasUnderfloorHeating: true, hasFiber: true, hasPrivateGarden: true, hasPorch: true, views: 'mountain', exteriorInterior: 'exterior', floorsCount: 2, roomsTotal: 7 },
    legal: { communityFeeMonthly: 0, ibiAnnual: 620, commissionType: 'percentage', commissionValue: 3, commissionVatPct: 21, registryStatus: 'pending', energyConsumption: 18, emissionsRating: 'A' },
    description: 'Casa independiente de cuatro dormitorios sobre una parcela de 820 m² entre pomaradas, a tres kilómetros de Villaviciosa. Placas solares, aerotermia y suelo radiante. Porche, jardín y garaje para dos coches.',
    highlights: ['Parcela de 820 m²', 'Placas solares y aerotermia', 'A 3 km de Villaviciosa'],
    days: -175, captureSource: 'Promotora', mandateType: 'Comercialización en exclusiva', exclusive: { fromDays: -175, untilDays: 190 },
    commercialStatus: 'available', buildStatus: 'under_construction', handover: 'T4 2026', floorPlan: true,
  },
  {
    key: 'p09', kind: 'developer', title: 'Villas de Amandi: casa pareada con jardín', gallery: ['propiedades/p04-01.jpg', 'propiedades/p04-03.jpg', 'propiedades/p04-04.jpg', 'propiedades/p04-06.jpg', 'asturias/villaviciosa-01.jpg'],
    commercial: 'com-javier', office: 'o-oriente', team: 't-oriente', community: 'cm-amandi', developer: 'dev-sella',
    propertyType: 'House', subtype: 'semi_detached', transactionType: 'sale', price: 345_000,
    city: 'Villaviciosa', district: 'Amandi', municipality: 'Villaviciosa', postalCode: '33300', street: 'Camino de Amandi', streetType: 'way',
    lat: 43.4752, lng: -5.4301, privacy: 'exact',
    area: 148, usableArea: 126, plotArea: 410, gardenArea: 300, bedrooms: 3, bathrooms: 3, yearBuilt: 2026, condition: 'new', energyRating: 'A', orientation: 'SE',
    features: { garden: true, garage: true, terrace: true, pets: true },
    sheet: { ...ASTURIAS, neighborhood: 'Amandi', kitchenType: 'open', hasBuiltInWardrobes: true, flooring: 'laminate', carpentry: 'pvc', glazing: 'double', heating: 'radiant_floor', hotWater: 'heat_pump', hasAerothermal: true, hasFiber: true, hasPrivateGarden: true, hasPorch: true, views: 'mountain', exteriorInterior: 'exterior', floorsCount: 2, roomsTotal: 6 },
    legal: { communityFeeMonthly: 0, ibiAnnual: 520, commissionType: 'percentage', commissionValue: 3, commissionVatPct: 21, registryStatus: 'pending', energyConsumption: 22, emissionsRating: 'A' },
    description: 'Casa pareada de tres dormitorios con jardín de 300 m² en Villas de Amandi. Planta baja abierta al jardín, tres dormitorios arriba con el principal en suite y garaje. Entorno tranquilo de pomaradas.',
    highlights: ['Jardín de 300 m²', 'Dormitorio principal en suite', 'Entorno rural tranquilo'],
    days: -175, captureSource: 'Promotora', mandateType: 'Comercialización en exclusiva', exclusive: { fromDays: -175, untilDays: 190 },
    commercialStatus: 'reserved', buildStatus: 'under_construction', handover: 'T4 2026', floorPlan: true,
  },
  {
    key: 'p10', kind: 'developer', title: 'Villa de diseño frente al mar en Celorio', gallery: ['propiedades/p10-01.jpg', 'propiedades/p10-02.jpg', 'propiedades/p10-03.jpg', 'propiedades/p10-04.jpg', 'propiedades/p10-05.jpg', 'asturias/costa-01.jpg'],
    commercial: 'com-paula', office: 'o-oriente', team: 't-oriente', community: 'cm-llanes', developer: 'dev-sella',
    propertyType: 'Villa', subtype: 'detached_villa', transactionType: 'sale', price: 890_000,
    priceHistory: [{ price: 950_000, days: -140, reason: 'Revisión tras la presentación comercial' }, { price: 920_000, days: -70, reason: 'Revisión tras la temporada de verano' }],
    city: 'Llanes', district: 'Celorio', municipality: 'Llanes', postalCode: '33595', street: 'Camino de Celorio', streetType: 'way',
    lat: 43.4268, lng: -4.8169, privacy: 'approximate',
    area: 285, usableArea: 240, plotArea: 1450, gardenArea: 1100, terraceArea: 60, bedrooms: 5, bathrooms: 4, yearBuilt: 2025, condition: 'new', energyRating: 'A', orientation: 'N',
    features: { garden: true, garage: true, terrace: true, pool: true, pets: true },
    sheet: { ...ASTURIAS, neighborhood: 'Celorio', kitchenType: 'open', hasBuiltInWardrobes: true, flooring: 'microcement', carpentry: 'aluminium_thermal_break', glazing: 'triple', heating: 'radiant_floor', hotWater: 'heat_pump', hasAerothermal: true, hasSolarPanels: true, hasHomeAutomation: true, hasAlarm: true, hasFiber: true, hasPrivatePool: true, hasPrivateGarden: true, hasPorch: true, views: 'sea', exteriorInterior: 'exterior', floorsCount: 2, roomsTotal: 9 },
    legal: { communityFeeMonthly: 0, ibiAnnual: 1850, commissionType: 'percentage', commissionValue: 4, commissionVatPct: 21, registryStatus: 'registered', energyConsumption: 21, emissionsRating: 'A' },
    description: 'Villa contemporánea de 285 m² sobre una parcela de 1.450 m² con vistas al Cantábrico, a cinco minutos de las playas de Celorio. Cinco dormitorios, salón con ventanales de suelo a techo, piscina privada y domótica completa.',
    highlights: ['Vistas al mar', 'Piscina privada', 'Parcela de 1.450 m²', 'Domótica y aerotermia'],
    days: -165, captureSource: 'Promotora', mandateType: 'Comercialización en exclusiva', exclusive: { fromDays: -165, untilDays: 200 },
    commercialStatus: 'available', buildStatus: 'ready', handover: 'Inmediata', floorPlan: true, video: true,
  },

  // ─── Segunda mano ─────────────────────────────────────────────────────────
  {
    key: 'p11', kind: 'agent', title: 'Vivienda familiar reformada en La Florida', gallery: ['propiedades/p11-01.jpg', 'propiedades/p11-02.jpg', 'propiedades/p11-03.jpg', 'asturias/oviedo-01.jpg'],
    commercial: 'com-lucia', office: 'o-oviedo', team: 't-oviedo',
    propertyType: 'Apartment', subtype: 'flat', transactionType: 'sale', price: 265_000,
    priceHistory: [{ price: 279_000, days: -75, reason: 'Ajuste acordado con la propiedad' }],
    city: 'Oviedo', district: 'La Florida', municipality: 'Oviedo', postalCode: '33012', street: 'Calle de La Florida', streetType: 'street',
    lat: 43.3586, lng: -5.8709, privacy: 'approximate',
    area: 115, usableArea: 98, bedrooms: 3, bathrooms: 2, floor: '3', yearBuilt: 2004, renovationYear: 2023, condition: 'excellent', energyRating: 'C', orientation: 'S',
    features: { elevator: true, garage: true, terrace: true, accessible: true },
    sheet: { ...ASTURIAS, neighborhood: 'La Florida', kitchenType: 'independent', hasBuiltInWardrobes: true, flooring: 'parquet', carpentry: 'aluminium_thermal_break', glazing: 'double', heating: 'individual_gas', hotWater: 'gas', hasFiber: true, views: 'open', exteriorInterior: 'exterior', isRenovated: true, buildingFloors: 6, roomsTotal: 5, terracesCount: 1 },
    legal: { communityFeeMonthly: 65, ibiAnnual: 480, commissionType: 'percentage', commissionValue: 3, commissionVatPct: 21, registryStatus: 'registered', mortgageStatus: 'none', occupancyStatus: 'owner_occupied', iteStatus: 'not_required', energyConsumption: 112, emissionsRating: 'C' },
    description: 'Piso de tres dormitorios reformado en 2023 en La Florida, con terraza, garaje y trastero. Cocina independiente equipada, dos baños completos y salón muy luminoso orientado al sur. Zona tranquila con colegios y parque a la vuelta de la esquina.',
    highlights: ['Reformado en 2023', 'Terraza y garaje', 'Junto a colegios y parque'],
    days: -110, captureSource: 'Captación directa', mandateType: 'Encargo de venta en exclusiva', exclusive: { fromDays: -110, untilDays: 70 },
    commercialStatus: 'available', owners: [{ contact: 'c30', role: 'owner', pct: 50, primary: true }, { contact: 'c31', role: 'co_owner', pct: 50 }], floorPlan: true,
  },
  {
    key: 'p12', kind: 'agent', title: 'Piso para reformar en el centro de Oviedo', gallery: ['propiedades/p12-01.jpg', 'propiedades/p12-02.jpg', 'propiedades/p12-03.jpg', 'propiedades/p12-04.jpg', 'propiedades/p12-05.jpg', 'propiedades/p12-06.jpg'],
    commercial: 'com-diego', office: 'o-oviedo', team: 't-oviedo',
    propertyType: 'Apartment', subtype: 'flat', transactionType: 'sale', price: 179_000,
    city: 'Oviedo', district: 'Centro', municipality: 'Oviedo', postalCode: '33001', street: 'Calle Mon', streetType: 'street',
    lat: 43.3608, lng: -5.8433, privacy: 'approximate',
    area: 98, usableArea: 84, bedrooms: 3, bathrooms: 1, floor: '2', yearBuilt: 1958, condition: 'to_reform', energyRating: 'F', orientation: 'E',
    features: { elevator: false },
    sheet: { ...ASTURIAS, neighborhood: 'Casco Antiguo', kitchenType: 'independent', flooring: 'terrazzo', carpentry: 'wood', glazing: 'single', heating: 'electric', hotWater: 'electric', views: 'street', exteriorInterior: 'exterior', buildingFloors: 4, roomsTotal: 5, ceilingHeight: 3.1 },
    legal: { communityFeeMonthly: 40, ibiAnnual: 390, commissionType: 'percentage', commissionValue: 3, commissionVatPct: 21, registryStatus: 'registered', mortgageStatus: 'none', occupancyStatus: 'vacant', iteStatus: 'passed', energyConsumption: 245, emissionsRating: 'F' },
    description: 'Piso de 98 m² para reformar en pleno casco antiguo de Oviedo, con techos de más de tres metros y balcones a la calle. Tres dormitorios y amplias posibilidades de redistribución. Muy interesante como inversión o para hacer a medida.',
    highlights: ['Techos de 3,1 m', 'Balcones a la calle', 'Ideal inversión o reforma a medida'],
    days: -85, captureSource: 'Referido', mandateType: 'Encargo de venta sin exclusiva',
    commercialStatus: 'reserved', owners: [{ contact: 'c32', role: 'owner', primary: true }, { contact: 'c33', role: 'attorney' }],
  },
  {
    key: 'p13', kind: 'agent', title: 'Vivienda familiar reformada en Viesques', gallery: ['propiedades/p13-01.jpg', 'propiedades/p13-02.jpg', 'propiedades/p13-03.jpg', 'asturias/gijon-01.jpg'],
    commercial: 'com-alvaro', office: 'o-gijon', team: 't-gijon',
    propertyType: 'Apartment', subtype: 'flat', transactionType: 'sale', price: 255_000,
    priceHistory: [{ price: 265_000, days: -80, reason: 'Ajuste tras las primeras visitas' }, { price: 259_000, days: -40, reason: 'Ajuste acordado con la propiedad' }],
    city: 'Gijón', district: 'Viesques', municipality: 'Gijón', postalCode: '33204', street: 'Calle de Viesques', streetType: 'street',
    lat: 43.5312, lng: -5.6448, privacy: 'approximate',
    area: 104, usableArea: 90, bedrooms: 3, bathrooms: 2, floor: '5', yearBuilt: 1998, renovationYear: 2021, condition: 'excellent', energyRating: 'D', orientation: 'SW',
    features: { elevator: true, garage: true, accessible: true },
    sheet: { ...ASTURIAS, neighborhood: 'Viesques', kitchenType: 'independent', hasBuiltInWardrobes: true, flooring: 'parquet', carpentry: 'pvc', glazing: 'double', heating: 'individual_gas', hotWater: 'gas', hasFiber: true, hasBalcony: true, views: 'park', exteriorInterior: 'exterior', isRenovated: true, buildingFloors: 7, roomsTotal: 5, balconiesCount: 1 },
    legal: { communityFeeMonthly: 70, ibiAnnual: 455, commissionType: 'percentage', commissionValue: 3, commissionVatPct: 21, registryStatus: 'registered', mortgageStatus: 'mortgaged', occupancyStatus: 'owner_occupied', iteStatus: 'not_required', energyConsumption: 135, emissionsRating: 'D' },
    description: 'Piso familiar de tres dormitorios reformado en Viesques, con balcón al parque, dos baños y garaje. Distribución muy aprovechada y armarios empotrados en todos los dormitorios. A cinco minutos del campus y de la playa de San Lorenzo en bici.',
    highlights: ['Reformado en 2021', 'Balcón con vistas al parque', 'Garaje incluido'],
    days: -95, captureSource: 'Portal Web', mandateType: 'Encargo de venta en exclusiva', exclusive: { fromDays: -95, untilDays: 85 },
    commercialStatus: 'reserved', owners: [{ contact: 'c34', role: 'owner', primary: true }],
  },
  {
    key: 'p14', kind: 'agent', title: 'Chalet independiente con jardín en Somió', gallery: ['propiedades/p14-01.jpg', 'propiedades/p14-02.jpg', 'propiedades/p14-03.jpg', 'propiedades/p14-04.jpg', 'propiedades/p14-05.jpg', 'propiedades/p14-06.jpg', 'propiedades/p14-07.jpg', 'propiedades/p14-08.jpg'],
    commercial: 'com-alvaro', office: 'o-gijon', team: 't-gijon',
    propertyType: 'Villa', subtype: 'detached_villa', transactionType: 'sale', price: 890_000,
    city: 'Gijón', district: 'Somió', municipality: 'Gijón', postalCode: '33203', street: 'Camino de Somió', streetType: 'way',
    lat: 43.5402, lng: -5.6198, privacy: 'approximate',
    area: 290, usableArea: 248, plotArea: 1250, gardenArea: 1000, bedrooms: 5, bathrooms: 4, yearBuilt: 1985, renovationYear: 2019, condition: 'good', energyRating: 'D', orientation: 'S',
    features: { garden: true, garage: true, terrace: true, pets: true },
    sheet: { ...ASTURIAS, neighborhood: 'Somió', kitchenType: 'office', hasBuiltInWardrobes: true, flooring: 'parquet', carpentry: 'wood', glazing: 'double', heating: 'diesel', hotWater: 'gas', hasFireplace: true, hasAlarm: true, hasFiber: true, hasPrivateGarden: true, hasPorch: true, views: 'open', exteriorInterior: 'exterior', floorsCount: 3, roomsTotal: 9, studiesCount: 1 },
    legal: { communityFeeMonthly: 0, ibiAnnual: 2100, commissionType: 'percentage', commissionValue: 3, commissionVatPct: 21, registryStatus: 'registered', mortgageStatus: 'none', occupancyStatus: 'owner_occupied', energyConsumption: 165, emissionsRating: 'D' },
    description: 'Chalet independiente de cinco dormitorios en una parcela de 1.250 m² en Somió, la zona residencial más tranquila de Gijón. Salón con chimenea, cocina con office, despacho y un jardín maduro con porche. A diez minutos de la playa.',
    highlights: ['Parcela de 1.250 m²', 'Salón con chimenea', 'Somió, a 10 minutos de la playa'],
    days: -130, captureSource: 'Referido', mandateType: 'Encargo de venta en exclusiva', exclusive: { fromDays: -130, untilDays: 50 },
    commercialStatus: 'available', owners: [{ contact: 'c35', role: 'owner', pct: 50, primary: true }, { contact: 'c36', role: 'co_owner', pct: 50 }], floorPlan: true,
  },
  {
    key: 'p15', kind: 'agent', title: 'Piso luminoso en el centro de Avilés', gallery: ['propiedades/p15-01.jpg', 'propiedades/p15-02.jpg', 'propiedades/p15-03.jpg', 'propiedades/p15-04.jpg'],
    commercial: 'com-marta', office: 'o-gijon', team: 't-gijon',
    propertyType: 'Apartment', subtype: 'flat', transactionType: 'sale', price: 149_000,
    priceHistory: [{ price: 155_000, days: -150, reason: 'Ajuste acordado con la propiedad' }],
    city: 'Avilés', district: 'Centro', municipality: 'Avilés', postalCode: '33401', street: 'Calle de La Cámara', streetType: 'street',
    lat: 43.5561, lng: -5.9239, privacy: 'approximate',
    area: 92, usableArea: 78, bedrooms: 3, bathrooms: 1, floor: '4', yearBuilt: 1975, renovationYear: 2018, condition: 'good', energyRating: 'E', orientation: 'S',
    features: { elevator: true },
    sheet: { ...ASTURIAS, neighborhood: 'Centro', kitchenType: 'independent', flooring: 'parquet', carpentry: 'aluminium', glazing: 'double', heating: 'individual_gas', hotWater: 'gas', hasFiber: true, views: 'city', exteriorInterior: 'exterior', buildingFloors: 6, roomsTotal: 5 },
    legal: { communityFeeMonthly: 45, ibiAnnual: 310, commissionType: 'percentage', commissionValue: 3, commissionVatPct: 21, registryStatus: 'registered', mortgageStatus: 'none', occupancyStatus: 'vacant', iteStatus: 'passed', energyConsumption: 180, emissionsRating: 'E' },
    description: 'Piso de tres dormitorios muy luminoso en el centro de Avilés, a dos calles del parque de Ferrera. Cocina independiente y baño reformados, calefacción individual de gas y ascensor.',
    highlights: ['Muy luminoso', 'Junto al parque de Ferrera', 'Para entrar a vivir'],
    days: -165, captureSource: 'Oficina', mandateType: 'Encargo de venta sin exclusiva',
    commercialStatus: 'sold', owners: [{ contact: 'c37', role: 'owner', primary: true }],
  },
  {
    key: 'p16', kind: 'agent', title: 'Dúplex con vistas al puerto de Luanco', gallery: ['propiedades/p16-02.jpg', 'propiedades/p16-01.jpg', 'asturias/candas-02.jpg'],
    commercial: 'com-marta', office: 'o-gijon', team: 't-gijon',
    propertyType: 'Duplex', subtype: 'duplex', transactionType: 'sale', price: 239_000,
    city: 'Luanco', district: 'Puerto', municipality: 'Gozón', postalCode: '33440', street: 'Calle del Puerto', streetType: 'street',
    lat: 43.6147, lng: -5.7928, privacy: 'approximate',
    area: 118, usableArea: 101, terraceArea: 14, bedrooms: 3, bathrooms: 2, floor: '2-3', yearBuilt: 1992, renovationYear: 2017, condition: 'good', energyRating: 'D', orientation: 'NE',
    features: { terrace: true, pets: true },
    sheet: { ...ASTURIAS, neighborhood: 'Puerto', kitchenType: 'open', hasBuiltInWardrobes: true, flooring: 'parquet', carpentry: 'pvc', glazing: 'double', heating: 'electric', hotWater: 'electric', hasFiber: true, views: 'sea', exteriorInterior: 'exterior', floorsCount: 2, roomsTotal: 5, terracesCount: 1 },
    legal: { communityFeeMonthly: 35, ibiAnnual: 340, commissionType: 'percentage', commissionValue: 3, commissionVatPct: 21, registryStatus: 'registered', mortgageStatus: 'none', occupancyStatus: 'owner_occupied', energyConsumption: 140, emissionsRating: 'D' },
    description: 'Dúplex de tres dormitorios con vistas al puerto pesquero de Luanco. Salón-cocina abierto en la planta baja y dormitorios arriba, con una terraza desde la que se ve entrar a los barcos. A dos minutos de la playa de La Ribera.',
    highlights: ['Vistas al puerto', 'Terraza de 14 m²', 'A 2 minutos de la playa'],
    days: -100, captureSource: 'Idealista', mandateType: 'Encargo de venta sin exclusiva',
    commercialStatus: 'available', owners: [{ contact: 'c38', role: 'owner', primary: true }],
  },
  {
    key: 'p17', kind: 'agent', title: 'Ático con terraza y vistas al mar en Candás', gallery: ['propiedades/p17-01.jpg', 'propiedades/p17-02.jpg', 'propiedades/p17-03.jpg', 'asturias/candas-01.jpg'],
    commercial: 'com-marta', office: 'o-gijon', team: 't-gijon',
    propertyType: 'Penthouse', subtype: 'penthouse', transactionType: 'sale', price: 215_000,
    city: 'Candás', district: 'Centro', municipality: 'Carreño', postalCode: '33430', street: 'Calle del Muelle', streetType: 'street',
    lat: 43.5893, lng: -5.7614, privacy: 'approximate',
    area: 85, usableArea: 72, terraceArea: 30, bedrooms: 2, bathrooms: 1, floor: '5', yearBuilt: 2001, condition: 'good', energyRating: 'D', orientation: 'N',
    features: { terrace: true, elevator: true },
    sheet: { ...ASTURIAS, neighborhood: 'Centro', kitchenType: 'independent', flooring: 'tile', carpentry: 'aluminium', glazing: 'double', heating: 'electric', hotWater: 'electric', views: 'sea', exteriorInterior: 'exterior', buildingFloors: 5, roomsTotal: 4, terracesCount: 1 },
    legal: { communityFeeMonthly: 50, ibiAnnual: 300, commissionType: 'percentage', commissionValue: 3, commissionVatPct: 21, registryStatus: 'registered', mortgageStatus: 'none', occupancyStatus: 'vacant', energyConsumption: 150, emissionsRating: 'D' },
    description: 'Ático de dos dormitorios con 30 m² de terraza y vistas al mar en el centro de Candás. Edificio con ascensor, a un minuto del puerto y de la playa. Perfecto como segunda residencia o para alquiler de temporada.',
    highlights: ['Terraza de 30 m² con vistas al mar', 'Junto al puerto', 'Ideal segunda residencia'],
    days: -55, captureSource: 'Fotocasa', mandateType: 'Encargo de venta sin exclusiva',
    commercialStatus: 'available', owners: [{ contact: 'c39', role: 'owner', primary: true }],
  },
  {
    key: 'p18', kind: 'agent', title: 'Apartamento amueblado en alquiler en Pola de Siero', gallery: ['propiedades/p18-01.jpg', 'propiedades/p18-02.jpg', 'propiedades/p18-03.jpg', 'propiedades/p18-04.jpg', 'propiedades/p18-05.jpg', 'propiedades/p18-06.jpg', 'propiedades/p18-07.jpg', 'asturias/pola-de-siero-01.jpg'],
    commercial: 'com-diego', office: 'o-oviedo', team: 't-oviedo',
    propertyType: 'Apartment', subtype: 'apartment', transactionType: 'rent', price: 690,
    city: 'Pola de Siero', district: 'Centro', municipality: 'Siero', postalCode: '33510', street: 'Calle Valeriano León', streetType: 'street',
    lat: 43.3919, lng: -5.6624, privacy: 'approximate',
    area: 68, usableArea: 58, bedrooms: 2, bathrooms: 1, floor: '1', yearBuilt: 2008, condition: 'excellent', energyRating: 'C', orientation: 'W',
    features: { elevator: true, garage: true, pets: false },
    sheet: { ...ASTURIAS, neighborhood: 'Centro', kitchenType: 'open', hasBuiltInWardrobes: true, flooring: 'laminate', carpentry: 'pvc', glazing: 'double', heating: 'individual_gas', hotWater: 'gas', hasFiber: true, views: 'street', exteriorInterior: 'exterior', buildingFloors: 4, roomsTotal: 3 },
    legal: { rentDeposit: 690, rentGuarantee: 1380, rentExpensesIncluded: false, communityFeeMonthly: 0, commissionType: 'fixed', commissionValue: 690, commissionVatPct: 21, registryStatus: 'registered', occupancyStatus: 'rented', energyConsumption: 98, emissionsRating: 'C' },
    description: 'Apartamento de dos dormitorios amueblado y equipado en el centro de Pola de Siero, con plaza de garaje. Cocina americana, calefacción de gas y armarios empotrados. A 15 minutos de Oviedo y de Gijón.',
    highlights: ['Amueblado y equipado', 'Garaje incluido', 'A 15 minutos de Oviedo y Gijón'],
    days: -70, captureSource: 'Captación directa', mandateType: 'Gestión de alquiler',
    commercialStatus: 'rented', owners: [{ contact: 'c40', role: 'owner', primary: true }], rentalYield: 5.6,
  },
  {
    key: 'p19', kind: 'agent', title: 'Casa asturiana de piedra rehabilitada cerca de Llanes', gallery: ['propiedades/p19-01.jpg', 'propiedades/p19-02.jpg', 'propiedades/p19-03.jpg', 'propiedades/p19-04.jpg', 'propiedades/p19-05.jpg', 'propiedades/p19-06.jpg', 'asturias/picos-de-europa-01.jpg'],
    commercial: 'com-paula', office: 'o-oriente', team: 't-oriente',
    propertyType: 'House', subtype: 'village_house', transactionType: 'sale', price: 465_000,
    city: 'Llanes', district: 'Posada', municipality: 'Llanes', postalCode: '33594', street: 'Barrio de Posada', streetType: 'other',
    lat: 43.4249, lng: -4.8545, privacy: 'approximate',
    area: 220, usableArea: 185, plotArea: 900, gardenArea: 750, bedrooms: 4, bathrooms: 3, yearBuilt: 1890, renovationYear: 2020, condition: 'excellent', energyRating: 'C', orientation: 'S',
    features: { garden: true, garage: true, pets: true },
    sheet: { ...ASTURIAS, neighborhood: 'Posada', kitchenType: 'office', hasBuiltInWardrobes: true, flooring: 'parquet', facade: 'stone', structure: 'load_bearing', carpentry: 'wood', glazing: 'double', heating: 'biomass', hotWater: 'solar', hasFireplace: true, hasFiber: true, hasPrivateGarden: true, hasPorch: true, views: 'mountain', exteriorInterior: 'exterior', floorsCount: 2, roomsTotal: 7, isRenovated: true },
    legal: { communityFeeMonthly: 0, ibiAnnual: 760, commissionType: 'percentage', commissionValue: 4, commissionVatPct: 21, registryStatus: 'registered', mortgageStatus: 'none', occupancyStatus: 'vacant', energyConsumption: 95, emissionsRating: 'C' },
    description: 'Casa tradicional asturiana de piedra, rehabilitada con mimo en 2020, sobre una finca de 900 m² con vistas a la sierra del Cuera. Cuatro dormitorios, vigas de madera vistas, cocina de leña y caldera de biomasa. A diez minutos de Llanes y de sus playas.',
    highlights: ['Piedra y madera originales', 'Finca de 900 m²', 'Vistas a la sierra del Cuera', 'A 10 minutos de las playas'],
    days: -125, captureSource: 'Referido', mandateType: 'Encargo de venta en exclusiva', exclusive: { fromDays: -125, untilDays: 55 },
    commercialStatus: 'available', owners: [{ contact: 'c41', role: 'owner', primary: true }], floorPlan: true, video: true,
  },
  {
    key: 'p20', kind: 'agent', title: 'Casa asturiana rehabilitada cerca de Villaviciosa', gallery: ['propiedades/p20-01.jpg', 'propiedades/p20-02.jpg', 'propiedades/p20-03.jpg', 'propiedades/p20-04.jpg', 'asturias/rural-03.jpg'],
    commercial: 'com-javier', office: 'o-oriente', team: 't-oriente',
    propertyType: 'House', subtype: 'detached', transactionType: 'sale', price: 349_000,
    priceHistory: [{ price: 375_000, days: -172, reason: 'Ajuste tras la valoración' }, { price: 359_000, days: -150, reason: 'Ajuste acordado con la propiedad' }],
    city: 'Villaviciosa', district: 'Selorio', municipality: 'Villaviciosa', postalCode: '33316', street: 'Barrio de Selorio', streetType: 'other',
    lat: 43.5003, lng: -5.3765, privacy: 'approximate',
    area: 180, usableArea: 152, plotArea: 1100, gardenArea: 950, bedrooms: 3, bathrooms: 2, yearBuilt: 1920, renovationYear: 2016, condition: 'good', energyRating: 'D', orientation: 'SE',
    features: { garden: true, pets: true },
    sheet: { ...ASTURIAS, neighborhood: 'Selorio', kitchenType: 'independent', flooring: 'parquet', facade: 'stone', structure: 'load_bearing', carpentry: 'wood', glazing: 'double', heating: 'diesel', hotWater: 'other', hasFireplace: true, hasPrivateGarden: true, hasPorch: true, views: 'mountain', exteriorInterior: 'exterior', floorsCount: 2, roomsTotal: 6 },
    legal: { communityFeeMonthly: 0, ibiAnnual: 540, commissionType: 'percentage', commissionValue: 3.5, commissionVatPct: 21, registryStatus: 'registered', mortgageStatus: 'none', occupancyStatus: 'vacant', energyConsumption: 170, emissionsRating: 'D' },
    description: 'Casa rural rehabilitada con hórreo propio en Selorio, a diez minutos de Villaviciosa y de la playa de Rodiles. Tres dormitorios, salón con chimenea y una finca de 1.100 m² con frutales.',
    highlights: ['Hórreo propio', 'Finca de 1.100 m² con frutales', 'A 10 minutos de Rodiles'],
    days: -178, captureSource: 'Captación directa', mandateType: 'Encargo de venta en exclusiva', exclusive: { fromDays: -178, untilDays: 2 },
    commercialStatus: 'sold', owners: [{ contact: 'c42', role: 'owner', pct: 50, primary: true }, { contact: 'c43', role: 'co_owner', pct: 50 }],
  },
]
