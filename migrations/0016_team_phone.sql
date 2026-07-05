-- Real contact phone for team members, so profile pages don't need to
-- hardcode a single consultant's number outside the data model.
ALTER TABLE team_members ADD COLUMN phone TEXT;
UPDATE team_members SET phone = '+971504178823' WHERE slug = 'perla-maria-melgarejo';
