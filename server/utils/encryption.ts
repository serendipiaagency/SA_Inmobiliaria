/**
 * Cifrado simétrico en reposo (AES-GCM, Web Crypto) para lo que no puede
 * quedar en claro en D1: las credenciales de canales de publicación y, desde
 * el 2FA, el secreto TOTP de cada cuenta.
 *
 * Extraído de server/utils/publication/credentials.ts para que los dos usos
 * compartan exactamente el mismo esquema (clave derivada del secreto del
 * Worker por SHA-256, IV aleatorio de 12 bytes por valor, todo en base64)
 * en vez de dos implementaciones que se separen con el tiempo. Cada uso
 * lleva su propio secreto de Worker: que se filtre uno no abre el otro.
 */

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

// Tipado como BufferSource: la librería DOM de TS tipa crypto.subtle.decrypt
// contra ArrayBuffer y un Uint8Array<ArrayBufferLike> no estrecha solo; el
// array de aquí siempre va sobre un ArrayBuffer real recién creado.
function fromBase64(b64: string): BufferSource {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export interface EncryptedValue {
  ciphertext: string
  iv: string
}

export async function encryptString(secret: string, plaintext: string): Promise<EncryptedValue> {
  const key = await deriveKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext))
  return { ciphertext: toBase64(new Uint8Array(encrypted)), iv: toBase64(iv) }
}

export async function decryptString(secret: string, value: EncryptedValue): Promise<string> {
  const key = await deriveKey(secret)
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(value.iv) }, key, fromBase64(value.ciphertext))
  return new TextDecoder().decode(decrypted)
}
