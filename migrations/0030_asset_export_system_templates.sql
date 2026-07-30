-- Migration number: 0030    Asset Export Studio — starter system templates
--
-- Two real, fully-structured system templates (organization_id NULL — see
-- migrations/0029) for the one format the renderer can actually produce
-- today (pdf_a4_portrait, see server/utils/assetExport/formats.ts). Seeding
-- 20+ empty/placeholder templates across every format in the original spec
-- would violate "no placeholders" more than shipping fewer, real ones —
-- more formats/styles get their own templates once the visual editor
-- (Fase 5-6) and image renderer are in place.

INSERT INTO asset_export_templates (organization_id, name, description, category, format_key, asset_type_scope, is_system, status, structure_json, created_at, updated_at)
VALUES
(
  NULL,
  'Modern Clean',
  'Ficha de una página: foto principal, precio, ubicación, descripción y QR. Limpia y neutra, válida para cualquier tipo de activo.',
  'moderna',
  'pdf_a4_portrait',
  NULL,
  1,
  'published',
  '{"pages":[{"id":"p1","elements":[
    {"id":"cover","type":"image","x":0,"y":0,"w":595,"h":380,"binding":"{{asset.mainImage}}"},
    {"id":"logo","type":"image","x":40,"y":24,"w":90,"h":40,"binding":"{{tenant.logo}}"},
    {"id":"title","type":"text","x":40,"y":410,"w":420,"h":36,"binding":"{{asset.title}}","style":{"fontSize":22,"weight":700}},
    {"id":"price","type":"text","x":40,"y":450,"w":420,"h":28,"binding":"{{asset.price}}","style":{"fontSize":18,"color":"primary"}},
    {"id":"location","type":"text","x":40,"y":482,"w":420,"h":22,"binding":"{{asset.location}}","style":{"fontSize":12,"color":"muted"}},
    {"id":"description","type":"text","x":40,"y":520,"w":420,"h":220,"binding":"{{asset.description}}","style":{"fontSize":11,"lineHeight":1.5}},
    {"id":"qr","type":"qr","x":480,"y":700,"w":75,"h":75,"binding":"{{asset.qrCode}}"},
    {"id":"legal","type":"text","x":40,"y":800,"w":420,"h":30,"binding":"{{tenant.legalText}}","style":{"fontSize":8,"color":"muted"}}
  ]}]}',
  datetime('now'),
  datetime('now')
),
(
  NULL,
  'Luxury Editorial',
  'Ficha editorial de una página con jerarquía tipográfica marcada, pensada para propiedades de alto valor.',
  'luxury',
  'pdf_a4_portrait',
  NULL,
  1,
  'published',
  '{"pages":[{"id":"p1","elements":[
    {"id":"cover","type":"image","x":0,"y":0,"w":595,"h":500,"binding":"{{asset.mainImage}}"},
    {"id":"logo","type":"image","x":40,"y":440,"w":110,"h":45,"binding":"{{tenant.logo}}"},
    {"id":"title","type":"text","x":40,"y":540,"w":515,"h":48,"binding":"{{asset.title}}","style":{"fontSize":30,"weight":700,"letterSpacing":0.5}},
    {"id":"price","type":"text","x":40,"y":600,"w":300,"h":30,"binding":"{{asset.price}}","style":{"fontSize":20,"color":"primary"}},
    {"id":"location","type":"text","x":40,"y":636,"w":300,"h":22,"binding":"{{asset.location}}","style":{"fontSize":12,"color":"muted","uppercase":true}},
    {"id":"description","type":"text","x":40,"y":670,"w":515,"h":100,"binding":"{{asset.description}}","style":{"fontSize":11,"lineHeight":1.6}},
    {"id":"qr","type":"qr","x":480,"y":600,"w":75,"h":75,"binding":"{{asset.qrCode}}"},
    {"id":"legal","type":"text","x":40,"y":800,"w":515,"h":30,"binding":"{{tenant.legalText}}","style":{"fontSize":8,"color":"muted"}}
  ]}]}',
  datetime('now'),
  datetime('now')
);
