-- Real post-render QA (round-trip QR decode + PDF page-count/open check) needs
-- somewhere to persist its result — nullable, so old rows without a value are
-- simply unvalidated rather than fabricated as passing.
ALTER TABLE asset_export_renders ADD COLUMN validation_json TEXT;
ALTER TABLE asset_export_catalog_items ADD COLUMN validation_json TEXT;
ALTER TABLE asset_export_catalogs ADD COLUMN validation_json TEXT;
