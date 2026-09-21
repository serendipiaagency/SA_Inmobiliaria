import { and, asc, desc, eq } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { now } from '../db'
import { decryptString, encryptString } from '../encryption'
import { PROVIDERS } from './providers/registry'
import type { ChannelCredentials, ChannelView, CommsProviderKey, LoadedChannel } from './types'

/**
 * Credenciales de un canal de comunicaciones, cifradas en reposo (AES-GCM,
 * server/utils/encryption.ts) con un secreto del Worker propio,
 * COMMS_CREDENTIALS_ENCRYPTION_KEY — ni el de los canales de publicación ni
 * el del 2FA: que se filtre uno no abre los otros.
 *
 * Todo lo que sale de aquí hacia el navegador pasa por `channelView()`, que
 * deja los booleanos "hay token / hay app secret" y nunca los valores.
 */

export const COMMS_ENCRYPTION_SECRET = 'COMMS_CREDENTIALS_ENCRYPTION_KEY'

export class CommsEncryptionUnavailableError extends Error {
  constructor() {
    super('COMMS_CREDENTIALS_ENCRYPTION_KEY no está configurado en este Worker: no se pueden guardar ni leer credenciales de canales.')
    this.name = 'CommsEncryptionUnavailableError'
  }
}

export function isCommsEncryptionAvailable(env: Record<string, any> | undefined): boolean {
  return Boolean(env?.[COMMS_ENCRYPTION_SECRET])
}

export async function encryptChannelCredentials(env: Record<string, any>, credentials: ChannelCredentials): Promise<{ ciphertext: string; iv: string }> {
  const secret = env?.[COMMS_ENCRYPTION_SECRET]
  if (!secret) throw new CommsEncryptionUnavailableError()
  return encryptString(String(secret), JSON.stringify(credentials))
}

export async function decryptChannelCredentials(env: Record<string, any>, row: { credentialsCiphertext: string; credentialsIv: string }): Promise<ChannelCredentials> {
  const secret = env?.[COMMS_ENCRYPTION_SECRET]
  if (!secret) throw new CommsEncryptionUnavailableError()
  const json = await decryptString(String(secret), { ciphertext: row.credentialsCiphertext, iv: row.credentialsIv })
  return JSON.parse(json) as ChannelCredentials
}

type ChannelRow = typeof schema.commsChannels.$inferSelect

function baseView(row: ChannelRow): Omit<ChannelView, 'credentials' | 'capabilities'> {
  return {
    id: row.id,
    organizationId: row.organizationId,
    provider: row.provider as CommsProviderKey,
    label: row.label,
    phoneE164: row.phoneE164,
    externalPhoneId: row.externalPhoneId,
    businessAccountId: row.businessAccountId,
    status: row.status as ChannelView['status'],
    isDefault: row.isDefault === 1,
    callingStatus: row.callingStatus as ChannelView['callingStatus'],
    callingCheckedAt: row.callingCheckedAt,
    callingNote: row.callingNote,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** La fila sin secretos: sólo "qué credenciales hay". Es lo único que se envía al panel. */
export function channelView(row: ChannelRow, credentials?: ChannelCredentials | null): ChannelView {
  const c = credentials as any
  return {
    ...baseView(row),
    credentials: {
      hasAccessToken: Boolean(c?.accessToken),
      hasAppSecret: Boolean(c?.appSecret),
      hasVerifyToken: Boolean(c?.verifyToken),
      hasAccountSid: Boolean(c?.accountSid),
      hasAuthToken: Boolean(c?.authToken),
    },
    capabilities: PROVIDERS[row.provider as CommsProviderKey]?.capabilities ?? PROVIDERS.twilio.capabilities,
  }
}

async function load(env: Record<string, any>, row: ChannelRow | undefined): Promise<LoadedChannel | null> {
  if (!row) return null
  const credentials = await decryptChannelCredentials(env, row)
  return { ...baseView(row), credentials }
}

/** Un canal de ESTA organización, con credenciales. `null` si no existe o es de otra. */
export async function loadChannel(db: any, env: Record<string, any>, input: { id: number; orgId: number }): Promise<LoadedChannel | null> {
  const rows = await db
    .select()
    .from(schema.commsChannels)
    .where(and(eq(schema.commsChannels.id, input.id), eq(schema.commsChannels.organizationId, input.orgId)))
    .limit(1)
  return load(env, rows[0])
}

/**
 * Enrutado de webhooks: el canal al que iba dirigido un evento, por
 * proveedor y número externo. NO acota por organización a propósito — es lo
 * que la determina — y por eso sólo lo llaman los handlers de webhook, que
 * verifican la firma con el secreto de ESTE canal antes de fiarse de nada.
 */
export async function loadChannelByExternalPhone(db: any, env: Record<string, any>, provider: CommsProviderKey, externalPhoneId: string): Promise<LoadedChannel | null> {
  const rows = await db
    .select()
    .from(schema.commsChannels)
    .where(and(eq(schema.commsChannels.provider, provider), eq(schema.commsChannels.externalPhoneId, externalPhoneId)))
    .limit(1)
  return load(env, rows[0])
}

/** El canal por defecto de la organización (el marcado, o el primero activo). */
export async function defaultChannel(db: any, env: Record<string, any>, orgId: number): Promise<LoadedChannel | null> {
  const rows = await db
    .select()
    .from(schema.commsChannels)
    .where(and(eq(schema.commsChannels.organizationId, orgId), eq(schema.commsChannels.status, 'active')))
    .orderBy(desc(schema.commsChannels.isDefault), asc(schema.commsChannels.id))
    .limit(1)
  return load(env, rows[0])
}

/** Todos los canales de la organización, sin secretos. Descifra sólo para saber qué campos existen. */
export async function listChannels(db: any, env: Record<string, any>, orgId: number): Promise<ChannelView[]> {
  const rows: ChannelRow[] = await db.select().from(schema.commsChannels).where(eq(schema.commsChannels.organizationId, orgId)).orderBy(asc(schema.commsChannels.id))
  const out: ChannelView[] = []
  for (const row of rows) {
    const credentials: ChannelCredentials | null = isCommsEncryptionAvailable(env) ? await decryptChannelCredentials(env, row).catch(() => null) : null
    out.push(channelView(row, credentials))
  }
  return out
}

/** Todos los tokens de verificación de webhook de Meta guardados en canales (para el handshake GET, que no lleva phone_number_id). */
export async function metaVerifyTokens(db: any, env: Record<string, any>): Promise<string[]> {
  const tokens: string[] = []
  if (env?.WHATSAPP_WEBHOOK_VERIFY_TOKEN) tokens.push(String(env.WHATSAPP_WEBHOOK_VERIFY_TOKEN))
  if (!isCommsEncryptionAvailable(env)) return tokens
  const rows: ChannelRow[] = await db.select().from(schema.commsChannels).where(eq(schema.commsChannels.provider, 'meta_cloud'))
  for (const row of rows) {
    try {
      const c = await decryptChannelCredentials(env, row)
      if (c.provider === 'meta_cloud' && c.verifyToken) tokens.push(c.verifyToken)
    } catch {
      // Un canal que no se puede descifrar no aporta token; no rompe el handshake de los demás.
    }
  }
  return tokens
}

export async function touchChannel(db: any, id: number, patch: Partial<Pick<ChannelRow, 'lastError' | 'callingStatus' | 'callingCheckedAt' | 'callingNote'>>): Promise<void> {
  await db
    .update(schema.commsChannels)
    .set({ ...patch, updatedAt: now() })
    .where(eq(schema.commsChannels.id, id))
}
