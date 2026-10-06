/**
 * Negocio de la cuenta demo: ofertas (con su historial de revisiones),
 * operaciones, reservas, contratos, depósitos y facturas. Importes en EUR.
 *
 * Cada oferta se recorre con el OfferService real (crear → enviar →
 * contraofertas → aceptar/rechazar/retirar/caducar), revisión a revisión y en
 * su fecha, así que el historial no se escribe a mano. Las operaciones nacen
 * de su oferta aceptada (DealService) y avanzan de fase en fase.
 */

export type OfferStep =
  | { op: 'submit'; days: number; at: string }
  | { op: 'counter'; days: number; at: string; amount: number; conditions?: string }
  | { op: 'new'; days: number; at: string; amount: number; conditions?: string }
  | { op: 'accept'; days: number; at: string }
  | { op: 'reject'; days: number; at: string }
  | { op: 'withdraw'; days: number; at: string }
  | { op: 'expire'; days: number; at: string }

export interface DemoOffer {
  key: string
  property: string
  buyer: string
  lead: string
  requirement?: string
  commercial: string
  amount: number
  conditions?: string
  /** Del catálogo OFFER_FINANCE_CONDITIONS (utils/pipelineCatalog.ts). */
  financeCondition?: 'cash' | 'mortgage_subject' | 'mortgage_preapproved' | 'mortgage_approved' | 'other'
  expirationDays?: number
  days: number
  at: string
  steps: OfferStep[]
}

