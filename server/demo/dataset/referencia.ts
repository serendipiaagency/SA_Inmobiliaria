import type { MediaRoom } from '../../../utils/mediaRooms'
import { PROPERTIES, type DemoProperty } from './properties'

/**
 * El contenido de las cuatro propiedades de referencia de la cuenta demo
 * (server/demo/reference.ts): lo que se añade a lo que ya trae
 * `dataset/properties.ts` para que cada ficha sea un ejemplo de cómo debe
 * quedar un inmueble documentado en INMO —ficha ampliada completa, estancias,
 * fotos clasificadas, planos, documentos y descripción comercial—.
 *
 * Todo es ficticio y está dicho: los identificadores registrales y catastrales
 * llevan «DEMO» (nada que pueda ser de un inmueble real), los datos
 * energéticos no tienen número de registro y los documentos son de
 * demostración, sin validez legal. Los campos que no corresponden a la
 * tipología (la piscina comunitaria de un chalet, el ascensor de una casa de
 * piedra) no se rellenan con valores falsos: se declaran en `notApplicable`
 * con su motivo, que es lo que la comprobación de completitud
 * (server/demo/completeness.ts) entiende como «no aplica», distinto de
 * «pendiente».
 *
 * Lo lee también el script que dibuja los planos (scripts/demo-planos.ts), así
 * que los planos salen de las mismas estancias que enseña la ficha.
 */

export interface ReferenceRoom {
  type: string
  name: string
  area: number
  floor: string
  orientation?: string
  notes?: string
}

export interface ReferencePhoto {
  /** Ruta dentro de public/demo-assets/norte-astur/ (la misma de `properties.ts`). */
  path: string
  /** Estancia del catálogo canónico (utils/mediaRooms.ts). Sólo si se puede decir con certeza mirando la foto. */
  room: MediaRoom | null
  alt: string
  title: string
  description: string
}

export interface ReferencePlan {
  /** Fichero PNG de public/demo-assets/norte-astur/planos/ (lo dibuja scripts/demo-planos.ts a partir de `rooms`). */
  file: string
  title: string
  category: string
  unitType: string
  floorDetails: string
  sizes: string
  type: string
  /** Qué planta(s) dibuja: las de `rooms` con ese `floor`. */
  floors: string[]
}

export interface ReferenceDocument {
  docType: string
  title: string
  visibility: 'public' | 'internal' | 'owner' | 'authorized_buyer'
  /** Días respecto al de captación de la propiedad. */
  issuedDays: number
  notes: string
  /** Cuerpo del PDF: secciones con sus líneas. El rótulo «DOCUMENTO DE DEMOSTRACIÓN — SIN VALIDEZ LEGAL» lo pone el generador. */
  sections: { heading: string; lines: string[] }[]
}

export interface ReferenceContent {
  key: string
  /** Columnas, ficha ampliada y datos legales y económicos que se completan (se guardan por el mismo camino que el editor). */
  fields: Record<string, unknown>
  /** Puntos clave (uno por línea). */
  highlights: string[]
  /** Descripción comercial: HTML en obra nueva, texto con párrafos en 2ª mano. */
  description: string
  rooms: ReferenceRoom[]
  photos: ReferencePhoto[]
  plans: ReferencePlan[]
  documents: ReferenceDocument[]
  tags: string[]
  customFields: Record<string, string>
  /** Obra nueva: tipologías de la promoción («Tipos de unidad»). */
  unitTypes?: { propertyType: string; unitType: string; size: string }[]
  /** Campo del editor → por qué no aplica a esta propiedad. */
  notApplicable: Record<string, string>
}

export const DEMO_DISCLAIMER = 'DOCUMENTO DE DEMOSTRACIÓN — SIN VALIDEZ LEGAL'
const DEMO_NOTE = 'Propiedad ficticia de la cuenta demo: los datos energéticos, registrales y documentales son ilustrativos; no son un certificado, una nota simple ni ningún documento con validez legal.'

/** Lo que no aplica a un inmueble que no es de una comunidad de vecinos (chalet, casa). */
const NO_COMMUNITY = 'Vivienda unifamiliar independiente: no hay zonas comunes.'
const NO_TOUR = 'No hay un tour virtual propio con licencia compatible: no se enlaza ninguno que no exista.'

const COMMON_NA_COMMUNITY: Record<string, string> = Object.fromEntries(
  ['hasCommunityPool', 'hasCommunityGarden', 'hasGym', 'hasPaddle', 'hasTennis', 'hasPlayground', 'hasCoworking', 'hasSocialRoom', 'hasSecurity'].map((k) => [k, NO_COMMUNITY]),
)
const NO_PORTALS = 'La demo no publica en portales (ningún canal está conectado a un portal real).'
const COMMON_NA_MEDIA: Record<string, string> = {
  virtualTourUrl: NO_TOUR,
  videoUrl: 'No hay un vídeo propio con licencia compatible: no se enlaza ninguno que no exista.',
}
const COMMON_NA_ADMIN: Record<string, string> = {
  portals: NO_PORTALS,
  externalSource: 'No procede de un sistema externo.',
  externalReference: 'No procede de un sistema externo.',
  buyerFee: 'La agencia cobra sólo la comisión del propietario.',
  ownerFee: 'Se cobra como comisión sobre la venta (porcentaje), no como honorarios aparte.',
  rentalYield: 'Venta para uso propio: no se anuncia una rentabilidad (no se inventan datos de mercado).',
  energyCertificateExpiry: 'Sin certificado real no hay una vigencia que enseñar.',
  listingSituation: 'Nada que anunciar: se vende libre.',
}

/** Los espacios que no cuentan en la superficie útil: terrazas, porches, garajes, trasteros y anexos. */
const OUTDOOR_TYPES = ['Terraza', 'Porche', 'Garaje', 'Trastero', 'Anexo']
export const isUsableRoom = (r: ReferenceRoom): boolean => !OUTDOOR_TYPES.includes(r.type)
export const usableTotal = (rooms: ReferenceRoom[]): number => rooms.filter(isUsableRoom).reduce((sum, r) => sum + r.area, 0)

const base = (key: string): DemoProperty => {
  const p = PROPERTIES.find((x) => x.key === key)
  if (!p) throw new Error(`Demo: propiedad desconocida ${key}`)
  return p
}
/** 1450 → «1.450» (sin depender del ICU del entorno: en español el 4 cifras no lleva punto). */
const n = (v: number): string => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '.')


// ════════════════════════════════════════════════════════════════════════════
// p10 · Propiedades (web) · Chalet: villa de diseño frente al mar en Celorio
// ════════════════════════════════════════════════════════════════════════════
const P10 = base('p10')

const P10_ROOMS: ReferenceRoom[] = [
  // Planta baja: 130 m² útiles.
  { type: 'Recibidor', name: 'Hall de entrada', area: 10, floor: 'Planta baja', orientation: 'S', notes: 'Doble altura junto a la escalera.' },
  { type: 'Salón', name: 'Salón-comedor', area: 46, floor: 'Planta baja', orientation: 'N', notes: 'Ventanales de suelo a techo hacia la terraza, el jardín y el mar.' },
  { type: 'Cocina', name: 'Cocina con office', area: 22, floor: 'Planta baja', orientation: 'E', notes: 'Isla central y office; comunica con el comedor y con el lavadero.' },
  { type: 'Salón', name: 'Sala de estar', area: 20, floor: 'Planta baja', orientation: 'NE', notes: 'Sala de cine o de juegos.' },
  { type: 'Dormitorio', name: 'Dormitorio de invitados', area: 14, floor: 'Planta baja', orientation: 'E', notes: 'Con baño propio.' },
  { type: 'Baño', name: 'Baño del dormitorio de invitados', area: 5, floor: 'Planta baja' },
  { type: 'Aseo', name: 'Aseo de cortesía', area: 3, floor: 'Planta baja' },
  { type: 'Lavadero', name: 'Lavadero', area: 6, floor: 'Planta baja', notes: 'Con salida al jardín de servicio.' },
  { type: 'Distribuidor', name: 'Escalera y distribuidor', area: 4, floor: 'Planta baja' },
  // Planta primera: 110 m² útiles.
  { type: 'Dormitorio', name: 'Dormitorio principal', area: 26, floor: 'Planta primera', orientation: 'N', notes: 'Terraza propia de 20 m² con vistas al mar.' },
  { type: 'Vestidor', name: 'Vestidor del dormitorio principal', area: 8, floor: 'Planta primera' },
  { type: 'Baño', name: 'Baño del dormitorio principal', area: 11, floor: 'Planta primera', notes: 'Ducha de obra y bañera exenta.' },
  { type: 'Dormitorio', name: 'Dormitorio 2', area: 15, floor: 'Planta primera', orientation: 'N', notes: 'Con baño propio.' },
  { type: 'Baño', name: 'Baño del dormitorio 2', area: 5, floor: 'Planta primera' },
  { type: 'Dormitorio', name: 'Dormitorio 3', area: 13, floor: 'Planta primera', orientation: 'E' },
  { type: 'Dormitorio', name: 'Dormitorio 4', area: 12, floor: 'Planta primera', orientation: 'E' },
  { type: 'Baño', name: 'Baño compartido', area: 6, floor: 'Planta primera' },
  { type: 'Despacho', name: 'Despacho', area: 8, floor: 'Planta primera', orientation: 'W', notes: 'Con vistas al jardín.' },
  { type: 'Distribuidor', name: 'Distribuidor de la planta primera', area: 6, floor: 'Planta primera' },
  // Fuera de la superficie útil.
  { type: 'Terraza', name: 'Terraza del salón', area: 40, floor: 'Planta baja', orientation: 'N', notes: 'Al salón-comedor, con vistas al mar.' },
  { type: 'Terraza', name: 'Terraza del dormitorio principal', area: 20, floor: 'Planta primera', orientation: 'N' },
  { type: 'Garaje', name: 'Garaje cubierto', area: 38, floor: 'Planta baja', notes: 'Dos coches; instalación preparada para punto de recarga.' },
  { type: 'Trastero', name: 'Cuarto de instalaciones', area: 10, floor: 'Planta baja', notes: 'Aerotermia, domótica y almacenaje.' },
]

