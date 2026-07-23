-- Migration number: 0022    Blog & CMS editorial module (Fase 1: arquitectura)
--
-- New tables only — nothing existing changes shape. Multi-tenant from the
-- start: every table carries organization_id (app-level scoping via
-- requireOrgScope/resolvePublicOrgId, same pattern as 0021). Content is
-- stored as a JSON block array (content_json) from day one so the premium
-- block editor (a later phase) needs no further schema migration to land.

CREATE TABLE IF NOT EXISTS cms_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  parent_id INTEGER,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  color TEXT,
  icon TEXT,
  image TEXT,
  description TEXT,
  seo_title TEXT,
  seo_description TEXT,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS cms_categories_org_slug ON cms_categories (organization_id, slug);
CREATE INDEX IF NOT EXISTS cms_categories_org ON cms_categories (organization_id);

CREATE TABLE IF NOT EXISTS cms_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS cms_tags_org_slug ON cms_tags (organization_id, slug);
CREATE INDEX IF NOT EXISTS cms_tags_org ON cms_tags (organization_id);

CREATE TABLE IF NOT EXISTS cms_authors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  user_id INTEGER REFERENCES users(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  photo TEXT,
  bio TEXT,
  specialty TEXT,
  facebook TEXT,
  twitter TEXT,
  linkedin TEXT,
  instagram TEXT,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS cms_authors_org_slug ON cms_authors (organization_id, slug);
CREATE INDEX IF NOT EXISTS cms_authors_org ON cms_authors (organization_id);

CREATE TABLE IF NOT EXISTS cms_articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  author_id INTEGER REFERENCES cms_authors(id),
  category_id INTEGER REFERENCES cms_categories(id),
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  excerpt TEXT,
  content_json TEXT NOT NULL DEFAULT '[]',
  cover_image TEXT,
  language TEXT NOT NULL DEFAULT 'es',
  status TEXT NOT NULL DEFAULT 'draft',
  published_at TEXT,
  scheduled_at TEXT,
  expires_at TEXT,
  reading_time_minutes INTEGER NOT NULL DEFAULT 0,
  view_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  seo_title TEXT,
  seo_description TEXT,
  seo_canonical TEXT,
  seo_robots TEXT NOT NULL DEFAULT 'index,follow',
  og_image TEXT,
  focus_keyword TEXT,
  seo_score INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  deleted_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS cms_articles_org_slug ON cms_articles (organization_id, slug);
CREATE INDEX IF NOT EXISTS cms_articles_org_status ON cms_articles (organization_id, status);

CREATE TABLE IF NOT EXISTS cms_article_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL REFERENCES cms_articles(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES cms_tags(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS cms_article_tags_unique ON cms_article_tags (article_id, tag_id);

CREATE TABLE IF NOT EXISTS cms_article_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL REFERENCES cms_articles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content_json TEXT NOT NULL DEFAULT '[]',
  edited_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS cms_article_versions_article ON cms_article_versions (article_id, created_at);

CREATE TABLE IF NOT EXISTS cms_media_folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  parent_id INTEGER,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS cms_media_folders_org ON cms_media_folders (organization_id);

CREATE TABLE IF NOT EXISTS cms_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  folder_id INTEGER REFERENCES cms_media_folders(id),
  filename TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT NOT NULL,
  alt_text TEXT,
  width INTEGER,
  height INTEGER,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  favorite INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS cms_media_org ON cms_media (organization_id);

CREATE TABLE IF NOT EXISTS cms_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  article_id INTEGER NOT NULL REFERENCES cms_articles(id) ON DELETE CASCADE,
  parent_id INTEGER,
  author_name TEXT NOT NULL,
  author_email TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS cms_comments_org_status ON cms_comments (organization_id, status);
CREATE INDEX IF NOT EXISTS cms_comments_article ON cms_comments (article_id);

CREATE TABLE IF NOT EXISTS cms_redirects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  from_path TEXT NOT NULL,
  to_path TEXT NOT NULL,
  status_code INTEGER NOT NULL DEFAULT 301,
  hits INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS cms_redirects_org_from ON cms_redirects (organization_id, from_path);

-- One row per organization — real module settings, not a hardcoded stub.
CREATE TABLE IF NOT EXISTS cms_settings (
  organization_id INTEGER PRIMARY KEY,
  default_language TEXT NOT NULL DEFAULT 'es',
  comments_enabled INTEGER NOT NULL DEFAULT 1,
  comments_require_approval INTEGER NOT NULL DEFAULT 1,
  default_author_id INTEGER REFERENCES cms_authors(id),
  updated_at TEXT NOT NULL DEFAULT ''
);
