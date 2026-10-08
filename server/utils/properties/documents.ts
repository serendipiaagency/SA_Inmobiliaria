import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { createError, type H3Event } from 'h3'
import { now, schema } from '../db'
import type { SessionUser } from '../auth'
import { logAdminAction } from '../audit'
import { storeAndRegisterFile } from '../media'
import { findOwnedMediaAsset, restoreMediaAssetByKey, softDeleteMediaAsset } from '../mediaAssets'
import { selectInChunks } from '../sqlChunks'
import { assertLiveProperty, propertyState } from './trash'
import { OWNERSHIP_ROLES } from '../../../utils/crmCatalog'
import { DOCUMENT_VISIBILITIES, DOCUMENT_VISIBILITY_LABELS, PROPERTY_DOCUMENT_TYPES, PROPERTY_DOCUMENT_TYPE_LABELS } from '../../../utils/propertySheet'
import {
  DOCUMENT_EXPIRY_LABELS,
  DOCUMENT_MAX_MB,
  documentAccessLevel,
  documentExpiryState,
  todayIsoDate,
  type DocumentExpiryState,
} from '../../../utils/propertyMediaCatalog'

/**
 * Gestor documental de una propiedad (FASE 6, bloque N7a): escrituras, notas
 * simples, IBI, certificados, planos, contratos… con su permiso por rol.
 *
 *  - **Subir**: `POST /api/admin/property-documents/private-upload` (la
 *    subida privada que ya existía, ampliada a este recurso). PDF o imagen,
 *    validados con las utilidades de siempre (bytes mágicos, PDF que abre,
 *    imagen con dimensiones reales), a R2 bajo la organización y registrado
 *    en `media_assets` como `confidential` (cada lectura queda en
 *    `media_access_log`).
 *  - **Listar / editar / papelera / restaurar / borrar**: el motor CRUD
 *    genérico (`property-documents` en adminResources.ts).
 *  - **Conceder / revocar** a un contacto: `PUT /api/admin/property-documents/:id`
 *    con `{ action: 'grant' | 'revoke', contactId }`.
 *  - **Descargar**: `/api/media/<clave>`. Para estos ficheros el endpoint de
 *    media no mira la visibilidad del fichero sino la del documento
 *    (`decideDocumentAccess`, abajo).
 *
 * Quién puede descargar (cada nivel incluye a los anteriores):
 *
 * | Visibilidad | Quién |
 * |---|---|
 * | interno | usuarios del panel de la agencia con lectura de propiedades |
 * | propietario | + los contactos propietario/copropietario de esa propiedad (desde «Mi cuenta») |
 * | comprador autorizado | + los contactos con acceso concedido (desde «Mi cuenta») |
 * | público | + cualquiera, sólo si la propiedad está publicada y viva |
 *
 * Nunca se sirve un documento en la papelera, ni uno de otra agencia, ni (a un
 * contacto o al público) uno de una propiedad en la papelera.
 */

type PropertyKind = 'agent' | 'developer'

/** `media_assets.entity_type` de los ficheros de este gestor: es lo que hace que /api/media aplique estas reglas. */
export const PROPERTY_DOCUMENT_ENTITY = 'property_documents'

export const DOCUMENT_ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
export const DOCUMENT_MAX_BYTES = DOCUMENT_MAX_MB * 1024 * 1024

const DATE = /^\d{4}-\d{2}-\d{2}$/

function fail(statusCode: number, statusMessage: string): never {
  throw createError({ statusCode, statusMessage })
}

function assertKind(kind: unknown): PropertyKind {
  if (kind !== 'agent' && kind !== 'developer') fail(422, 'propertyKind debe ser "agent" (2ª mano) o "developer" (web)')
  return kind
}

function cleanDate(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === '') return null
  const s = String(value).trim().slice(0, 10)
  if (!DATE.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) fail(422, `${label}: usa el formato AAAA-MM-DD`)
  return s
}

/**
 * Valida y normaliza los metadatos de un documento que trae un cuerpo (sólo
 * los presentes). En el alta exige tipo y título. La caducidad no puede ser
 * anterior a la emisión.
 */
