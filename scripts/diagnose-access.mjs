#!/usr/bin/env node
/**
 * Diagnóstico de acceso al panel, de sólo lectura, contra la D1 real.
 *
 * ## Por qué
 *
 * «No me deja entrar» tiene al menos cinco causas distintas en este proyecto,
 * y desde fuera se ven todas igual: la pantalla de login otra vez. Adivinar
 * cuesta una ronda por intento. Esto mira los hechos.
 *
 * Lo que comprueba, y por qué cada cosa importa:
 *
 * 1. **Que la cuenta exista y su rol.** Si no existe, no hay nada más que
 *    hablar.
 * 2. **El valor de `permissions`.** Es el sospechoso silencioso: el bloque 01
 *    cambió el significado de una lista vacía o corrupta —antes «acceso
 *    total», ahora «ningún área»— y la migración 0061 existe para normalizar
 *    esas filas antes de que el código nuevo las vea. Si el código está vivo
 *    pero la 0061 no se ha aplicado, una cuenta con `''`, `'[]'` o JSON
 *    inválido **inicia sesión correctamente y aun así no ve nada**: el
 *    middleware la manda a /admin/ayuda. Se parece muchísimo a «no me deja
 *    entrar», y la contraseña no tiene nada que ver.
 * 3. **Si la migración 0061 consta como aplicada**, que es lo que decide lo
 *    anterior.
 * 4. **Si el último enlace de acceso se llegó a usar**, para distinguir «no
 *    lo abrió» de «lo abrió y aun así no entra».
 * 5. **Cuántos bloqueos de login hay activos** ahora mismo. No se imprime
 *    ninguna IP: sólo cuántos hay y de cuándo, que es lo que responde «¿es
 *    el limitador?» sin exponer de quién.
 *
 * No escribe nada y no imprime contraseñas ni hashes.
 *
 * Uso: node scripts/diagnose-access.mjs <email>
 */
import { execFileSync } from 'node:child_process'

const DB_NAME = 'sa_inmobiliaria'
const LOCATION = process.env.ACCESS_LINK_D1 === 'local' ? '--local' : '--remote'

const email = process.argv[2]
if (!email) {
  console.error('Uso: node scripts/diagnose-access.mjs <email>')
  process.exit(2)
}

/**
 * Captura stderr en vez de heredarlo. Heredándolo, un fallo de wrangler
 * llegaba al log como "Command failed: <comando>" y nada más — justo el
 * mensaje que hacía falta se perdía. Un diagnóstico que no sabe explicar por
 * qué no ha podido diagnosticar no vale para nada.
 */
