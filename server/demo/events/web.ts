import { and, eq, isNull } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { now, slugify } from '../../utils/db'
import { insertResourceRecord } from '../../utils/adminResourceCreate'
import { adminResources } from '../../utils/adminResources'
import { publishPage, saveDraft, validatePageDocument } from '../../utils/sitePages'
import { blocksToPlainText, computeReadingTime, computeSeoScore, countLinks, parseBlocks } from '../../utils/cms'
import { createAutomation } from '../../utils/automations/service'
import { FORMAT_BY_KEY } from '../../utils/assetExport/formats'
import { withCatalogKind } from '../../utils/assetExport/catalogKind'
import { ctxId, ctxSetId, type DemoContext } from '../context'
import { actingUser, leadId, orgId, personPhotoPath, propertyId, uploadDemoAsset } from '../helpers'
import { DEMO_ADMIN, DEMO_COMPANY } from '../dataset/company'
import { mediaAlt } from '../dataset/media'
import { ARTICLES, AUTOMATIONS, CATALOGS, EXPORT_PROJECTS, EXPORT_TEMPLATES, HOME_SLIDES, KNOWLEDGE_DOCS, REFERRALS, REFERRAL_LINKS } from '../dataset/web'
import { CONTACTS, LEADS } from '../dataset/crm'
import { PROPERTIES } from '../dataset/properties'
import type { TimelineBuilder } from '../timeline'

/**
 * La web y el marketing de la demo, por los mismos caminos que el panel:
 * portada del Constructor Web (borrador + publicación), blog con portada,
 * INMO: Conocimiento, referidos, plantillas y piezas del Asset Export,
 * catálogos combinados (se generan al abrirlos, como cualquier catálogo) y
 * automatizaciones internas, que se crean al final para que sólo actúen
 * sobre lo que haga quien use la demo, nunca sobre la historia sembrada.
 */

const admin = (ctx: DemoContext) => actingUser(ctx, DEMO_ADMIN.key)