export function documentInputFromBody(body: Record<string, any>, opts: { isCreate: boolean; existing?: Record<string, any> | null } = { isCreate: false }): Record<string, any> {
  const out: Record<string, any> = {}
  if ('docType' in body || opts.isCreate) {
    const v = String(body.docType ?? '')
    if (!(PROPERTY_DOCUMENT_TYPES as readonly string[]).includes(v)) fail(422, 'Tipo de documento no válido')
    out.docType = v
  }
  if ('title' in body || opts.isCreate) {
    const t = String(body.title ?? '').trim()
    if (!t) fail(422, 'El título es obligatorio')
    if (t.length > 200) fail(422, 'El título admite como máximo 200 caracteres')
    out.title = t
  }
  if ('visibility' in body) {
    const v = String(body.visibility ?? '')
    if (!(DOCUMENT_VISIBILITIES as readonly string[]).includes(v)) fail(422, 'Visibilidad no válida')
    out.visibility = v
  }
  if ('issuedAt' in body) out.issuedAt = cleanDate(body.issuedAt, 'Fecha de emisión')
  if ('expiresAt' in body) out.expiresAt = cleanDate(body.expiresAt, 'Fecha de caducidad')
  if ('notes' in body) {
    const n = body.notes === null || body.notes === undefined ? '' : String(body.notes).trim()
    if (n.length > 4000) fail(422, 'Las notas admiten como máximo 4000 caracteres')
    out.notes = n || null
  }
  const issued = 'issuedAt' in out ? out.issuedAt : (opts.existing?.issuedAt ?? null)
  const expires = 'expiresAt' in out ? out.expiresAt : (opts.existing?.expiresAt ?? null)
  if (issued && expires && expires < issued) fail(422, 'La fecha de caducidad no puede ser anterior a la de emisión')
  return out
}

/** Nombre de fichero seguro para guardar y para la cabecera de descarga. */
export function safeFileName(name: unknown): string | null {
  if (typeof name !== 'string') return null
  const base = name.split(/[\\/]/).pop() || ''
  const clean = base
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.\- ()]+/g, '_')
    .trim()
    .slice(0, 150)
  return clean || null
}

type MultipartPart = { name?: string; filename?: string; type?: string; data: Buffer | Uint8Array }

function fieldsFromParts(parts: MultipartPart[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of parts) {
    if (!p.name || p.filename !== undefined) continue
    out[p.name] = new TextDecoder().decode(p.data)
  }
  return out
}

/**
 * Alta de un documento con su fichero, en una sola petición multipart
 * (`file` + `propertyKind`, `propertyId`, `docType`, `title`, `visibility`,
 * `issuedAt`, `expiresAt`, `notes`). Todo se valida ANTES de escribir en R2:
 * propiedad de la agencia y viva (404 / 422), metadatos (422) y el propio
 * fichero (tipo real, PDF que abre, imagen íntegra, tamaño y cuota).
 */
export async function createPropertyDocumentFromUpload(event: H3Event, db: any, orgId: number, user: SessionUser, parts: MultipartPart[]) {
  const file = parts.find((p) => p.name === 'file' && p.data?.byteLength)
  if (!file) fail(422, 'Falta el fichero del documento')
  const fields = fieldsFromParts(parts)
  const kind = assertKind(fields.propertyKind)
  const propertyId = Number(fields.propertyId)
  if (!Number.isInteger(propertyId) || propertyId <= 0) fail(422, 'Falta la propiedad')
  await assertLiveProperty(db, orgId, kind, propertyId, { action: 'añadirle documentos' })
  const meta = documentInputFromBody({ visibility: 'internal', ...fields }, { isCreate: true })

  const stored = await storeAndRegisterFile(event, db, file, {
    organizationId: orgId,
    visibility: 'confidential',
    category: 'property-document',
    entityType: PROPERTY_DOCUMENT_ENTITY,
    createdBy: user.id,
    allowedTypes: DOCUMENT_ALLOWED_TYPES,
    maxBytes: DOCUMENT_MAX_BYTES,
  })

  const ts = now()
  const [doc] = await db
    .insert(schema.propertyDocuments)
    .values({
      organizationId: orgId,
      propertyKind: kind,
      propertyId,
      docType: meta.docType,
      title: meta.title,
      visibility: meta.visibility || 'internal',
      issuedAt: meta.issuedAt ?? null,
      expiresAt: meta.expiresAt ?? null,
      notes: meta.notes ?? null,
      r2Key: stored.key,
      mediaAssetId: stored.mediaAssetId,
      fileName: safeFileName(file.filename) || `documento.${stored.extension}`,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      createdBy: user.id,
      createdAt: ts,
      updatedAt: ts,
    })
    .returning()
  // El fichero sabe de qué documento es (para el endpoint de media y la auditoría).
  await db
    .update(schema.mediaAssets)
    .set({ entityId: doc.id, updatedAt: ts })
    .where(and(eq(schema.mediaAssets.id, stored.mediaAssetId), eq(schema.mediaAssets.organizationId, orgId)))
  await logAdminAction(event, { user, orgId, action: 'create', resource: 'property-documents', resourceId: doc.id, detail: `${kind} #${propertyId} · ${doc.docType}` })
  return { ok: true, id: doc.id, document: decorateDocument(doc) }
}

