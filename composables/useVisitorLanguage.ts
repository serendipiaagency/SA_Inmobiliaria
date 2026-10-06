import { normalizeLanguage } from '~/utils/crmCatalog'

/**
 * El idioma de quien escribe por un formulario de la web pública (cierre del
 * núcleo, FASE 15), para que el lead llegue con `language` y la regla de
 * enrutado «Idioma» se aplique a los leads entrantes:
 *
 *   1. el que eligió en el selector de idioma de la web;
 *   2. si no eligió ninguno, el de su navegador (`navigator.languages`);
 *   3. si no, el idioma en el que se le está enseñando la web.
 *
 * Devuelve el código del catálogo de idiomas del CRM (es, en, fr…) o null. El
 * servidor lo vuelve a normalizar (server/utils/leads/captureLanguage.ts): esto
 * sólo decide qué se manda.
 */
export function useVisitorLanguage() {
  const { locale, localeChosen } = useI18n()
  return function visitorLanguage(): string | null {
    if (localeChosen.value) return normalizeLanguage(locale.value)
    if (import.meta.client && typeof navigator !== 'undefined') {
      const candidates = [...(navigator.languages || []), navigator.language]
      for (const c of candidates) {
        const code = normalizeLanguage(c)
        if (code) return code
      }
    }
    return normalizeLanguage(locale.value)
  }
}
