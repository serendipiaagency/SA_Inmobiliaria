/**
 * Agenda de la cuenta demo: citas (visitas, llamadas, captaciones,
 * notarías…), tours multi-inmueble y tareas. Horas de pared de Madrid; `days`
 * respecto al anclaje (negativo = pasado, positivo = futuro).
 *
 * Las citas pasadas se crean como agendadas (igual que en la realidad) y
 * después se completan, cancelan o marcan «no asistió» con el servicio real,
 * en su fecha. El resultado de cada visita completada se registra con
 * `recordVisitOutcome`.
 */

export interface DemoOutcome {
  outcome: 'interested' | 'wants_to_think' | 'not_interested'
  interest: number
  liked?: string
  disliked?: string
  price?: 'cheap' | 'fair' | 'expensive'
  location?: number
  condition?: number
  layout?: number
  secondVisit?: boolean
  wantsToOffer?: boolean
  discarded?: boolean
  notes?: string
}

export interface DemoAppointment {
  key: string
  type: 'property_viewing' | 'call' | 'video_call' | 'meeting' | 'valuation' | 'listing' | 'signing' | 'notary' | 'open_house' | 'other'
  commercial: string
  contact?: string
  lead?: string
  property?: string
  days: number
  at: string
  minutes?: number
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show'
  cancelReason?: string
  outcome?: DemoOutcome
  notes?: string
  meetingPoint?: string
  title?: string
  deal?: string
}

