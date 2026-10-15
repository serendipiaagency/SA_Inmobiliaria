-- Migration number: 0097    Galería multimedia: estancia, descripción y miniatura por foto; miniatura y estancia por recurso multimedia
--
-- SOLO AÑADE columnas. Ninguna fila existente se reescribe ni se borra:
-- todas las columnas nuevas quedan en NULL («sin clasificar», «sin
-- descripción», «sin miniatura»), que es exactamente lo que la web enseña
-- hoy para esas fotos. Se despliega ANTES que el código que la lee (lección
-- del 2026-09-15).
--
-- Para qué: la galería de la ficha pública se reorganiza por categorías
-- (Todas las fotos, Estancias, Vídeos, Planos, 360°, Tour virtual…) y cada
-- foto se clasifica desde el panel. Hasta ahora una foto sólo tenía título,
-- alt, pie, idioma, orden y los tres interruptores de publicación.
--
-- Fotos de galería (`images`, obra nueva, y `property_gallery_images`, 2ª mano):
--   - room: la estancia (clave del catálogo utils/mediaRooms.ts: living,
--     kitchen, bedroom, bathroom, exterior…). NULL = sin clasificar: la foto
--     sigue saliendo en «Todas las fotos» y no se infiere nada del nombre del
--     archivo.
--   - description: texto largo opcional para el pie del visor (el `caption`
--     corto se conserva).
--   - thumb_key: clave en R2 de una miniatura WebP generada en el panel al
--     subir (o con «Generar miniaturas»). NULL = la web usa el original, como
--     hasta ahora.
--
-- Multimedia (`property_media`: vídeos, tours, renders, PDF, drone, 360):
--   - thumb_key: miniatura o póster del recurso (un vídeo subido, una 360).
--   - room: estancia, para los renders y las 360 que la tengan.

ALTER TABLE images ADD COLUMN room TEXT;
ALTER TABLE images ADD COLUMN description TEXT;
ALTER TABLE images ADD COLUMN thumb_key TEXT;

ALTER TABLE property_gallery_images ADD COLUMN room TEXT;
ALTER TABLE property_gallery_images ADD COLUMN description TEXT;
ALTER TABLE property_gallery_images ADD COLUMN thumb_key TEXT;

ALTER TABLE property_media ADD COLUMN thumb_key TEXT;
ALTER TABLE property_media ADD COLUMN room TEXT;
