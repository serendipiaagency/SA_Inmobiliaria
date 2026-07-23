/** Deterministic anchor id from a heading block's text — shared by CmsBlockRenderer and CmsTableOfContents so links always match. */
export function cmsHeadingId(block: { id: string; text?: string }): string {
  const base = (block.text || block.id || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || block.id
}
