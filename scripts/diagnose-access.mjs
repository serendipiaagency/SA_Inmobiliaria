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

function d1(sql) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', DB_NAME, LOCATION, '--json', '--command', sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  const start = out.indexOf('[')
  if (start === -1) throw new Error('wrangler no devolvió JSON; revisa el paso anterior del log.')
  return JSON.parse(out.slice(start))[0]?.results ?? []
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

  const [user] = d1(
    `SELECT id, name, email, role, organization_id, permissions, created_at, updated_at
     FROM users WHERE email = ${sqlString(email.toLowerCase())} LIMIT 1`,
  )
  if (!user) {
    console.log('1. La cuenta NO EXISTE en esta base de datos.')
    console.log('   Eso explica el problema por completo: no es la contraseña.')
    return
  }

  console.log(`1. Cuenta: id ${user.id}, rol "${user.role}", organization_id ${user.organization_id ?? 'NULL'}`)
  console.log(`   Creada ${user.created_at} · actualizada ${user.updated_at}`)
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    console.log(`   ⚠ El rol "${user.role}" NO tiene acceso al panel: el login funcionaría y aun así rebotaría.`)
  }

  const perms = describePermissions(user.permissions)
  console.log(`\n2. permissions = ${perms.estado}`)
  if (perms.problema) {
    console.log('   ⚠ ESTA ES LA CAUSA MÁS PROBABLE. La sesión se crea bien, pero el panel')
    console.log('     no muestra nada porque ningún área está permitida. Lo arregla la')
    console.log('     migración 0061, o poner esta columna a NULL.')
  }

  const applied = d1("SELECT name FROM d1_migrations WHERE name LIKE '0061%'")
  console.log(`\n3. Migración 0061: ${applied.length ? `aplicada (${applied[0].name})` : 'NO APLICADA'}`)

  const [token] = d1(
    `SELECT created_at, expires_at, used_at FROM password_reset_tokens
     WHERE user_id = ${user.id} ORDER BY id DESC LIMIT 1`,
  )
  console.log('\n4. Último enlace de acceso:')
  if (!token) console.log('   no se ha acuñado ninguno.')
  else console.log(`   creado ${token.created_at} · caduca ${token.expires_at} · ${token.used_at ? `USADO el ${token.used_at}` : 'SIN USAR'}`)

  // Sólo el recuento y la ventana: nunca la IP de nadie.
  const [limits] = d1(
    "SELECT COUNT(*) AS activos, MAX(window_start) AS ultima FROM rate_limits WHERE bucket LIKE 'login:%' AND count > 10",
  )
  console.log('\n5. Bloqueos de login activos (sin identificar a nadie):')
  console.log(`   ${limits?.activos ?? 0} IP(s) por encima del límite. Última ventana: ${limits?.ultima ?? 'ninguna'}`)
  if ((limits?.activos ?? 0) > 0) {
    console.log('   ⚠ Hay al menos una IP bloqueada. Si es la tuya, la contraseña correcta')
    console.log('     también falla hasta que pasen los 10 minutos.')
  }
  console.log('')
}

try {
  main()
} catch (err) {
  console.error(`\nError: ${err.message}`)
  process.exit(1)
}