const P10_DESCRIPTION = `<p><strong>Presentación.</strong> Villa unifamiliar de nueva construcción (${P10.yearBuilt}) con ${P10.area} m² construidos y ${P10.usableArea} m² útiles sobre una parcela de ${n(P10.plotArea!)} m², con piscina privada y vistas abiertas al Cantábrico. Proyecto contemporáneo de dos plantas, orientado al norte hacia el mar, terminado y listo para entrar a vivir.</p>
<p><strong>Ubicación y entorno.</strong> En el Camino de Celorio, en el concejo de Llanes, a unos cinco minutos andando de las playas de Celorio y de Barro y a diez minutos en coche del centro de Llanes. Zona residencial de baja densidad, con acceso rodado directo, restauración y comercio de proximidad en el pueblo, y centro de salud y colegios en Llanes. Datos del entorno orientativos, de demostración.</p>
<p><strong>Distribución.</strong> Planta baja de 130 m² útiles con hall, salón-comedor, cocina con office, sala de estar, dormitorio de invitados con baño, aseo de cortesía y lavadero. Planta primera de 110 m² útiles con el dormitorio principal (vestidor y baño en suite), tres dormitorios más —uno con baño propio—, baño compartido y despacho.</p>
<p><strong>Zona de día.</strong> El salón-comedor de 46 m² se abre con ventanales de suelo a techo a la terraza de 40 m² y al jardín; la cocina de 22 m², con isla central y office, comunica con el comedor y con el lavadero; la sala de estar de 20 m² funciona como sala de cine o de juegos.</p>
<p><strong>Zona de noche.</strong> Cinco dormitorios en total. El principal, de 26 m², tiene vestidor de 8 m², baño de 11 m² con ducha de obra y bañera exenta, y una terraza propia de 20 m² con vistas al mar. El dormitorio 2 dispone de baño propio; los dormitorios 3 y 4 comparten un baño. El dormitorio de invitados está en planta baja, con baño completo.</p>
<p><strong>Espacios exteriores.</strong> Parcela de ${n(P10.plotArea!)} m² con ${n(P10.gardenArea!)} m² de jardín privado, porche, piscina privada y dos terrazas que suman ${P10.terraceArea} m². Garaje cubierto para dos coches y un cuarto de instalaciones de 10 m².</p>
<p><strong>Calidades.</strong> Fachada de monocapa blanco, suelos de microcemento continuo, carpintería de aluminio con rotura de puente térmico y triple acristalamiento, techos de 2,70 m y armarios empotrados vestidos en todos los dormitorios. Baños nuevos con sanitarios suspendidos y grifería termostática.</p>
<p><strong>Instalaciones.</strong> Aerotermia para suelo radiante, refrigeración y agua caliente, apoyada por placas solares; domótica para iluminación, climatización y persianas; alarma conectada y fibra óptica hasta la vivienda.</p>
<p><strong>Equipamiento.</strong> Cocina equipada con encimera de inducción, horno, campana, lavavajillas y frigorífico integrados. Lavadero con espacio para lavadora y secadora. Instalación preparada para punto de recarga de vehículo eléctrico en el garaje.</p>
<p><strong>Características diferenciales.</strong> Vistas abiertas al mar a cinco minutos de la playa, una parcela excepcional para la zona, consumo casi nulo (calificación energética A) y una distribución que separa claramente la vida diaria del descanso.</p>
<p><strong>Perfil de comprador.</strong> Familias que buscan una vivienda principal con mucho espacio exterior, o compradores de segunda residencia premium en la costa de Asturias que quieran recibir invitados con total independencia.</p>
<p><strong>Información comercial relevante.</strong> Comercializa Viviendas del Sella, en exclusiva con Norte Astur Inmobiliaria. Entrega inmediata. IBI orientativo de ${n(1850)} € al año y sin cuota de comunidad. Plan de pago orientativo: reserva, 10 % en contrato y el resto en escritura. ${DEMO_NOTE}</p>`

const P10_PLAN_DESCRIPTION = `<p>Dos plantas de ${P10.usableArea} m² útiles en total: 130 m² en planta baja, con la zona de día y un dormitorio de invitados, y 110 m² en planta primera, con la zona de noche y el despacho. Las superficies de cada estancia salen de la ficha de la propiedad. Planos de demostración, sin validez legal.</p>`
const P10_MASTERPLAN_DESCRIPTION = `<p>Parcela de ${n(P10.plotArea!)} m²: la vivienda ocupa unos 350 m² de la superficie, el resto es jardín privado (${n(P10.gardenArea!)} m²) con porche y piscina. Esquema de demostración, sin validez legal.</p>`
const P10_LOCATION_DESCRIPTION = `<p>Celorio, concejo de Llanes: a cinco minutos andando de las playas de Celorio y de Barro y a diez minutos en coche del centro de Llanes. La ubicación que se publica es aproximada.</p>`