export const OFFERS: DemoOffer[] = [
  // Caso Laura: negociación con varias revisiones y aceptada → operación en arras.
  { key: 'o01', property: 'p01', buyer: 'c01', lead: 'L01', requirement: 'r01', commercial: 'com-lucia', amount: 275_000, conditions: 'Incluye plaza de garaje y trastero.', financeCondition: 'mortgage_approved', expirationDays: -55, days: -66, at: '12:30',
    steps: [{ op: 'submit', days: -66, at: '12:40' }, { op: 'counter', days: -64, at: '10:15', amount: 287_000, conditions: 'La promotora mantiene garaje y trastero.' }, { op: 'new', days: -63, at: '19:20', amount: 281_000 }, { op: 'counter', days: -62, at: '11:00', amount: 283_000 }, { op: 'accept', days: -61, at: '13:10' }] },
  // Caso Rubén: negociación abierta, la última palabra es de la propiedad.
  { key: 'o02', property: 'p16', buyer: 'c06', lead: 'L06', requirement: 'r06', commercial: 'com-marta', amount: 220_000, financeCondition: 'mortgage_preapproved', expirationDays: 6, days: -28, at: '18:10',
    steps: [{ op: 'submit', days: -28, at: '18:20' }, { op: 'counter', days: -24, at: '12:00', amount: 235_000 }, { op: 'new', days: -20, at: '20:05', amount: 228_000, conditions: 'Entrega de llaves en 60 días.' }, { op: 'counter', days: -2, at: '13:30', amount: 232_000 }] },
  // Óscar: inversión, aceptada → operación en financiación.
  { key: 'o03', property: 'p12', buyer: 'c08', lead: 'L08', requirement: 'r08', commercial: 'com-diego', amount: 165_000, conditions: 'Pago al contado; firma en 60 días.', financeCondition: 'cash', days: -60, at: '11:00',
    steps: [{ op: 'submit', days: -60, at: '11:05' }, { op: 'counter', days: -58, at: '17:30', amount: 175_000 }, { op: 'new', days: -57, at: '10:00', amount: 172_000 }, { op: 'accept', days: -56, at: '12:45' }] },
  // Tamargo: aceptada → cerrada (caso 6).
  { key: 'o04', property: 'p15', buyer: 'c07', lead: 'L07', requirement: 'r07', commercial: 'com-marta', amount: 140_000, financeCondition: 'mortgage_approved', days: -106, at: '17:00',
    steps: [{ op: 'submit', days: -106, at: '17:10' }, { op: 'counter', days: -104, at: '12:00', amount: 147_000 }, { op: 'new', days: -103, at: '18:30', amount: 145_000 }, { op: 'accept', days: -102, at: '10:20' }] },
  // Collins: aceptada → cerrada.
  { key: 'o05', property: 'p20', buyer: 'c09', lead: 'L09', requirement: 'r09', commercial: 'com-javier', amount: 330_000, conditions: 'Pago al contado.', financeCondition: 'cash', days: -142, at: '16:00',
    steps: [{ op: 'submit', days: -142, at: '16:10' }, { op: 'counter', days: -140, at: '11:30', amount: 345_000 }, { op: 'new', days: -139, at: '19:00', amount: 340_000 }, { op: 'accept', days: -138, at: '12:15' }] },
  // Irene: aceptada → operación en reserva.
  { key: 'o06', property: 'p13', buyer: 'c11', lead: 'L11', requirement: 'r11', commercial: 'com-alvaro', amount: 245_000, financeCondition: 'mortgage_approved', days: -26, at: '12:00',
    steps: [{ op: 'submit', days: -26, at: '12:05' }, { op: 'counter', days: -24, at: '17:00', amount: 252_000 }, { op: 'new', days: -23, at: '10:30', amount: 250_000 }, { op: 'accept', days: -22, at: '12:30' }] },
  // Weber: borrador creado desde el resultado de la visita (caso 4).
  { key: 'o07', property: 'p19', buyer: 'c05', lead: 'L05', requirement: 'r05', commercial: 'com-paula', amount: 430_000, conditions: 'Incluye el mobiliario de la cocina; entrega en primavera.', days: -5, at: '16:30', steps: [] },
  // O'Brien: rechazada por la propiedad.
  { key: 'o08', property: 'p10', buyer: 'c22', lead: 'L22', requirement: 'r22', commercial: 'com-paula', amount: 820_000, conditions: 'Pago al contado.', financeCondition: 'cash', days: -42, at: '15:00',
    steps: [{ op: 'submit', days: -42, at: '15:10' }, { op: 'reject', days: -39, at: '11:45' }] },
  // Héctor: retirada por el comprador.
  { key: 'o09', property: 'p14', buyer: 'c12', lead: 'L12', requirement: 'r12', commercial: 'com-alvaro', amount: 800_000, financeCondition: 'mortgage_subject', days: -56, at: '13:00',
    steps: [{ op: 'submit', days: -56, at: '13:10' }, { op: 'counter', days: -54, at: '18:00', amount: 870_000 }, { op: 'withdraw', days: -45, at: '10:00' }] },
  // Begoña: aceptada → operación en documentación.
  { key: 'o10', property: 'p09', buyer: 'c13', lead: 'L13', requirement: 'r13', commercial: 'com-javier', amount: 345_000, financeCondition: 'mortgage_approved', days: -47, at: '11:30',
    steps: [{ op: 'submit', days: -47, at: '11:35' }, { op: 'accept', days: -45, at: '17:00' }] },
  // Pablo: enviada y caducada sin respuesta.
  { key: 'o11', property: 'p17', buyer: 'c10', lead: 'L10', requirement: 'r10', commercial: 'com-marta', amount: 200_000, financeCondition: 'mortgage_subject', expirationDays: -25, days: -35, at: '19:00',
    steps: [{ op: 'submit', days: -35, at: '19:05' }, { op: 'expire', days: -24, at: '09:00' }] },
  // Marcos: aceptada → operación camino de notaría.
  { key: 'o12', property: 'p07', buyer: 'c14', lead: 'L14', requirement: 'r14', commercial: 'com-paula', amount: 355_000, financeCondition: 'mortgage_approved', days: -54, at: '12:00',
    steps: [{ op: 'submit', days: -54, at: '12:10' }, { op: 'counter', days: -52, at: '10:00', amount: 362_000 }, { op: 'accept', days: -51, at: '16:40' }] },
  // Alquiler de Pola de Siero: aceptada → cerrada.
  { key: 'o13', property: 'p18', buyer: 'c44', lead: 'L44', commercial: 'com-diego', amount: 690, conditions: 'Contrato de 1 año prorrogable; fianza de una mensualidad y garantía de dos.', days: -57, at: '12:00',
    steps: [{ op: 'submit', days: -57, at: '12:05' }, { op: 'accept', days: -56, at: '18:00' }] },
]

