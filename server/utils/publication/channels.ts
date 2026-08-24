/**
 * Registry of every channel the Publication Scheduler can target. This is the
 * single source of truth for channel keys used across configs, jobs, and the
 * UI — nothing else in the module hardcodes this list a second time.
 *
 * `secretEnvVar` names the Worker secret each channel's real adapter would
 * read (see adapters.ts). None of these secrets are configured in this
 * project yet, so every channel starts honestly disconnected — the moment a
 * real secret is added for a channel, its adapter switches from the "not
 * connected" response to a real API call without any other code changing.
 */
export type ChannelType = 'marketplace' | 'own_web' | 'portal' | 'social' | 'messaging'

export interface ChannelDef {
  key: string
  label: string
  type: ChannelType
  secretEnvVar: string
  /**
   * Whether server/utils/publication/adapters/registry.ts wires this channel
   * to a real integration (an actual HTTP call to the provider) rather than
   * the shared "not implemented" stub. Every channel starts `false` — none
   * has documented, accessible API credentials integrated yet (see
   * docs/publication-channels.md for the per-channel inventory and what each
   * one would need). This is deliberately a separate flag from
   * `secretEnvVar`/`isChannelConnected`: a channel can have a real secret
   * configured and still be `implemented: false` — configuring a value never
   * turns a stub into a real integration on its own.
   */
  implemented: boolean
}

export const CHANNELS: ChannelDef[] = [
  { key: 'marketplace', label: 'Marketplace propio', type: 'marketplace', secretEnvVar: 'CHANNEL_MARKETPLACE_TOKEN', implemented: false },
  { key: 'own_web', label: 'Web propia', type: 'own_web', secretEnvVar: 'CHANNEL_OWN_WEB_TOKEN', implemented: false },
  { key: 'idealista', label: 'Idealista', type: 'portal', secretEnvVar: 'CHANNEL_IDEALISTA_API_KEY', implemented: false },
  { key: 'fotocasa', label: 'Fotocasa', type: 'portal', secretEnvVar: 'CHANNEL_FOTOCASA_API_KEY', implemented: false },
  { key: 'habitaclia', label: 'Habitaclia', type: 'portal', secretEnvVar: 'CHANNEL_HABITACLIA_API_KEY', implemented: false },
  { key: 'yaencontre', label: 'Yaencontre', type: 'portal', secretEnvVar: 'CHANNEL_YAENCONTRE_API_KEY', implemented: false },
  { key: 'pisoscom', label: 'Pisos.com', type: 'portal', secretEnvVar: 'CHANNEL_PISOSCOM_API_KEY', implemented: false },
  { key: 'kyero', label: 'Kyero', type: 'portal', secretEnvVar: 'CHANNEL_KYERO_API_KEY', implemented: false },
  { key: 'jamesedition', label: 'JamesEdition', type: 'portal', secretEnvVar: 'CHANNEL_JAMESEDITION_API_KEY', implemented: false },
  { key: 'rightmove', label: 'Rightmove', type: 'portal', secretEnvVar: 'CHANNEL_RIGHTMOVE_API_KEY', implemented: false },
  { key: 'google_business', label: 'Google Business', type: 'social', secretEnvVar: 'CHANNEL_GOOGLE_BUSINESS_TOKEN', implemented: false },
  { key: 'facebook', label: 'Facebook', type: 'social', secretEnvVar: 'CHANNEL_FACEBOOK_TOKEN', implemented: false },
  { key: 'instagram', label: 'Instagram', type: 'social', secretEnvVar: 'CHANNEL_INSTAGRAM_TOKEN', implemented: false },
  { key: 'linkedin', label: 'LinkedIn', type: 'social', secretEnvVar: 'CHANNEL_LINKEDIN_TOKEN', implemented: false },
  { key: 'pinterest', label: 'Pinterest', type: 'social', secretEnvVar: 'CHANNEL_PINTEREST_TOKEN', implemented: false },
  { key: 'tiktok', label: 'TikTok', type: 'social', secretEnvVar: 'CHANNEL_TIKTOK_TOKEN', implemented: false },
  { key: 'newsletter', label: 'Newsletter', type: 'messaging', secretEnvVar: 'CHANNEL_NEWSLETTER_API_KEY', implemented: false },
  { key: 'whatsapp', label: 'WhatsApp', type: 'messaging', secretEnvVar: 'CHANNEL_WHATSAPP_TOKEN', implemented: false },
  { key: 'telegram', label: 'Telegram', type: 'messaging', secretEnvVar: 'CHANNEL_TELEGRAM_BOT_TOKEN', implemented: false },
]

export const CHANNEL_BY_KEY: Record<string, ChannelDef> = Object.fromEntries(CHANNELS.map((c) => [c.key, c]))

export function isValidChannelKey(key: string): boolean {
  return key in CHANNEL_BY_KEY
}

export function isChannelImplemented(key: string): boolean {
  return !!CHANNEL_BY_KEY[key]?.implemented
}

export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const
export type Priority = (typeof PRIORITIES)[number]

// Lower weight = dispatched first. Used directly as an ORDER BY column
// (priority_weight ASC, run_at ASC) so the dispatcher never has to parse
// the priority string on the hot path.
export const PRIORITY_WEIGHT: Record<Priority, number> = { urgent: 10, high: 30, normal: 50, low: 70 }

export function priorityWeight(p: string | null | undefined): number {
  return PRIORITY_WEIGHT[(p as Priority) || 'normal'] ?? 50
}
