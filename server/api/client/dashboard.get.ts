import { and, desc, eq, isNull } from 'drizzle-orm'
import { requireUser } from '../../utils/auth'
import { useDb, schema } from '../../utils/db'
import { contactIdsForEmail, listContactDocuments } from '../../utils/properties/documents'

/**
 * Client-facing self-service view. There is no FK linking `users` to
 * `leads`/`visits`/`contracts` — those are captured from public forms before
 * any account exists — so we match by the logged-in user's own email,
 * scoped to their organization, rather than adding new columns for it.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  if (!user.organizationId) throw createError({ statusCode: 403, statusMessage: 'Esta cuenta no está asociada a ninguna inmobiliaria' })

  const db = useDb(event)
  const email = user.email

  const [visits, leads, contracts] = await Promise.all([
    db
      .select()
      .from(schema.visits)
      // Cierre D3a: el cliente no ve las citas que la agencia mandó a la papelera.
      .where(and(eq(schema.visits.organizationId, user.organizationId), eq(schema.visits.clientEmail, email), isNull(schema.visits.deletedAt)))
      .orderBy(desc(schema.visits.scheduledAt)),
    db
      .select()
      .from(schema.leads)
      .where(and(eq(schema.leads.organizationId, user.organizationId), eq(schema.leads.email, email)))
      .orderBy(desc(schema.leads.createdAt)),
    db
      .select()
      .from(schema.contracts)
      .where(and(eq(schema.contracts.organizationId, user.organizationId), eq(schema.contracts.clientEmail, email)))
      .orderBy(desc(schema.contracts.createdAt)),
  ])

  // Documentos de propiedades (FASE 6, bloque N7a): los que puede ver la
  // persona de la agencia con este mismo email — como propietario, por
  // acceso concedido o porque son públicos. Se descargan en /api/media con
  // esta misma sesión, que vuelve a comprobar el permiso en cada descarga.
  const contactIds = await contactIdsForEmail(db, user.organizationId, email)
  const documents = (await listContactDocuments(db, user.organizationId, contactIds)).map((d: any) => ({
    id: d.id,
    title: d.title,
    docTypeLabel: d.docTypeLabel,
    propertyName: d.propertyName,
    accessLabel: d.accessLabel,
    issuedAt: d.issuedAt,
    expiresAt: d.expiresAt,
    expiryState: d.expiryState,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    downloadUrl: d.downloadUrl,
  }))

  return { visits, leads, contracts, documents }
})
