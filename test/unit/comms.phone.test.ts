import { describe, expect, it } from 'vitest'
import { formatPhone, normalizePhone, phoneTail, phoneToWaId, waIdToPhone, whatsappClickToChatUrl } from '../../server/utils/comms/phone'

describe('normalizePhone', () => {
  it('reduce cualquier formato humano a +E.164', () => {
    expect(normalizePhone('+34 600 11 22 33')).toBe('+34600112233')
    expect(normalizePhone('0034-600112233')).toBe('+34600112233')
    expect(normalizePhone('whatsapp:+971501234567')).toBe('+971501234567')
    expect(normalizePhone('tel:+34600112233')).toBe('+34600112233')
    expect(normalizePhone('(+34) 600.112.233')).toBe('+34600112233')
  })

  it('un wa_id de Meta (sin "+", con país) se acepta sólo cuando no hay prefijo por defecto', () => {
    expect(normalizePhone('34600112233')).toBe('+34600112233')
    // Con prefijo por defecto, lo que llega sin "+" es un número local.
    expect(normalizePhone('600112233', '+34')).toBe('+34600112233')
    expect(normalizePhone('0600112233', '+34')).toBe('+34600112233')
  })

  it('rechaza lo que no es un teléfono, y un local sin prefijo por defecto', () => {
    expect(normalizePhone('600112233')).toBeNull()
    expect(normalizePhone('abc')).toBeNull()
    expect(normalizePhone('+1')).toBeNull()
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone(null)).toBeNull()
    expect(normalizePhone('600112233', '34')).toBeNull() // prefijo mal escrito
  })
})

describe('wa_id ↔ teléfono', () => {
  it('convierte en las dos direcciones', () => {
    expect(phoneToWaId('+34600112233')).toBe('34600112233')
    expect(waIdToPhone('34600112233')).toBe('+34600112233')
    expect(waIdToPhone(undefined)).toBeNull()
  })
  it('la cola de 9 dígitos sirve para el LIKE del cruce', () => {
    expect(phoneTail('+34 600 11 22 33')).toBe('600112233')
    expect(phoneTail('600112233')).toBe('600112233')
  })
})

describe('presentación', () => {
  it('formatea para leer, nunca para guardar', () => {
    expect(formatPhone('+34600112233')).toBe('+34 600 112 233')
    expect(formatPhone(null)).toBe('')
  })
  it('el enlace click-to-chat es el oficial wa.me', () => {
    expect(whatsappClickToChatUrl('+34600112233')).toBe('https://wa.me/34600112233')
    expect(whatsappClickToChatUrl('+34600112233', 'Hola, ¿qué tal?')).toBe('https://wa.me/34600112233?text=Hola%2C%20%C2%BFqu%C3%A9%20tal%3F')
  })
})