/**
 * Operaciones (Deal). `stages` son las fases por las que pasa, con su día;
 * `close` la cierra (y crea el cierre con su comisión).
 */
export interface DemoDeal {
  key: string
  offer: string
  stages: { stage: 'reservation' | 'deposit_contract' | 'financing' | 'documentation' | 'notary' | 'signature'; days: number; at: string; reason: string }[]
  close?: { days: number; at: string }
}

export const DEALS: DemoDeal[] = [
  { key: 'd01', offer: 'o01', stages: [{ stage: 'reservation', days: -57, at: '13:00', reason: 'Firmada la reserva con 3.000 €' }, { stage: 'deposit_contract', days: -40, at: '12:30', reason: 'Firmadas las arras (10 %)' }] },
  { key: 'd02', offer: 'o03', stages: [{ stage: 'reservation', days: -54, at: '12:00', reason: 'Reserva de 3.000 €' }, { stage: 'deposit_contract', days: -44, at: '12:00', reason: 'Arras firmadas' }, { stage: 'financing', days: -20, at: '10:00', reason: 'Préstamo de reforma en estudio' }] },
  { key: 'd03', offer: 'o04', stages: [{ stage: 'reservation', days: -100, at: '12:00', reason: 'Reserva de 2.000 €' }, { stage: 'deposit_contract', days: -90, at: '12:00', reason: 'Arras firmadas' }, { stage: 'financing', days: -82, at: '10:00', reason: 'Hipoteca en tramitación' }, { stage: 'notary', days: -70, at: '10:00', reason: 'Escritura señalada' }, { stage: 'signature', days: -62, at: '13:30', reason: 'Escritura firmada' }], close: { days: -62, at: '14:00' } },
  { key: 'd04', offer: 'o05', stages: [{ stage: 'reservation', days: -137, at: '12:00', reason: 'Reserva de 5.000 €' }, { stage: 'deposit_contract', days: -131, at: '12:00', reason: 'Arras firmadas' }, { stage: 'documentation', days: -128, at: '10:00', reason: 'NIE y documentación de la compradora' }, { stage: 'notary', days: -124, at: '10:00', reason: 'Escritura señalada' }, { stage: 'signature', days: -120, at: '12:30', reason: 'Escritura firmada' }], close: { days: -120, at: '13:00' } },
  { key: 'd05', offer: 'o06', stages: [{ stage: 'reservation', days: -21, at: '12:00', reason: 'Reserva de 2.000 €; arras previstas' }] },
  { key: 'd06', offer: 'o12', stages: [{ stage: 'reservation', days: -50, at: '12:00', reason: 'Reserva de 3.000 €' }, { stage: 'deposit_contract', days: -42, at: '12:00', reason: 'Arras firmadas' }, { stage: 'financing', days: -30, at: '10:00', reason: 'Hipoteca aprobada' }, { stage: 'notary', days: -6, at: '10:00', reason: 'Escritura señalada para la semana que viene' }] },
  { key: 'd07', offer: 'o13', stages: [{ stage: 'documentation', days: -54, at: '10:00', reason: 'Nóminas y garantía revisadas' }, { stage: 'signature', days: -50, at: '13:00', reason: 'Contrato de alquiler firmado' }], close: { days: -50, at: '13:30' } },
  { key: 'd08', offer: 'o10', stages: [{ stage: 'reservation', days: -44, at: '12:00', reason: 'Reserva de 5.000 € a la promotora' }, { stage: 'documentation', days: -20, at: '10:00', reason: 'Contrato privado de compraventa en revisión' }] },
]