/**
 * Edición de los metadatos. La propiedad y el fichero no se cambian por aquí
 * (422): un documento es de su propiedad. Editar uno que está en la papelera,
 * o de una propiedad en la papelera, se permite (lo histórico se puede
 * corregir); lo que no se permite es dar acceso nuevo sobre ellos.
 */
export function documentUpdateFromBody(body: Record<string, any>, existing: Record<string, any>): Record<string, any> {
  if ('propertyKind' in body && body.propertyKind !== existing.propertyKind) fail(422, 'Un documento no se puede mover a otra propiedad')
  if ('propertyId' in body && Number(body.propertyId) !== Number(existing.propertyId)) fail(422, 'Un documento no se puede mover a otra propiedad')
  const data = documentInputFromBody(body, { isCreate: false, existing })
  if (Object.keys(data).length) data.updatedAt = now()
  return data
}

// ---------------------------------------------------------------------------
// Acceso concedido a un contacto (property_document_access)
// ---------------------------------------------------------------------------

async function assertContactOwned(db: any, orgId: number, contactId: number) {
  if (!Number.isInteger(contactId) || contactId <= 0) fail(422, 'Falta el contacto')
  const [c] = await db
    .select({ id: schema.contacts.id })
    .from(schema.contacts)
    .where(and(eq(schema.contacts.id, contactId), eq(schema.contacts.organizationId, orgId), isNull(schema.contacts.deletedAt)))
    .limit(1)
  if (!c) fail(404, 'Contacto no encontrado')
}

/**
 * Concede a un contacto acceso a un documento. Es algo nuevo sobre el
 * documento y su propiedad: no si el documento o la propiedad están en la
 * papelera (422). El contacto tiene que ser de la agencia (404). Conceder dos
 * veces no duplica nada. El acceso sólo cuenta mientras el documento sea
 * «comprador autorizado» o «público» — con «interno» o «propietario» se
 * conserva, pero no da acceso (el panel lo avisa).
 */
export async function grantDocumentAccess(db: any, orgId: number, userId: number, doc: Record<string, any>, contactId: number) {
  if (doc.deletedAt) fail(422, 'El documento está en la papelera: restáuralo antes de dar acceso.')
  await assertLiveProperty(db, orgId, doc.propertyKind, doc.propertyId, { action: 'dar acceso a sus documentos' })
  await assertContactOwned(db, orgId, contactId)
  const [existing] = await db
    .select({ id: schema.propertyDocumentAccess.id })
    .from(schema.propertyDocumentAccess)
    .where(and(eq(schema.propertyDocumentAccess.organizationId, orgId), eq(schema.propertyDocumentAccess.documentId, doc.id), eq(schema.propertyDocumentAccess.contactId, contactId)))
    .limit(1)
  if (!existing) {
    await db.insert(schema.propertyDocumentAccess).values({ organizationId: orgId, documentId: doc.id, contactId, grantedBy: userId, createdAt: now() })
  }
  return { ok: true, granted: true, alreadyGranted: !!existing }
}

/** Revoca el acceso de un contacto (siempre se puede, también en la papelera). */
export async function revokeDocumentAccess(db: any, orgId: number, doc: Record<string, any>, contactId: number) {
  await assertContactOwned(db, orgId, contactId)
  await db
    .delete(schema.propertyDocumentAccess)
    .where(and(eq(schema.propertyDocumentAccess.organizationId, orgId), eq(schema.propertyDocumentAccess.documentId, doc.id), eq(schema.propertyDocumentAccess.contactId, contactId)))
  return { ok: true, granted: false }
}

