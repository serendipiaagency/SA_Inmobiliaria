import { CONTACTS, LEADS, REQUIREMENTS } from './dataset/crm'
import { PROPERTIES } from './dataset/properties'
import { OFFERS, DEALS } from './dataset/business'

/**
 * Cuándo existe cada cosa del escenario, en minutos desde el anclaje
 * (`días × 1440 + hora`). Sirve para que nada se apunte antes de que exista
 * aquello a lo que se refiere: una cita no se reserva antes de que entre el
 * contacto, una tarea no se crea antes que su operación.
 */

export function toMinutes(days: number, at: string): number {
  const [h, m] = at.split(':').map(Number)
  return days * 1440 + h * 60 + m
}

export function fromMinutes(total: number): { days: number; at: string } {
  const days = Math.floor(total / 1440)
  const rest = total - days * 1440
  return { days, at: `${String(Math.floor(rest / 60)).padStart(2, '0')}:${String(rest % 60).padStart(2, '0')}` }
}

/** El contacto lo crea su lead, salvo los que existían antes (propietarios, parejas…): ver events/crm.ts. */
export function contactMoment(key: string): number {
  const c = CONTACTS.find((x) => x.key === key)
  if (!c) throw new Error(`Demo: contacto desconocido ${key}`)
  const lead = LEADS.find((l) => l.contact === key)
  const standalone = !lead || lead.days > c.days + 1
  return standalone ? toMinutes(c.days, c.at) : toMinutes(lead!.days, lead!.at)
}

export function leadMoment(key: string): number {
  const l = LEADS.find((x) => x.key === key)
  if (!l) throw new Error(`Demo: lead desconocido ${key}`)
  return toMinutes(l.days, l.at)
}

/** Captación de la propiedad (events/properties.ts, 10:30). */
export function propertyMoment(key: string): number {
  const p = PROPERTIES.find((x) => x.key === key)
  if (!p) throw new Error(`Demo: propiedad desconocida ${key}`)
  return toMinutes(p.days, '10:30')
}

/** Alta de la necesidad (events/crm.ts, 12:40). */
export function requirementMoment(key: string): number {
  const r = REQUIREMENTS.find((x) => x.key === key)
  if (!r) throw new Error(`Demo: necesidad desconocida ${key}`)
  return toMinutes(r.days, '12:40')
}

/** La operación nace al aceptarse su oferta. */
export function dealMoment(key: string): number {
  const d = DEALS.find((x) => x.key === key)
  const o = d && OFFERS.find((x) => x.key === d.offer)
  const accept = o?.steps.find((s) => s.op === 'accept')
  if (!accept) throw new Error(`Demo: la operación ${key} no tiene oferta aceptada`)
  return toMinutes(accept.days, accept.at)
}

/** El primer momento en que existe todo lo que se cita (+ un margen). */
export function after(refs: { contact?: string | null; lead?: string | null; property?: string | null; requirement?: string | null; deal?: string | null }, marginMin = 10): number {
  const ms = [
    refs.contact ? contactMoment(refs.contact) : -Infinity,
    refs.lead ? leadMoment(refs.lead) : -Infinity,
    refs.property ? propertyMoment(refs.property) : -Infinity,
    refs.requirement ? requirementMoment(refs.requirement) : -Infinity,
    refs.deal ? dealMoment(refs.deal) : -Infinity,
  ]
  return Math.max(...ms) + marginMin
}
