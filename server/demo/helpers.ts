import type { SessionUser } from '../utils/auth'
import { storeAndRegisterFile } from '../utils/media'
import type { MediaCategory, MediaVisibility } from '../utils/mediaAssets'
import { COMMERCIALS, DEMO_ADMIN, COMMERCIAL_PERMISSIONS } from './dataset/company'
import { PROPERTIES, type DemoPropertyKind } from './dataset/properties'
import { ctxId, type DemoContext } from './context'

/**
 * Atajos del seed: ids reales a partir de las claves estables del dataset, el
 * usuario que hace cada acción y la subida de imágenes por el mismo camino
 * que la del panel (validación, cuota, biblioteca de medios).
 */

export const propertyKindOf = (key: string): DemoPropertyKind => {
  const p = PROPERTIES.find((x) => x.key === key)
  if (!p) throw new Error(`Demo: propiedad desconocida ${key}`)
  return p.kind
}

export const propertyId = (ctx: DemoContext, key: string) => ctxId(ctx, `prop:${key}`)
export const contactId = (ctx: DemoContext, key: string) => ctxId(ctx, `contact:${key}`)
export const leadId = (ctx: DemoContext, key: string) => ctxId(ctx, `lead:${key}`)
export const commercialId = (ctx: DemoContext, key: string) => ctxId(ctx, `tm:${key}`)
export const officeId = (ctx: DemoContext, key: string) => ctxId(ctx, `office:${key}`)
export const teamId = (ctx: DemoContext, key: string) => ctxId(ctx, `team:${key}`)
export const requirementId = (ctx: DemoContext, key: string) => ctxId(ctx, `req:${key}`)

export function hasId(ctx: DemoContext, key: string): boolean {
  return Boolean(ctx.state.ids[key])
}

/** El usuario del panel con el que actúa una persona del escenario (la gerente o un comercial). */
export function actingUser(ctx: DemoContext, personKey: string): SessionUser {
  if (personKey === DEMO_ADMIN.key) {
    return { id: ctxId(ctx, `user:${DEMO_ADMIN.key}`), name: DEMO_ADMIN.name, email: DEMO_ADMIN.email, role: 'admin', organizationId: ctx.state.orgId, permissions: null }
  }
  const c = COMMERCIALS.find((x) => x.key === personKey)
  if (!c) throw new Error(`Demo: persona desconocida ${personKey}`)
  return { id: ctxId(ctx, `user:${c.key}`), name: c.name, email: c.email, role: 'admin', organizationId: ctx.state.orgId, permissions: COMMERCIAL_PERMISSIONS }
}

export function orgId(ctx: DemoContext): number {
  if (!ctx.state.orgId) throw new Error('Demo: la empresa todavía no existe')
  return ctx.state.orgId
}

const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' }

/**
 * Sube una imagen de public/demo-assets/norte-astur/ a la biblioteca de medios
 * de la empresa demo (R2 + media_assets, con su cuota) y devuelve la clave.
 * Cada imagen se sube una vez por entidad (una foto del entorno que aparece en
 * dos fichas son dos ficheros, como si las hubiera subido cada comercial): si ya
 * está, devuelve la clave guardada.
 */
export async function uploadDemoAsset(
  ctx: DemoContext,
  path: string,
  opts: { category: MediaCategory; visibility?: MediaVisibility; entityType?: string | null; entityId?: number | null; createdBy?: number | null },
): Promise<string> {
  const cacheKey = opts.entityType && opts.entityId ? `${path}@${opts.entityType}:${opts.entityId}` : path
  const cached = ctx.state.media[cacheKey]
  if (cached) return cached
  const bytes = await ctx.assets.load(path)
  const ext = path.split('.').pop()!.toLowerCase()
  const stored = await storeAndRegisterFile(
    ctx.event,
    ctx.db,
    { data: bytes, type: MIME[ext] || 'application/octet-stream', filename: path.split('/').pop() },
    { organizationId: orgId(ctx), visibility: opts.visibility ?? 'public', category: opts.category, entityType: opts.entityType ?? null, entityId: opts.entityId ?? null, createdBy: opts.createdBy ?? null },
  )
  ctx.state.media[cacheKey] = stored.key
  return stored.key
}

/** Foto de una persona (retrato fotográfico CC0, ver CREDITOS.md). */
export const personPhotoPath = (key: string) => `personas/${key}.jpg`
