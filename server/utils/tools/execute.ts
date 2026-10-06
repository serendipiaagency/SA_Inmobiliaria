import { and, eq } from 'drizzle-orm'
import { isUniqueConstraintError, now, schema } from '../db'
import { hasAreaAccess } from '../permissions'
import { DOMAIN_TOOLS } from './registry'
import { INTELLIGENCE_TOOLS } from './intelligence'
import { ToolError, type DomainTool, type ToolContext, type ToolErrorCode } from './types'

/**
 * Ejecutor común de la Domain Tools API (FASE 31 §26). El orden es el del
 * encargo y no se salta nunca:
 *
 *   herramienta conocida → autorización (RBAC real del usuario, §21)
 *   → contexto de tenant (orgId de la sesión, jamás del input)
 *   → validación del input → confirmación si tiene efectos externos (§20)
 *   → idempotencia (§48) → servicio de dominio → DTO compacto
 *
 * y deja SIEMPRE una traza (§47/§51/§140) en domain_tool_calls: qué
 * herramienta, quién, resultado o error tipado, entidad y latencia — nunca
 * el prompt ni el input completo.
 */

export interface ExecuteToolOptions {
  idempotencyKey?: string | null
  /** Confirmación explícita de quien usa la herramienta (botón «Confirmar» en INMO, o el cliente de la API). */
  confirmed?: boolean
  /**
   * Sólo estas herramientas (el cerebro de INMO activo, bloque N8b). Una
   * fuera de la lista se deniega con PERMISSION_DENIED y queda en la traza,
   * igual que una que el RBAC no permite: la restricción la impone el
   * código, no el prompt. Nunca AMPLÍA nada — el RBAC se sigue comprobando.
   */
  allowedTools?: readonly string[] | null
}

export type ExecuteToolResult =
  | { ok: true; tool: string; output: unknown; target: { type: string; id: number } | null; replayed?: boolean }
  | { ok: false; tool: string; error: { code: ToolErrorCode; message: string; details?: Record<string, unknown> } }

/**
 * Todas las herramientas: las de dominio (registry.ts) y las de INMO
 * Intelligence (intelligence.ts: conocimiento, memoria, notas y avisos
 * internos). Mismo contrato y mismo ejecutor para todas.
 */
export const ALL_TOOLS: DomainTool[] = [...DOMAIN_TOOLS, ...INTELLIGENCE_TOOLS]

export function getTool(name: string): DomainTool | undefined {
  return ALL_TOOLS.find((t) => t.name === name)
}

/** Catálogo visible para este usuario: sólo las herramientas que su RBAC le permite. */
export function toolCatalogFor(user: ToolContext['user']) {
  return ALL_TOOLS.filter((t) => hasAreaAccess(user, t.area, t.action)).map((t) => ({
    name: t.name,
    description: t.description,
    kind: t.kind,
    requiresConfirmation: Boolean(t.requiresConfirmation),
    idempotent: Boolean(t.idempotent),
    inputSchema: t.inputSchema,
  }))
}

/** Traduce los errores de los servicios de dominio (createError de h3) a códigos tipados. */
function toToolError(e: any): ToolError {
  if (e instanceof ToolError) return e
  const status = Number(e?.statusCode ?? e?.status)
  const message = String(e?.statusMessage || e?.message || 'Error')
  if (status === 404) return new ToolError('NOT_FOUND', message)
  if (status === 409) return new ToolError('CONFLICT', message, e?.data ? { data: e.data } : undefined)
  if (status === 422 || status === 400) return new ToolError('VALIDATION_ERROR', message, e?.data ? { data: e.data } : undefined)
  if (status === 403) return new ToolError('PERMISSION_DENIED', message)
  if (status === 502) return new ToolError('PROVIDER_ERROR', message)
  if (e?.name === 'LeadPipelineError' || e?.name === 'LeadRoutingError') return new ToolError('VALIDATION_ERROR', message)
  return new ToolError('INTERNAL_ERROR', 'Error interno al ejecutar la herramienta.')
}

