/**
 * Recuperación léxica (bloque N8b, RAG sin vectores). No hay bindings de
 * Workers AI ni Vectorize, y una tabla virtual FTS5 rompería `wrangler d1
 * export` (el pipeline lo ejecuta antes de cada migración en producción).
 * Así que se busca por términos: la consulta se parte en palabras con
 * contenido, se normaliza (minúsculas, sin tildes) y se puntúa en memoria
 * sobre candidatos que la base de datos ya ha acotado con LIKE.
 */

/** Palabras vacías del castellano (y algunas del panel) que no discriminan nada. */
const STOPWORDS = new Set(
  (
    'a al algo algun alguna algunas alguno algunos ante antes aqui asi aun cada como con contra cual cuales cuando de del desde donde dos el ella ellas ellos en entre era es esa ese eso esta este esto estos estas fue ha han hay hasta la las le les lo los mas me mi mis mucho muy nada ni no nos o os otra otro para pero poco por porque que quien se ser si sin sobre son su sus tambien te tiene tienen todo todos tu tus un una uno unos unas y ya yo ' +
    'puedo puede pueden hacer hago hace dime decir explica explicame quiero queremos necesito sabes saber cuanto cuanta cuantos cuantas esta estan tengo tenemos favor hola gracias'
  ).split(/\s+/),
)

const MAX_TERMS = 6

/** Minúsculas, sin tildes ni diéresis, espacios colapsados. */
export function normalizeText(input: unknown): string {
  return String(input ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Raíz mínima para plurales: «visitas» → «visita», «propiedades» → «propiedad». */
function stem(term: string): string {
  if (term.length > 5 && term.endsWith('es')) return term.slice(0, -2)
  if (term.length > 4 && term.endsWith('s')) return term.slice(0, -1)
  return term
}

/** Términos de búsqueda: palabras con contenido (≥ 3 letras o números), sin repetir, como mucho seis. */
export function queryTerms(query: string): string[] {
  const words = normalizeText(query)
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w && !STOPWORDS.has(w) && (w.length >= 3 || /^\d{2,}$/.test(w)))
  const out: string[] = []
  for (const w of words) {
    const s = stem(w)
    if (!out.includes(s)) out.push(s)
    if (out.length >= MAX_TERMS) break
  }
  return out
}

/**
 * Patrón LIKE para un término ya normalizado sobre una columna que NO lo
 * está (notas, fichas): cada vocal pasa a `_` (un carácter cualquiera), así
 * «chamberi» también encuentra «Chamberí». Da falsos positivos a propósito:
 * la puntuación en memoria, sobre texto normalizado, los descarta.
 */
export function accentInsensitiveLike(term: string): string {
  return `%${term.replace(/[aeiou]/g, '_')}%`
}

/** Patrón LIKE sobre una columna ya normalizada (`knowledge_documents.search_text`). */
export function normalizedLike(term: string): string {
  return `%${term}%`
}

export interface WeightedField {
  text: unknown
  weight: number
}

/** Cuántas veces aparece `term` en `text` (ambos normalizados), con tope. */
function occurrences(text: string, term: string, cap = 3): number {
  let n = 0
  let i = text.indexOf(term)
  while (i >= 0 && n < cap) {
    n++
    i = text.indexOf(term, i + term.length)
  }
  return n
}

/**
 * Puntuación léxica: cada término suma por campo (peso × apariciones, con
 * tope) y se exige cobertura mínima — con tres términos o más, al menos dos
 * tienen que aparecer, para que una coincidencia suelta («lead») no cuente
 * como fuente de una pregunta sobre otra cosa.
 */
export function scoreFields(fields: WeightedField[], terms: string[]): { score: number; matched: number } {
  if (!terms.length) return { score: 0, matched: 0 }
  const normalized = fields.map((f) => ({ text: normalizeText(f.text), weight: f.weight }))
  let score = 0
  let matched = 0
  for (const term of terms) {
    let termScore = 0
    for (const f of normalized) termScore += f.weight * occurrences(f.text, term)
    if (termScore > 0) matched++
    score += termScore
  }
  const needed = terms.length >= 3 ? 2 : 1
  if (matched < needed) return { score: 0, matched }
  return { score: Math.round((score * (matched / terms.length) + matched * 2) * 100) / 100, matched }
}

/** Fragmento alrededor del primer término encontrado, para citarlo. */
export function snippetOf(text: unknown, terms: string[], max = 260): string {
  const raw = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (raw.length <= max) return raw
  const norm = normalizeText(raw)
  let at = -1
  for (const t of terms) {
    const i = norm.indexOf(t)
    if (i >= 0 && (at < 0 || i < at)) at = i
  }
  // La normalización no cambia la longitud de los caracteres latinos comunes
  // (quita marcas combinadas), así que el índice vale sobre el texto original.
  const start = Math.max(0, (at < 0 ? 0 : at) - 80)
  const slice = raw.slice(start, start + max)
  return `${start > 0 ? '…' : ''}${slice}${start + max < raw.length ? '…' : ''}`
}
