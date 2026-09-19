-- Migration number: 0063    Segundo factor (TOTP) para las cuentas
--
-- El panel gestiona comisiones, depósitos por Stripe y contratos firmados
-- protegidos hasta ahora sólo por contraseña. Esto añade un segundo factor
-- por código temporal (TOTP, el de Google Authenticator y similares),
-- opcional por cuenta, con códigos de recuperación de un solo uso.
--
-- Tres piezas:
--
--   users.totp_*            el secreto (CIFRADO con TOTP_ENCRYPTION_KEY,
--                           nunca en claro), cuándo se activó (NULL = no
--                           activo; un secreto con enabled_at NULL es un
--                           alta a medias que todavía no protege nada) y el
--                           último paso de tiempo aceptado, para que un
--                           código no valga dos veces.
--   user_recovery_codes     un hash SHA-256 por código; el código en claro
--                           sólo existe en la pantalla que lo enseña.
--   login_challenges        el "primer paso superado" entre la contraseña y
--                           el código: la sesión NO se crea hasta que el
--                           segundo factor pasa. Caduca en minutos y lleva
--                           su propio contador de intentos.
--
-- Aditiva: columnas NULL nuevas y dos tablas nuevas. Ninguna cuenta cambia
-- de comportamiento al desplegar: nadie tiene 2FA hasta que lo activa.

ALTER TABLE users ADD COLUMN totp_secret TEXT;
ALTER TABLE users ADD COLUMN totp_secret_iv TEXT;
ALTER TABLE users ADD COLUMN totp_enabled_at TEXT;
ALTER TABLE users ADD COLUMN totp_last_used_step INTEGER;

CREATE TABLE user_recovery_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX user_recovery_codes_user ON user_recovery_codes (user_id, used_at);

CREATE TABLE login_challenges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX login_challenges_user ON login_challenges (user_id, expires_at);
