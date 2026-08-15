/** SHA-256 of a byte buffer, as lowercase hex. Shared by media integrity checks and dedup. */
export async function sha256Hex(data: Uint8Array | ArrayBuffer): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', data as BufferSource)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
