/** Builds a consistent title + meta description + Open Graph/Twitter block for useHead(). */
export function seoHead(opts: { title: string; description: string; image?: string; type?: string }) {
  const requestUrl = useRequestURL()
  const image = opts.image || `${requestUrl.origin}/placeholder.svg`
  return {
    title: opts.title,
    meta: [
      { name: 'description', content: opts.description },
      { property: 'og:title', content: opts.title },
      { property: 'og:description', content: opts.description },
      { property: 'og:image', content: image },
      { property: 'og:type', content: opts.type || 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }
}
