import { cfEnv } from '../../utils/db'
import { checkDatabaseHealth, checkStorageHealth } from '../../utils/health'

/**
 * Readiness — confirms the Worker's real dependencies (D1, R2) are
 * actually reachable, not just that the process is up. 503 when anything
 * is down, so an external monitor or the deploy pipeline's own smoke test
 * can tell "the app is up but degraded" apart from a plain 200. Public,
 * unauthenticated — same trust model as /api/health/live, no tenant or
 * business data is exposed, only ok/error per dependency.
 *
 * `version` says which build is actually serving (scripts/build-info.mjs).
 * Hasta ahora no había forma de responder "¿qué commit está vivo?", que es
 * la primera pregunta de cualquier incidente y la que hace falta para
 * comprobar, tras un despliegue, que lo que está sirviendo es lo que se
 * acaba de publicar (scripts/smoke-test.mjs lo verifica).
 *
 * Que sea público es una decisión, no un descuido: son un SHA corto, una
 * rama y una fecha, sin repositorio ni rutas internas, y el valor —poder
 * preguntarle a la instalación qué está corriendo desde fuera, sin
 * credenciales, justo cuando algo va mal— pesa más que lo que revela.
 */
export default defineEventHandler(async (event) => {
  const env = cfEnv(event)
  const [database, storage] = await Promise.all([checkDatabaseHealth(env.DB), checkStorageHealth(env.MEDIA)])
  const ready = database.ok && storage.ok
  if (!ready) setResponseStatus(event, 503)
  return {
    status: ready ? 'ok' : 'degraded',
    checks: { database, storage },
    version: useRuntimeConfig(event).buildInfo,
    timestamp: new Date().toISOString(),
  }
})
