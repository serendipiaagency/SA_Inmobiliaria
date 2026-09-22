-- Migration number: 0067    FASE 11 — Motor de matching: persistencia de matches
--
-- El motor de matching calcula bajo demanda: comparar cada necesidad contra
-- cada inmueble y guardar el resultado generaría millones de filas sin valor.
-- Aquí sólo se persiste lo que representa una DECISIÓN comercial real —
-- seleccionado, enviado, descartado — junto con el desglose con el que se
-- tomó y la versión de las reglas que lo produjo, para que siga siendo
-- interpretable si los pesos cambian.
--
-- Aditiva: no borra ni reescribe ninguna columna existente.

-- ---------------------------------------------------------------------------
-- 1) Poder distinguir "no lo tiene" de "no consta"
-- ---------------------------------------------------------------------------
--
-- Las columnas has_elevator / has_pool / has_garage / has_terrace / has_garden
-- de agent_properties son NOT NULL DEFAULT 0. Eso significa que hoy un 0 no se
-- puede leer: puede ser "el piso no tiene piscina" o "nadie ha rellenado la
-- ficha todavía". La fase exige explícitamente que el matching distinga FALSE
-- de UNKNOWN, así que hace falta un dato que diga si alguien las repasó.
--
-- No se reescribe ninguna fila: todas las existentes quedan con NULL, es decir
-- "sin repasar". La política del motor es entonces:
--
--     has_x = 1                          -> SÍ  (el 1 sólo puede venir de que
--                                                alguien lo marcara: el valor
--                                                por defecto es 0)
--     has_x = 0 y features_reviewed_at    -> NO
--     has_x = 0 y sin features_reviewed_at-> DESCONOCIDO
--
-- Convertir el NULL en una fecha inventada habría sido afirmar que se revisó
-- algo que nadie revisó, y el motor descartaría inmuebles buenos por fichas
-- incompletas.
ALTER TABLE agent_properties ADD COLUMN features_reviewed_at TEXT;
ALTER TABLE agent_properties ADD COLUMN features_reviewed_by INTEGER;

-- ---------------------------------------------------------------------------
-- 2) El match persistido
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS property_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  property_id INTEGER NOT NULL REFERENCES agent_properties(id) ON DELETE CASCADE,
  buyer_requirement_id INTEGER NOT NULL REFERENCES buyer_requirements(id) ON DELETE CASCADE,
  -- Derivable desde la necesidad, pero se copia para poder listar los matches
  -- de una persona sin un JOIN extra en cada consulta.
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,

  -- Compatibilidad inmueble <-> necesidad. NO es el lead score (intención
  -- comercial de una oportunidad): son dos números distintos y mezclarlos
  -- haría que "buen encaje" y "cliente caliente" significaran lo mismo.
  score INTEGER,
  eligibility TEXT NOT NULL DEFAULT 'eligible', -- eligible | ineligible | needs_review
  -- Qué parte de los criterios puntuables se pudo evaluar (0..1).
  confidence REAL,

  -- Estado COMERCIAL del match, que no tiene nada que ver con el score: un
  -- match del 95 % puede estar descartado y uno del 60 % visitado.
  status TEXT NOT NULL DEFAULT 'new', -- new | selected | sent | discarded | viewing | offered
  discarded_reason TEXT,

  -- El desglose con el que se tomó la decisión, y la versión de las reglas que
  -- lo produjo: si mañana cambian los pesos, un match guardado se sigue
  -- pudiendo leer tal y como se calculó.
  breakdown_json TEXT,
  rules_version INTEGER NOT NULL DEFAULT 1,

  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);

-- Un único match por par (necesidad, inmueble): decidir dos veces sobre el
-- mismo inmueble actualiza la decisión, no crea otra en paralelo.
CREATE UNIQUE INDEX IF NOT EXISTS property_matches_pair ON property_matches (buyer_requirement_id, property_id);
CREATE INDEX IF NOT EXISTS property_matches_org_status ON property_matches (organization_id, status);
CREATE INDEX IF NOT EXISTS property_matches_org_property ON property_matches (organization_id, property_id);
CREATE INDEX IF NOT EXISTS property_matches_org_contact ON property_matches (organization_id, contact_id);
