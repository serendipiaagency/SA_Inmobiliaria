import { and, eq, gte, isNull, ne } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { now } from '../db'
import { appointmentChannelLabel, appointmentTypeLabel } from '../../../utils/appointmentCatalog'
import { createTimezoneResolver, wallTimeToIcsUtc } from './timezone'
import { addMinutes } from './fields'

/**
 * Feed iCal de la agenda de un comercial (FASE 20) — lo que sirve
 * `/calendar/<token>.ics` para suscribirse desde Google Calendar u Outlook.
 *
 * Las horas de `visits` son hora de pared de la agencia (timezone.ts). Antes
 * se escribían tal cual con una `Z` final, así que una cita a las 10:00 en
 * Madrid aparecía a las 12:00 (verano) en el calendario del comercial. Ahora
 * cada cita se convierte a su instante UTC real con SU zona (la de la cita,
 * su oficina, la oficina del comercial o la de la agencia) y se emite en
 * UTC con `Z`, que todos los clientes de calendario interpretan igual sin
 * necesidad de un bloque VTIMEZONE.
 */

const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** RFC 5545 §3.1: líneas de como mucho 75 octetos; las siguientes empiezan por un espacio. */
export function foldIcsLine(line: string): string {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const out: string[] = []
  let current = ''
  let size = 0
  for (const ch of line) {
    const len = new TextEncoder().encode(ch).length
    const limit = out.length ? 74 : 75
    if (size + len > limit) {
      out.push(current)
      current = ''
      size = 0
    }
    current += ch
    size += len
  }
  out.push(current)
  return out.join('\r\n ')
}

export interface IcsAgent {
  id: number
  name: string
  organizationId: number
}

/** Citas desde ayer (para no perder las de hoy en ninguna zona horaria), sin las canceladas ni las de la papelera (cierre D3a). */
export async function buildAgentIcs(db: any, agent: IcsAgent, opts: { nowTs?: string } = {}): Promise<string> {
  const nowTs = opts.nowTs || now()
  const visits = await db
    .select()
    .from(schema.visits)
    .where(and(eq(schema.visits.organizationId, agent.organizationId), eq(schema.visits.agentId, agent.id), ne(schema.visits.status, 'cancelled'), isNull(schema.visits.deletedAt), gte(schema.visits.scheduledAt, addMinutes(nowTs, -24 * 60).slice(0, 10))))

  const tz = await createTimezoneResolver(db, agent.organizationId)
  const stamp = `${nowTs.replace(/[-:]/g, '').replace(' ', 'T')}Z`
  const events: string[] = []
  for (const v of visits as any[]) {
    const zone = await tz.resolve(v)
    const end = v.endsAt || addMinutes(v.scheduledAt, v.durationMinutes || 60)
    const summary = `${appointmentTypeLabel(v.type)}: ${v.clientName}${v.propertyName ? ` — ${v.propertyName}` : ''}`
    const description = [appointmentChannelLabel(v.channel), v.videoLink, `Hora local: ${v.scheduledAt.slice(0, 16)} (${zone})`].filter(Boolean).join('\n')
    const location = v.meetingPoint || (v.channel === 'in_person' ? v.propertyName : null)
    events.push(
      ...[
        'BEGIN:VEVENT',
        `UID:visit-${v.id}@sa-inmobiliaria`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${wallTimeToIcsUtc(v.scheduledAt, zone)}`,
        `DTEND:${wallTimeToIcsUtc(end, zone)}`,
        `SUMMARY:${icsEscape(summary)}`,
        location ? `LOCATION:${icsEscape(location)}` : '',
        `DESCRIPTION:${icsEscape(description)}`,
        'STATUS:CONFIRMED',
        'END:VEVENT',
      ].filter(Boolean),
    )
  }

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SA Inmobiliaria//Agenda de citas//ES',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${icsEscape(`Citas — ${agent.name}`)}`,
    `X-WR-TIMEZONE:${tz.agencyTz}`,
    ...events,
    'END:VCALENDAR',
  ]
    .map(foldIcsLine)
    .join('\r\n')
}
