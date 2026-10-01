import { requireOrgScope } from '../../../../utils/auth'
import { useDb } from '../../../../utils/db'
import { logAdminAction } from '../../../../utils/audit'
import { updateSlaSettings } from '../../../../utils/leads/sla'
import { leadScoreSettings, saveLeadScoreRules } from '../../../../utils/leads/score'

interface Body {
  newLeadUnattendedMinutes?: number
  qualifiedWithoutActionHours?: number
  inactiveLeadDays?: number
  useBusinessHours?: boolean
  /** FASE 32 — reglas del Lead Score de la agencia (catálogo cerrado de criterios). */
  scoreRules?: Array<{ criterion: string; points?: number; enabled?: boolean; priority?: number; config?: Record<string, any> }>
}

/** PUT /api/admin/saas/leads-routing/sla-settings — umbrales por organización. Nunca una regla universal hardcodeada (FASE 16 §32). */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = (await readBody<Body>(event)) || {}

  // FASE 32 — guardar reglas del Lead Score no recalcula nada por sí solo
  // (§70: nunca el tenant entero por un cambio): la pantalla ofrece
  // «Recalcular» como acción en bloque, con progreso y resultado por lead.
  if (body.scoreRules !== undefined) {
    const db = useDb(event)
    await saveLeadScoreRules(db, orgId, body.scoreRules as any)
    await logAdminAction(event, { user, orgId, action: 'update', resource: 'lead-score-rules', resourceId: orgId, detail: body.scoreRules.map((r) => r.criterion).join(',') })
    return leadScoreSettings(db, orgId)
  }

  const patch: Record<string, number | boolean> = {}

  for (const [key, min] of [
    ['newLeadUnattendedMinutes', 1],
    ['qualifiedWithoutActionHours', 1],
    ['inactiveLeadDays', 1],
  ] as const) {
    if (body[key] !== undefined) {
      const n = Number(body[key])
      if (!Number.isFinite(n) || n < min) throw createError({ statusCode: 422, statusMessage: `${key} debe ser un número ≥ ${min}` })
      patch[key] = n
    }
  }
  if (body.useBusinessHours !== undefined) patch.useBusinessHours = !!body.useBusinessHours

  const saved = await updateSlaSettings(useDb(event), orgId, patch)
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'sla-settings', resourceId: orgId })
  return saved
})
