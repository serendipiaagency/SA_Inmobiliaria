import type { H3Event } from 'h3'

/**
 * Lee la cookie `sa_ft` que `plugins/utm-capture.client.ts` deja en la
 * primera página que visita alguien (FASE 12, migración 0069): UTMs,
 * página de aterrizaje y referrer externo. Ausente en la mayoría de envíos
 * (visita directa, cookies bloqueadas, formulario enviado desde una sesión
 * sin JS) — en ese caso los campos del lead simplemente quedan NULL, nunca
 * inventados.
 */
export interface FirstTouch {
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmContent?: string
  utmTerm?: string
  landingPage?: string
  referrer?: string
}

export function readFirstTouch(event: H3Event): FirstTouch {
  const raw = getCookie(event, 'sa_ft')
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, string>
    return {
      utmSource: parsed.utm_source || undefined,
      utmMedium: parsed.utm_medium || undefined,
      utmCampaign: parsed.utm_campaign || undefined,
      utmContent: parsed.utm_content || undefined,
      utmTerm: parsed.utm_term || undefined,
      landingPage: parsed.landing_page || undefined,
      referrer: parsed.referrer || undefined,
    }
  } catch {
    return {}
  }
}