function d1(sql) {
  let out
  try {
    out = execFileSync('npx', ['wrangler', 'd1', 'execute', DB_NAME, LOCATION, '--json', '--command', sql], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (err) {
    const detail = [err.stderr, err.stdout].filter(Boolean).join('\n').trim()
    throw new Error(detail || err.message)
  }
  const start = out.indexOf('[')
  if (start === -1) throw new Error(`wrangler no devolvió JSON. Salida:\n${out.slice(0, 500)}`)
  return JSON.parse(out.slice(start))[0]?.results ?? []
}

/** Cada comprobación por separado: que una falle no debe callar a las demás. */
function paso(titulo, fn) {
  try {
    fn()
  } catch (err) {
    console.log(`   ✗ no se pudo comprobar: ${String(err.message).split('\n').slice(0, 4).join(' / ')}`)
  }
  console.log('')
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

/** Replica la lógica de utils/permissions.ts para explicar qué verá la cuenta. */
function describePermissions(raw) {
  if (raw === null || raw === undefined) return { estado: 'NULL — sin restricciones', problema: false }
  const trimmed = String(raw).trim()
  if (trimmed === '') return { estado: "'' (cadena vacía) — sin restricciones", problema: false }
  let parsed
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return { estado: `JSON inválido (${trimmed.slice(0, 40)}) — DENIEGA TODAS LAS ÁREAS`, problema: true }
  }
  if (!Array.isArray(parsed)) return { estado: 'no es un array JSON — DENIEGA TODAS LAS ÁREAS', problema: true }
  if (parsed.length === 0) return { estado: '[] (lista vacía) — DENIEGA TODAS LAS ÁREAS', problema: true }
  return { estado: `${parsed.length} permiso(s): ${parsed.join(', ')}`, problema: false }
}

function main() {
  console.log(`\n=== Diagnóstico de acceso — ${email} ===\n`)

  // Lo primero, y por eso va antes que nada: si producción está atrasada en
  // migraciones, medio diagnóstico deja de tener sentido — y una columna que
  // el código vivo espera y la base no tiene rompe el login entero, que se
  // parece muchísimo a "no me deja entrar".
  console.log('0. Estado del esquema')
  paso('esquema', () => {
    const migs = d1('SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 4')
    const [total] = d1('SELECT COUNT(*) AS n FROM d1_migrations')
    console.log(`   ${total?.n ?? '?'} migraciones aplicadas. Últimas: ${migs.map((m) => m.name).join(', ') || 'ninguna'}`)
    const cols = d1('PRAGMA table_info(users)').map((c) => c.name)
    console.log(`   Columnas de users: ${cols.join(', ')}`)
    if (!cols.includes('permissions')) {
      console.log('   ⚠ NO EXISTE la columna `permissions`, que el código vivo lee en cada inicio')
      console.log('     de sesión. Con eso, el login falla SIEMPRE, con cualquier contraseña.')
      console.log('     Causa: código desplegado por delante de las migraciones.')
    }
  })

  let user = null
  console.log('1. La cuenta')
  paso('cuenta', () => {
    const rows = d1(`SELECT * FROM users WHERE email = ${sqlString(email.toLowerCase())} LIMIT 1`)
    user = rows[0] || null
    if (!user) {
      console.log('   NO EXISTE en esta base de datos. Eso solo ya explica el problema.')
      return
    }
    console.log(`   id ${user.id}, rol "${user.role}", organization_id ${user.organization_id ?? 'NULL'}`)
    console.log(`   creada ${user.created_at} · actualizada ${user.updated_at}`)
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      console.log(`   ⚠ El rol "${user.role}" no tiene acceso al panel: entraría y rebotaría.`)
    }
  })

  console.log('2. Permisos efectivos')
  paso('permisos', () => {
    if (!user) return console.log('   (sin cuenta que mirar)')
    if (!('permissions' in user)) return console.log('   la columna no existe — ver el punto 0.')
    const perms = describePermissions(user.permissions)
    console.log(`   permissions = ${perms.estado}`)
    if (perms.problema) {
      console.log('   ⚠ CAUSA PROBABLE: la sesión se crea bien, pero el panel no muestra nada')
      console.log('     porque ninguna área está permitida. Lo arregla la migración 0061, o')
      console.log('     poner esta columna a NULL.')
    }
  })

  console.log('3. Migración 0061 (la que normaliza los permisos)')
  paso('0061', () => {
    const applied = d1("SELECT name FROM d1_migrations WHERE name LIKE '0061%'")
    console.log(`   ${applied.length ? `aplicada (${applied[0].name})` : 'NO APLICADA'}`)
  })

  console.log('4. Último enlace de acceso acuñado')
  paso('enlace', () => {
    if (!user) return console.log('   (sin cuenta que mirar)')
    const [token] = d1(
      `SELECT created_at, expires_at, used_at FROM password_reset_tokens
       WHERE user_id = ${user.id} ORDER BY id DESC LIMIT 1`,
    )
    if (!token) return console.log('   no se ha acuñado ninguno.')
    console.log(`   creado ${token.created_at} · caduca ${token.expires_at} · ${token.used_at ? `USADO el ${token.used_at}` : 'SIN USAR'}`)
    if (!token.used_at) console.log('   → no llegó a abrirse: el problema es anterior a la contraseña.')
  })

  console.log('5. Bloqueos de login activos (sin identificar a nadie)')
  paso('limitador', () => {
    const [limits] = d1("SELECT COUNT(*) AS activos, MAX(window_start) AS ultima FROM rate_limits WHERE bucket LIKE 'login:%' AND count > 10")
    console.log(`   ${limits?.activos ?? 0} IP(s) por encima del límite. Última ventana: ${limits?.ultima ?? 'ninguna'}`)
    if ((limits?.activos ?? 0) > 0) {
      console.log('   ⚠ Si una es la tuya, la contraseña correcta también falla hasta que pasen')
      console.log('     los 10 minutos.')
    }
  })
}

try {
  main()
} catch (err) {
  console.error(`\nError: ${err.message}`)
  process.exit(1)
}