const P10_CONTENT: ReferenceContent = {
  key: 'p10',
  fields: {
    // Moneda del precio (Cola 11): euros, la de la demo.
    currency: 'EUR',
    commercialCode: 'CEL-0010',
    // Dimensiones y superficies
    toilets: 1,
    livingRooms: 2,
    kitchens: 1,
    garageSpaces: 2,
    storageArea: 10,
    totalArea: 345,
    computableArea: 268,
    roomsTotal: 9,
    terracesCount: 2,
    balconiesCount: 0,
    storeroomsCount: 1,
    dressingRoomsCount: 1,
    studiesCount: 1,
    floorsCount: 2,
    // Edificio y vivienda
    buildingFloors: 2,
    buildingCondition: 'new',
    facade: 'render',
    structure: 'concrete',
    kitchenEquipment: 'equipped',
    bathroomsCondition: 'new',
    ceilingHeight: 2.7,
    isRenovated: false,
    exteriorInterior: 'exterior',
    // Instalaciones y exteriores
    installationsCondition: 'new',
    hasAirConditioning: true,
    hasUnderfloorHeating: true,
    hasFireplace: false,
    hasHomeAutomation: true,
    hasAlarm: true,
    hasFiber: true,
    hasSolarPanels: true,
    hasAerothermal: true,
    isBeachfront: false,
    hasPrivateGarden: true,
    hasPrivatePool: true,
    hasPorch: true,
    hasPatio: false,
    hasBalcony: false,
    // Precio y condiciones
    priceOld: 920_000,
    handoverDate: 'Inmediata',
    handoverPercentage: '90',
    downPercentage: '10',
    constructionPercentage: '0',
    paymentPlan: JSON.stringify([
      { label: 'Reserva', value: '6.000 €', description: 'Al reservar la vivienda; se descuenta del precio' },
      { label: 'Contrato de arras', value: '10%', description: 'Al firmar el contrato, a los 30 días de la reserva' },
      { label: 'Escritura', value: '90%', description: 'Al firmar la escritura de compraventa' },
    ]),
    priceMinAuthorized: 860_000,
    priceRecommended: 890_000,
    garbageTaxAnnual: 148,
    // Legal y registro (valores inequívocamente ficticios)
    cadastralReference: 'DEMO0000000000000010',
    registryPropertyNumber: 'DEMO-FINCA-0010',
    landRegistry: 'Registro de la Propiedad ficticio (demostración)',
    encumbrances: 'Sin cargas declaradas. Dato de demostración: no procede de una nota simple real.',
    mortgageStatus: 'none',
    occupancyStatus: 'vacant',
    licenses: 'Licencia de obra y de primera ocupación de la promoción (demostración). No hay una licencia real que verificar.',
    habitabilityCertificate: 'DEMO — sin cédula real',
    iteStatus: 'not_required',
    energyCertificateNumber: 'DEMO-SIN-REGISTRO',
    // Documentación técnica de la ficha pública
    floorPlanDescription: P10_PLAN_DESCRIPTION,
    masterPlanDescription: P10_MASTERPLAN_DESCRIPTION,
    locationMapDescription: P10_LOCATION_DESCRIPTION,
  },
  highlights: [
    `Parcela de ${n(P10.plotArea!)} m² con ${n(P10.gardenArea!)} m² de jardín privado`,
    'Vistas abiertas al Cantábrico',
    'Piscina privada y porche',
    'Aerotermia, suelo radiante y placas solares',
    'Domótica y alarma conectada',
    'Calificación energética A',
    'Garaje cubierto para dos coches',
    'Entrega inmediata',
  ],
  description: P10_DESCRIPTION,
  rooms: P10_ROOMS,
  photos: [
    { path: 'propiedades/p10-01.jpg', room: 'facade', alt: 'Fachada blanca de la villa, de dos plantas, con jardín y acceso de entrada', title: 'Fachada', description: 'Fachada principal de dos plantas y acceso peatonal al jardín.' },
    { path: 'propiedades/p10-02.jpg', room: 'living', alt: 'Salón con sofá esquinero, mesa baja, escritorio y gran mural azul', title: 'Salón', description: 'Zona de estar del salón, con escritorio de trabajo y televisor.' },
    { path: 'propiedades/p10-03.jpg', room: 'bedroom', alt: 'Dormitorio con cama doble y cabecero de madera, con baño abierto al fondo', title: 'Dormitorio principal', description: 'Dormitorio con cabecero de madera y acceso al baño en suite.' },
    { path: 'propiedades/p10-04.jpg', room: 'bathroom', alt: 'Baño en suite con bañera exenta, ducha y lavabo con espejo redondo', title: 'Baño en suite', description: 'Baño abierto al dormitorio con bañera, ducha y revestimiento oscuro.' },
    { path: 'propiedades/p10-05.jpg', room: 'bathroom', alt: 'Zona de aseo con inodoro tras puerta de cristal y armario empotrado', title: 'Aseo y vestidor', description: 'Aseo separado por puerta de cristal y armarios empotrados.' },
    { path: 'asturias/costa-01.jpg', room: 'exterior', alt: 'Playa de arena con un arco de roca y el mar Cantábrico al fondo', title: 'Playa del entorno', description: 'Foto del entorno (playa de la zona), no de la vivienda.' },
  ],
  plans: [
    { file: 'planos/p10-planta-baja.png', title: 'Planta baja', category: 'Vivienda', unitType: 'Chalet independiente de 5 dormitorios', floorDetails: 'Hall, salón-comedor, cocina con office, sala de estar, dormitorio de invitados, aseo y lavadero', sizes: '130 m² útiles', type: 'Planta', floors: ['Planta baja'] },
    { file: 'planos/p10-planta-primera.png', title: 'Planta primera', category: 'Vivienda', unitType: 'Chalet independiente de 5 dormitorios', floorDetails: 'Dormitorio principal con vestidor y baño, tres dormitorios, baño compartido y despacho', sizes: '110 m² útiles', type: 'Planta', floors: ['Planta primera'] },
  ],
  documents: [
    {
      docType: 'other',
      title: 'Ficha comercial de la villa de Celorio',
      visibility: 'public',
      issuedDays: 3,
      notes: 'Resumen comercial de la propiedad. Documento de demostración.',
      sections: [
        { heading: 'La propiedad', lines: [`Chalet independiente de nueva construcción (${P10.yearBuilt}) en Celorio, Llanes.`, `${P10.area} m² construidos, ${P10.usableArea} m² útiles, parcela de ${n(P10.plotArea!)} m².`, `${P10.bedrooms} dormitorios, ${P10.bathrooms} baños y 1 aseo, 2 plantas, garaje para 2 coches.`] },
        { heading: 'Precio', lines: [`Precio de venta: ${n(P10.price)} €.`, `Precio por m² construido: ${n(Math.round(P10.price / P10.area))} €/m².`, 'Sin cuota de comunidad. IBI orientativo: 1.850 € al año.'] },
        { heading: 'Exteriores', lines: [`Jardín privado de ${n(P10.gardenArea!)} m², piscina privada, porche y terrazas por ${P10.terraceArea} m².`] },
        { heading: 'Comercialización', lines: ['Promotora: Viviendas del Sella. Comercializa Norte Astur Inmobiliaria, en exclusiva.', 'Entrega inmediata. Plan de pago: reserva, 10 % en contrato y 90 % en escritura.'] },
      ],
    },
    {
      docType: 'other',
      title: 'Memoria de calidades',
      visibility: 'public',
      issuedDays: 3,
      notes: 'Calidades de la construcción y las instalaciones. Documento de demostración.',
      sections: [
        { heading: 'Estructura y cerramientos', lines: ['Estructura de hormigón armado. Fachada de monocapa blanco.', 'Carpintería de aluminio con rotura de puente térmico y triple acristalamiento.'] },
        { heading: 'Interiores', lines: ['Suelo de microcemento continuo. Altura de techos de 2,70 m.', 'Armarios empotrados vestidos en todos los dormitorios.', 'Baños con sanitarios suspendidos y grifería termostática.'] },
        { heading: 'Instalaciones', lines: ['Aerotermia para suelo radiante, refrigeración y agua caliente, con apoyo de placas solares.', 'Domótica de iluminación, climatización y persianas. Alarma conectada. Fibra óptica.'] },
        { heading: 'Cocina', lines: ['Equipada: inducción, horno, campana, lavavajillas y frigorífico integrados.'] },
      ],
    },
    {
      docType: 'other',
      title: 'Resumen de características y superficies',
      visibility: 'public',
      issuedDays: 3,
      notes: 'Superficies por estancia, coherentes con la ficha. Documento de demostración.',
      sections: [
        { heading: 'Superficies', lines: [`Construida: ${P10.area} m². Útil: ${P10.usableArea} m². Parcela: ${n(P10.plotArea!)} m². Jardín: ${n(P10.gardenArea!)} m². Terrazas: ${P10.terraceArea} m².`] },
        { heading: 'Planta baja (130 m² útiles)', lines: P10_ROOMS.filter((r) => isUsableRoom(r) && r.floor === 'Planta baja').map((r) => `${r.name}: ${r.area} m²`) },
        { heading: 'Planta primera (110 m² útiles)', lines: P10_ROOMS.filter((r) => isUsableRoom(r) && r.floor === 'Planta primera').map((r) => `${r.name}: ${r.area} m²`) },
      ],
    },
    {
      docType: 'other',
      title: 'Resumen económico orientativo',
      visibility: 'internal',
      issuedDays: 3,
      notes: 'Uso interno: gastos e impuestos orientativos. Documento de demostración.',
      sections: [
        { heading: 'Gastos del inmueble', lines: ['IBI orientativo: 1.850 € al año. Tasa de basuras orientativa: 148 € al año. Comunidad: no hay.'] },
        { heading: 'Condiciones comerciales', lines: ['Comisión: 4 % + 21 % de IVA, a cargo de la promotora.', 'Precio mínimo autorizado y precio recomendado: ver la ficha interna.'] },
        { heading: 'Aviso', lines: ['Las cifras son orientativas y de demostración; no sustituyen un asesoramiento fiscal.'] },
      ],
    },
    {
      docType: 'mandate',
      title: 'Hoja de encargo de demostración',
      visibility: 'owner',
      issuedDays: 1,
      notes: 'Modelo de hoja de encargo ficticia: no obliga a nadie.',
      sections: [
        { heading: 'Encargo', lines: ['Comercialización en exclusiva de la villa de Celorio por Norte Astur Inmobiliaria.', 'Vigencia: la que consta en la ficha (campo «Exclusividad» del editor).'] },
        { heading: 'Condiciones', lines: ['Comisión del 4 % + IVA. Sin firma ni sello: es un modelo ilustrativo de la cuenta demo.'] },
      ],
    },
  ],
  tags: ['Domótica', 'Parcela grande', 'Aerotermia'],
  customFields: { orientacion_comercial: 'Lujo', llaves: 'En oficina' },
  unitTypes: [{ propertyType: 'Villa', unitType: 'Chalet de 5 dormitorios', size: `${P10.area} m² construidos` }],
  notApplicable: {
    ...COMMON_NA_ADMIN,
    ...COMMON_NA_COMMUNITY,
    ...COMMON_NA_MEDIA,
    balconyArea: 'No tiene balcón: la terraza y el porche son los espacios exteriores.',
    renovationYear: 'Obra nueva: no se ha reformado.',
    owners: 'La propietaria es la promotora (Propiedad → Promotora); no hay propietarios particulares.',
    floor: 'Vivienda independiente de dos plantas: no hay una planta única.',
    block: 'Vivienda independiente: no hay bloque.',
    portal: 'Vivienda independiente: no hay portal.',
    doorLetter: 'Vivienda independiente: no hay puerta con letra.',
    staircase: 'Vivienda independiente: no hay escalera comunitaria.',
    streetNumber: 'La ubicación que se publica es aproximada y sin número.',
    buildingUnits: 'Vivienda independiente: no hay vecinos.',
    unitsPerFloor: 'Vivienda independiente.',
    hasConcierge: NO_COMMUNITY,
    hasDoorman: NO_COMMUNITY,
    officeArea: 'Uso residencial.',
    commercialArea: 'Uso residencial.',
    serviceChargeAnnual: 'Dato anterior: la comunidad se indica en «Comunidad (mensual)».',
    priceChangeReason: 'Sólo se rellena al cambiar el precio desde el editor.',
    featuresReviewedAt: 'Se marca desde el editor al repasar las características.',
    externalSource: 'No procede de un sistema externo.',
  },
}

// ════════════════════════════════════════════════════════════════════════════
// p02 · Propiedades (web) · Ático de lujo junto al Campo San Francisco
// ════════════════════════════════════════════════════════════════════════════
const P02 = base('p02')

const P02_ROOMS: ReferenceRoom[] = [
  { type: 'Recibidor', name: 'Hall de entrada', area: 7, floor: 'Planta 7', orientation: 'NE', notes: 'Con armario recibidor.' },
  { type: 'Salón', name: 'Salón-comedor', area: 32, floor: 'Planta 7', orientation: 'SW', notes: 'Doble orientación; salida directa a la terraza.' },
  { type: 'Cocina', name: 'Cocina independiente', area: 12, floor: 'Planta 7', orientation: 'NE', notes: 'Equipada, con zona de desayuno.' },
  { type: 'Dormitorio', name: 'Dormitorio principal', area: 15, floor: 'Planta 7', orientation: 'SW', notes: 'En suite, con acceso a la terraza.' },
  { type: 'Vestidor', name: 'Vestidor del dormitorio principal', area: 4, floor: 'Planta 7' },
  { type: 'Baño', name: 'Baño del dormitorio principal', area: 6, floor: 'Planta 7', notes: 'Ducha de obra y doble lavabo.' },
  { type: 'Dormitorio', name: 'Dormitorio 2', area: 12, floor: 'Planta 7', orientation: 'NW' },
  { type: 'Dormitorio', name: 'Dormitorio 3', area: 11, floor: 'Planta 7', orientation: 'NE', notes: 'Pensado también como despacho.' },
  { type: 'Baño', name: 'Baño', area: 5, floor: 'Planta 7', notes: 'Con bañera.' },
  { type: 'Distribuidor', name: 'Pasillo', area: 6, floor: 'Planta 7' },
  { type: 'Terraza', name: 'Terraza', area: 42, floor: 'Planta 7', orientation: 'SW', notes: 'Vistas al Campo San Francisco; da al salón y al dormitorio principal.' },
]

