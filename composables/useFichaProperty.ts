import type { InjectionKey, Ref } from 'vue'
import type { FichaPayload } from '~/utils/fichaVisibility'

/**
 * La propiedad de la ficha que se está viendo, para las secciones del
 * Constructor Web que se colocan encima o debajo de su zona dinámica (el
 * bloque «Eficiencia energética»): la provee pages/propiedades/[slug].vue
 * con lo mismo que pinta la ficha. Fuera de una ficha no hay propiedad.
 */
export const FICHA_PROPERTY_KEY: InjectionKey<Ref<FichaPayload | null>> = Symbol('ficha-property')

/** En el lienzo del Constructor, la página que se está editando (pages/admin/site-builder/canvas.vue). */
export const SITE_CANVAS_PAGE_KEY: InjectionKey<Ref<string>> = Symbol('site-canvas-page')

export interface FichaSample {
  brandColor: string | null
  property: (FichaPayload & Record<string, any>) | null
}

let inFlight: Promise<FichaSample> | null = null

/**
 * En el Constructor (lienzo y Vista previa), la propiedad de ejemplo de la
 * página «Ficha de propiedad» (/api/admin/site-pages/ficha-sample): la misma
 * respuesta que su ficha pública. Una sola petición por carga del lienzo,
 * aunque la pidan la zona dinámica y varias secciones a la vez.
 */
export function useFichaSample() {
  const sample = useState<FichaSample | null>('ficha-sample', () => null)
  const loading = ref(!sample.value)
  onMounted(async () => {
    if (sample.value) return
    inFlight ||= $fetch<FichaSample>('/api/admin/site-pages/ficha-sample').catch(() => ({ brandColor: null, property: null }))
    sample.value = await inFlight
    loading.value = false
  })
  return { sample, loading }
}
