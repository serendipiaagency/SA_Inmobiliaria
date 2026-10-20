import { and, eq } from 'drizzle-orm'
import { createError, type H3Event } from 'h3'
import { cfEnv, now, schema, useDb } from '../db'
import { createPasswordResetToken, hashPassword, type SessionUser } from '../auth'
import { sendPlatformEmail } from '../email/platform'
import { platformBaseUrl } from '../email/links'
import { getRequestId } from '../requestId'
import { logAdminAction } from '../audit'
import { ROLE_PRESETS } from '../../../utils/rolePresets'

/**
 * Cola 12-C — «Invitar a la plataforma» un comercial.
 *
 * Conecta la ficha de comercial (`team_members`) con una cuenta de acceso
 * (`users`) y le manda un enlace de un solo uso para definir su contraseña,
 * reutilizando TODO lo que ya existe: el preset de permisos «comercial»
 * (utils/rolePresets.ts), el vínculo `team_members.user_id` (migración 0086) y
 * el flujo de token de `password_reset` (`createPasswordResetToken`,
 * `/reset-password/:token`, de un solo uso y 60 min). No crea un sistema de
 * autenticación ni de roles paralelo, ni manda contraseñas por correo.
 *
 * Los permisos del comercial se aplican EN EL SERVIDOR con el preset fijo, para
 * que el administrador de la agencia (acceso a Sistema) pueda invitar sin tener
 * que poder editar permisos arbitrarios (eso sigue siendo sólo del super_admin).
 * El preset «comercial» es más restrictivo que cualquier cuenta sin límites, así
 * que esto nunca amplía privilegios.
 */

const COMMERCIAL_PRESET = ROLE_PRESETS.find((p) => p.key === 'comercial')!.permissions as string[]
const COMMERCIAL_PERMISSIONS = JSON.stringify(COMMERCIAL_PRESET)
/** Revocar = sin acceso a ninguna área (deniega todo), reversible reinvitando. */
const REVOKED_PERMISSIONS = '[]'

export type CommercialAccessAction = 'invite' | 'resend' | 'revoke'

export interface CommercialAccessResult {
  ok: true
  status: 'invited' | 'revoked'
  userId: number | null
  /** 'sent' | 'queued' | 'failed' (sólo en invitar/reenviar). */
  invite?: string
}

async function randomUnusablePassword(): Promise<string> {
  const rnd = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)
  return hashPassword(`${rnd()}${rnd()}`)
}

export async function manageCommercialAccess(
  event: H3Event,
  user: SessionUser,
  orgId: number,
  teamMemberId: number,
  action: CommercialAccessAction,
): Promise<CommercialAccessResult> {
  const db = useDb(event)

  const [member] = await db
    .select({ id: schema.teamMembers.id, name: schema.teamMembers.name, email: schema.teamMembers.email, userId: schema.teamMembers.userId })
    .from(schema.teamMembers)
    .where(and(eq(schema.teamMembers.id, teamMemberId), eq(schema.teamMembers.organizationId, orgId)))
    .limit(1)
  if (!member) throw createError({ statusCode: 404, statusMessage: 'Comercial no encontrado' })

  if (action === 'revoke') {
    if (member.userId) {
      // La cuenta se queda sin acceso (deniega todas las áreas) y se desvincula;
      // nunca tocamos a un administrador sin restricciones (permisos NULL).
      await db
        .update(schema.users)
        .set({ permissions: REVOKED_PERMISSIONS, updatedAt: now() })
        .where(and(eq(schema.users.id, member.userId), eq(schema.users.organizationId, orgId), eq(schema.users.role, 'user')))
      await db.update(schema.teamMembers).set({ userId: null, updatedAt: now() }).where(eq(schema.teamMembers.id, member.id))
    }
    await logAdminAction(event, { user, orgId, action: 'update', resource: 'team', resourceId: member.id, detail: 'acceso al panel revocado' })
    return { ok: true, status: 'revoked', userId: null }
  }

  // invitar / reenviar
  const email = String(member.email || '').trim().toLowerCase()
  if (!email) throw createError({ statusCode: 422, statusMessage: 'El comercial necesita un email para poder invitarlo al panel.' })

  let userId = member.userId ?? null
  if (!userId) {
    // ¿Ya existe una cuenta con ese email en ESTA agencia? Se reutiliza (no se duplica).
    const [existing] = await db
      .select({ id: schema.users.id, permissions: schema.users.permissions, role: schema.users.role })
      .from(schema.users)
      .where(and(eq(schema.users.organizationId, orgId), eq(schema.users.email, email)))
      .limit(1)
    if (existing) {
      userId = existing.id
      // Si estaba revocada («[]»), se reactiva al preset comercial; si tiene
      // otros permisos o es admin sin restricciones, se respetan tal cual.
      if (existing.role === 'user' && existing.permissions === REVOKED_PERMISSIONS) {
        await db.update(schema.users).set({ permissions: COMMERCIAL_PERMISSIONS, updatedAt: now() }).where(eq(schema.users.id, userId))
      }
    } else {
      const [created] = await db
        .insert(schema.users)
        .values({ organizationId: orgId, name: member.name, email, password: await randomUnusablePassword(), role: 'user', permissions: COMMERCIAL_PERMISSIONS, createdAt: now(), updatedAt: now() })
        .returning({ id: schema.users.id })
      userId = created.id
    }
    await db.update(schema.teamMembers).set({ userId, updatedAt: now() }).where(eq(schema.teamMembers.id, member.id))
  } else {
    // Reenvío a una cuenta vinculada que estaba revocada: se reactiva el preset.
    const [u] = await db.select({ permissions: schema.users.permissions, role: schema.users.role }).from(schema.users).where(eq(schema.users.id, userId)).limit(1)
    if (u && u.role === 'user' && u.permissions === REVOKED_PERMISSIONS) {
      await db.update(schema.users).set({ permissions: COMMERCIAL_PERMISSIONS, updatedAt: now() }).where(eq(schema.users.id, userId))
    }
  }

  const [org] = await db
    .select({ name: schema.organizations.name, companyName: schema.organizations.companyName, emailLocale: schema.organizations.emailLocale })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, orgId))
    .limit(1)
  const companyName = org?.companyName || org?.name || 'tu inmobiliaria'
  const locale: 'es' | 'en' = org?.emailLocale === 'en' ? 'en' : 'es'

  let invite = 'failed'
  try {
    const token = await createPasswordResetToken(db, userId)
    const results = await sendPlatformEmail(db, cfEnv(event) as Record<string, any>, {
      organizationId: orgId,
      template: 'commercial_invite',
      to: email,
      locale,
      // El enlace lleva el token en claro sólo dentro del email (como el alta de
      // usuarios): de un solo uso y 60 min, nunca una contraseña.
      data: { name: member.name, email, companyName, setPasswordUrl: `${platformBaseUrl(event)}/reset-password/${token}` },
      requestId: getRequestId(event),
    })
    const statuses = results.map((r: any) => r.status)
    invite = statuses.includes('sent') ? 'sent' : statuses.includes('queued') ? 'queued' : 'failed'
  } catch {
    // El vínculo ya está hecho; si el correo falla, el comercial puede usar
    // «¿Olvidaste tu contraseña?» en la pantalla de acceso. No deshacemos nada.
  }

  await logAdminAction(event, { user, orgId, action: 'run', resource: 'team', resourceId: member.id, detail: `invitación al panel (${action}): ${invite}` })
  return { ok: true, status: 'invited', userId, invite }
}