const P02_DESCRIPTION = `<p><strong>Presentación.</strong> Ático de ${P02.area} m² construidos y ${P02.usableArea} m² útiles en la séptima y última planta de un edificio de ${P02.yearBuilt} rehabilitado por completo en ${P02.renovationYear}, con una terraza de ${P02.terraceArea} m² orientada al suroeste y vistas al parque del Campo San Francisco.</p>
<p><strong>Ubicación y entorno.</strong> En pleno centro de Oviedo, a un paso de la calle Uría y del Campo San Francisco. Comercios, colegios, centros de salud y restauración a menos de diez minutos andando; paradas de autobús urbano en la misma calle y estación de tren y de autobuses a un cuarto de hora a pie. Datos del entorno orientativos, de demostración.</p>
<p><strong>Distribución.</strong> Vivienda de una sola planta y 110 m² útiles: hall, salón-comedor, cocina independiente, dormitorio principal con vestidor y baño en suite, dos dormitorios más y un segundo baño, con la terraza abierta al salón y al dormitorio principal.</p>
<p><strong>Zona de día.</strong> El salón-comedor de 32 m² tiene doble orientación y salida directa a la terraza; la cocina independiente de 12 m² está equipada y cuenta con zona de desayuno.</p>
<p><strong>Zona de noche.</strong> Tres dormitorios: el principal (15 m²) es en suite, con vestidor de 4 m² y baño de 6 m² con ducha de obra y doble lavabo; el segundo (12 m²) mira a noroeste; el tercero (11 m²) puede funcionar como despacho. Un segundo baño de 5 m² con bañera da servicio a los dos últimos.</p>
<p><strong>Espacios exteriores.</strong> Terraza de ${P02.terraceArea} m² a la que se sale desde el salón y desde el dormitorio principal, con sol de tarde y vistas despejadas al parque.</p>
<p><strong>Calidades.</strong> Suelo de parqué, carpintería de aluminio con rotura de puente térmico y acristalamiento acústico, que aísla del ruido del centro, y cocina y baños completamente nuevos.</p>
<p><strong>Instalaciones.</strong> Bomba de calor (aerotermia) para climatización y agua caliente, aire acondicionado, domótica de iluminación y persianas, alarma y fibra óptica. Instalaciones eléctrica y de fontanería renovadas en la rehabilitación.</p>
<p><strong>Equipamiento.</strong> Cocina equipada con placa, horno, campana y lavavajillas. Armarios empotrados en los tres dormitorios.</p>
<p><strong>Características diferenciales.</strong> Último piso con terraza muy poco habitual en el centro, edificio rehabilitado con portero físico y ascensor hasta la planta, y calificación energética B.</p>
<p><strong>Perfil de comprador.</strong> Parejas o familias que quieren vivir en el centro de Oviedo con espacio exterior propio, o compradores que busquen una vivienda urbana de calidad lista para entrar a vivir.</p>
<p><strong>Información comercial relevante.</strong> Comercializa Cantábrico Norte Promociones, en exclusiva con Norte Astur Inmobiliaria. Entrega inmediata. Comunidad de 140 € al mes e IBI orientativo de 980 € al año. Plan de pago orientativo: reserva, 10 % en contrato y el resto en escritura. ${DEMO_NOTE}</p>`

