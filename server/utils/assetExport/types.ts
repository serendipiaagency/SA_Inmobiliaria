export type ElementType = 'text' | 'image' | 'qr' | 'shape'

export interface TemplateElement {
  id: string
  type: ElementType
  x: number
  y: number
  w: number
  h: number
  rotation?: number
  zIndex?: number
  locked?: boolean
  /** Static text, or a `{{asset.field}}` / `{{tenant.field}}` dynamic binding — see bindings.ts. */
  binding?: string
  style?: Record<string, unknown>
}

export interface TemplatePage {
  id: string
  elements: TemplateElement[]
}

export interface TemplateStructure {
  pages: TemplatePage[]
}

const ELEMENT_TYPES: ElementType[] = ['text', 'image', 'qr', 'shape']

/** Rejects malformed structure JSON instead of silently accepting anything a client sends. */
export function validateStructure(input: unknown): { ok: true; structure: TemplateStructure } | { ok: false; error: string } {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'structure must be an object' }
  const pages = (input as any).pages
  if (!Array.isArray(pages)) return { ok: false, error: 'structure.pages must be an array' }
  if (pages.length > 30) return { ok: false, error: 'Too many pages (max 30)' }

  for (const page of pages) {
    if (typeof page?.id !== 'string') return { ok: false, error: 'each page needs a string id' }
    if (!Array.isArray(page.elements)) return { ok: false, error: `page ${page.id} needs an elements array` }
    if (page.elements.length > 100) return { ok: false, error: `page ${page.id} has too many elements (max 100)` }
    for (const el of page.elements) {
      if (typeof el?.id !== 'string') return { ok: false, error: 'each element needs a string id' }
      if (!ELEMENT_TYPES.includes(el.type)) return { ok: false, error: `invalid element type: ${el.type}` }
      for (const dim of ['x', 'y', 'w', 'h'] as const) {
        if (typeof el[dim] !== 'number' || !Number.isFinite(el[dim])) return { ok: false, error: `element ${el.id}.${dim} must be a finite number` }
      }
    }
  }

  return { ok: true, structure: { pages } }
}
