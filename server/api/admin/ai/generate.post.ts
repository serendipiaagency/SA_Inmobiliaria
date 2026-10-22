import { and, eq } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'
import { generateContent, CONTENT_KINDS, type ContentKind } from '../../../utils/ai'
import { rateLimit } from '../../../utils/rateLimit'
import { organizationCurrency } from '../../../utils/currency'
import { agentCatalogTitle } from '../../../utils/assetExport/bindings'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  // Real $ cost per call once AI_API_KEY is configured — bound it so a bug
  // or a compromised session can't run up an unbounded AI bill.
  await rateLimit(event, 'ai-generate', { limit: 30, windowSeconds: 600 })
  const body = await readBody<{ id?: number; kind?: ContentKind; catalog?: string }>(event)
  const id = Number(body?.id)
  const kind = body?.kind
  const catalog = body?.catalog === 'agent' ? 'agent' : 'developer'
  if (!id || !kind || !CONTENT_KINDS.some((k) => k.key === kind)) {
    throw createError({ statusCode: 422, statusMessage: 'id and valid kind are required' })
  }
  const db = useDb(event)
  // The generated copy quotes the project's real name, price and description
  // back to the caller — reading it by bare id would hand another tenant's
  // catalog data to whoever guessed the number.
  let project: any
  if (catalog === 'agent') {
    // 2ª mano: no tiene nombre propio, su título se deriva (como en el catálogo
    // público). El generador lee campos genéricos (name/propertyType/price/…).
    const rows = await db
      .select()
      .from(schema.agentProperties)
      .where(and(eq(schema.agentProperties.id, id), eq(schema.agentProperties.organizationId, orgId)))
      .limit(1)
    const row = rows[0]
    if (!row) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
    project = { ...row, name: agentCatalogTitle(row) }
  } else {
    const rows = await db
      .select()
      .from(schema.developerProperties)
      .where(and(eq(schema.developerProperties.id, id), eq(schema.developerProperties.organizationId, orgId)))
      .limit(1)
    project = rows[0]
  }
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  const orgRows = await db.select({ companyName: schema.organizations.companyName, name: schema.organizations.name }).from(schema.organizations).where(eq(schema.organizations.id, orgId)).limit(1)
  const orgName = orgRows[0]?.companyName || orgRows[0]?.name

  // El texto cita el precio en la moneda de la agencia (utils/currency.ts).
  const { text, engine } = await generateContent(event, kind, project, orgName, await organizationCurrency(db, orgId))
  return { text, engine, kind }
})
