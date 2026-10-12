/** Builds a consistent title + meta description + Open Graph/Twitter block for useHead(). */
/**
 * Cabecera SEO de una página. `origin` permite llamarla desde el getter de un
 * `useHead(() => …)`: ahí no hay instancia de Nuxt (el getter se resuelve al
 * pintar la cabecera) y `useRequestURL()` daría «[nuxt] instance unavailable».
 * Tómalo en el setup (`useRequestURL().origin`) y pásalo.
 */
export function seoHead(opts: { title: string; description: string; image?: string; type?: string; canonical?: string | null; robots?: string | null; origin?: string }) {
  const origin = opts.origin ?? useRequestURL().origin
  const image = opts.image || `${origin}/placeholder.svg`
  const meta = [
    { name: 'description', content: opts.description },
    { property: 'og:title', content: opts.title },
    { property: 'og:description', content: opts.description },
    { property: 'og:image', content: image },
    { property: 'og:type', content: opts.type || 'website' },
    { name: 'twitter:card', content: 'summary_large_image' },
  ]
  if (opts.robots) meta.push({ name: 'robots', content: opts.robots })
  return {
    title: opts.title,
    meta,
    link: opts.canonical ? [{ rel: 'canonical', href: opts.canonical }] : undefined,
  }
}
