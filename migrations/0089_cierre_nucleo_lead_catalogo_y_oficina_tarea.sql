-- Migration number: 0089    Cierre del núcleo inmobiliario: catálogo de la propiedad de un lead y oficina de una tarea
--
-- SOLO AÑADE: dos columnas opcionales y un índice. Ninguna fila existente se
-- reescribe ni se borra. Se despliega ANTES que el código que la usa
-- (lección del 2026-09-15).
--
-- 1. `leads.property_kind`: de qué catálogo es `leads.property_id`
--    ('agent' = 2ª mano, 'developer' = obra nueva). Hasta ahora el lead sólo
--    guardaba el id, y el enrutado «por propiedad» y «obra nueva» tenían que
--    adivinar el catálogo buscando el id primero en 2ª mano y luego en obra
--    nueva: con dos propiedades del mismo id en la agencia elegía mal. Las
--    filas existentes quedan en NULL («no consta») y el código conserva para
--    ellas la resolución de antes; no se rellena nada desde aquí.
--
-- 2. `tasks.office_id`: la oficina de la tarea (FASE 0, «officeId cuando
--    aplique»). NULL = la de su responsable, que es como se calculaba hasta
--    ahora; las filas existentes no cambian de oficina.

ALTER TABLE leads ADD COLUMN property_kind TEXT; -- agent | developer | NULL (no consta)
ALTER TABLE tasks ADD COLUMN office_id INTEGER; -- offices.id | NULL (la del responsable)

CREATE INDEX IF NOT EXISTS idx_tasks_org_office ON tasks (organization_id, office_id);