async function trace(
  ctx: ToolContext,
  tool: string,
  kind: string,
  started: number,
  outcome: { status: 'ok' | 'error'; errorCode?: string | null; target?: { type: string; id: number } | null; idempotencyKey?: string | null; resultJson?: string | null },
) {
  try {
    await ctx.db.insert(schema.domainToolCalls).values({
      organizationId: ctx.orgId,
      userId: ctx.user.id,
      tool,
      kind,
      source: ctx.source,
      status: outcome.status,
      errorCode: outcome.errorCode ?? null,
      targetType: outcome.target?.type ?? null,
      targetId: outcome.target?.id ?? null,
      idempotencyKey: outcome.idempotencyKey ?? null,
      resultJson: outcome.resultJson ?? null,
      latencyMs: Date.now() - started,
      createdAt: now(),
    })
  } catch (e) {
    if (outcome.idempotencyKey && isUniqueConstraintError(e)) throw e
    // La traza nunca deshace la operación: si no se pudo escribir, la operación sigue siendo real.
  }
}

export async function executeTool(ctx: ToolContext, name: string, rawInput: unknown, opts: ExecuteToolOptions = {}): Promise<ExecuteToolResult> {
  const started = Date.now()
  const tool = getTool(name)
  if (!tool) return { ok: false, tool: name, error: { code: 'UNKNOWN_TOOL', message: `No existe la herramienta «${name}».` } }

  try {
    if (!hasAreaAccess(ctx.user, tool.area, tool.action)) throw new ToolError('PERMISSION_DENIED', 'Tu usuario no tiene permiso para esta operación.')
    if (opts.allowedTools && !opts.allowedTools.includes(tool.name)) throw new ToolError('PERMISSION_DENIED', `El perfil de INMO activo no usa «${tool.name}».`)
    if (rawInput !== undefined && rawInput !== null && (typeof rawInput !== 'object' || Array.isArray(rawInput))) throw new ToolError('VALIDATION_ERROR', 'El input debe ser un objeto.')
    const input = tool.parse((rawInput as Record<string, unknown>) || {})

    if (tool.requiresConfirmation && !opts.confirmed) {
      throw new ToolError('CONFIRMATION_REQUIRED', `«${tool.name}» necesita confirmación explícita antes de ejecutarse.`, { tool: tool.name, input })
    }

    const key = tool.idempotent && opts.idempotencyKey ? String(opts.idempotencyKey).slice(0, 120) : null
    if (key) {
      const [prev] = await ctx.db
        .select({ resultJson: schema.domainToolCalls.resultJson, targetType: schema.domainToolCalls.targetType, targetId: schema.domainToolCalls.targetId })
        .from(schema.domainToolCalls)
        .where(and(eq(schema.domainToolCalls.organizationId, ctx.orgId), eq(schema.domainToolCalls.tool, tool.name), eq(schema.domainToolCalls.idempotencyKey, key), eq(schema.domainToolCalls.status, 'ok')))
        .limit(1)
      if (prev) {
        return { ok: true, tool: tool.name, output: prev.resultJson ? JSON.parse(prev.resultJson) : null, target: prev.targetType ? { type: prev.targetType, id: prev.targetId } : null, replayed: true }
      }
    }

    const result = await tool.run(ctx, input)
    const target = result.target ?? null
    try {
      await trace(ctx, tool.name, tool.kind, started, { status: 'ok', target, idempotencyKey: key, resultJson: key ? JSON.stringify(result.output) : null })
    } catch {
      // Carrera con otra llamada idéntica: ya hay un resultado guardado para esta clave.
    }
    return { ok: true, tool: tool.name, output: result.output, target }
  } catch (e: any) {
    const err = toToolError(e)
    await trace(ctx, tool.name, tool.kind, started, { status: 'error', errorCode: err.code })
    return { ok: false, tool: tool.name, error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } }
  }
}
