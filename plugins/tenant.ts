/**
 * Carga la marca del inquilino (`useTenant()`) ANTES de pintar cualquier
 * página pública. Hasta ahora la cargaban la cabecera y algunas páginas, cada
 * una por su cuenta y en paralelo; con la moneda de la agencia como base de
 * todos los precios (utils/currency.ts, `useCurrency()`), un precio pintado
 * antes de que llegara el inquilino salía en la moneda por defecto y no en la
 * de la agencia. `load()` no repite la petición si ya está hecha, así que el
 * resto de llamadas siguen siendo gratis.
 *
 * El panel no la necesita: su moneda es la de la sesión (`layouts/admin.vue`).
 */
export default defineNuxtPlugin(async () => {
  if (useRequestURL().pathname.startsWith('/admin')) return
  await useTenant().load()
})