/** Los contactos con acceso concedido a cada documento, con su nombre. */
export async function listDocumentGrants(db: any, orgId: number, documentIds: number[]): Promise<Map<number, { contactId: number; name: string | null; email: string | null; grantedAt: string }[]>> {
  const out = new Map<number, { contactId: number; name: string | null; email: string | null; grantedAt: string }[]>()
  if (!documentIds.length) return out
  const rows = await selectInChunks(documentIds, (part) =>
    db
      .select({
        documentId: schema.propertyDocumentAccess.documentId,
        contactId: schema.propertyDocumentAccess.contactId,
        grantedAt: schema.propertyDocumentAccess.createdAt,
        name: schema.contacts.name,
        email: schema.contacts.email,
      })
      .from(schema.propertyDocumentAccess)
      .innerJoin(schema.contacts, and(eq(schema.contacts.id, schema.propertyDocumentAccess.contactId), eq(schema.contacts.organizationId, orgId)))
      .where(and(eq(schema.propertyDocumentAccess.organizationId, orgId), inArray(schema.propertyDocumentAccess.documentId, part)))
      .orderBy(asc(schema.propertyDocumentAccess.id)),
  )
  for (const r of rows as any[]) {
    const { documentId, ...g } = r
    ;(out.get(documentId) || out.set(documentId, []).get(documentId)!).push(g)
  }
  return out
}

// ---------------------------------------------------------------------------
// Papelera y borrado definitivo del fichero
// ---------------------------------------------------------------------------

/** Al mandar el documento a la papelera su fichero deja de servirse y de contar en la cuota (se purga a los 30 días si no se restaura). */
export async function trashDocumentFile(db: any, orgId: number, doc: Record<string, any>) {
  if (!doc.r2Key) return
  const asset = await findOwnedMediaAsset(db, orgId, doc.r2Key)
  if (asset) await softDeleteMediaAsset(db, asset.id)
}

/** Restaurar el documento devuelve su fichero, salvo que el cron ya lo haya purgado (409: no hay bytes que devolver). */
export async function restoreDocumentFile(db: any, orgId: number, doc: Record<string, any>) {
  if (!doc.r2Key) return
  const [asset] = await db
    .select({ id: schema.mediaAssets.id, purgedAt: schema.mediaAssets.purgedAt })
    .from(schema.mediaAssets)
    .where(and(eq(schema.mediaAssets.r2Key, doc.r2Key), eq(schema.mediaAssets.organizationId, orgId)))
    .limit(1)
  if (!asset) return
  if (asset.purgedAt) fail(409, 'El fichero de este documento ya se borró definitivamente del almacenamiento: no se puede restaurar.')
  await restoreMediaAssetByKey(db, doc.r2Key)
}

/** Borrado definitivo (desde la papelera): el objeto de R2 se borra ya, el registro queda como borrado y los accesos concedidos se van. */
export async function purgeDocumentFile(db: any, bucket: { delete: (key: string) => Promise<unknown> } | null, orgId: number, doc: Record<string, any>) {
  await db.delete(schema.propertyDocumentAccess).where(and(eq(schema.propertyDocumentAccess.organizationId, orgId), eq(schema.propertyDocumentAccess.documentId, doc.id)))
  if (!doc.r2Key) return
  const asset = await findOwnedMediaAsset(db, orgId, doc.r2Key)
  const [anyAsset] = asset ? [asset] : await db.select({ id: schema.mediaAssets.id }).from(schema.mediaAssets).where(and(eq(schema.mediaAssets.r2Key, doc.r2Key), eq(schema.mediaAssets.organizationId, orgId))).limit(1)
  if (!anyAsset) return
  if (bucket) await bucket.delete(doc.r2Key)
  if (asset) await softDeleteMediaAsset(db, asset.id)
}

/** Al borrar definitivamente una propiedad, sus documentos (sin FK) y sus ficheros se van con ella. */
export async function purgePropertyDocuments(db: any, bucket: { delete: (key: string) => Promise<unknown> } | null, orgId: number, kind: PropertyKind, propertyId: number): Promise<number> {
  const docs = await db
    .select()
    .from(schema.propertyDocuments)
    .where(and(eq(schema.propertyDocuments.organizationId, orgId), eq(schema.propertyDocuments.propertyKind, kind), eq(schema.propertyDocuments.propertyId, propertyId)))
  for (const doc of docs) await purgeDocumentFile(db, bucket, orgId, doc)
  if (docs.length) {
    await db
      .delete(schema.propertyDocuments)
      .where(and(eq(schema.propertyDocuments.organizationId, orgId), eq(schema.propertyDocuments.propertyKind, kind), eq(schema.propertyDocuments.propertyId, propertyId)))
  }
  return docs.length
}

// ---------------------------------------------------------------------------
// Quién puede descargar
// ---------------------------------------------------------------------------

