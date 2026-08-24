-- Migration number: 0045    Per-org legal identity + repoint seeded content at the new clean URLs
--
-- 1. organizations gets the fields privacy/terms pages need to name a real
--    data controller instead of a hardcoded demo company (Prompt 9, task
--    12): legal name, tax id (CIF/NIF), address, contact email/phone. All
--    nullable — a page renders "por confirmar" rather than a fabricated
--    value when an org hasn't filled these in yet.
--
-- 2. The real-estate portal moves from /demo/* to clean URLs at the site
--    root (server/middleware/00.legacy-demo-redirect.ts now redirects both
--    the old bare legacy paths AND /demo/* straight to the new ones). Two
--    places had /demo/* URLs baked into stored content rather than built at
--    request time, so they'd otherwise keep linking to dead paths forever:
--    cms_redirects rows seeded by 0025, and the site_pages home block JSON
--    seeded by 0040. Both are simple string replacements — same technique
--    0033 used for the previous /-to-/demo move.

ALTER TABLE organizations ADD COLUMN legal_company_name TEXT;
ALTER TABLE organizations ADD COLUMN tax_id TEXT;
ALTER TABLE organizations ADD COLUMN legal_address TEXT;
ALTER TABLE organizations ADD COLUMN legal_email TEXT;
ALTER TABLE organizations ADD COLUMN legal_phone TEXT;

UPDATE cms_redirects SET to_path = '/blog' WHERE to_path = '/demo/blog';

UPDATE site_pages SET
  draft_json = REPLACE(REPLACE(REPLACE(draft_json, '/demo/contact-us', '/contacto'), '/demo/properties', '/propiedades'), '/demo/blog', '/blog'),
  published_json = REPLACE(REPLACE(REPLACE(published_json, '/demo/contact-us', '/contacto'), '/demo/properties', '/propiedades'), '/demo/blog', '/blog')
WHERE draft_json LIKE '%/demo/%' OR published_json LIKE '%/demo/%';
