/**
 * Real, working video-call link with zero external credentials: Jitsi Meet
 * rooms are created on first join, no account or API key needed. Not a
 * placeholder — this URL genuinely opens a live video room.
 */
export function generateVideoLink(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  const slug = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `https://meet.jit.si/SA-Cita-${slug}`
}
