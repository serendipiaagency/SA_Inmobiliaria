-- Migration number: 0057    Tracking table for in-progress R2 multipart uploads
--
-- P1-8 (docs/production-hardening-audit.md): video uploads used to buffer
-- the entire file (up to 100MB) in the Worker's memory in one request. This
-- table backs the new chunked/multipart upload flow (server/utils/mediaMultipart.ts)
-- so a later request (uploading part N, completing, or aborting) can prove
-- ownership of an R2 multipart upload_id via a real D1 row, the same
-- ownership model every other write in this codebase uses — never by
-- trusting the opaque id/key strings alone.
--
-- Purely additive (CREATE TABLE) — no rebuild.

CREATE TABLE media_multipart_uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  upload_id TEXT NOT NULL UNIQUE,
  r2_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  extension TEXT NOT NULL,
  category TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  original_filename TEXT,
  declared_size_bytes INTEGER NOT NULL,
  created_by INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT '',
  completed_at TEXT
);

CREATE INDEX media_multipart_uploads_org ON media_multipart_uploads (organization_id, status);
CREATE INDEX media_multipart_uploads_stale ON media_multipart_uploads (status, created_at);
