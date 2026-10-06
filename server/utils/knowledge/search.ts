import { and, desc, eq, isNull, like as sqlLike, or, type SQL } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { hasAreaAccess } from '../permissions'
import { livePropertyCond } from '../properties/trash'
import type { SessionUser } from '../auth'
import { useHelpContent } from '../../../composables/useHelpContent'
import { accentInsensitiveLike, normalizedLike, queryTerms, scoreFields, snippetOf } from './text'

/**
 * Recuperación de conocimiento de la PROPIA agencia (RAG léxico, bloque N8b).
 *
 * Fuentes, cada una con su permiso:
 *   - help        la ayuda del panel (composables/useHelpContent.ts) — igual para todos
 *   - knowledge   documentos de texto que la agencia marca como base de conocimiento (crm:read)
 *   - notes       notas de contactos, leads, propiedades, citas y operaciones (crm:read)
 *   - properties  nombre, referencia, zona y descripción de las fichas de los dos catálogos (web:read)
 *
 * Todo lo que sale de la base de datos va acotado a `orgId`; nada de otra
 * agencia puede aparecer. Cada resultado lleva su referencia (F1, F2…), su
 * tipo, su id y un enlace al panel: es lo que INMO cita. Si no hay
 * resultados, la respuesta lo dice — no hay fuente.
 */

export const KNOWLEDGE_SOURCES = ['help', 'knowledge', 'notes', 'properties'] as const
export type KnowledgeSource = (typeof KNOWLEDGE_SOURCES)[number]

export interface KnowledgeResult {
  ref: string
  sourceType: KnowledgeSource
  sourceId: string | number
  title: string
  snippet: string
  url: string | null
  score: number
  /** Sólo propiedades y notas sobre una propiedad: el catálogo. */
  propertyKind?: 'agent' | 'developer' | null
}

export interface KnowledgeSearchOutput {
  query: string
  terms: string[]
  total: number
  results: KnowledgeResult[]
  searched: KnowledgeSource[]
  /** Fuentes que no se consultaron porque el usuario no tiene permiso. */
  skipped: { source: KnowledgeSource; reason: string }[]
  noSources: boolean
}

const CANDIDATES_PER_SOURCE = 40

const NOTE_ENTITY_LABELS: Record<string, string> = { contact: 'contacto', lead: 'lead', property: 'propiedad', appointment: 'cita', deal: 'operación' }

function noteUrl(n: { entityType: string; entityId: number; propertyKind: string | null }): string | null {
  switch (n.entityType) {
    case 'contact':
      return `/admin/contactos/${n.entityId}`
    case 'lead':
      return `/admin/leads/${n.entityId}`
    case 'property':
      return n.propertyKind === 'developer' ? `/admin/developer-properties/${n.entityId}` : `/admin/properties/${n.entityId}`
    case 'appointment':
      return '/admin/visitas'
    case 'deal':
      return `/admin/deal-operations/${n.entityId}`
    default:
      return null
  }
}

/**
 * Las condiciones LIKE de todos los términos sobre varias columnas (OR):
 * acota candidatos, no puntúa. Los términos sólo tienen [a-z0-9ñ], así que
 * no hay `%` ni `_` del usuario que escapar (el `_` del patrón es a propósito).
 * Como mucho 6 términos × 6 columnas = 36 parámetros: lejos del tope de D1 (100).
 */
function anyTermLike(columns: any[], terms: string[], pattern: (t: string) => string): SQL {
  const conds: SQL[] = []
  for (const col of columns) for (const t of terms) conds.push(sqlLike(col, pattern(t)))
  return or(...conds) as SQL
}

function helpCandidates(terms: string[]): Omit<KnowledgeResult, 'ref'>[] {
  const { sections, faqs } = useHelpContent()
  const out: Omit<KnowledgeResult, 'ref'>[] = []
  for (const s of sections) {
    const steps = s.steps.join(' ')
    const { score } = scoreFields(
      [
        { text: s.title, weight: 4 },
        { text: s.group, weight: 1 },
        { text: s.summary, weight: 2 },
        { text: steps, weight: 1 },
      ],
      terms,
    )
    if (score > 0) out.push({ sourceType: 'help', sourceId: s.key, title: `Ayuda › ${s.group} › ${s.title}`, snippet: snippetOf(`${s.summary} ${steps}`, terms), url: s.route || '/admin/ayuda', score })
  }
  for (const f of faqs) {
    const { score } = scoreFields(
      [
        { text: f.question, weight: 4 },
        { text: f.tags.join(' '), weight: 2 },
        { text: f.answer, weight: 1 },
      ],
      terms,
    )
    if (score > 0) out.push({ sourceType: 'help', sourceId: f.id, title: `Ayuda › Preguntas frecuentes › ${f.question}`, snippet: snippetOf(f.answer, terms), url: '/admin/ayuda', score })
  }
  return out
}

