/**
 * Keeps <html lang> and <html dir> in sync with the active locale so Arabic
 * renders right-to-left. Runs on both server and client for correct SSR.
 */
export default defineNuxtPlugin(() => {
  const { locale, currentLocale } = useI18n()
  useHead({
    htmlAttrs: {
      lang: computed(() => locale.value),
      dir: computed(() => currentLocale.value.dir),
    },
  })
})