export const APPOINTMENTS: DemoAppointment[] = [
  // ── Laura (c01): visita, segunda visita, oferta ──
  { key: 'a01', type: 'call', commercial: 'com-lucia', contact: 'c01', lead: 'L01', days: -92, at: '09:28', minutes: 20, status: 'completed', notes: 'Llamada de cualificación: presupuesto validado con el banco, buscan 3 dormitorios con terraza.' },
  { key: 'a02', type: 'property_viewing', commercial: 'com-lucia', contact: 'c01', lead: 'L01', property: 'p01', days: -85, at: '10:00', status: 'completed', outcome: { outcome: 'interested', interest: 4, liked: 'La terraza al sur y las calidades; el colegio a cinco minutos.', disliked: 'La cocina abierta les parece algo justa.', price: 'fair', location: 5, condition: 5, layout: 4, secondVisit: true } },
  { key: 'a03', type: 'property_viewing', commercial: 'com-lucia', contact: 'c01', lead: 'L01', property: 'p11', days: -80, at: '18:00', status: 'completed', outcome: { outcome: 'wants_to_think', interest: 3, liked: 'Muy bien reformado y luminoso.', disliked: 'Edificio de 2004; prefieren obra nueva y garaje doble.', price: 'expensive', location: 4, condition: 4, layout: 4 } },
  { key: 'a04', type: 'property_viewing', commercial: 'com-lucia', contact: 'c01', lead: 'L01', property: 'p01', days: -68, at: '17:30', status: 'completed', notes: 'Segunda visita con los padres de Laura.', outcome: { outcome: 'interested', interest: 5, liked: 'Confirman distribución y orientación; quieren ofertar.', price: 'fair', location: 5, condition: 5, layout: 5, wantsToOffer: true } },
  // ── Open house de Montecerrao ──
  { key: 'a05', type: 'open_house', commercial: 'com-lucia', property: 'p01', days: -45, at: '11:00', minutes: 180, status: 'completed', title: 'Jornada de puertas abiertas · Residencial Montecerrao', notes: 'Piso piloto abierto: 14 grupos de visitantes, 6 contactos nuevos.' },
  // ── Tamargo (c07): compra en Avilés, cerrada ──
  { key: 'a06', type: 'property_viewing', commercial: 'com-marta', contact: 'c07', lead: 'L07', property: 'p15', days: -118, at: '11:00', status: 'completed', outcome: { outcome: 'interested', interest: 4, liked: 'La luz y la ubicación junto al parque.', disliked: 'El baño necesita una actualización.', price: 'fair', location: 5, condition: 3, layout: 4, wantsToOffer: true } },
  { key: 'a07', type: 'notary', commercial: 'com-marta', contact: 'c07', lead: 'L07', property: 'p15', days: -62, at: '12:00', minutes: 90, status: 'completed', title: 'Firma de escritura · Piso del centro de Avilés', meetingPoint: 'Notaría (Avilés)', deal: 'd03' },
  // ── Collins (c09): casa de Selorio, cerrada ──
  { key: 'a08', type: 'video_call', commercial: 'com-javier', contact: 'c09', lead: 'L09', property: 'p20', days: -160, at: '18:00', minutes: 30, status: 'completed', notes: 'Videollamada en inglés para enseñar la casa antes de viajar.' },
  { key: 'a09', type: 'property_viewing', commercial: 'com-javier', contact: 'c09', lead: 'L09', property: 'p20', days: -155, at: '12:00', status: 'completed', outcome: { outcome: 'interested', interest: 5, liked: 'El hórreo, la finca con frutales y la tranquilidad.', price: 'fair', location: 5, condition: 4, layout: 4, wantsToOffer: true } },
  { key: 'a10', type: 'notary', commercial: 'com-javier', contact: 'c09', lead: 'L09', property: 'p20', days: -120, at: '11:00', minutes: 90, status: 'completed', title: 'Firma de escritura · Casa de Selorio', meetingPoint: 'Notaría (Villaviciosa)', deal: 'd04' },
  // ── Irene (c11): reserva en Viesques ──
  { key: 'a11', type: 'property_viewing', commercial: 'com-alvaro', contact: 'c11', lead: 'L11', property: 'p03', days: -55, at: '17:00', status: 'completed', outcome: { outcome: 'not_interested', interest: 3, liked: 'La urbanización y la piscina.', disliked: 'La entrega es en un año y necesita mudarse antes.', price: 'fair', location: 4, condition: 5, layout: 4, discarded: true } },
  { key: 'a12', type: 'property_viewing', commercial: 'com-alvaro', contact: 'c11', lead: 'L11', property: 'p13', days: -52, at: '18:30', status: 'completed', outcome: { outcome: 'interested', interest: 5, liked: 'Para entrar a vivir, balcón al parque y garaje.', price: 'fair', location: 5, condition: 5, layout: 5, wantsToOffer: true } },
  { key: 'a13', type: 'signing', commercial: 'com-alvaro', contact: 'c11', lead: 'L11', property: 'p13', days: 3, at: '12:00', minutes: 60, status: 'scheduled', title: 'Firma del contrato de arras · Viesques', meetingPoint: 'Oficina de Gijón', deal: 'd05' },
  // ── Begoña (c13): casa pareada de Amandi ──
  { key: 'a14', type: 'video_call', commercial: 'com-javier', contact: 'c13', lead: 'L13', days: -69, at: '20:00', minutes: 30, status: 'completed', notes: 'Presentación de Villas de Amandi y memoria de calidades.' },
  { key: 'a15', type: 'property_viewing', commercial: 'com-javier', contact: 'c13', lead: 'L13', property: 'p09', days: -60, at: '11:30', status: 'completed', outcome: { outcome: 'interested', interest: 4, liked: 'El jardín y el dormitorio en suite.', disliked: 'Quieren cambiar el suelo de la planta baja.', price: 'fair', location: 4, condition: 5, layout: 4, wantsToOffer: true } },
  { key: 'a16', type: 'property_viewing', commercial: 'com-javier', contact: 'c13', lead: 'L13', property: 'p08', days: -60, at: '12:30', status: 'completed', outcome: { outcome: 'wants_to_think', interest: 3, liked: 'La parcela enorme.', disliked: 'Se va de presupuesto.', price: 'expensive', location: 4, condition: 5, layout: 4 } },
  // ── Marcos (c14): bajo de Santa Marina, a notaría ──
  { key: 'a17', type: 'property_viewing', commercial: 'com-paula', contact: 'c14', lead: 'L14', property: 'p07', days: -69, at: '12:00', status: 'completed', outcome: { outcome: 'interested', interest: 5, liked: 'A cincuenta metros de la playa y entrega inmediata.', price: 'fair', location: 5, condition: 5, layout: 4, wantsToOffer: true } },
  { key: 'a18', type: 'notary', commercial: 'com-paula', contact: 'c14', lead: 'L14', property: 'p07', days: 7, at: '12:00', minutes: 90, status: 'scheduled', title: 'Firma de escritura · Bajo de Santa Marina', meetingPoint: 'Notaría (Ribadesella)', deal: 'd06' },
  // ── Rubén (c06): dúplex de Luanco, negociando ──
  { key: 'a19', type: 'property_viewing', commercial: 'com-marta', contact: 'c06', lead: 'L06', property: 'p16', days: -40, at: '17:00', status: 'completed', outcome: { outcome: 'interested', interest: 4, liked: 'Las vistas al puerto y la terraza.', disliked: 'Sin garaje en el edificio.', price: 'expensive', location: 5, condition: 4, layout: 4, wantsToOffer: true } },
  { key: 'a20', type: 'property_viewing', commercial: 'com-marta', contact: 'c06', lead: 'L06', property: 'p17', days: -40, at: '18:00', status: 'completed', outcome: { outcome: 'not_interested', interest: 2, disliked: 'Sólo dos dormitorios y necesita tres.', price: 'fair', location: 4, condition: 3, layout: 2, discarded: true } },
  // ── Weber (c05): visita con feedback, seguimiento y oferta en borrador (caso 4) ──
  { key: 'a21', type: 'property_viewing', commercial: 'com-paula', contact: 'c05', lead: 'L05', property: 'p19', days: -26, at: '11:00', minutes: 75, status: 'completed', notes: 'Visita en inglés con su mujer.', outcome: { outcome: 'interested', interest: 4, liked: 'La piedra original, las vistas a la sierra y la finca.', disliked: 'La cocina de leña no le convence; querría una cocina moderna.', price: 'expensive', location: 5, condition: 4, layout: 4, wantsToOffer: true, notes: 'Pide margen: cree que el precio es alto para la zona.' } },
  { key: 'a22', type: 'video_call', commercial: 'com-paula', contact: 'c05', lead: 'L05', property: 'p19', days: 2, at: '17:00', minutes: 30, status: 'scheduled', notes: 'Repasar con él la propuesta antes de presentarla a la propiedad.' },
  // ── Héctor (c12): Somió ──
  { key: 'a23', type: 'property_viewing', commercial: 'com-alvaro', contact: 'c12', lead: 'L12', property: 'p14', days: -68, at: '12:00', status: 'completed', outcome: { outcome: 'interested', interest: 4, liked: 'El jardín maduro y la chimenea.', disliked: 'Necesita actualizar la calefacción.', price: 'expensive', location: 5, condition: 3, layout: 4, wantsToOffer: true } },
  { key: 'a24', type: 'property_viewing', commercial: 'com-alvaro', contact: 'c12', lead: 'L12', property: 'p14', days: -50, at: '13:00', status: 'no_show', notes: 'Segunda visita: no se presentó ni avisó.' },
  // ── Michael (c22): villa de Celorio (oferta rechazada) y Somió ──
  { key: 'a25', type: 'property_viewing', commercial: 'com-paula', contact: 'c22', lead: 'L22', property: 'p10', days: -47, at: '16:00', minutes: 90, status: 'completed', outcome: { outcome: 'interested', interest: 4, liked: 'Las vistas y la piscina.', disliked: 'Precio por encima de lo que esperaba.', price: 'expensive', location: 5, condition: 5, layout: 5, wantsToOffer: true } },
  { key: 'a26', type: 'property_viewing', commercial: 'com-alvaro', contact: 'c22', lead: 'L22', property: 'p14', days: 5, at: '12:00', minutes: 75, status: 'scheduled', notes: 'Alternativa tras el rechazo de la oferta en Celorio.' },
  // ── Pablo (c10): Candás (oferta caducada) ──
  { key: 'a27', type: 'property_viewing', commercial: 'com-marta', contact: 'c10', lead: 'L10', property: 'p17', days: -40, at: '12:00', status: 'completed', outcome: { outcome: 'interested', interest: 3, liked: 'La terraza con vistas al mar.', disliked: 'Necesita pintura y cambiar la cocina.', price: 'expensive', location: 5, condition: 3, layout: 3, wantsToOffer: true } },
  { key: 'a28', type: 'property_viewing', commercial: 'com-marta', contact: 'c10', lead: 'L10', property: 'p16', days: -30, at: '18:00', status: 'cancelled', cancelReason: 'El cliente ha visto otra propiedad que le encaja más' },
  // ── Ramón (c44): alquiler de Pola de Siero ──
  { key: 'a29', type: 'property_viewing', commercial: 'com-diego', contact: 'c44', lead: 'L44', property: 'p18', days: -60, at: '19:00', minutes: 45, status: 'completed', outcome: { outcome: 'interested', interest: 5, liked: 'Amueblado y con garaje, listo para entrar.', price: 'fair', location: 4, condition: 5, layout: 4 } },
  // ── Elena (c17): ático del Campo San Francisco, y La Arena ──
  { key: 'a30', type: 'property_viewing', commercial: 'com-lucia', contact: 'c17', lead: 'L17', property: 'p02', days: -18, at: '17:00', status: 'completed', outcome: { outcome: 'wants_to_think', interest: 4, liked: 'La terraza y las vistas al parque.', disliked: 'Le preocupa no tener garaje.', price: 'fair', location: 5, condition: 5, layout: 4, secondVisit: true } },
  { key: 'a31', type: 'property_viewing', commercial: 'com-alvaro', contact: 'c17', lead: 'L17', property: 'p04', days: 2, at: '17:30', status: 'scheduled', notes: 'Compara con el ático de La Arena (tiene dos garajes).' },
  // ── Sofía (c49): Amandi ──
  { key: 'a32', type: 'property_viewing', commercial: 'com-javier', contact: 'c49', lead: 'L49', property: 'p08', days: -9, at: '11:00', status: 'completed', outcome: { outcome: 'interested', interest: 4, liked: 'Las placas solares y la parcela.', disliked: 'Quiere ver el avance de obra.', price: 'fair', location: 4, condition: 5, layout: 4, secondVisit: true } },
  { key: 'a33', type: 'property_viewing', commercial: 'com-javier', contact: 'c49', lead: 'L49', property: 'p08', days: 3, at: '12:00', status: 'scheduled', notes: 'Segunda visita: avance de obra.' },
  // ── Otras próximas ──
  { key: 'a34', type: 'property_viewing', commercial: 'com-lucia', contact: 'c16', lead: 'L16', property: 'p01', days: 1, at: '18:00', status: 'scheduled' },
  { key: 'a35', type: 'property_viewing', commercial: 'com-lucia', contact: 'c51', lead: 'L51', property: 'p11', days: 0, at: '19:00', status: 'scheduled' },
  { key: 'a36', type: 'valuation', commercial: 'com-javier', contact: 'c53', lead: 'L53', days: 1, at: '10:00', minutes: 90, status: 'scheduled', title: 'Valoración de la casa familiar de Cangas de Onís', meetingPoint: 'Cangas de Onís' },
  { key: 'a37', type: 'meeting', commercial: 'com-diego', contact: 'c08', lead: 'L08', property: 'p12', days: 5, at: '10:00', minutes: 60, status: 'scheduled', title: 'Reunión con el banco: tasación y financiación de la reforma', meetingPoint: 'Oficina de Oviedo', deal: 'd02' },
  // ── Captaciones y valoraciones (pasadas) ──
  { key: 'a38', type: 'listing', commercial: 'com-lucia', contact: 'c30', property: 'p11', days: -112, at: '11:00', minutes: 60, status: 'completed', title: 'Captación: piso de La Florida', notes: 'Firma del encargo en exclusiva con los dos propietarios.' },
  { key: 'a39', type: 'listing', commercial: 'com-paula', contact: 'c41', property: 'p19', days: -126, at: '12:00', minutes: 90, status: 'completed', title: 'Captación: casa de piedra de Posada' },
  { key: 'a40', type: 'valuation', commercial: 'com-alvaro', contact: 'c34', property: 'p13', days: -96, at: '10:00', minutes: 60, status: 'completed', title: 'Valoración del piso de Viesques' },
  // ── Canceladas y «no asistió» ──
  { key: 'a41', type: 'property_viewing', commercial: 'com-diego', contact: 'c18', lead: 'L18', property: 'p11', days: -5, at: '13:00', status: 'cancelled', cancelReason: 'El cliente no podía ese día; pide otra fecha' },
  { key: 'a42', type: 'property_viewing', commercial: 'com-paula', contact: 'c29', lead: 'L29', property: 'p19', days: -50, at: '17:00', status: 'cancelled', cancelReason: 'Ya no le encaja el presupuesto' },
  { key: 'a43', type: 'property_viewing', commercial: 'com-alvaro', contact: 'c54', lead: 'L54', property: 'p13', days: -40, at: '19:00', status: 'cancelled', cancelReason: 'Ha comprado con otra agencia' },
  { key: 'a44', type: 'property_viewing', commercial: 'com-marta', contact: 'c23', lead: 'L23', property: 'p16', days: -3, at: '11:00', status: 'cancelled', cancelReason: 'Cambio de agenda del comercial: se ofrece otra hora' },
  { key: 'a45', type: 'property_viewing', commercial: 'com-marta', contact: 'c50', lead: 'L50', property: 'p15', days: -42, at: '17:30', status: 'no_show' },
  { key: 'a46', type: 'property_viewing', commercial: 'com-marta', contact: 'c19', lead: 'L19', property: 'p05', days: -6, at: '18:00', status: 'no_show', notes: 'No se presentó; se le escribe para reprogramar.' },
  { key: 'a47', type: 'call', commercial: 'com-diego', contact: 'c20', lead: 'L20', days: -38, at: '12:00', minutes: 20, status: 'completed', notes: 'Cualificación: inversión para alquiler, pago con recursos propios.' },
]

