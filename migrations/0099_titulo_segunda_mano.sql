-- Migration number: 0099    Título de las propiedades de 2ª mano
--
-- SOLO AÑADE una columna. Ninguna fila existente se reescribe ni se borra: la
-- columna nueva queda en NULL («sin título»), que es exactamente lo que tiene
-- hoy una propiedad de 2ª mano. Se despliega ANTES que el código que la lee
-- (lección del 2026-09-15).
--
-- Para qué (reestructuración del Constructor de Propiedades, Cola 11): las
-- propiedades de obra nueva tienen `developer_properties.name`, pero las de
-- 2ª mano sólo tenían título por idioma en property_translations (en y ar) y
-- ninguno en castellano; se identificaban por tipo y referencia. Para que las
-- dos secciones usen el mismo constructor, con «Título» en Información básica
-- y el slug generado a partir de él, la 2ª mano necesita el suyo. Las
-- traducciones no se tocan.
--
-- Recuperación: columna nullable sin default; el código anterior la ignora.
-- agent_properties pasa de 82 a 83 columnas (D1 admite 100).

ALTER TABLE agent_properties ADD COLUMN name TEXT;
