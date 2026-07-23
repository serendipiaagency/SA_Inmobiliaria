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

/** Flattens every block's text into one string — used for word counts and search. */
export function blocksToPlainText(blocks: CmsBlock[]): string {
  return blocks
    .map((b) => b.text || '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
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
}

/**
 * Basic, transparent heuristic (title/description length, focus keyword
 * presence, cover image, content length) — deliberately simple for Phase 1.
 * Fase 5 replaces this with the full analysis (keyword density, internal/
 * external links, readability) without changing the stored `seoScore` shape.
 */
export function computeSeoScore(input: SeoInputs): number {
  let score = 0
  const title = input.seoTitle || input.title
  if (title && title.length >= 30 && title.length <= 65) score += 20
  else if (title) score += 10

  const desc = input.seoDescription || input.excerpt || ''
  if (desc.length >= 70 && desc.length <= 160) score += 20
  else if (desc.length > 0) score += 10

  if (input.focusKeyword) {
    score += 10
    const kw = input.focusKeyword.toLowerCase()
    if (title.toLowerCase().includes(kw)) score += 10
    if (input.plainText.toLowerCase().includes(kw)) score += 10
  }

  if (input.coverImage) score += 10

  const wordCount = input.plainText.split(' ').filter(Boolean).length
  if (wordCount >= 300) score += 20
  else if (wordCount >= 100) score += 10

  if (input.slug && input.slug.length <= 75) score += 10

  return Math.min(100, score)
}
