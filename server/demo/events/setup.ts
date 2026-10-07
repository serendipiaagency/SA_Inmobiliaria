import { eq } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { now } from '../../utils/db'
import { hashPassword } from '../../utils/auth'
import { provisionOrganization } from '../../utils/organizations/provisioning'
import { adminResources } from '../../utils/adminResources'
import { insertResourceRecord } from '../../utils/adminResourceCreate'
import { updateSlaSettings } from '../../utils/leads/sla'
import { saveBrandKit } from '../../utils/brandKit/save'
import { forgetDemoOrgCache } from '../../utils/demo/tenant'
import { assertDemoOrganization, DEMO_ORG_SLUG } from '../purge'
import { ctxId, ctxSetId, type DemoContext } from '../context'
import { actingUser, commercialId, officeId, orgId, personPhotoPath, uploadDemoAsset } from '../helpers'
import { COMMERCIALS, COMMERCIAL_PERMISSIONS, COMMUNITIES, DEMO_ADMIN, DEMO_ADMIN_PASSWORD_HASH_DEFAULT, DEMO_COMPANY, DEVELOPERS, OFFICES, TEAMS } from '../dataset/company'
import type { TimelineBuilder } from '../timeline'

/**
 * Alta de la empresa y de su estructura, unos meses antes de la historia:
 * empresa, ajustes, usuarios, oficinas, equipos, comerciales, promotoras,
 * comunidades, marca, reglas de reparto, SLA y campos personalizados.
 */

const SETUP_DAY = -186

function create(ctx: DemoContext, resource: string, body: Record<string, any>, actor = DEMO_ADMIN.key) {
  const def = adminResources[resource]
  if (!def) throw new Error(`Demo: recurso desconocido ${resource}`)
  return insertResourceRecord(ctx.db, resource, def, body, { orgId: orgId(ctx), user: actingUser(ctx, actor), event: ctx.event })
}

async function upsertOrgSetting(ctx: DemoContext, key: string, value: string) {
  const k = `org:${orgId(ctx)}:${key}`
  const ts = now()
  await ctx.db.insert(schema.settings).values({ key: k, value, updatedAt: ts }).onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: ts } })
}

async function randomUnusablePassword(): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return hashPassword(Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''))
}

