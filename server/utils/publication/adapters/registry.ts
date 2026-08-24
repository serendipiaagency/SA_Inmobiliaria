import { CHANNELS } from '../channels'
import { createNotImplementedAdapter } from './notImplemented'
import type { ChannelAdapter } from './types'

/**
 * One entry per channel key. Every channel resolves to the shared "not
 * implemented" stub today because none has a real, documented, accessible
 * provider API wired in (see docs/publication-channels.md for the inventory
 * of what each one would need). Wiring a real channel later means: write
 * `adapters/<channel>.ts` implementing `ChannelAdapter`, swap its entry in
 * here, and flip that channel's `implemented: true` in channels.ts — nothing
 * else in the publication system (dispatcher, scheduling, UI gates) needs to
 * change, since they all key off this registry and `isChannelImplemented()`.
 */
export const CHANNEL_ADAPTERS: Record<string, ChannelAdapter> = Object.fromEntries(
  CHANNELS.map((c) => [c.key, createNotImplementedAdapter(c.label)]),
)

export function getChannelAdapter(channelKey: string): ChannelAdapter | null {
  return CHANNEL_ADAPTERS[channelKey] || null
}
