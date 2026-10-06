import { createError } from 'h3'
import { normalizeText } from './text'

/**
 * Base de conocimiento de la agencia (bloque N8b): documentos de TEXTO que
 * la agencia marca para que INMO los consulte y los cite (procedimientos,
 * argumentarios, políticas internas…). Por agencia (`organization_id`), con
 * borrado lógico. No se extrae texto de PDF ni de otros ficheros: se pega el
 * texto — sin un extractor real, prometerlo sería inventar.
 *
 * `search_text` es lo que lee la búsqueda: título + etiquetas + cuerpo en
 * minúsculas y sin tildes. Lo calcula siempre el servidor.
 */

export const KNOWLEDGE_DOC_MAX_BODY = 60_000
export const KNOWLEDGE_DOC_STATUSES = ['active', 'archived'] as const

function fail(message: string): never {
  throw createError({ statusCode: 422, statusMessage: message })
}

/** `prepare` del recurso `knowledge-documents`: valida y calcula `search_text`. */
export function prepareKnowledgeDocument(data: Record<string, any>, isCreate: boolean, existing?: Record<string, any> | null): Record<string, any> {
  if ('title' in data || isCreate) {
    const title = String(data.title ?? '').trim()
    if (!title) fail('El título es obligatorio')
    if (title.length > 200) fail('El título admite como máximo 200 caracteres')
    data.title = title
  }
  if ('body' in data || isCreate) {
    const body = String(data.body ?? '').trim()
    if (!body) fail('El documento está vacío: pega su texto')
    if (body.length > KNOWLEDGE_DOC_MAX_BODY) fail(`El documento admite como máximo ${KNOWLEDGE_DOC_MAX_BODY.toLocaleString('es-ES')} caracteres`)
    data.body = body
  }
  if ('tags' in data) {
    const tags = data.tags == null ? '' : String(data.tags)
    if (tags.length > 300) fail('Las etiquetas admiten como máximo 300 caracteres')
    data.tags = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .join(', ') || null
  }
  if (data.status != null && !(KNOWLEDGE_DOC_STATUSES as readonly string[]).includes(data.status)) fail('Estado no válido (active o archived)')
  // Nadie escribe search_text desde fuera.
  delete data.searchText
  const merged = { ...(existing || {}), ...data }
  if ('title' in data || 'body' in data || 'tags' in data || isCreate) {
    data.searchText = normalizeText(`${merged.title ?? ''}\n${merged.tags ?? ''}\n${merged.body ?? ''}`)
  }
  return data
}
