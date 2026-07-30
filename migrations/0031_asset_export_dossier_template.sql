-- Migration number: 0031    Asset Export Studio — real multi-page dossier template
--
-- Fase 11 (dossiers multipágina): the renderer already iterates
-- structure.pages generically (server/utils/assetExport/pdfRenderer.ts), so
-- multi-page PDFs work today — this seeds one real, complete 3-page system
-- template (portada / resumen / contacto) to actually exercise and prove
-- that path, instead of leaving multi-page support unverified.

INSERT INTO asset_export_templates (organization_id, name, description, category, format_key, asset_type_scope, is_system, status, structure_json, created_at, updated_at)
VALUES
(
  NULL,
  'Dossier estándar',
  'Dossier de 3 páginas: portada, resumen con características, y contacto — pensado para reuniones comerciales.',
  'corporativa',
  'pdf_dossier',
  NULL,
  1,
  'published',
  '{"pages":[
    {"id":"cover","elements":[
      {"id":"cv-img","type":"image","x":0,"y":0,"w":595,"h":500,"binding":"{{asset.mainImage}}"},
      {"id":"cv-logo","type":"image","x":40,"y":440,"w":100,"h":42,"binding":"{{tenant.logo}}"},
      {"id":"cv-title","type":"text","x":40,"y":540,"w":515,"h":44,"binding":"{{asset.title}}","style":{"fontSize":28,"weight":700}},
      {"id":"cv-price","type":"text","x":40,"y":592,"w":300,"h":28,"binding":"{{asset.price}}","style":{"fontSize":18,"color":"primary"}},
      {"id":"cv-location","type":"text","x":40,"y":624,"w":300,"h":22,"binding":"{{asset.location}}","style":{"fontSize":12,"color":"muted","uppercase":true}},
      {"id":"cv-qr","type":"qr","x":480,"y":592,"w":75,"h":75,"binding":"{{asset.qrCode}}"},
      {"id":"cv-pagenum","type":"text","x":40,"y":815,"w":100,"h":16,"binding":"1 / 3","style":{"fontSize":8,"color":"muted"}}
    ]},
    {"id":"summary","elements":[
      {"id":"sm-logo","type":"image","x":40,"y":30,"w":80,"h":34,"binding":"{{tenant.logo}}"},
      {"id":"sm-heading","type":"text","x":40,"y":90,"w":515,"h":30,"binding":"Resumen","style":{"fontSize":20,"weight":700}},
      {"id":"sm-type","type":"text","x":40,"y":130,"w":250,"h":18,"binding":"{{asset.propertyType}}","style":{"fontSize":11,"color":"muted"}},
      {"id":"sm-bedrooms","type":"text","x":40,"y":155,"w":150,"h":18,"binding":"{{asset.bedrooms}} habitaciones","style":{"fontSize":11}},
      {"id":"sm-bathrooms","type":"text","x":40,"y":178,"w":150,"h":18,"binding":"{{asset.bathrooms}} baños","style":{"fontSize":11}},
      {"id":"sm-area","type":"text","x":40,"y":201,"w":150,"h":18,"binding":"{{asset.builtArea}}","style":{"fontSize":11}},
      {"id":"sm-description","type":"text","x":40,"y":240,"w":515,"h":400,"binding":"{{asset.description}}","style":{"fontSize":11,"lineHeight":1.6}},
      {"id":"sm-pagenum","type":"text","x":40,"y":815,"w":100,"h":16,"binding":"2 / 3","style":{"fontSize":8,"color":"muted"}}
    ]},
    {"id":"contact","elements":[
      {"id":"ct-logo","type":"image","x":40,"y":30,"w":80,"h":34,"binding":"{{tenant.logo}}"},
      {"id":"ct-heading","type":"text","x":40,"y":90,"w":515,"h":30,"binding":"Contacto","style":{"fontSize":20,"weight":700}},
      {"id":"ct-phone","type":"text","x":40,"y":140,"w":300,"h":20,"binding":"{{tenant.phone}}","style":{"fontSize":13}},
      {"id":"ct-whatsapp","type":"text","x":40,"y":166,"w":300,"h":20,"binding":"{{tenant.whatsapp}}","style":{"fontSize":13}},
      {"id":"ct-email","type":"text","x":40,"y":192,"w":300,"h":20,"binding":"{{tenant.email}}","style":{"fontSize":13}},
      {"id":"ct-website","type":"text","x":40,"y":218,"w":300,"h":20,"binding":"{{tenant.website}}","style":{"fontSize":13}},
      {"id":"ct-qr","type":"qr","x":420,"y":140,"w":100,"h":100,"binding":"{{asset.qrCode}}"},
      {"id":"ct-legal","type":"text","x":40,"y":790,"w":515,"h":30,"binding":"{{tenant.legalText}}","style":{"fontSize":8,"color":"muted"}},
      {"id":"ct-pagenum","type":"text","x":40,"y":815,"w":100,"h":16,"binding":"3 / 3","style":{"fontSize":8,"color":"muted"}}
    ]}
  ]}',
  datetime('now'),
  datetime('now')
);
