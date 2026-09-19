/**
 * Comprobación sintética de un dominio personalizado.
 *
 * ## Por qué
 *
 * `inmobiliaria.serendipiaagency.com` estuvo enrutando mal en silencio: el
 * DNS respondía, Cloudflare servía algo, pero no era la agencia. Nadie lo
 * supo hasta que un administrador no pudo entrar. Ninguna sonda existente lo
 * habría visto: /api/health mira que el Worker y sus bindings respondan, no
 * que un *host concreto* llegue a *su* agencia.
 *
 * ## Qué se comprueba, y por qué esas dos cosas
 *
 * Dos peticiones a `https://<dominio>`, sin cookies ni credenciales:
 *
 *  1. `GET /api/auth/me` — la superficie de inicio de sesión. Debe responder
 *     200 con JSON `{ user: null }`. En un dominio que el tenant no reconoce,
 *     server/middleware/00.tenant.ts la corta con 404 antes de llegar al
 *     handler; en un dominio que no apunta a este Worker no responde nada
 *     parecido. Es exactamente lo que ve una persona intentando entrar.
 *  2. `GET /api/public/tenant` — a qué agencia resuelve el host. Su `id`
 *     tiene que ser el de la organización dueña del dominio. Esto atrapa el
 *     caso peor: el dominio responde, pero sirve *otra* agencia (o la
 *     plataforma por defecto). Un 200 en (1) no lo distingue; esto sí.
 *
 * `checkDomain` es pura salvo por `fetchImpl`, que se inyecta para poder
 * probar cada rama sin red.
 */

export interface DomainCheckResult {
  ok: boolean
  httpStatus: number | null
  latencyMs: number
  error: string | null
}

export const DOMAIN_CHECK_TIMEOUT_MS = 10_000
/** Cada cuántos minutos se comprueba. Va sobre el tick por minuto que ya existe, sin cron nuevo. */
export const DOMAIN_CHECK_INTERVAL_MINUTES = 10
/** Cuánto historial se conserva por dominio. */
export const DOMAIN_CHECK_RETENTION_DAYS = 30

const USER_AGENT = 'sa-inmobiliaria-domain-monitor/1'

/** True en los minutos en que toca comprobar (0, 10, 20…), para una tarea que corre cada minuto. */
export function isDomainCheckMinute(date: Date, intervalMinutes = DOMAIN_CHECK_INTERVAL_MINUTES): boolean {
  return date.getUTCMinutes() % intervalMinutes === 0
}

async function fetchJson(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<{ status: number; json: any | null; contentType: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': USER_AGENT, 'cache-control': 'no-cache' },
    })
    const contentType = res.headers.get('content-type') || ''
    let json: any | null = null
    if (contentType.includes('application/json')) {
      try {
        json = await res.json()
      } catch {
        json = null
      }
    }
    return { status: res.status, json, contentType }
  } finally {
    clearTimeout(timer)
  }
}

export async function checkDomain(
  domain: string,
  expectedOrgId: number,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = DOMAIN_CHECK_TIMEOUT_MS,
): Promise<DomainCheckResult> {
  const started = Date.now()
  const fail = (httpStatus: number | null, error: string): DomainCheckResult => ({ ok: false, httpStatus, latencyMs: Date.now() - started, error })
  const base = `https://${domain}`

  let me: Awaited<ReturnType<typeof fetchJson>>
  try {
    me = await fetchJson(`${base}/api/auth/me`, fetchImpl, timeoutMs)
  } catch (err: any) {
    const reason = err?.name === 'AbortError' ? `sin respuesta en ${Math.round(timeoutMs / 1000)}s` : err?.message || 'error de red'
    return fail(null, `no se pudo conectar: ${reason}`)
  }
  if (me.status === 404) return fail(404, 'el host no está configurado para ninguna agencia en esta plataforma (404 del enrutado por dominio)')
  if (me.status !== 200) return fail(me.status, `/api/auth/me respondió ${me.status} en vez de 200`)
  if (!me.json || typeof me.json !== 'object' || !('user' in me.json)) {
    return fail(me.status, `/api/auth/me no devolvió el JSON esperado (${me.contentType || 'sin content-type'}): el host no está sirviendo esta plataforma`)
  }

  let tenant: Awaited<ReturnType<typeof fetchJson>>
  try {
    tenant = await fetchJson(`${base}/api/public/tenant`, fetchImpl, timeoutMs)
  } catch (err: any) {
    return fail(null, `/api/public/tenant no respondió: ${err?.message || 'error de red'}`)
  }
  if (tenant.status !== 200 || !tenant.json) return fail(tenant.status, `/api/public/tenant respondió ${tenant.status}`)
  if (tenant.json.id !== expectedOrgId) {
    return fail(200, `el dominio responde pero sirve la organización #${tenant.json.id} en vez de la #${expectedOrgId}`)
  }
  if (tenant.json.isCustomDomain !== true) {
    return fail(200, 'el dominio responde pero el enrutado lo trata como host primario, no como dominio de la agencia')
  }

  return { ok: true, httpStatus: 200, latencyMs: Date.now() - started, error: null }
}

/**
 * Cuándo avisar. Sólo en los cambios de estado: un dominio caído que sigue
 * caído no genera un aviso cada diez minutos (eso es lo que hace que la
 * gente silencie el canal), y la recuperación se avisa una vez para cerrar
 * el incidente. Sin resultado anterior no se avisa de un `ok` — es la
 * primera comprobación de un dominio recién asignado — pero un fallo sí,
 * porque un dominio recién asignado que no funciona es justo lo que se
 * quiere saber cuanto antes.
 */
export function domainAlertKind(previousOk: boolean | null, currentOk: boolean): 'failed' | 'recovered' | null {
  if (!currentOk && previousOk !== false) return 'failed'
  if (currentOk && previousOk === false) return 'recovered'
  return null
}

export interface DomainHealthRow {
  domain: string
  organizationId: number
  ok: boolean
  error: string | null
  checkedAt: string
}

export interface DomainHealthSummary {
  total: number
  failing: { domain: string; error: string }[]
  lastCheckedAt: string | null
}

/** Para Estado del sistema: qué dominios hay, cuáles fallan ahora mismo y cuándo se miró por última vez. */
export function summarizeDomainHealth(rows: DomainHealthRow[]): DomainHealthSummary {
  const failing = rows.filter((r) => !r.ok).map((r) => ({ domain: r.domain, error: r.error || 'sin detalle' }))
  const lastCheckedAt = rows.reduce<string | null>((max, r) => (max === null || r.checkedAt > max ? r.checkedAt : max), null)
  return { total: rows.length, failing, lastCheckedAt }
}
