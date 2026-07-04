import type { H3Event } from 'h3'

/**
 * AI content engine.
 *
 * If the Worker has an AI_API_KEY (Anthropic) secret, generation uses the
 * Claude Messages API. Otherwise it falls back to a deterministic,
 * rules-based generator that produces useful Spanish copy from the property's
 * own attributes — so every feature works today, and "plugs in" real AI the
 * moment a key is added (no code changes needed).
 */

export type ContentKind =
  | 'title'
  | 'description'
  | 'seo_title'
  | 'meta_description'
  | 'summary'
  | 'instagram'
  | 'facebook'
  | 'linkedin'
  | 'google_ads'
  | 'email'

export const CONTENT_KINDS: { key: ContentKind; label: string }[] = [
  { key: 'title', label: 'Título' },
  { key: 'description', label: 'Descripción' },
  { key: 'seo_title', label: 'SEO title' },
  { key: 'meta_description', label: 'Meta description' },
  { key: 'summary', label: 'Resumen' },
  { key: 'instagram', label: 'Post Instagram' },
  { key: 'facebook', label: 'Post Facebook' },
  { key: 'linkedin', label: 'Post LinkedIn' },
  { key: 'google_ads', label: 'Google Ads' },
  { key: 'email', label: 'Email' },
]

function money(v: number | null | undefined) {
  return v ? `AED ${new Intl.NumberFormat('en-US').format(v)}` : 'precio a consultar'
}

function facts(p: any): string[] {
  const f: string[] = []
  if (p.propertyType) f.push(p.propertyType)
  if (p.bedrooms) f.push(`${p.bedrooms} habitaciones`)
  else if (p.bedrooms === 0) f.push('estudio')
  if (p.bathrooms) f.push(`${p.bathrooms} baños`)
  if (p.area) f.push(`${Math.round(p.area)} m²`)
  if (p.community) f.push(p.community)
  return f
}

function features(p: any): string[] {
  const m: [any, string][] = [
    [p.hasPool, 'piscina'],
    [p.hasGarage, 'garaje'],
    [p.hasTerrace, 'terraza'],
    [p.hasGarden, 'jardín'],
    [p.hasElevator, 'ascensor'],
    [p.accessible, 'accesibilidad'],
  ]
  return m.filter(([v]) => v).map(([, l]) => l)
}

function statusText(s: string) {
  return { new: 'obra nueva', under_construction: 'en construcción', ready: 'lista para entrar a vivir' }[s] || s
}

// --- rules-based fallback ---------------------------------------------------