const P02_CONTENT: ReferenceContent = {
  key: 'p02',
  fields: {
    // Moneda del precio (Cola 11): euros, la de la demo.
    currency: 'EUR',
    commercialCode: 'OVI-0002',
    toilets: 0,
    livingRooms: 1,
    kitchens: 1,
    garageSpaces: 0,
    totalArea: 170,
    computableArea: 120,
    roomsTotal: 5,
    terracesCount: 1,
    balconiesCount: 0,
    storeroomsCount: 0,
    dressingRoomsCount: 1,
    studiesCount: 0,
    floorsCount: 1,
    buildingFloors: 7,
    buildingUnits: 14,
    unitsPerFloor: 2,
    buildingCondition: 'excellent',
    facade: 'ventilated',
    structure: 'concrete',
    hasConcierge: true,
    hasDoorman: true,
    kitchenEquipment: 'equipped',
    bathroomsCondition: 'renovated',
    ceilingHeight: 2.6,
    isRenovated: true,
    exteriorInterior: 'exterior',
    installationsCondition: 'renovated',
    hasAirConditioning: true,
    hasUnderfloorHeating: false,
    hasFireplace: false,
    hasHomeAutomation: true,
    hasAlarm: true,
    hasFiber: true,
    hasSolarPanels: false,
    hasAerothermal: true,
    hasSecurity: true,
    hasCommunityPool: false,
    hasCommunityGarden: false,
    hasGym: false,
    hasPaddle: false,
    hasTennis: false,
    hasPlayground: false,
    hasCoworking: false,
    hasSocialRoom: false,
    isBeachfront: false,
    hasPrivateGarden: false,
    hasPrivatePool: false,
    hasPorch: false,
    hasPatio: false,
    hasBalcony: false,
    handoverDate: 'Inmediata',
    handoverPercentage: '90',
    downPercentage: '10',
    constructionPercentage: '0',
    paymentPlan: JSON.stringify([
      { label: 'Reserva', value: '8.000 €', description: 'Al reservar la vivienda; se descuenta del precio' },
      { label: 'Contrato de arras', value: '10%', description: 'Al firmar el contrato, a los 30 días de la reserva' },
      { label: 'Escritura', value: '90%', description: 'Al firmar la escritura de compraventa' },
    ]),
    priceMinAuthorized: 525_000,
    priceRecommended: 545_000,
    garbageTaxAnnual: 96,
    cadastralReference: 'DEMO0000000000000002',
    registryPropertyNumber: 'DEMO-FINCA-0002',
    landRegistry: 'Registro de la Propiedad ficticio (demostración)',
    encumbrances: 'Sin cargas declaradas. Dato de demostración: no procede de una nota simple real.',
    mortgageStatus: 'none',
    occupancyStatus: 'vacant',
    licenses: 'Licencia de obras de rehabilitación integral del edificio (demostración). No hay una licencia real que verificar.',
    habitabilityCertificate: 'DEMO — sin cédula real',
    iteStatus: 'passed',
    energyCertificateNumber: 'DEMO-SIN-REGISTRO',
    floorPlanDescription: `<p>Vivienda de una sola planta de ${P02.usableArea} m² útiles y una terraza de ${P02.terraceArea} m². Las superficies de cada estancia salen de la ficha de la propiedad. Plano de demostración, sin validez legal.</p>`,
    locationMapDescription: '<p>Oviedo centro, junto al Campo San Francisco y a la calle Uría. La ubicación que se publica no incluye el número de la calle.</p>',
  },
  highlights: [
    `Terraza de ${P02.terraceArea} m² con vistas al parque`,
    `Rehabilitación integral ${P02.renovationYear}`,
    'Portero físico y ascensor hasta la planta',
    'Aerotermia y aire acondicionado',
    'Acristalamiento acústico en pleno centro',
    'Calificación energética B',
    'A un paso de la calle Uría',
  ],
  description: P02_DESCRIPTION,
  rooms: P02_ROOMS,
  photos: [
    { path: 'propiedades/p02-01.jpg', room: 'terrace', alt: 'Terraza con jardineras y arbustos recortados junto a las cristaleras del edificio', title: 'Terraza', description: 'Terraza de la última planta, con jardineras y barandilla de vidrio y acero.' },
    { path: 'propiedades/p02-02.jpg', room: 'living', alt: 'Salón luminoso con sofá blanco, cojines de colores y comedor al fondo', title: 'Salón-comedor', description: 'Salón con zona de estar y comedor en el mismo espacio.' },
    { path: 'propiedades/p02-03.jpg', room: 'kitchen', alt: 'Cocina con isla, armarios blancos, campana y electrodomésticos de acero', title: 'Cocina', description: 'Cocina equipada con isla y zona de desayuno.' },
    { path: 'propiedades/p02-04.jpg', room: 'bedroom', alt: 'Dormitorio con cama doble y ventanal con estores enrollables', title: 'Dormitorio', description: 'Dormitorio con ventanal y cama doble.' },
    { path: 'propiedades/p02-05.jpg', room: 'bathroom', alt: 'Lavabo de sobre encimera blanco con encimera de madera clara', title: 'Baño', description: 'Detalle del lavabo del baño reformado.' },
    { path: 'propiedades/p02-07.jpg', room: 'terrace', alt: 'Mesa de comedor exterior con sillas blancas y vistas a las montañas desde la terraza', title: 'Terraza con vistas', description: 'Zona de comedor exterior de la terraza, con vistas despejadas.' },
    { path: 'asturias/oviedo-03.jpg', room: 'exterior', alt: 'Estanque con cisnes rodeado de árboles en un parque de Oviedo', title: 'Parque del entorno', description: 'Foto del entorno (parque de la zona), no de la vivienda.' },
  ],
  plans: [
    { file: 'planos/p02-planta-atico.png', title: 'Planta del ático', category: 'Vivienda', unitType: 'Ático de 3 dormitorios', floorDetails: 'Salón-comedor, cocina, tres dormitorios, dos baños y terraza de 42 m²', sizes: '110 m² útiles + 42 m² de terraza', type: 'Planta', floors: ['Planta 7'] },
  ],
  documents: [
    {
      docType: 'other',
      title: 'Ficha comercial del ático de Oviedo',
      visibility: 'public',
      issuedDays: 3,
      notes: 'Resumen comercial de la propiedad. Documento de demostración.',
      sections: [
        { heading: 'La propiedad', lines: [`Ático en el centro de Oviedo, en edificio rehabilitado en ${P02.renovationYear}.`, `${P02.area} m² construidos, ${P02.usableArea} m² útiles y terraza de ${P02.terraceArea} m².`, `${P02.bedrooms} dormitorios y ${P02.bathrooms} baños. Planta 7.ª con ascensor y portero físico.`] },
        { heading: 'Precio', lines: [`Precio de venta: ${n(P02.price)} €.`, `Precio por m² construido: ${n(Math.round(P02.price / P02.area))} €/m².`, 'Comunidad: 140 € al mes. IBI orientativo: 980 € al año.'] },
        { heading: 'Comercialización', lines: ['Promotora: Cantábrico Norte Promociones. Comercializa Norte Astur Inmobiliaria, en exclusiva.', 'Entrega inmediata. Plan de pago: reserva, 10 % en contrato y 90 % en escritura.'] },
      ],
    },
    {
      docType: 'other',
      title: 'Memoria de calidades',
      visibility: 'public',
      issuedDays: 3,
      notes: 'Calidades de la rehabilitación. Documento de demostración.',
      sections: [
        { heading: 'Cerramientos', lines: ['Carpintería de aluminio con rotura de puente térmico y acristalamiento acústico.', 'Fachada ventilada en la rehabilitación integral del edificio.'] },
        { heading: 'Interiores', lines: ['Suelo de parqué. Altura de techos de 2,60 m.', 'Armarios empotrados en los tres dormitorios.', 'Cocina y baños nuevos; baños con ducha de obra.'] },
        { heading: 'Instalaciones', lines: ['Bomba de calor (aerotermia) para climatización y agua caliente. Aire acondicionado.', 'Domótica de iluminación y persianas. Alarma. Fibra óptica.', 'Instalaciones eléctrica y de fontanería renovadas.'] },
      ],
    },
    {
      docType: 'other',
      title: 'Resumen de características y superficies',
      visibility: 'public',
      issuedDays: 3,
      notes: 'Superficies por estancia, coherentes con la ficha. Documento de demostración.',
      sections: [
        { heading: 'Superficies', lines: [`Construida: ${P02.area} m². Útil: ${P02.usableArea} m². Terraza: ${P02.terraceArea} m².`] },
        { heading: 'Estancias (110 m² útiles)', lines: P02_ROOMS.filter(isUsableRoom).map((r) => `${r.name}: ${r.area} m²`) },
      ],
    },
    {
      docType: 'other',
      title: 'Resumen económico orientativo',
      visibility: 'internal',
      issuedDays: 3,
      notes: 'Uso interno: gastos e impuestos orientativos. Documento de demostración.',
      sections: [
        { heading: 'Gastos del inmueble', lines: ['Comunidad: 140 € al mes. IBI orientativo: 980 € al año. Tasa de basuras orientativa: 96 € al año.'] },
        { heading: 'Condiciones comerciales', lines: ['Comisión: 3 % + 21 % de IVA, a cargo de la promotora.'] },
        { heading: 'Aviso', lines: ['Las cifras son orientativas y de demostración; no sustituyen un asesoramiento fiscal.'] },
      ],
    },
    {
      docType: 'mandate',
      title: 'Hoja de encargo de demostración',
      visibility: 'owner',
      issuedDays: 1,
      notes: 'Modelo de hoja de encargo ficticia: no obliga a nadie.',
      sections: [
        { heading: 'Encargo', lines: ['Comercialización en exclusiva del ático de Oviedo por Norte Astur Inmobiliaria.', 'Vigencia: la que consta en la ficha (campo «Exclusividad» del editor).'] },
        { heading: 'Condiciones', lines: ['Comisión del 3 % + IVA. Sin firma ni sello: es un modelo ilustrativo de la cuenta demo.'] },
      ],
    },
  ],
  tags: ['Rehabilitación integral', 'Portero'],
  customFields: { orientacion_comercial: 'Lujo', llaves: 'Portero / conserje' },
  unitTypes: [{ propertyType: 'Penthouse', unitType: 'Ático de 3 dormitorios', size: `${P02.area} m² construidos` }],
  notApplicable: {
    ...COMMON_NA_ADMIN,
    ...COMMON_NA_MEDIA,
    plotArea: 'Vivienda en un edificio: no tiene parcela.',
    gardenArea: 'No tiene jardín.',
    balconyArea: 'No tiene balcón: el espacio exterior es la terraza.',
    storageArea: 'No incluye trastero.',
    owners: 'La propietaria es la promotora (Propiedad → Promotora); no hay propietarios particulares.',
    locationPrivacyRadius: 'Con la privacidad «Ocultar número» no se usa un radio: las coordenadas son exactas.',
    officeArea: 'Uso residencial.',
    commercialArea: 'Uso residencial.',
    streetNumber: 'La ubicación que se publica no incluye el número.',
    block: 'No hay bloque.',
    portal: 'Edificio de un solo portal: sin dato que distinguir.',
    doorLetter: 'Se oculta con la privacidad «Ocultar número».',
    staircase: 'Una sola escalera: sin dato que distinguir.',
    community: 'No pertenece a una urbanización con nombre.',
    serviceChargeAnnual: 'Dato anterior: la comunidad se indica en «Comunidad (mensual)».',
    priceOld: 'El precio no ha cambiado desde la captación.',
    masterPlanDescription: 'Vivienda en altura: no hay plano de parcela.',
    priceChangeReason: 'Sólo se rellena al cambiar el precio desde el editor.',
    featuresReviewedAt: 'Se marca desde el editor al repasar las características.',
  },
}

// ════════════════════════════════════════════════════════════════════════════
// p11 · Propiedades 2ª mano · Piso reformado en La Florida (Oviedo)
// ════════════════════════════════════════════════════════════════════════════
const P11 = base('p11')

const P11_ROOMS: ReferenceRoom[] = [
  { type: 'Recibidor', name: 'Hall de entrada', area: 6, floor: 'Planta 3', orientation: 'N' },
  { type: 'Salón', name: 'Salón-comedor', area: 28, floor: 'Planta 3', orientation: 'S', notes: 'Muy luminoso; sale a la terraza.' },
  { type: 'Cocina', name: 'Cocina independiente', area: 11, floor: 'Planta 3', orientation: 'N', notes: 'Reformada en 2023 y equipada.' },
  { type: 'Dormitorio', name: 'Dormitorio principal', area: 15, floor: 'Planta 3', orientation: 'S', notes: 'En suite.' },
  { type: 'Baño', name: 'Baño del dormitorio principal', area: 5, floor: 'Planta 3', notes: 'Reformado en 2023.' },
  { type: 'Dormitorio', name: 'Dormitorio 2', area: 11, floor: 'Planta 3', orientation: 'S' },
  { type: 'Dormitorio', name: 'Dormitorio 3', area: 9, floor: 'Planta 3', orientation: 'N' },
  { type: 'Baño', name: 'Baño', area: 4, floor: 'Planta 3', notes: 'Reformado en 2023.' },
  { type: 'Distribuidor', name: 'Pasillo', area: 7, floor: 'Planta 3' },
  { type: 'Lavadero', name: 'Lavadero', area: 2, floor: 'Planta 3', notes: 'Junto a la cocina.' },
  { type: 'Terraza', name: 'Terraza', area: 9, floor: 'Planta 3', orientation: 'S' },
  { type: 'Garaje', name: 'Plaza de garaje', area: 12, floor: 'Sótano', notes: 'Plaza propia en el sótano del edificio.' },
  { type: 'Trastero', name: 'Trastero', area: 5, floor: 'Sótano' },
]

const P11_DESCRIPTION = `Presentación. Piso exterior de tres dormitorios y dos baños en la tercera planta de un edificio de ${P11.yearBuilt} con ascensor: ${P11.area} m² construidos (${P11.usableArea} m² útiles), reformado de forma integral en ${P11.renovationYear}, con terraza de 9 m², plaza de garaje y trastero en el sótano.

Ubicación y entorno. En el barrio de La Florida, en Oviedo: zona residencial tranquila con colegios, un parque y comercios de barrio a la vuelta de la esquina, y conexión con el centro en transporte urbano. Datos del entorno orientativos, de demostración.

Distribución. Hall, salón-comedor, cocina independiente, tres dormitorios —el principal con baño en suite—, un segundo baño, pasillo y lavadero.

Zona de día. El salón-comedor de 28 m² está orientado al sur, es muy luminoso y sale a la terraza. La cocina independiente de 11 m² está reformada y equipada, con un lavadero de 2 m² a continuación.

Zona de noche. Dormitorio principal de 15 m² con baño en suite de 5 m², dormitorio 2 de 11 m² (sur) y dormitorio 3 de 9 m² (norte), con un segundo baño de 4 m².

Espacios exteriores y anexos. Terraza de 9 m² al sur. En el sótano del edificio, una plaza de garaje de 12 m² y un trastero de 5 m².

Estado y reforma. Reforma integral de ${P11.renovationYear}: cocina y baños nuevos, instalaciones eléctrica y de fontanería renovadas, suelos de parqué y ventanas de aluminio con rotura de puente térmico y doble acristalamiento. El edificio, de fachada de ladrillo, está en buen estado y no consta ninguna actuación pendiente. Esta descripción es informativa: no sustituye a una inspección técnica ni a la ITE, que no es obligatoria por la antigüedad del edificio.

Instalaciones y equipamiento. Calefacción y agua caliente con caldera individual de gas, fibra óptica hasta la vivienda, cocina equipada y armarios empotrados en los dormitorios.

Características diferenciales. Una reforma reciente que permite entrar a vivir sin hacer obra, terraza orientada al sur y garaje con trastero en una zona familiar muy bien comunicada.

Perfil de comprador. Familias con hijos o parejas que buscan una vivienda de tres dormitorios en el centro-oeste de Oviedo, lista para habitar.

Información comercial relevante. Encargo de venta en exclusiva con Norte Astur Inmobiliaria. Comunidad de 65 € al mes e IBI orientativo de 480 € al año. Dos copropietarios (50 % cada uno); la vivienda está habitada por ellos hasta la firma. ${DEMO_NOTE}`

