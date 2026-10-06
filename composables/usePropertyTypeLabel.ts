import { PROPERTY_TYPE_LABELS, propertyTypeI18nKey } from '~/utils/propertySheet'

/**
 * Rótulo de un tipo de inmueble en la WEB PÚBLICA, en el idioma del
 * visitante: el catálogo común (utils/propertySheet.ts) con su traducción
 * (`filters.type.*`); en castellano, la etiqueta del catálogo («Piso»,
 * «Chalet»…). Nunca la clave interna en inglés que se guarda en la ficha.
 */
export function usePropertyTypeLabel() {
  const { t } = useI18n()
  return (type: string | null | undefined): string => (type ? t(propertyTypeI18nKey(type), PROPERTY_TYPE_LABELS[type] || type) : '')
}
