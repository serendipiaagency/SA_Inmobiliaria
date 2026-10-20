import { beforeEach, describe, expect, it } from 'vitest'
import {
  CAMPAIGN_STATUSES,
  createCampaign,
  createTemplate,
  deleteCampaign,
  deleteTemplate,
  getCampaign,
  listCampaigns,
  listTemplates,
  markCampaignExported,
  normalizeBlocks,
  orgBranding,
  recipientsCsv,
  renderNewsletterHtml,
  subscribedEmails,
  updateCampaign,
  updateTemplate,
} from '../../server/utils/newsletter/campaigns'
import { subscribeToNewsletter, unsubscribeByToken } from '../../server/utils/newsletter'
import { createTestDb, seedTenant, type TenantFixture } from './helpers/tenantFixtures'

/**
 * Newsletter: campañas y plantillas (Cola 17, migración 0100). Bloques seguros
 * para email, render con la marca de la agencia y marcador de baja, exportación
 * sin envío, y aislamiento por empresa. NO se envía nada desde aquí.
 */

let db: any
let A: TenantFixture
let B: TenantFixture

beforeEach(async () => {
  ;({ db } = createTestDb())
  A = await seedTenant(db, 'Alpha')
  B = await seedTenant(db, 'Beta')
})

describe('bloques: saneado y seguridad para email', () => {
  it('conserva los tipos conocidos, acota el texto y descarta lo que no reconoce', () => {
    const out = normalizeBlocks([
      { type: 'heading', text: 'Hola' },
      { type: 'paragraph', text: 'Mundo' },
      { type: 'nope', text: 'fuera' },
      'no-objeto',
    ])
    expect(out).toEqual([
      { type: 'heading', text: 'Hola' },
      { type: 'paragraph', text: 'Mundo' },
    ])
  })

  it('un botón sólo admite http(s)/mailto; un javascript: o data: se descarta', () => {
    expect(normalizeBlocks([{ type: 'button', label: 'Ver', url: 'https://e.com' }])).toEqual([{ type: 'button', label: 'Ver', url: 'https://e.com' }])
    expect(normalizeBlocks([{ type: 'button', label: 'X', url: 'javascript:alert(1)' }])).toEqual([])
    expect(normalizeBlocks([{ type: 'button', label: 'X', url: 'data:text/html,x' }])).toEqual([])
    // Botón sin etiqueta: texto por defecto.
    expect(normalizeBlocks([{ type: 'button', label: '', url: 'https://e.com' }])).toEqual([{ type: 'button', label: 'Ver más', url: 'https://e.com' }])
  })

  it('una imagen exige http(s) en el src', () => {
    expect(normalizeBlocks([{ type: 'image', src: 'https://e.com/a.png', alt: 'A' }])).toEqual([{ type: 'image', src: 'https://e.com/a.png', alt: 'A' }])
    expect(normalizeBlocks([{ type: 'image', src: 'javascript:x', alt: '' }])).toEqual([])
  })
})

