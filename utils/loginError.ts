/**
 * Por qué ha fallado un intento de inicio de sesión, en palabras que ayuden.
 *
 * ## El problema que resuelve
 *
 * Las dos pantallas de login convertían **cualquier** error en «Credenciales
 * inválidas». Para un 401 eso es correcto y deliberado: decir «esa cuenta no
 * existe» permitiría enumerar usuarios. Pero para un 429 del limitador de
 * intentos es sencillamente falso, y falso de la peor manera posible:
 *
 * `server/api/auth/login.post.ts` limita a 10 intentos por IP cada 10
 * minutos. Al intento 11, **incluso la contraseña correcta devuelve 429** —
 * comprobado—. Quien se pasaba del límite veía «Credenciales inválidas»,
 * concluía que se había equivocado, y volvía a intentarlo… renovando el
 * bloqueo y quedándose fuera indefinidamente sin entender por qué.
 *
 * ## Por qué decir esto no filtra nada
 *
 * El límite es **por IP y anterior a cualquier consulta de la cuenta**: se
 * aplica igual con un email que existe que con uno inventado. Contar que hay
 * un bloqueo temporal no dice nada sobre si una cuenta existe ni sobre su
 * contraseña — a diferencia del 401, cuyo mensaje sigue siendo genérico
 * exactamente por ese motivo.
 */

/**
 * Minutos que faltan para poder reintentar, o `null` si el fallo no es un
 * bloqueo por exceso de intentos.
 *
 * Mira los tres sitios donde puede venir el dato porque depende de cómo
 * envuelva el error cada cliente: el cuerpo de la respuesta, el cuerpo crudo
 * de ofetch, y la cabecera `Retry-After` estándar.
 */
export function rateLimitRetryMinutes(err: any): number | null {
  const status = err?.statusCode ?? err?.status ?? err?.response?.status
  if (status !== 429) return null

  const header = err?.response?.headers?.get?.('retry-after')
  const seconds = Number(err?.data?.data?.retryAfterSeconds ?? err?.response?._data?.data?.retryAfterSeconds ?? header ?? 0)

  // Sin un valor utilizable seguimos sabiendo que es un bloqueo: se dice, sin
  // inventarse una cuenta atrás.
  if (!Number.isFinite(seconds) || seconds <= 0) return 0
  return Math.max(1, Math.ceil(seconds / 60))
}

/** El mensaje a enseñar, con «Credenciales inválidas» como caso por defecto. */
export function loginErrorMessage(err: any, fallback = 'Credenciales inválidas'): string {
  const minutes = rateLimitRetryMinutes(err)
  if (minutes === null) return fallback
  const espera = minutes > 0 ? `Vuelve a intentarlo en ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}.` : 'Vuelve a intentarlo en unos minutos.'
  return `Demasiados intentos desde esta conexión. ${espera} No es la contraseña: el bloqueo es temporal y por seguridad.`
}