export type DocumentViewer =
  | { kind: 'anonymous' }
  /** Usuario del panel: su organización activa y si puede leer propiedades (área `web`). */
  | { kind: 'staff'; orgId: number; userId: number; email: string | null; canReadProperties: boolean }
  /** Cliente del portal «Mi cuenta» (rol `user`): se le reconoce por su email, dentro de su agencia. */
  | { kind: 'client'; orgId: number; userId: number; email: string }

export type DocumentAccessVia = 'internal' | 'owner' | 'granted' | 'public'

export interface DocumentAccessDecision {
  allowed: boolean
  via: DocumentAccessVia | null
  /** Agencia del documento (para anotar el acceso), o null si el documento no existe. */
  orgId: number | null
}

/** ¿Está la propiedad publicada (con fecha de publicación) y viva? Es la condición para que un documento público lo sea de verdad. */
export async function isPropertyPublishedAndLive(db: any, orgId: number, kind: PropertyKind, propertyId: number): Promise<boolean> {
  const t = kind === 'agent' ? schema.agentProperties : schema.developerProperties
  const [row] = await db
    .select({ id: t.id, deletedAt: t.deletedAt, publishedAt: t.publishedAt })
    .from(t)
    .where(and(eq(t.id, propertyId), eq(t.organizationId, orgId)))
    .limit(1)
  return !!row && !row.deletedAt && !!row.publishedAt
}

/** Los contactos (vivos) de la agencia con este email: así se reconoce en «Mi cuenta» a un propietario o comprador. */
export async function contactIdsForEmail(db: any, orgId: number, email: string | null | undefined): Promise<number[]> {
  const normalized = String(email || '').trim().toLowerCase()
  if (!normalized) return []
  const rows = await db
    .select({ id: schema.contacts.id })
    .from(schema.contacts)
    .where(and(eq(schema.contacts.organizationId, orgId), isNull(schema.contacts.deletedAt), or(eq(schema.contacts.normalizedEmail, normalized), sql`lower(${schema.contacts.email}) = ${normalized}`)))
  return rows.map((r: any) => r.id)
}

/**
 * Por qué vía (si alguna) ven estos contactos cada documento. Propietario:
 * figuran como propietario/copropietario vivo de su propiedad y el documento
 * es al menos «propietario». Concedido: tienen fila en
 * property_document_access y el documento es al menos «comprador
 * autorizado». Público: el documento es público y la propiedad está publicada
 * y viva. Documentos en la papelera, de otra agencia o de propiedades en la
 * papelera: nunca.
 */
export async function contactDocumentAccess(db: any, orgId: number, contactIds: number[], docs: Record<string, any>[]): Promise<Map<number, DocumentAccessVia>> {
  const out = new Map<number, DocumentAccessVia>()
  const candidates = docs.filter((d) => d.organizationId === orgId && !d.deletedAt)
  if (!candidates.length) return out

  const owned = new Set<string>()
  if (contactIds.length) {
    const links = await selectInChunks(contactIds, (part) =>
      db
        .select({ propertyKind: schema.propertyContacts.propertyKind, propertyId: schema.propertyContacts.propertyId })
        .from(schema.propertyContacts)
        .where(
          and(
            eq(schema.propertyContacts.organizationId, orgId),
            inArray(schema.propertyContacts.contactId, part),
            inArray(schema.propertyContacts.role, [...OWNERSHIP_ROLES]),
            isNull(schema.propertyContacts.deletedAt),
          ),
        ),
    )
    for (const l of links as any[]) owned.add(`${l.propertyKind}:${l.propertyId}`)
  }
  const granted = new Set<number>()
  if (contactIds.length) {
    const docIds = candidates.map((d) => d.id)
    const grants = await selectInChunks(docIds, (part) =>
      db
        .select({ documentId: schema.propertyDocumentAccess.documentId, contactId: schema.propertyDocumentAccess.contactId })
        .from(schema.propertyDocumentAccess)
        .where(and(eq(schema.propertyDocumentAccess.organizationId, orgId), inArray(schema.propertyDocumentAccess.documentId, part))),
    )
    const ids = new Set(contactIds)
    for (const g of grants as any[]) if (ids.has(g.contactId)) granted.add(g.documentId)
  }

  // Estado de cada propiedad implicada (viva, publicada) — una consulta por catálogo.
  const state = new Map<string, { live: boolean; published: boolean }>()
  for (const kind of ['agent', 'developer'] as const) {
    const ids = [...new Set(candidates.filter((d) => d.propertyKind === kind).map((d) => d.propertyId))]
    if (!ids.length) continue
    const t = kind === 'agent' ? schema.agentProperties : schema.developerProperties
    const rows = await selectInChunks(ids, (part) =>
      db
        .select({ id: t.id, deletedAt: t.deletedAt, publishedAt: t.publishedAt })
        .from(t)
        .where(and(eq(t.organizationId, orgId), inArray(t.id, part))),
    )
    for (const r of rows as any[]) state.set(`${kind}:${r.id}`, { live: !r.deletedAt, published: !r.deletedAt && !!r.publishedAt })
  }

  for (const d of candidates) {
    const st = state.get(`${d.propertyKind}:${d.propertyId}`)
    if (!st || !st.live) continue
    const level = documentAccessLevel(d.visibility)
    if (level >= 1 && owned.has(`${d.propertyKind}:${d.propertyId}`)) out.set(d.id, 'owner')
    else if (level >= 2 && granted.has(d.id)) out.set(d.id, 'granted')
    else if (level >= 3 && st.published) out.set(d.id, 'public')
  }
  return out
}