describe('render: email con la marca de la agencia y marcador de baja', () => {
  it('pinta el asunto, el contenido y deja {{unsubscribe}} para la herramienta de envío; escapa el texto', () => {
    const branding = { companyName: 'Alpha Inmo', logo: null, brandColor: '#123456' }
    const html = renderNewsletterHtml(
      [
        { type: 'heading', text: 'Novedades' },
        { type: 'paragraph', text: 'Hola <script>x</script>' },
        { type: 'button', label: 'Ver', url: 'https://e.com' },
      ],
      { branding, subject: 'Boletín', locale: 'es' },
    )
    expect(html).toContain('Novedades')
    expect(html).toContain('Alpha Inmo')
    expect(html).toContain('{{unsubscribe}}')
    expect(html).toContain('https://e.com')
    // El texto del usuario va escapado, nunca como etiqueta real.
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('sin bloques, muestra un aviso en lugar de un email vacío', () => {
    const html = renderNewsletterHtml([], { branding: { companyName: 'A', logo: null, brandColor: null }, subject: '' })
    expect(html).toContain('Sin contenido todavía')
  })
})

describe('CSV de destinatarios: BOM y anti-fórmula', () => {
  it('cabecera «Email», BOM y escape de celdas que empiezan por = + - @', () => {
    const csv = recipientsCsv(['ana@e.com', '=cmd@e.com'])
    expect(csv.startsWith('﻿Email')).toBe(true)
    expect(csv).toContain("'=cmd@e.com")
    expect(csv.split('\r\n')).toEqual(['﻿Email', 'ana@e.com', "'=cmd@e.com"])
  })
})

describe('campañas y plantillas: CRUD y aislamiento por empresa', () => {
  it('crear exige nombre; se guarda el contenido saneado; se lista y se lee', async () => {
    await expect(createCampaign(db, A.orgId, { name: '  ' }, A.userId)).rejects.toMatchObject({ statusCode: 422 })
    const c = await createCampaign(db, A.orgId, { name: 'Boletín', subject: 'Hola', blocks: [{ type: 'heading', text: 'Hi' }, { type: 'bad' }] }, A.userId)
    expect(c).toMatchObject({ name: 'Boletín', subject: 'Hola', status: 'draft', segment: 'subscribed', recipientCount: null, lastExportedAt: null })
    expect(c.blocks).toEqual([{ type: 'heading', text: 'Hi' }])
    expect((await listCampaigns(db, A.orgId)).map((x) => x.id)).toEqual([c.id])
    expect((await getCampaign(db, A.orgId, c.id)).name).toBe('Boletín')
  })

  it('editar cambia nombre/asunto/bloques y el estado sólo entre draft y ready', async () => {
    const c = await createCampaign(db, A.orgId, { name: 'C' }, A.userId)
    const u = await updateCampaign(db, A.orgId, c.id, { subject: 'Nuevo', status: 'ready' })
    expect(u).toMatchObject({ subject: 'Nuevo', status: 'ready' })
    // 'exported' no se puede poner a mano (lo pone la exportación): se ignora.
    const u2 = await updateCampaign(db, A.orgId, c.id, { status: 'exported' as any })
    expect(u2.status).toBe('ready')
  })

  it('exportar marca la campaña y guarda a cuántos suscriptores fue', async () => {
    const c = await createCampaign(db, A.orgId, { name: 'C' }, A.userId)
    await subscribeToNewsletter(db, A.orgId, { email: 'uno@e.com' })
    const r = await subscribeToNewsletter(db, A.orgId, { email: 'dos@e.com' })
    await subscribeToNewsletter(db, A.orgId, { email: 'tres@e.com' })
    await unsubscribeByToken(db, A.orgId, r.unsubscribeToken)
    const emails = await subscribedEmails(db, A.orgId)
    expect(emails).toEqual(['tres@e.com', 'uno@e.com']) // activos, ordenados; «dos» está de baja
    await markCampaignExported(db, A.orgId, c.id, emails.length)
    const after = await getCampaign(db, A.orgId, c.id)
    expect(after).toMatchObject({ status: 'exported', recipientCount: 2 })
    expect(after.lastExportedAt).toBeTruthy()
  })

  it('borrar una campaña o plantilla; nunca la de otra empresa', async () => {
    const a = await createCampaign(db, A.orgId, { name: 'A' }, A.userId)
    const b = await createCampaign(db, B.orgId, { name: 'B' }, B.userId)
    await expect(getCampaign(db, A.orgId, b.id)).rejects.toMatchObject({ statusCode: 404 })
    await expect(deleteCampaign(db, A.orgId, b.id)).rejects.toMatchObject({ statusCode: 404 })
    await deleteCampaign(db, A.orgId, a.id)
    expect(await listCampaigns(db, A.orgId)).toHaveLength(0)
    expect(await listCampaigns(db, B.orgId)).toHaveLength(1)
  })

  it('plantillas: mismo CRUD, exige nombre, aisladas por empresa', async () => {
    await expect(createTemplate(db, A.orgId, {}, A.userId)).rejects.toMatchObject({ statusCode: 422 })
    const t = await createTemplate(db, A.orgId, { name: 'Base', subject: 'S', blocks: [{ type: 'paragraph', text: 'P' }] }, A.userId)
    expect(t.blocks).toEqual([{ type: 'paragraph', text: 'P' }])
    const u = await updateTemplate(db, A.orgId, t.id, { name: 'Base 2' })
    expect(u.name).toBe('Base 2')
    expect((await listTemplates(db, A.orgId)).map((x) => x.id)).toEqual([t.id])
    expect(await listTemplates(db, B.orgId)).toHaveLength(0)
    await expect(updateTemplate(db, B.orgId, t.id, { name: 'x' })).rejects.toMatchObject({ statusCode: 404 })
    await deleteTemplate(db, A.orgId, t.id)
    expect(await listTemplates(db, A.orgId)).toHaveLength(0)
  })

  it('sin empresa activa, todo es 403', async () => {
    await expect(listCampaigns(db, null)).rejects.toMatchObject({ statusCode: 403 })
    await expect(createTemplate(db, null, { name: 'X' }, null)).rejects.toMatchObject({ statusCode: 403 })
    await expect(orgBranding(db, null)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('la marca de la agencia sale de su organización', async () => {
    const b = await orgBranding(db, A.orgId)
    expect(b.companyName).toBeTruthy()
  })

  it('los estados válidos son draft, ready y exported', () => {
    expect(CAMPAIGN_STATUSES).toEqual(['draft', 'ready', 'exported'])
  })
})