/** Tours multi-inmueble: cada parada es una cita real (Tour + TourStop). */
export interface DemoTour {
  key: string
  contact: string
  lead: string
  notes: string
  days: number
  stops: { property: string; commercial: string; at: string; minutes: number; status: 'scheduled' | 'completed'; outcome?: DemoOutcome }[]
}

export const TOURS: DemoTour[] = [
  {
    key: 't01', contact: 'c08', lead: 'L08', days: -72, notes: 'Tour de inversión por Oviedo: tres opciones para alquilar o reformar.',
    stops: [
      { property: 'p12', commercial: 'com-diego', at: '16:00', minutes: 40, status: 'completed', outcome: { outcome: 'interested', interest: 5, liked: 'Techos altos y estructura sana: reforma muy rentable.', price: 'fair', location: 5, condition: 2, layout: 4, wantsToOffer: true } },
      { property: 'p11', commercial: 'com-diego', at: '16:45', minutes: 40, status: 'completed', outcome: { outcome: 'not_interested', interest: 2, disliked: 'Precio alto para la rentabilidad que busca.', price: 'expensive', location: 4, condition: 5, layout: 4 } },
      { property: 'p01', commercial: 'com-diego', at: '17:30', minutes: 40, status: 'completed', outcome: { outcome: 'wants_to_think', interest: 3, liked: 'Obra nueva sin mantenimiento.', disliked: 'Rentabilidad bruta por debajo del 5 %.', price: 'fair', location: 4, condition: 5, layout: 4 } },
    ],
  },
  {
    key: 't02', contact: 'c03', lead: 'L03', days: 4, notes: 'Tour Gijón — familia Cueto: tres opciones con colegio cerca.',
    stops: [
      { property: 'p03', commercial: 'com-alvaro', at: '10:00', minutes: 45, status: 'scheduled' },
      { property: 'p16', commercial: 'com-alvaro', at: '11:00', minutes: 45, status: 'scheduled' },
      { property: 'p17', commercial: 'com-alvaro', at: '11:45', minutes: 40, status: 'scheduled' },
    ],
  },
  {
    key: 't03', contact: 'c15', lead: 'L15', days: 9, notes: 'Tour costa oriental — Claire Dubois: casa o bajo cerca de la playa.',
    stops: [
      { property: 'p08', commercial: 'com-javier', at: '10:00', minutes: 45, status: 'scheduled' },
      { property: 'p06', commercial: 'com-paula', at: '11:30', minutes: 45, status: 'scheduled' },
      { property: 'p19', commercial: 'com-paula', at: '12:30', minutes: 60, status: 'scheduled' },
    ],
  },
]

