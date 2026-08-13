# SA Inmobiliaria

Multi-tenant real estate SaaS. Nuxt 3 + Nitro (`cloudflare_module` preset) on
Cloudflare Workers, D1 (via Drizzle ORM) for the database, R2 for file
storage. One shared D1 database serves every tenant — every tenant-scoped
table carries an `organizationId` column, enforced in server routes via
`requireOrgScope()` (`server/utils/auth.ts`).

## Update the in-app help module when you add a feature

The admin panel has a self-service help center at `/admin/ayuda`
(`pages/admin/ayuda.vue`), backed by `composables/useHelpContent.ts`. It is
meant to document every admin-facing feature in the platform.

**Whenever you add a new admin page, or add meaningfully new functionality to
an existing one, add or update its entry in `composables/useHelpContent.ts`**
(and add the page to the `nav` array in `layouts/admin.vue` if it's a new
page). An entry has a `group` matching the nav section label, a short
`summary`, and `steps` describing how to actually use the feature. If the
feature commonly raises questions, add a matching FAQ entry too.

A feature with no entry in `useHelpContent.ts` is effectively undocumented to
the people using this platform — treat updating it as part of finishing the
feature, not as optional follow-up.
