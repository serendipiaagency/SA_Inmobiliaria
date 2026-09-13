-- Migration number: 0061    Transición compatible del fail-open de users.permissions (bloque 01)
--
-- Hasta ahora, utils/permissions.ts colapsaba TRES situaciones distintas en
-- una sola respuesta ("sin restricción, acceso total"):
--
--   1. permissions IS NULL            -> intención real: cuenta sin restringir.
--   2. permissions = '' o '[]'        -> lista vacía: la forma natural de
--                                        decir "este admin no puede nada",
--                                        que en cambio concedía acceso TOTAL.
--   3. permissions = JSON inválido    -> configuración corrupta o truncada,
--                                        que también concedía acceso total.
--
-- A partir de este bloque, (2) y (3) deniegan por defecto. Ese cambio de
-- semántica es precisamente lo que no se puede aplicar "de golpe" sobre
-- cuentas históricas: una fila que hoy funciona como acceso total dejaría de
-- funcionar en el mismo despliegue, sin aviso y sin forma de entrar a
-- arreglarla desde el panel.
--
-- Esta migración es esa transición. Normaliza a NULL exactamente las filas
-- que HOY significan "sin restricción" por las vías (2) y (3). NULL sigue
-- significando lo mismo que significaban antes, así que ninguna cuenta
-- existente cambia de comportamiento al desplegar. Desde este punto, un '['
-- vacío o un JSON roto sólo puede llegar a la columna después del cambio de
-- código, y ahí sí es una denegación deliberada o un error real que debe
-- fallar cerrado.
--
-- Las filas con un array JSON no vacío (restricciones reales, incluidas las
-- que sólo contienen entradas no-string como [1,2], que ya denegaban todo)
-- se dejan intactas.
--
-- Aditiva y no destructiva: no toca el esquema, no borra filas, no elimina
-- información de permisos concedidos. Idempotente: una segunda ejecución no
-- encuentra ninguna fila que cumpla la condición y no hace nada.
--
-- Reversión: no requiere una migración inversa. Revertir el código a la
-- semántica anterior (fail-open) restablece el comportamiento exacto de
-- antes, porque estas filas ya se interpretaban como "sin restricción".

UPDATE users
SET permissions = NULL
WHERE permissions IS NOT NULL
  -- CASE (no OR) porque SQLite evalúa CASE secuencialmente: json_type() y
  -- json_array_length() lanzan "malformed JSON" si se les pasa un valor no
  -- válido, así que hay que descartar ese caso antes de llamarlas.
  AND CASE
        WHEN TRIM(permissions) = '' THEN 1
        WHEN json_valid(permissions) = 0 THEN 1
        WHEN json_type(permissions) <> 'array' THEN 1
        WHEN json_array_length(permissions) = 0 THEN 1
        ELSE 0
      END = 1;
