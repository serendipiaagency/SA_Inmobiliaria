/**
 * Formato en línea de los bloques de texto del CMS (párrafos, avisos,
 * respuestas de FAQ): enlaces `[texto](url)` y negritas `**texto**`. El texto
 * se escapa SIEMPRE antes de interpretar las marcas, así que un contenido con
 * `<script>` se enseña literal; sólo se generan `<a>` y `<strong>`.
 *
 * Las URL admitidas son relativas (`/blog/...`, `#ancla`), `http(s)://` o
 * `mailto:`. Cualquier otra (javascript:, data:) se deja como texto.
 */
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export function escapeHtml(text: string): string {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ESC[c] || c)
}

const SAFE_URL = /^(\/(?!\/)|#|https?:\/\/|mailto:)/

export function renderInline(text: string): string {
  let html = escapeHtml(text)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, url: string) => {
    if (!SAFE_URL.test(url)) return match
    const external = /^https?:\/\//.test(url)
    const attrs = external ? ' target="_blank" rel="noopener"' : ''
    return `<a href="${url}" class="cms-link"${attrs}>${label}</a>`
  })
  return html
}

/** Texto plano sin marcas: para recuentos de palabras, búsquedas y extractos. */
export function stripInline(text: string): string {
  return String(text ?? '')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
}

/** Enlaces internos y externos que contiene un texto con marcas en línea. */
export function inlineLinks(text: string): string[] {
  const out: string[] = []
  for (const m of String(text ?? '').matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)) out.push(m[1])
  return out
}
