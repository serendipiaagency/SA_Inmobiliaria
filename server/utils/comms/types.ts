/**
 * Tipos compartidos del Centro de Comunicaciones: lo que un proveedor recibe
 * y devuelve, en un vocabulario propio. El resto del sistema (bandeja,
 * webhooks, API del panel) habla sólo con esto — nunca con el JSON de Meta
 * ni con los formularios de Twilio directamente.
 */

export type CommsProviderKey = 'meta_cloud' | 'twilio'

/** Lo que cada proveedor puede hacer DE VERDAD hoy, verificado contra su documentación oficial (docs/communications.md). */
export interface ProviderCapabilities {
  /** Texto libre dentro de la ventana de 24 h. */
  messaging: boolean
  /** Imágenes y documentos por enlace público. */
  media: boolean
  /** Plantillas aprobadas para escribir fuera de la ventana. */
  templates: boolean
  /** Sincronizar la lista de plantillas desde el proveedor. */
  templateSync: boolean
  /** Confirmaciones de entrega/lectura por webhook. */
  readReceipts: boolean
  /** Marcar como leído en el WhatsApp del cliente. */
  markRead: boolean
  /** Llamadas de voz por WhatsApp (WebRTC desde el navegador). */
  calling: boolean
  /** Pedir permiso de llamada al usuario. */
  callPermissions: boolean
}

export interface MetaCloudCredentials {
  provider: 'meta_cloud'
  /** Token de usuario del sistema (Meta Business). */
  accessToken: string
  /** App secret de la app de Meta, para verificar X-Hub-Signature-256. Opcional si el Worker tiene WHATSAPP_APP_SECRET. */
  appSecret?: string
  /** Token de verificación del webhook (el que se escribe en el panel de la app de Meta). Opcional si el Worker tiene WHATSAPP_WEBHOOK_VERIFY_TOKEN. */
  verifyToken?: string
}

export interface TwilioCredentials {
  provider: 'twilio'
  accountSid: string
  authToken: string
}

export type ChannelCredentials = MetaCloudCredentials | TwilioCredentials

/** Fila de comms_channels sin credenciales: lo que puede viajar al navegador. */
export interface ChannelView {
  id: number
  organizationId: number
  provider: CommsProviderKey
  label: string
  phoneE164: string
  externalPhoneId: string
  businessAccountId: string | null
  status: 'active' | 'disabled'
  isDefault: boolean
  callingStatus: 'unknown' | 'unavailable' | 'disabled' | 'enabled'
  callingCheckedAt: string | null
  callingNote: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
  /** Qué credenciales hay, nunca cuáles. */
  credentials: { hasAccessToken: boolean; hasAppSecret: boolean; hasVerifyToken: boolean; hasAccountSid: boolean; hasAuthToken: boolean }
  capabilities: ProviderCapabilities
}

/** Un canal con sus credenciales descifradas: sólo existe en memoria del servidor. */
export interface LoadedChannel extends Omit<ChannelView, 'credentials' | 'capabilities'> {
  credentials: ChannelCredentials
}

// --- salida -----------------------------------------------------------------

export interface OutboundText {
  kind: 'text'
  body: string
  previewUrl?: boolean
}
export interface OutboundMedia {
  kind: 'image' | 'document'
  /** URL pública desde la que el proveedor descarga el archivo. */
  link: string
  caption?: string | null
  filename?: string | null
}
export interface OutboundTemplate {
  kind: 'template'
  name: string
  language: string
  /** Parámetros del cuerpo, en orden ({{1}}, {{2}}…). */
  params: string[]
  /** Twilio: el Content SID de la plantilla (HX…). */
  contentSid?: string | null
}
export type OutboundMessage = OutboundText | OutboundMedia | OutboundTemplate

export interface SendResult {
  ok: boolean
  /** Id del mensaje en el proveedor (wamid.… / SM…). */
  externalId: string | null
  status: string | null
  errorCode: string | null
  error: string | null
}

// --- entrada (webhooks) -------------------------------------------------------

export type InboundMessageType = 'text' | 'image' | 'document' | 'audio' | 'video' | 'sticker' | 'location' | 'contacts' | 'interactive' | 'button' | 'reaction' | 'unsupported'

export interface InboundMediaRef {
  /** Meta: id del medio (se descarga con el token). Twilio: URL con autenticación básica. */
  providerMediaId?: string | null
  url?: string | null
  mime?: string | null
  filename?: string | null
  caption?: string | null
  sha256?: string | null
}

export interface InboundMessageEvent {
  kind: 'message'
  externalId: string
  /** Teléfono del remitente en E.164. */
  from: string
  profileName?: string | null
  /** ISO 8601 (UTC). */
  timestamp: string
  type: InboundMessageType
  text?: string | null
  media?: InboundMediaRef | null
  /** Respuestas interactivas (botones, listas, permiso de llamada). */
  interactive?: { type: string; id?: string | null; title?: string | null; response?: string | null; expiresAt?: string | null; isPermanent?: boolean } | null
  location?: { latitude: number; longitude: number; name?: string | null; address?: string | null } | null
  /** Id del mensaje al que responde, si es una respuesta. */
  contextExternalId?: string | null
  raw: unknown
}

export interface MessageStatusEvent {
  kind: 'status'
  externalId: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
  timestamp: string
  recipient?: string | null
  errorCode?: string | null
  errorMessage?: string | null
  raw: unknown
}

export interface CallEvent {
  kind: 'call'
  /** wacid.… */
  externalId: string
  event: 'connect' | 'status' | 'terminate'
  direction?: 'inbound' | 'outbound' | null
  /** Teléfono del usuario de WhatsApp en E.164. */
  from?: string | null
  to?: string | null
  /** connect: la oferta (llamada entrante) o la respuesta (saliente) SDP. */
  session?: { sdpType: 'offer' | 'answer'; sdp: string } | null
  /** status: RINGING | ACCEPTED | REJECTED; terminate: COMPLETED | FAILED. */
  status?: string | null
  startTime?: string | null
  endTime?: string | null
  durationSeconds?: number | null
  timestamp: string
  raw: unknown
}

export interface CallPermissionEvent {
  kind: 'call_permission'
  externalId: string
  from: string
  response: 'accept' | 'reject'
  expiresAt: string | null
  isPermanent: boolean
  timestamp: string
  raw: unknown
}

export type InboundEvent = InboundMessageEvent | MessageStatusEvent | CallEvent | CallPermissionEvent

/** Lo que devuelve el parser de un webhook: eventos agrupados por el número de negocio al que iban. */
export interface ParsedWebhook {
  /** Meta: phone_number_id. Twilio: `whatsapp:+E.164` del To. */
  externalPhoneId: string
  displayPhoneNumber?: string | null
  events: InboundEvent[]
}

/** Clave de idempotencia de un evento entrante (única por proveedor). */
export function eventKeyFor(event: InboundEvent): string {
  switch (event.kind) {
    case 'message':
      return `msg:${event.externalId}`
    case 'status':
      return `status:${event.externalId}:${event.status}`
    case 'call':
      return `call:${event.externalId}:${event.event}${event.status ? `:${String(event.status).toLowerCase()}` : ''}`
    case 'call_permission':
      return `perm:${event.externalId}`
  }
}
