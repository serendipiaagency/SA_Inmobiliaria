import { eq } from 'drizzle-orm'
import { useDb, schema, cfEnv } from '../../utils/db'
import { verifyPassword, dummyVerify, createSession } from '../../utils/auth'
import { rateLimit } from '../../utils/rateLimit'
import { createLoginChallenge } from '../../utils/twoFactor'
import { decideOrganizationAccess } from '../../utils/organizations/access'
import { registerCompanySelfService } from '../../utils/organizations/lifecycle'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string; password?: string; action?: string } & Record<string, unknown>>(event)

  // Registro público de empresas (Landing → Registro Empresa). Vive aquí y no
  // en una ruta propia por el presupuesto de rutas de Nitro (margen 0, ver
  // docs/property-schema-registry.md). Su propio límite por IP, más estricto
  // que el del login: 5 altas por hora. No inicia sesión: tras el alta se
  // entra por el login normal.
  if (body?.action === 'register-company') {
    await rateLimit(event, 'company-register', { limit: 5, windowSeconds: 3600 })
    return registerCompanySelfService(event, body)
  }

  // Brute-force guard: 10 attempts / 10 min per IP. Keyed on IP only (not email) so an
  // attacker can't dodge the limit by rotating target accounts against a fixed IP either.
  await rateLimit(event, 'login', { limit: 10, windowSeconds: 600 })

  if (!body?.email || !body?.password || typeof body.email !== 'string' || typeof body.password !== 'string') {
    throw createError({ statusCode: 422, statusMessage: 'Email and password are required' })
  }
  const db = useDb(event)
  const rows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, body.email.toLowerCase().trim()))
    .limit(1)
  const user = rows[0]
  if (!user) {
    await dummyVerify(body.password) // keep timing identical to the "wrong password" branch
    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
  }
  if (!(await verifyPassword(body.password, user.password))) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
  }

  // Credenciales válidas no bastan: la empresa tiene que tener el acceso
  // permitido (server/utils/organizations/access.ts). Sólo se dice el motivo
  // después de comprobar la contraseña, así que no ayuda a enumerar cuentas.
  // El super_admin es de la plataforma, no de una empresa: nunca se le aplica.
  if (user.organizationId != null && user.role !== 'super_admin') {
    const [org] = await db
      .select({ status: schema.organizations.status, approvalStatus: schema.organizations.approvalStatus, billingStatus: schema.organizations.billingStatus })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, user.organizationId))
      .limit(1)
    const decision = decideOrganizationAccess(org ?? { status: 'unknown', approvalStatus: null, billingStatus: null })
    if (!decision.allowed) {
      throw createError({ statusCode: 403, statusMessage: decision.message, data: { reason: decision.reason } })
    }
  }

  // Segundo factor activo: la contraseña sola no crea sesión. Se devuelve un
  // desafío de corta vida que /api/auth/totp/verify convierte en sesión con
  // un código válido (server/utils/twoFactor.ts). Sin el desafío no hay forma
  // de llegar a createSession() desde aquí.
  if (user.totpEnabledAt) {
    const challenge = await createLoginChallenge(db, user.id)
    return { ok: true, requiresTotp: true, challenge, available: Boolean(cfEnv(event).TOTP_ENCRYPTION_KEY) }
  }

  await createSession(event, user.id)
  return { ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } }
})
