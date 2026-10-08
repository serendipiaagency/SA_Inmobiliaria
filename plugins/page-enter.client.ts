import type { VNode } from 'vue'

/**
 * El fundido al cambiar de página (#106), sin `<Transition>`.
 *
 * Antes era `app.pageTransition: { name: 'page', mode: 'out-in' }`. Vue tiene
 * un fallo con `<Transition mode="out-in">` alrededor del `<Suspense>` de las
 * páginas: si se navega a otra mientras la actual está entrando — con su
 * `setup` asíncrono pendiente (un `await useFetch` sin responder) o con la
 * anterior todavía saliendo —, la página nueva no llega a montarse nunca y el
 * contenido se queda en blanco hasta recargar. En local la API responde en
 * milisegundos y no se ve; en producción bastaba con pulsar dos entradas del
 * menú seguidas (Oficinas → Equipos → Propiedades (web)), y en la web pública
 * con ir a otra página antes de que cargara el catálogo. Quitar la transición
 * sólo en esas navegaciones no basta: cambiar el árbol de `<Transition>` a
 * mitad de una navegación rompe el `<Suspense>` igual.
 *
 * Así que no hay `<Transition>` (nuxt.config.ts → `pageTransition: false`) y
 * el mismo fundido (opacidad y 6 px hacia arriba, 0,22 s) se hace aquí, con
 * Web Animations, sobre la página ya montada (`page:finish`). Nada de esto
 * toca el `<Suspense>`, así que no puede dejar una página sin montar.
 * Prueba: tests/e2e/panel-navegacion-rapida.spec.ts.
 */

const ELEMENT = 1
const TELEPORT = 64

/** Los elementos raíz de una página: uno, o varios si su plantilla es un fragmento. */
function rootElements(vnode: VNode | null | undefined): HTMLElement[] {
  if (!vnode) return []
  if (vnode.component) return rootElements(vnode.component.subTree)
  if (vnode.shapeFlag & TELEPORT) return []
  if (vnode.shapeFlag & ELEMENT) return vnode.el instanceof HTMLElement ? [vnode.el] : []
  return Array.isArray(vnode.children) ? (vnode.children as VNode[]).flatMap(rootElements) : []
}

export default defineNuxtPlugin((nuxtApp) => {
  const router = useRouter()
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  // La primera página llega ya pintada del servidor: no se anima.
  let first = true

  nuxtApp.hook('page:finish', () => {
    if (first || nuxtApp.isHydrating) {
      first = false
      return
    }
    const route = router.currentRoute.value
    // Una página puede pedir que no haya transición (pages/embed.vue).
    if (route.meta.pageTransition === false || reduced.matches) return
    const page = route.matched[0]?.instances.default
    for (const el of rootElements(page?.$.subTree)) {
      el.animate(
        [
          { opacity: 0, transform: 'translateY(6px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      )
    }
  })
})
