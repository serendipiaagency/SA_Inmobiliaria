-- Migration number: 0033    Fix cms_redirects.to_path after the public site
-- moved from "/" to "/demo/*" — any existing redirect rule that targeted one
-- of the moved paths needs the same "/demo" prefix, or it silently redirects
-- visitors to the new (mostly blank) root placeholder instead of real content.

UPDATE cms_redirects SET to_path = '/demo' WHERE to_path = '/';

UPDATE cms_redirects
SET to_path = '/demo' || to_path
WHERE to_path != '/'
  AND (
    to_path IN ('/properties', '/mapa', '/project-community', '/developer-list', '/about-us', '/contact-us', '/visitor', '/vendors/registration', '/privacy', '/terms', '/blog', '/compare', '/favoritos', '/complain', '/leadership')
    OR to_path LIKE '/property-details/%'
    OR to_path LIKE '/blog/%'
    OR to_path LIKE '/leadership/%'
    OR to_path LIKE '/community/%'
    OR to_path LIKE '/vendors/%'
  );