export function addSetupEvents(tl: TimelineBuilder): void {
  tl.add(SETUP_DAY, '09:00', 'Alta de la empresa', async (ctx) => {
    // La empresa existe de un aprovisionamiento anterior (restablecer): se conserva su id.
    const [existing] = await ctx.db.select({ id: schema.organizations.id }).from(schema.organizations).where(eq(schema.organizations.slug, DEMO_ORG_SLUG)).limit(1)
    let id: number
    if (existing) {
      await assertDemoOrganization(ctx.db, existing.id)
      id = existing.id
    } else {
      const created = await provisionOrganization(ctx.db, { source: 'demo', organization: { name: DEMO_COMPANY.name, companyName: DEMO_COMPANY.companyName, emailLocale: 'es' } })
      id = created.organization.id
      if (created.organization.slug !== DEMO_ORG_SLUG) throw new Error(`Demo: el slug de la empresa no es ${DEMO_ORG_SLUG} (${created.organization.slug})`)
    }
    ctx.state.orgId = id
    forgetDemoOrgCache(id)
    await ctx.db
      .update(schema.organizations)
      .set({
        companyName: DEMO_COMPANY.companyName,
        brandColor: DEMO_COMPANY.brandColor,
        status: 'active',
        emailSenderName: DEMO_COMPANY.name,
        emailReplyTo: DEMO_COMPANY.email,
        // Sin destinatarios internos: la empresa demo no avisa a nadie por email.
        emailInternalRecipientsJson: '[]',
        emailLocale: 'es',
        legalCompanyName: DEMO_COMPANY.legalCompanyName,
        taxId: DEMO_COMPANY.taxId,
        legalAddress: DEMO_COMPANY.legalAddress,
        legalEmail: DEMO_COMPANY.legalEmail,
        legalPhone: DEMO_COMPANY.phone,
        updatedAt: now(),
      })
      .where(eq(schema.organizations.id, id))

    await upsertOrgSetting(ctx, 'company_name', DEMO_COMPANY.companyName)
    await upsertOrgSetting(ctx, 'currency', DEMO_COMPANY.currency)
    await upsertOrgSetting(ctx, 'timezone', DEMO_COMPANY.timezone)
    await upsertOrgSetting(ctx, 'locale', DEMO_COMPANY.locale)
    await upsertOrgSetting(ctx, 'brand_color', DEMO_COMPANY.brandColor)

    // La administradora de la empresa (el usuario de las demostraciones): rol
    // `admin` de ESTA empresa, nunca super_admin. Sólo el hash de su contraseña.
    const passwordHash = (ctx.env.DEMO_ADMIN_PASSWORD_HASH as string | undefined)?.startsWith('pbkdf2$') ? ctx.env.DEMO_ADMIN_PASSWORD_HASH : DEMO_ADMIN_PASSWORD_HASH_DEFAULT
    const ts = now()
    const [admin] = await ctx.db
      .insert(schema.users)
      .values({ organizationId: id, name: DEMO_ADMIN.name, email: DEMO_ADMIN.email, password: passwordHash, role: 'admin', permissions: null, createdAt: ts, updatedAt: ts })
      .returning({ id: schema.users.id })
    ctxSetId(ctx, `user:${DEMO_ADMIN.key}`, admin.id)

    // Prefijo +34 para normalizar teléfonos, y el chat de la web activo.
    await ctx.db
      .insert(schema.commsSettings)
      .values({ organizationId: id, defaultCountryPrefix: '+34', unknownContactPolicy: 'ask', notifyInternal: 0, webChatEnabled: 1, webChatGreeting: '¡Hola! Somos Norte Astur. ¿En qué podemos ayudarte?', createdAt: ts, updatedAt: ts })
      .onConflictDoNothing()
    await updateSlaSettings(ctx.db, id, { newLeadUnattendedMinutes: 30, qualifiedWithoutActionHours: 24, inactiveLeadDays: 7, useBusinessHours: false })
  })

  tl.add(SETUP_DAY, '09:30', 'Oficinas y equipos', async (ctx) => {
    for (const o of OFFICES) {
      const { id } = await create(ctx, 'offices', { name: o.name, code: o.code, email: o.email, phone: o.phone, address: o.address, city: o.city, province: 'Asturias', postalCode: o.postalCode, country: 'España', timezone: DEMO_COMPANY.timezone, status: 'active' })
      ctxSetId(ctx, `office:${o.key}`, id)
    }
    for (const t of TEAMS) {
      const { id } = await create(ctx, 'teams', { name: t.name, officeId: officeId(ctx, t.office), description: t.description, status: 'active' })
      ctxSetId(ctx, `team:${t.key}`, id)
    }
  })

  tl.add(SETUP_DAY, '10:00', 'Comerciales', async (ctx) => {
    const ts = now()
    for (const [i, c] of COMMERCIALS.entries()) {
      // Cuenta del panel restringida a CRM, web y bandeja (sin finanzas ni
      // sistema). Sin contraseña utilizable: nadie entra con ella; existe para
      // que lo que hace cada comercial quede a su nombre.
      const [user] = await ctx.db
        .insert(schema.users)
        .values({ organizationId: orgId(ctx), name: c.name, email: c.email, password: await randomUnusablePassword(), role: 'admin', permissions: COMMERCIAL_PERMISSIONS, createdAt: ts, updatedAt: ts })
        .returning({ id: schema.users.id })
      ctxSetId(ctx, `user:${c.key}`, user.id)
      const { id } = await create(ctx, 'team', {
        name: c.name,
        email: c.email,
        position: c.position,
        description: c.description,
        experience: c.experience,
        languages: c.languages.join(', '),
        specialties: c.specialties,
        officeId: officeId(ctx, c.office),
        teamId: ctxId(ctx, `team:${c.team}`),
        userId: user.id,
        hireDate: c.hireDate,
        contractType: 'Indefinido',
        employmentStatus: 'active',
        workingHours: 'L-V 9:00-14:00 y 16:30-19:30 · S 10:00-13:30',
        zones: c.zones,
        propertyTypes: c.propertyTypes,
        whatsapp: c.phone,
        department: 'Comercial',
        showOnWeb: 1,
        sortOrder: i + 1,
      })
      ctxSetId(ctx, `tm:${c.key}`, id)
      // El teléfono no lo expone el recurso genérico (sí la ficha del comercial).
      await ctx.db.update(schema.teamMembers).set({ phone: c.phone }).where(eq(schema.teamMembers.id, id))
    }
    for (const t of TEAMS) {
      await ctx.db.update(schema.teams).set({ leadMemberId: commercialId(ctx, t.lead) }).where(eq(schema.teams.id, ctxId(ctx, `team:${t.key}`)))
    }
  })

  tl.add(SETUP_DAY, '11:00', 'Marca, fotos del equipo y oficinas', async (ctx) => {
    const adminId = ctxId(ctx, `user:${DEMO_ADMIN.key}`)
    const logo = await uploadDemoAsset(ctx, 'marca/logo-norte-astur.png', { category: 'logo', createdBy: adminId })
    const logoWhite = await uploadDemoAsset(ctx, 'marca/logo-norte-astur-blanco.png', { category: 'logo', createdBy: adminId })
    const mark = await uploadDemoAsset(ctx, 'marca/marca-norte-astur.png', { category: 'logo', createdBy: adminId })
    // El logo de la empresa se pinta en un hueco cuadrado (menú del panel, cabecera de la web): va el isotipo; el logo horizontal, en el Brand Kit.
    await ctx.db.update(schema.organizations).set({ logo: mark, updatedAt: now() }).where(eq(schema.organizations.id, orgId(ctx)))
    await saveBrandKit(ctx.db, orgId(ctx), adminId, {
      logo,
      logoAlt: 'Norte Astur Inmobiliaria',
      logoLight: logoWhite,
      logoDark: logo,
      isotype: mark,
      favicon: mark,
      colorPrimary: DEMO_COMPANY.brandColor,
      colorSecondary: DEMO_COMPANY.secondaryColor,
      colorAccents: [DEMO_COMPANY.accentColor, '#8FC1B5'],
      colorBackground: DEMO_COMPANY.backgroundColor,
      colorText: DEMO_COMPANY.textColor,
      fontHeading: DEMO_COMPANY.fontHeading,
      fontBody: DEMO_COMPANY.fontBody,
      buttonStyle: 'rounded',
      cardStyle: 'soft',
      iconStyle: 'outline',
      phone: DEMO_COMPANY.phone,
      whatsapp: DEMO_COMPANY.whatsapp,
      email: DEMO_COMPANY.email,
      website: DEMO_COMPANY.website,
      legalText: DEMO_COMPANY.legalText,
      socialLinks: { instagram: 'https://instagram.example/norteastur', facebook: 'https://facebook.example/norteastur' },
    })
    for (const c of COMMERCIALS) {
      const photo = await uploadDemoAsset(ctx, personPhotoPath(c.key), { category: 'upload', entityType: 'team', entityId: commercialId(ctx, c.key), createdBy: adminId })
      await ctx.db.update(schema.teamMembers).set({ image: photo }).where(eq(schema.teamMembers.id, commercialId(ctx, c.key)))
    }
    for (const o of OFFICES) {
      const photo = await uploadDemoAsset(ctx, o.photo, { category: 'upload', entityType: 'offices', entityId: officeId(ctx, o.key), createdBy: adminId })
      await ctx.db.update(schema.offices).set({ photo }).where(eq(schema.offices.id, officeId(ctx, o.key)))
    }
  })

  tl.add(SETUP_DAY, '12:00', 'Promotoras y comunidades', async (ctx) => {
    for (const d of DEVELOPERS) {
      const logo = await uploadDemoAsset(ctx, d.logo, { category: 'logo' })
      const { id } = await create(ctx, 'developers', { name: d.name, email: d.email, phone: d.phone, description: d.description, logo, status: 'active' })
      ctxSetId(ctx, `dev:${d.key}`, id)
    }
    for (const cm of COMMUNITIES) {
      const image = await uploadDemoAsset(ctx, cm.image, { category: 'upload', entityType: 'communities' })
      const { id } = await create(ctx, 'communities', { name: cm.name, location: cm.location, description: cm.description, featureDescription: cm.featureDescription, image })
      ctxSetId(ctx, `cm:${cm.key}`, id)
    }
  })

  tl.add(SETUP_DAY + 1, '10:00', 'Reglas de reparto de leads', async (ctx) => {
    const rules = [
      { name: 'Propiedad: su comercial responsable', priority: 10, scope: 'property' },
      { name: 'Clientes en alemán', priority: 20, scope: 'language', matchValue: 'de', targetCommercialId: commercialId(ctx, 'com-paula') },
      { name: 'Clientes en francés', priority: 21, scope: 'language', matchValue: 'fr', targetCommercialId: commercialId(ctx, 'com-alvaro') },
      { name: 'Clientes en inglés', priority: 22, scope: 'language', matchValue: 'en', targetOfficeId: officeId(ctx, 'o-oriente'), strategy: 'round_robin' },
      { name: 'Zona Oviedo', priority: 30, scope: 'zone', matchValue: 'Oviedo', targetOfficeId: officeId(ctx, 'o-oviedo'), strategy: 'round_robin' },
      { name: 'Zona Gijón', priority: 31, scope: 'zone', matchValue: 'Gijón', targetOfficeId: officeId(ctx, 'o-gijon'), strategy: 'round_robin' },
      { name: 'Zona Avilés', priority: 32, scope: 'zone', matchValue: 'Avilés', targetOfficeId: officeId(ctx, 'o-gijon'), strategy: 'round_robin' },
      { name: 'Costa oriental: Llanes', priority: 33, scope: 'zone', matchValue: 'Llanes', targetOfficeId: officeId(ctx, 'o-oriente'), strategy: 'round_robin' },
      { name: 'Oficina de entrada', priority: 40, scope: 'office', strategy: 'round_robin' },
      { name: 'Reparto general por carga de trabajo', priority: 90, scope: 'department', strategy: 'workload' },
    ]
    for (const r of rules) await create(ctx, 'lead-routing-rules', { enabled: 1, ...r })
  })

  tl.add(SETUP_DAY + 1, '11:00', 'Campos personalizados', async (ctx) => {
    const fields = [
      { entityType: 'property', key: 'orientacion_comercial', label: 'Orientación comercial', fieldType: 'select', optionsJson: ['Primera vivienda', 'Segunda residencia', 'Inversión', 'Lujo'], section: 'Comercialización', sortOrder: 1, helpText: 'A qué comprador va dirigida la comunicación de esta propiedad.' },
      { entityType: 'property', key: 'llaves', label: 'Disponibilidad de llaves', fieldType: 'select', optionsJson: ['En oficina', 'Las tiene la propiedad', 'Portero / conserje', 'Caja de seguridad'], section: 'Visitas', sortOrder: 2 },
      { entityType: 'contact', key: 'canal_preferido', label: 'Canal preferido', fieldType: 'select', optionsJson: ['Teléfono', 'WhatsApp', 'Email'], section: 'Preferencias', sortOrder: 1 },
      { entityType: 'contact', key: 'comprador_inversor', label: 'Comprador inversor', fieldType: 'boolean', section: 'Perfil', sortOrder: 2, helpText: 'Compra para alquilar o revender, no para vivir.' },
      { entityType: 'lead', key: 'plazo_estimado', label: 'Plazo estimado de compra', fieldType: 'select', optionsJson: ['Menos de 3 meses', '3-6 meses', '6-12 meses', 'Más de un año'], section: 'Cualificación', sortOrder: 1 },
      { entityType: 'deal', key: 'entidad_financiera', label: 'Entidad financiera', fieldType: 'text', section: 'Financiación', sortOrder: 1 },
    ]
    for (const f of fields) {
      const { id } = await create(ctx, 'custom-fields', { ...f, isRequired: 0, isPublic: 0, status: 'active' })
      ctxSetId(ctx, `cf:${f.key}`, id)
    }
  })
}

export { SETUP_DAY }
export const DEMO_PERSON_PHOTO = personPhotoPath
