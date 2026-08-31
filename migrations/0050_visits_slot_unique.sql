-- Migration number: 0050    Data-level uniqueness for one agent's booking slot (closes a real double-booking race)
--
-- server/api/public/agents/[slug]/book.post.ts (public, unauthenticated)
-- checks isSlotAvailable() and then INSERT INTO visits as two independent
-- D1 round-trips, no transaction — two concurrent requests for the same
-- agent/slot can both pass the check before either inserts, producing two
-- confirmed bookings for one slot (docs/production-hardening-audit.md,
-- P0-1). The appointment model already uses discrete slots per
-- agent/date/time (computeAvailableSlots() in
-- server/utils/appointments/availability.ts generates fixed-grid start
-- times), so a conditional UNIQUE on (organization_id, agent_id,
-- scheduled_at) closes the race without a Durable Object: the loser of a
-- concurrent pair gets a UNIQUE constraint violation from the INSERT
-- itself instead of a phantom second booking, and the app layer
-- (server/utils/db.ts's isUniqueConstraintError()) turns that into the
-- same 409 the pre-check already returns for an unavailable slot.
--
-- Partial (WHERE status != 'cancelled') so a cancelled visit never blocks
-- a new booking in its old slot — same exclusion computeAvailableSlots()
-- already applies when computing what's free. Purely additive (CREATE
-- INDEX, no DROP/RENAME/rebuild): if any (org, agent, slot) pair already
-- has more than one non-cancelled visit in production, this migration
-- fails atomically and the deploy pipeline stops before touching the
-- Worker — a clean, loud failure rather than silently dropping data. That
-- has not been verified against the real production D1 from this
-- environment (no Cloudflare credentials available here — see
-- docs/production-hardening-audit.md, "Requiere configuración manual
-- externa"); if it ever does fail, resolve the real duplicate(s) in
-- production data first (reschedule or cancel one of each colliding
-- pair), then re-run.

CREATE UNIQUE INDEX IF NOT EXISTS visits_agent_slot_unique
  ON visits (organization_id, agent_id, scheduled_at)
  WHERE status != 'cancelled';
