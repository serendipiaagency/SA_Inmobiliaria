#!/usr/bin/env node
/**
 * Averigua la URL pública del Worker preguntándosela a Cloudflare.
 *
 * ## Por qué existe
 *
 * La URL de la instalación no está en ninguna parte del repositorio:
 * `wrangler.toml` no declara dominio ni ruta, `PRIMARY_DOMAIN` está comentado
 * con un placeholder, y lo único parecido es un valor por defecto codificado
 * dentro de una tarea cron. Eso convertía «no sé mi URL» en un bloqueo real
 * en dos sitios distintos: al recuperar el acceso al panel y al configurar
 * `PRODUCTION_URL` en el Environment de GitHub.
 *
 * Con el token de la cuenta se puede consultar el subdominio de workers.dev y
 * componerla. Devuelve `null` en vez de lanzar: quien llama decide si eso es
 * fatal — en los dos usos actuales no lo es.
 *
 * Uso como CLI: `node scripts/worker-url.mjs` imprime la URL, o nada.
 */

/** Igual que `name` en wrangler.toml. */
export const WORKER_NAME = 'sa-inmobiliaria'

export async function discoverWorkerUrl(env = process.env) {
  const token = env.CLOUDFLARE_API_TOKEN
  const accountId = env.CLOUDFLARE_ACCOUNT_ID
  if (!token || !accountId) return null
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const json = await res.json()
    const subdomain = json?.result?.subdomain
    return subdomain ? `https://${WORKER_NAME}.${subdomain}.workers.dev` : null
  } catch {
    // Sin red, sin permisos en el token, o una respuesta inesperada: no saber
    // la URL nunca debe ser lo que rompa la operación que llamó aquí.
    return null
  }
}

// Modo CLI: imprime la URL si la encuentra y calla si no, para poder
// capturarla desde bash sin tener que filtrar ruido.
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = await discoverWorkerUrl()
  if (url) console.log(url)
}
