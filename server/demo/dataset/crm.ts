/**
 * El CRM de la cuenta demo: contactos, leads y necesidades. Todo ficticio
 * (emails en `.example`, teléfonos de la serie 600 0xx xxx escritos para la
 * demo; la empresa demo nunca llama ni escribe a nadie).
 *
 * `days`/`at` son el día y la hora (Madrid) respecto al anclaje.
 */

export interface DemoContact {
  key: string
  name: string
  email?: string
  phone?: string
  whatsapp?: boolean
  language: string
  country: string
  source: string
  commercial: string
  office: string
  roles: string[]
  tags?: string[]
  notes?: string
  days: number
  at: string
}

const mail = (local: string, domain = 'example.com') => `${local}@${domain}`

export const CONTACTS: DemoContact[] = [
  // Compradores con historia completa
  { key: 'c01', name: 'Laura Martínez Prieto', email: mail('laura.martinez'), phone: '+34 600 020 101', whatsapp: true, language: 'es', country: 'ES', source: 'web', commercial: 'com-lucia', office: 'o-oviedo', roles: ['buyer'], tags: ['Primera vivienda', 'Familia'], notes: 'Pareja con un hijo. Buscan su primera vivienda en propiedad en Oviedo; trabajan los dos en el HUCA.', days: -92, at: '09:14' },
  { key: 'c02', name: 'Sergio Prieto Llaneza', email: mail('sergio.prieto'), phone: '+34 600 020 102', whatsapp: true, language: 'es', country: 'ES', source: 'web', commercial: 'com-alvaro', office: 'o-gijon', roles: ['buyer'], days: 0, at: '09:14' },
  { key: 'c03', name: 'Andrés Cueto Arias', email: mail('andres.cueto'), phone: '+34 600 020 103', whatsapp: true, language: 'es', country: 'ES', source: 'portal', commercial: 'com-alvaro', office: 'o-gijon', roles: ['buyer'], tags: ['Familia', 'Hipoteca preaprobada'], notes: 'Buscan con su pareja, Nuria Fuente. Dos hijos en edad escolar: prioridad colegio cerca.', days: -38, at: '19:42' },
  { key: 'c04', name: 'Nuria Fuente Rubiera', email: mail('nuria.fuente'), phone: '+34 600 020 104', language: 'es', country: 'ES', source: 'portal', commercial: 'com-alvaro', office: 'o-gijon', roles: ['buyer'], notes: 'Pareja de Andrés Cueto: compran juntos.', days: -38, at: '19:50' },
  { key: 'c05', name: 'Thomas Weber', email: mail('thomas.weber', 'example.net'), phone: '+49 151 0000 0105', whatsapp: true, language: 'de', country: 'DE', source: 'web', commercial: 'com-paula', office: 'o-oriente', roles: ['buyer'], tags: ['Internacional', 'Segunda residencia'], notes: 'Jubilado alemán; pasa los veranos en Llanes desde hace diez años. Quiere casa de piedra con terreno.', days: -46, at: '11:05' },
  { key: 'c06', name: 'Rubén Iglesias Cabal', email: mail('ruben.iglesias'), phone: '+34 600 020 106', whatsapp: true, language: 'es', country: 'ES', source: 'portal', commercial: 'com-marta', office: 'o-gijon', roles: ['buyer'], tags: ['Segunda residencia'], days: -52, at: '21:18' },
  { key: 'c07', name: 'Covadonga Tamargo Villa', email: mail('covadonga.tamargo'), phone: '+34 600 020 107', language: 'es', country: 'ES', source: 'referral', commercial: 'com-marta', office: 'o-gijon', roles: ['buyer'], tags: ['Cliente', 'Recomendación'], notes: 'Compró el piso del centro de Avilés. Recomendada por un cliente anterior de la oficina.', days: -128, at: '10:30' },
  { key: 'c08', name: 'Óscar Rubiera Solís', email: mail('oscar.rubiera'), phone: '+34 600 020 108', language: 'es', country: 'ES', source: 'phone', commercial: 'com-diego', office: 'o-oviedo', roles: ['investor', 'buyer'], tags: ['Inversor', 'Pago al contado'], notes: 'Invierte en pisos para reformar y alquilar en el centro de Oviedo. Ya tiene tres en cartera.', days: -78, at: '12:20' },
  { key: 'c09', name: 'Sarah Collins', email: mail('sarah.collins', 'example.org'), phone: '+44 7700 900105', language: 'en', country: 'GB', source: 'web', commercial: 'com-javier', office: 'o-oriente', roles: ['buyer'], tags: ['Internacional', 'Cliente'], notes: 'Compró la casa de Selorio. Escribe siempre en inglés.', days: -168, at: '16:12' },
  { key: 'c10', name: 'Pablo Riestra Noval', email: mail('pablo.riestra'), phone: '+34 600 020 110', language: 'es', country: 'ES', source: 'portal', commercial: 'com-marta', office: 'o-gijon', roles: ['buyer'], days: -44, at: '20:05' },
  { key: 'c11', name: 'Irene Quirós Bango', email: mail('irene.quiros'), phone: '+34 600 020 111', whatsapp: true, language: 'es', country: 'ES', source: 'web', commercial: 'com-alvaro', office: 'o-gijon', roles: ['buyer'], tags: ['Primera vivienda'], days: -66, at: '13:40' },
  { key: 'c12', name: 'Héctor Tuñón Caso', email: mail('hector.tunon'), phone: '+34 600 020 112', language: 'es', country: 'ES', source: 'referral', commercial: 'com-alvaro', office: 'o-gijon', roles: ['buyer'], days: -88, at: '18:22' },
  { key: 'c13', name: 'Begoña Pañeda Vigón', email: mail('begona.paneda'), phone: '+34 600 020 113', whatsapp: true, language: 'es', country: 'ES', source: 'social', commercial: 'com-javier', office: 'o-oriente', roles: ['buyer'], tags: ['Familia'], days: -71, at: '22:10' },
  { key: 'c14', name: 'Marcos Ordóñez Blanco', email: mail('marcos.ordonez'), phone: '+34 600 020 114', language: 'es', country: 'ES', source: 'web', commercial: 'com-paula', office: 'o-oriente', roles: ['buyer'], tags: ['Segunda residencia'], days: -84, at: '10:02' },
  { key: 'c15', name: 'Claire Dubois', email: mail('claire.dubois', 'example.net'), phone: '+33 6 00 00 01 15', language: 'fr', country: 'FR', source: 'web', commercial: 'com-paula', office: 'o-oriente', roles: ['buyer'], tags: ['Internacional', 'Segunda residencia'], days: -21, at: '15:33' },
  { key: 'c16', name: 'Adrián Carreño Junquera', email: mail('adrian.carreno'), phone: '+34 600 020 116', whatsapp: true, language: 'es', country: 'ES', source: 'whatsapp', commercial: 'com-lucia', office: 'o-oviedo', roles: ['buyer'], days: -30, at: '08:55' },
  { key: 'c17', name: 'Elena Piñera Llano', email: mail('elena.pinera'), phone: '+34 600 020 117', language: 'es', country: 'ES', source: 'web', commercial: 'com-lucia', office: 'o-oviedo', roles: ['buyer'], tags: ['Ático'], days: -26, at: '17:48' },
  { key: 'c18', name: 'Iván Menéndez Rato', email: mail('ivan.menendez'), phone: '+34 600 020 118', language: 'es', country: 'ES', source: 'portal', commercial: 'com-diego', office: 'o-oviedo', roles: ['buyer'], days: -9, at: '12:15' },
  { key: 'c19', name: 'Silvia García Alonso', email: mail('silvia.garcia'), phone: '+34 600 020 119', language: 'es', country: 'ES', source: 'phone', commercial: 'com-marta', office: 'o-gijon', roles: ['buyer'], days: -14, at: '11:28' },
  { key: 'c20', name: 'Jorge Díaz Fernández', email: mail('jorge.diaz'), phone: '+34 600 020 120', whatsapp: true, language: 'es', country: 'ES', source: 'referral', commercial: 'com-diego', office: 'o-oviedo', roles: ['investor'], tags: ['Inversor'], notes: 'Busca rentabilidad bruta superior al 5 % para alquiler de larga estancia.', days: -40, at: '09:40' },
  { key: 'c21', name: 'Ana Belén Suárez Cueto', email: mail('anabelen.suarez'), phone: '+34 600 020 121', language: 'es', country: 'ES', source: 'walk_in', commercial: 'com-lucia', office: 'o-oviedo', roles: ['buyer'], days: -12, at: '18:05' },
  { key: 'c22', name: "Michael O'Brien", email: mail('michael.obrien', 'example.org'), phone: '+353 87 000 0122', language: 'en', country: 'IE', source: 'web', commercial: 'com-paula', office: 'o-oriente', roles: ['buyer'], tags: ['Internacional', 'Lujo'], days: -61, at: '14:50' },
  { key: 'c23', name: 'Patricia López Vigil', email: mail('patricia.lopez'), phone: '+34 600 020 123', language: 'es', country: 'ES', source: 'portal', commercial: 'com-marta', office: 'o-gijon', roles: ['buyer'], days: -6, at: '20:31' },
  { key: 'c24', name: 'Daniel Sánchez Arbesú', email: mail('daniel.sanchez'), phone: '+34 600 020 124', language: 'es', country: 'ES', source: 'social', commercial: 'com-alvaro', office: 'o-gijon', roles: ['buyer'], days: -2, at: '22:47' },
  { key: 'c25', name: 'Raquel Álvarez Cienfuegos', email: mail('raquel.alvarez'), phone: '+34 600 020 125', language: 'es', country: 'ES', source: 'web', commercial: 'com-lucia', office: 'o-oviedo', roles: ['buyer'], days: -1, at: '16:20' },
  { key: 'c26', name: 'Fernando Rodríguez Lastra', email: mail('fernando.rodriguez'), phone: '+34 600 020 126', language: 'es', country: 'ES', source: 'event', commercial: 'com-javier', office: 'o-oriente', roles: ['buyer'], days: -17, at: '12:00' },
  { key: 'c27', name: 'Alba Fernández Rionda', email: mail('alba.fernandez'), phone: '+34 600 020 127', language: 'es', country: 'ES', source: 'web', commercial: 'com-lucia', office: 'o-oviedo', roles: ['buyer'], days: -8, at: '10:37' },
  { key: 'c28', name: 'Luis Ángel Cabal Bango', email: mail('luisangel.cabal'), phone: '+34 600 020 128', language: 'es', country: 'ES', source: 'phone', commercial: 'com-diego', office: 'o-oviedo', roles: ['investor'], tags: ['Inversor'], days: -33, at: '13:12' },
  { key: 'c29', name: 'Mónica Valdés Argüelles', email: mail('monica.valdes'), phone: '+34 600 020 129', language: 'es', country: 'ES', source: 'portal', commercial: 'com-paula', office: 'o-oriente', roles: ['buyer'], days: -58, at: '19:15' },
  // Propietarios y vendedores (sus propiedades están en properties.ts)
  { key: 'c30', name: 'Víctor Alonso Peláez', email: mail('victor.alonso'), phone: '+34 600 020 130', language: 'es', country: 'ES', source: 'walk_in', commercial: 'com-lucia', office: 'o-oviedo', roles: ['owner', 'seller'], days: -112, at: '11:00' },
  { key: 'c31', name: 'Cristina Llaneza Sierra', email: mail('cristina.llaneza'), phone: '+34 600 020 131', language: 'es', country: 'ES', source: 'walk_in', commercial: 'com-lucia', office: 'o-oviedo', roles: ['owner', 'seller'], days: -112, at: '11:05' },
  { key: 'c32', name: 'Gonzalo Prieto Vallina', email: mail('gonzalo.prieto'), phone: '+34 600 020 132', language: 'es', country: 'ES', source: 'referral', commercial: 'com-diego', office: 'o-oviedo', roles: ['owner', 'seller'], notes: 'Heredó el piso de la calle Mon. Vive en Madrid: la gestión la lleva su representante, Lorena Vigón.', days: -87, at: '17:30' },
  { key: 'c33', name: 'Lorena Vigón Granda', email: mail('lorena.vigon'), phone: '+34 600 020 133', language: 'es', country: 'ES', source: 'referral', commercial: 'com-diego', office: 'o-oviedo', roles: ['other'], notes: 'Representante autorizada de Gonzalo Prieto para la venta.', days: -87, at: '17:35' },
  { key: 'c34', name: 'Roberto Fernández Tuya', email: mail('roberto.fernandez'), phone: '+34 600 020 134', whatsapp: true, language: 'es', country: 'ES', source: 'web', commercial: 'com-alvaro', office: 'o-gijon', roles: ['owner', 'seller', 'buyer'], tags: ['Multirol'], notes: 'Vende su piso de Viesques y busca algo más pequeño en obra nueva en Gijón.', days: -97, at: '09:25' },
  { key: 'c35', name: 'Natalia Suárez Coto', email: mail('natalia.suarez'), phone: '+34 600 020 135', language: 'es', country: 'ES', source: 'referral', commercial: 'com-alvaro', office: 'o-gijon', roles: ['owner', 'seller'], days: -132, at: '12:40' },
  { key: 'c36', name: 'Enrique Menéndez Llanos', email: mail('enrique.menendez'), phone: '+34 600 020 136', language: 'es', country: 'ES', source: 'referral', commercial: 'com-alvaro', office: 'o-gijon', roles: ['owner', 'seller'], days: -132, at: '12:45' },
  { key: 'c37', name: 'Rosa María Gutiérrez Laviana', email: mail('rosamaria.gutierrez'), phone: '+34 600 020 137', language: 'es', country: 'ES', source: 'walk_in', commercial: 'com-marta', office: 'o-gijon', roles: ['owner', 'seller'], tags: ['Cliente'], days: -167, at: '10:15' },
  { key: 'c38', name: 'José Manuel Carrio Feito', email: mail('josemanuel.carrio'), phone: '+34 600 020 138', language: 'es', country: 'ES', source: 'portal', commercial: 'com-marta', office: 'o-gijon', roles: ['owner', 'seller'], days: -102, at: '16:00' },
  { key: 'c39', name: 'Pilar Arias Cortina', email: mail('pilar.arias'), phone: '+34 600 020 139', language: 'es', country: 'ES', source: 'portal', commercial: 'com-marta', office: 'o-gijon', roles: ['owner', 'seller'], days: -57, at: '11:45' },
  { key: 'c40', name: 'Francisco Javier Mier Canal', email: mail('fjavier.mier'), phone: '+34 600 020 140', language: 'es', country: 'ES', source: 'walk_in', commercial: 'com-diego', office: 'o-oviedo', roles: ['owner', 'landlord', 'investor'], tags: ['Multirol', 'Gestión de alquiler'], notes: 'Nos confía la gestión del alquiler de su apartamento de Pola de Siero.', days: -72, at: '10:10' },
  { key: 'c41', name: 'Teresa Llano Rionda', email: mail('teresa.llano'), phone: '+34 600 020 141', language: 'es', country: 'ES', source: 'referral', commercial: 'com-paula', office: 'o-oriente', roles: ['owner', 'seller'], days: -127, at: '13:20' },
  { key: 'c42', name: 'Manuel Tamargo Viña', email: mail('manuel.tamargo'), phone: '+34 600 020 142', language: 'es', country: 'ES', source: 'walk_in', commercial: 'com-javier', office: 'o-oriente', roles: ['owner', 'seller'], tags: ['Cliente'], days: -179, at: '12:10' },
  { key: 'c43', name: 'Isabel Cuesta Morán', email: mail('isabel.cuesta'), phone: '+34 600 020 143', language: 'es', country: 'ES', source: 'walk_in', commercial: 'com-javier', office: 'o-oriente', roles: ['owner', 'seller'], tags: ['Cliente'], days: -179, at: '12:15' },
  { key: 'c44', name: 'Ramón Fueyo Castro', email: mail('ramon.fueyo'), phone: '+34 600 020 144', language: 'es', country: 'ES', source: 'portal', commercial: 'com-diego', office: 'o-oviedo', roles: ['tenant'], tags: ['Cliente'], days: -63, at: '18:40' },
  // Más compradores
  { key: 'c45', name: 'Aurora Cienfuegos Llera', email: mail('aurora.cienfuegos'), phone: '+34 600 020 145', language: 'es', country: 'ES', source: 'web', commercial: 'com-paula', office: 'o-oriente', roles: ['buyer'], days: 0, at: '08:40' },
  { key: 'c46', name: 'Alberto Riera Coalla', phone: '+34 600 020 146', whatsapp: true, language: 'es', country: 'ES', source: 'whatsapp', commercial: 'com-marta', office: 'o-gijon', roles: ['buyer'], days: -1, at: '20:12' },
  { key: 'c47', name: 'Marina Toral Pidal', email: mail('marina.toral'), phone: '+34 600 020 147', language: 'es', country: 'ES', source: 'portal', commercial: 'com-alvaro', office: 'o-gijon', roles: ['buyer'], days: -35, at: '09:58' },
  { key: 'c48', name: 'Carlos Velasco Iglesias', email: mail('carlos.velasco'), phone: '+34 600 020 148', language: 'es', country: 'ES', source: 'web', commercial: 'com-lucia', office: 'o-oviedo', roles: ['buyer'], days: -5, at: '13:25' },
  { key: 'c49', name: 'Sofía Bernardo Lago', email: mail('sofia.bernardo'), phone: '+34 600 020 149', language: 'es', country: 'ES', source: 'referral', commercial: 'com-javier', office: 'o-oriente', roles: ['buyer'], days: -24, at: '17:05' },
  { key: 'c50', name: 'David Somoano Pérez', email: mail('david.somoano'), phone: '+34 600 020 150', language: 'es', country: 'ES', source: 'phone', commercial: 'com-marta', office: 'o-gijon', roles: ['buyer'], days: -48, at: '12:50' },
  { key: 'c51', name: 'Lucía Ablanedo Rey', email: mail('lucia.ablanedo'), phone: '+34 600 020 151', whatsapp: true, language: 'es', country: 'ES', source: 'web', commercial: 'com-lucia', office: 'o-oviedo', roles: ['buyer'], days: -28, at: '21:30' },
  { key: 'c52', name: 'Hugo Cifuentes Sala', email: mail('hugo.cifuentes'), phone: '+34 600 020 152', language: 'es', country: 'ES', source: 'event', commercial: 'com-diego', office: 'o-oviedo', roles: ['investor'], tags: ['Inversor'], days: -16, at: '11:15' },
  { key: 'c53', name: 'Eva Montes Granda', email: mail('eva.montes'), phone: '+34 600 020 153', language: 'es', country: 'ES', source: 'walk_in', commercial: 'com-javier', office: 'o-oriente', roles: ['owner', 'seller'], notes: 'Quiere vender una casa familiar en Cangas de Onís. Pendiente de visita de captación.', days: -7, at: '12:30' },
  { key: 'c54', name: 'Alejandro Corripio Vega', email: mail('alejandro.corripio'), phone: '+34 600 020 154', language: 'es', country: 'ES', source: 'web', commercial: 'com-alvaro', office: 'o-gijon', roles: ['buyer'], days: -54, at: '10:44' },
]

