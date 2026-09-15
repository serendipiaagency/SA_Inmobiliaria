#!/usr/bin/env node
/**
 * Crea (o reajusta) una cuenta de super administrador.
 *
 * ## Por qué existe, y por qué no es una migración
 *
 * La forma obvia de dar de alta un administrador sería una migración con un
 * `INSERT`. Este repositorio ya tiene una —`migrations/0002_seed_admin.sql`—
 * y es justo el defecto que la auditoría documenta: el hash PBKDF2 de
 * `ChangeMe123!` lleva desde entonces escrito en el repositorio, legible por
 * cualquiera con acceso al código, en el historial para siempre y sin forma
 * de rotarlo. Una credencial de produccion no debe vivir en git.
 *
 * Aquí la contraseña se pide por teclado, sin eco, no se imprime nunca, no se
 * pasa por argumento (que quedaría en el historial del shell ni en la lista
 * de procesos) y no se escribe en ningún fichero. Lo único que sale de este
 * proceso es el hash, que es lo que la base de datos necesita.
 *
 * ## Uso
 *
 *   node scripts/create-super-admin.mjs            # D1 local (desarrollo)
 *   node scripts/create-super-admin.mjs --remote   # D1 de producción
 *   node scripts/create-super-admin.mjs --sql      # sólo imprime el SQL
 *
 * `--remote` necesita `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID` en el
 * entorno, y pide confirmación escrita antes de tocar nada.
 *
 * Si el email ya existe, **actualiza** esa cuenta en vez de fallar: así esto
 * sirve también para recuperar el acceso cuando se ha perdido la contraseña,
 * que es el caso por el que suele buscarse este script.
 */
import { execFileSync } from 'node:child_process'
import { createInterface } from 'node:readline'
import process from 'node:process'

const PBKDF2_ITERATIONS = 100_000 // idéntico a server/utils/auth.ts
const MIN_PASSWORD_LENGTH = 8 // idéntico a server/api/auth/reset-password.post.ts
const DB_NAME = 'sa_inmobiliaria'

function toB64(buf) {
  return Buffer.from(new Uint8Array(buf)).toString('base64')
}

/** El mismo formato exacto que produce hashPassword(): pbkdf2$<iter>$<salt>$<hash>. */
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS }, key, 256)
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toB64(salt)}$${toB64(hash)}`
}

/**
 * Una sola interfaz de readline para todo. Mezclar readline con lecturas en
 * modo crudo deja stdin en un estado del que la segunda pregunta no se
 * recupera; silenciar el eco de la propia interfaz es el camino que funciona.
 */
let muted = false
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
rl._writeToOutput = function (chunk) {
  if (!muted) rl.output.write(chunk)
}

function ask(question) {
  return new Promise((resolve) => rl.question(question, (answer) => resolve(answer.trim())))
}

/** Lee sin eco: la contraseña no aparece en pantalla ni queda en el scrollback. */
function askHidden(question) {
  return new Promise((resolve) => {
    process.stdout.write(question)
    muted = true
    rl.question('', (answer) => {
      muted = false
      process.stdout.write('\n')
      resolve(answer)
    })
  })
}

/** Escapa una cadena para un literal SQL. Sólo se usa con email y nombre. */
function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

async function main() {
  // Antes de pedir nada: sin terminal interactiva no se puede leer la
  // contraseña sin eco, y no hay alternativa aceptable — pasarla por tubería
  // o por argumento la dejaría en el historial del shell y en la lista de
  // procesos. Mejor decirlo ya que después de haber tecleado el email.
  if (!process.stdin.isTTY) {
    throw new Error(
      'Esto necesita una terminal interactiva: la contraseña se teclea sin eco y no se admite por tubería ni por argumento, que la dejarían en el historial del shell.',
    )
  }

  const remote = process.argv.includes('--remote')
  const sqlOnly = process.argv.includes('--sql')
  const target = remote ? 'PRODUCCIÓN' : 'local'

  console.log(`Crear o reajustar un super administrador — base de datos: ${target}\n`)

  const email = (await ask('Email: ')).toLowerCase()
  if (!email.includes('@')) throw new Error('Eso no parece un email.')
  const name = (await ask('Nombre a mostrar [Administrador]: ')) || 'Administrador'

  const password = await askHidden('Contraseña (no se muestra): ')
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres — es la misma regla que aplica la aplicación al cambiarla.`)
  }
  const again = await askHidden('Repite la contraseña: ')
  if (password !== again) throw new Error('Las dos contraseñas no coinciden. No se ha tocado nada.')

  const hash = await hashPassword(password)
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19)

  // organization_id NULL y permissions NULL: un super_admin no pertenece a
  // ninguna agencia y no está restringido por áreas (server/db/schema.ts).
  // ON CONFLICT actualiza, para que esto sirva también como recuperación de
  // acceso sin crear cuentas duplicadas.
  const sql = `INSERT INTO users (organization_id, name, email, password, role, permissions, created_at, updated_at)
VALUES (NULL, ${sqlString(name)}, ${sqlString(email)}, ${sqlString(hash)}, 'super_admin', NULL, ${sqlString(ts)}, ${sqlString(ts)})
ON CONFLICT(email) DO UPDATE SET password = excluded.password, role = 'super_admin', permissions = NULL, updated_at = excluded.updated_at;`

  if (sqlOnly) {
    console.log('\n--- SQL (contiene el hash, no la contraseña) ---\n')
    console.log(sql)
    console.log('\nEjecútalo con:')
    console.log(`  npx wrangler d1 execute ${DB_NAME} ${remote ? '--remote' : '--local'} --command "<pega aquí el SQL>"`)
    return
  }

  if (remote) {
    console.log('\nEsto escribe en la base de datos de PRODUCCIÓN, que tiene clientes activos.')
    const confirm = await ask('Escribe PRODUCCION para continuar, cualquier otra cosa para abortar: ')
    if (confirm !== 'PRODUCCION') {
      console.log('Abortado. No se ha tocado nada.')
      return
    }
  }

  execFileSync('npx', ['wrangler', 'd1', 'execute', DB_NAME, remote ? '--remote' : '--local', '--command', sql], {
    stdio: ['ignore', 'inherit', 'inherit'],
  })

  console.log(`\nListo. ${email} es super_admin en la base de datos ${target}.`)
  console.log('La contraseña no se ha impreso, ni guardado, ni pasado por argumento: sólo la tienes tú.')
}

function done(code) {
  rl.close()
  process.exit(code)
}

main()
  .then(() => done(0))
  .catch((err) => {
    // Nunca volcar el error entero: podría arrastrar el SQL, y con él el hash.
    console.error(`\nError: ${err.message}`)
    done(1)
  })
