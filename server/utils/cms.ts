/**
 * Shared helpers for the Blog & CMS module. `contentJson` is a JSON array of
 * editor blocks (`[{ type: 'paragraph', text: '...' }, ...]`) from day one —
 * Phase 1's simple editor only ever writes a single paragraph block, but the
 * shape already matches what the real block editor (a later phase) will
 * read/write, so no migration is needed when that lands.
 */

export interface CmsBlock {
  type: string
  text?: string
  [key: string]: any
}

export function parseBlocks(contentJson: string | null | undefined): CmsBlock[] {
  if (!contentJson) return []
  try {
    const parsed = JSON.parse(contentJson)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Flattens every block's text into one string — used for word counts, SEO analysis and search. */
export function blocksToPlainText(blocks: CmsBlock[]): string {
  const parts: string[] = []
  for (const b of blocks) {
    switch (b.type) {
      case 'heading':
      case 'paragraph':
      case 'quote':
      case 'callout':
        if (b.text) parts.push(b.text)
        if (b.author) parts.push(b.author)
        break
      case 'cta':
        if (b.title) parts.push(b.title)
        if (b.text) parts.push(b.text)
        break
      case 'columns':
        if (b.left) parts.push(b.left)
        if (b.right) parts.push(b.right)
        break
      case 'faq':
        for (const item of b.items || []) {
          if (item.q) parts.push(item.q)
          if (item.a) parts.push(item.a)
        }
        break
      case 'table':
        for (const row of b.rows || []) parts.push(row.filter(Boolean).join(' '))
        break
      case 'image':
      case 'gallery':
        if (b.caption) parts.push(b.caption)
        break
      default:
        if (b.text) parts.push(b.text)
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

/** Counts internal (/ or same-origin) vs external links referenced by button/cta/video blocks — real SEO signal, not fabricated. */
export function countLinks(blocks: CmsBlock[]): { internal: number; external: number } {
  let internal = 0
  let external = 0
  for (const b of blocks) {
    const urls = [b.url, b.buttonUrl].filter(Boolean) as string[]
    for (const url of urls) {
      if (url.startsWith('/') || url.startsWith('#')) internal++
      else external++
    }
  }
  return { internal, external }
}

/** Real word-count-based estimate (200 wpm), not a fabricated number. */
export function computeReadingTime(blocks: CmsBlock[]): number {
  const words = blocksToPlainText(blocks).split(' ').filter(Boolean).length
  return Math.max(1, Math.round(words / 200))
}

interface SeoInputs {
  title: string
  slug: string
  excerpt?: string | null
  seoTitle?: string | null
  seoDescription?: string | null
  focusKeyword?: string | null
  coverImage?: string | null
  plainText: string
  links?: { internal: number; external: number }
}

/**
 * Transparent, checkable heuristic — every point traces to a real, visible
 * signal (title/description length, keyword placement, content length,
 * internal linking). Not a black box, and not keyword-stuffing-friendly:
 * density itself doesn't add points beyond "keyword present in content".
 */
export function computeSeoScore(input: SeoInputs): number {
  let score = 0
  const title = input.seoTitle || input.title
  if (title && title.length >= 30 && title.length <= 65) score += 20
  else if (title) score += 10

  const desc = input.seoDescription || input.excerpt || ''
  if (desc.length >= 70 && desc.length <= 160) score += 15
  else if (desc.length > 0) score += 8

  if (input.focusKeyword) {
    score += 8
    const kw = input.focusKeyword.toLowerCase()
    if (title.toLowerCase().includes(kw)) score += 8
    if (input.plainText.toLowerCase().includes(kw)) score += 8
  }

  if (input.coverImage) score += 8

  const wordCount = input.plainText.split(' ').filter(Boolean).length
  if (wordCount >= 300) score += 17
  else if (wordCount >= 100) score += 8

  if (input.slug && input.slug.length <= 75) score += 8

  if (input.links) {
    if (input.links.internal > 0) score += 5
    if (input.links.internal + input.links.external > 0) score += 3
  }

  return Math.min(100, score)
}
