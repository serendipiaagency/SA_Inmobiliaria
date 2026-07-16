import { useDb, schema, now } from '../../utils/db'
import { storeFile } from '../../utils/media'
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
  const files: Record<string, string> = {}

  for (const part of parts) {
    if (!part.name) continue
    if (part.filename && part.data?.byteLength) {
      if ((PDF_FIELDS as readonly string[]).includes(part.name)) {
        // These are KYC identity/financial documents from an unauthenticated public form —
        // only real PDFs are accepted (no SVG/HTML, which the shared upload allowlist permits
        // for admin-side image uploads and would otherwise let an attacker store as a stored-XSS payload).
        files[part.name] = await storeFile(event, part, 'visitor-docs', { 'application/pdf': 'pdf' })
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

  const db = useDb(event)
  await db.insert(schema.visitorSubmissions).values({
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

  try {
    await upsertLead(event, {
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
