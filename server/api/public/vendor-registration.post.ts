import { useDb, schema, now } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, any>>(event)
  if (!body?.name || !body?.email) {
    throw createError({ statusCode: 422, statusMessage: 'name and email are required' })
  }
  const db = useDb(event)
  await db.insert(schema.information).values({
    name: String(body.name).slice(0, 200),
    email: String(body.email).slice(0, 200),
    phoneNumber: body.phone_number ? String(body.phone_number).slice(0, 50) : null,
    tradeLicense: body.trade_license || null,
    emiratesId: body.emirates_id || null,
    passport: body.passport || null,
    bankAccountNo: body.bank_account_no || null,
    ibanLetter: body.iban_letter || null,
    vatRegistrationNo: body.vat_registration_no || null,
    contactPersonName: body.contact_person_name || null,
    officeAddress: body.office_address || null,
    createdAt: now(),
  })
  return { ok: true }
})
