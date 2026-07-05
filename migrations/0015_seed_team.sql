-- The team roster page (`/leadership`) has been empty since the original
-- port. Seeds the one real consultant already shown throughout the site
-- (AgentContactCard) so her profile page actually resolves — same real
-- photo, same invented-with-authorization supporting details already used
-- consistently elsewhere in the app, not new fabricated content.
INSERT INTO team_members (name, slug, email, position, description, experience, languages, specialties, image, created_at, updated_at)
VALUES (
  'Perla Maria Melgarejo',
  'perla-maria-melgarejo',
  'perla.melgarejo@mm-realestate.com',
  'Consultora Inmobiliaria Senior',
  'Especialista en propiedades off-plan y de lujo en Dubái. Acompaño a compradores internacionales en cada paso, desde la selección hasta la entrega de llaves, con un enfoque cercano y transparente en cada operación.',
  '8 años en el sector inmobiliario de Dubái',
  'Español, English, العربية',
  'Off-plan, propiedades de lujo, inversores internacionales',
  '68725.png',
  datetime('now'),
  datetime('now')
);
