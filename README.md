# SA Inmobiliaria — Property Marketplace on Cloudflare Workers

Full rewrite of the original Laravel property marketplace as a **Nuxt 3** application that runs natively on **Cloudflare Workers**, with **D1** (SQLite) replacing MySQL and **R2** replacing local disk storage.

## Stack

| Layer | Technology |
|---|---|
| Framework | Nuxt 3 (Vue 3, SSR) — Nitro `cloudflare_module` preset |
| Runtime | Cloudflare Workers |
| Database | Cloudflare D1 via Drizzle ORM |
| File storage | Cloudflare R2 (images, floor plans, PDFs) |
| Styling | Tailwind CSS |
| Auth | Cookie sessions stored in D1, PBKDF2 password hashing (Web Crypto) |

## Features

**Public site**
- Home with latest projects, communities, developers and blog posts
- Off-plan project search with filters (name, community, status, price range, developer)
- Project detail: gallery, unit types, floor plans, master plan, location map, payment plan, amenities, nearby locations
- Communities, developers, team (leadership) and blog (EN/AR translations)
- Forms: contact, complaints, visitor form (with PDF uploads to R2), vendor registration

**Admin panel** (`/admin`, role-based)
- Dashboard with counts
- Generic CRUD for: off-plan projects, properties, developers, agents, communities, amenities, locations, master plans, floor plans, unit types, galleries, blog posts (with EN/AR translations), team members, users
- Read-only inboxes: visitor submissions, vendor registrations, contact & complaints
- Image/PDF uploads stored in R2

## Local development

```bash
npm install

# Create the local D1 database and apply migrations
npm run db:migrate:local

# Start dev server (nitro-cloudflare-dev provides D1/R2 bindings locally)
npm run dev
```

## Deploy to Cloudflare Workers

1. **Authenticate**: `npx wrangler login`

2. **Create the D1 database**:
   ```bash
   npx wrangler d1 create sa_inmobiliaria
   ```
   Copy the returned `database_id` into `wrangler.toml`.

3. **Create the R2 bucket**:
   ```bash
   npx wrangler r2 bucket create sa-inmobiliaria-media
   ```

4. **Apply migrations** (schema + seed admin user):
   ```bash
   npm run db:migrate
   ```

5. **Deploy**:
   ```bash
   npm run deploy
   ```

6. **Sign in** at `https://<your-worker>.workers.dev/login`:
   - Email: `admin@sa-inmobiliaria.com`
   - Password: `ChangeMe123!` — **change it immediately** in Admin → Users.

## Project structure

```
migrations/          D1 SQL migrations (schema + seed)
server/db/schema.ts  Drizzle schema (ported from the Laravel migrations)
server/utils/        DB, auth (sessions + PBKDF2), R2 media, admin resource registry
server/api/          REST endpoints (public site, auth, generic admin CRUD, media)
pages/               Public pages + /admin panel
layouts/             default (public) and admin layouts
```

## Notes on the migration from Laravel

- The Spatie roles/permissions tables were simplified to a `role` column on `users` (`admin` / `user`).
- `intervention/image` and `spatie/pdf-to-image` (native PHP extensions, unavailable on Workers) were dropped; images are stored as uploaded. Cloudflare Image Resizing can be enabled in front if transformations are needed.
- Contact/complaint emails are stored in D1 (`contact_messages`) instead of SMTP; wire up an email API (e.g. Resend, MailChannels) in `server/api/public/contact.post.ts` if outbound mail is required.
- Blog and property translations (EN/AR) keep the same translation-table design as Laravel.