/**
 * La decisión de descarga de UN documento para quien lo pide. La usa
 * `/api/media/<clave>` cuando el fichero es de este gestor. Un documento
 * borrado o que no casa con su fichero no existe (404); el equipo de la
 * agencia lo ve siempre que pueda leer propiedades (también el de una
 * propiedad en la papelera: es historia); el resto, según las reglas de
 * `contactDocumentAccess`.
 */
export async function decideDocumentAccess(db: any, asset: { organizationId: number; entityId: number | null; r2Key: string; deletedAt?: string | null }, viewer: DocumentViewer): Promise<DocumentAccessDecision> {
  const deny: DocumentAccessDecision = { allowed: false, via: null, orgId: asset.organizationId }
  if (asset.deletedAt || !asset.entityId) return deny
  const [doc] = await db
    .select()
    .from(schema.propertyDocuments)
    .where(and(eq(schema.propertyDocuments.id, asset.entityId), eq(schema.propertyDocuments.organizationId, asset.organizationId)))
    .limit(1)
  if (!doc || doc.deletedAt || doc.r2Key !== asset.r2Key) return deny
  const kind = doc.propertyKind as PropertyKind
  const st = await propertyState(db, doc.organizationId, kind, doc.propertyId)
  if (st === 'missing') return deny

  if (viewer.kind === 'staff') {
    if (viewer.orgId === doc.organizationId && viewer.canReadProperties) return { allowed: true, via: 'internal', orgId: doc.organizationId }
    return deny
  }
  if (st === 'trashed') return deny
  if (viewer.kind === 'client' && viewer.orgId === doc.organizationId) {
    const contacts = await contactIdsForEmail(db, doc.organizationId, viewer.email)
    const via = (await contactDocumentAccess(db, doc.organizationId, contacts, [doc])).get(doc.id)
    if (via) return { allowed: true, via, orgId: doc.organizationId }
    return deny
  }
  if (documentAccessLevel(doc.visibility) >= 3 && (await isPropertyPublishedAndLive(db, doc.organizationId, kind, doc.propertyId))) {
    return { allowed: true, via: 'public', orgId: doc.organizationId }
  }
  return deny
}

// ---------------------------------------------------------------------------
// Listados
// ---------------------------------------------------------------------------

export const ACCESS_VIA_LABELS: Record<DocumentAccessVia, string> = {
  internal: 'Equipo de la agencia',
  owner: 'Como propietario',
  granted: 'Acceso concedido',
  public: 'Público',
}

/** Campos derivados para el panel: etiquetas, estado de caducidad y URL de descarga. Nunca expone nada que no sea de la fila ya autorizada. */
export function decorateDocument<T extends Record<string, any>>(doc: T, today: string = todayIsoDate()) {
  const expiryState: DocumentExpiryState = documentExpiryState(doc.expiresAt, today)
  return {
    ...doc,
    docTypeLabel: PROPERTY_DOCUMENT_TYPE_LABELS[doc.docType] || doc.docType,
    visibilityLabel: DOCUMENT_VISIBILITY_LABELS[doc.visibility] || doc.visibility,
    expiryState,
    expiryLabel: DOCUMENT_EXPIRY_LABELS[expiryState],
    downloadUrl: doc.r2Key && !doc.deletedAt ? `/api/media/${doc.r2Key}` : null,
  }
}

