import { describe, expect, it } from 'vitest'
import * as schema from '../../server/db/schema'
import { dueReminderVisits } from '../../server/utils/appointments/reminderWindow'
import { agendaNowWall, utcToWallTime } from '../../server/utils/appointments/timezone'
import { computeAvailableSlots } from '../../server/utils/appointments/availability'
import { createTestDb, seedTenant } from './helpers/tenantFixtures'

/**
 * Las horas de las citas son hora de pared de la agencia. Recordatorios y
 * huecos libres comparaban esa hora con el reloj UTC del servidor: en una
 * agencia a UTC+2 el aviso de «1 h antes» salía 3 h antes. Estos tests fijan
 * «ahora» y comprueban el instante real con la zona de la agencia.
 */
const ts = '2026-01-01 00:00:00'

async function agencyIn(db: any, name: string, timezone: string) {
  const t = await seedTenant(db, name)
  await db.insert(schema.settings).values({ key: `org:${t.orgId}:timezone`, value: timezone, updatedAt: ts })
  return t
}

async function visitAt(db: any, orgId: number, agentId: number, scheduledAt: string) {
  const [row] = await db
    .insert(schema.visits)
    .values({ organizationId: orgId, clientName: `Cliente ${scheduledAt}`, clientEmail: 'c@example.com', agentId, scheduledAt, endsAt: scheduledAt, status: 'scheduled', channel: 'in_person', createdAt: ts })
    .returning()
  return row
}

describe('hora de pared ↔ instante real', () => {
  it('utcToWallTime da la hora que marca un reloj de esa zona', () => {
    const at = new Date('2026-07-15T08:00:00Z')
    expect(utcToWallTime(at, 'Europe/Madrid')).toBe('2026-07-15 10:00:00')
    expect(utcToWallTime(at, 'Asia/Dubai')).toBe('2026-07-15 12:00:00')
    expect(utcToWallTime(new Date('2026-01-15T08:00:00Z'), 'Europe/Madrid')).toBe('2026-01-15 09:00:00')
  })
})

describe('recordatorios con la zona de la agencia', () => {
  it('el de «1 h antes» sale una hora antes en Madrid, no tres', async () => {
    const { db } = createTestDb()
    const t = await agencyIn(db, 'RecMadrid', 'Europe/Madrid')
    // Ahora: 08:00 UTC = 10:00 en Madrid (verano).
    const now = new Date('2026-07-15T08:00:00Z')
    const real = await visitAt(db, t.orgId, t.teamMemberId, '2026-07-15 11:00:00') // dentro de 1 h de verdad
    const fake = await visitAt(db, t.orgId, t.teamMemberId, '2026-07-15 09:00:00') // «dentro de 1 h» sólo si se leyera como UTC (ya pasó)
    const due = await dueReminderVisits(db, 'reminder1hSentAt', now, 50 * 60 * 1000, 70 * 60 * 1000)
    const ids = due.map((v) => v.id)
    expect(ids).toContain(real.id)
    expect(ids).not.toContain(fake.id)
  })

  it('el de 24 h respeta la zona de cada agencia a la vez (Madrid y Dubái)', async () => {
    const { db } = createTestDb()
    const madrid = await agencyIn(db, 'Rec24Madrid', 'Europe/Madrid')
    const dubai = await agencyIn(db, 'Rec24Dubai', 'Asia/Dubai')
    const now = new Date('2026-07-15T08:00:00Z')
    // Mañana a las 10:00 en Madrid = 08:00 UTC del 16: dentro de 24 h exactas.
    const m = await visitAt(db, madrid.orgId, madrid.teamMemberId, '2026-07-16 10:00:00')
    // Mañana a las 12:00 en Dubái = 08:00 UTC del 16: también.
    const d = await visitAt(db, dubai.orgId, dubai.teamMemberId, '2026-07-16 12:00:00')
    // Mañana a las 10:00 en Dubái = 06:00 UTC del 16: faltan 22 h, todavía no.
    const early = await visitAt(db, dubai.orgId, dubai.teamMemberId, '2026-07-16 10:00:00')
    const ids = (await dueReminderVisits(db, 'reminder24hSentAt', now, 23.5 * 60 * 60 * 1000, 24.5 * 60 * 60 * 1000)).map((v) => v.id)
    expect(ids).toEqual(expect.arrayContaining([m.id, d.id]))
    expect(ids).not.toContain(early.id)
  })

  it('una cita ya avisada o cancelada no vuelve a salir', async () => {
    const { db } = createTestDb()
    const t = await agencyIn(db, 'RecSent', 'Europe/Madrid')
    const now = new Date('2026-07-15T08:00:00Z')
    const v = await visitAt(db, t.orgId, t.teamMemberId, '2026-07-15 11:00:00')
    const { eq } = await import('drizzle-orm')
    await db.update(schema.visits).set({ reminder1hSentAt: ts }).where(eq(schema.visits.id, v.id))
    const c = await visitAt(db, t.orgId, t.teamMemberId, '2026-07-15 11:05:00')
    await db.update(schema.visits).set({ status: 'cancelled' }).where(eq(schema.visits.id, c.id))
    expect(await dueReminderVisits(db, 'reminder1hSentAt', now, 50 * 60 * 1000, 70 * 60 * 1000)).toEqual([])
  })
})

describe('huecos libres con el reloj de la agenda', () => {
  it('«ya pasado» se mide en la zona de la agenda, no en UTC', async () => {
    const { db } = createTestDb()
    const t = await agencyIn(db, 'Huecos', 'Europe/Madrid')
    // Miércoles 15/07/2026; disponibilidad de 09:00 a 13:00 en tramos de 60 min.
    await db.insert(schema.agentAvailability).values({ organizationId: t.orgId, agentId: t.teamMemberId, dayOfWeek: 3, startTime: '09:00', endTime: '13:00', createdAt: ts })
    // 08:30 UTC = 10:30 en Madrid: sólo deben quedar las 11:00 y las 12:00.
    const nowWall = await agendaNowWall(db, t.orgId, t.teamMemberId, new Date('2026-07-15T08:30:00Z'))
    expect(nowWall).toBe('2026-07-15 10:30:00')
    const slots = await computeAvailableSlots(db, t.orgId, t.teamMemberId, '2026-07-15', 60, { nowWall })
    expect(slots.map((s) => s.start)).toEqual(['2026-07-15 11:00:00', '2026-07-15 12:00:00'])
  })
})