/**
 * Leads. `stage` es la fase final a la que llega (el seed recorre las fases
 * intermedias con el servicio real, una a una, con su motivo y su fecha).
 * `contactAfterMin` = minutos hasta el primer contacto humano (sin él, sin
 * atender todavía). `lost` = se pierde en esa fase.
 */
export interface DemoLead {
  key: string
  contact: string
  source: string
  portal?: string
  campaign?: string
  utmSource?: string
  utmMedium?: string
  property?: string
  message: string
  budget?: number
  priority?: string
  stage: 'new' | 'contacted' | 'qualifying' | 'qualified' | 'viewing' | 'offer' | 'negotiation' | 'won'
  /** Días (desde la entrada) hasta cada fase: [contacted, qualifying, qualified, viewing, offer, negotiation, won]. */
  stageDays?: number[]
  lost?: { reason: 'no_response' | 'not_interested' | 'duplicate' | 'other'; note: string; afterDays: number }
  contactAfterMin?: number
  days: number
  at: string
}

export const LEADS: DemoLead[] = [
  // ── Nuevos (6) ──
  { key: 'L02', contact: 'c02', source: 'web', property: 'p04', message: 'Hola, me interesa el ático de La Arena. ¿Se puede visitar esta semana? Busco algo con vistas al mar para vivir todo el año.', budget: 620_000, priority: 'high', stage: 'new', days: 0, at: '09:14' },
  { key: 'L45', contact: 'c45', source: 'web', property: 'p06', message: '¿Siguen disponibles los bajos con jardín de Poo? Me gustaría recibir el plano y la memoria de calidades.', budget: 340_000, stage: 'new', days: 0, at: '08:40' },
  { key: 'L25', contact: 'c25', source: 'web', property: 'p02', message: 'Buenas tardes, ¿el ático del Campo San Francisco tiene plaza de garaje cerca?', stage: 'new', days: -1, at: '16:20', contactAfterMin: undefined },
  { key: 'L46', contact: 'c46', source: 'whatsapp', property: 'p17', message: 'Hola! Vi el ático de Candás en vuestro escaparate, ¿cuánto es de comunidad?', stage: 'new', days: -1, at: '20:12' },
  { key: 'L24', contact: 'c24', source: 'social', campaign: 'Instagram · Obra nueva Gijón', utmSource: 'instagram', utmMedium: 'social', property: 'p03', message: 'Me interesa Jardines de Viesques. ¿Hay pisos de 3 dormitorios?', stage: 'new', contactAfterMin: 690, days: -2, at: '22:47' },
  { key: 'L34', contact: 'c34', source: 'web', property: 'p03', message: 'Estoy vendiendo mi piso con vosotros y me interesa un 2 dormitorios de obra nueva en Gijón.', stage: 'new', contactAfterMin: 25, days: -3, at: '09:25' },
  // ── Contactados (7, dos perdidos) ──
  { key: 'L18', contact: 'c18', source: 'portal', portal: 'idealista', property: 'p12', message: 'Quisiera más información sobre el piso de la calle Mon. ¿Está libre de cargas?', stage: 'contacted', stageDays: [0], contactAfterMin: 22, days: -9, at: '12:15' },
  { key: 'L23', contact: 'c23', source: 'portal', portal: 'fotocasa', property: 'p16', message: '¿Se puede visitar el dúplex de Luanco el sábado por la mañana?', stage: 'contacted', stageDays: [0], contactAfterMin: 48, days: -6, at: '20:31' },
  { key: 'L27', contact: 'c27', source: 'ads', campaign: 'Google Ads · Pisos Oviedo', utmSource: 'google', utmMedium: 'cpc', property: 'p01', message: 'Solicito información sobre Residencial Montecerrao: precios y plazos de entrega.', stage: 'contacted', stageDays: [0], contactAfterMin: 15, days: -8, at: '10:37' },
  { key: 'L48', contact: 'c48', source: 'web', property: 'p11', message: '¿El piso de La Florida admite mascotas? Tenemos un perro mediano.', stage: 'contacted', stageDays: [1], contactAfterMin: 95, days: -5, at: '13:25' },
  { key: 'L53', contact: 'c53', source: 'walk_in', message: 'Pasó por la oficina de Llanes: quiere vender la casa familiar de Cangas de Onís y pide una valoración.', priority: 'high', stage: 'contacted', stageDays: [0], contactAfterMin: 5, days: -7, at: '12:30' },
  { key: 'L29', contact: 'c29', source: 'portal', portal: 'idealista', property: 'p19', message: 'Me interesa la casa de piedra de Posada. ¿Aceptarían una oferta?', stage: 'contacted', stageDays: [0], contactAfterMin: 35, lost: { reason: 'not_interested', note: 'Buscaba algo por debajo de 300.000 €; no encaja con la zona que quiere.', afterDays: 6 }, days: -58, at: '19:15' },
  { key: 'L50', contact: 'c50', source: 'call', property: 'p15', message: 'Llamó preguntando por pisos de 3 dormitorios en el centro de Avilés.', stage: 'contacted', stageDays: [0], contactAfterMin: 3, lost: { reason: 'no_response', note: 'Cuatro intentos de contacto sin respuesta en tres semanas.', afterDays: 21 }, days: -48, at: '12:50' },
  // ── Cualificando (5, uno perdido) ──
  { key: 'L19', contact: 'c19', source: 'call', message: 'Busca piso de 2 dormitorios en Gijón con ascensor obligatorio, hasta 220.000 €.', stage: 'qualifying', stageDays: [0, 1], contactAfterMin: 2, days: -14, at: '11:28' },
  { key: 'L21', contact: 'c21', source: 'walk_in', message: 'Visita a la oficina de Oviedo: busca un piso pequeño para su hija, que empieza a trabajar en Oviedo.', stage: 'qualifying', stageDays: [0, 2], contactAfterMin: 4, days: -12, at: '18:05' },
  { key: 'L26', contact: 'c26', source: 'event', campaign: 'Salón Inmobiliario de Asturias', message: 'Contacto en el stand: busca chalet con parcela en Villaviciosa para teletrabajar.', stage: 'qualifying', stageDays: [1, 3], contactAfterMin: 1440, days: -17, at: '12:00' },
  { key: 'L52', contact: 'c52', source: 'event', campaign: 'Salón Inmobiliario de Asturias', message: 'Inversor: busca piso para alquilar en Oviedo con rentabilidad superior al 5 %.', stage: 'qualifying', stageDays: [1, 4], contactAfterMin: 1300, days: -16, at: '11:15' },
  { key: 'L54', contact: 'c54', source: 'web', property: 'p13', message: 'Me interesa el piso de Viesques, ¿cuándo podría verlo?', stage: 'qualifying', stageDays: [0, 3], contactAfterMin: 40, lost: { reason: 'other', note: 'Ha comprado finalmente a través de otra agencia.', afterDays: 19 }, days: -54, at: '10:44' },
  // ── Cualificados (6) ──
  { key: 'L16', contact: 'c16', source: 'whatsapp', property: 'p01', message: 'Hola, ¿quedan pisos de 3 dormitorios en Montecerrao con terraza?', budget: 300_000, stage: 'qualified', stageDays: [0, 2, 5], contactAfterMin: 9, days: -30, at: '08:55' },
  { key: 'L20', contact: 'c20', source: 'referral', message: 'Recomendado por Óscar Rubiera: busca inversión para alquiler en Oviedo hasta 180.000 €.', budget: 180_000, priority: 'high', stage: 'qualified', stageDays: [0, 1, 3], contactAfterMin: 12, days: -40, at: '09:40' },
  { key: 'L28', contact: 'c28', source: 'call', message: 'Inversor de Oviedo: piso para reformar o alquilado en el centro.', budget: 200_000, stage: 'qualified', stageDays: [0, 2, 6], contactAfterMin: 6, days: -33, at: '13:12' },
  { key: 'L47', contact: 'c47', source: 'portal', portal: 'idealista', property: 'p03', message: '¿Jardines de Viesques tiene piscina? Busco 2 dormitorios con garaje.', budget: 250_000, stage: 'qualified', stageDays: [0, 3, 8], contactAfterMin: 31, days: -35, at: '09:58' },
  { key: 'L51', contact: 'c51', source: 'web', property: 'p11', message: 'Busco piso de 3 dormitorios en Oviedo, mejor con terraza. ¿Podéis avisarme de novedades?', budget: 280_000, stage: 'qualified', stageDays: [0, 2, 7], contactAfterMin: 18, days: -28, at: '21:30' },
  { key: 'L10', contact: 'c10', source: 'portal', portal: 'idealista', property: 'p17', message: 'Interesado en el ático de Candás. ¿Admiten negociación?', budget: 205_000, stage: 'qualified', stageDays: [0, 1, 4], contactAfterMin: 26, days: -44, at: '20:05' },
  // ── Visitando (5) ──
  { key: 'L03', contact: 'c03', source: 'portal', portal: 'idealista', property: 'p03', message: 'Buscamos piso de 3 dormitorios en Gijón cerca de colegios. ¿Tenéis algo más?', budget: 300_000, priority: 'high', stage: 'viewing', stageDays: [0, 1, 3, 30], contactAfterMin: 14, days: -38, at: '19:42' },
  { key: 'L15', contact: 'c15', source: 'web', property: 'p06', message: "Bonjour, je cherche une maison ou un appartement près de la plage dans l'est des Asturies. Est-il possible de visiter en octobre ?", budget: 470_000, stage: 'viewing', stageDays: [0, 2, 5, 12], contactAfterMin: 55, days: -21, at: '15:33' },
  { key: 'L17', contact: 'c17', source: 'web', property: 'p02', message: 'Me encanta el ático del Campo San Francisco. ¿Podría verlo con mi pareja?', budget: 560_000, stage: 'viewing', stageDays: [0, 1, 4, 8], contactAfterMin: 20, days: -26, at: '17:48' },
  { key: 'L49', contact: 'c49', source: 'referral', property: 'p08', message: 'Recomendada por Sarah Collins: busca casa con parcela cerca de Villaviciosa.', budget: 450_000, stage: 'viewing', stageDays: [0, 2, 6, 15], contactAfterMin: 28, days: -24, at: '17:05' },
  { key: 'L22', contact: 'c22', source: 'web', property: 'p10', message: 'Hello, I am interested in the sea-view villa in Celorio. Could we arrange a visit in two weeks?', budget: 900_000, priority: 'high', stage: 'viewing', stageDays: [0, 2, 5, 14], contactAfterMin: 42, days: -61, at: '14:50' },
  // ── Oferta (3) ──
  { key: 'L05', contact: 'c05', source: 'web', property: 'p19', message: 'Guten Tag, ich interessiere mich für das Steinhaus bei Llanes. Wann wäre eine Besichtigung möglich?', budget: 460_000, stage: 'offer', stageDays: [0, 2, 6, 20, 41], contactAfterMin: 64, days: -46, at: '11:05' },
  { key: 'L06', contact: 'c06', source: 'portal', portal: 'fotocasa', property: 'p16', message: 'Me interesa el dúplex de Luanco. ¿Tiene plaza de garaje cerca?', budget: 240_000, priority: 'high', stage: 'offer', stageDays: [0, 1, 4, 12, 24], contactAfterMin: 17, days: -52, at: '21:18' },
  { key: 'L12', contact: 'c12', source: 'referral', property: 'p14', message: 'Interesado en el chalet de Somió. Me lo recomendó un amigo que compró con vosotros.', budget: 850_000, stage: 'offer', stageDays: [0, 2, 9, 20, 32], contactAfterMin: 30, days: -88, at: '18:22' },
  // ── Negociación (5): operación en curso ──
  { key: 'L01', contact: 'c01', source: 'web', property: 'p01', message: 'Hola, nos interesa Residencial Montecerrao: buscamos 3 dormitorios con terraza. ¿Podemos ir a ver el piso piloto?', budget: 350_000, priority: 'high', stage: 'negotiation', stageDays: [0, 0, 1, 7, 26, 33], contactAfterMin: 14, days: -92, at: '09:14' },
  { key: 'L08', contact: 'c08', source: 'call', property: 'p12', message: 'Inversor habitual: pregunta por pisos para reformar en el casco antiguo de Oviedo.', budget: 180_000, stage: 'negotiation', stageDays: [0, 0, 2, 6, 18, 23], contactAfterMin: 1, days: -78, at: '12:20' },
  { key: 'L11', contact: 'c11', source: 'web', property: 'p13', message: '¿El piso de Viesques sigue disponible? Busco mi primera vivienda en Gijón.', budget: 260_000, stage: 'negotiation', stageDays: [0, 1, 4, 11, 36, 40], contactAfterMin: 8, days: -66, at: '13:40' },
  { key: 'L13', contact: 'c13', source: 'ads', campaign: 'Meta Ads · Casas con jardín', utmSource: 'facebook', utmMedium: 'paid_social', property: 'p09', message: 'Quiero información de las casas pareadas de Amandi, por favor.', budget: 350_000, stage: 'negotiation', stageDays: [0, 1, 3, 11, 24, 27], contactAfterMin: 47, days: -71, at: '22:10' },
  { key: 'L14', contact: 'c14', source: 'ads', campaign: 'Google Ads · Costa oriental', utmSource: 'google', utmMedium: 'cpc', property: 'p07', message: 'Me interesa el bajo con terraza junto a la playa de Santa Marina. ¿Precio final con garaje?', budget: 370_000, stage: 'negotiation', stageDays: [0, 1, 5, 15, 30, 34], contactAfterMin: 21, days: -84, at: '10:02' },
  // ── Ganados (3): operación cerrada ──
  { key: 'L07', contact: 'c07', source: 'referral', property: 'p15', message: 'Me recomendó vuestra oficina una amiga: busco piso de 3 dormitorios en Avilés centro.', budget: 150_000, stage: 'won', stageDays: [0, 0, 2, 9, 22, 28, 66], contactAfterMin: 11, days: -128, at: '10:30' },
  { key: 'L09', contact: 'c09', source: 'web', property: 'p20', message: 'Hello! We are looking for a traditional stone house near Villaviciosa with some land.', budget: 360_000, stage: 'won', stageDays: [0, 1, 4, 12, 26, 30, 48], contactAfterMin: 75, days: -168, at: '16:12' },
  { key: 'L44', contact: 'c44', source: 'portal', portal: 'fotocasa', property: 'p18', message: 'Busco apartamento en alquiler en Pola de Siero, con garaje, para entrar el mes que viene.', budget: 700, stage: 'won', stageDays: [0, 0, 1, 3, 6, 8, 13], contactAfterMin: 19, days: -63, at: '18:40' },
]