function fallback(kind: ContentKind, p: any): string {
  const name = p.name
  const price = money(p.price)
  const fx = features(p)
  const fxText = fx.length ? fx.join(', ') : 'acabados de calidad'
  const loc = p.community || 'una ubicación privilegiada'
  const beds = p.bedrooms ? `${p.bedrooms} dormitorios` : 'distribución versátil'
  const area = p.area ? `${Math.round(p.area)} m²` : ''
  const yieldTxt = p.rentalYield ? ` Rentabilidad estimada del ${p.rentalYield}%.` : ''

  switch (kind) {
    case 'title':
      return `${p.propertyType || 'Vivienda'} de ${beds} en ${loc}${area ? ` · ${area}` : ''}`
    case 'seo_title':
      return `${p.propertyType || 'Propiedad'} en ${loc} desde ${price} | SA Inmobiliaria`.slice(0, 60)
    case 'meta_description':
      return `${name}: ${p.propertyType || 'vivienda'} ${statusText(p.status)} en ${loc}. ${fx
        .slice(0, 3)
        .join(', ')}. Desde ${price}.`.slice(0, 155)
    case 'summary':
      return `${name} es ${
        p.propertyType ? `un ${p.propertyType.toLowerCase()}` : 'una propiedad'
      } ${statusText(p.status)} en ${loc}, con ${beds}${area ? ` y ${area}` : ''}. Destaca por ${fxText}.${yieldTxt}`
    case 'description':
      return (
        `Descubre ${name}, ${p.propertyType ? `un ${p.propertyType.toLowerCase()}` : 'una propiedad'} ${statusText(
          p.status,
        )} en ${loc}.\n\n` +
        `Con ${beds}${area ? `, ${area}` : ''} y ${fxText}, ofrece un equilibrio perfecto entre diseño, confort y ubicación. ` +
        `${p.orientation ? `Orientación ${p.orientation}. ` : ''}${
          p.energyRating ? `Calificación energética ${p.energyRating}. ` : ''
        }\n\nPrecio desde ${price}.${yieldTxt} Solicita más información o agenda una visita.`
      )
    case 'instagram':
      return `✨ ${name} ✨\n\n📍 ${loc}\n🏡 ${beds}${area ? ` · ${area}` : ''}\n💫 ${fx
        .slice(0, 3)
        .join(' · ')}\n💰 Desde ${price}\n\n#inmobiliaria #realestate #${(p.community || 'lujo').replace(/\s+/g, '')} #obranueva #inversion`
    case 'facebook':
      return `🏡 ${name} — ${loc}\n\n${beds}${area ? `, ${area}` : ''} con ${fxText}. ${statusText(
        p.status,
      )}. Desde ${price}.${yieldTxt}\n\n👉 Escríbenos para más información o para agendar una visita.`
    case 'linkedin':
      return `Nueva oportunidad de inversión inmobiliaria: ${name} en ${loc}.\n\n${
        p.propertyType || 'Activo residencial'
      } ${statusText(p.status)}, ${beds}${area ? `, ${area}` : ''}.${yieldTxt} Precio desde ${price}.\n\nUna operación con fundamentales sólidos para carteras patrimoniales. Contacta para el dossier completo.`
    case 'google_ads':
      return [
        `${p.propertyType || 'Vivienda'} en ${loc}`.slice(0, 30),
        `Desde ${price}`.slice(0, 30),
        `${fx[0] ? fx[0][0].toUpperCase() + fx[0].slice(1) : 'Calidad premium'} y más`.slice(0, 30),
        `${name} · ${beds}`.slice(0, 90),
        `${statusText(p.status)} en ${loc}. Agenda tu visita hoy.`.slice(0, 90),
      ].join('\n')
    case 'email':
      return (
        `Asunto: ${name} — tu próxima ${p.propertyType ? p.propertyType.toLowerCase() : 'vivienda'} en ${loc}\n\n` +
        `Hola,\n\nQuería presentarte ${name}, ${statusText(p.status)} en ${loc}. ` +
        `Cuenta con ${beds}${area ? `, ${area}` : ''} y ${fxText}, con un precio desde ${price}.${yieldTxt}\n\n` +
        `Si quieres, te envío el dossier completo con planos y plan de pagos, o agendamos una visita cuando te venga bien.\n\nUn saludo,\nEquipo de SA Inmobiliaria`
      )
  }
}

// --- buyer Q&A fallback -----------------------------------------------------

export function fallbackAnswer(question: string, p: any): string {
  const q = question.toLowerCase()
  if (/(luz|luminos|sol)/.test(q)) {
    const sunny = ['S', 'SW', 'SE'].includes(p.orientation)
    return sunny
      ? `Sí. Con orientación ${p.orientation}, recibe luz natural durante gran parte del día, especialmente por la tarde. ${
          p.hasTerrace ? 'La terraza potencia aún más la entrada de luz.' : ''
        }`
      : `Su orientación es ${p.orientation || 'no especificada'}. Recomendamos una visita para valorar la luz en persona; ${
          p.hasTerrace ? 'cuenta con terraza, lo que ayuda a la luminosidad.' : 'las estancias principales están diseñadas para aprovechar la luz disponible.'
        }`
  }
  if (/(invers|rentab|alquil|roi)/.test(q)) {
    return p.rentalYield
      ? `Es una opción interesante para inversión: rentabilidad bruta estimada del ${p.rentalYield}% anual. En ${
          p.community || 'la zona'
        } la demanda de alquiler es sólida, lo que aporta estabilidad a la ocupación.`
      : `${p.community || 'La zona'} tiene buena demanda. Podemos prepararte un análisis de rentabilidad personalizado según tu forma de financiación.`
  }
  if (/(reform|renov|obra)/.test(q)) {
    return p.status === 'ready'
      ? 'Está lista para entrar a vivir, por lo que normalmente no requiere reforma. Una actualización estética ligera rondaría 400–700 AED/m² según acabados.'
      : `Al ser ${statusText(p.status)}, se entrega con acabados nuevos: no necesita reforma. Podrás personalizar materiales dentro de las opciones del promotor.`
  }
  if (/(colegio|escuela|educa)/.test(q)) {
    return `En el entorno de ${p.community || 'la propiedad'} hay colegios internacionales a pocos minutos (aprox. 8 min andando / 3 en coche). Te preparo un mapa con los centros concretos si lo necesitas.`
  }
  if (/(orient|cardinal)/.test(q)) {
    return p.orientation
      ? `La vivienda está orientada al ${p.orientation}. ${
          ['S', 'SW', 'SE'].includes(p.orientation) ? 'Es una orientación muy valorada por la luz y el calor natural.' : ''
        }`
      : 'La orientación no está especificada en la ficha; te la confirmo enseguida.'
  }
  return `Buena pregunta sobre ${p.name}. Te responde un asesor con el detalle exacto; mientras, puedes ver características, plano y plan de pagos en esta misma página.`
}

