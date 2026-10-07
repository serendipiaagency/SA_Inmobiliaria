/**
 * Comunicaciones de la cuenta demo: conversaciones del chat de la web (con su
 * respuesta por el propio chat y notas internas), llamadas hechas por teléfono
 * y anotadas a mano con su resultado, y notas sobre fichas.
 *
 * Nada de esto sale de la plataforma: el chat web se guarda y lo lee el
 * visitante en el widget; las llamadas son registros manuales (proveedor
 * «manual»), no llamadas. No hay conversaciones de WhatsApp: necesitarían un
 * canal conectado con credenciales reales, y la demo no tiene ni debe tenerlas.
 */

export interface DemoChatMessage {
  /** Minutos desde el primer mensaje. */
  after: number
  from: 'visitor' | 'agent' | 'note'
  text: string
}

export interface DemoChat {
  key: string
  /** Persona del CRM a la que pertenece (si se identificó). */
  contact?: string
  lead?: string
  property?: string
  commercial: string
  visitor: { name: string; email?: string; phone?: string }
  days: number
  at: string
  messages: DemoChatMessage[]
  /** Leída por el equipo (sin pendientes) y estado final del hilo. */
  read: boolean
  status: 'open' | 'pending' | 'closed'
  topic: string
}

export const CHATS: DemoChat[] = [
  {
    key: 'ch01', topic: 'Documentación', contact: 'c01', lead: 'L01', property: 'p01', commercial: 'com-lucia',
    visitor: { name: 'Laura Martínez Prieto' }, days: -35, at: '18:40', read: true, status: 'closed',
    messages: [
      { after: 0, from: 'visitor', text: 'Hola Lucía, ¿qué documentación tengo que llevar a la firma de las arras y después a la notaría?' },
      { after: 12, from: 'agent', text: 'Hola Laura: para las arras, el DNI y la aprobación de la hipoteca. Para la escritura te pediremos además la tasación del banco. Te lo dejo por escrito en la próxima cita.' },
      { after: 31, from: 'visitor', text: 'Perfecto, gracias. ¿La plaza de garaje y el trastero van en la misma escritura?' },
      { after: 44, from: 'agent', text: 'Sí: garaje y trastero van como anejos de la vivienda, en la misma escritura.' },
      { after: 50, from: 'note', text: 'Pedir a la promotora la nota simple actualizada antes de notaría.' },
    ],
  },
  {
    key: 'ch02', topic: 'Solicitud de información', contact: 'c05', lead: 'L05', property: 'p19', commercial: 'com-paula',
    visitor: { name: 'Thomas Weber' }, days: -44, at: '09:20', read: true, status: 'closed',
    messages: [
      { after: 0, from: 'visitor', text: 'Hello, is the stone house near Llanes still available? We would like to see it in two weeks.' },
      { after: 25, from: 'agent', text: 'Hello Thomas, yes, it is available. I can show it to you any morning; tell me which days suit you best.' },
      { after: 70, from: 'visitor', text: 'Saturday mornings work best for us. Thank you, Paula!' },
      { after: 75, from: 'note', text: 'Cliente alemán con vivienda actual vendida: compra sin financiación. Preparar visita con la casa ventilada.' },
    ],
  },
  {
    key: 'ch03', topic: 'Solicitud de información', property: 'p10', commercial: 'com-paula',
    visitor: { name: 'Visitante de la web' }, days: -3, at: '21:15', read: false, status: 'open',
    messages: [{ after: 0, from: 'visitor', text: 'Buenas noches, ¿la villa de Celorio admite uso turístico? ¿Y los gastos de comunidad cuánto son?' }],
  },
  {
    key: 'ch04', topic: 'Confirmación de visita', contact: 'c03', lead: 'L03', property: 'p03', commercial: 'com-alvaro',
    visitor: { name: 'Andrés Cueto Arias' }, days: -1, at: '19:05', read: true, status: 'open',
    messages: [
      { after: 0, from: 'visitor', text: 'Hola Álvaro, os escribo para confirmar el recorrido por los tres pisos.' },
      { after: 18, from: 'agent', text: 'Confirmado, Andrés: empezamos en Jardines de Viesques y seguimos por Luanco y Candás. Te espero en el portal diez minutos antes.' },
    ],
  },
  {
    key: 'ch05', topic: 'Negociación', contact: 'c06', lead: 'L06', property: 'p16', commercial: 'com-marta',
    visitor: { name: 'Rubén Iglesias Cabal' }, days: -2, at: '11:00', read: true, status: 'pending',
    messages: [
      { after: 0, from: 'visitor', text: 'Marta, ¿hay alguna novedad de la propiedad sobre los 228.000 €?' },
      { after: 175, from: 'agent', text: 'Hola Rubén: la propiedad contesta con 232.000 € y acepta la entrega de llaves en 60 días. ¿Lo hablamos por teléfono esta tarde?' },
      { after: 185, from: 'note', text: 'El comprador tiene margen hasta 230.000 €; proponer reparto de gastos de notaría.' },
    ],
  },
  {
    key: 'ch06', topic: 'Envío de propiedades', contact: 'c17', lead: 'L17', property: 'p02', commercial: 'com-lucia',
    visitor: { name: 'Elena Piñera Llano' }, days: -22, at: '13:10', read: true, status: 'closed',
    messages: [
      { after: 0, from: 'visitor', text: '¿Tenéis algo parecido al ático del Campo San Francisco pero con dos dormitorios?' },
      { after: 35, from: 'agent', text: 'Te he preparado una selección con las opciones que encajan con lo que buscas; la tienes en tu área de cliente y la vemos juntas en la visita.' },
      { after: 60, from: 'visitor', text: 'Genial, la miro esta noche.' },
    ],
  },
  {
    key: 'ch07', topic: 'Seguimiento', contact: 'c10', lead: 'L10', property: 'p17', commercial: 'com-marta',
    visitor: { name: 'Pablo Riestra Noval' }, days: -10, at: '17:30', read: true, status: 'open',
    messages: [
      { after: 0, from: 'visitor', text: 'Hola, ¿sigue disponible el ático de Candás? Me gustaría volver a intentarlo.' },
      { after: 22, from: 'agent', text: 'Hola Pablo, sigue disponible. Si te parece, te llamo mañana y preparamos una nueva propuesta con la financiación ya estudiada.' },
    ],
  },
]

