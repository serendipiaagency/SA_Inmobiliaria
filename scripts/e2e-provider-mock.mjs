#!/usr/bin/env node
/**
 * Simulador local de la Graph API de WhatsApp Cloud — SÓLO para la suite e2e.
 *
 * `scripts/e2e.sh` lo arranca antes de `wrangler dev` y le pasa al Worker
 * `WHATSAPP_GRAPH_BASE_URL=http://127.0.0.1:<puerto>`; `graphBase()`
 * (server/utils/comms/providers/metaCloud.ts) sólo respeta esa variable si
 * apunta a loopback, así que esto nunca puede desviar tráfico real.
 *
 * Existe para que el E2E principal (tests/e2e/principal-flow-fase25-29.spec.ts)
 * pueda recorrer un envío de propiedad por WhatsApp de punta a punta —
 * Message creado, PropertyMatch en SENT, PROPERTY_SENT en Activity — sin
 * tocar Meta, y para poder inspeccionar el cuerpo EXACTO que habría salido
 * hacia el proveedor (§125: ningún dato interno en lo que se envía).
 *
 *   POST /<versión>/<PHONE_NUMBER_ID>/messages  → acepta y devuelve un wamid
 *   GET  /__requests                             → todo lo recibido, en orden
 *   cualquier otra cosa                          → error con la forma de Meta
 *
 * No guarda nada en disco ni registra la cabecera Authorization (sólo si
 * llegó un Bearer): el token de los tests es un marcador, pero el hábito
 * de no volcar credenciales se mantiene también aquí.
 */
import { createServer } from 'node:http'

const port = Number(process.env.E2E_PROVIDER_MOCK_PORT || 8799)
const requests = []
let seq = 0

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

const server = createServer((req, res) => {
  let raw = ''
  req.on('data', (chunk) => {
    raw += chunk
  })
  req.on('end', () => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${port}`)

    if (req.method === 'GET' && url.pathname === '/__requests') return send(res, 200, requests)
    if (req.method === 'GET' && url.pathname === '/__health') return send(res, 200, { ok: true })

    let body
    try {
      body = raw ? JSON.parse(raw) : null
    } catch {
      body = raw
    }
    const entry = {
      method: req.method,
      path: url.pathname,
      hasBearer: /^Bearer\s+\S+/.test(String(req.headers.authorization || '')),
      body,
      at: new Date().toISOString(),
    }
    requests.push(entry)

    const messages = url.pathname.match(/^\/v[\d.]+\/([^/]+)\/messages$/)
    if (req.method === 'POST' && messages && entry.hasBearer) {
      // Marcar como leído usa el mismo endpoint (status: 'read').
      if (body && body.status === 'read') return send(res, 200, { success: true })
      seq += 1
      return send(res, 200, {
        messaging_product: 'whatsapp',
        contacts: [{ input: body?.to ?? null, wa_id: body?.to ?? null }],
        messages: [{ id: `wamid.e2e.${Date.now()}.${seq}`, message_status: 'accepted' }],
      })
    }

    return send(res, 404, { error: { message: `El simulador e2e no implementa ${req.method} ${url.pathname}`, type: 'OAuthException', code: 100 } })
  })
})

server.listen(port, '127.0.0.1', () => {
  console.log(`e2e provider mock escuchando en http://127.0.0.1:${port}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)))
