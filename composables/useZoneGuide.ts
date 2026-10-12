/**
 * Carga la guía de una zona (/api/public/zones/<ruta>) y monta su cabecera
 * SEO: título y descripción propios o derivados, canonical, Open Graph con la
 * foto de la zona y BreadcrumbList con las migas reales. 404 si no existe o
 * no está publicada.
 */
export async function useZoneGuide(segments: string[]) {
  const path = segments.map((s) => encodeURIComponent(s)).join('/')
  // Todo lo que necesita la instancia de Nuxt (origen de la petición, marca,
  // cabecera) se toma ANTES del primer `await`: dentro de un composable el
  // compilador no conserva el contexto tras un await y en el servidor
  // `useRequestURL`/`useHead` fallarían con «nuxt instance unavailable» (500).
  const origin = useRequestURL().origin
  const { tenant, load } = useTenant()
  const loading = load()
  const asyncData = useFetch<any>(`/api/public/zones/${path}`)
  const { data } = asyncData
  const brand = computed(() => tenant.value?.companyName || tenant.value?.name || '')
  useHead(() => {
    const z = data.value?.zone
    if (!z) return {}
    const canonical = `${origin}${z.path}`
    const image = z.image ? (mediaUrl(z.image).startsWith('http') ? mediaUrl(z.image) : `${origin}${mediaUrl(z.image)}`) : undefined
    const parentName = z.parent?.name ? `, ${z.parent.name}` : ''
    const base = seoHead({
      origin,
      title: z.seoTitle || `Vivir en ${z.name}${parentName}: guía de la zona — ${brand.value}`,
      description: z.seoDescription || (z.intro ? String(z.intro).replace(/\s+/g, ' ').slice(0, 155) : `Cómo es vivir en ${z.name}${parentName}: barrios, servicios y viviendas disponibles.`),
      image,
      canonical,
    })
    const crumbs = [{ name: 'Inicio', item: `${origin}/` }, ...(data.value.breadcrumbs || []).map((c: any) => ({ name: c.name, item: `${origin}${c.path}` }))]
    return {
      ...base,
      script: [
        {
          type: 'application/ld+json',
          innerHTML: JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })) }),
        },
      ],
    }
  })
  await Promise.all([asyncData, loading])
  if (!data.value) throw createError({ statusCode: 404, statusMessage: 'Zona no encontrada', fatal: true })
  return { data }
}
