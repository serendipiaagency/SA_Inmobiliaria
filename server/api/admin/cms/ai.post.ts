import { and, eq } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'
import { callAI, hasAiKey } from '../../../utils/ai'
import { parseBlocks, blocksToPlainText } from '../../../utils/cms'

export type CmsAiAction =
  | 'generate' | 'rewrite' | 'summarize' | 'expand' | 'correct' | 'translate' | 'tone'
  | 'seo' | 'faq' | 'meta_description' | 'alt_text'
  | 'social_linkedin' | 'social_instagram' | 'social_facebook' | 'social_google_business' | 'social_twitter' | 'social_tiktok'

const SOCIAL_ACTIONS = new Set(['social_linkedin', 'social_instagram', 'social_facebook', 'social_google_business', 'social_twitter', 'social_tiktok'])

const SYSTEM = 'Eres un redactor editorial experto en contenido inmobiliario en español. Escribes con precisión, sin inventar datos que no te den, y devuelves solo el texto pedido, sin comillas ni preámbulos ni explicaciones.'

function buildPrompt(action: CmsAiAction, input: Record<string, any>): { system: string; user: string; maxTokens: number } {
  const text = input.text || ''
  switch (action) {
    case 'generate':
      return {
        system: SYSTEM,
        user: `Escribe un artículo de blog completo en español sobre: "${input.topic}".\nTono: ${input.tone || 'profesional y cercano'}.\nDevuelve el texto en párrafos separados por una línea en blanco, sin títulos markdown ni numeración. Extensión: 4-6 párrafos.`,
        maxTokens: 1400,
      }
    case 'rewrite':
      return { system: SYSTEM, user: `Reescribe el siguiente texto manteniendo el significado pero con otras palabras y mejor fluidez:\n\n${text}`, maxTokens: 900 }
    case 'summarize':
      return { system: SYSTEM, user: `Resume el siguiente texto en 2-3 frases claras:\n\n${text}`, maxTokens: 300 }
    case 'expand':
      return { system: SYSTEM, user: `Expande el siguiente texto añadiendo detalle y ejemplos relevantes, sin inventar datos concretos (precios, cifras, nombres) que no aparezcan ya:\n\n${text}`, maxTokens: 1200 }
    case 'correct':
      return { system: SYSTEM, user: `Corrige la ortografía, gramática y puntuación del siguiente texto sin cambiar su estilo ni contenido:\n\n${text}`, maxTokens: 900 }
    case 'translate':
      return { system: SYSTEM, user: `Traduce el siguiente texto a ${input.targetLanguage === 'en' ? 'inglés' : 'español'}, manteniendo el tono:\n\n${text}`, maxTokens: 1200 }
    case 'tone':
      return { system: SYSTEM, user: `Reescribe el siguiente texto con un tono ${input.targetTone || 'más profesional'}:\n\n${text}`, maxTokens: 900 }
    case 'seo':
      return {
        system: SYSTEM,
        user: `Reescribe el siguiente texto optimizándolo para SEO alrededor de la palabra clave "${input.focusKeyword || ''}", de forma natural (sin repetirla artificialmente), manteniendo el mensaje:\n\n${text}`,
        maxTokens: 1200,
      }
    case 'faq':
      return {
        system: SYSTEM,
        user: `A partir de este contenido, genera 4 preguntas frecuentes con su respuesta breve (2-3 frases), en formato "P: ...\\nR: ...", una por bloque, separadas por una línea en blanco:\n\n${text}`,
        maxTokens: 900,
      }
    case 'meta_description':
      return { system: SYSTEM, user: `Escribe una meta description SEO de máximo 155 caracteres para este contenido:\n\n${text}`, maxTokens: 150 }
    case 'alt_text':
      return {
        system: SYSTEM,
        user: `Escribe un texto ALT descriptivo y breve (máx. 125 caracteres) para una imagen en un artículo sobre esto, basándote en el contexto (no puedes ver la imagen real):\n\n${text}`,
        maxTokens: 100,
      }
    default:
      if (SOCIAL_ACTIONS.has(action)) {
        const platform = action.replace('social_', '')
        const instructions: Record<string, string> = {
          linkedin: 'Escribe un post para LinkedIn, tono profesional, con enfoque de valor/insight, sin hashtags excesivos.',
          instagram: 'Escribe un post para Instagram con emojis y 5 hashtags relevantes al final.',
          facebook: 'Escribe un post para Facebook, cercano, con una pregunta o llamada a la acción.',
          google_business: 'Escribe una actualización breve para Google Business Profile (máx. 300 caracteres).',
          twitter: 'Escribe un post para X/Twitter, máximo 280 caracteres, directo.',
          tiktok: 'Escribe un guion breve (voz en off) para un vídeo de TikTok de 30 segundos sobre este artículo.',
        }
        return { system: SYSTEM, user: `${instructions[platform] || 'Escribe un post de redes sociales.'}\n\nBasado en este artículo:\n\n${text}`, maxTokens: 400 }
      }
      throw createError({ statusCode: 400, statusMessage: `Unknown AI action: ${action}` })
  }
}

/**
 * Editorial AI actions for the Blog & CMS module. Same honesty contract as
 * the rest of the app's AI features: if AI_API_KEY isn't configured, this
 * returns ok:false rather than a fabricated result — there's no rules-based
 * substitute for "rewrite this text" the way there is for property copy.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const body = await readBody<{ action: CmsAiAction; text?: string; articleId?: number } & Record<string, any>>(event)
  if (!body?.action) throw createError({ statusCode: 400, statusMessage: 'Missing action' })

  if (!hasAiKey(event)) {
    return { ok: false, reason: 'ai_not_configured', message: 'La IA editorial no está activada: falta configurar el secreto AI_API_KEY en el Worker.' }
  }

  let text = body.text || ''
  if (!text && body.articleId) {
    const db = useDb(event)
    const rows = await db
      .select({ contentJson: schema.cmsArticles.contentJson, excerpt: schema.cmsArticles.excerpt })
      .from(schema.cmsArticles)
      .where(and(eq(schema.cmsArticles.id, body.articleId), eq(schema.cmsArticles.organizationId, orgId)))
      .limit(1)
    if (rows[0]) text = blocksToPlainText(parseBlocks(rows[0].contentJson)) || rows[0].excerpt || ''
  }

  const { system, user, maxTokens } = buildPrompt(body.action, { ...body, text })
  const result = await callAI(event, system, user, maxTokens)
  if (!result) return { ok: false, reason: 'ai_error', message: 'La IA no pudo generar una respuesta ahora mismo.' }
  return { ok: true, text: result }
})
