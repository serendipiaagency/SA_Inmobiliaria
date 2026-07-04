// Scroll-reveal directive: v-reveal adds .is-visible when the element enters the viewport.
// Universal plugin (SSR-safe via getSSRProps); the observer only runs on the client.
export default defineNuxtPlugin((nuxtApp) => {
  let io: IntersectionObserver | null = null
  if (import.meta.client && typeof IntersectionObserver !== 'undefined') {
    io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible')
            io!.unobserve(e.target)
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    )
  }

  nuxtApp.vueApp.directive('reveal', {
    getSSRProps() {
      return {}
    },
    mounted(el: HTMLElement, binding) {
      el.classList.add('reveal')
      if (binding.value) el.style.transitionDelay = `${binding.value}ms`
      if (io) io.observe(el)
      else el.classList.add('is-visible')
    },
    unmounted(el: HTMLElement) {
      io?.unobserve(el)
    },
  })
})