/** Reservas: la entidad Reserva enlazada a su operación. */
export const RESERVATIONS = [
  { key: 'rv01', deal: 'd01', reference: 'RES-2026-031', amount: 283_000, deposit: 3_000, status: 'confirmed', days: -57, at: '13:00' },
  { key: 'rv02', deal: 'd02', reference: 'RES-2026-034', amount: 172_000, deposit: 3_000, status: 'confirmed', days: -54, at: '12:00' },
  { key: 'rv03', deal: 'd03', reference: 'RES-2026-018', amount: 145_000, deposit: 2_000, status: 'completed', days: -100, at: '12:00' },
  { key: 'rv04', deal: 'd04', reference: 'RES-2026-009', amount: 340_000, deposit: 5_000, status: 'completed', days: -137, at: '12:00' },
  { key: 'rv05', deal: 'd05', reference: 'RES-2026-041', amount: 250_000, deposit: 2_000, status: 'pending', days: -21, at: '12:00' },
  { key: 'rv06', deal: 'd06', reference: 'RES-2026-036', amount: 362_000, deposit: 3_000, status: 'confirmed', days: -50, at: '12:00' },
  { key: 'rv07', deal: 'd08', reference: 'RES-2026-038', amount: 345_000, deposit: 5_000, status: 'confirmed', days: -44, at: '12:00' },
  { key: 'rv08', deal: null, reference: 'RES-2026-027', amount: 870_000, deposit: 6_000, status: 'cancelled', days: -53, at: '12:00', clientName: 'Héctor Tuñón Caso', property: 'p14' },
] as const

/** Plantillas de contrato de la agencia (texto claramente de demostración). */
export const CONTRACT_TEMPLATES = [
  { key: 'ct-reserva', name: 'Contrato de reserva', type: 'reserva' },
  { key: 'ct-arras', name: 'Contrato de arras penitenciales', type: 'arras' },
  { key: 'ct-alquiler', name: 'Contrato de arrendamiento de vivienda', type: 'alquiler' },
  { key: 'ct-compraventa', name: 'Contrato privado de compraventa', type: 'compraventa' },
] as const

export const CONTRACTS = [
  { key: 'k-res-laura', template: 'ct-reserva', title: 'Reserva · Obra nueva con terraza en Montecerrao', contact: 'c01', property: 'p01', deal: 'd01', status: 'accepted', days: -57, at: '12:30' },
  { key: 'k-arr-laura', template: 'ct-arras', title: 'Arras · Obra nueva con terraza en Montecerrao', contact: 'c01', property: 'p01', deal: 'd01', status: 'accepted', days: -40, at: '12:00' },
  { key: 'k-res-irene', template: 'ct-reserva', title: 'Reserva · Vivienda familiar reformada en Viesques', contact: 'c11', property: 'p13', deal: 'd05', status: 'sent', days: -21, at: '11:30' },
  { key: 'k-arr-oscar', template: 'ct-arras', title: 'Arras · Piso para reformar en el centro de Oviedo', contact: 'c08', property: 'p12', deal: 'd02', status: 'accepted', days: -44, at: '11:30' },
  { key: 'k-arr-marcos', template: 'ct-arras', title: 'Arras · Bajo con terraza junto a la playa de Santa Marina', contact: 'c14', property: 'p07', deal: 'd06', status: 'accepted', days: -42, at: '11:30' },
  { key: 'k-alq-ramon', template: 'ct-alquiler', title: 'Arrendamiento · Apartamento en Pola de Siero', contact: 'c44', property: 'p18', deal: 'd07', status: 'accepted', days: -50, at: '12:30' },
  { key: 'k-cv-begona', template: 'ct-compraventa', title: 'Compraventa (borrador) · Casa pareada en Amandi', contact: 'c13', property: 'p09', deal: 'd08', status: 'draft', days: -18, at: '10:00' },
] as const

/** Depósitos (señales, arras y fianzas) registrados contra su contrato. Sin cobro real: Stripe no interviene. */
export const DEPOSITS = [
  { key: 'dp01', contract: 'k-res-laura', deal: 'd01', amount: 3_000, status: 'paid', days: -57, at: '13:00' },
  { key: 'dp02', contract: 'k-arr-laura', deal: 'd01', amount: 25_300, status: 'paid', days: -40, at: '12:40' },
  { key: 'dp03', contract: 'k-arr-oscar', deal: 'd02', amount: 14_200, status: 'paid', days: -44, at: '12:10' },
  { key: 'dp04', contract: 'k-arr-marcos', deal: 'd06', amount: 33_200, status: 'paid', days: -42, at: '12:20' },
  { key: 'dp05', contract: 'k-alq-ramon', deal: 'd07', amount: 690, status: 'paid', days: -50, at: '13:00' },
  { key: 'dp06', contract: 'k-res-irene', deal: 'd05', amount: 2_000, status: 'pending', days: -21, at: '12:00' },
] as const

