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
}

export const CHANNELS: ChannelDef[] = [
  { key: 'marketplace', label: 'Marketplace propio', type: 'marketplace', secretEnvVar: 'CHANNEL_MARKETPLACE_TOKEN' },
  { key: 'own_web', label: 'Web propia', type: 'own_web', secretEnvVar: 'CHANNEL_OWN_WEB_TOKEN' },
  { key: 'idealista', label: 'Idealista', type: 'portal', secretEnvVar: 'CHANNEL_IDEALISTA_API_KEY' },
  { key: 'fotocasa', label: 'Fotocasa', type: 'portal', secretEnvVar: 'CHANNEL_FOTOCASA_API_KEY' },
  { key: 'habitaclia', label: 'Habitaclia', type: 'portal', secretEnvVar: 'CHANNEL_HABITACLIA_API_KEY' },
  { key: 'yaencontre', label: 'Yaencontre', type: 'portal', secretEnvVar: 'CHANNEL_YAENCONTRE_API_KEY' },
  { key: 'pisoscom', label: 'Pisos.com', type: 'portal', secretEnvVar: 'CHANNEL_PISOSCOM_API_KEY' },
  { key: 'kyero', label: 'Kyero', type: 'portal', secretEnvVar: 'CHANNEL_KYERO_API_KEY' },
  { key: 'jamesedition', label: 'JamesEdition', type: 'portal', secretEnvVar: 'CHANNEL_JAMESEDITION_API_KEY' },
  { key: 'rightmove', label: 'Rightmove', type: 'portal', secretEnvVar: 'CHANNEL_RIGHTMOVE_API_KEY' },
  { key: 'google_business', label: 'Google Business', type: 'social', secretEnvVar: 'CHANNEL_GOOGLE_BUSINESS_TOKEN' },
  { key: 'facebook', label: 'Facebook', type: 'social', secretEnvVar: 'CHANNEL_FACEBOOK_TOKEN' },
  { key: 'instagram', label: 'Instagram', type: 'social', secretEnvVar: 'CHANNEL_INSTAGRAM_TOKEN' },
  { key: 'linkedin', label: 'LinkedIn', type: 'social', secretEnvVar: 'CHANNEL_LINKEDIN_TOKEN' },
  { key: 'pinterest', label: 'Pinterest', type: 'social', secretEnvVar: 'CHANNEL_PINTEREST_TOKEN' },
  { key: 'tiktok', label: 'TikTok', type: 'social', secretEnvVar: 'CHANNEL_TIKTOK_TOKEN' },
  { key: 'newsletter', label: 'Newsletter', type: 'messaging', secretEnvVar: 'CHANNEL_NEWSLETTER_API_KEY' },
  { key: 'whatsapp', label: 'WhatsApp', type: 'messaging', secretEnvVar: 'CHANNEL_WHATSAPP_TOKEN' },
  { key: 'telegram', label: 'Telegram', type: 'messaging', secretEnvVar: 'CHANNEL_TELEGRAM_BOT_TOKEN' },
]

export const CHANNEL_BY_KEY: Record<string, ChannelDef> = Object.fromEntries(CHANNELS.map((c) => [c.key, c]))

export function isValidChannelKey(key: string): boolean {
  return key in CHANNEL_BY_KEY
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