// --- LLM (optional) ---------------------------------------------------------

async function callClaude(event: H3Event, system: string, user: string): Promise<string | null> {
  const env = (event.context as any).cloudflare?.env || {}
  const key = env.AI_API_KEY
  if (!key) return null
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: env.AI_MODEL || 'claude-3-5-haiku-latest',
        max_tokens: 700,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    })
    if (!res.ok) return null
    const data: any = await res.json()
    return data?.content?.[0]?.text?.trim() || null
  } catch {
    return null
  }
}

function propContext(p: any): string {
  return [
    `Nombre: ${p.name}`,
    `Tipo: ${p.propertyType || '—'}`,
    `Estado: ${statusText(p.status)}`,
    `Precio: ${money(p.price)}`,
    `Dormitorios: ${p.bedrooms ?? '—'}`,
    `Baños: ${p.bathrooms ?? '—'}`,
    `Superficie: ${p.area ? Math.round(p.area) + ' m²' : '—'}`,
    `Zona: ${p.community || '—'}`,
    `Orientación: ${p.orientation || '—'}`,
    `Eficiencia: ${p.energyRating || '—'}`,
    `Rentabilidad: ${p.rentalYield ? p.rentalYield + '%' : '—'}`,
    `Características: ${features(p).join(', ') || '—'}`,
  ].join('\n')
}

const KIND_INSTRUCTIONS: Record<ContentKind, string> = {
  title: 'Genera un título comercial atractivo (máx. 70 caracteres).',
  description: 'Redacta una descripción inmobiliaria persuasiva de 2-3 párrafos.',
  seo_title: 'Genera un SEO title de máximo 60 caracteres.',
  meta_description: 'Genera una meta description de máximo 155 caracteres.',
  summary: 'Redacta un resumen de 2 frases.',
  instagram: 'Escribe un post para Instagram con emojis y 5 hashtags relevantes.',
  facebook: 'Escribe un post para Facebook, cercano y con llamada a la acción.',
  linkedin: 'Escribe un post para LinkedIn con enfoque de inversión, tono profesional.',
  google_ads: 'Genera 3 titulares (máx 30 car.) y 2 descripciones (máx 90 car.), uno por línea.',
  email: 'Redacta un email comercial con asunto y cuerpo, tono cercano y profesional.',
}

export async function generateContent(event: H3Event, kind: ContentKind, p: any): Promise<{ text: string; engine: 'ai' | 'rules' }> {
  const system =
    'Eres un copywriter inmobiliario experto en español. Escribes textos claros, atractivos y honestos, sin exagerar. Devuelve solo el texto pedido, sin comillas ni preámbulos.'
  const user = `${KIND_INSTRUCTIONS[kind]}\n\nDatos de la propiedad:\n${propContext(p)}`
  const ai = await callClaude(event, system, user)
  if (ai) return { text: ai, engine: 'ai' }
  return { text: fallback(kind, p), engine: 'rules' }
}

export async function answerQuestion(event: H3Event, question: string, p: any): Promise<{ text: string; engine: 'ai' | 'rules' }> {
  const system =
    'Eres un asesor inmobiliario honesto en español. Respondes de forma breve (2-4 frases) y útil, basándote solo en los datos disponibles de la propiedad. Si no hay dato, dilo y ofrece confirmarlo.'
  const user = `Pregunta del comprador: "${question}"\n\nDatos de la propiedad:\n${propContext(p)}`
  const ai = await callClaude(event, system, user)
  if (ai) return { text: ai, engine: 'ai' }
  return { text: fallbackAnswer(question, p), engine: 'rules' }
}
