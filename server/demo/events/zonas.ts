import { adminResources } from '../../utils/adminResources'
import { insertResourceRecord } from '../../utils/adminResourceCreate'
import { ctxId, ctxSetId, type DemoContext } from '../context'
import { actingUser, orgId, uploadDemoAsset } from '../helpers'
import { ZONAS, ZONES_REVIEWED_AT, type DemoZone } from '../dataset/zonas'
import { ZONAS_BARRIOS } from '../dataset/zonasBarrios'
import { DEMO_ADMIN } from '../dataset/company'

/**
 * Zonas de la demo (docs/zonas.md): la región, los municipios y los barrios,
 * dadas de alta por el mismo camino que el panel (Portal Web → Zonas), con la
 * foto subida al R2 de la demo. Primero la región, luego los municipios y al
 * final los barrios, porque cada una referencia a su zona superior.
 */
export const DEMO_ZONES: DemoZone[] = [...ZONAS, ...ZONAS_BARRIOS]

export async function createZones(ctx: DemoContext): Promise<void> {
  const user = actingUser(ctx, DEMO_ADMIN.key)
  const org = orgId(ctx)
  for (const z of DEMO_ZONES) {
    const image = z.image ? await uploadDemoAsset(ctx, z.image, { category: 'upload', createdBy: user.id }) : null
    const row = await insertResourceRecord(
      ctx.db,
      'zones',
      adminResources.zones,
      {
        name: z.name,
        slug: z.slug,
        kind: z.kind,
        parentId: z.parent ? ctxId(ctx, `zone:${z.parent}`) : null,
        area: z.area ?? null,
        status: z.status,
        subtitle: z.subtitle ?? null,
        intro: z.intro ?? null,
        sectionsJson: JSON.stringify(z.sections ?? []),
        faqJson: JSON.stringify(z.faq ?? []),
        image,
        galleryJson: '[]',
        seoTitle: z.seoTitle ?? null,
        seoDescription: z.seoDescription ?? null,
        lat: z.lat,
        lng: z.lng,
        zoom: z.zoom ?? null,
        matchMunicipality: z.matchMunicipality ?? null,
        matchNeighborhood: z.matchNeighborhood ?? null,
        homePriority: z.homePriority ?? 0,
        sortOrder: z.sortOrder,
        reviewedAt: ZONES_REVIEWED_AT,
      },
      { orgId: org, user, event: ctx.event },
    )
    ctxSetId(ctx, `zone:${z.key}`, row.id)
  }
}
