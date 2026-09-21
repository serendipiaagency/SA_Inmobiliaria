import type { EmailChannelHealth } from './email/health'
import type { DomainHealthSummary } from './domainMonitor'

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
  /** Última comprobación de cada dominio personalizado (server/utils/domainMonitor.ts). */
  domains: DomainHealthSummary
  /** Presencia del binding BROWSER (Browser Rendering), que es lo que produce los formatos de imagen para redes. */
  browserRendering: boolean
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

/**
 * Los dominios de cliente son infraestructura *de cada agencia*: si uno deja
 * de llegar a la suya, para esa agencia la plataforma entera está caída
 * aunque D1 y R2 respondan de maravilla. Por eso va en este grupo y por eso
 * un solo dominio caído pone la fila en rojo.
 */
function describeDomains(domains: DomainHealthSummary): IntegrationStatus {
  const base = { key: 'custom-domains', label: 'Dominios personalizados', group: 'Infraestructura', setting: null }
  if (domains.total === 0) {
    return {
      ...base,
      state: 'ok',
      detail: 'Ninguna agencia tiene dominio propio todavía; todas se sirven en el host de la plataforma.',
      remedy: null,
    }
  }
  if (domains.lastCheckedAt === null) {
    return {
      ...base,
      state: 'not-configured',
      detail: `${domains.total} ${domains.total === 1 ? 'dominio configurado' : 'dominios configurados'}, pero todavía no se ha ejecutado ninguna comprobación.`,
      remedy: 'La comprobación corre cada 10 minutos en el Worker desplegado (system:check-custom-domains). Si esto sigue así, revisa que los Cron Triggers estén activos.',
    }
  }
  if (domains.failing.length) {
    return {
      ...base,
      state: 'degraded',
      detail: domains.failing.map((f) => `${f.domain}: ${f.error}`).join(' · '),
      remedy: 'Comprueba el registro DNS del dominio, que siga añadido como Custom Domain del Worker en Cloudflare y que la organización tenga ese dominio en Empresas (docs/multi-domain.md).',
    }
  }
  return {
    ...base,
    state: 'ok',
    detail: `${domains.total === 1 ? 'El dominio responde' : `Los ${domains.total} dominios responden`} y ${domains.total === 1 ? 'llega' : 'llegan'} a su agencia. Última comprobación: ${domains.lastCheckedAt} UTC.`,
    remedy: null,
  }
}

export function buildSystemStatus(input: SystemStatusInput): SystemStatusReport {
  const has = (name: string) => Boolean(input.secrets[name])

  const integrations: IntegrationStatus[] = [
    dependency('database', 'Base de datos (D1)', input.database, 'Responde con normalidad.'),
    dependency('storage', 'Almacenamiento de archivos (R2)', input.storage, 'Responde con normalidad.'),
    describeDomains(input.domains),

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

    {
      key: 'whatsapp',
      label: 'WhatsApp para avisos de citas (Twilio)',
      group: 'Comunicaciones',
      state: has('TWILIO_ACCOUNT_SID') && has('TWILIO_AUTH_TOKEN') && has('TWILIO_WHATSAPP_FROM') ? 'ok' : 'not-configured',
      detail:
        has('TWILIO_ACCOUNT_SID') && has('TWILIO_AUTH_TOKEN') && has('TWILIO_WHATSAPP_FROM')
          ? 'Las confirmaciones y recordatorios de cita salen por WhatsApp; el webhook de estado confirma la entrega.'
          : 'Los avisos de cita por WhatsApp se registran como "no conectado" y no salen. El código ya está: faltan las credenciales de Twilio.',
      remedy:
        has('TWILIO_ACCOUNT_SID') && has('TWILIO_AUTH_TOKEN') && has('TWILIO_WHATSAPP_FROM')
          ? null
          : 'Configura TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN y TWILIO_WHATSAPP_FROM en el Worker (docs/whatsapp.md).',
      setting: 'TWILIO_ACCOUNT_SID',
    },
    secretBacked(
      'comms-encryption',
      'Centro de Comunicaciones (WhatsApp Business)',
      'Comunicaciones',
      has('COMMS_CREDENTIALS_ENCRYPTION_KEY'),
      'COMMS_CREDENTIALS_ENCRYPTION_KEY',
      'Cada agencia puede conectar su número de WhatsApp (Meta Cloud API o Twilio) desde Configuración → Comunicaciones; las credenciales se guardan cifradas.',
      'Nadie puede conectar un número: sin esta clave las credenciales de los canales no se pueden cifrar ni leer, y los webhooks de WhatsApp responden 503.',
    ),
    {
      key: 'comms-meta-app',
      label: 'App de Meta compartida (webhooks de WhatsApp)',
      group: 'Comunicaciones',
      state: has('WHATSAPP_APP_SECRET') && has('WHATSAPP_WEBHOOK_VERIFY_TOKEN') ? 'ok' : 'not-configured',
      detail:
        has('WHATSAPP_APP_SECRET') && has('WHATSAPP_WEBHOOK_VERIFY_TOKEN')
          ? 'Los números de Meta conectados sin App Secret propio verifican sus webhooks con el de la plataforma.'
          : 'Opcional: cada canal de Meta puede llevar su propio App Secret y token de verificación. Sin estos dos valores en el Worker, cada agencia tiene que aportarlos al conectar su número.',
      remedy: has('WHATSAPP_APP_SECRET') && has('WHATSAPP_WEBHOOK_VERIFY_TOKEN') ? null : 'Si la plataforma usa una sola app de Meta para todas las agencias, configura WHATSAPP_APP_SECRET y WHATSAPP_WEBHOOK_VERIFY_TOKEN en el Worker (docs/communications.md).',
      setting: 'WHATSAPP_APP_SECRET',
    },
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
      'two-factor',
      'Verificación en dos pasos (2FA)',
      'Seguridad',
      has('TOTP_ENCRYPTION_KEY'),
      'TOTP_ENCRYPTION_KEY',
      'Cada cuenta puede activar el segundo factor desde Mi cuenta; el secreto se guarda cifrado.',
      'Nadie puede activar el segundo factor: el secreto TOTP se guarda cifrado con esta clave y sin ella el alta se niega. Las cuentas que ya lo tuvieran activo tampoco podrían entrar.',
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
      key: 'social-images',
      label: 'Imágenes para redes (Browser Rendering)',
      group: 'Publicación',
      state: input.browserRendering ? 'ok' : 'not-configured',
      detail: input.browserRendering
        ? 'Los formatos 1080×1080, 1080×1350 y 1080×1920 se generan como PNG con Browser Rendering.'
        : 'Los formatos de imagen para redes (feed cuadrado, feed vertical, story) responden "no disponible": el código ya está, falta el binding BROWSER del Worker. Los PDF no dependen de esto.',
      remedy: input.browserRendering ? null : 'Descomenta el bloque [browser] de wrangler.toml (primero en staging), despliega y genera una pieza de prueba (docs/asset-export-studio.md).',
      setting: 'BROWSER',
    },
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
  'TOTP_ENCRYPTION_KEY',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_WHATSAPP_FROM',
  'COMMS_CREDENTIALS_ENCRYPTION_KEY',
  'WHATSAPP_APP_SECRET',
  'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
] as const