/** Decoración del listado genérico de `property-documents`: etiquetas, caducidad, accesos concedidos y autor. */
export async function decorateDocumentRows(db: any, orgId: number, rows: any[]): Promise<any[]> {
  if (!rows.length) return rows
  const grants = await listDocumentGrants(db, orgId, rows.map((r) => r.id))
  const userIds = [...new Set(rows.map((r) => r.createdBy).filter(Boolean))]
  const users = await selectInChunks(userIds, (part) =>
    db
      .select({ id: schema.users.id, name: schema.users.name })
      .from(schema.users)
      .where(and(inArray(schema.users.id, part), or(eq(schema.users.organizationId, orgId), eq(schema.users.role, 'super_admin')))),
  )
  const names = new Map<number, string>(users.map((u: any) => [u.id, u.name]))
  const today = todayIsoDate()
  return rows.map((r) => {
    const g = grants.get(r.id) || []
    return {
      ...decorateDocument(r, today),
      grants: g,
      // Un acceso concedido sólo cuenta con «comprador autorizado» o «público».
      grantsEffective: documentAccessLevel(r.visibility) >= 2,
      createdByName: r.createdBy ? names.get(r.createdBy) || null : null,
    }
  })
}

/**
 * Los documentos que ve un contacto (pestaña «Documentos» de su ficha y
 * «Mi cuenta»): los de las propiedades en las que figura como propietario
 * (si son al menos «propietario»), los concedidos (si son al menos
 * «comprador autorizado») y los públicos de sus propiedades publicadas. Cada
 * uno dice por qué lo ve. Para el panel (`includeInactiveGrants`), además
 * los concedidos que hoy no dan acceso, marcados como tales.
 */
export async function listContactDocuments(db: any, orgId: number, contactIds: number[], opts: { includeInactiveGrants?: boolean } = {}) {
  if (!contactIds.length) return []
  const links = await selectInChunks(contactIds, (part) =>
    db
      .select({ propertyKind: schema.propertyContacts.propertyKind, propertyId: schema.propertyContacts.propertyId })
      .from(schema.propertyContacts)
      .where(and(eq(schema.propertyContacts.organizationId, orgId), inArray(schema.propertyContacts.contactId, part), isNull(schema.propertyContacts.deletedAt))),
  )
  const grantRows = await selectInChunks(contactIds, (part) =>
    db
      .select({ documentId: schema.propertyDocumentAccess.documentId })
      .from(schema.propertyDocumentAccess)
      .where(and(eq(schema.propertyDocumentAccess.organizationId, orgId), inArray(schema.propertyDocumentAccess.contactId, part))),
  )
  const grantedIds = [...new Set((grantRows as any[]).map((g) => g.documentId))]

  const docs = new Map<number, any>()
  for (const kind of ['agent', 'developer'] as const) {
    const ids = [...new Set((links as any[]).filter((l) => l.propertyKind === kind).map((l) => l.propertyId))]
    const rows = await selectInChunks(ids, (part) =>
      db
        .select()
        .from(schema.propertyDocuments)
        .where(and(eq(schema.propertyDocuments.organizationId, orgId), eq(schema.propertyDocuments.propertyKind, kind), inArray(schema.propertyDocuments.propertyId, part), isNull(schema.propertyDocuments.deletedAt))),
    )
    for (const r of rows as any[]) docs.set(r.id, r)
  }
  const granted = await selectInChunks(grantedIds, (part) =>
    db
      .select()
      .from(schema.propertyDocuments)
      .where(and(eq(schema.propertyDocuments.organizationId, orgId), inArray(schema.propertyDocuments.id, part), isNull(schema.propertyDocuments.deletedAt))),
  )
  for (const r of granted as any[]) docs.set(r.id, r)

  const all = [...docs.values()]
  const access = await contactDocumentAccess(db, orgId, contactIds, all)
  const grantedSet = new Set(grantedIds)
  const names = await propertyNames(db, orgId, all)
  const today = todayIsoDate()
  return all
    .filter((d) => access.has(d.id) || (opts.includeInactiveGrants && grantedSet.has(d.id)))
    .sort((a, b) => b.id - a.id)
    .slice(0, 200)
    .map((d) => {
      const via = access.get(d.id) || null
      const { notes: _notes, createdBy: _createdBy, mediaAssetId: _mediaAssetId, ...rest } = d
      const prop = names.get(`${d.propertyKind}:${d.propertyId}`)
      return {
        ...decorateDocument(rest, today),
        propertyName: prop?.name || `Propiedad #${d.propertyId}`,
        // Referencia interna: sólo para el panel (el portal del cliente no la recibe).
        propertyReference: prop?.reference ?? null,
        accessVia: via,
        accessLabel: via ? ACCESS_VIA_LABELS[via] : 'Concedido, sin efecto con esta visibilidad',
        downloadUrl: via ? `/api/media/${d.r2Key}` : null,
      }
    })
}