/** Necesidades de comprador (BuyerRequirement), con importancia por criterio. */
export interface DemoRequirement {
  key: string
  contact: string
  lead?: string
  title: string
  operation: 'sale' | 'rent'
  propertyTypes: string[]
  priceMin?: number
  priceMax: number
  areaMin?: number
  bedroomsMin?: number
  bathroomsMin?: number
  zones: { city: string; district?: string }[]
  buildPref?: string
  conditionPref?: string
  urgency?: string
  needsMortgage?: boolean
  mortgageStatus?: string
  desiredInDays?: number
  features?: Record<string, boolean>
  importances?: Record<string, 'required' | 'preferred' | 'indifferent'>
  notes?: string
  status?: 'active' | 'paused' | 'fulfilled' | 'archived'
  budgetValidated?: boolean
  days: number
}

export const REQUIREMENTS: DemoRequirement[] = [
  { key: 'r01', contact: 'c01', lead: 'L01', title: '3 dormitorios en Oviedo con terraza, hasta 350.000 €', operation: 'sale', propertyTypes: ['Apartment', 'Penthouse', 'Duplex'], priceMax: 350_000, areaMin: 90, bedroomsMin: 3, bathroomsMin: 2, zones: [{ city: 'Oviedo' }], urgency: 'high', needsMortgage: true, mortgageStatus: 'approved', desiredInDays: 120, features: { terrace: true, elevator: true }, importances: { propertyType: 'required', price: 'required', bedrooms: 'required', zone: 'required', terrace: 'required', elevator: 'preferred', garage: 'preferred' }, budgetValidated: true, days: -91 },
  { key: 'r03', contact: 'c03', lead: 'L03', title: 'Piso familiar de 3 dormitorios en Gijón cerca de colegios', operation: 'sale', propertyTypes: ['Apartment', 'Duplex', 'Penthouse'], priceMax: 300_000, bedroomsMin: 3, zones: [{ city: 'Gijón' }, { city: 'Luanco' }, { city: 'Candás' }], urgency: 'high', needsMortgage: true, mortgageStatus: 'preapproved', desiredInDays: 90, features: { elevator: true, garage: true }, importances: { price: 'required', bedrooms: 'required', zone: 'preferred', elevator: 'required', garage: 'preferred' }, budgetValidated: true, days: -37 },
  { key: 'r05', contact: 'c05', lead: 'L05', title: 'Casa de piedra con terreno cerca de Llanes', operation: 'sale', propertyTypes: ['House', 'Finca', 'Villa'], priceMax: 480_000, areaMin: 150, bedroomsMin: 3, zones: [{ city: 'Llanes' }, { city: 'Ribadesella' }], conditionPref: 'good', urgency: 'medium', needsMortgage: false, mortgageStatus: 'not_needed', desiredInDays: 180, features: { garden: true }, importances: { propertyType: 'required', price: 'required', zone: 'required', garden: 'required', area: 'preferred' }, budgetValidated: true, days: -44 },
  { key: 'r06', contact: 'c06', lead: 'L06', title: 'Segunda residencia en la costa central con vistas al mar', operation: 'sale', propertyTypes: ['Apartment', 'Duplex', 'Penthouse'], priceMax: 245_000, bedroomsMin: 2, zones: [{ city: 'Luanco' }, { city: 'Candás' }, { city: 'Gijón' }], urgency: 'medium', needsMortgage: true, mortgageStatus: 'preapproved', features: { terrace: true }, importances: { price: 'required', zone: 'required', terrace: 'preferred' }, budgetValidated: true, days: -50 },
  { key: 'r07', contact: 'c07', lead: 'L07', title: 'Piso de 3 dormitorios en el centro de Avilés', operation: 'sale', propertyTypes: ['Apartment'], priceMax: 155_000, bedroomsMin: 3, zones: [{ city: 'Avilés' }], needsMortgage: true, mortgageStatus: 'approved', importances: { price: 'required', zone: 'required', bedrooms: 'required', elevator: 'preferred' }, features: { elevator: true }, budgetValidated: true, status: 'fulfilled', days: -127 },
  { key: 'r08', contact: 'c08', lead: 'L08', title: 'Inversión: piso para reformar en el casco antiguo de Oviedo', operation: 'sale', propertyTypes: ['Apartment', 'Studio'], priceMax: 190_000, zones: [{ city: 'Oviedo', district: 'Centro' }], conditionPref: 'to_reform', buildPref: 'second_hand', urgency: 'medium', needsMortgage: false, mortgageStatus: 'not_needed', importances: { price: 'required', zone: 'required', condition: 'preferred' }, budgetValidated: true, days: -77 },
  { key: 'r09', contact: 'c09', lead: 'L09', title: 'Casa tradicional con terreno cerca de Villaviciosa', operation: 'sale', propertyTypes: ['House', 'Finca'], priceMax: 360_000, bedroomsMin: 3, zones: [{ city: 'Villaviciosa' }], needsMortgage: false, mortgageStatus: 'not_needed', features: { garden: true }, importances: { propertyType: 'required', price: 'required', zone: 'required', garden: 'required' }, budgetValidated: true, status: 'fulfilled', days: -166 },
  { key: 'r10', contact: 'c10', lead: 'L10', title: 'Ático o piso con terraza en Candás o Luanco', operation: 'sale', propertyTypes: ['Penthouse', 'Apartment'], priceMax: 210_000, bedroomsMin: 2, zones: [{ city: 'Candás' }, { city: 'Luanco' }], needsMortgage: true, mortgageStatus: 'requested', features: { terrace: true }, importances: { price: 'required', zone: 'required', terrace: 'required' }, days: -43 },
  { key: 'r11', contact: 'c11', lead: 'L11', title: 'Primera vivienda: 3 dormitorios en Gijón con garaje', operation: 'sale', propertyTypes: ['Apartment'], priceMax: 260_000, bedroomsMin: 3, zones: [{ city: 'Gijón' }], needsMortgage: true, mortgageStatus: 'approved', features: { garage: true, elevator: true }, importances: { price: 'required', bedrooms: 'required', zone: 'required', garage: 'preferred', elevator: 'required' }, budgetValidated: true, days: -65 },
  { key: 'r12', contact: 'c12', lead: 'L12', title: 'Chalet con jardín en Somió o alrededores de Gijón', operation: 'sale', propertyTypes: ['Villa', 'House'], priceMax: 850_000, bedroomsMin: 4, zones: [{ city: 'Gijón', district: 'Somió' }, { city: 'Gijón' }], features: { garden: true, garage: true }, importances: { propertyType: 'required', price: 'required', zone: 'preferred', garden: 'required' }, needsMortgage: true, mortgageStatus: 'requested', days: -86 },
  { key: 'r13', contact: 'c13', lead: 'L13', title: 'Casa con jardín para familia en Villaviciosa', operation: 'sale', propertyTypes: ['House', 'Villa', 'Townhouse'], priceMax: 360_000, bedroomsMin: 3, zones: [{ city: 'Villaviciosa' }], buildPref: 'new', features: { garden: true, pets: true }, importances: { price: 'required', zone: 'required', garden: 'required', build: 'preferred' }, needsMortgage: true, mortgageStatus: 'approved', budgetValidated: true, days: -70 },
  { key: 'r14', contact: 'c14', lead: 'L14', title: 'Segunda residencia junto a la playa en Ribadesella o Llanes', operation: 'sale', propertyTypes: ['Apartment'], priceMax: 370_000, bedroomsMin: 2, zones: [{ city: 'Ribadesella' }, { city: 'Llanes' }], features: { terrace: true }, importances: { price: 'required', zone: 'required', terrace: 'preferred' }, needsMortgage: true, mortgageStatus: 'approved', budgetValidated: true, days: -83 },
  { key: 'r15', contact: 'c15', lead: 'L15', title: 'Vivienda cerca de la playa en el oriente de Asturias', operation: 'sale', propertyTypes: ['Apartment', 'House'], priceMax: 470_000, bedroomsMin: 2, zones: [{ city: 'Llanes' }, { city: 'Ribadesella' }, { city: 'Villaviciosa' }], features: { garden: true }, importances: { zone: 'required', price: 'required', garden: 'preferred' }, needsMortgage: false, mortgageStatus: 'not_needed', budgetValidated: true, days: -19 },
  { key: 'r16', contact: 'c16', lead: 'L16', title: 'Obra nueva de 3 dormitorios con terraza en Oviedo', operation: 'sale', propertyTypes: ['Apartment'], priceMax: 300_000, bedroomsMin: 3, zones: [{ city: 'Oviedo' }], buildPref: 'new', features: { terrace: true, garage: true }, importances: { price: 'required', bedrooms: 'required', build: 'required', terrace: 'preferred' }, needsMortgage: true, mortgageStatus: 'preapproved', budgetValidated: true, desiredInDays: 240, days: -26 },
  { key: 'r17', contact: 'c17', lead: 'L17', title: 'Ático con terraza en Oviedo o Gijón', operation: 'sale', propertyTypes: ['Penthouse'], priceMax: 600_000, bedroomsMin: 2, zones: [{ city: 'Oviedo' }, { city: 'Gijón' }], features: { terrace: true, elevator: true }, importances: { propertyType: 'required', terrace: 'required', price: 'required', zone: 'preferred' }, needsMortgage: true, mortgageStatus: 'requested', days: -24 },
  { key: 'r19', contact: 'c19', lead: 'L19', title: 'Piso de 2 dormitorios en Gijón, ascensor obligatorio', operation: 'sale', propertyTypes: ['Apartment'], priceMax: 220_000, bedroomsMin: 2, zones: [{ city: 'Gijón' }], features: { elevator: true }, importances: { elevator: 'required', price: 'required', zone: 'required' }, needsMortgage: true, mortgageStatus: 'required', days: -13 },
  { key: 'r20', contact: 'c20', lead: 'L20', title: 'Inversión para alquiler en Oviedo hasta 180.000 €', operation: 'sale', propertyTypes: ['Apartment', 'Studio'], priceMax: 180_000, zones: [{ city: 'Oviedo' }, { city: 'Pola de Siero' }], buildPref: 'second_hand', importances: { price: 'required', zone: 'preferred' }, needsMortgage: false, mortgageStatus: 'not_needed', budgetValidated: true, days: -39 },
  { key: 'r21', contact: 'c21', lead: 'L21', title: 'Piso pequeño para estudiante en Oviedo', operation: 'sale', propertyTypes: ['Apartment', 'Studio'], priceMax: 150_000, bedroomsMin: 1, zones: [{ city: 'Oviedo' }], importances: { price: 'required', zone: 'required' }, needsMortgage: true, mortgageStatus: 'required', days: -10 },
  { key: 'r22', contact: 'c22', lead: 'L22', title: 'Villa con vistas al mar en el oriente de Asturias', operation: 'sale', propertyTypes: ['Villa', 'House'], priceMax: 850_000, bedroomsMin: 4, zones: [{ city: 'Llanes' }, { city: 'Ribadesella' }], features: { garden: true, pool: true }, importances: { propertyType: 'required', zone: 'required', price: 'preferred', pool: 'preferred', garden: 'required' }, needsMortgage: false, mortgageStatus: 'not_needed', budgetValidated: true, days: -59 },
  { key: 'r26', contact: 'c26', lead: 'L26', title: 'Chalet en Villaviciosa con parcela', operation: 'sale', propertyTypes: ['House', 'Villa'], priceMax: 450_000, areaMin: 140, zones: [{ city: 'Villaviciosa' }], features: { garden: true }, importances: { zone: 'required', garden: 'required', price: 'required' }, needsMortgage: true, mortgageStatus: 'requested', days: -15 },
  { key: 'r28', contact: 'c28', lead: 'L28', title: 'Piso para reformar o alquilado en el centro de Oviedo', operation: 'sale', propertyTypes: ['Apartment'], priceMax: 200_000, zones: [{ city: 'Oviedo', district: 'Centro' }], conditionPref: 'any', importances: { zone: 'required', price: 'required' }, needsMortgage: false, mortgageStatus: 'not_needed', budgetValidated: true, days: -30 },
  { key: 'r34', contact: 'c34', lead: 'L34', title: 'Obra nueva de 2 dormitorios en Gijón', operation: 'sale', propertyTypes: ['Apartment'], priceMax: 260_000, bedroomsMin: 2, zones: [{ city: 'Gijón' }], buildPref: 'new', features: { garage: true }, importances: { build: 'required', zone: 'required', price: 'preferred' }, needsMortgage: false, mortgageStatus: 'not_needed', days: -3 },
  { key: 'r47', contact: 'c47', lead: 'L47', title: 'Piso de 2 dormitorios con garaje en Gijón, mejor con piscina', operation: 'sale', propertyTypes: ['Apartment'], priceMax: 250_000, bedroomsMin: 2, zones: [{ city: 'Gijón' }], features: { garage: true, pool: true }, importances: { price: 'required', garage: 'required', pool: 'preferred', zone: 'required' }, needsMortgage: true, mortgageStatus: 'preapproved', budgetValidated: true, days: -31 },
  { key: 'r49', contact: 'c49', lead: 'L49', title: 'Casa con parcela cerca de Villaviciosa', operation: 'sale', propertyTypes: ['House', 'Villa'], priceMax: 450_000, bedroomsMin: 3, zones: [{ city: 'Villaviciosa' }], features: { garden: true }, importances: { zone: 'required', garden: 'required', price: 'required' }, needsMortgage: true, mortgageStatus: 'preapproved', budgetValidated: true, days: -22 },
  { key: 'r51', contact: 'c51', lead: 'L51', title: 'Piso de 3 dormitorios en Oviedo, mejor con terraza', operation: 'sale', propertyTypes: ['Apartment', 'Duplex'], priceMax: 280_000, bedroomsMin: 3, zones: [{ city: 'Oviedo' }], features: { terrace: true }, importances: { price: 'required', bedrooms: 'required', terrace: 'preferred', zone: 'required' }, needsMortgage: true, mortgageStatus: 'preapproved', days: -26 },
  { key: 'r52', contact: 'c52', lead: 'L52', title: 'Inversión para alquiler en Oviedo, rentabilidad > 5 %', operation: 'sale', propertyTypes: ['Apartment', 'Studio'], priceMax: 190_000, zones: [{ city: 'Oviedo' }], importances: { price: 'required', zone: 'preferred' }, needsMortgage: false, mortgageStatus: 'not_needed', days: -14 },
]