async function knowledgeCandidates(db: any, orgId: number, terms: string[]): Promise<Omit<KnowledgeResult, 'ref'>[]> {
  const K = schema.knowledgeDocuments
  const rows = await db
    .select({ id: K.id, title: K.title, body: K.body, tags: K.tags })
    .from(K)
    .where(and(eq(K.organizationId, orgId), eq(K.status, 'active'), isNull(K.deletedAt), anyTermLike([K.searchText], terms, normalizedLike)))
    .orderBy(desc(K.id))
    .limit(CANDIDATES_PER_SOURCE)
  return rows
    .map((r: any) => {
      const { score } = scoreFields(
        [
          { text: r.title, weight: 4 },
          { text: r.tags, weight: 2 },
          { text: r.body, weight: 1 },
        ],
        terms,
      )
      return { sourceType: 'knowledge' as const, sourceId: r.id, title: `Documento › ${r.title}`, snippet: snippetOf(r.body, terms), url: '/admin/inmo-ajustes', score }
    })
    .filter((r: any) => r.score > 0)
}

async function noteCandidates(db: any, orgId: number, terms: string[]): Promise<Omit<KnowledgeResult, 'ref'>[]> {
  const N = schema.notes
  const rows = await db
    .select({ id: N.id, body: N.body, entityType: N.entityType, entityId: N.entityId, propertyKind: N.propertyKind, source: N.source, createdAt: N.createdAt })
    .from(N)
    .where(and(eq(N.organizationId, orgId), isNull(N.deletedAt), anyTermLike([N.body], terms, accentInsensitiveLike)))
    .orderBy(desc(N.id))
    .limit(CANDIDATES_PER_SOURCE)
  return rows
    .map((r: any) => {
      const { score } = scoreFields([{ text: r.body, weight: 2 }], terms)
      const what = NOTE_ENTITY_LABELS[r.entityType] || r.entityType
      return {
        sourceType: 'notes' as const,
        sourceId: r.id,
        title: `Nota de ${what} #${r.entityId}${r.source === 'inmo' ? ' (recordada por INMO)' : ''} · ${String(r.createdAt || '').slice(0, 10)}`,
        snippet: snippetOf(r.body, terms),
        url: noteUrl(r),
        score,
        propertyKind: r.entityType === 'property' ? (r.propertyKind as any) : null,
      }
    })
    .filter((r: any) => r.score > 0)
}