async function propertyNames(db: any, orgId: number, docs: { propertyKind: string; propertyId: number }[]): Promise<Map<string, { name: string; reference: string | null }>> {
  const out = new Map<string, { name: string; reference: string | null }>()
  for (const kind of ['agent', 'developer'] as const) {
    const ids = [...new Set(docs.filter((d) => d.propertyKind === kind).map((d) => d.propertyId))]
    if (!ids.length) continue
    const t = kind === 'agent' ? schema.agentProperties : schema.developerProperties
    const rows = await selectInChunks(ids, (part) =>
      db
        .select({ id: t.id, reference: t.reference, title: kind === 'developer' ? schema.developerProperties.name : schema.agentProperties.slug })
        .from(t)
        .where(and(eq(t.organizationId, orgId), inArray(t.id, part))),
    )
    for (const r of rows as any[]) out.set(`${kind}:${r.id}`, { name: r.title || `Propiedad #${r.id}`, reference: r.reference ?? null })
  }
  return out
}

/** Los documentos públicos de una propiedad para su ficha pública — sólo si está publicada y viva. */
export async function listPublicPropertyDocuments(db: any, orgId: number, kind: PropertyKind, propertyId: number) {
  if (!(await isPropertyPublishedAndLive(db, orgId, kind, propertyId))) return []
  const rows = await db
    .select({
      id: schema.propertyDocuments.id,
      docType: schema.propertyDocuments.docType,
      title: schema.propertyDocuments.title,
      r2Key: schema.propertyDocuments.r2Key,
      mimeType: schema.propertyDocuments.mimeType,
      sizeBytes: schema.propertyDocuments.sizeBytes,
      issuedAt: schema.propertyDocuments.issuedAt,
      expiresAt: schema.propertyDocuments.expiresAt,
    })
    .from(schema.propertyDocuments)
    .where(
      and(
        eq(schema.propertyDocuments.organizationId, orgId),
        eq(schema.propertyDocuments.propertyKind, kind),
        eq(schema.propertyDocuments.propertyId, propertyId),
        eq(schema.propertyDocuments.visibility, 'public'),
        isNull(schema.propertyDocuments.deletedAt),
      ),
    )
    .orderBy(desc(schema.propertyDocuments.id))
  // Un documento caducado (un certificado energético vencido…) no se ofrece en
  // la web como si estuviera vigente (#110); en el panel sigue, marcado.
  const today = new Date().toISOString().slice(0, 10)
  return rows
    .filter((r: any) => !!r.r2Key && !(r.expiresAt && String(r.expiresAt).slice(0, 10) < today))
    .map(({ r2Key, ...r }: any) => ({ ...r, docTypeLabel: PROPERTY_DOCUMENT_TYPE_LABELS[r.docType] || r.docType, url: `/api/media/${r2Key}` }))
}

/** Resumen documental de una propiedad (cabecera de la ficha): total, caducados y a punto de caducar. */
export async function propertyDocumentSummary(db: any, orgId: number, kind: PropertyKind, propertyId: number) {
  const rows = await db
    .select({ id: schema.propertyDocuments.id, title: schema.propertyDocuments.title, docType: schema.propertyDocuments.docType, expiresAt: schema.propertyDocuments.expiresAt, visibility: schema.propertyDocuments.visibility })
    .from(schema.propertyDocuments)
    .where(
      and(
        eq(schema.propertyDocuments.organizationId, orgId),
        eq(schema.propertyDocuments.propertyKind, kind),
        eq(schema.propertyDocuments.propertyId, propertyId),
        isNull(schema.propertyDocuments.deletedAt),
      ),
    )
  const today = todayIsoDate()
  const withState = rows.map((r: any) => ({ ...r, docTypeLabel: PROPERTY_DOCUMENT_TYPE_LABELS[r.docType] || r.docType, expiryState: documentExpiryState(r.expiresAt, today) }))
  return {
    total: rows.length,
    public: rows.filter((r: any) => r.visibility === 'public').length,
    expired: withState.filter((r: any) => r.expiryState === 'expired'),
    expiring: withState.filter((r: any) => r.expiryState === 'expiring'),
  }
}
