import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Contraste de los campos del editor de propiedades (Cola 31): inputs,
 * desplegables y áreas de texto llevan un fondo gris cálido muy claro y un
 * borde algo más marcado que la tarjeta blanca que los contiene, en las 13
 * secciones (web y 2ª mano, al crear y al editar). Es sólo estético y vive en
 * la clase compartida `.pe-input`, que SÓLO usa el editor de propiedades —el
 * resto del panel usa `.input`—, así que el cambio no se filtra a otras
 * pantallas. Se comprueba sobre el CSS para que no se revierta sin querer.
 */
const ROOT = join(import.meta.dirname, '../..')
const css = readFileSync(join(ROOT, 'assets/css/main.css'), 'utf8')

describe('.pe-input: fondo y borde de contraste', () => {
  const peInput = css.slice(css.indexOf('.pe-input {'), css.indexOf('.pe-input['))

  it('el campo lleva fondo gris cálido y borde más marcado (no blanco sobre blanco)', () => {
    expect(peInput).toContain('bg-[#f5f3f0]')
    expect(peInput).toContain('border-[#ddd9d3]')
    // El fondo de partida ya no es blanco; al enfocar sí pasa a blanco para resaltar el campo activo.
    expect(peInput).not.toContain(' bg-white ')
    expect(peInput).toContain('focus:bg-white')
  })

  it('`.input` global (el resto del panel) no se toca: sigue en blanco', () => {
    const input = css.slice(css.indexOf('.input {'), css.indexOf('.label {'))
    expect(input).toContain('bg-white')
  })
})
