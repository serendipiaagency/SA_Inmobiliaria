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
 *   POST /v1/messages                            → Messages API guionizada (INMO, FASE 30)
 *   GET  /__requests                             → todo lo recibido, en orden
 *   cualquier otra cosa                          → error con la forma de Meta
 *
 * La Messages API guionizada existe para el e2e de INMO
 * (tests/e2e/inmo.spec.ts): con `AI_BASE_URL` apuntando aquí, el Worker
 * habla con este «modelo» de reglas fijas en vez de con Anthropic. Lo que
 * se prueba es lo nuestro — herramientas reales, confirmación, procedencia
 * — no la calidad del modelo.
 *
 * No guarda nada en disco ni registra la cabecera Authorization (sólo si
 * llegó un Bearer): el token de los tests es un marcador, pero el hábito
 * de no volcar credenciales se mantiene también aquí.
 */
import { createServer } from 'node:http'

const port = Number(process.env.E2E_PROVIDER_MOCK_PORT || 8799)
const requests = []
let seq = 0

/** Contenido no-JSON de un tool_result: se trata como resultado sin datos. */
function parseJson(raw) {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Un «modelo» de reglas fijas con la forma de respuesta de la Messages API. */
function scriptedModel(body) {
  const text = (t) => ({ id: `msg_e2e_${++seq}`, type: 'message', role: 'assistant', content: [{ type: 'text', text: t }], stop_reason: 'end_turn' })
  const toolUse = (name, input) => ({ id: `msg_e2e_${++seq}`, type: 'message', role: 'assistant', content: [{ type: 'tool_use', id: `toolu_e2e_${seq}`, name, input }], stop_reason: 'tool_use' })
  // Llamadas sin herramientas (AI Studio, CMS…): texto fijo.
  if (!Array.isArray(body?.tools)) return text('[simulador e2e] texto generado')

  const messages = Array.isArray(body.messages) ? body.messages : []
  const last = messages[messages.length - 1]
  const result = Array.isArray(last?.content) ? last.content.find((b) => b.type === 'tool_result') : null
  if (result) {
    const data = parseJson(result.content)
    if (result.is_error || data?.error) return text(`No se pudo: ${data?.error?.code || 'ERROR'}.`)
    if (Array.isArray(data?.results)) return text(`Encontré ${data.total}: ${data.results.map((p) => p.title).join(' | ') || 'ninguna'}.`)
    if (data?.appointmentId) return text(`Visita agendada (cita ${data.appointmentId}).`)
    return text('Hecho.')
  }

  const said = typeof last?.content === 'string' ? last.content : ''
  const book = said.match(/lead (\d+).*comercial (\d+).*propiedad (\d+).*?(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/i)
  if (book) {
    return toolUse('book_viewing', { leadId: Number(book[1]), commercialId: Number(book[2]), propertyId: Number(book[3]), propertyKind: 'developer', scheduledAt: book[4] })
  }
  if (/^solo con terraza/i.test(said)) {
    // Refinamiento: la búsqueda anterior + el criterio nuevo (§15).
    const prev = messages
      .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
      .filter((b) => b.type === 'tool_use' && b.name === 'search_properties')
      .pop()
    return toolUse('search_properties', { ...(prev?.input || {}), features: ['terrace'] })
  }
  const search = said.match(/busca .*? en ([^,.]+?)(?: con | por |[,.]|$)/i)
  if (search) {
    const input = { zones: [search[1].trim()] }
    if (/terraza/i.test(said)) input.features = ['terrace']
    const max = said.match(/menos de ([\d.]+)/i)
    if (max) input.priceMax = Number(max[1].replace(/\./g, ''))
    return toolUse('search_properties', input)
  }
  return text('[simulador e2e] No sé hacer eso.')
}

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
      hasApiKey: Boolean(req.headers['x-api-key']),
      body,
      at: new Date().toISOString(),
    }
    requests.push(entry)

    if (req.method === 'POST' && url.pathname === '/v1/messages') {
      if (!entry.hasApiKey) return send(res, 401, { type: 'error', error: { type: 'authentication_error', message: 'x-api-key header is required' } })
      return send(res, 200, scriptedModel(body))
    }

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