async function propertyCandidates(db: any, orgId: number, terms: string[]): Promise<Omit<KnowledgeResult, 'ref'>[]> {
  const D = schema.developerProperties
  const A = schema.agentProperties
  const dev = await db
    .select({ id: D.id, name: D.name, reference: D.reference, community: D.community, city: D.city, description: D.description })
    .from(D)
    .where(and(eq(D.organizationId, orgId), livePropertyCond(D), anyTermLike([D.name, D.community, D.city, D.description], terms, accentInsensitiveLike)))
    .orderBy(desc(D.id))
    .limit(CANDIDATES_PER_SOURCE)
  // 2ª mano: la descripción vive en sus traducciones (property_translations,
  // título y descripción por idioma), así que se buscan las dos cosas y se juntan.
  const T = schema.propertyTranslations
  const agentCols = { id: A.id, reference: A.reference, street: A.street, district: A.district, city: A.city, location: A.location, community: A.community, keyHighlights: A.keyHighlights }
  const agentRows = await db
    .select(agentCols)
    .from(A)
    .where(and(eq(A.organizationId, orgId), livePropertyCond(A), anyTermLike([A.reference, A.street, A.district, A.city, A.location, A.community, A.keyHighlights], terms, accentInsensitiveLike)))
    .orderBy(desc(A.id))
    .limit(CANDIDATES_PER_SOURCE)
  const translated = await db
    .select({ ...agentCols, trTitle: T.title, trDescription: T.description })
    .from(T)
    .innerJoin(A, eq(A.id, T.propertyId))
    .where(and(eq(A.organizationId, orgId), livePropertyCond(A), anyTermLike([T.title, T.description], terms, accentInsensitiveLike)))
    .orderBy(desc(A.id))
    .limit(CANDIDATES_PER_SOURCE)
  const agentById = new Map<number, any>()
  for (const r of [...agentRows, ...translated] as any[]) {
    const prev = agentById.get(r.id) || { ...r, texts: [] as string[] }
    if (r.trTitle || r.trDescription) prev.texts.push(`${r.trTitle ?? ''}. ${r.trDescription ?? ''}`)
    agentById.set(r.id, prev)
  }
  const agent = [...agentById.values()].map((r) => ({ ...r, description: r.texts.join(' ') || r.keyHighlights || null }))
  const out: Omit<KnowledgeResult, 'ref'>[] = []
  for (const r of dev as any[]) {
    const { score } = scoreFields(
      [
        { text: r.name, weight: 4 },
        { text: r.reference, weight: 3 },
        { text: `${r.community ?? ''} ${r.city ?? ''}`, weight: 2 },
        { text: r.description, weight: 1 },
      ],
      terms,
    )
    if (score > 0) out.push({ sourceType: 'properties', sourceId: r.id, propertyKind: 'developer', title: `Propiedad (web) › ${r.name}${r.reference ? ` (${r.reference})` : ''}`, snippet: snippetOf(r.description || `${r.community ?? ''} ${r.city ?? ''}`, terms), url: `/admin/developer-properties/${r.id}`, score })
  }
  for (const r of agent as any[]) {
    const label = r.street || r.location || r.city || `Inmueble #${r.id}`
    const { score } = scoreFields(
      [
        { text: r.reference, weight: 3 },
        { text: `${r.street ?? ''} ${r.location ?? ''}`, weight: 3 },
        { text: `${r.district ?? ''} ${r.city ?? ''}`, weight: 2 },
        { text: r.description, weight: 1 },
      ],
      terms,
    )
    if (score > 0) out.push({ sourceType: 'properties', sourceId: r.id, propertyKind: 'agent', title: `Propiedad 2ª mano › ${label}${r.reference ? ` (${r.reference})` : ''}`, snippet: snippetOf(r.description || `${r.district ?? ''} ${r.city ?? ''}`, terms), url: `/admin/properties/${r.id}`, score })
  }
  return out
}

/** Qué fuentes puede consultar este usuario, y cuáles se saltan por permiso. */
export function knowledgeSourcesFor(user: Pick<SessionUser, 'role' | 'permissions'>, requested?: readonly KnowledgeSource[] | null) {
  const wanted = requested?.length ? requested : KNOWLEDGE_SOURCES
  const searched: KnowledgeSource[] = []
  const skipped: { source: KnowledgeSource; reason: string }[] = []
  for (const s of wanted) {
    const ok = s === 'help' ? true : s === 'properties' ? hasAreaAccess(user as any, 'web', 'read') : hasAreaAccess(user as any, 'crm', 'read')
    if (ok) searched.push(s)
    else skipped.push({ source: s, reason: 'Tu usuario no tiene permiso para consultar esta fuente.' })
  }
  return { searched, skipped }
}

export async function searchKnowledge(
  db: any,
  orgId: number,
  user: Pick<SessionUser, 'role' | 'permissions'>,
  input: { query: string; sources?: readonly KnowledgeSource[] | null; limit?: number },
): Promise<KnowledgeSearchOutput> {
  const terms = queryTerms(input.query)
  const { searched, skipped } = knowledgeSourcesFor(user, input.sources)
  const limit = Math.max(1, Math.min(input.limit ?? 5, 8))
  if (!terms.length) return { query: input.query, terms, total: 0, results: [], searched, skipped, noSources: true }

  const candidates: Omit<KnowledgeResult, 'ref'>[] = []
  if (searched.includes('help')) candidates.push(...helpCandidates(terms))
  if (searched.includes('knowledge')) candidates.push(...(await knowledgeCandidates(db, orgId, terms)))
  if (searched.includes('notes')) candidates.push(...(await noteCandidates(db, orgId, terms)))
  if (searched.includes('properties')) candidates.push(...(await propertyCandidates(db, orgId, terms)))

  // Documentos propios de la agencia primero ante un empate: son lo más específico.
  const priority: Record<KnowledgeSource, number> = { knowledge: 3, notes: 2, properties: 1, help: 0 }
  candidates.sort((x, y) => y.score - x.score || priority[y.sourceType] - priority[x.sourceType])
  const results = candidates.slice(0, limit).map((c, i) => ({ ref: `F${i + 1}`, ...c }))
  return { query: input.query, terms, total: results.length, results, searched, skipped, noSources: results.length === 0 }
}