export interface DemoCall {
  key: string
  contact: string
  commercial: string
  direction: 'inbound' | 'outbound'
  outcome: 'answered' | 'no_answer' | 'busy' | 'voicemail' | 'wrong_number' | 'callback' | 'not_interested' | 'interested'
  notes: string
  seconds?: number
  property?: string
  days: number
  at: string
}

export const CALLS: DemoCall[] = [
  { key: 'k01', contact: 'c12', commercial: 'com-alvaro', direction: 'outbound', outcome: 'not_interested', notes: 'Descarta el chalet de Somió: ha encontrado otra opción más cerca del colegio.', seconds: 240, property: 'p14', days: -44, at: '12:00' },
  { key: 'k02', contact: 'c35', commercial: 'com-alvaro', direction: 'outbound', outcome: 'answered', notes: 'Le comunico la retirada de la oferta. Mantiene el precio y prefiere esperar a la primavera.', seconds: 300, property: 'p14', days: -45, at: '11:00' },
  { key: 'k03', contact: 'c13', commercial: 'com-javier', direction: 'outbound', outcome: 'answered', notes: 'Revisa el contrato privado con su abogado; pide que la entrega sea antes de diciembre.', seconds: 410, property: 'p09', days: -20, at: '10:30' },
  { key: 'k04', contact: 'c40', commercial: 'com-diego', direction: 'inbound', outcome: 'callback', notes: 'Pregunta por la factura de gestión del primer mes. Le llamo con el desglose.', seconds: 95, property: 'p18', days: -15, at: '09:40' },
  { key: 'k05', contact: 'c21', commercial: 'com-lucia', direction: 'outbound', outcome: 'interested', notes: 'Busca piso de tres dormitorios en Oviedo, hasta 260.000 €. Le propongo ver Montecerrao.', seconds: 520, days: -11, at: '12:00' },
  { key: 'k06', contact: 'c18', commercial: 'com-diego', direction: 'outbound', outcome: 'answered', notes: 'Interesado en el piso del centro para reformar. Pide planos y presupuesto orientativo de reforma.', seconds: 260, property: 'p12', days: -9, at: '13:00' },
  { key: 'k07', contact: 'c23', commercial: 'com-marta', direction: 'outbound', outcome: 'no_answer', notes: 'No contesta. Reintento por la tarde.', property: 'p16', days: -5, at: '10:15' },
  { key: 'k08', contact: 'c23', commercial: 'com-marta', direction: 'outbound', outcome: 'answered', notes: 'Quiere visitar el dúplex de Luanco el jueves por la tarde.', seconds: 330, property: 'p16', days: -5, at: '17:30' },
  { key: 'k09', contact: 'c06', commercial: 'com-marta', direction: 'inbound', outcome: 'answered', notes: 'Hablamos de la contraoferta de 232.000 €: lo consulta con su pareja y contesta el lunes.', seconds: 420, property: 'p16', days: -2, at: '18:00' },
  { key: 'k10', contact: 'c24', commercial: 'com-alvaro', direction: 'outbound', outcome: 'voicemail', notes: 'Buzón de voz. Dejo mensaje y le escribo por el chat de la web si vuelve a entrar.', property: 'p03', days: -1, at: '10:30' },
]