const P11_CONTENT: ReferenceContent = {
  key: 'p11',
  fields: {
    // Moneda del precio (Cola 11): euros, la de la demo.
    currency: 'EUR',
    commercialCode: 'OVI-0011',
    terraceArea: 9,
    storageArea: 5,
    toilets: 0,
    livingRooms: 1,
    kitchens: 1,
    garageSpaces: 1,
    totalArea: 124,
    computableArea: 112,
    roomsTotal: 5,
    terracesCount: 1,
    balconiesCount: 0,
    storeroomsCount: 1,
    dressingRoomsCount: 0,
    studiesCount: 0,
    floorsCount: 1,
    buildingFloors: 6,
    buildingUnits: 36,
    unitsPerFloor: 6,
    buildingCondition: 'good',
    facade: 'brick',
    structure: 'concrete',
    hasConcierge: false,
    hasDoorman: false,
    kitchenEquipment: 'equipped',
    bathroomsCondition: 'renovated',
    ceilingHeight: 2.5,
    isRenovated: true,
    installationsCondition: 'renovated',
    hasAirConditioning: false,
    hasUnderfloorHeating: false,
    hasFireplace: false,
    hasHomeAutomation: false,
    hasAlarm: false,
    hasFiber: true,
    hasSolarPanels: false,
    hasAerothermal: false,
    hasCommunityPool: false,
    hasCommunityGarden: false,
    hasGym: false,
    hasPaddle: false,
    hasTennis: false,
    hasPlayground: false,
    hasCoworking: false,
    hasSocialRoom: false,
    hasSecurity: false,
    isBeachfront: false,
    hasPrivateGarden: false,
    hasPrivatePool: false,
    hasPorch: false,
    hasPatio: false,
    hasBalcony: false,
    priceOld: 279_000,
    priceMinAuthorized: 255_000,
    priceRecommended: 265_000,
    garbageTaxAnnual: 82,
    cadastralReference: 'DEMO0000000000000011',
    registryPropertyNumber: 'DEMO-FINCA-0011',
    landRegistry: 'Registro de la Propiedad ficticio (demostración)',
    encumbrances: 'Sin cargas declaradas por los propietarios. Dato de demostración: no procede de una nota simple real.',
    mortgageStatus: 'none',
    occupancyStatus: 'owner_occupied',
    licenses: 'Licencia de obras menores de la reforma de 2023 (demostración). No hay una licencia real que verificar.',
    habitabilityCertificate: 'DEMO — sin cédula real',
    iteStatus: 'not_required',
    energyCertificateNumber: 'DEMO-SIN-REGISTRO',
  },
  highlights: [
    `Reforma integral en ${P11.renovationYear}: cocina, baños e instalaciones`,
    'Terraza de 9 m² orientada al sur',
    'Plaza de garaje y trastero en el sótano',
    'Edificio de 2004 con ascensor',
    'Junto a colegios y parque',
    'Para entrar a vivir',
  ],
  description: P11_DESCRIPTION,
  rooms: P11_ROOMS,
  photos: [
    { path: 'propiedades/p11-01.jpg', room: 'facade', alt: 'Fachada de piedra clara y ladrillo del edificio, con balcones, bajo un cielo azul', title: 'Fachada del edificio', description: 'Fachada del edificio de seis plantas.' },
    { path: 'propiedades/p11-02.jpg', room: 'living', alt: 'Salón con mesa de comedor, sillones de piel y una ventana al exterior', title: 'Salón-comedor', description: 'Zona de estar y de comedor del salón.' },
    { path: 'propiedades/p11-03.jpg', room: 'dining', alt: 'Zona de comedor con mesa redonda de cristal junto a grandes ventanales con estores', title: 'Comedor luminoso', description: 'Comedor junto a los ventanales, con estores y vistas a la ciudad.' },
    { path: 'asturias/oviedo-01.jpg', room: 'exterior', alt: 'Edificios históricos con miradores y balcones de hierro en el centro de Oviedo', title: 'Centro de Oviedo', description: 'Foto del entorno (arquitectura del centro de Oviedo), no de la vivienda.' },
  ],
  plans: [
    { file: 'planos/p11-planta.png', title: 'Planta de la vivienda', category: 'Vivienda', unitType: 'Piso de 3 dormitorios', floorDetails: 'Salón-comedor, cocina, tres dormitorios, dos baños, lavadero y terraza', sizes: '98 m² útiles + 9 m² de terraza', type: 'Planta', floors: ['Planta 3'] },
  ],
  documents: [
    {
      docType: 'other',
      title: 'Ficha comercial del piso de La Florida',
      visibility: 'authorized_buyer',
      issuedDays: 3,
      notes: 'Resumen comercial de la propiedad. Documento de demostración.',
      sections: [
        { heading: 'La propiedad', lines: [`Piso reformado en ${P11.renovationYear} en La Florida, Oviedo, planta 3.ª con ascensor.`, `${P11.area} m² construidos, ${P11.usableArea} m² útiles y terraza de 9 m².`, `${P11.bedrooms} dormitorios y ${P11.bathrooms} baños. Plaza de garaje y trastero en el sótano.`] },
        { heading: 'Precio', lines: [`Precio de venta: ${n(P11.price)} €.`, `Precio por m² construido: ${n(Math.round(P11.price / P11.area))} €/m².`, 'Comunidad: 65 € al mes. IBI orientativo: 480 € al año.'] },
        { heading: 'Comercialización', lines: ['Encargo de venta en exclusiva de Norte Astur Inmobiliaria.', 'Disponible: la vivienda está habitada por los propietarios hasta la firma.'] },
      ],
    },
    {
      docType: 'other',
      title: 'Informe descriptivo de estado y reforma',
      visibility: 'authorized_buyer',
      issuedDays: 4,
      notes: 'Descripción de lo reformado. No es una inspección ni un informe técnico acreditado. Documento de demostración.',
      sections: [
        { heading: 'Antigüedad y reforma', lines: [`Edificio de ${P11.yearBuilt}. Reforma integral de la vivienda en ${P11.renovationYear}.`] },
        { heading: 'Lo reformado', lines: ['Cocina y baños nuevos. Suelos de parqué. Ventanas de aluminio con rotura de puente térmico y doble acristalamiento.', 'Instalaciones eléctrica y de fontanería renovadas.'] },
        { heading: 'Estado actual', lines: ['Para entrar a vivir. No consta ninguna actuación pendiente. Edificio en buen estado.'] },
        { heading: 'Aviso', lines: ['Informe descriptivo hecho por la agencia a partir de lo que declaran los propietarios. No se ha realizado ninguna inspección técnica: no sustituye a un informe de un técnico competente.'] },
      ],
    },
    {
      docType: 'other',
      title: 'Resumen de características y superficies',
      visibility: 'internal',
      issuedDays: 3,
      notes: 'Superficies por estancia, coherentes con la ficha. Documento de demostración.',
      sections: [
        { heading: 'Superficies', lines: [`Construida: ${P11.area} m². Útil: ${P11.usableArea} m². Terraza: 9 m². Trastero: 5 m².`] },
        { heading: 'Estancias (98 m² útiles)', lines: P11_ROOMS.filter(isUsableRoom).map((r) => `${r.name}: ${r.area} m²`) },
      ],
    },
    {
      docType: 'other',
      title: 'Resumen de la situación documental declarada',
      visibility: 'internal',
      issuedDays: 4,
      notes: 'Lo que declaran los propietarios; no sustituye a una nota simple ni a una escritura. Documento de demostración.',
      sections: [
        { heading: 'Declarado por los propietarios', lines: ['Libre de cargas e hipoteca. Vivienda de dos copropietarios (50 % y 50 %).', 'ITE no obligatoria por la antigüedad del edificio. Cédula de habitabilidad: pendiente de aportar.'] },
        { heading: 'Por verificar antes de la venta', lines: ['Nota simple y escritura reales, recibo del IBI y certificado de la comunidad: la demo no incluye ninguno de ellos.'] },
      ],
    },
    {
      docType: 'mandate',
      title: 'Hoja de encargo de demostración',
      visibility: 'owner',
      issuedDays: 1,
      notes: 'Modelo de hoja de encargo ficticia: no obliga a nadie.',
      sections: [
        { heading: 'Encargo', lines: ['Venta en exclusiva del piso de La Florida por Norte Astur Inmobiliaria.', 'Vigencia: la que consta en la ficha (campo «Exclusividad» del editor).'] },
        { heading: 'Condiciones', lines: ['Comisión del 3 % + IVA. Sin firma ni sello: es un modelo ilustrativo de la cuenta demo.'] },
      ],
    },
  ],
  tags: ['Garaje y trastero'],
  customFields: { orientacion_comercial: 'Primera vivienda', llaves: 'En oficina' },
  notApplicable: {
    ...COMMON_NA_ADMIN,
    ...COMMON_NA_MEDIA,
    plotArea: 'Vivienda en un edificio: no tiene parcela.',
    gardenArea: 'No tiene jardín.',
    balconyArea: 'No tiene balcón: el espacio exterior es la terraza.',
    officeArea: 'Uso residencial.',
    commercialArea: 'Uso residencial.',
    streetNumber: 'La ubicación que se publica es aproximada y sin número.',
    block: 'No hay bloque.',
    portal: 'Edificio de un solo portal: sin dato que distinguir.',
    doorLetter: 'Se oculta con la privacidad «Aproximada».',
    staircase: 'Una sola escalera: sin dato que distinguir.',
    community: 'No pertenece a una urbanización con nombre.',
    serviceChargeAnnual: 'Dato anterior: la comunidad se indica en «Comunidad (mensual)».',
    paymentPlan: 'Reventa: el pago es al contado o con la hipoteca del comprador, sin plan de pagos.',
    location: 'Campo heredado: la dirección se indica con los campos de arriba.',
    priceChangeReason: 'Sólo se rellena al cambiar el precio desde el editor.',
    featuresReviewedAt: 'Se marca desde el editor al repasar las características.',
  },
}

