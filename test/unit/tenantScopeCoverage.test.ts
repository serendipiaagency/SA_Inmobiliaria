import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Cobertura del aislamiento por agencia: **ningún endpoint nuevo puede
 * olvidarse de acotar su ámbito sin que esta prueba lo diga**.
 *
 * ## Por qué existe
 *
 * El bloque 01 existió porque 147 de 156 rutas se habían "olvidado" de pasar
 * el área de permisos. El aislamiento por `organizationId` se apoya
 * exactamente en la misma clase de disciplina —acordarse de llamar a
 * `requireOrgScope` / `resolvePublicOrgId` / `requireApiKey`— y hasta ahora
 * sólo lo protegía cobertura escrita a mano
 * (`test/unit/multitenant.crossTenant.test.ts`, `tests/e2e/cross-tenant.spec.ts`).
 * Esa cobertura prueba muy bien los endpoints que alguien se acordó de
 * incluir; no dice nada del que se añada mañana.
 *
 * ## Qué prueba y qué NO prueba
 *
 * Esto es una comprobación de **exhaustividad**, no de corrección: confirma
 * que cada handler resuelve un ámbito de organización de alguna de las formas
 * reconocidas, o que está exento con un motivo escrito. No puede comprobar
 * que el ámbito se use bien una vez resuelto — de eso siguen encargándose las
 * pruebas de arriba, y `server/utils/tenantPolicy.ts` del filtrado real.
 *
 * Es deliberadamente tosca por el mismo motivo que
 * `test/unit/adminRouteMatrix.test.ts`: lo que atrapa es el olvido, que es la
 * forma en que esto se rompe de verdad.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const API_DIR = join(ROOT, 'server', 'api')

/**
 * Las cuatro formas que tiene un handler de acotarse a una agencia. Añadir
 * una quinta debería ser una decisión consciente, no un descubrimiento:
 * por eso están enumeradas aquí y no adivinadas.
 */
const SCOPE_MARKERS: { name: string; test: (source: string) => boolean }[] = [
  { name: 'requireOrgScope() — sesión de administración', test: (s) => s.includes('requireOrgScope(') },
  { name: 'resolvePublicOrgId() — portal público, resuelto por host', test: (s) => s.includes('resolvePublicOrgId(') },
  { name: 'requireApiKey() — API v1, la clave lleva la organización', test: (s) => s.includes('requireApiKey(') },
  // El portal de cliente no tiene helper propio: compara a mano el
  // organizationId de la sesión contra el del registro.
  { name: 'requireUser() + organizationId — portal de cliente', test: (s) => s.includes('requireUser(') && s.includes('organizationId') },
]

interface Exemption {
  /** Por qué este endpoint no acota por organización. Obligatorio: una exención sin motivo es un agujero con permiso. */
  reason: string
  /** Si la exención se apoya en una credencial de un solo uso, el patrón que demuestra que sigue exigiéndola. */
  requires?: RegExp
}

