import type { EmailChannelHealth } from './email/health'

/**
 * Estado real de cada integración de la plataforma, en una sola lista.
 *
 * ## Por qué
 *
 * El proyecto es honesto pieza a pieza —el motor de IA dice que cae a reglas
 * sin `AI_API_KEY`, el despachador distingue `not_configured` de
 * `not_implemented`, el email no marca "Entregado" si Resend no lo confirma—
 * pero esa honestidad estaba **dispersa**: cada cosa avisaba en su propio
 * rincón, y nadie tenía la lista completa de qué está vivo, qué está dormido
 * y qué está mal configurado. En la práctica eso significa vender en la
 * interfaz cosas que hoy no pueden funcionar.
 *
 * ## La distinción que importa
 *
 * `not-configured` y `not-implemented` **no** son lo mismo, y confundirlos es
 * exactamente lo que hace inútil un panel de estado:
 *
 * - `not-configured`: el código existe y funciona; falta un secreto. Está a
 *   un ajuste de distancia y tiene remedio accionable.
 * - `not-implemented`: no hay código detrás. Configurar el secreto no cambia
 *   nada, y prometer lo contrario sería mentir.
 *
 * Es la misma distinción que ya hace `server/utils/publication/dispatcher.ts`
 * al decidir por qué un trabajo queda bloqueado; aquí se reutiliza en vez de
 * inventar un vocabulario paralelo.
 *
 * ## Qué no sale de aquí
 *
 * Presencia, nunca valores. La entrada son booleanos (`¿existe el secreto?`),
 * así que ni una clave ni un fragmento de clave puede acabar en una respuesta
 * HTTP, en una captura o en un informe.
 */

export type IntegrationState = 'ok' | 'degraded' | 'not-configured' | 'not-implemented'

export interface IntegrationStatus {
  key: string
  label: string
  group: string
  state: IntegrationState
  /** Qué significa este estado, en una frase, sin tecnicismos innecesarios. */
  detail: string
  /** Qué hay que hacer para que pase a 'ok'. `null` si no hay nada que hacer. */
  remedy: string | null
  /** El nombre del ajuste que lo activa — nunca su valor. */
  setting: string | null
}

export interface SystemStatusInput {
  /** Presencia (nunca el valor) de cada secreto relevante. */
  secrets: Record<string, boolean>
  database: { ok: boolean; error?: string }
  storage: { ok: boolean; error?: string }
  channels: { total: number; implemented: number }
  email: Pick<EmailChannelHealth, 'connected' | 'status' | 'headline'>
  build: { commit: string; branch: string; builtAt: string; source: string }
}

export interface SystemStatusReport {
  integrations: IntegrationStatus[]
  summary: { ok: number; degraded: number; notConfigured: number; notImplemented: number }
  build: SystemStatusInput['build']
  /** Lo que hay que mirar primero: roto antes que dormido, y nada si todo está bien. */
  headline: string | null
}

function dependency(
  key: string,
  label: string,
  health: { ok: boolean; error?: string },
  okDetail: string,
): IntegrationStatus {
  return health.ok
    ? { key, label, group: 'Infraestructura', state: 'ok', detail: okDetail, remedy: null, setting: null }
    : {
        key,
        label,
        group: 'Infraestructura',
        state: 'degraded',
        detail: health.error || 'No responde.',
        remedy: 'Revisa el binding en wrangler.toml y que el recurso exista en la cuenta de Cloudflare.',
        setting: null,
      }
}

/**
 * Una integración que depende de un secreto: o está, y funciona, o no está, y
 * se dice exactamente qué deja de funcionar mientras tanto.
 */
function secretBacked(
  key: string,
  label: string,
  group: string,
  present: boolean,
  setting: string,
  okDetail: string,
  missingDetail: string,
): IntegrationStatus {
  return present
    ? { key, label, group, state: 'ok', detail: okDetail, remedy: null, setting }
    : {
        key,
        label,
        group,
        state: 'not-configured',
        detail: missingDetail,
        remedy: `Configura el secreto ${setting} en el Worker (Cloudflare → Settings → Variables and Secrets).`,
        setting,
      }
}

