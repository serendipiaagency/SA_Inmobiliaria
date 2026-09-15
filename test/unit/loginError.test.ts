import { describe, expect, it } from 'vitest'
import { loginErrorMessage, rateLimitRetryMinutes } from '../../utils/loginError'

/**
 * El login limita a 10 intentos por IP cada 10 minutos, y al intento 11
 * **incluso la contraseña correcta devuelve 429**. Las dos pantallas
 * convertían eso en «Credenciales inválidas», así que quien se pasaba del
 * límite concluía que se había equivocado de contraseña y volvía a
 * intentarlo — renovando el bloqueo y quedándose fuera sin entender por qué.
 *
 * Esto cubre que el mensaje vuelva a decir la verdad, y que siga sin decir de
 * más en el caso del 401.
 */

describe('rateLimitRetryMinutes', () => {
  it('lee los segundos del cuerpo de la respuesta', () => {
    expect(rateLimitRetryMinutes({ statusCode: 429, data: { data: { retryAfterSeconds: 300 } } })).toBe(5)
  })

  it('lee el cuerpo crudo de ofetch', () => {
    expect(rateLimitRetryMinutes({ status: 429, response: { status: 429, _data: { data: { retryAfterSeconds: 120 } } } })).toBe(2)
  })

  it('lee la cabecera Retry-After estándar', () => {
    const err = { response: { status: 429, headers: new Map([['retry-after', '60']]) } }
    // `new Map` imita la API de Headers lo justo para esto (.get).
    expect(rateLimitRetryMinutes({ ...err, response: { ...err.response, headers: { get: (k: string) => (k === 'retry-after' ? '60' : null) } } })).toBe(1)
  })

  it('redondea hacia arriba: 61 segundos son 2 minutos, no 1', () => {
    // Decir "1 minuto" cuando falta más lleva a reintentar antes de tiempo, y
    // cada reintento vuelve a contar contra el límite.
    expect(rateLimitRetryMinutes({ statusCode: 429, data: { data: { retryAfterSeconds: 61 } } })).toBe(2)
  })

  it('devuelve 0 —bloqueado, duración desconocida— si el dato no es utilizable', () => {
    // Sigue siendo un bloqueo aunque no sepamos cuánto queda: lo que no puede
    // hacer es disfrazarse de contraseña incorrecta.
    expect(rateLimitRetryMinutes({ statusCode: 429 })).toBe(0)
    expect(rateLimitRetryMinutes({ statusCode: 429, data: { data: { retryAfterSeconds: 'no' } } })).toBe(0)
  })

  it('devuelve null para cualquier cosa que no sea un 429', () => {
    expect(rateLimitRetryMinutes({ statusCode: 401 })).toBeNull()
    expect(rateLimitRetryMinutes({ statusCode: 422 })).toBeNull()
    expect(rateLimitRetryMinutes(new Error('sin red'))).toBeNull()
    expect(rateLimitRetryMinutes(undefined)).toBeNull()
  })
})

describe('loginErrorMessage', () => {
  it('un 401 sigue siendo genérico — no se puede enumerar cuentas', () => {
    // Esta parte no cambia: decir "esa cuenta no existe" permitiría averiguar
    // qué emails están dados de alta.
    expect(loginErrorMessage({ statusCode: 401 })).toBe('Credenciales inválidas')
    expect(loginErrorMessage({ statusCode: 401 }, 'Invalid credentials')).toBe('Invalid credentials')
  })

  it('un 429 dice que es un bloqueo temporal, cuánto queda, y que no es la contraseña', () => {
    const msg = loginErrorMessage({ statusCode: 429, data: { data: { retryAfterSeconds: 300 } } })
    expect(msg).toContain('5 minutos')
    expect(msg).toContain('No es la contraseña')
  })

  it('concuerda el singular', () => {
    expect(loginErrorMessage({ statusCode: 429, data: { data: { retryAfterSeconds: 30 } } })).toContain('1 minuto.')
  })

  it('sin duración conocida sigue diciendo que es un bloqueo', () => {
    const msg = loginErrorMessage({ statusCode: 429 })
    expect(msg).toContain('Demasiados intentos')
    expect(msg).not.toContain('NaN')
  })
})
