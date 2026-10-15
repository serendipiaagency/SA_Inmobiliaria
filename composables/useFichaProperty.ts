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

/** En el lienzo del Constructor, la propiedad elegida en «Previsualizar con» (pages/admin/site-builder/canvas.vue); null, la más reciente. */
export const FICHA_SAMPLE_ID_KEY: InjectionKey<Ref<number | null>> = Symbol('ficha-sample-id')

const inFlight = new Map<string, Promise<FichaSample>>()
const EMPTY: FichaSample = { brandColor: null, property: null }

/**
 * En el Constructor (lienzo y Vista previa), la propiedad de ejemplo de la
 * página «Ficha de propiedad» (/api/admin/site-pages/ficha-sample): la misma
 * respuesta que su ficha pública. La más reciente de la empresa o, con
 * «Previsualizar con», la elegida (siempre de la misma empresa: el servidor
 * no sirve otra). Una sola petición por propiedad, aunque la pidan la zona
 * dinámica y varias secciones a la vez; al cambiar la elegida se vuelve a
 * pedir. Una elegida que ya no existe cae a la más reciente.
 */
export function useFichaSample() {
  const wanted = inject(FICHA_SAMPLE_ID_KEY, null)
  const sample = useState<FichaSample | null>('ficha-sample', () => null)
  const sampleKey = useState<string>('ficha-sample-key', () => '')
  const loading = ref(!sample.value)

  function request(id: number | null): Promise<FichaSample> {
    const key = String(id ?? 'latest')
    let p = inFlight.get(key)
    if (!p) {
      p = $fetch<FichaSample>('/api/admin/site-pages/ficha-sample', { query: id === null ? {} : { propertyId: id } })
        .catch(() => (id === null ? EMPTY : $fetch<FichaSample>('/api/admin/site-pages/ficha-sample').catch(() => EMPTY)))
        .finally(() => inFlight.delete(key))
      inFlight.set(key, p)
    }
    return p
  }
  async function load() {
    const id = wanted?.value ?? null
    const key = String(id ?? 'latest')
    if (sample.value && sampleKey.value === key) {
      loading.value = false
      return
    }
    loading.value = !sample.value
    const result = await request(id)
    // Si mientras tanto se eligió otra, esta respuesta ya no vale.
    if (String(wanted?.value ?? 'latest') !== key) return
    sample.value = result
    sampleKey.value = key
    loading.value = false
  }
  onMounted(load)
  if (wanted) watch(wanted, load)
  return { sample, loading }
}
