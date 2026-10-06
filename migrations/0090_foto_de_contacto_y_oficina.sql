-- Migration number: 0090    Foto de un contacto del CRM y de una oficina
--
-- SOLO AÑADE: dos columnas opcionales. Ninguna fila existente se reescribe ni
-- se borra: todas quedan en NULL («sin foto»), que es exactamente lo que el
-- panel muestra hoy. Se despliega ANTES que el código que la usa (lección del
-- 2026-09-15).
--
-- Mismo formato que `team_members.image` y `communities.image`: una clave de
-- R2 (lo que devuelve una subida a la biblioteca de medios) o una URL. Hasta
-- ahora un contacto y una oficina no tenían dónde guardar su foto, y el
-- comercial sí.

ALTER TABLE contacts ADD COLUMN photo TEXT; -- clave R2 o URL | NULL (sin foto)
ALTER TABLE offices ADD COLUMN photo TEXT; -- clave R2 o URL | NULL (sin foto)
