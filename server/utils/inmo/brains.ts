import { and, eq } from 'drizzle-orm'
import { createError } from 'h3'
import * as schema from '../../db/schema'
import { hasAreaAccess } from '../permissions'
import type { SessionUser } from '../auth'
import { ALL_TOOLS } from '../tools/execute'
import { DEFAULT_BRAIN, INMO_BRAINS, parseTools } from './brainCatalog'

/**
 * Cerebros de INMO (bloque N8b): perfiles por tarea, cada uno con sus
 * instrucciones y el SUBCONJUNTO de herramientas que puede usar.
 *
 * Tres capas, y ninguna amplía la anterior:
 *   1. el perfil del código (aquí): instrucciones + herramientas base;
 *   2. los ajustes de la agencia (`inmo_brain_settings`): activar/desactivar,
 *      instrucciones adicionales y RECORTAR herramientas — nunca añadir una
 *      que el perfil no tenga (se rechaza al guardar y se ignora al leer);
 *   3. el RBAC del usuario: de lo que queda, sólo lo que su cuenta puede usar.
 * La restricción la aplica el ejecutor (`allowedTools` en executeTool), no el
 * prompt: una herramienta fuera del cerebro se deniega aunque el modelo la pida.
 */

export interface EffectiveBrain {
  key: string
  label: string
  description: string
  enabled: boolean
  /** Instrucciones del perfil + las de la agencia (si hay). */
  instructions: string
  agencyInstructions: string | null
  /** Herramientas del perfil tras el recorte de la agencia (antes del RBAC). */
  tools: string[]
  baseTools: string[]
  settingsId: number | null
}

/** Los cerebros de la agencia: perfil + ajustes (sin RBAC todavía). */
export async function effectiveBrains(db: any, orgId: number): Promise<EffectiveBrain[]> {
  const rows = await db.select().from(schema.inmoBrainSettings).where(eq(schema.inmoBrainSettings.organizationId, orgId))
  return INMO_BRAINS.map((b) => {
    const s = rows.find((r: any) => r.brainKey === b.key)
    const narrowed = parseTools(s?.toolsJson)
    // Al leer también se recorta: un ajuste que nombrara algo fuera del perfil no lo añade.
    const tools = narrowed ? b.tools.filter((t) => narrowed.includes(t)) : [...b.tools]
    const agency = s?.instructions ? String(s.instructions).trim() : ''
    return {
      key: b.key,
      label: b.label,
      description: b.description,
      // El cerebro general no se puede desactivar: es el de reserva.
      enabled: b.key === DEFAULT_BRAIN ? true : s ? Boolean(s.enabled) : true,
      instructions: [b.instructions, agency ? `Indicaciones de la agencia: ${agency}` : ''].filter(Boolean).join('\n'),
      agencyInstructions: agency || null,
      tools,
      baseTools: [...b.tools],
      settingsId: s?.id ?? null,
    }
  })
}

/** El cerebro con el que trabaja este turno (desactivado o desconocido → error claro). */
export async function resolveBrain(db: any, orgId: number, key: string | null | undefined): Promise<EffectiveBrain> {
  const all = await effectiveBrains(db, orgId)
  const wanted = key || DEFAULT_BRAIN
  const brain = all.find((b) => b.key === wanted)
  if (!brain) throw createError({ statusCode: 422, statusMessage: `No existe el perfil de INMO «${wanted}».` })
  if (!brain.enabled) throw createError({ statusCode: 422, statusMessage: `El perfil «${brain.label}» está desactivado en tu agencia.` })
  return brain
}

/** Lo que este usuario puede usar con este cerebro: perfil ∩ ajustes ∩ RBAC. */
export function brainToolsFor(brain: Pick<EffectiveBrain, 'tools'>, user: Pick<SessionUser, 'role' | 'permissions'>): string[] {
  return brain.tools.filter((name) => {
    const tool = ALL_TOOLS.find((t) => t.name === name)
    return Boolean(tool && hasAreaAccess(user as any, tool.area, tool.action))
  })
}

/** Comprueba, antes de insertar, que no haya ya un ajuste para ese perfil (409 claro en vez del índice único). */
export async function assertNoBrainSettings(db: any, orgId: number, brainKey: string) {
  const [row] = await db
    .select({ id: schema.inmoBrainSettings.id })
    .from(schema.inmoBrainSettings)
    .where(and(eq(schema.inmoBrainSettings.organizationId, orgId), eq(schema.inmoBrainSettings.brainKey, brainKey)))
    .limit(1)
  if (row) throw createError({ statusCode: 409, statusMessage: 'Ese perfil ya tiene ajustes: edítalos', data: { id: row.id } })
}
