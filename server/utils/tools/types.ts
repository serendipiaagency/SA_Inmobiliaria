import type { H3Event } from 'h3'
import type { AdminArea } from '../../../utils/adminAreas'
import type { SessionUser } from '../auth'

/**
 * Domain Tools API (FASE 31) — contrato común de cada herramienta
 * inmobiliaria. Una herramienta NUNCA accede a la base de datos por su
 * cuenta ni reimplementa reglas: autoriza, valida y delega en el servicio
 * de dominio que ya usa el panel (§26). Lo que devuelve es un DTO compacto
 * (§50), nunca la fila entera.
 */

export const TOOL_ERROR_CODES = [
  'NOT_FOUND',
  'AMBIGUOUS_ENTITY',
  'VALIDATION_ERROR',
  'PERMISSION_DENIED',
  'CONFLICT',
  'DUPLICATE',
  'PROVIDER_ERROR',
  'PROPERTY_NOT_PUBLISHABLE',
  'CONFIRMATION_REQUIRED',
  'UNKNOWN_TOOL',
  'INTERNAL_ERROR',
] as const
export type ToolErrorCode = (typeof TOOL_ERROR_CODES)[number]

/** Error tipado que la IA (o cualquier cliente) puede interpretar (§49). */
export class ToolError extends Error {
  constructor(
    public code: ToolErrorCode,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message)
  }
}

export interface ToolContext {
  event: H3Event
  db: any
  env: Record<string, any>
  orgId: number
  user: SessionUser
  /**
   * Quién origina la llamada: la API directa, el asistente INMO (también sus
   * workflows guiados) o una automatización (server/utils/automations), que
   * se ejecuta con el usuario que la configuró.
   */
  source: 'api' | 'inmo' | 'automation'
}

/** JSON Schema mínimo (lo que entiende la API de herramientas de los modelos), sin dependencias. */
export interface ToolJsonSchema {
  type: 'object'
  properties: Record<string, any>
  required?: string[]
  additionalProperties?: boolean
}

export interface ToolResult<O = unknown> {
  output: O
  /** Entidad afectada o principal — para la traza (§47) y el contexto de INMO (§16). */
  target?: { type: string; id: number } | null
}

export interface DomainTool<I = any, O = any> {
  name: string
  description: string
  kind: 'read' | 'write'
  /** Permiso real exigido (RBAC por área). Nunca lo decide el modelo (§21). */
  area: AdminArea
  action: 'read' | 'write'
  inputSchema: ToolJsonSchema
  /** Valida y normaliza la entrada; lanza VALIDATION_ERROR. */
  parse: (raw: Record<string, unknown>) => I
  run: (ctx: ToolContext, input: I) => Promise<ToolResult<O>>
  /** Consecuencias externas o comerciales: necesita confirmación explícita (§20). */
  requiresConfirmation?: boolean
  /** Admite `idempotencyKey` (§48). */
  idempotent?: boolean
}
