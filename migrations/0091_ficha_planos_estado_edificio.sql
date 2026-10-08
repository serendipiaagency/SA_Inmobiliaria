-- Migration number: 0091    Ficha de la propiedad (#110): planos con título, orden y visibilidad; estado del inmueble y del edificio
--
-- SOLO AÑADE columnas. Ninguna fila existente se reescribe ni se borra. Se
-- despliega ANTES que el código que la usa (lección del 2026-09-15).
--
-- Planos (`floor_plans`, obra nueva, y `agent_property_floor_plans`, 2ª mano):
-- hasta ahora eran filas sin título, sin orden y sin forma de ocultarlas.
--   - title: lo que se lee en la ficha («Planta baja», «Ático»). NULL en lo
--     existente: la ficha cae a la categoría o al tipo de unidad, como el
--     editor.
--   - sort_order: 0 en lo existente; con el mismo orden, por id (el orden en
--     que se subieron, que es el que ya tenían).
--   - is_public: 1 en lo existente. La API pública de la ficha ya devolvía
--     TODOS los planos de obra nueva (sin pintarlos); a partir de ahora la
--     ficha los enseña y se puede ocultar uno a uno.
--
-- Ficha ampliada (`property_details`, hoy 72 columnas; queda en 77 de 100):
-- campos que pedía la sección «Estado del inmueble» / «El edificio» y no
-- existían. Todos opcionales: NULL = «sin indicar», que la ficha no enseña.

ALTER TABLE floor_plans ADD COLUMN title TEXT;
ALTER TABLE floor_plans ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE floor_plans ADD COLUMN is_public INTEGER NOT NULL DEFAULT 1; -- 1 visible en la web | 0 sólo en el panel

ALTER TABLE agent_property_floor_plans ADD COLUMN title TEXT;
ALTER TABLE agent_property_floor_plans ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_property_floor_plans ADD COLUMN is_public INTEGER NOT NULL DEFAULT 1;

ALTER TABLE property_details ADD COLUMN kitchen_equipment TEXT; -- equipped | semi_equipped | unequipped
ALTER TABLE property_details ADD COLUMN bathrooms_condition TEXT; -- new | renovated | good | to_update
ALTER TABLE property_details ADD COLUMN installations_condition TEXT; -- new | renovated | good | to_update
ALTER TABLE property_details ADD COLUMN building_condition TEXT; -- new | excellent | good | to_renovate
ALTER TABLE property_details ADD COLUMN units_per_floor INTEGER;
