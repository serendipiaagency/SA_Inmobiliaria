#!/usr/bin/env node
/**
 * Acuña un enlace de un solo uso para recuperar el acceso al panel.
 *
 * ## Para qué
 *
 * Cuando nadie puede entrar y el envío de emails no está conectado, el flujo
 * normal de «he olvidado mi contraseña» no sirve: nadie recibe el enlace.
 * Esto lo genera directamente contra la base de datos, sin correo de por
 * medio. Quien lo abre elige su propia contraseña en el navegador.
 *
 * ## Qué NO inventa
 *
 * Nada. Usa la maquinaria que el proyecto ya tiene y que ya está probada:
 * la tabla `password_reset_tokens` (token guardado sólo como SHA-256, de un
 * solo uso, con caducidad) y la página `/reset-password/<token>`. Aquí no hay
 * una vía de autenticación nueva ni un endpoint nuevo — sólo se escribe la
 * misma fila que escribiría `createPasswordResetToken()`.
 *
 * ## Dónde se ejecuta
 *
 * En el job `admin-access-link` de GitHub Actions, que declara el Environment
 * `production` y por tanto tiene las credenciales de Cloudflare. No en el
 * portátil de nadie, y nunca con la contraseña de nadie: **este script no ve
 * ninguna contraseña**, ni la genera. Sólo acuña un permiso temporal para
 * elegirla.
 *
 * ## Lo que hay que saber antes de usarlo
 *
 * El enlace acaba impreso en el registro de la ejecución de Actions, visible
 * para quien tenga acceso de lectura al repositorio. Por eso caduca en 15
 * minutos y sólo sirve una vez: la exposición es corta y se cierra sola. Aun
 * así, es una decisión consciente y no un descuido — quien lo lance debe
 * saberlo.
 *
 * Uso: node scripts/mint-access-link.mjs <email> <base-url> [minutos]
 */
import { execFileSync } from 'node:child_process'
import { webcrypto as crypto } from 'node:crypto'

const DB_NAME = 'sa_inmobiliaria'
const DEFAULT_TTL_MINUTES = 15

const [email, baseUrlRaw, ttlRaw] = process.argv.slice(2)
if (!email || !baseUrlRaw) {
  console.error('Uso: node scripts/mint-access-link.mjs <email> <base-url> [minutos]')
  process.exit(2)
}
const baseUrl = baseUrlRaw.replace(/\/$/, '')
if (!/^https:\/\/[a-zA-Z0-9.-]+/.test(baseUrl)) {
  console.error(`La URL base ('${baseUrlRaw}') no parece un https:// válido.`)
  process.exit(2)
}
const ttlMinutes = Math.min(60, Math.max(1, Number(ttlRaw) || DEFAULT_TTL_MINUTES))

/** Mismo formato que randomTokenHex() en server/utils/auth.ts: 24 bytes en hex. */
function randomTokenHex() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString('hex')
}

async function sha256Hex(input) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Buffer.from(new Uint8Array(buf)).toString('hex')
}

/**
 * `ACCESS_LINK_D1=local` apunta a la D1 local. Existe para poder probar este
 * script de extremo a extremo —acuñar, canjear, entrar— sin tocar producción;
 * un script de recuperación que nunca se ha ejercitado no es un script de
 * recuperación. El workflow no lo define, así que allí siempre es `--remote`.
 */
const LOCATION = process.env.ACCESS_LINK_D1 === 'local' ? '--local' : '--remote'

function d1(sql) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', DB_NAME, LOCATION, '--json', '--command', sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  // `--json` puede venir precedido de avisos de wrangler; nos quedamos con el
  // primer array JSON de la salida.
  const start = out.indexOf('[')
  if (start === -1) throw new Error('wrangler no devolvió JSON; revisa el paso anterior del log.')
  return JSON.parse(out.slice(start))[0]?.results ?? []
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

async function main() {
  const rows = d1(`SELECT id, role FROM users WHERE email = ${sqlString(email.toLowerCase())} LIMIT 1`)
  const user = rows[0]
  if (!user) throw new Error(`No existe ninguna cuenta con el correo ${email}.`)

  const raw = randomTokenHex()
  const tokenHash = await sha256Hex(raw)
  const iso = (d) => d.toISOString().replace('T', ' ').slice(0, 19)
  const expiresAt = iso(new Date(Date.now() + ttlMinutes * 60_000))

  // Se invalidan los enlaces anteriores de esta cuenta antes de acuñar el
  // nuevo: si se ha pedido más de uno, sólo el último debe servir.
  d1(`DELETE FROM password_reset_tokens WHERE user_id = ${user.id} AND used_at IS NULL`)
  d1(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_at)
     VALUES (${user.id}, ${sqlString(tokenHash)}, ${sqlString(expiresAt)}, ${sqlString(iso(new Date()))})`,
  )

  console.log('')
  console.log(`Cuenta: ${email} (id ${user.id}, rol ${user.role})`)
  console.log(`Caduca: ${expiresAt} UTC — ${ttlMinutes} minutos, y sólo sirve una vez.`)
  console.log('')
  console.log('Enlace para elegir una contraseña nueva:')
  console.log(`  ${baseUrl}/reset-password/${raw}`)
  console.log('')
  console.log('Recuerda: el login bloquea 10 intentos por IP cada 10 minutos, y esto no reinicia')
  console.log('ese contador. Si vienes de varios intentos fallidos, espera antes de entrar.')
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`)
  process.exit(1)
})