/** La portada: bloques reales del Constructor, con las propiedades y comunidades de la demo. */
async function buildHome(ctx: DemoContext) {
  const slides: string[] = []
  for (const path of HOME_SLIDES) slides.push(await uploadDemoAsset(ctx, path, { category: 'upload', createdBy: admin(ctx).id }))
  const doc = validatePageDocument({
    seo: {
      title: `${DEMO_COMPANY.name} · Viviendas en Asturias`,
      description: 'Obra nueva y segunda mano en Oviedo, Gijón, Avilés y el oriente de Asturias. Cuenta de demostración con datos ficticios.',
    },
    blocks: [
      {
        id: 'hero-na01', type: 'hero', version: 1,
        content: {
          eyebrow: 'Inmobiliaria en Asturias', title1: 'Encuentra tu lugar', title2: 'en Asturias.',
          subtitle: 'Obra nueva y segunda mano en Oviedo, Gijón, Avilés y el oriente, con un equipo que conoce cada barrio.',
          slides, exploreCta: 'Ver propiedades', exploreCtaTo: '/propiedades', advisorCta: 'Hablar con un asesor', advisorCtaTo: '/contacto',
        },
      },
      { id: 'properties-na02', type: 'properties', version: 1, content: { eyebrow: 'Obra nueva', title: 'Promociones destacadas', cta: 'Ver todas', ctaTo: '/propiedades', source: 'dynamic', dynamicFilter: 'latest', limit: 4, layout: 'row' } },
      { id: 'map-teaser-na03', type: 'map-teaser', version: 1, content: { eyebrow: 'Explora por zona', title: 'De Oviedo al oriente', text: 'Busca en el mapa entre Oviedo, Gijón, Avilés, la costa central y el oriente. Las viviendas de segunda mano se muestran con su zona aproximada.', cta: 'Abrir el mapa', ctaTo: '/propiedades', source: 'dynamic', dynamicFilter: 'latest', limit: 8 } },
      { id: 'properties-na04', type: 'properties', version: 1, content: { eyebrow: 'Colección', title: 'Viviendas con vistas al mar', cta: 'Ver todas', ctaTo: '/propiedades?sort=price_desc', source: 'dynamic', dynamicFilter: 'premium', limit: 3, layout: 'dark-grid' } },
      { id: 'communities-na05', type: 'communities', version: 1, content: { eyebrow: 'Vive aquí', title: 'Residenciales y zonas que conocemos', source: 'dynamic', limit: 6 } },
      {
        id: 'text-na06', type: 'text', version: 1,
        content: {
          eyebrow: 'Servicios', title: 'Todo el proceso, con una sola agencia', subtitle: '',
          body: 'Valoración de tu vivienda con comparables reales de la zona.\nReportaje fotográfico, plano y publicación en nuestra web.\nBúsqueda a medida para compradores, con visitas agrupadas.\nAcompañamiento en reserva, arras, financiación y notaría.\nGestión integral de alquileres.',
          align: 'left', maxWidth: 'md', columns: 1,
        },
      },
      { id: 'team-na07', type: 'team', version: 1, content: { eyebrow: 'Quiénes te acompañan', title: 'Habla con un comercial', cta: 'Ver todo el equipo', ctaTo: '/equipo', source: 'dynamic', limit: 4, layout: 'cards' } },
      { id: 'mortgage-na08', type: 'mortgage-calculator', version: 1, content: { eyebrow: 'Planifica', title: 'Calcula tu hipoteca', text: 'Estima tu cuota mensual antes de visitar.' } },
      {
        id: 'lead-form-na09', type: 'lead-form', version: 1,
        content: {
          eyebrow: '¿Buscas algo concreto?', title: 'Cuéntanos qué necesitas', description: 'Déjanos tus datos y un comercial te llama con opciones reales en tu zona.',
          submitLabel: 'Quiero que me llamen', messageLabel: '¿Qué estás buscando?', messagePlaceholder: 'Zona, presupuesto, número de habitaciones…',
          successMessage: '¡Gracias! Te llamamos enseguida.', subject: 'Formulario de portada', privacyNote: '', showPhone: true, layout: 'split',
        },
      },
      { id: 'blog-list-na10', type: 'blog-list', version: 1, content: { eyebrow: 'Blog', title: 'Guías y zonas de Asturias', cta: 'Todos los artículos', ctaTo: '/blog', source: 'dynamic', limit: 3 } },
      { id: 'cta-na11', type: 'cta', version: 1, content: { eyebrow: '', title: '¿Hablamos de tu próxima casa en Asturias?', description: 'Oficinas en Oviedo, Gijón y Llanes.', ctaPrimary: 'Contactar', ctaPrimaryTo: '/contacto', ctaSecondary: 'Ver propiedades', ctaSecondaryTo: '/propiedades', align: 'center' } },
    ],
  })
  await saveDraft(ctx.db, orgId(ctx), 'home', doc)
  await publishPage(ctx.db, orgId(ctx), 'home', admin(ctx).id)
}

async function createArticle(ctx: DemoContext, a: (typeof ARTICLES)[number]) {
  const org = orgId(ctx)
  const cover = await uploadDemoAsset(ctx, a.cover, { category: 'blog-image', createdBy: admin(ctx).id })
  const contentJson = JSON.stringify(a.blocks)
  const blocks = parseBlocks(contentJson)
  const plainText = blocksToPlainText(blocks)
  const slug = slugify(a.title)
  const ts = now()
  const seoDescription = a.excerpt
  const [row] = await ctx.db
    .insert(schema.cmsArticles)
    .values({
      organizationId: org,
      authorId: ctxId(ctx, 'cms-author'),
      categoryId: ctxId(ctx, `cms-category:${a.category}`),
      title: a.title,
      slug,
      excerpt: a.excerpt,
      contentJson,
      coverImage: cover,
      language: 'es',
      status: 'published',
      publishedAt: ts,
      readingTimeMinutes: computeReadingTime(blocks),
      seoTitle: a.title,
      seoDescription,
      focusKeyword: a.focusKeyword,
      seoScore: computeSeoScore({ title: a.title, slug, excerpt: a.excerpt, seoTitle: a.title, seoDescription, focusKeyword: a.focusKeyword, coverImage: cover, plainText, links: countLinks(blocks) }),
      createdAt: ts,
      updatedAt: ts,
    })
    .returning({ id: schema.cmsArticles.id })
  await ctx.db.insert(schema.cmsArticleVersions).values({ articleId: row.id, title: a.title, contentJson, editedBy: admin(ctx).id, createdAt: ts })
  ctxSetId(ctx, `article:${a.key}`, row.id)
  await ctx.db.insert(schema.cmsMedia).values({ organizationId: org, filename: a.cover.split('/').pop()!, url: `/api/media/${cover}`, type: 'image', altText: mediaAlt(a.cover, a.title), createdAt: ts })
}

