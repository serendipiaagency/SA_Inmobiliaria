import { eq } from 'drizzle-orm'
import { useDb, schema, now, resolvePublicOrgId } from '../../utils/db'
import { storeAndRegisterFile } from '../../utils/media'
import { upsertLead } from '../../utils/leads'
import { rateLimit } from '../../utils/rateLimit'
import { isValidEmail } from '../../utils/validate'

const PDF_FIELDS = [
  'passport_pdf',
  'emirates_id_pdf',
  'bank_statement_pdf',
  'trade_license_pdf',
  'vat_registration_certificate_pdf',
  'etihad_credit_bureau_pdf',
] as const

export default defineEventHandler(async (event) => {
  // Rejects abusive clients before we spend CPU/R2 storage parsing and uploading files.
  await rateLimit(event, 'visitor', { limit: 5, windowSeconds: 600 })

  const parts = (await readMultipartFormData(event)) || []
  const text: Record<string, string> = {}
  const fileParts: Record<string, { data: Buffer | Uint8Array; type?: string; filename?: string }> = {}

  for (const part of parts) {
    if (!part.name) continue
    if (part.filename && part.data?.byteLength) {
      if ((PDF_FIELDS as readonly string[]).includes(part.name)) {
        fileParts[part.name] = part
      }
    } else {
      text[part.name] = new TextDecoder().decode(part.data)
    }
  }

  for (const required of ['name', 'email', 'phone_number', 'nationality']) {
    if (!text[required]) {
      throw createError({ statusCode: 422, statusMessage: `Missing required field: ${required}` })
    }
  }
  if (!isValidEmail(text.email)) throw createError({ statusCode: 422, statusMessage: 'Invalid email' })

  const orgId = resolvePublicOrgId(event)
  const db = useDb(event)

  // These are KYC identity/financial documents from an unauthenticated public
  // form — real PDFs only (no image/SVG, which the shared upload allowlist
  // permits elsewhere), registered `confidential` from the moment they exist.
  // No visibility is ever "trusted later"; a confidential row is confidential
  // from its very first row.
  const files: Record<string, string> = {}
  const mediaAssetIds: Record<string, number> = {}
  for (const [field, part] of Object.entries(fileParts)) {
    const stored = await storeAndRegisterFile(event, db, part, {
      organizationId: orgId,
      visibility: 'confidential',
      category: 'kyc-document',
      entityType: 'visitor_submissions',
      allowedTypes: { 'application/pdf': 'pdf' },
    })
    files[field] = stored.key
    mediaAssetIds[field] = stored.mediaAssetId
  }

  const [submission] = await db
    .insert(schema.visitorSubmissions)
    .values({
      organizationId: orgId,
      name: text.name,
      email: text.email,
      phoneNumber: text.phone_number,
      nationality: text.nationality,
      propertyType: text.property_type || null,
      specifications: text.specifications || null,
      preferredLocation: text.preferred_location || null,
      budgetRange: text.budget_range || null,
      paymentForRent: text.payment_for_rent === 'Company' ? 'Company' : 'Personal',
      numberOfFamilyMembers: text.number_of_family_members ? parseInt(text.number_of_family_members, 10) : null,
      passportPdf: files.passport_pdf || null,
      emiratesIdPdf: files.emirates_id_pdf || null,
      bankStatementPdf: files.bank_statement_pdf || null,
      tradeLicensePdf: files.trade_license_pdf || null,
      vatRegistrationCertificatePdf: files.vat_registration_certificate_pdf || null,
      etihadCreditBureauPdf: files.etihad_credit_bureau_pdf || null,
      createdAt: now(),
    })
    .returning({ id: schema.visitorSubmissions.id })

  // Link each confidential document to the submission row it belongs to, now
  // that the row exists.
  for (const mediaAssetId of Object.values(mediaAssetIds)) {
    await db.update(schema.mediaAssets).set({ entityId: submission.id }).where(eq(schema.mediaAssets.id, mediaAssetId))
  }

  try {
    await upsertLead(event, {
      organizationId: orgId,
      name: text.name,
      email: text.email,
      phone: text.phone_number,
      source: 'web',
      notes: [text.property_type, text.preferred_location, text.budget_range].filter(Boolean).join(' · ') || null,
      scoreBump: 30,
    })
  } catch {
    // Lead pipeline must never block the visitor form from being saved.
  }

  return { ok: true }
})
