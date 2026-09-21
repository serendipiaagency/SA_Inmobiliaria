import type { CommsProviderKey, ProviderCapabilities } from '../types'

/**
 * Qué puede hacer cada proveedor, **según su documentación oficial** y no
 * según lo que nos gustaría. La matriz completa, con enlaces y lo que exige
 * cada capacidad, está en docs/communications.md; esto es la versión que el
 * código consulta para no ofrecer en la interfaz nada que el proveedor no
 * permita (un botón "Llamar" con Twilio, por ejemplo).
 *
 * Los proveedores son módulos aparte (metaCloud.ts, twilio.ts) para que este
 * registro no arrastre sus dependencias a quien sólo quiere saber "¿puede?".
 */
export interface ProviderMeta {
  key: CommsProviderKey
  label: string
  /** Una frase para el desplegable de Configuración. */
  summary: string
  capabilities: ProviderCapabilities
  /** Qué hace falta para conectar un número con este proveedor. */
  requirements: string[]
}

export const PROVIDERS: Record<CommsProviderKey, ProviderMeta> = {
  meta_cloud: {
    key: 'meta_cloud',
    label: 'Meta WhatsApp Cloud API',
    summary: 'La API oficial de Meta: mensajes, plantillas, medios y llamadas de voz por WhatsApp (donde Meta las permite).',
    capabilities: {
      messaging: true,
      media: true,
      templates: true,
      templateSync: true,
      readReceipts: true,
      markRead: true,
      calling: true,
      callPermissions: true,
    },
    requirements: [
      'Una cuenta de WhatsApp Business (WABA) con un número registrado en Cloud API.',
      'Un token de usuario del sistema con el permiso whatsapp_business_messaging (y whatsapp_business_management para sincronizar plantillas).',
      'El phone_number_id del número y, para las plantillas, el id de la WABA.',
      'Un webhook apuntando a /api/comms/webhooks/meta suscrito a los campos messages y calls, con el App Secret para verificar la firma.',
      'Para llamadas: límite de mensajería ≥ 2000 destinatarios/día, la función activada en el número y permiso del usuario para llamadas salientes. No disponible para llamadas salientes en EE. UU., Canadá, Egipto, Vietnam y Nigeria.',
    ],
  },
  twilio: {
    key: 'twilio',
    label: 'Twilio (WhatsApp)',
    summary: 'WhatsApp a través de Twilio: mensajes, medios y plantillas (Content API). Sin llamadas de voz para números españoles.',
    capabilities: {
      messaging: true,
      media: true,
      templates: true,
      templateSync: false,
      readReceipts: true,
      markRead: false,
      calling: false,
      callPermissions: false,
    },
    requirements: [
      'Una cuenta de Twilio con un remitente de WhatsApp aprobado (o el sandbox para probar).',
      'Account SID y Auth Token (el token también firma los webhooks).',
      'Los webhooks de mensajes entrantes y de estado apuntando a /api/comms/webhooks/twilio/inbound y /api/comms/webhooks/twilio/status.',
      'Las plantillas se registran a mano con su Content SID (HX…): Twilio no expone una sincronización que el panel pueda usar sin más permisos.',
    ],
  },
}

export function providerMeta(key: string): ProviderMeta | null {
  return (PROVIDERS as Record<string, ProviderMeta>)[key] ?? null
}

export function isProviderKey(value: string): value is CommsProviderKey {
  return value === 'meta_cloud' || value === 'twilio'
}

/** Las capacidades "sin canal": todo a false. Es lo que ve una agencia que aún no conectó ningún número. */
export const NO_CAPABILITIES: ProviderCapabilities = {
  messaging: false,
  media: false,
  templates: false,
  templateSync: false,
  readReceipts: false,
  markRead: false,
  calling: false,
  callPermissions: false,
}
