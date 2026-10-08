import type { PublishedSitePage } from '~/server/utils/sitePages'
import { PAGE_CORE_TYPE } from '~/utils/siteBuilder/pages'

/**
 * La versión publicada en el Constructor Web de una página de la web
 * (utils/siteBuilder/pages.ts), para la empresa que se visita.
 *
 * `published` es false mientras la página no tenga una versión publicada:
 * entonces la página enseña su contenido de siempre (components/site/
 * SitePageLayout.vue). Si la lectura falla, igual — la web nunca se queda en
 * blanco por el Constructor.
 *
 * Los datos de las secciones dinámicas (propiedades, comunidades, artículos,
 * equipo) se piden sólo si la página publicada tiene alguna sección además
 * de su zona dinámica.
 *
 * Una sola espera, a propósito: esto es un composable y no el `<script
 * setup>` de una página, así que tras un primer `await` Nuxt ya no tiene su
 * instancia a mano y un segundo `useFetch` fallaría («[nuxt] instance
 * unavailable», un 500 en toda la página). `useRequestFetch()` se toma antes
 * de esperar: en el servidor reenvía las cabeceras de la visita (el dominio,
 * que decide la empresa, y la cookie de la vista previa).
 */
export async function useSitePage(pageKey: string) {
  const fetcher = useRequestFetch()
  const { data } = await useAsyncData(`site-page:${pageKey}`, async () => {
    const page = await fetcher<PublishedSitePage>(`/api/public/site-pages/${pageKey}`).catch(() => null)
    const hasSections = !!page?.published && (page.blocks || []).some((b) => b.type !== PAGE_CORE_TYPE)
    const homeData = hasSections ? await fetcher<any>('/api/public/home').catch(() => null) : null
    return { page, homeData }
  })
  const page = computed(() => data.value?.page ?? null)
  const published = computed(() => page.value?.published === true)
  const homeData = computed(() => data.value?.homeData ?? null)
  return { page, published, homeData }
}
