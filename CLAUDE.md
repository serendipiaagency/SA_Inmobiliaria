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

## Shipping: validate, push, PR, merge — without being asked

The owner has made this the standing rule (2026-09-15). A local-only rule
briefly replaced it on 2026-09-16 and the owner revoked it the same day
(«ignora regla 28»), so this is the rule in force. **Do not wait for
permission to ship.** When a piece of work is finished:

1. Run the full gate: `npm run typecheck && npm test && npm run build && npm run migrations:check`.
   A red gate means the work isn't finished — fix it, don't ship it and don't
   ask what to do.
2. Commit, then push to the working branch.
3. Open a pull request against `main` describing what changed and why.
4. Merge it.

Merging to `main` starts the production pipeline in `.github/workflows/ci.yml`
(D1 backup → remote migrations → deploy → smoke test), so a merge is a
production release. That is the intended behaviour, not an accident.

### What still gets said out loud before it ships

Autonomy is about not asking permission, not about shipping quietly. Say so
plainly in the report — and, where it belongs, in the PR body — when:

- **the change needs a migration.** Code can be rolled back by redeploying; a
  migration that rewrites or drops data cannot. Name the migration and what it
  does to existing rows.
- **the change alters authentication, `requireOrgScope()`, or the RBAC
  matrix.** These are what keep one agency's data out of another's.
- **something in the pipeline is broken** such that the merge won't do what it
  looks like it does — for example a failing `production-preflight` job, which
  skips `deploy-production` (and therefore the migration step) while Workers
  Builds deploys the code anyway.

### What is still not ours to do

There are no Cloudflare credentials in these sessions, so `wrangler deploy`,
`npm run release` and remote D1 migrations cannot be run directly regardless
of authorisation — production is reached through the pipeline, not by hand.
Destructive one-way operations against live data (applying migrations to
production, deleting records, real sends, real charges) still need an explicit
ask from the owner, every time, even when the shipping rule above is in force.

### Hard-won lesson, 2026-09-15

Production spent weeks with the deployed code **12 migrations ahead of the
schema**, because Workers Builds published every push while the job that
applies migrations never ran. The visible symptom was "I can't log in" — the
live code read a `users.permissions` column that did not exist yet, so every
login failed regardless of the password.

The pending migration had been flagged in report after report as a footnote.
When the symptom appeared, three plausible-but-wrong causes were chased
(password, rate limit, dev bypass) before anyone looked at the schema.

**The lesson: when a known pending item exists and a symptom shows up, check
the known item before forming a new hypothesis.** A footnote that keeps
reappearing is not a footnote.
