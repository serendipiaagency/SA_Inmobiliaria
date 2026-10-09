/**
 * Cuándo recargar la página porque falta un fragmento de JS de un despliegue
 * anterior (plugins/chunk-reload.client.ts).
 */

/** Tiempo durante el que no se vuelve a recargar la misma ruta (evita bucles). */
export const CHUNK_RELOAD_TTL_MS = 60_000

export function shouldReloadOnChunkError({ path, navigating }: { path: string; navigating: boolean }): boolean {
  // En mitad de una navegación ya recarga Nuxt, y lo hace hacia la página de destino.
  if (navigating) return false
  // En el panel, nunca sin que la persona navegue: podría tener cambios sin guardar.
  if (path === '/admin' || path.startsWith('/admin/') || path.startsWith('/admin?')) return false
  return true
}