// ════════════════════════════════════════════════════════════════════════════
// p19 · Propiedades 2ª mano · Casa asturiana de piedra rehabilitada (Llanes)
// ════════════════════════════════════════════════════════════════════════════
const P19 = base('p19')

const P19_ROOMS: ReferenceRoom[] = [
  // Planta baja: 97 m² útiles.
  { type: 'Recibidor', name: 'Recibidor', area: 9, floor: 'Planta baja', orientation: 'S', notes: 'Acceso desde el porche.' },
  { type: 'Salón', name: 'Salón con chimenea', area: 36, floor: 'Planta baja', orientation: 'S', notes: 'Vigas de madera vistas y chimenea de piedra; vistas a la sierra.' },
  { type: 'Cocina', name: 'Cocina con office', area: 24, floor: 'Planta baja', orientation: 'E', notes: 'Cocina de leña tradicional junto a la encimera moderna.' },
  { type: 'Dormitorio', name: 'Dormitorio 1', area: 14, floor: 'Planta baja', orientation: 'E', notes: 'Pensado para quien no quiere subir escaleras.' },
  { type: 'Baño', name: 'Baño de planta baja', area: 6, floor: 'Planta baja', notes: 'Reformado en 2020.' },
  { type: 'Lavadero', name: 'Despensa y lavadero', area: 8, floor: 'Planta baja' },
  // Planta primera: 88 m² útiles.
  { type: 'Dormitorio', name: 'Dormitorio principal', area: 22, floor: 'Planta primera', orientation: 'S', notes: 'Con vistas a la sierra del Cuera.' },
  { type: 'Baño', name: 'Baño en suite', area: 8, floor: 'Planta primera', notes: 'Reformado en 2020.' },
  { type: 'Dormitorio', name: 'Dormitorio 2', area: 16, floor: 'Planta primera', orientation: 'SE' },
  { type: 'Dormitorio', name: 'Dormitorio 3', area: 13, floor: 'Planta primera', orientation: 'W' },
  { type: 'Baño', name: 'Baño de planta primera', area: 7, floor: 'Planta primera', notes: 'Reformado en 2020.' },
  { type: 'Distribuidor', name: 'Distribuidor', area: 8, floor: 'Planta primera' },
  { type: 'Despacho', name: 'Estudio', area: 14, floor: 'Planta primera', orientation: 'S', notes: 'Con vigas vistas.' },
  // Fuera de la superficie útil.
  { type: 'Porche', name: 'Porche', area: 24, floor: 'Planta baja', orientation: 'S', notes: 'Cubierto, a la entrada de la casa.' },
  { type: 'Garaje', name: 'Cochera cubierta', area: 36, floor: 'Planta baja', notes: 'Dos coches; separada de la casa.' },
  { type: 'Trastero', name: 'Cuarto de aperos', area: 12, floor: 'Planta baja', notes: 'Para herramientas y leña.' },
]

const P19_DESCRIPTION = `Presentación. Casa tradicional asturiana de piedra, construida en ${P19.yearBuilt} y rehabilitada con mimo en ${P19.renovationYear}: ${P19.area} m² construidos (${P19.usableArea} m² útiles) en dos plantas, sobre una finca de ${P19.plotArea} m² con ${P19.gardenArea} m² de jardín y vistas a la sierra del Cuera.

Ubicación y entorno. En el barrio de Posada, en el concejo de Llanes: un pueblo tranquilo a unos diez minutos en coche de Llanes y de sus playas, con rutas a pie por la sierra desde la puerta de casa. Servicios básicos en el pueblo y comercio, centro de salud y colegios en Llanes. Datos del entorno orientativos, de demostración.

Distribución. Planta baja de 97 m² útiles con recibidor, salón con chimenea, cocina con office, un dormitorio, un baño y despensa-lavadero. Planta primera de 88 m² útiles con el dormitorio principal y su baño, dos dormitorios más, un baño, un estudio y el distribuidor.

Zona de día. El salón de 36 m² mantiene las vigas de madera vistas y una chimenea de piedra, con ventanas a la sierra. La cocina de 24 m² tiene office y conserva una cocina de leña tradicional junto a la encimera moderna.

Zona de noche. Cuatro dormitorios: uno en planta baja (14 m²) y tres en la primera —el principal, de 22 m², con baño en suite de 8 m²—, y un estudio de 14 m² que sirve de despacho o de quinta habitación.

Espacios exteriores. Finca de ${P19.plotArea} m² con ${P19.gardenArea} m² de jardín privado, porche cubierto de 24 m², cochera cubierta para dos coches (36 m²) y un cuarto de aperos de 12 m².

Antigüedad, estado y reformas. Casa de ${P19.yearBuilt}, rehabilitada en ${P19.renovationYear} conservando los muros de carga de piedra, las vigas y la carpintería de madera. En la rehabilitación se renovaron la cubierta, las instalaciones eléctrica y de fontanería, los baños y la cocina. Estado general excelente. Esta descripción es informativa: no sustituye a una inspección técnica.

Mantenimiento y mejoras. Mejoras posteriores: caldera de biomasa, placas solares para el agua caliente, aire acondicionado en el salón, alarma y fibra óptica. Mantenimiento recomendado: tratar la madera y revisar el rejuntado de la piedra cada pocos años, y repintar la carpintería exterior cuando haga falta. El cuarto de aperos no está reformado.

Instalaciones y equipamiento. Calefacción de biomasa, agua caliente solar, chimenea, doble acristalamiento en carpintería de madera, cocina equipada y armarios de madera a medida.

Características diferenciales. Piedra y madera originales con instalaciones modernas, una finca de ${P19.plotArea} m² y un entorno de montaña a diez minutos de las playas.

Perfil de comprador. Compradores de segunda residencia o de vivienda rural que valoren una casa con carácter, o familias que quieran vivir en el campo con servicios cerca.

Información comercial relevante. Encargo de venta en exclusiva con Norte Astur Inmobiliaria. Sin cuota de comunidad e IBI orientativo de 760 € al año. Vivienda libre. ${DEMO_NOTE}`

