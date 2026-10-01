/**
 * Origen de un simulador local para la suite e2e (`scripts/e2e-provider-mock.mjs`,
 * lo arranca `scripts/e2e.sh`). Sólo se acepta `http://` a loopback: una
 * variable mal puesta en producción nunca puede desviar mensajes, prompts ni
 * credenciales a un host ajeno — como mucho los manda a ninguna parte.
 * Cualquier otro valor (o ninguno) devuelve null y se usa el proveedor real.
 */
export function loopbackOrigin(raw: unknown): string | null {
  if (!raw) return null
  try {
    const url = new URL(String(raw))
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return null
    return url.origin
  } catch {
    return null
  }
}
