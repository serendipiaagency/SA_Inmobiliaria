import { brandThemeCss, brandFontsHref } from '~/utils/brandTheme'

/**
 * Inyecta en el <head> de la web pública el tema de marca (Brand Kit, Cola 22):
 * las variables de color y las tipografías POR DEFECTO, más el <link> de Google
 * Fonts de las familias de marca. Lo llaman los layouts públicos (default.vue y
 * root.vue), nunca el panel (admin.vue), así que el panel no se ve afectado.
 *
 * Las fuentes van sin !important (utils/brandTheme.ts), de modo que lo que una
 * página fije en el Constructor (globalStyles, con !important) siempre gana: el
 * Brand Kit sólo rellena el valor por defecto. El <style> recibe el nonce de la
 * CSP en el SSR (server/plugins/csp-nonce.ts estampa toda etiqueta de la
 * cabecera). fonts.googleapis.com ya está en style-src de la CSP.
 */
export function useBrandThemeHead() {
  const { tenant } = useTenant()
  useHead(
    computed(() => {
      const brand = tenant.value?.brand
      const css = brandThemeCss(brand)
      const href = brandFontsHref(brand)
      return {
        style: css ? [{ innerHTML: css }] : [],
        link: href ? [{ rel: 'stylesheet', href }] : [],
      }
    }),
  )
}
