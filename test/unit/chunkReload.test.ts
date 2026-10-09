import { describe, it, expect } from 'vitest'
import { shouldReloadOnChunkError, CHUNK_RELOAD_TTL_MS } from '../../utils/chunkReload'

describe('recarga por fragmentos de un despliegue anterior', () => {
  it('recarga la web pública fuera de una navegación', () => {
    expect(shouldReloadOnChunkError({ path: '/propiedades/piso-centro', navigating: false })).toBe(true)
    expect(shouldReloadOnChunkError({ path: '/', navigating: false })).toBe(true)
    expect(shouldReloadOnChunkError({ path: '/administracion-de-fincas', navigating: false })).toBe(true)
  })

  it('en mitad de una navegación la recarga es de Nuxt, hacia el destino', () => {
    expect(shouldReloadOnChunkError({ path: '/propiedades', navigating: true })).toBe(false)
  })

  it('en el panel nunca recarga sola', () => {
    expect(shouldReloadOnChunkError({ path: '/admin', navigating: false })).toBe(false)
    expect(shouldReloadOnChunkError({ path: '/admin/site-builder', navigating: false })).toBe(false)
    expect(shouldReloadOnChunkError({ path: '/admin?x=1', navigating: false })).toBe(false)
  })

  it('no repite la recarga de la misma ruta en un minuto', () => {
    expect(CHUNK_RELOAD_TTL_MS).toBe(60_000)
  })
})