/** Rutas relativas a server/api/. */
const EXEMPT: Record<string, Exemption> = {
  'admin/active-org.post.ts': { reason: 'Conmutador de organización del super_admin: es el endpoint que *fija* el ámbito, no puede exigirlo. Protegido como super-admin en adminRouteMatrix.' },
  'admin/resources.get.ts': { reason: 'Metadatos del armazón del panel (qué recursos existen). No lee datos de ningún inquilino; si denegara, una cuenta sin permisos no podría ni ver la pantalla que se lo explica.' },
  'admin/system-status.get.ts': {
    reason: 'Estado de las integraciones de la plataforma entera (qué secretos faltan, qué canales no tienen adaptador). No hay una organización a la que acotar porque la pregunta no es de ninguna: se cierra por rol, con requireSuperAdmin, que es más estricto que cualquier ámbito.',
    requires: /requireSuperAdmin\(event\)/,
  },

  'auth/login.post.ts': { reason: 'Anterior a la sesión: es lo que la crea.' },
  'auth/logout.post.ts': { reason: 'Destruye la sesión; no lee datos de negocio.' },
  'auth/me.get.ts': { reason: 'Devuelve la propia sesión, que ya incluye su organizationId. No consulta datos de otros.' },
  'auth/forgot-password.post.ts': { reason: 'Anterior a la sesión. Busca por email en users, que es global por diseño.' },
  'auth/reset-password.post.ts': { reason: 'Anterior a la sesión. El token de recuperación es la credencial.' },
  'auth/totp/verify.post.ts': { reason: 'Anterior a la sesión: el desafío de login (contraseña ya comprobada) es la credencial y determina la cuenta.', requires: /resolveLoginChallenge\(/ },
  // enable/disable/recovery-codes no están aquí: además de requireUser
  // anotan la auditoría con user.organizationId, y eso ya los reconoce el
  // marcador "requireUser() + organizationId". Estos dos sólo leen o generan
  // el secreto de quien llama y no tocan ninguna organización.
  'auth/totp/status.get.ts': { reason: 'Sólo la PROPIA cuenta (requireUser + user.id): no consulta datos de nadie más.', requires: /requireUser\(event\)/ },
  'auth/totp/setup.post.ts': { reason: 'Sólo la PROPIA cuenta (requireUser + user.id): genera el secreto de quien llama.', requires: /requireUser\(event\)/ },

  'twilio/status.post.ts': { reason: 'Servidor a servidor: la firma X-Twilio-Signature (HMAC con el auth token) es la credencial, y sólo actualiza la fila cuyo SID de Twilio coincide.', requires: /verifyTwilioSignature\(/ },

  // Centro de Comunicaciones: los webhooks de los proveedores. La organización
  // sale del canal (comms_channels) al que iba el evento, y el cuerpo sólo se
  // acepta si la firma cuadra con el secreto de ESE canal.
  'comms/webhooks/meta.get.ts': { reason: 'Handshake de verificación de Meta: sin sesión por diseño; la credencial es el token de verificación (hub.verify_token) y no se lee ningún dato de inquilino.', requires: /verifyMetaWebhookToken\(/ },
  'comms/webhooks/meta.post.ts': { reason: 'Webhook de Meta firmado con X-Hub-Signature-256: el phone_number_id del cuerpo elige el canal (y con él la organización) y la firma se verifica con el App Secret de ese canal antes de procesar nada.', requires: /verifyMetaSignature\(/ },
  'comms/webhooks/twilio/inbound.post.ts': { reason: 'Webhook de Twilio firmado con X-Twilio-Signature: el número destino (To) elige el canal y la organización, y la firma se verifica con el auth token de ese canal.', requires: /verifyTwilioSignature\(/ },
  'comms/webhooks/twilio/status.post.ts': { reason: 'Webhook de estado de Twilio: el remitente (From) elige el canal y la organización, y la firma se verifica con el auth token de ese canal; sólo cambia el estado del mensaje con ese SID.', requires: /verifyTwilioSignature\(/ },

  'health/live.get.ts': { reason: 'Sonda de vida: sólo confirma que el Worker responde. No toca D1 ni ningún dato de inquilino, a propósito.' },
  'health/ready.get.ts': { reason: 'Sonda de dependencias: sólo comprueba que D1 y R2 responden, y la identidad del build. Ningún dato de inquilino.' },

  'public/appointments/[token].get.ts': { reason: 'URL-capacidad: el token de gestión de la cita es la credencial y determina el ámbito.', requires: /getRouterParam\(event, 'token'\)/ },
  'public/appointments/[token]/cancel.post.ts': { reason: 'Igual que la consulta de la cita: el token es la credencial.', requires: /getRouterParam\(event, 'token'\)/ },
  'public/appointments/[token]/reschedule.post.ts': { reason: 'Igual que la consulta de la cita: el token es la credencial.', requires: /getRouterParam\(event, 'token'\)/ },
  'public/appointments/[token]/confirm.post.ts': { reason: 'Igual que la consulta de la cita: el token es la credencial.', requires: /getRouterParam\(event, 'token'\)/ },
  'public/contracts/[token].get.ts': { reason: 'URL-capacidad: el token de firma del contrato es la credencial y determina el ámbito.', requires: /getRouterParam\(event, 'token'\)/ },
  'public/contracts/[token]/accept.post.ts': { reason: 'Igual que la consulta del contrato: el token es la credencial.', requires: /getRouterParam\(event, 'token'\)/ },

  'public/referral-links/[code].get.ts': { reason: 'El código del enlace es la credencial; la organización sale del propio enlace y sólo se devuelve lo que le pertenece.', requires: /getRouterParam\(event, 'code'\)/ },
  'public/referrals.post.ts': { reason: 'El código del enlace es la credencial; el referido y el lead se escriben en la organización de ese enlace, nunca en una recibida del cliente.', requires: /referralLinks/ },

  'public/pois.get.ts': { reason: 'Puntos de interés de OpenStreetMap para el visor del mapa. No toca D1: no hay nada que acotar.' },

  'resend/webhook.post.ts': { reason: 'Webhook entrante firmado por Resend. El ámbito sale de la fila de email_log que referencia el evento, no de la petición.' },
  'stripe/webhook.post.ts': { reason: 'Webhook entrante firmado por Stripe. El ámbito sale del registro de pago que referencia el evento, no de la petición.' },
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (entry.endsWith('.ts')) out.push(full)
  }
  return out
}

const HANDLERS = walk(API_DIR).map((file) => ({
  key: relative(API_DIR, file).replace(/\\/g, '/'),
  source: readFileSync(file, 'utf8'),
}))

function scopedBy(source: string): string | null {
  return SCOPE_MARKERS.find((m) => m.test(source))?.name ?? null
}

describe('cobertura de ámbito de organización en server/api', () => {
  it('encuentra todos los handlers en disco', () => {
    // Protege la protección: si esto se desplomara, las comprobaciones de
    // abajo pasarían por no tener nada que mirar.
    expect(HANDLERS.length).toBeGreaterThan(200)
  })

  it('cada endpoint acota por organización o está exento con un motivo escrito', () => {
    const unscoped = HANDLERS.filter((h) => !scopedBy(h.source) && !EXEMPT[h.key]).map((h) => h.key)
    expect(
      unscoped,
      'estos endpoints no resuelven ninguna organización y no están exentos. Si es un olvido, usa requireOrgScope/resolvePublicOrgId/requireApiKey; si de verdad no debe acotarse, añádelo a EXEMPT en este fichero con el motivo',
    ).toEqual([])
  })

  it('toda exención sigue correspondiendo a un endpoint real', () => {
    // Una lista de exenciones que nadie poda acaba autorizando ficheros que
    // ya no existen — y, peor, tapando el que ocupe su sitio.
    const existing = new Set(HANDLERS.map((h) => h.key))
    const stale = Object.keys(EXEMPT).filter((key) => !existing.has(key))
    expect(stale, 'exenciones que ya no apuntan a ningún endpoint: bórralas').toEqual([])
  })

  it('ninguna exención sobra: si el endpoint ya acota, deja de estar exento', () => {
    const redundant = HANDLERS.filter((h) => EXEMPT[h.key] && scopedBy(h.source)).map((h) => `${h.key} (ya usa ${scopedBy(h.source)})`)
    expect(redundant, 'estos endpoints ya acotan por organización: quítalos de EXEMPT para que la lista siga significando algo').toEqual([])
  })

  it('las exenciones que se apoyan en una credencial siguen exigiéndola', () => {
    // Una URL-capacidad deja de serlo en cuanto alguien quita el token. El
    // motivo escrito seguiría ahí, ya mintiendo.
    const broken: string[] = []
    for (const [key, exemption] of Object.entries(EXEMPT)) {
      if (!exemption.requires) continue
      const handler = HANDLERS.find((h) => h.key === key)
      if (handler && !exemption.requires.test(handler.source)) broken.push(`${key} — ya no exige ${exemption.requires}`)
    }
    expect(broken, 'estas exenciones decían apoyarse en una credencial de un solo uso y el endpoint ya no la pide').toEqual([])
  })

  it('cada exención explica por qué, con algo más que una palabra', () => {
    const vague = Object.entries(EXEMPT)
      .filter(([, e]) => e.reason.trim().length < 40)
      .map(([key]) => key)
    expect(vague, 'una exención sin motivo entendible es un agujero con permiso').toEqual([])
  })

  it('el grueso de la superficie sigue estando acotado, no exento', () => {
    // Si las exenciones crecieran hasta ser la norma, esta prueba habría
    // dejado de proteger nada sin dar ni un fallo.
    const exempt = HANDLERS.filter((h) => EXEMPT[h.key]).length
    expect(exempt / HANDLERS.length).toBeLessThan(0.15)
  })
})
