-- Migration number: 0070    FASE 14 — Trazabilidad de la fusión de contactos
--
-- Aditiva: cuatro columnas nuevas en `contacts`. No borra ni reescribe nada.
--
-- La fusión (migración 0069) ya hace lo importante: nunca borra, archiva el
-- duplicado y reasigna sus relaciones al superviviente. Lo que no dejaba era
-- rastro de HACIA DÓNDE se fue.
--
-- Eso importa fuera del panel. Un id de contacto archivado puede seguir vivo
-- en un email enviado, en un export de hace tres meses o en el CRM de un
-- portal. Sin estas columnas, la única respuesta a "¿qué pasó con el contacto
-- 412?" es "está archivado" — que no distingue una fusión de un borrado, ni
-- dice con quién quedó unido. Con ellas, la pregunta se responde leyendo la
-- propia fila.
--
-- `merged_into_contact_id` es además la condición para poder DESHACER una
-- fusión equivocada: sin saber quién absorbió a quién, un merge mal hecho es
-- irreversible aunque no se haya borrado nada.

ALTER TABLE contacts ADD COLUMN merged_into_contact_id INTEGER REFERENCES contacts(id);
ALTER TABLE contacts ADD COLUMN merged_at TEXT;
ALTER TABLE contacts ADD COLUMN merged_by INTEGER;

-- Qué valores había a cada lado y cuál se eligió, tal y como se vio en el
-- preview. Es el "por qué" de la fusión: sin él, seis meses después, nadie
-- puede decir si el email que falta se descartó a propósito o se perdió.
ALTER TABLE contacts ADD COLUMN merge_details_json TEXT;

-- Para listar "todo lo que se fusionó en este contacto" sin recorrer la tabla.
CREATE INDEX IF NOT EXISTS contacts_merged_into ON contacts (merged_into_contact_id);
