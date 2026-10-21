import { and, desc, eq, isNull, or } from 'drizzle-orm'
import { createError } from 'h3'
import { schema, now } from '../db'
import { validateStructure, type TemplateStructure } from '../assetExport/types'
import { FORMAT_BY_KEY } from '../assetExport/formats'

/**
 * «Carteles de escaparate» (Cola 20) — módulo INDEPENDIENTE para componer
 * carteles y folletos de una propiedad y exportarlos a PDF. Tiene su propia
 * persistencia (poster_templates / poster_projects / poster_renders,
 * migración 0101) pero comparte con Asset Export Studio el formato de
 * documento del editor de bloques (`TemplateStructure`), el registro de
 * formatos y el renderizador pdf-lib como piezas de bajo nivel. Sólo PDF por
 * ahora (la exportación a imagen depende de activar Browser Rendering en
 * Cloudflare, decisión del propietario).
 *
 * Multi-tenant por `organization_id`. Una plantilla con `organization_id` NULL
 * es de SISTEMA (sólo lectura): la agencia la duplica para editarla.
 */

/** Formatos de cartel admitidos (todos PDF, renderizables hoy con pdf-lib). */
export const POSTER_FORMAT_KEYS = ['print_a3_portrait', 'print_a3_landscape', 'pdf_a4_portrait', 'pdf_a4_landscape'] as const
export type PosterFormatKey = (typeof POSTER_FORMAT_KEYS)[number]

/** Tipos de propiedad que un cartel puede retratar (reutiliza los bindings de Asset Export). */
export const POSTER_ASSET_KINDS = ['developer_property', 'agent_property'] as const

export function isPosterFormat(key: unknown): key is PosterFormatKey {
  return typeof key === 'string' && (POSTER_FORMAT_KEYS as readonly string[]).includes(key) && !!FORMAT_BY_KEY[key]
}

function requireOrgId(orgId: number | null | undefined): number {
  if (orgId == null) throw createError({ statusCode: 403, statusMessage: 'No active organization for this request' })
  return orgId
}

const clampText = (v: unknown, max: number) => String(v ?? '').slice(0, max)

/** Saneado de la estructura del editor de bloques → JSON para guardar. */
export function normalizeStructureJson(input: unknown): string {
  const parsed = typeof input === 'string' ? safeJson(input) : input
  const res = validateStructure(parsed ?? { pages: [] })
  if (!res.ok) throw createError({ statusCode: 422, statusMessage: `Estructura no válida: ${res.error}` })
  return JSON.stringify(res.structure)
}
function safeJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return { pages: [] }
  }
}

function requireFormat(key: unknown): PosterFormatKey {
  if (!isPosterFormat(key)) throw createError({ statusCode: 422, statusMessage: 'Formato de cartel no válido' })
  return key
}

/**
 * Un cartel de partida razonable para un formato: foto principal arriba y, en
 * la banda inferior, el título, el precio (con el color de marca), la
 * ubicación, la referencia, el logo y el QR. Las coordenadas van en puntos
 * desde arriba-izquierda, como el renderizador. Así una plantilla recién
 * creada ya produce un PDF con sentido antes de tocar el editor; las
 * plantillas de sistema (siguiente incremento) traen variantes más pulidas.
 */
