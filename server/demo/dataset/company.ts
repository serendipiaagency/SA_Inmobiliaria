/**
 * Cuenta demo «Norte Astur Inmobiliaria»: la empresa y su equipo.
 *
 * Todo es FICTICIO. Las localidades son reales (Asturias), pero ninguna
 * dirección lleva número de portal y ningún dato identifica a una persona o
 * un negocio reales:
 * - emails en el dominio reservado `.example` (RFC 2606), que no entrega
 *   correo a nadie;
 * - teléfonos de la serie 600 01x xxx / 985 000 1xx, escritos para la demo;
 * - la plataforma no los marca nunca: la empresa demo no envía nada fuera
 *   (server/utils/demo/tenant.ts).
 */

export const DEMO_COMPANY = {
  name: 'Norte Astur Inmobiliaria',
  companyName: 'Norte Astur',
  description: 'Inmobiliaria especializada en vivienda residencial, obra nueva, segunda mano e inversión en Asturias.',
  brandColor: '#1F4E5F',
  secondaryColor: '#4F7C5A',
  accentColor: '#C9A24A',
  backgroundColor: '#F7F5F0',
  textColor: '#1C2B33',
  fontHeading: 'Playfair Display',
  fontBody: 'Montserrat',
  email: 'info@norteastur.example',
  phone: '+34 985 000 100',
  whatsapp: '+34 600 010 100',
  website: 'https://norteastur.example',
  legalCompanyName: 'Norte Astur Inmobiliaria (empresa ficticia de demostración)',
  taxId: 'DEMO-0000000',
  legalAddress: 'Oviedo, Asturias (dirección de demostración)',
  legalEmail: 'legal@norteastur.example',
  legalText: 'Norte Astur Inmobiliaria es una empresa ficticia creada para demostrar Portal INMO. Ningún inmueble, persona ni operación de esta cuenta es real.',
  zones: ['Oviedo', 'Gijón', 'Avilés', 'Llanes', 'Ribadesella', 'Villaviciosa', 'Luanco'],
  currency: 'EUR',
  timezone: 'Europe/Madrid',
  locale: 'es',
}

/** El usuario con el que se enseña la demo: administrador de la empresa, nunca super admin. */
export const DEMO_ADMIN = {
  key: 'u-admin',
  name: 'Carmen Valdés',
  email: 'demo@portalinmo',
}

/**
 * Hash de la contraseña inicial del usuario demo, en el formato del sistema
 * real de autenticación (server/utils/auth.ts → hashPassword: PBKDF2-SHA256,
 * 100.000 iteraciones, sal aleatoria). En el repositorio no hay ninguna
 * contraseña, sólo este hash. Se puede sustituir sin tocar código con la
 * variable `DEMO_ADMIN_PASSWORD_HASH` del Worker.
 */
export const DEMO_ADMIN_PASSWORD_HASH_DEFAULT = 'pbkdf2$100000$r7sQSng2uiTEIPrts2TzJg==$mvEcMXXVxABCI461UjHjJeD1pwAaSrGx5nNll6wrtq0='

export const OFFICES = [
  { key: 'o-oviedo', name: 'Oviedo Centro', code: 'OVI', city: 'Oviedo', postalCode: '33003', address: 'Centro de Oviedo (dirección de demostración)', phone: '+34 985 000 110', email: 'oviedo@norteastur.example', photo: 'oficinas/oficina-01.jpg' },
  { key: 'o-gijon', name: 'Gijón', code: 'GIJ', city: 'Gijón', postalCode: '33201', address: 'Centro de Gijón (dirección de demostración)', phone: '+34 985 000 120', email: 'gijon@norteastur.example', photo: 'oficinas/oficina-02.jpg' },
  { key: 'o-oriente', name: 'Oriente de Asturias', code: 'ORI', city: 'Llanes', postalCode: '33500', address: 'Llanes (dirección de demostración)', phone: '+34 985 000 130', email: 'oriente@norteastur.example', photo: 'oficinas/oficina-03.jpg' },
] as const

