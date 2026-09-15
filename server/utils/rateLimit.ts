import type { H3Event } from 'h3'
import { cfEnv } from './db'

/** Best-effort client IP for rate limiting. Cloudflare always sets cf-connecting-ip on edge requests. */
function clientIp(event: H3Event): string {
  return getRequestHeader(event, 'cf-connecting-ip') || getRequestIP(event) || 'unknown'
}

/**
 * Fixed-window rate limiter backed by D1 (no KV namespace is provisioned for this
 * deployment). Throws 429 once `limit` requests land in the same `windowSeconds` bucket
 * for this `name` + caller IP. Not exact under high concurrency (read-then-write race on
 * the counter), which is an accepted tradeoff — the goal is raising the cost of automated
 * abuse (brute force, spam, paid-API abuse), not perfect precision.
 */
export async function rateLimit(event: H3Event, name: string, opts: { limit: number; windowSeconds: number }) {
  const db = cfEnv(event).DB
  const bucket = `${name}:${clientIp(event)}`
  const windowStart = Math.floor(Date.now() / 1000 / opts.windowSeconds) * opts.windowSeconds

  await db
    .prepare(
      `INSERT INTO rate_limits (bucket, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT(bucket, window_start) DO UPDATE SET count = count + 1`,
    )
    .bind(bucket, windowStart)
    .run()

  const row = await db
    .prepare('SELECT count FROM rate_limits WHERE bucket = ?1 AND window_start = ?2')
    .bind(bucket, windowStart)
    .first<{ count: number }>()

  if ((row?.count ?? 0) > opts.limit) {
    // Cuánto falta para que la ventana se cierre. Sin esto, quien queda
    // bloqueado no tiene forma de distinguir "espera un momento" de "tu
    // contraseña está mal", y lo que hace es reintentar — que es justamente
    // lo que renueva el bloqueo.
    const retryAfterSeconds = Math.max(1, windowStart + opts.windowSeconds - Math.floor(Date.now() / 1000))
    // h3 tipa `Retry-After` como número (el valor en segundos), no como cadena.
    setResponseHeader(event, 'Retry-After', retryAfterSeconds)
    throw createError({
      statusCode: 429,
      statusMessage: 'Too many requests — please try again later.',
      data: { retryAfterSeconds },
    })
  }
}