export function buildSystemStatus(input: SystemStatusInput): SystemStatusReport {
  const has = (name: string) => Boolean(input.secrets[name])

  const integrations: IntegrationStatus[] = [
    dependency('database', 'Base de datos (D1)', input.database, 'Responde con normalidad.'),
    dependency('storage', 'Almacenamiento de archivos (R2)', input.storage, 'Responde con normalidad.'),

    // El email tiene su propio diagnóstico, que mira el historial real de
    // envíos y no sólo si hay clave: aquí se reutiliza su veredicto en vez de
    // calcular uno peor por segunda vez.
    {
      key: 'email',
      label: 'Envío de emails (Resend)',
      group: 'Comunicaciones',
      state: !input.email.connected ? 'not-configured' : input.email.status === 'down' || input.email.status === 'warning' ? 'degraded' : 'ok',
      detail: input.email.headline,
      remedy: !input.email.connected
        ? 'Configura el secreto RESEND_API_KEY en el Worker.'
        : input.email.status === 'down' || input.email.status === 'warning'
          ? 'Mira el motivo exacto que devolvió Resend en Sistema → Emails.'
          : null,
      setting: 'RESEND_API_KEY',
    },
    secretBacked(
      'email-webhook',
      'Confirmación de entrega de emails',
      'Comunicaciones',
      has('RESEND_WEBHOOK_SECRET'),
      'RESEND_WEBHOOK_SECRET',
      'Resend confirma entregas, rebotes y reclamaciones.',
      'Sin esto, un email se queda en "Enviado" para siempre: nadie confirma si llegó, rebotó o fue marcado como spam.',
    ),

    secretBacked(
      'stripe',
      'Cobros (Stripe)',
      'Pagos',
      has('STRIPE_SECRET_KEY'),
      'STRIPE_SECRET_KEY',
      'Se pueden crear cobros reales.',
      'No se puede cobrar. Los depósitos se quedan sin pasarela.',
    ),
    secretBacked(
      'stripe-webhook',
      'Confirmación de pagos (webhook de Stripe)',
      'Pagos',
      has('STRIPE_WEBHOOK_SECRET'),
      'STRIPE_WEBHOOK_SECRET',
      'Stripe confirma los pagos y los depósitos se actualizan solos.',
      'Un cliente puede pagar y el depósito quedarse "En proceso" para siempre, porque nadie recibe la confirmación.',
    ),

    secretBacked(
      'ai',
      'Generación de contenido con IA',
      'Contenido',
      has('AI_API_KEY'),
      'AI_API_KEY',
      'Los textos se generan con IA.',
      'Funciona igual, pero con el generador por reglas: textos correctos a partir de los datos del inmueble, no escritos por IA.',
    ),

    secretBacked(
      'alerts',
      'Avisos de incidencias',
      'Observabilidad',
      has('ERROR_ALERT_WEBHOOK_URL'),
      'ERROR_ALERT_WEBHOOK_URL',
      'Cada error de servidor se avisa por webhook además de quedar registrado.',
      'Los errores se registran en Sistema → Errores, pero nadie se entera hasta que entra a mirar. El código ya está: sólo falta una URL de Slack o Discord.',
    ),

    secretBacked(
      'channel-credentials',
      'Cifrado de credenciales de canales',
      'Publicación',
      has('CHANNEL_CREDENTIALS_ENCRYPTION_KEY'),
      'CHANNEL_CREDENTIALS_ENCRYPTION_KEY',
      'Las credenciales de los canales se guardan cifradas.',
      'No se pueden guardar credenciales de canales: el alta se niega antes que guardarlas en claro.',
    ),
    {
      key: 'channels',
      label: 'Canales de publicación',
      group: 'Publicación',
      state: input.channels.implemented > 0 ? 'ok' : 'not-implemented',
      detail:
        input.channels.implemented > 0
          ? `${input.channels.implemented} de ${input.channels.total} canales tienen adaptador real.`
          : `Los ${input.channels.total} canales están definidos pero ninguno tiene adaptador todavía: programar una publicación la deja bloqueada, y configurar credenciales no lo cambia.`,
      // Deliberadamente sin remedio: esto no se arregla con un ajuste, hace
      // falta escribir el adaptador. Ofrecer un "configura X" aquí sería
      // mandar a alguien a perder la tarde.
      remedy: null,
      setting: null,
    },
  ]

  const summary = {
    ok: integrations.filter((i) => i.state === 'ok').length,
    degraded: integrations.filter((i) => i.state === 'degraded').length,
    notConfigured: integrations.filter((i) => i.state === 'not-configured').length,
    notImplemented: integrations.filter((i) => i.state === 'not-implemented').length,
  }

  // Lo roto manda sobre lo dormido: algo que funcionaba y ha dejado de
  // hacerlo es más urgente que algo que nunca se encendió.
  const broken = integrations.find((i) => i.state === 'degraded')
  const headline = broken
    ? `${broken.label}: ${broken.detail}`
    : summary.notConfigured > 0
      ? `${summary.notConfigured} ${summary.notConfigured === 1 ? 'integración está' : 'integraciones están'} sin configurar.`
      : null

  return { integrations, summary, build: input.build, headline }
}

/** Los secretos cuya *presencia* mira esta pantalla. Nunca se lee su valor. */
export const TRACKED_SECRETS = [
  'RESEND_API_KEY',
  'RESEND_WEBHOOK_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'AI_API_KEY',
  'ERROR_ALERT_WEBHOOK_URL',
  'CHANNEL_CREDENTIALS_ENCRYPTION_KEY',
] as const
