import { inArray } from 'drizzle-orm'
import { schema } from './db'
import { agencyCurrencyOrDefault, normalizeCurrency } from '../../utils/currency'

/**
 * La moneda de la agencia en el servidor (regla completa en `utils/currency.ts`).
 *
 * Se guarda en Sistema → Configuración (`settings`, clave `org:<id>:currency`;
 * la agencia 1 conserva además la clave anterior al espacio de nombres, igual
 * que `organizationTimezone()`).
 */

/** El valor que la agencia ELIGIÓ en Configuración, normalizado («EUR»), o null si nunca eligió uno válido. */
export async function organizationCurrencySetting(db: any, orgId: number): Promise<string | null> {
  const keys = [`org:${orgId}:currency`, ...(orgId === 1 ? ['currency'] : [])]
  const rows: Array<{ key: string; value: string | null }> = await db.select({ key: schema.settings.key, value: schema.settings.value }).from(schema.settings).where(inArray(schema.settings.key, keys))
  const namespaced = rows.find((r) => r.key === keys[0])?.value
  const value = namespaced ?? rows.find((r) => r.key === 'currency')?.value ?? null
  return normalizeCurrency(value)
}

/** La moneda con la que se formatean los importes de la agencia: la elegida o, si no eligió ninguna, la de por defecto (AED). */
export async function organizationCurrency(db: any, orgId: number): Promise<string> {
  return agencyCurrencyOrDefault(await organizationCurrencySetting(db, orgId).catch(() => null))
}

/**
 * Moneda por defecto de un registro NUEVO que guarda su propia moneda
 * (oferta, depósito de Stripe), en minúsculas como esas columnas: la que la
 * agencia eligió en Configuración o, si nunca eligió, `eur` — lo que esos
 * registros usaban antes de que existiera el ajuste. Así una agencia sin
 * ajuste no ve cambiar la moneda de sus cobros reales.
 */
export async function defaultRecordCurrency(db: any, orgId: number): Promise<string> {
  const chosen = await organizationCurrencySetting(db, orgId).catch(() => null)
  return (chosen || 'EUR').toLowerCase()
}
