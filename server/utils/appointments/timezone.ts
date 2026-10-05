import { and, eq, inArray } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { DEFAULT_AGENCY_TIMEZONE, isValidTimeZone } from '../../../utils/appointmentCatalog'

/**
 * Zona horaria de una cita (FASE 17/20).
 *
 * `visits.scheduledAt`/`endsAt` son HORA DE PARED: «el 15 de julio a las
 * 10:00» tal y como lo ve la agencia, sin desplazamiento. Para exportar a un
 * calendario externo (iCal) hace falta el instante real, y eso depende de la
 * zona: 10:00 en Madrid en verano son las 08:00 UTC; en Dubái, las 06:00 UTC.
 *
 * Orden de resolución: la zona de la propia cita → la de su oficina → la de
 * la oficina de su comercial → la de la agencia (Sistema → Configuración) →
 * DEFAULT_AGENCY_TIMEZONE (la misma que ese panel muestra si nunca se guardó).
 */

/** Desplazamiento (ms) de `timeZone` respecto a UTC en el instante `utcMs`. */
function offsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const wallAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return wallAsUtc - Math.floor(utcMs / 1000) * 1000
}

/**
 * Instante UTC de una hora de pared 'YYYY-MM-DD HH:MM:SS' en `timeZone`.
 * Dos pasadas para acertar en los días de cambio de hora. Una hora que no
 * existe (el salto de primavera: 02:30 en Madrid) se lleva hacia delante
 * (03:30); una que existe dos veces (otoño) se toma ya en horario de
 * invierno — el mismo criterio que aplican los calendarios habituales.
 */
export function zonedWallTimeToUtc(wall: string, timeZone: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(wall)
  if (!m) throw new Error(`Hora no válida: ${wall}`)
  const asUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] || 0))
  const first = offsetMs(asUtc, timeZone)
  let ts = asUtc - first
  const second = offsetMs(ts, timeZone)
  if (second !== first) ts = asUtc - second
  return new Date(ts)
}

/** 'YYYYMMDDTHHMMSSZ' (formato UTC de iCal) de una hora de pared en `timeZone`. */
export function wallTimeToIcsUtc(wall: string, timeZone: string): string {
  return zonedWallTimeToUtc(wall, timeZone).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** La zona guardada en Sistema → Configuración para esta agencia, o null. La agencia 1 conserva sus ajustes anteriores al espacio de nombres `org:<id>:`. */
export async function organizationTimezone(db: any, orgId: number): Promise<string | null> {
  const keys = [`org:${orgId}:timezone`, ...(orgId === 1 ? ['timezone'] : [])]
  const rows: Array<{ key: string; value: string | null }> = await db.select({ key: schema.settings.key, value: schema.settings.value }).from(schema.settings).where(inArray(schema.settings.key, keys))
  const namespaced = rows.find((r) => r.key === keys[0])?.value
  const value = namespaced ?? rows.find((r) => r.key === 'timezone')?.value ?? null
  return isValidTimeZone(value) ? value : null
}

/**
 * Resuelve la zona de un lote de citas de UNA agencia con pocas consultas:
 * las oficinas implicadas (de la cita o de su comercial) y el ajuste de la
 * agencia se leen una sola vez.
 */
export async function createTimezoneResolver(db: any, orgId: number) {
  const agencyTz = (await organizationTimezone(db, orgId)) || DEFAULT_AGENCY_TIMEZONE
  const officeTz = new Map<number, string | null>()
  const agentOffice = new Map<number, number | null>()

  async function officeZone(officeId: number | null | undefined): Promise<string | null> {
    if (!officeId) return null
    if (!officeTz.has(officeId)) {
      const [row] = await db.select({ timezone: schema.offices.timezone }).from(schema.offices).where(and(eq(schema.offices.id, officeId), eq(schema.offices.organizationId, orgId))).limit(1)
      officeTz.set(officeId, isValidTimeZone(row?.timezone) ? row.timezone : null)
    }
    return officeTz.get(officeId) ?? null
  }

  return {
    agencyTz,
    async resolve(visit: { timezone?: string | null; officeId?: number | null; agentId?: number | null }): Promise<string> {
      if (isValidTimeZone(visit.timezone)) return visit.timezone
      const fromOffice = await officeZone(visit.officeId)
      if (fromOffice) return fromOffice
      if (visit.agentId) {
        if (!agentOffice.has(visit.agentId)) {
          const [row] = await db.select({ officeId: schema.teamMembers.officeId }).from(schema.teamMembers).where(and(eq(schema.teamMembers.id, visit.agentId), eq(schema.teamMembers.organizationId, orgId))).limit(1)
          agentOffice.set(visit.agentId, row?.officeId ?? null)
        }
        const fromAgentOffice = await officeZone(agentOffice.get(visit.agentId))
        if (fromAgentOffice) return fromAgentOffice
      }
      return agencyTz
    },
  }
}
