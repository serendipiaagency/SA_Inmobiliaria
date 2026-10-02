import { loopbackOrigin } from '../loopback'
interface ResendSendResult {
  ok: boolean
  connected: boolean
  id?: string
  message: string
}

/**
 * Low-level Resend send — no SDK, plain fetch, same reasoning as
 * server/utils/stripe.ts. Honestly reports `connected:false` until
 * RESEND_API_KEY is set as a Worker secret rather than faking a delivery.
 * `id` is Resend's own email id — the only handle the webhook
 * (server/api/resend/webhook.post.ts) has to later confirm real delivery.
 */
/** Simulador e2e: RESEND_BASE_URL sólo se respeta si apunta a loopback (server/utils/loopback.ts). */
function resendBase(env: Record<string, any>): string {
  return loopbackOrigin(env.RESEND_BASE_URL) ?? 'https://api.resend.com'
}

export async function callResendApi(
  env: Record<string, any>,
  input: { from: string; to: string; replyTo?: string | null; subject: string; html: string; text?: string | null },
): Promise<ResendSendResult> {
  const apiKey = env.RESEND_API_KEY
  if (!apiKey) {
    return { ok: false, connected: false, message: 'Email no conectado: falta configurar el secreto RESEND_API_KEY en el Worker.' }
  }

  try {
    const res = await fetch(`${resendBase(env)}/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: input.from, to: input.to, reply_to: input.replyTo || undefined, subject: input.subject, html: input.html, text: input.text || undefined }),
    })
    const json: any = await res.json().catch(() => null)
    if (!res.ok) {
      return { ok: false, connected: true, message: json?.message || `Resend devolvió ${res.status}` }
    }
    return { ok: true, connected: true, id: json?.id, message: 'Enviado' }
  } catch (e: any) {
    return { ok: false, connected: true, message: e?.message || 'Error de red al enviar el email' }
  }
}

// ---------------------------------------------------------------------------
// API de dominios de Resend — verificación autoservicio del dominio con el que
// cada empresa envía a SUS clientes (server/utils/email/orgSender.ts).
// Requiere que RESEND_API_KEY tenga acceso completo («Full access»): una clave
// «Sending access» puede enviar pero no crear ni verificar dominios, y Resend
// lo dice con un 401/403 que aquí se devuelve tal cual.
// ---------------------------------------------------------------------------

export interface ResendDnsRecord {
  /** 'SPF' | 'DKIM' | 'DMARC' … — para qué sirve el registro. */
  record: string
  /** Nombre relativo al dominio (p. ej. `send`, `resend._domainkey`). */
  name: string
  type: string
  value: string
  ttl?: string
  priority?: number | null
  status: string
}

export interface ResendDomain {
  id: string
  name: string
  /** not_started | pending | verified | failed | temporary_failure */
  status: string
  region: string | null
  records: ResendDnsRecord[]
}

export type ResendDomainResult = { ok: true; domain: ResendDomain } | { ok: false; connected: boolean; status: number | null; message: string }

function toDomain(json: any): ResendDomain {
  return {
    id: String(json?.id ?? ''),
    name: String(json?.name ?? '').toLowerCase(),
    status: String(json?.status ?? 'not_started'),
    region: json?.region ? String(json.region) : null,
    records: Array.isArray(json?.records)
      ? json.records.map((r: any) => ({
          record: String(r?.record ?? ''),
          name: String(r?.name ?? ''),
          type: String(r?.type ?? ''),
          value: String(r?.value ?? ''),
          ttl: r?.ttl != null ? String(r.ttl) : undefined,
          priority: typeof r?.priority === 'number' ? r.priority : null,
          status: String(r?.status ?? 'not_started'),
        }))
      : [],
  }
}

async function resendJson(env: Record<string, any>, method: string, path: string, body?: unknown): Promise<{ ok: true; json: any } | { ok: false; connected: boolean; status: number | null; message: string }> {
  const apiKey = env.RESEND_API_KEY
  if (!apiKey) return { ok: false, connected: false, status: null, message: 'Email no conectado: falta configurar el secreto RESEND_API_KEY en el Worker.' }
  try {
    const res = await fetch(`${resendBase(env)}${path}`, {
      method,
      headers: { Authorization: `Bearer ${apiKey}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    const json: any = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, connected: true, status: res.status, message: json?.message || `Resend devolvió ${res.status}` }
    return { ok: true, json }
  } catch (e: any) {
    return { ok: false, connected: true, status: null, message: e?.message || 'Error de red al hablar con Resend' }
  }
}

/** Busca un dominio por nombre en la cuenta de Resend de la plataforma (sin registros: el listado no los trae). */
export async function findResendDomain(env: Record<string, any>, name: string): Promise<{ ok: true; domain: ResendDomain | null } | { ok: false; connected: boolean; status: number | null; message: string }> {
  const res = await resendJson(env, 'GET', '/domains')
  if (!res.ok) return res
  const match = (res.json?.data || []).find((d: any) => String(d?.name || '').toLowerCase() === name.toLowerCase())
  return { ok: true, domain: match ? toDomain(match) : null }
}

/** Da de alta un dominio en Resend; la respuesta trae los registros DNS que hay que publicar. */
export async function createResendDomain(env: Record<string, any>, name: string, region = 'eu-west-1'): Promise<ResendDomainResult> {
  const res = await resendJson(env, 'POST', '/domains', { name, region })
  return res.ok ? { ok: true, domain: toDomain(res.json) } : res
}

/** Estado actual y registros DNS (con el estado de cada uno) de un dominio. */
export async function getResendDomain(env: Record<string, any>, id: string): Promise<ResendDomainResult> {
  const res = await resendJson(env, 'GET', `/domains/${encodeURIComponent(id)}`)
  return res.ok ? { ok: true, domain: toDomain(res.json) } : res
}

/** Pide a Resend que vuelva a comprobar el DNS ahora (la verificación es asíncrona: luego se lee con getResendDomain). */
export async function verifyResendDomain(env: Record<string, any>, id: string): Promise<{ ok: true } | { ok: false; connected: boolean; status: number | null; message: string }> {
  const res = await resendJson(env, 'POST', `/domains/${encodeURIComponent(id)}/verify`)
  return res.ok ? { ok: true } : res
}
