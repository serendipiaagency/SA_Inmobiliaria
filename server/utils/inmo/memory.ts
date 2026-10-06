import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { now } from '../db'
import { validateNotePayload } from '../contacts/crm'
import { selectInChunks } from '../sqlChunks'
import type { NOTE_ENTITY_TYPES } from '../../../utils/crmCatalog'

/**
 * Memoria de INMO entre conversaciones (bloque N8b).
 *
 * Lo que INMO «recuerda» de un contacto, lead, propiedad, cita u operación
 * es una NOTA de esa entidad (la entidad Nota de FASE 0), con
 * `source = 'inmo'`: el mismo dato que ve cualquiera en la pestaña Notas de
 * la ficha, de la agencia y no de una conversación suelta. Por eso:
 *   - está acotada a la organización (y a la entidad, validada en ella:
 *     una de otra agencia es 404), nunca se usa en otra;
 *   - sólo existe si una persona la confirmó (remember_fact pide «Confirmar»);
 *   - se ve, se edita y se borra (papelera) desde el panel como cualquier nota;
 *   - nunca guarda secretos: contraseñas, claves, tokens, tarjetas o IBAN se
 *     rechazan antes de escribir nada.
 */

export type MemoryEntityType = (typeof NOTE_ENTITY_TYPES)[number]
export const MEMORY_MAX_FACT = 1000

const SECRET_PATTERNS: { re: RegExp; what: string }[] = [
  { re: /contrase[nñ]a|password|passwd|\bpin\b|clave de acceso|clave secreta|c[oó]digo de (?:acceso|seguridad|verificaci[oó]n)/i, what: 'una contraseña o código de acceso' },
  { re: /api[\s_-]?key|\btoken\b|secret|bearer\s+[a-z0-9]/i, what: 'una clave o token' },
  { re: /\bsk-[a-z0-9_-]{8,}/i, what: 'una clave de API' },
  { re: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}\b/, what: 'un IBAN' },
  { re: /\bcvv\b|\bcvc\b/i, what: 'datos de tarjeta' },
]

/** Un número de 13-19 cifras que pasa Luhn es, casi seguro, una tarjeta. */
function hasCardNumber(text: string): boolean {
  for (const m of text.matchAll(/(?:\d[ -]?){13,19}/g)) {
    const digits = m[0].replace(/\D/g, '')
    if (digits.length < 13 || digits.length > 19) continue
    let sum = 0
    let dbl = false
    for (let i = digits.length - 1; i >= 0; i--) {
      let d = Number(digits[i])
      if (dbl) {
        d *= 2
        if (d > 9) d -= 9
      }
      sum += d
      dbl = !dbl
    }
    if (sum % 10 === 0) return true
  }
  return false
}

/** ¿Parece un secreto? Devuelve qué parece, o null. */
export function secretKindIn(text: string): string | null {
  for (const p of SECRET_PATTERNS) if (p.re.test(text)) return p.what
  if (hasCardNumber(text)) return 'un número de tarjeta'
  // Una cadena larga sin espacios de letras y números mezclados suele ser una credencial.
  if (/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}\b/.test(text)) return 'una credencial'
  return null
}

export interface EntityRef {
  entityType: MemoryEntityType
  entityId: number
  propertyKind?: 'agent' | 'developer' | null
}

/**
 * Crea una nota sobre una entidad de la agencia (validada en ella: 404 si es
 * ajena) con su origen. La usan `remember_fact` (INMO, con confirmación) y
 * `create_note` (automatizaciones y API).
 */
export async function createEntityNote(db: any, orgId: number, ref: EntityRef & { body: string }, opts: { createdBy: number | null; source: 'inmo' | 'automation' | null }) {
  const data: Record<string, any> = { entityType: ref.entityType, entityId: ref.entityId, propertyKind: ref.propertyKind ?? null, body: ref.body }
  await validateNotePayload(db, orgId, data, null)
  const ts = now()
  const [row] = await db
    .insert(schema.notes)
    .values({ ...data, organizationId: orgId, isPinned: 0, createdBy: opts.createdBy, source: opts.source, createdAt: ts, updatedAt: ts })
    .returning()
  return row
}

/** Las notas vivas de una entidad de la agencia (fijadas primero), con autor. 404 si la entidad no es suya. */
export async function listEntityNotes(db: any, orgId: number, ref: EntityRef, limit = 15) {
  // Misma validación de pertenencia que al escribir (el cuerpo es irrelevante aquí).
  const probe: Record<string, any> = { entityType: ref.entityType, entityId: ref.entityId, propertyKind: ref.propertyKind ?? null, body: '·' }
  await validateNotePayload(db, orgId, probe, null)
  const N = schema.notes
  const conds = [eq(N.organizationId, orgId), eq(N.entityType, ref.entityType), eq(N.entityId, ref.entityId), isNull(N.deletedAt)]
  if (ref.entityType === 'property') conds.push(eq(N.propertyKind, probe.propertyKind))
  const rows = await db
    .select({ id: N.id, body: N.body, source: N.source, isPinned: N.isPinned, createdBy: N.createdBy, createdAt: N.createdAt })
    .from(N)
    .where(and(...conds))
    .orderBy(desc(N.isPinned), desc(N.id))
    .limit(Math.max(1, Math.min(limit, 30)))
  const authorIds = [...new Set(rows.map((r: any) => r.createdBy).filter(Boolean))] as number[]
  const authors = authorIds.length
    ? await selectInChunks(authorIds, (part) =>
        db
          .select({ id: schema.users.id, name: schema.users.name })
          .from(schema.users)
          .where(and(inArray(schema.users.id, part), or(eq(schema.users.organizationId, orgId), eq(schema.users.role, 'super_admin')))),
      )
    : []
  const byId = new Map<number, string>(authors.map((u: any) => [u.id, u.name]))
  return rows.map((r: any) => ({ noteId: r.id, text: r.body, source: r.source ?? 'panel', pinned: Boolean(r.isPinned), author: r.createdBy ? byId.get(r.createdBy) ?? null : null, createdAt: r.createdAt }))
}
