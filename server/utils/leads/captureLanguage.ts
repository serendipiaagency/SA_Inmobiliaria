import { getCookie, type H3Event } from 'h3'
import { normalizeLanguage, type LanguageCode } from '../../../utils/crmCatalog'

/**
 * Idioma de un lead que entra por la web pública (cierre del núcleo,
 * FASE 15). Hasta ahora sólo lo rellenaba el alta manual, así que la regla de
 * enrutado «Idioma» no se aplicaba nunca a un lead entrante.
 *
 * Por orden:
 *   1. el que manda el formulario (`language`): el idioma que la persona
 *      eligió en el selector de la web o, si no eligió ninguno, el de su
 *      navegador (composables/useVisitorLanguage.ts);
 *   2. si el envío no lo trae, el del selector de la web (cookie `locale`),
 *      pero SÓLO si la persona lo eligió (cookie `locale_chosen`): la cookie
 *      `locale` existe siempre con «es» por defecto (composables/useI18n.ts)
 *      y tomarla tal cual marcaría como hispanohablante a todo el mundo.
 *
 * Siempre normalizado al catálogo (`LANGUAGE_OPTIONS`); un idioma fuera del
 * catálogo se queda en NULL — el formulario de un visitante nunca falla por
 * el idioma de su navegador. El servidor no adivina por `Accept-Language`.
 */
export function publicLeadLanguage(event: H3Event, raw: unknown): LanguageCode | null {
  const sent = normalizeLanguage(raw)
  if (sent) return sent
  if (getCookie(event, 'locale_chosen') !== '1') return null
  return normalizeLanguage(getCookie(event, 'locale'))
}