/** Tareas. `due` en días respecto al anclaje y hora (Madrid); `done` = completada ese día. */
export interface DemoTask {
  key: string
  type: 'call' | 'whatsapp' | 'email' | 'follow_up' | 'document' | 'viewing' | 'offer' | 'signature' | 'other'
  title: string
  assignee: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  createdDays: number
  dueDays: number
  dueAt: string
  status: 'open' | 'in_progress' | 'completed' | 'cancelled'
  doneDays?: number
  contact?: string
  lead?: string
  property?: string
  appointment?: string
  deal?: string
}

export const TASKS: DemoTask[] = [
  // Hoy
  { key: 'k01', type: 'call', title: 'Primer contacto con Sergio Prieto (ático de La Arena)', assignee: 'com-alvaro', priority: 'urgent', createdDays: 0, dueDays: 0, dueAt: '10:00', status: 'open', contact: 'c02', lead: 'L02', property: 'p04' },
  { key: 'k02', type: 'email', title: 'Enviar plano y memoria de calidades a Aurora Cienfuegos', assignee: 'com-paula', priority: 'high', createdDays: 0, dueDays: 0, dueAt: '13:00', status: 'open', contact: 'c45', lead: 'L45', property: 'p06' },
  { key: 'k03', type: 'whatsapp', title: 'Responder a Alberto Riera: gastos de comunidad del ático de Candás', assignee: 'com-marta', priority: 'medium', createdDays: -1, dueDays: 0, dueAt: '11:00', status: 'open', contact: 'c46', lead: 'L46', property: 'p17' },
  { key: 'k04', type: 'viewing', title: 'Preparar la visita de Lucía Ablanedo a La Florida', assignee: 'com-lucia', priority: 'medium', createdDays: -3, dueDays: 0, dueAt: '18:00', status: 'in_progress', contact: 'c51', lead: 'L51', property: 'p11', appointment: 'a35' },
  // Vencidas (pocas)
  { key: 'k05', type: 'call', title: 'Llamar a Raquel Álvarez: garaje cerca del ático', assignee: 'com-lucia', priority: 'high', createdDays: -1, dueDays: -1, dueAt: '18:00', status: 'open', contact: 'c25', lead: 'L25', property: 'p02' },
  { key: 'k06', type: 'follow_up', title: 'Reprogramar la visita de Silvia García (no se presentó)', assignee: 'com-marta', priority: 'medium', createdDays: -5, dueDays: -3, dueAt: '10:00', status: 'open', contact: 'c19', lead: 'L19', appointment: 'a46' },
  { key: 'k07', type: 'document', title: 'Pedir nota simple actualizada del piso de Luanco', assignee: 'com-marta', priority: 'medium', createdDays: -12, dueDays: -2, dueAt: '12:00', status: 'open', property: 'p16', contact: 'c38' },
  // Próximas
  { key: 'k08', type: 'follow_up', title: 'Seguimiento tras la visita de Thomas Weber: propuesta de oferta', assignee: 'com-paula', priority: 'high', createdDays: -26, dueDays: 2, dueAt: '16:00', status: 'in_progress', contact: 'c05', lead: 'L05', property: 'p19', appointment: 'a21' },
  { key: 'k09', type: 'document', title: 'Reunir documentación para la firma de arras de Irene Quirós', assignee: 'com-alvaro', priority: 'high', createdDays: -10, dueDays: 2, dueAt: '12:00', status: 'in_progress', contact: 'c11', property: 'p13', deal: 'd05' },
  { key: 'k10', type: 'signature', title: 'Confirmar con la notaría la escritura del bajo de Santa Marina', assignee: 'com-paula', priority: 'high', createdDays: -8, dueDays: 4, dueAt: '10:00', status: 'open', contact: 'c14', property: 'p07', deal: 'd06' },
  { key: 'k11', type: 'document', title: 'Enviar al banco la tasación del piso de la calle Mon', assignee: 'com-diego', priority: 'high', createdDays: -15, dueDays: 3, dueAt: '09:30', status: 'open', contact: 'c08', property: 'p12', deal: 'd02' },
  { key: 'k12', type: 'offer', title: 'Responder a la contraoferta de la propiedad del dúplex de Luanco', assignee: 'com-marta', priority: 'urgent', createdDays: -2, dueDays: 1, dueAt: '12:00', status: 'open', contact: 'c06', lead: 'L06', property: 'p16' },
  { key: 'k13', type: 'viewing', title: 'Confirmar el tour del sábado con la familia Cueto', assignee: 'com-alvaro', priority: 'medium', createdDays: -4, dueDays: 3, dueAt: '18:00', status: 'open', contact: 'c03', lead: 'L03' },
  { key: 'k14', type: 'email', title: 'Enviar a Claire Dubois el itinerario del tour (en francés)', assignee: 'com-paula', priority: 'medium', createdDays: -3, dueDays: 5, dueAt: '12:00', status: 'open', contact: 'c15', lead: 'L15' },
  { key: 'k15', type: 'viewing', title: 'Preparar informe de captación de la casa de Cangas de Onís', assignee: 'com-javier', priority: 'medium', createdDays: -2, dueDays: 1, dueAt: '09:00', status: 'open', contact: 'c53', lead: 'L53', appointment: 'a36' },
  { key: 'k16', type: 'call', title: 'Llamar a Daniel Sánchez (Jardines de Viesques)', assignee: 'com-alvaro', priority: 'high', createdDays: -2, dueDays: 0, dueAt: '17:00', status: 'open', contact: 'c24', lead: 'L24', property: 'p03' },
  { key: 'k17', type: 'follow_up', title: 'Enviar a Jorge Díaz las rentabilidades de las opciones en Oviedo', assignee: 'com-diego', priority: 'medium', createdDays: -5, dueDays: 2, dueAt: '11:00', status: 'open', contact: 'c20', lead: 'L20' },
  { key: 'k18', type: 'whatsapp', title: 'Confirmar visita de Adrián Carreño a Montecerrao', assignee: 'com-lucia', priority: 'medium', createdDays: -2, dueDays: 1, dueAt: '10:00', status: 'open', contact: 'c16', lead: 'L16', property: 'p01', appointment: 'a34' },
  { key: 'k19', type: 'follow_up', title: 'Seguimiento de Elena Piñera tras la visita del ático', assignee: 'com-lucia', priority: 'medium', createdDays: -17, dueDays: 1, dueAt: '19:00', status: 'open', contact: 'c17', lead: 'L17', property: 'p02', appointment: 'a30' },
  { key: 'k20', type: 'other', title: 'Revisar el encargo de La Florida antes de su vencimiento', assignee: 'com-lucia', priority: 'low', createdDays: -20, dueDays: 12, dueAt: '10:00', status: 'open', property: 'p11', contact: 'c30' },
  { key: 'k21', type: 'call', title: 'Llamar a Iván Menéndez para cerrar nueva fecha de visita', assignee: 'com-diego', priority: 'medium', createdDays: -5, dueDays: 1, dueAt: '13:00', status: 'open', contact: 'c18', lead: 'L18', appointment: 'a41' },
  { key: 'k22', type: 'document', title: 'Actualizar el certificado energético del ático de Candás', assignee: 'com-marta', priority: 'low', createdDays: -9, dueDays: 9, dueAt: '12:00', status: 'open', property: 'p17', contact: 'c39' },
  { key: 'k23', type: 'follow_up', title: 'Llamada de seguimiento a Hugo Cifuentes (inversión)', assignee: 'com-diego', priority: 'low', createdDays: -10, dueDays: 6, dueAt: '12:30', status: 'open', contact: 'c52', lead: 'L52' },
  { key: 'k24', type: 'email', title: 'Enviar a Fernando Rodríguez las casas con parcela de Villaviciosa', assignee: 'com-javier', priority: 'medium', createdDays: -12, dueDays: 1, dueAt: '16:00', status: 'in_progress', contact: 'c26', lead: 'L26' },
  // Completadas (historia)
  { key: 'k25', type: 'call', title: 'Primer contacto con Laura Martínez', assignee: 'com-lucia', priority: 'high', createdDays: -92, dueDays: -92, dueAt: '10:00', status: 'completed', doneDays: -92, contact: 'c01', lead: 'L01' },
  { key: 'k26', type: 'follow_up', title: 'Seguimiento tras la primera visita de Laura a Montecerrao', assignee: 'com-lucia', priority: 'medium', createdDays: -85, dueDays: -82, dueAt: '11:00', status: 'completed', doneDays: -82, contact: 'c01', lead: 'L01', property: 'p01', appointment: 'a02' },
  { key: 'k27', type: 'offer', title: 'Presentar la oferta de Laura a la promotora', assignee: 'com-lucia', priority: 'high', createdDays: -66, dueDays: -65, dueAt: '12:00', status: 'completed', doneDays: -65, contact: 'c01', property: 'p01' },
  { key: 'k28', type: 'document', title: 'Preparar el contrato de reserva de Laura', assignee: 'com-lucia', priority: 'high', createdDays: -58, dueDays: -57, dueAt: '12:00', status: 'completed', doneDays: -57, contact: 'c01', property: 'p01', deal: 'd01' },
  { key: 'k29', type: 'signature', title: 'Firma de arras de Laura Martínez', assignee: 'com-lucia', priority: 'high', createdDays: -45, dueDays: -40, dueAt: '12:00', status: 'completed', doneDays: -40, contact: 'c01', property: 'p01', deal: 'd01' },
  { key: 'k30', type: 'document', title: 'Recopilar documentación para la escritura de Covadonga Tamargo', assignee: 'com-marta', priority: 'high', createdDays: -75, dueDays: -66, dueAt: '12:00', status: 'completed', doneDays: -67, contact: 'c07', property: 'p15', deal: 'd03' },
  { key: 'k31', type: 'email', title: 'Enviar a Sarah Collins el borrador de arras traducido', assignee: 'com-javier', priority: 'high', createdDays: -137, dueDays: -134, dueAt: '12:00', status: 'completed', doneDays: -135, contact: 'c09', property: 'p20', deal: 'd04' },
  { key: 'k32', type: 'call', title: 'Cualificación de Jorge Díaz', assignee: 'com-diego', priority: 'medium', createdDays: -40, dueDays: -38, dueAt: '12:00', status: 'completed', doneDays: -38, contact: 'c20', lead: 'L20' },
  { key: 'k33', type: 'document', title: 'Encargo de venta firmado: La Florida', assignee: 'com-lucia', priority: 'medium', createdDays: -113, dueDays: -110, dueAt: '12:00', status: 'completed', doneDays: -111, contact: 'c30', property: 'p11' },
  { key: 'k34', type: 'other', title: 'Reportaje de fotos y vídeo de la casa de Posada', assignee: 'com-paula', priority: 'medium', createdDays: -125, dueDays: -118, dueAt: '10:00', status: 'completed', doneDays: -119, property: 'p19', contact: 'c41' },
  { key: 'k35', type: 'whatsapp', title: 'Enviar a Begoña el plano de la casa pareada', assignee: 'com-javier', priority: 'medium', createdDays: -70, dueDays: -69, dueAt: '12:00', status: 'completed', doneDays: -69, contact: 'c13', lead: 'L13', property: 'p09' },
  { key: 'k36', type: 'call', title: 'Llamar a la propiedad del dúplex de Luanco con la oferta de Rubén', assignee: 'com-marta', priority: 'high', createdDays: -20, dueDays: -19, dueAt: '12:00', status: 'completed', doneDays: -19, contact: 'c38', property: 'p16' },
  { key: 'k37', type: 'follow_up', title: 'Intentos de contacto con David Somoano', assignee: 'com-marta', priority: 'low', createdDays: -45, dueDays: -30, dueAt: '12:00', status: 'cancelled', doneDays: -27, contact: 'c50', lead: 'L50' },
  { key: 'k38', type: 'document', title: 'Firma del contrato de alquiler de Ramón Fueyo', assignee: 'com-diego', priority: 'high', createdDays: -55, dueDays: -50, dueAt: '12:00', status: 'completed', doneDays: -50, contact: 'c44', property: 'p18', deal: 'd07' },
  { key: 'k39', type: 'call', title: 'Primer contacto con Marina Toral', assignee: 'com-alvaro', priority: 'medium', createdDays: -35, dueDays: -35, dueAt: '11:00', status: 'completed', doneDays: -35, contact: 'c47', lead: 'L47' },
  { key: 'k40', type: 'offer', title: 'Presentar la oferta de Michael O’Brien a la promotora', assignee: 'com-paula', priority: 'high', createdDays: -42, dueDays: -41, dueAt: '12:00', status: 'completed', doneDays: -41, contact: 'c22', property: 'p10' },
  { key: 'k41', type: 'follow_up', title: 'Seguimiento de Pablo Riestra tras la visita de Candás', assignee: 'com-marta', priority: 'medium', createdDays: -40, dueDays: -36, dueAt: '12:00', status: 'completed', doneDays: -37, contact: 'c10', lead: 'L10', property: 'p17', appointment: 'a27' },
  { key: 'k42', type: 'document', title: 'Comprobar cargas del piso de la calle Mon (nota simple)', assignee: 'com-diego', priority: 'medium', createdDays: -86, dueDays: -80, dueAt: '12:00', status: 'completed', doneDays: -81, property: 'p12', contact: 'c33' },
]
