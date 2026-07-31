import { and, eq, gte, lte, ne } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { now } from '../db'

export interface Slot {
  start: string
  end: string
}

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** UTC day-of-week (0=domingo..6=sábado) for a plain 'YYYY-MM-DD' calendar date, matching agent_availability.dayOfWeek. */
function dayOfWeekFor(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay()
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && aEnd > bStart
}

/** Shifts a 'YYYY-MM-DD HH:MM:SS' string by `minutes` (may be negative), for expanding a busy interval by a travel/prep buffer. */
function shiftDateTime(dateTime: string, minutes: number): string {
  return new Date(new Date(`${dateTime.replace(' ', 'T')}Z`).getTime() + minutes * 60_000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19)
}

export interface AvailabilityOptions {
  /** Minutes of margin kept clear on both sides of every existing visit — travel/prep time between appointments. */
  bufferMinutes?: number
  /** Hard cap on how many non-cancelled visits this agent can have in one calendar day, regardless of open slots. Null/undefined = unlimited. */
  maxAppointmentsPerDay?: number | null
  /** Excludes this visit id from the busy-check — a client rescheduling their own appointment shouldn't have it block itself. */
  excludeVisitId?: number
}

/**
 * Real availability for one agent on one calendar day: weekly working-hours
 * rules, minus any time-off for that date, minus a full day's worth of slots
 * once the agent hits their daily cap, minus slots that would fall within a
 * buffer window around an existing non-cancelled visit, minus slots already
 * in the past. This is the one place both the public slot picker and the
 * booking endpoint's own server-side re-check go through, so a client can
 * never book a slot the UI never actually offered.
 */
export async function computeAvailableSlots(
  db: any,
  orgId: number,
  agentId: number,
  dateStr: string,
  slotDurationMinutes: number,
  options: AvailabilityOptions = {},
): Promise<Slot[]> {
  const dow = dayOfWeekFor(dateStr)
  const rules = await db
    .select({ startTime: schema.agentAvailability.startTime, endTime: schema.agentAvailability.endTime })
    .from(schema.agentAvailability)
    .where(and(eq(schema.agentAvailability.organizationId, orgId), eq(schema.agentAvailability.agentId, agentId), eq(schema.agentAvailability.dayOfWeek, dow)))
  if (!rules.length) return []

  const timeOff = await db
    .select({ id: schema.agentTimeOff.id })
    .from(schema.agentTimeOff)
    .where(and(eq(schema.agentTimeOff.organizationId, orgId), eq(schema.agentTimeOff.agentId, agentId), eq(schema.agentTimeOff.date, dateStr)))
    .limit(1)
  if (timeOff[0]) return []

  const dayStart = `${dateStr} 00:00:00`
  const dayEnd = `${dateStr} 23:59:59`
  const busyConditions = [
    eq(schema.visits.organizationId, orgId),
    eq(schema.visits.agentId, agentId),
    ne(schema.visits.status, 'cancelled'),
    gte(schema.visits.scheduledAt, dayStart),
    lte(schema.visits.scheduledAt, dayEnd),
  ]
  if (options.excludeVisitId) busyConditions.push(ne(schema.visits.id, options.excludeVisitId))
  const busy = await db
    .select({ scheduledAt: schema.visits.scheduledAt, endsAt: schema.visits.endsAt })
    .from(schema.visits)
    .where(and(...busyConditions))

  if (options.maxAppointmentsPerDay != null && busy.length >= options.maxAppointmentsPerDay) return []

  const buffer = options.bufferMinutes || 0
  const nowTs = now()
  const slots: Slot[] = []
  for (const rule of rules) {
    const windowStart = timeToMinutes(rule.startTime)
    const windowEnd = timeToMinutes(rule.endTime)
    for (let t = windowStart; t + slotDurationMinutes <= windowEnd; t += slotDurationMinutes) {
      const start = `${dateStr} ${minutesToTime(t)}:00`
      const end = `${dateStr} ${minutesToTime(t + slotDurationMinutes)}:00`
      if (start <= nowTs) continue
      const blocked = busy.some((b: any) => overlaps(start, end, shiftDateTime(b.scheduledAt, -buffer), shiftDateTime(b.endsAt || b.scheduledAt, buffer)))
      if (!blocked) slots.push({ start, end })
    }
  }
  return slots.sort((a, b) => a.start.localeCompare(b.start))
}

/** Server-side re-check at booking time — never trust that a client-submitted slot was really offered. */
export async function isSlotAvailable(
  db: any,
  orgId: number,
  agentId: number,
  startDateTime: string,
  slotDurationMinutes: number,
  options: AvailabilityOptions = {},
): Promise<boolean> {
  const dateStr = startDateTime.slice(0, 10)
  const slots = await computeAvailableSlots(db, orgId, agentId, dateStr, slotDurationMinutes, options)
  return slots.some((s) => s.start === startDateTime)
}

/**
 * Double-booking guard for admin reschedule/reassign — deliberately NOT gated
 * by working-hours rules or time-off (staff may legitimately need to book
 * outside the usual window), only by "is this agent already committed to
 * another client at that time". `excludeVisitId` lets a reschedule check
 * against every OTHER visit without flagging itself as a conflict.
 */
export async function hasOverlappingVisit(db: any, orgId: number, agentId: number, startAt: string, endAt: string, excludeVisitId?: number): Promise<boolean> {
  const dayStart = `${startAt.slice(0, 10)} 00:00:00`
  const dayEnd = `${startAt.slice(0, 10)} 23:59:59`
  const rows = await db
    .select({ id: schema.visits.id, scheduledAt: schema.visits.scheduledAt, endsAt: schema.visits.endsAt })
    .from(schema.visits)
    .where(
      and(
        eq(schema.visits.organizationId, orgId),
        eq(schema.visits.agentId, agentId),
        ne(schema.visits.status, 'cancelled'),
        gte(schema.visits.scheduledAt, dayStart),
        lte(schema.visits.scheduledAt, dayEnd),
      ),
    )
  return rows.some((r: any) => r.id !== excludeVisitId && overlaps(startAt, endAt, r.scheduledAt, r.endsAt || r.scheduledAt))
}
