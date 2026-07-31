import { describe, expect, it } from 'vitest'
import { computeAvailableSlots, isSlotAvailable } from '../../server/utils/appointments/availability'

/** Fake `db.select().from().where()[.limit()]` chain returning queued results in call order. */
function fakeDb(resultQueue: any[][]) {
  const queue = [...resultQueue]
  const chain = (rows: any[]) => ({
    limit: async () => rows,
    then: (resolve: (v: any[]) => void) => resolve(rows),
  })
  return {
    select: () => ({
      from: () => ({
        where: () => chain(queue.shift() || []),
      }),
    }),
  }
}

describe('computeAvailableSlots', () => {
  it('returns nothing when the agent has no weekly rule for that day', async () => {
    const db = fakeDb([[]])
    const slots = await computeAvailableSlots(db, 1, 1, '2030-06-10', 60)
    expect(slots).toEqual([])
  })

  it('returns nothing when the date is blocked by time-off, even with a matching rule', async () => {
    const db = fakeDb([[{ startTime: '09:00', endTime: '17:00' }], [{ id: 1 }]])
    const slots = await computeAvailableSlots(db, 1, 1, '2030-06-10', 60)
    expect(slots).toEqual([])
  })

  it('generates hourly slots covering the full working window when nothing is booked', async () => {
    const db = fakeDb([[{ startTime: '09:00', endTime: '12:00' }], [], []])
    const slots = await computeAvailableSlots(db, 1, 1, '2030-06-10', 60)
    expect(slots.map((s) => s.start)).toEqual(['2030-06-10 09:00:00', '2030-06-10 10:00:00', '2030-06-10 11:00:00'])
    expect(slots[0].end).toBe('2030-06-10 10:00:00')
  })

  it('never offers a slot that would run past the end of the working window', async () => {
    // 09:00-10:30 window with 60-minute slots: only 09:00-10:00 fits, 10:00-11:00 would not.
    const db = fakeDb([[{ startTime: '09:00', endTime: '10:30' }], [], []])
    const slots = await computeAvailableSlots(db, 1, 1, '2030-06-10', 60)
    expect(slots.map((s) => s.start)).toEqual(['2030-06-10 09:00:00'])
  })

  it('excludes a slot that overlaps an existing non-cancelled visit for that agent', async () => {
    const db = fakeDb([
      [{ startTime: '09:00', endTime: '12:00' }],
      [],
      [{ scheduledAt: '2030-06-10 10:00:00', endsAt: '2030-06-10 11:00:00' }],
    ])
    const slots = await computeAvailableSlots(db, 1, 1, '2030-06-10', 60)
    expect(slots.map((s) => s.start)).toEqual(['2030-06-10 09:00:00', '2030-06-10 11:00:00'])
  })

  it('excludes past slots for a date that has already happened', async () => {
    const db = fakeDb([[{ startTime: '09:00', endTime: '12:00' }], [], []])
    const slots = await computeAvailableSlots(db, 1, 1, '2020-01-01', 60)
    expect(slots).toEqual([])
  })

  it('extends the blocked window around an existing visit by the configured buffer', async () => {
    const db = fakeDb([
      [{ startTime: '09:00', endTime: '13:00' }],
      [],
      [{ scheduledAt: '2030-06-10 10:00:00', endsAt: '2030-06-10 11:00:00' }],
    ])
    // 60-min buffer: blocks 09:00 (ends 10:00, buffer pushes busy start back to 09:00) and 11:00 (buffer pushes busy end to 12:00)
    const slots = await computeAvailableSlots(db, 1, 1, '2030-06-10', 60, { bufferMinutes: 60 })
    expect(slots.map((s) => s.start)).toEqual(['2030-06-10 12:00:00'])
  })

  it('zero buffer only blocks the exact overlapping slot, unaffected by the option existing', async () => {
    const db = fakeDb([
      [{ startTime: '09:00', endTime: '12:00' }],
      [],
      [{ scheduledAt: '2030-06-10 10:00:00', endsAt: '2030-06-10 11:00:00' }],
    ])
    const slots = await computeAvailableSlots(db, 1, 1, '2030-06-10', 60, { bufferMinutes: 0 })
    expect(slots.map((s) => s.start)).toEqual(['2030-06-10 09:00:00', '2030-06-10 11:00:00'])
  })

  it('returns nothing once the agent has reached their daily appointment cap', async () => {
    const db = fakeDb([
      [{ startTime: '09:00', endTime: '12:00' }],
      [],
      [
        { scheduledAt: '2030-06-10 09:00:00', endsAt: '2030-06-10 09:30:00' },
        { scheduledAt: '2030-06-10 10:00:00', endsAt: '2030-06-10 10:30:00' },
      ],
    ])
    const slots = await computeAvailableSlots(db, 1, 1, '2030-06-10', 60, { maxAppointmentsPerDay: 2 })
    expect(slots).toEqual([])
  })

  it('still offers slots below the daily appointment cap', async () => {
    const db = fakeDb([
      [{ startTime: '09:00', endTime: '12:00' }],
      [],
      [{ scheduledAt: '2030-06-10 09:00:00', endsAt: '2030-06-10 09:30:00' }],
    ])
    const slots = await computeAvailableSlots(db, 1, 1, '2030-06-10', 60, { maxAppointmentsPerDay: 2 })
    expect(slots.length).toBeGreaterThan(0)
  })
})

describe('isSlotAvailable', () => {
  it('confirms a slot that computeAvailableSlots would actually offer', async () => {
    const db = fakeDb([[{ startTime: '09:00', endTime: '12:00' }], [], []])
    expect(await isSlotAvailable(db, 1, 1, '2030-06-10 10:00:00', 60)).toBe(true)
  })

  it('rejects a slot that does not align with the working window', async () => {
    const db = fakeDb([[{ startTime: '09:00', endTime: '12:00' }], [], []])
    expect(await isSlotAvailable(db, 1, 1, '2030-06-10 08:30:00', 60)).toBe(false)
  })

  it('rejects a slot that overlaps an existing visit', async () => {
    const db = fakeDb([
      [{ startTime: '09:00', endTime: '12:00' }],
      [],
      [{ scheduledAt: '2030-06-10 10:00:00', endsAt: '2030-06-10 11:00:00' }],
    ])
    expect(await isSlotAvailable(db, 1, 1, '2030-06-10 10:00:00', 60)).toBe(false)
  })
})