export const TEAMS = [
  { key: 't-oviedo', name: 'Equipo Oviedo', office: 'o-oviedo', lead: 'com-lucia', description: 'Vivienda familiar, obra nueva e inversión en Oviedo y la zona centro.' },
  { key: 't-gijon', name: 'Equipo Gijón', office: 'o-gijon', lead: 'com-alvaro', description: 'Gijón, Avilés y la costa central: Luanco, Candás y alrededores.' },
  { key: 't-oriente', name: 'Equipo Costa Oriental', office: 'o-oriente', lead: 'com-paula', description: 'Llanes, Ribadesella, Villaviciosa y el oriente: segunda residencia y casas con terreno.' },
] as const

/** Lo que puede hacer un comercial en el panel: CRM, web y bandeja. Sin finanzas ni sistema. */
export const COMMERCIAL_PERMISSIONS = JSON.stringify(['general:read', 'crm:read', 'crm:write', 'web:read', 'web:write', 'inbox:read', 'inbox:write', 'content:read'])

export const COMMERCIALS = [
  {
    key: 'com-lucia',
    name: 'Lucía Fernández',
    position: 'Directora comercial · Oviedo',
    office: 'o-oviedo',
    team: 't-oviedo',
    email: 'lucia.fernandez@norteastur.example',
    phone: '+34 600 010 101',
    languages: ['es', 'en'],
    zones: ['Oviedo', 'Siero'],
    propertyTypes: ['Apartment', 'Penthouse', 'Duplex'],
    specialties: 'Vivienda familiar y obra nueva en Oviedo',
    experience: '12 años',
    hireDate: '2016-09-01',
    description: 'Lleva más de una década acompañando a familias que compran su primera vivienda en Oviedo. Conoce cada barrio, de Montecerrao a La Florida.',
    photo: 'personas/com-lucia.jpg',
  },
  {
    key: 'com-diego',
    name: 'Diego Álvarez',
    position: 'Asesor inmobiliario · Inversión',
    office: 'o-oviedo',
    team: 't-oviedo',
    email: 'diego.alvarez@norteastur.example',
    phone: '+34 600 010 102',
    languages: ['es'],
    zones: ['Oviedo', 'Siero'],
    propertyTypes: ['Apartment', 'Studio', 'Building'],
    specialties: 'Inversión, alquiler y pisos para reformar',
    experience: '6 años',
    hireDate: '2020-02-10',
    description: 'Especialista en inversión: rentabilidades, reformas y gestión de alquileres en Oviedo y Siero.',
    photo: 'personas/com-diego.jpg',
  },
  {
    key: 'com-alvaro',
    name: 'Álvaro Suárez',
    position: 'Responsable de oficina · Gijón',
    office: 'o-gijon',
    team: 't-gijon',
    email: 'alvaro.suarez@norteastur.example',
    phone: '+34 600 010 103',
    languages: ['es', 'en', 'fr'],
    zones: ['Gijón'],
    propertyTypes: ['Apartment', 'Penthouse', 'Villa', 'House'],
    specialties: 'Gijón: Somió, La Arena, Viesques y Cimadevilla',
    experience: '10 años',
    hireDate: '2017-05-15',
    description: 'Dirige la oficina de Gijón. Especialista en viviendas con vistas al mar y chalets en Somió.',
    photo: 'personas/com-alvaro.jpg',
  },
  {
    key: 'com-marta',
    name: 'Marta Castaño',
    position: 'Asesora inmobiliaria · Costa central',
    office: 'o-gijon',
    team: 't-gijon',
    email: 'marta.castano@norteastur.example',
    phone: '+34 600 010 104',
    languages: ['es', 'en'],
    zones: ['Gijón', 'Avilés', 'Luanco', 'Candás'],
    propertyTypes: ['Apartment', 'Penthouse', 'Duplex'],
    specialties: 'Avilés y los pueblos marineros de la costa central',
    experience: '5 años',
    hireDate: '2021-03-01',
    description: 'Conoce como nadie Avilés, Luanco y Candás. Acompaña a compradores de primera vivienda y de segunda residencia.',
    photo: 'personas/com-marta.jpg',
  },
  {
    key: 'com-paula',
    name: 'Paula Menéndez',
    position: 'Responsable de oficina · Oriente',
    office: 'o-oriente',
    team: 't-oriente',
    email: 'paula.menendez@norteastur.example',
    phone: '+34 600 010 105',
    languages: ['es', 'en', 'de'],
    zones: ['Llanes', 'Ribadesella', 'Cangas de Onís'],
    propertyTypes: ['House', 'Villa', 'Finca', 'Apartment'],
    specialties: 'Segunda residencia y clientes internacionales en el oriente',
    experience: '9 años',
    hireDate: '2018-04-02',
    description: 'Responsable de la oficina de Llanes. Trabaja con muchos compradores de Alemania y Reino Unido que buscan casa en la costa.',
    photo: 'personas/com-paula.jpg',
  },
  {
    key: 'com-javier',
    name: 'Javier Alonso',
    position: 'Asesor inmobiliario · Oriente',
    office: 'o-oriente',
    team: 't-oriente',
    email: 'javier.alonso@norteastur.example',
    phone: '+34 600 010 106',
    languages: ['es', 'en'],
    zones: ['Villaviciosa', 'Ribadesella', 'Llanes'],
    propertyTypes: ['House', 'Finca', 'Villa'],
    specialties: 'Casas de piedra, fincas y obra nueva en Villaviciosa',
    experience: '4 años',
    hireDate: '2022-01-17',
    description: 'Especialista en casas rurales rehabilitadas y obra nueva en la comarca de la sidra.',
    photo: 'personas/com-javier.jpg',
  },
] as const

