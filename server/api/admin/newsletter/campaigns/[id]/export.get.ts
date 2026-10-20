import { useDb } from '../../../../../utils/db'
import { requireOrgScope } from '../../../../../utils/auth'
import { logAdminAction } from '../../../../../utils/audit'
import { getCampaign, renderNewsletterHtml, orgBranding, subscribedEmails, recipientsCsv, markCampaignExported } from '../../../../../utils/newsletter/campaigns'

/**
 * GET /api/admin/newsletter/campaigns/:id/export — descarga para enviar fuera.
 *   ?format=html        → el boletín como HTML de email (marca de la agencia).
 *   ?format=recipients  → CSV con los emails de los suscriptores activos.
 *
 * NO envía nada: sólo prepara el material. Al descargar el HTML se marca la
 * campaña como «exportada» y se guarda a cuántos suscriptores iría (el envío
 * masivo real no existe todavía, decisión del propietario). Exige `web`/write
 * (saca los emails de los suscriptores y deja constancia de la exportación).
 */
export default defineEventHandler(async (event) => {
  const { orgId, user } = await requireOrgScope(event, 'web', 'write')
  const db = useDb(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 422, statusMessage: 'Campaña no válida' })
  const campaign = await getCampaign(db, orgId, id)
  const format = String(getQuery(event).format || 'html')
  const emails = await subscribedEmails(db, orgId)

  if (format === 'recipients') {
    await logAdminAction(event, { user, orgId, action: 'export', resource: 'newsletter-campaigns', resourceId: id })
    setResponseHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
    setResponseHeader(event, 'Content-Disposition', `attachment; filename="campana-${id}-destinatarios.csv"`)
    return recipientsCsv(emails)
  }

  // HTML del boletín con la marca de la agencia; se marca la campaña exportada.
  const branding = await orgBranding(db, orgId)
  const html = renderNewsletterHtml(campaign.blocks, { branding, subject: campaign.subject })
  await markCampaignExported(db, orgId, id, emails.length)
  await logAdminAction(event, { user, orgId, action: 'export', resource: 'newsletter-campaigns', resourceId: id })
  setResponseHeader(event, 'Content-Type', 'text/html; charset=utf-8')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename="campana-${id}.html"`)
  return html
})
