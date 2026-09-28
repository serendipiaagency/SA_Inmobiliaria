/** Opaque, unguessable credential for a client's self-service appointment link (`visits.managementToken`). */
export function generateManagementToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