export type CommercialKey = (typeof COMMERCIALS)[number]['key']

export const DEVELOPERS = [
  { key: 'dev-cantabrico', name: 'Cantábrico Norte Promociones', email: 'promociones@cantabriconorte.example', phone: '+34 985 000 140', description: 'Promotora ficticia de la demo: residenciales de obra nueva en Oviedo, Gijón y Avilés.', logo: 'marca/promotora-cantabrico.png' },
  { key: 'dev-sella', name: 'Viviendas del Sella', email: 'info@viviendasdelsella.example', phone: '+34 985 000 150', description: 'Promotora ficticia de la demo: vivienda de costa y casas con parcela en el oriente de Asturias.', logo: 'marca/promotora-sella.png' },
] as const

/** «Comunidades» del producto: urbanizaciones y residenciales con su zona. */
export const COMMUNITIES = [
  { key: 'cm-montecerrao', name: 'Residencial Montecerrao', location: 'Montecerrao, Oviedo', image: 'asturias/oviedo-01.jpg', description: 'Barrio residencial moderno al sur de Oviedo, con zonas verdes, colegios y acceso directo a la autovía.', featureDescription: 'Zonas verdes · Colegios · Comercio de barrio · A 10 minutos del centro' },
  { key: 'cm-viesques', name: 'Jardines de Viesques', location: 'Viesques, Gijón', image: 'asturias/gijon-01.jpg', description: 'Residencial tranquilo junto al Parque de Viesques y el campus universitario, a un paseo de la playa.', featureDescription: 'Parque · Campus · Carril bici · Cerca de la playa' },
  { key: 'cm-mirador', name: 'Mirador del Cantábrico', location: 'La Arena, Gijón', image: 'asturias/gijon-02.jpg', description: 'Viviendas con vistas al mar en primera línea de La Arena, junto al paseo marítimo.', featureDescription: 'Vistas al mar · Paseo marítimo · Ocio y restauración' },
  { key: 'cm-magdalena', name: 'Residencial La Magdalena', location: 'La Magdalena, Avilés', image: 'asturias/aviles-01.jpg', description: 'Obra nueva en un barrio consolidado de Avilés, a cinco minutos del casco histórico.', featureDescription: 'Casco histórico · Servicios · Transporte público' },
  { key: 'cm-llanes', name: 'Costa de Llanes Residences', location: 'Celorio, Llanes', image: 'asturias/llanes-01.jpg', description: 'Pequeño residencial de costa entre las playas de Celorio y Poo, con jardines y vistas al Cantábrico.', featureDescription: 'Playas · Senda costera · Vistas al mar' },
  { key: 'cm-amandi', name: 'Villas de Amandi', location: 'Amandi, Villaviciosa', image: 'asturias/rural-01.jpg', description: 'Casas con parcela en un entorno de pomaradas, a tres kilómetros de la villa de Villaviciosa.', featureDescription: 'Parcela propia · Entorno rural · Cerca de la ría' },
  { key: 'cm-santamarina', name: 'Residencial Santa Marina', location: 'Santa Marina, Ribadesella', image: 'asturias/ribadesella-01.jpg', description: 'Viviendas junto a la playa de Santa Marina, a un paseo del puerto de Ribadesella.', featureDescription: 'Playa · Puerto · Picos de Europa a 30 minutos' },
] as const