const P19_CONTENT: ReferenceContent = {
  key: 'p19',
  fields: {
    // Moneda del precio (Cola 11): euros, la de la demo.
    currency: 'EUR',
    commercialCode: 'LLA-0019',
    toilets: 0,
    livingRooms: 1,
    kitchens: 1,
    garageSpaces: 2,
    storageArea: 12,
    totalArea: 256,
    computableArea: 200,
    roomsTotal: 7,
    terracesCount: 0,
    balconiesCount: 0,
    storeroomsCount: 1,
    dressingRoomsCount: 0,
    studiesCount: 1,
    floorsCount: 2,
    buildingFloors: 2,
    buildingCondition: 'excellent',
    facade: 'stone',
    structure: 'load_bearing',
    kitchenEquipment: 'equipped',
    bathroomsCondition: 'renovated',
    flooring: 'tile',
    ceilingHeight: 2.5,
    isRenovated: true,
    installationsCondition: 'renovated',
    hasAirConditioning: true,
    hasUnderfloorHeating: false,
    hasFireplace: true,
    hasHomeAutomation: false,
    hasAlarm: true,
    hasFiber: true,
    hasSolarPanels: true,
    hasAerothermal: false,
    isBeachfront: false,
    hasPrivateGarden: true,
    hasPrivatePool: false,
    hasPorch: true,
    hasPatio: false,
    hasBalcony: false,
    priceMinAuthorized: 445_000,
    priceRecommended: 465_000,
    garbageTaxAnnual: 120,
    cadastralReference: 'DEMO0000000000000019',
    registryPropertyNumber: 'DEMO-FINCA-0019',
    landRegistry: 'Registro de la Propiedad ficticio (demostración)',
    encumbrances: 'Sin cargas declaradas por la propiedad. Dato de demostración: no procede de una nota simple real.',
    mortgageStatus: 'none',
    occupancyStatus: 'vacant',
    licenses: 'Licencia municipal de la rehabilitación de 2020 (demostración). No hay una licencia real que verificar.',
    habitabilityCertificate: 'DEMO — sin cédula real',
    iteStatus: 'not_required',
    energyCertificateNumber: 'DEMO-SIN-REGISTRO',
  },
  highlights: [
    'Piedra y madera originales, rehabilitada en 2020',
    `Finca de ${P19.plotArea} m² con ${P19.gardenArea} m² de jardín`,
    'Vistas a la sierra del Cuera',
    'Caldera de biomasa y agua caliente solar',
    'Cochera para dos coches y cuarto de aperos',
    'A 10 minutos de las playas de Llanes',
  ],
  description: P19_DESCRIPTION,
  rooms: P19_ROOMS,
  photos: [
    { path: 'propiedades/p19-01.jpg', room: 'facade', alt: 'Muro de piedra de la casa con tejado de teja y el monte al fondo', title: 'Fachada de piedra', description: 'Fachada lateral de piedra con ventanas de madera y camino de acceso.' },
    { path: 'propiedades/p19-02.jpg', room: 'living', alt: 'Salón con vigas de madera, chimenea de piedra, mesa de comedor y ventanas a la montaña', title: 'Salón con chimenea', description: 'Salón de vigas vistas y chimenea de piedra, con vistas a la sierra.' },
    { path: 'propiedades/p19-03.jpg', room: 'living', alt: 'Techo de vigas de madera con lámpara de forja y focos empotrados', title: 'Vigas del salón', description: 'Detalle del techo de vigas de madera.' },
    { path: 'propiedades/p19-04.jpg', room: null, alt: 'Aparador y armario de madera maciza junto a una ventana de carpintería de madera', title: 'Mobiliario de madera', description: 'Aparador y armario a medida, de madera maciza.' },
    { path: 'propiedades/p19-05.jpg', room: null, alt: 'Ventana de madera con doble acristalamiento que da al jardín', title: 'Carpintería de madera', description: 'Ventana de madera con doble acristalamiento, con vistas al jardín.' },
    { path: 'propiedades/p19-06.jpg', room: 'views', alt: 'Vista desde la ventana al camino, a un muro de piedra y al monte arbolado', title: 'Vistas desde la casa', description: 'Camino de acceso y monte, vistos desde una ventana de la casa.' },
    { path: 'asturias/picos-de-europa-01.jpg', room: 'exterior', alt: 'Montañas de los Picos de Europa con el Naranjo de Bulnes al fondo y prados verdes', title: 'Picos de Europa', description: 'Foto del entorno (macizo de los Picos de Europa), no de la vivienda.' },
  ],
  plans: [
    { file: 'planos/p19-planta-baja.png', title: 'Planta baja', category: 'Vivienda', unitType: 'Casa de piedra de 4 dormitorios', floorDetails: 'Recibidor, salón, cocina con office, dormitorio, baño, lavadero y porche', sizes: '97 m² útiles', type: 'Planta', floors: ['Planta baja'] },
    { file: 'planos/p19-planta-primera.png', title: 'Planta primera', category: 'Vivienda', unitType: 'Casa de piedra de 4 dormitorios', floorDetails: 'Dormitorio principal con baño, dos dormitorios, baño, estudio y distribuidor', sizes: '88 m² útiles', type: 'Planta', floors: ['Planta primera'] },
  ],
  documents: [
    {
      docType: 'other',
      title: 'Ficha comercial de la casa de Posada',
      visibility: 'authorized_buyer',
      issuedDays: 3,
      notes: 'Resumen comercial de la propiedad. Documento de demostración.',
      sections: [
        { heading: 'La propiedad', lines: [`Casa de piedra de ${P19.yearBuilt} rehabilitada en ${P19.renovationYear}, en Posada (Llanes).`, `${P19.area} m² construidos, ${P19.usableArea} m² útiles, finca de ${P19.plotArea} m² con ${P19.gardenArea} m² de jardín.`, `${P19.bedrooms} dormitorios y ${P19.bathrooms} baños, estudio, cochera para 2 coches.`] },
        { heading: 'Precio', lines: [`Precio de venta: ${n(P19.price)} €.`, `Precio por m² construido: ${n(Math.round(P19.price / P19.area))} €/m².`, 'Sin comunidad. IBI orientativo: 760 € al año.'] },
        { heading: 'Comercialización', lines: ['Encargo de venta en exclusiva de Norte Astur Inmobiliaria.', 'Disponible: vivienda libre.'] },
      ],
    },
    {
      docType: 'other',
      title: 'Informe descriptivo de antigüedad, estado y reformas',
      visibility: 'authorized_buyer',
      issuedDays: 4,
      notes: 'Descripción de la rehabilitación. No es una inspección ni un informe técnico acreditado. Documento de demostración.',
      sections: [
        { heading: 'Antigüedad', lines: [`Casa construida en ${P19.yearBuilt}. Rehabilitación integral en ${P19.renovationYear}.`] },
        { heading: 'Lo rehabilitado', lines: ['Cubierta de teja renovada. Instalaciones eléctrica y de fontanería nuevas. Cocina y tres baños reformados.', 'Se conservaron los muros de carga de piedra, las vigas de madera y la carpintería exterior de madera, ahora con doble acristalamiento.'] },
        { heading: 'Mantenimiento y necesidades', lines: ['Tratar la madera y revisar el rejuntado de la piedra cada pocos años; repintar la carpintería exterior cuando haga falta.', 'El cuarto de aperos no está reformado.'] },
        { heading: 'Aviso', lines: ['Informe descriptivo hecho por la agencia a partir de lo que declara la propiedad. No se ha realizado ninguna inspección técnica: no sustituye a un informe de un técnico competente.'] },
      ],
    },
    {
      docType: 'other',
      title: 'Resumen de instalaciones y mantenimiento',
      visibility: 'internal',
      issuedDays: 4,
      notes: 'Instalaciones y mejoras declaradas por la propiedad. Documento de demostración.',
      sections: [
        { heading: 'Climatización y agua caliente', lines: ['Calefacción por caldera de biomasa. Agua caliente con placas solares. Chimenea en el salón. Aire acondicionado en el salón.'] },
        { heading: 'Seguridad y comunicaciones', lines: ['Alarma. Fibra óptica hasta la vivienda.'] },
        { heading: 'Superficies', lines: P19_ROOMS.filter(isUsableRoom).map((r) => `${r.name}: ${r.area} m²`) },
      ],
    },
    {
      docType: 'other',
      title: 'Resumen de la situación documental declarada',
      visibility: 'internal',
      issuedDays: 4,
      notes: 'Lo que declara la propiedad; no sustituye a una nota simple ni a una escritura. Documento de demostración.',
      sections: [
        { heading: 'Declarado por la propiedad', lines: ['Libre de cargas e hipoteca. Propietaria única. Vivienda libre.', 'ITE no obligatoria. Cédula de habitabilidad: pendiente de aportar.'] },
        { heading: 'Por verificar antes de la venta', lines: ['Nota simple y escritura reales, recibo del IBI y licencia de la rehabilitación: la demo no incluye ninguno de ellos.'] },
      ],
    },
    {
      docType: 'mandate',
      title: 'Hoja de encargo de demostración',
      visibility: 'owner',
      issuedDays: 1,
      notes: 'Modelo de hoja de encargo ficticia: no obliga a nadie.',
      sections: [
        { heading: 'Encargo', lines: ['Venta en exclusiva de la casa de Posada por Norte Astur Inmobiliaria.', 'Vigencia: la que consta en la ficha (campo «Exclusividad» del editor).'] },
        { heading: 'Condiciones', lines: ['Comisión del 4 % + IVA. Sin firma ni sello: es un modelo ilustrativo de la cuenta demo.'] },
      ],
    },
  ],
  tags: ['Rehabilitada', 'Finca'],
  customFields: { orientacion_comercial: 'Segunda residencia', llaves: 'Caja de seguridad' },
  notApplicable: {
    ...COMMON_NA_ADMIN,
    ...COMMON_NA_COMMUNITY,
    ...COMMON_NA_MEDIA,
    terraceArea: 'No tiene terraza: el espacio cubierto es el porche.',
    floor: 'Vivienda independiente de dos plantas: no hay una planta única.',
    balconyArea: 'No tiene balcón.',
    officeArea: 'Uso residencial.',
    commercialArea: 'Uso residencial.',
    streetNumber: 'La ubicación que se publica es aproximada y sin número.',
    block: 'Vivienda independiente: no hay bloque.',
    portal: 'Vivienda independiente: no hay portal.',
    doorLetter: 'Vivienda independiente: no hay puerta con letra.',
    staircase: 'Vivienda independiente: no hay escalera comunitaria.',
    community: 'No pertenece a una urbanización con nombre.',
    buildingUnits: 'Vivienda independiente: no hay vecinos.',
    unitsPerFloor: 'Vivienda independiente.',
    hasConcierge: NO_COMMUNITY,
    hasDoorman: NO_COMMUNITY,
    serviceChargeAnnual: 'Dato anterior: la comunidad se indica en «Comunidad (mensual)».',
    priceOld: 'El precio no ha cambiado desde la captación.',
    paymentPlan: 'Reventa: el pago es al contado o con la hipoteca del comprador, sin plan de pagos.',
    location: 'Campo heredado: la dirección se indica con los campos de arriba.',
    priceChangeReason: 'Sólo se rellena al cambiar el precio desde el editor.',
    featuresReviewedAt: 'Se marca desde el editor al repasar las características.',
  },
}

/** Cada documento se llama «… (demostración)» (también en los listados, donde no se ve el PDF): nunca se hace pasar por uno real. */
const marked = (c: ReferenceContent): ReferenceContent => ({ ...c, documents: c.documents.map((d) => (/demostración/i.test(d.title) ? d : { ...d, title: `${d.title} (demostración)` })) })

export const REFERENCE_CONTENT: ReferenceContent[] = [P10_CONTENT, P02_CONTENT, P11_CONTENT, P19_CONTENT].map(marked)