const randomCode = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes).map((b) => b.toString(36)).join('').slice(0, 8)
}

export function addWebEvents(tl: TimelineBuilder): void {
  // Blog: autora, categorías y artículos, cada uno en su fecha.
  tl.add(-160, '09:00', 'Blog: autora y categorías', async (ctx) => {
    const user = admin(ctx)
    const photo = await uploadDemoAsset(ctx, personPhotoPath(DEMO_ADMIN.key), { category: 'upload', createdBy: user.id })
    const author = await insertResourceRecord(ctx.db, 'cms-authors', adminResources['cms-authors'], { name: DEMO_ADMIN.name, slug: 'carmen-valdes', userId: user.id, photo, bio: 'Gerente de Norte Astur Inmobiliaria (personaje ficticio de la cuenta demo).', specialty: 'Compraventa y obra nueva en Asturias' }, { orgId: orgId(ctx), user, event: ctx.event })
    ctxSetId(ctx, 'cms-author', author.id)
    for (const [key, name, description] of [
      ['guias', 'Guías de compra', 'Consejos prácticos para comprar y vender vivienda.'],
      ['zonas', 'Zonas de Asturias', 'Barrios, villas y concejos donde trabajamos.'],
    ] as const) {
      const cat = await insertResourceRecord(ctx.db, 'cms-categories', adminResources['cms-categories'], { name, slug: slugify(name), description }, { orgId: orgId(ctx), user, event: ctx.event })
      ctxSetId(ctx, `cms-category:${key}`, cat.id)
    }
  })
  for (const a of ARTICLES) tl.add(a.days, '10:00', `Artículo ${a.key}`, (ctx) => createArticle(ctx, a))

  // La portada se publica cuando ya hay propiedades y artículos que enseñar.
  tl.add(-27, '19:00', 'Portada de la web', buildHome)

  tl.add(-170, '12:00', 'INMO: Conocimiento', async (ctx) => {
    for (const d of KNOWLEDGE_DOCS) {
      await insertResourceRecord(ctx.db, 'knowledge-documents', adminResources['knowledge-documents'], { title: d.title, body: d.body, tags: d.tags, status: 'active' }, { orgId: orgId(ctx), user: admin(ctx), event: ctx.event })
    }
  })

  // Referidos: enlaces de clientes y de un colaborador, y sus referidos con su estado.
  for (const l of REFERRAL_LINKS) {
    tl.add(l.days, '11:30', `Enlace de referido ${l.key}`, async (ctx) => {
      const contact = l.contact ? CONTACTS.find((c) => c.key === l.contact) : undefined
      const [row] = await ctx.db
        .insert(schema.referralLinks)
        .values({ organizationId: orgId(ctx), code: randomCode(), referrerType: l.referrerType, referrerName: l.referrerName, referrerEmail: contact?.email ?? null, rewardType: l.rewardType, rewardAmount: l.rewardAmount, createdAt: now() })
        .returning()
      ctxSetId(ctx, `referral-link:${l.key}`, row.id)
    })
  }
  for (const r of REFERRALS) {
    const lead = 'lead' in r && r.lead ? LEADS.find((x) => x.key === r.lead) : undefined
    const contact = lead ? CONTACTS.find((c) => c.key === lead.contact) : undefined
    const day = lead ? Math.max(lead.days, r.days) : r.days
    tl.add(day, lead ? '23:30' : '12:10', `Referido ${r.key}`, async (ctx) => {
      const [row] = await ctx.db
        .insert(schema.referrals)
        .values({
          organizationId: orgId(ctx),
          referralLinkId: ctxId(ctx, `referral-link:${r.link}`),
          refereeName: contact?.name ?? (r as { refereeName: string }).refereeName,
          refereeEmail: contact?.email ?? null,
          refereePhone: contact?.phone ?? null,
          leadId: lead ? leadId(ctx, lead.key) : null,
          status: 'pending',
          createdAt: now(),
        })
        .returning()
      ctxSetId(ctx, `referral:${r.key}`, row.id)
    })
    if (r.status === 'expired') {
      tl.add(-30, '08:00', `Referido caducado ${r.key}`, async (ctx) => {
        await ctx.db.update(schema.referrals).set({ status: 'expired' }).where(eq(schema.referrals.id, ctxId(ctx, `referral:${r.key}`)))
      })
    }
    if (r.status === 'rewarded' && 'convertedDays' in r) {
      tl.add(r.convertedDays, '15:00', `Referido convertido ${r.key}`, async (ctx) => {
        await ctx.db.update(schema.referrals).set({ status: 'converted', convertedAt: now() }).where(eq(schema.referrals.id, ctxId(ctx, `referral:${r.key}`)))
      })
      tl.add(r.rewardedDays, '12:00', `Referido recompensado ${r.key}`, async (ctx) => {
        await ctx.db.update(schema.referrals).set({ status: 'rewarded', rewardedAt: now() }).where(eq(schema.referrals.id, ctxId(ctx, `referral:${r.key}`)))
      })
    }
  }

  // Asset Export: plantillas propias (copias de las del sistema), piezas y catálogos.
  tl.add(-100, '10:00', 'Plantillas de export', async (ctx) => {
    const system = (await ctx.db.select().from(schema.assetExportTemplates).where(and(isNull(schema.assetExportTemplates.organizationId), eq(schema.assetExportTemplates.isSystem, 1)))) as any[]
    const pdf = system.filter((t) => FORMAT_BY_KEY[t.formatKey]?.renderReady)
    if (!pdf.length) throw new Error('Demo: no hay plantillas PDF del sistema que copiar')
    for (const [i, t] of EXPORT_TEMPLATES.entries()) {
      const base = pdf[i % pdf.length]
      const ts = now()
      const [row] = await ctx.db
        .insert(schema.assetExportTemplates)
        .values({ organizationId: orgId(ctx), name: t.name, description: t.description, category: base.category, formatKey: base.formatKey, assetTypeScope: base.assetTypeScope, isSystem: 0, status: t.status, structureJson: base.structureJson, createdBy: admin(ctx).id, createdAt: ts, updatedAt: ts })
        .returning()
      ctxSetId(ctx, `export-template:${t.key}`, row.id)
    }
  })
  for (const p of EXPORT_PROJECTS) {
    tl.add(p.days, '16:30', `Pieza ${p.key}`, async (ctx) => {
      const [template] = await ctx.db.select().from(schema.assetExportTemplates).where(eq(schema.assetExportTemplates.id, ctxId(ctx, `export-template:${p.template}`))).limit(1)
      const prop = PROPERTIES.find((x) => x.key === p.property)!
      const ts = now()
      await ctx.db.insert(schema.assetExportProjects).values({
        organizationId: orgId(ctx),
        templateId: template.id,
        assetKind: 'developer_property',
        assetId: propertyId(ctx, p.property),
        name: `${template.name} — ${prop.title}`,
        formatKey: template.formatKey,
        structureJson: template.structureJson,
        priceAtCreation: prop.price,
        createdBy: actingUser(ctx, prop.commercial).id,
        createdAt: ts,
        updatedAt: ts,
      })
    })
  }
  for (const c of CATALOGS) {
    tl.add(c.days, '17:15', `Catálogo ${c.key}`, async (ctx) => {
      const ts = now()
      const [template] = await ctx.db.select().from(schema.assetExportTemplates).where(eq(schema.assetExportTemplates.id, ctxId(ctx, `export-template:${c.template}`))).limit(1)
      const [catalog] = await ctx.db
        .insert(schema.assetExportCatalogs)
        .values({ organizationId: orgId(ctx), name: c.name, templateId: template.id, formatKey: template.formatKey, coverTitle: c.name, status: 'pending', totalCount: c.properties.length, requestedBy: admin(ctx).id, validationJson: withCatalogKind(null, c.kind), createdAt: ts })
        .returning()
      await ctx.db.insert(schema.assetExportCatalogItems).values(c.properties.map((key, position) => ({ catalogId: catalog.id, position, assetId: propertyId(ctx, key), status: 'pending' as const, createdAt: ts })))
    })
  }

  // Automatizaciones, al final de la historia (su cursor empieza «ahora»).
  tl.add(0, '23:58', 'Automatizaciones', async (ctx) => {
    for (const a of AUTOMATIONS) {
      await createAutomation(ctx.db, orgId(ctx), admin(ctx), { name: a.name, trigger: a.trigger, action: a.action, conditions: [], config: a.config, enabled: true })
    }
  })
}