export interface DemoNote {
  key: string
  entity: 'contact' | 'lead' | 'property' | 'deal'
  ref: string
  author: string
  body: string
  pinned?: boolean
  days: number
  at: string
}

export const NOTES: DemoNote[] = [
  { key: 'n01', entity: 'contact', ref: 'c01', author: 'com-lucia', body: 'Prefiere que la llamen a partir de las 17:00 (trabaja de mañana).', pinned: true, days: -88, at: '10:00' },
  { key: 'n02', entity: 'lead', ref: 'L05', author: 'com-paula', body: 'Thomas y su mujer quieren mudarse en primavera; valoran la tranquilidad y las vistas por encima de todo.', days: -43, at: '12:00' },
  { key: 'n03', entity: 'property', ref: 'p12', author: 'com-diego', body: 'La comunidad aprobó la rehabilitación de la fachada; la derrama ya está pagada por la propiedad.', pinned: true, days: -150, at: '13:00' },
  { key: 'n04', entity: 'property', ref: 'p14', author: 'com-alvaro', body: 'Llaves con la propietaria: avisar con 24 horas para cualquier visita.', days: -120, at: '11:00' },
  { key: 'n05', entity: 'property', ref: 'p02', author: 'com-lucia', body: 'Quedan dos unidades con terraza de más de 40 m²: priorizar en las visitas.', days: -60, at: '09:30' },
  { key: 'n06', entity: 'deal', ref: 'd06', author: 'com-paula', body: 'Notaría señalada. Falta el certificado de deuda cero de la comunidad.', pinned: true, days: -6, at: '12:00' },
  { key: 'n07', entity: 'deal', ref: 'd02', author: 'com-diego', body: 'El préstamo de reforma depende de la tasación: seguimiento semanal con el banco.', days: -19, at: '10:00' },
  { key: 'n08', entity: 'lead', ref: 'L22', author: 'com-paula', body: 'Sigue buscando villa con piscina en el oriente; presupuesto hasta 850.000 €.', days: -38, at: '16:00' },
  { key: 'n09', entity: 'contact', ref: 'c34', author: 'com-alvaro', body: 'Vende su piso de Viesques y compra algo más pequeño en el centro de Gijón.', days: -94, at: '17:00' },
  { key: 'n10', entity: 'lead', ref: 'L13', author: 'com-javier', body: 'Pide que la entrega de llaves sea antes de diciembre.', days: -44, at: '18:00' },
]