/**
 * Facturas de la agencia a sus clientes. Los honorarios de una operación
 * cerrada salen de su importe y del porcentaje pactado en la ficha. El número
 * se asigna al sembrar, correlativo por fecha (`invoiceNumber`, events/business.ts).
 */
export const INVOICES = [
  { key: 'f01', client: 'c42', concept: 'Honorarios de intermediación · Venta de la casa de Selorio (Villaviciosa)', fromDeal: 'd04', status: 'paid', issuedDays: -120, dueDays: -105, paidDays: -112 },
  { key: 'f02', client: 'c37', concept: 'Honorarios de intermediación · Venta del piso del centro de Avilés', fromDeal: 'd03', status: 'paid', issuedDays: -62, dueDays: -47, paidDays: -55 },
  { key: 'f03', client: 'c40', concept: 'Honorarios de arrendamiento · Apartamento de Pola de Siero (una mensualidad)', amount: 690, status: 'paid', issuedDays: -50, dueDays: -40, paidDays: -46 },
  { key: 'f04', client: 'c40', concept: 'Gestión de alquiler · Pola de Siero · mes 1', amount: 55.2, status: 'paid', issuedDays: -20, dueDays: -10, paidDays: -18 },
  { key: 'f05', client: 'c40', concept: 'Gestión de alquiler · Pola de Siero · mes 2', amount: 55.2, status: 'pending', issuedDays: 0, dueDays: 10 },
  { key: 'f06', client: 'c35', concept: 'Servicios inmobiliarios · Informe de valoración del chalet de Somió', amount: 250, status: 'paid', issuedDays: -128, dueDays: -113, paidDays: -120 },
  { key: 'f07', client: 'c41', concept: 'Servicios de marketing · Reportaje fotográfico y vídeo de la casa de Posada', amount: 180, status: 'paid', issuedDays: -118, dueDays: -103, paidDays: -110 },
  { key: 'f08', client: 'c39', concept: 'Servicios inmobiliarios · Gestión del certificado energético (Candás)', amount: 120, status: 'paid', issuedDays: -54, dueDays: -39, paidDays: -50 },
  { key: 'f09', client: 'c38', concept: 'Servicios de marketing · Reportaje fotográfico del dúplex de Luanco', amount: 150, status: 'overdue', issuedDays: -70, dueDays: -40 },
  { key: 'f10', client: 'c34', concept: 'Servicios inmobiliarios · Informe de valoración del piso de Viesques', amount: 200, status: 'paid', issuedDays: -95, dueDays: -80, paidDays: -88 },
  { key: 'f11', client: 'c08', concept: 'Asesoramiento en inversión · Piso de la calle Mon (Oviedo)', amount: 1_500, status: 'paid', issuedDays: -12, dueDays: 18, paidDays: -3 },
  { key: 'f12', client: 'dev-sella', concept: 'Honorarios de comercialización · Casa pareada en Villas de Amandi', amount: 10_350, status: 'draft', issuedDays: -2, dueDays: 28 },
  { key: 'f13', client: 'dev-cantabrico', concept: 'Honorarios de comercialización · Obra nueva en Montecerrao', amount: 8_490, status: 'paid', issuedDays: -25, dueDays: 5, paidDays: -9 },
  { key: 'f14', client: 'c32', concept: 'Servicios inmobiliarios · Gestión de nota simple y cargas (calle Mon)', amount: 90, status: 'paid', issuedDays: -80, dueDays: -65, paidDays: -76 },
  { key: 'f15', client: 'c30', concept: 'Servicios de marketing · Home staging del piso de La Florida', amount: 450, status: 'overdue', issuedDays: -60, dueDays: -30 },
  { key: 'f16', client: 'dev-sella', concept: 'Honorarios de comercialización · Bajo con terraza en Santa Marina (reserva)', amount: 3_620, status: 'pending', issuedDays: -5, dueDays: 25 },
] as const
