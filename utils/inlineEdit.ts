/**
 * Edición inline desde la fila de un listado (cierre C1, FASE 25) — lo que
 * no depende del componente (`components/admin/InlineEdit.vue`) y se puede
 * probar sin navegador: leer un número escrito a la española y validar un
 * precio igual que lo valida el servidor (`[resource]/[id].put.ts`).
 */

/** Tope de cordura de un precio escrito a mano: más que esto es casi seguro una tecla de más. */
export const INLINE_PRICE_MAX = 1_000_000_000

/**
 * Número escrito por una persona: «450000», «450.000», «450.000,50»,
 * «450000.5», «1 250 000 €», «1.250.000 AED». `null` si está vacío o no es
 * un número. Se ignora la moneda que se escriba (símbolo o código de las que
 * conoce la plataforma, utils/currency.ts): el precio se guarda en la de la
 * agencia, no se convierte.
 * Un punto seguido de exactamente tres cifras se lee como separador de
 * miles (formato español), nunca como decimal.
 */
export function parseInlineNumber(raw: string | null | undefined): number | null {
  let s = String(raw ?? '')
    .replace(/AED|EUR|USD|GBP|CNY|US\$/gi, '')
    .replace(/[\s\u00a0€$£¥]/g, '')
    .trim()
  if (!s) return null
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.')
  else if (/^-?\d+(,\d+)?$/.test(s)) s = s.replace(',', '.')
  else if (!/^-?\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Mensaje de error del precio, o null si vale. Vacío no vale desde la fila: para quitar el precio está el editor. */
export function validateInlinePrice(value: string | number | null): string | null {
  if (value === null || value === '') return 'Indica un precio'
  const n = typeof value === 'number' ? value : parseInlineNumber(value)
  if (n === null) return 'Escribe un número (p. ej. 450000 o 450.000)'
  if (n < 0) return 'El precio no puede ser negativo'
  if (n > INLINE_PRICE_MAX) return 'Ese precio parece demasiado alto: revisa las cifras'
  return null
}
