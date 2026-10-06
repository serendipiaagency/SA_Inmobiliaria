/** Builds the public URL for an R2 media key (or passes through absolute URLs). */
export function mediaUrl(key: string | null | undefined): string {
  if (!key) return '/placeholder.svg'
  if (key.startsWith('http') || key.startsWith('/')) return key
  return `/api/media/${key}`
}
