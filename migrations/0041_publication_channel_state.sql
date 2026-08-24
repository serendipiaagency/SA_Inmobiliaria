-- Migration number: 0041    Publicación multicanal — estado honesto + credenciales por organización
--
-- Acompaña la reescritura de server/utils/publication/adapters.ts: ningún
-- canal (Idealista, Fotocasa, redes sociales, ...) tiene todavía una
-- integración real, así que publication_jobs.status ahora puede llegar a
-- 'blocked' (canal no configurado o no implementado) además de los valores
-- existentes — un estado terminal que el dispatcher nunca reintenta. Estas
-- tres columnas nuevas son lo que un canal real tendría que rellenar al
-- publicar de verdad; hoy quedan NULL porque no hay ninguna publicación real
-- todavía, pero la fila ya tiene sitio para guardarlo sin otra migración.

ALTER TABLE publication_jobs ADD COLUMN external_url TEXT;
ALTER TABLE publication_jobs ADD COLUMN published_at TEXT;
ALTER TABLE publication_jobs ADD COLUMN last_sync_at TEXT;

-- Almacenamiento cifrado de credenciales de canal por organización, para
-- cuando una inmobiliaria conecte su propia cuenta de un portal en vez de
-- depender de una credencial global del Worker (server/utils/publication/
-- channels.ts `secretEnvVar`). `ciphertext`/`iv` son AES-GCM sobre la clave
-- del secreto de Worker CHANNEL_CREDENTIALS_ENCRYPTION_KEY (ver
-- server/utils/publication/credentials.ts) — nunca texto plano en D1.
CREATE TABLE IF NOT EXISTS publication_channel_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  channel_key TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS publication_channel_credentials_org_channel ON publication_channel_credentials (organization_id, channel_key);
