# Verificación en dos pasos (TOTP)

Segundo factor opcional por cuenta, por código temporal (RFC 6238 — Google
Authenticator, Authy, 1Password, Bitwarden…), con códigos de recuperación
de un solo uso. Migración `0063_two_factor_auth.sql` (aditiva).

## Por qué

El panel gestiona comisiones, depósitos por Stripe y contratos firmados, y
hasta ahora la contraseña era lo único que lo protegía. Un segundo factor es
la mejora de seguridad con más impacto por esfuerzo: una contraseña filtrada
(reutilizada, adivinada, robada de otro sitio) deja de bastar.

## Cómo funciona

```
/api/auth/login  ── contraseña correcta ──►  ¿users.totp_enabled_at?
                                                │
                                no ─────────────┤─────────── sí
                                │                             │
                          createSession()          login_challenges (token, 5 min, 5 intentos)
                                                              │
                                             /api/auth/totp/verify { challenge, code }
                                                              │
                                              TOTP (±30 s, anti-repetición) o código de recuperación
                                                              │
                                                       createSession()
```

- **La sesión no existe hasta que el segundo factor pasa.** Entre la
  contraseña y el código sólo hay un *desafío* (`login_challenges`): token
  aleatorio del que se guarda el hash, caduca a los 5 minutos, muere a los 5
  intentos fallidos. Un desafío consumido, caducado o inventado responden
  igual.
- **El secreto TOTP se guarda cifrado** (`users.totp_secret` +
  `totp_secret_iv`, AES-GCM con `TOTP_ENCRYPTION_KEY`, `server/utils/encryption.ts`).
  Sin ese secreto del Worker no se puede activar el 2FA — Estado del sistema
  lo dice — y una copia de la base sin él no revela las semillas.
- **Un código sólo vale una vez** (`users.totp_last_used_step`): se guarda el
  paso de 30 s del último código aceptado y no se acepta ninguno de ese paso
  ni anterior, aunque siga en ventana.
- **Códigos de recuperación**: 10 al activar, formato `XXXXX-XXXXX` sin
  caracteres confundibles, sólo el hash en `user_recovery_codes`, un uso cada
  uno. Regenerarlos (con contraseña) invalida los anteriores.
- **Desactivar exige contraseña + código válido**: una sesión abierta en un
  ordenador ajeno no basta para desproteger la cuenta.
- **Auditoría**: activar, desactivar, regenerar códigos y entrar con un
  código de recuperación constan en `admin_audit_log` (a nombre de la propia
  cuenta), sin valores.
- Límites por IP (`rateLimit`): 15/10 min en verify y enable, 10/10 min en
  disable y recovery-codes. El login conserva sus 10/10 min.

## Piezas

| Pieza | Fichero |
| --- | --- |
| TOTP/HOTP, base32, códigos de recuperación (puro) | `server/utils/totp.ts` — probado contra los vectores del RFC 6238 en `test/unit/totp.test.ts` |
| Alta, activación, desafíos, comprobación, desactivación | `server/utils/twoFactor.ts` — `test/unit/twoFactor.test.ts` sobre la base real |
| Endpoints | `server/api/auth/totp/{status,setup,enable,disable,recovery-codes,verify}` |
| Login en dos pasos | `server/api/auth/login.post.ts`, `composables/useAuth.ts`, `components/auth/TotpStep.vue`, `pages/login.vue`, `pages/admin/login.vue` |
| Pantalla de la cuenta | `pages/admin/cuenta.vue` (icono de escudo junto al nombre, abajo en el menú) |
| Extremo a extremo | `tests/e2e/two-factor.spec.ts` — el código lo calcula la prueba con `node:crypto`, no el servidor |

`/admin/cuenta` no tiene área de permisos a propósito (utils/adminNav.ts no
lo lista): un admin restringido a una sola área tiene que poder proteger su
cuenta igual. Los endpoints sólo operan sobre quien llama (`requireUser` +
`user.id`) y están exentos con motivo en `test/unit/tenantScopeCoverage.test.ts`.

## Puesta en marcha

1. `wrangler secret put TOTP_ENCRYPTION_KEY` (producción; `--env staging`
   para staging). Cualquier cadena larga y aleatoria. **No se puede cambiar**
   una vez haya cuentas con 2FA activo sin re-cifrar sus secretos: cambiarla
   dejaría a esas cuentas sin poder entrar (salvo con códigos de
   recuperación, cuyo hash no depende de la clave).
2. Aplicar la migración 0063 (el pipeline lo hace; si `production-preflight`
   sigue saltándose, el workflow "Aplicar migraciones pendientes a producción").
3. Cada persona lo activa desde Mi cuenta. No hay obligatoriedad por rol: es
   una decisión que queda abierta a propósito — obligar al super_admin sin un
   canal de recuperación fuera de la app sería la forma más rápida de dejar
   fuera al propietario.

## Lo que no hace

- No hay SMS ni email como segundo factor: ambos son más débiles que TOTP y
  requerirían un proveedor. Los códigos de recuperación cubren el "he perdido
  el teléfono".
- No hay "recordar este dispositivo". Se pide el código en cada login.
- No hay WebAuthn/llaves físicas. Es la siguiente mejora natural si hace
  falta; el flujo de desafío de aquí le sirve tal cual.
