/**
 * Valores por defecto de una propiedad nueva (FASE 25, «defaults
 * inteligentes», bloque N7a). Los calcula el servidor con datos reales
 * (`GET /api/admin/<recurso>?view=defaults`): operación «venta», ubicación
 * exacta, el país y la localidad más habituales del catálogo de la agencia
 * y, si la cuenta está vinculada a un comercial, ese comercial con su
 * oficina y su equipo.
 *
 * Sólo rellena lo que está vacío: nunca pisa algo que ya se haya escrito. Si
 * la petición falla, el alta sigue igual que antes (sin valores por defecto).
 */
export async function applyPropertyDefaults(resource: 'developer-properties' | 'properties', form: Record<string, any>): Promise<void> {
  try {
    const res = await $fetch<{ defaults: Record<string, unknown> }>(`/api/admin/${resource}`, { query: { view: 'defaults' } })
    for (const [key, value] of Object.entries(res.defaults || {})) {
      const current = form[key]
      if ((current === undefined || current === null || current === '') && value !== null && value !== undefined) form[key] = value
    }
  } catch {
    // Sin valores por defecto: el formulario sigue vacío, como antes.
  }
}