export function defaultPosterStructure(formatKey: PosterFormatKey): TemplateStructure {
  const fmt = FORMAT_BY_KEY[formatKey]!
  const W = fmt.widthPt
  const H = fmt.heightPt
  const m = Math.round(W * 0.06) // margen
  const photoH = Math.round(H * 0.55)
  const band = H - photoH // banda inferior para los datos
  const text = (id: string, binding: string, y: number, h: number, style: Record<string, unknown>) => ({ id, type: 'text' as const, x: m, y, w: W - 2 * m, h, binding, style })
  return {
    pages: [
      {
        id: 'p1',
        elements: [
          { id: 'photo', type: 'image', x: 0, y: 0, w: W, h: photoH, binding: '{{asset.mainImage}}', zIndex: 0 },
          { id: 'logo', type: 'image', x: W - m - 90, y: Math.round(photoH + band * 0.12), w: 90, h: 36, binding: '{{tenant.logo}}', zIndex: 2 },
          text('title', '{{asset.title}}', Math.round(photoH + band * 0.1), 40, { fontSize: 26, bold: true, color: '#16150f' }),
          text('price', '{{asset.price}}', Math.round(photoH + band * 0.32), 40, { fontSize: 32, bold: true, color: '#B08D57' }),
          text('location', '{{asset.location}}', Math.round(photoH + band * 0.52), 28, { fontSize: 15, color: '#57524a' }),
          text('reference', '{{asset.reference}}', Math.round(photoH + band * 0.68), 22, { fontSize: 11, color: '#8a867e' }),
          { id: 'qr', type: 'qr', x: W - m - 96, y: H - m - 96, w: 96, h: 96, binding: '{{asset.qrCode}}', zIndex: 2 },
        ],
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// Plantillas de cartel
// ---------------------------------------------------------------------------

export interface PosterTemplateRow {
  id: number
  name: string
  description: string | null
  category: string
  formatKey: string
  isSystem: boolean
  status: string
  structure: TemplateStructure
  createdAt: string
  updatedAt: string
}

const rowToTemplate = (r: any): PosterTemplateRow => ({
  id: r.id,
  name: r.name,
  description: r.description ?? null,
  category: r.category,
  formatKey: r.formatKey,
  isSystem: !!r.isSystem || r.organizationId == null,
  status: r.status,
  structure: safeStructure(r.structureJson),
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
})
function safeStructure(json: unknown): TemplateStructure {
  const res = validateStructure(typeof json === 'string' ? safeJson(json) : json)
  return res.ok ? res.structure : { pages: [] }
}

/** Las plantillas visibles para la empresa: las de sistema publicadas + las suyas. */
export async function listPosterTemplates(db: any, orgIdInput: number | null): Promise<PosterTemplateRow[]> {
  const orgId = requireOrgId(orgIdInput)
  const rows = await db
    .select()
    .from(schema.posterTemplates)
    .where(
      or(
        eq(schema.posterTemplates.organizationId, orgId),
        and(isNull(schema.posterTemplates.organizationId), eq(schema.posterTemplates.status, 'published')),
      ),
    )
    .orderBy(desc(schema.posterTemplates.updatedAt), desc(schema.posterTemplates.id))
    .limit(500)
  return rows.map(rowToTemplate)
}

/** Una plantilla que la empresa puede ver (suya, o de sistema publicada). */
export async function getPosterTemplate(db: any, orgIdInput: number | null, id: number): Promise<PosterTemplateRow> {
  const orgId = requireOrgId(orgIdInput)
  const [row] = await db.select().from(schema.posterTemplates).where(eq(schema.posterTemplates.id, id)).limit(1)
  const visible = row && (row.organizationId === orgId || (row.organizationId == null && row.status === 'published'))
  if (!visible) throw createError({ statusCode: 404, statusMessage: 'Plantilla no encontrada' })
  return rowToTemplate(row)
}

export async function createPosterTemplate(db: any, orgIdInput: number | null, input: { name?: unknown; description?: unknown; category?: unknown; formatKey?: unknown; structure?: unknown }, userId: number | null): Promise<PosterTemplateRow> {
  const orgId = requireOrgId(orgIdInput)
  const name = clampText(input.name, 120).trim()
  if (!name) throw createError({ statusCode: 422, statusMessage: 'Ponle un nombre a la plantilla' })
  const formatKey = requireFormat(input.formatKey)
  const ts = now()
  const [row] = await db
    .insert(schema.posterTemplates)
    .values({
      organizationId: orgId,
      name,
      description: input.description != null ? clampText(input.description, 300) : null,
      category: clampText(input.category, 40).trim() || 'escaparate',
      formatKey,
      isSystem: 0,
      status: 'draft',
      // Sin estructura explícita, una plantilla de cartel con sentido de partida.
      structureJson: normalizeStructureJson(input.structure ?? defaultPosterStructure(formatKey)),
      createdBy: userId ?? null,
      createdAt: ts,
      updatedAt: ts,
    })
    .returning()
  return rowToTemplate(row)
}

/** Sólo se editan las plantillas propias; las de sistema son de sólo lectura (se duplican). */
export async function updatePosterTemplate(db: any, orgIdInput: number | null, id: number, input: { name?: unknown; description?: unknown; category?: unknown; formatKey?: unknown; structure?: unknown; status?: unknown }): Promise<PosterTemplateRow> {
  const orgId = requireOrgId(orgIdInput)
  const where = and(eq(schema.posterTemplates.organizationId, orgId), eq(schema.posterTemplates.id, id))
  const [existing] = await db.select().from(schema.posterTemplates).where(where).limit(1)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Plantilla no encontrada' })
  const patch: Record<string, unknown> = { updatedAt: now() }
  if (input.name !== undefined) {
    const name = clampText(input.name, 120).trim()
    if (!name) throw createError({ statusCode: 422, statusMessage: 'Ponle un nombre a la plantilla' })
    patch.name = name
  }
  if (input.description !== undefined) patch.description = input.description != null ? clampText(input.description, 300) : null
  if (input.category !== undefined) patch.category = clampText(input.category, 40).trim() || 'escaparate'
  if (input.formatKey !== undefined) patch.formatKey = requireFormat(input.formatKey)
  if (input.structure !== undefined) patch.structureJson = normalizeStructureJson(input.structure)
  if (input.status === 'draft' || input.status === 'published') patch.status = input.status
  await db.update(schema.posterTemplates).set(patch).where(where)
  const [row] = await db.select().from(schema.posterTemplates).where(where).limit(1)
  return rowToTemplate(row)
}

export async function deletePosterTemplate(db: any, orgIdInput: number | null, id: number): Promise<void> {
  const orgId = requireOrgId(orgIdInput)
  const where = and(eq(schema.posterTemplates.organizationId, orgId), eq(schema.posterTemplates.id, id))
  const [row] = await db.select({ id: schema.posterTemplates.id }).from(schema.posterTemplates).where(where).limit(1)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Plantilla no encontrada' })
  await db.delete(schema.posterTemplates).where(where)
}

/** Duplica una plantilla visible (de sistema o propia) a una nueva plantilla de la empresa, editable. */
export async function duplicatePosterTemplate(db: any, orgIdInput: number | null, id: number, userId: number | null): Promise<PosterTemplateRow> {
  const orgId = requireOrgId(orgIdInput)
  const source = await getPosterTemplate(db, orgId, id)
  const ts = now()
  const [row] = await db
    .insert(schema.posterTemplates)
    .values({
      organizationId: orgId,
      name: clampText(`${source.name} (copia)`, 120),
      description: source.description,
      category: source.category,
      formatKey: source.formatKey,
      isSystem: 0,
      status: 'draft',
      structureJson: JSON.stringify(source.structure),
      duplicatedFromId: source.id,
      createdBy: userId ?? null,
      createdAt: ts,
      updatedAt: ts,
    })
    .returning()
  return rowToTemplate(row)
}

// ---------------------------------------------------------------------------
// Piezas (una plantilla aplicada a una propiedad)
// ---------------------------------------------------------------------------

export interface PosterProjectRow {
  id: number
  templateId: number | null
  assetKind: string
  assetId: number
  name: string
  formatKey: string
  status: string
  structure: TemplateStructure
  createdAt: string
  updatedAt: string
}

const rowToProject = (r: any): PosterProjectRow => ({
  id: r.id,
  templateId: r.templateId ?? null,
  assetKind: r.assetKind,
  assetId: r.assetId,
  name: r.name,
  formatKey: r.formatKey,
  status: r.status,
  structure: safeStructure(r.structureJson),
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
})

export async function listPosterProjects(db: any, orgIdInput: number | null): Promise<PosterProjectRow[]> {
  const orgId = requireOrgId(orgIdInput)
  const rows = await db
    .select()
    .from(schema.posterProjects)
    .where(eq(schema.posterProjects.organizationId, orgId))
    .orderBy(desc(schema.posterProjects.updatedAt), desc(schema.posterProjects.id))
    .limit(500)
  return rows.map(rowToProject)
}

export async function getPosterProject(db: any, orgIdInput: number | null, id: number): Promise<PosterProjectRow> {
  const orgId = requireOrgId(orgIdInput)
  const [row] = await db
    .select()
    .from(schema.posterProjects)
    .where(and(eq(schema.posterProjects.organizationId, orgId), eq(schema.posterProjects.id, id)))
    .limit(1)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Cartel no encontrado' })
  return rowToProject(row)
}

/** Crea una pieza a partir de una plantilla visible y una propiedad. Copia la estructura de la plantilla. */
export async function createPosterProject(db: any, orgIdInput: number | null, input: { templateId?: unknown; assetKind?: unknown; assetId?: unknown; name?: unknown }, userId: number | null): Promise<PosterProjectRow> {
  const orgId = requireOrgId(orgIdInput)
  const assetKind = String(input.assetKind ?? '')
  if (!(POSTER_ASSET_KINDS as readonly string[]).includes(assetKind)) throw createError({ statusCode: 422, statusMessage: 'Tipo de propiedad no válido' })
  const assetId = Number(input.assetId)
  if (!Number.isInteger(assetId) || assetId <= 0) throw createError({ statusCode: 422, statusMessage: 'Propiedad no válida' })
  const template = await getPosterTemplate(db, orgId, Number(input.templateId))
  const ts = now()
  const [row] = await db
    .insert(schema.posterProjects)
    .values({
      organizationId: orgId,
      templateId: template.id,
      assetKind,
      assetId,
      name: clampText(input.name, 120).trim() || template.name,
      formatKey: template.formatKey,
      status: 'draft',
      structureJson: JSON.stringify(template.structure),
      createdBy: userId ?? null,
      createdAt: ts,
      updatedAt: ts,
    })
    .returning()
  return rowToProject(row)
}

export async function updatePosterProject(db: any, orgIdInput: number | null, id: number, input: { name?: unknown; structure?: unknown; status?: unknown }): Promise<PosterProjectRow> {
  const orgId = requireOrgId(orgIdInput)
  const where = and(eq(schema.posterProjects.organizationId, orgId), eq(schema.posterProjects.id, id))
  const [existing] = await db.select().from(schema.posterProjects).where(where).limit(1)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Cartel no encontrado' })
  const patch: Record<string, unknown> = { updatedAt: now() }
  if (input.name !== undefined) {
    const name = clampText(input.name, 120).trim()
    if (!name) throw createError({ statusCode: 422, statusMessage: 'Ponle un nombre al cartel' })
    patch.name = name
  }
  if (input.structure !== undefined) patch.structureJson = normalizeStructureJson(input.structure)
  if (input.status === 'draft' || input.status === 'ready') patch.status = input.status
  await db.update(schema.posterProjects).set(patch).where(where)
  const [row] = await db.select().from(schema.posterProjects).where(where).limit(1)
  return rowToProject(row)
}

export async function deletePosterProject(db: any, orgIdInput: number | null, id: number): Promise<void> {
  const orgId = requireOrgId(orgIdInput)
  const where = and(eq(schema.posterProjects.organizationId, orgId), eq(schema.posterProjects.id, id))
  const [row] = await db.select({ id: schema.posterProjects.id }).from(schema.posterProjects).where(where).limit(1)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Cartel no encontrado' })
  await db.delete(schema.posterProjects).where(where)
}

/** Un render concreto que la empresa puede ver (para la descarga). */
export async function getPosterRender(db: any, orgIdInput: number | null, id: number) {
  const orgId = requireOrgId(orgIdInput)
  const [row] = await db
    .select()
    .from(schema.posterRenders)
    .where(and(eq(schema.posterRenders.organizationId, orgId), eq(schema.posterRenders.id, id)))
    .limit(1)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Descarga no encontrada' })
  return row
}
