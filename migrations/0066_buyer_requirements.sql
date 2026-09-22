-- Migration number: 0066    FASE 10 — Buyer Requirement (y su dependencia Contact)
--
-- La Fase 10 define `BuyerRequirement.contactId` y "Contact 1 → 0..N
-- BuyerRequirements": una misma persona busca a la vez vivienda habitual,
-- inversión y local, con criterios distintos. Hasta ahora no existía ninguna
-- entidad "persona" en el dominio: `leads` y `clients` guardan cada uno su
-- propio nombre/email/teléfono sueltos y no se conocen entre sí — tanto es
-- así que server/utils/comms/matching.ts tiene que cruzarlos comparando los
-- últimos 9 dígitos del teléfono con un LIKE. `contacts` nace aquí como la
-- dependencia que la propia fase exige, no como un rediseño aparte.
--
-- ADITIVA. No se borra ni se reescribe ninguna fila existente:
--   * `leads` y `clients` conservan TODAS sus columnas actuales y siguen
--     funcionando igual; sólo ganan `contact_id` NULLable. Un lead sin
--     contacto resuelto es un estado válido (la Fase 12 lo llama "lead
--     intake data" frente a "Contact master data", y la 79 exige que
--     convertir un lead NO lo elimine).
--   * El backfill (abajo) sólo enlaza por coincidencia EXACTA de email o
--     teléfono normalizados. Nada de fusionar por parecido: la Fase 14
--     prohíbe el auto-merge y distingue EXACT de POSSIBLE.
--
-- Lo que deliberadamente NO se añade:
--   * `office_id`: no existe entidad Office (team_members.office_name es
--     texto libre). Una FK a una tabla inexistente sería una columna muerta.
--   * `score`: la Fase 32 construirá el Lead Score explicable. Inventar aquí
--     un número sería justo el "número mágico" que esa fase prohíbe.

-- ---------------------------------------------------------------------------
-- CONTACT — la persona (u organización)
-- ---------------------------------------------------------------------------
CREATE TABLE contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'person',              -- person | company
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  whatsapp TEXT,
  -- Valores normalizados para deduplicar (Fase 14 §98): el email en
  -- minúsculas y sin espacios; los teléfonos en E.164 con "+" mediante
  -- normalizePhone() de server/utils/comms/phone.ts — el mismo normalizador
  -- que ya usa el Centro de Comunicaciones, no uno nuevo. NULL cuando el
  -- valor original no se puede normalizar con seguridad (un número local sin
  -- prefijo internacional no se adivina).
  normalized_email TEXT,
  normalized_phone TEXT,
  normalized_whatsapp TEXT,
  -- Fase 14 §99: un id externo sólo es único dentro de su origen. "12345"
  -- de Idealista y "12345" de un CRM importado no son la misma persona.
  external_source TEXT,
  external_id TEXT,
  language TEXT,
  assigned_commercial_id INTEGER,                   -- team_members.id (el "Comercial" real del producto)
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',            -- active | archived
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  deleted_at TEXT
);

-- Los índices de dedup son por tenant (Fase 14 §100: una agencia no puede
-- llegar a saber que otra tiene a esa persona). NO son UNIQUE: encontrar un
-- duplicado abre una decisión humana (unificar / vincular / crear igualmente),
-- no un rechazo automático — §101 y §109.
CREATE INDEX contacts_org_email ON contacts (organization_id, normalized_email);
CREATE INDEX contacts_org_phone ON contacts (organization_id, normalized_phone);
CREATE INDEX contacts_org_whatsapp ON contacts (organization_id, normalized_whatsapp);
CREATE INDEX contacts_org_created ON contacts (organization_id, created_at);
CREATE INDEX contacts_org_commercial ON contacts (organization_id, assigned_commercial_id);
-- El id externo sí es unívoco dentro de (tenant, origen): reimportar la misma
-- ficha no debe duplicarla.
CREATE UNIQUE INDEX contacts_org_external ON contacts (organization_id, external_source, external_id)
  WHERE external_source IS NOT NULL AND external_id IS NOT NULL;

-- Enlace no destructivo desde las tablas existentes.
ALTER TABLE leads ADD COLUMN contact_id INTEGER REFERENCES contacts(id);
ALTER TABLE clients ADD COLUMN contact_id INTEGER REFERENCES contacts(id);
CREATE INDEX leads_contact ON leads (contact_id);
CREATE INDEX clients_contact ON clients (contact_id);

-- ---------------------------------------------------------------------------
-- BUYER REQUIREMENT — la necesidad inmobiliaria
-- ---------------------------------------------------------------------------
CREATE TABLE buyer_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  assigned_commercial_id INTEGER,                   -- team_members.id
  title TEXT NOT NULL DEFAULT '',                   -- "Vivienda habitual", "Inversión"…
  status TEXT NOT NULL DEFAULT 'active',            -- active | paused | fulfilled | archived

  -- §7: misma taxonomía que Property. agent_properties.transaction_type ya
  -- usa sale|rent; se reutiliza tal cual para no necesitar una capa de
  -- equivalencia entre "SALE" y "PURCHASE".
  operation TEXT NOT NULL DEFAULT 'sale',           -- sale | rent

  -- §8: varios tipos por necesidad (piso + ático + dúplex), guardados como
  -- los valores estables del catálogo (Apartment|Villa|Townhouse|Penthouse|
  -- Studio), nunca etiquetas libres escritas a mano.
  property_types_json TEXT NOT NULL DEFAULT '[]',

  -- §9/§10/§11. Todos opcionales. NULL significa "no especificado", que NO
  -- es lo mismo que 0 — la diferencia la respeta el motor de matching de la
  -- Fase 11 (§28, UNKNOWN ≠ FALSE).
  price_min REAL,
  price_max REAL,
  area_min REAL,
  area_max REAL,
  bedrooms_min INTEGER,
  bathrooms_min INTEGER,

  -- §12–§14: zonas deseadas y excluidas. Se guardan como referencias
  -- estructuradas {communityId|locationId|city|district|postalCode}, no como
  -- "Chamberí, Salamanca, Retiro" en un string. Las exclusiones tienen
  -- precedencia cuando hay conflicto (§14) — lo aplica el matching.
  desired_zones_json TEXT NOT NULL DEFAULT '[]',
  excluded_zones_json TEXT NOT NULL DEFAULT '[]',

  -- §15: búsqueda por radio. El cálculo geoespacial es de servidor, no del
  -- navegador.
  center_lat REAL,
  center_lng REAL,
  radius_km REAL,

  -- §17/§18. `condition_pref` es el estado físico, que NO se confunde con el
  -- estado comercial de la Property. `build_pref` NUNCA se deduce del módulo
  -- de origen: que una ficha se haya creado en "Propiedades 2ª mano" no la
  -- convierte en vivienda de segunda mano (§18 lo prohíbe explícitamente).
  condition_pref TEXT,                              -- good | to_reform | any
  build_pref TEXT,                                  -- new | second_hand | renovated

  desired_date TEXT,                                -- §19: cuándo quiere comprar/alquilar. No es created_at.

  -- §20/§21: la hipoteca necesita estado, no un booleano ambiguo que luego no
  -- sepa distinguir "la necesita" de "ya se la han aprobado".
  needs_mortgage INTEGER,                           -- NULL = desconocido, 0 = no, 1 = sí
  mortgage_status TEXT,                             -- required | requested | preapproved | approved | not_needed
  financing_notes TEXT,

  -- §22: validado por una acción real, con autor y fecha. No se marca solo
  -- porque el cliente haya escrito una cifra.
  budget_validated INTEGER NOT NULL DEFAULT 0,
  budget_validated_at TEXT,
  budget_validated_by INTEGER,

  urgency TEXT,                                     -- §23: low | medium | high | urgent

  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  deleted_at TEXT
);

CREATE INDEX buyer_requirements_org_contact ON buyer_requirements (organization_id, contact_id);
CREATE INDEX buyer_requirements_org_status ON buyer_requirements (organization_id, status, operation);
CREATE INDEX buyer_requirements_commercial ON buyer_requirements (assigned_commercial_id);

-- ---------------------------------------------------------------------------
-- BUYER REQUIREMENT CRITERION — importancia por criterio
-- ---------------------------------------------------------------------------
-- §24 pide que cada criterio pueda ser imprescindible / preferible /
-- indiferente. §25 prohíbe resolverlo con terraceImportance,
-- garageImportance, poolImportance… (50 columnas y un modelo rígido).
-- §27 advierte de lo contrario: no sobreabstraer, porque los campos que se
-- consultan constantemente deben seguir siendo columnas indexables.
--
-- El equilibrio que se implementa: los valores viven arriba, en columnas
-- reales y consultables; aquí vive la IMPORTANCIA y los criterios que no
-- merecen columna propia (terraza, ascensor, garaje, piscina, jardín…).
-- El valor se guarda tipado en tres columnas en vez de en un blob, para
-- poder filtrar sin parsear JSON.
CREATE TABLE buyer_requirement_criteria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  buyer_requirement_id INTEGER NOT NULL REFERENCES buyer_requirements(id) ON DELETE CASCADE,
  criterion_type TEXT NOT NULL,                     -- price | area | bedrooms | bathrooms | zone | terrace | elevator | garage | pool | garden | build | condition
  operator TEXT NOT NULL DEFAULT 'eq',              -- eq | lte | gte | in | between
  value_number REAL,
  value_text TEXT,
  value_bool INTEGER,
  importance TEXT NOT NULL DEFAULT 'preferred',     -- required | preferred | indifferent
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX brc_requirement ON buyer_requirement_criteria (buyer_requirement_id, criterion_type);
CREATE INDEX brc_org_type ON buyer_requirement_criteria (organization_id, criterion_type);
-- Un mismo criterio no se declara dos veces en la misma necesidad.
CREATE UNIQUE INDEX brc_requirement_type ON buyer_requirement_criteria (buyer_requirement_id, criterion_type);

-- ---------------------------------------------------------------------------
-- BACKFILL — derivar Contacts de los datos que ya existen
-- ---------------------------------------------------------------------------
-- Derivar identidad de filas reales no es inventar datos: el nombre, el email
-- y el teléfono ya estaban ahí. Lo que NO se hace es fusionar por parecido.
--
-- Reglas del backfill:
--   1. Un Contact por cada `clients` (es la ficha de persona más completa que
--      existe hoy: tiene tipo, ubicación y valor de vida).
--   2. Un Contact por cada `leads` que NO case EXACTAMENTE — por email en
--      minúsculas, o por teléfono con todos los separadores quitados — con
--      un cliente del mismo tenant.
--   3. Los leads que sí casan exactamente se enlazan al Contact del cliente.
-- Cualquier coincidencia más débil (mismo nombre, teléfono parecido) deja dos
-- Contacts separados a propósito: los detectará el buscador de duplicados de
-- la Fase 14 y lo decidirá una persona.
--
-- La normalización E.164 real (con prefijo por país) se hace en TypeScript al
-- crear/editar; SQLite aquí sólo puede limpiar separadores, que es suficiente
-- para un enlace exacto y conservador. Los normalized_* quedan rellenos para
-- los casos que SQL puede resolver con certeza y los completará el servicio.

INSERT INTO contacts (organization_id, kind, name, email, phone, normalized_email, normalized_phone, notes, status, created_at, updated_at)
SELECT
  c.organization_id,
  'person',
  c.name,
  c.email,
  c.phone,
  CASE WHEN c.email IS NOT NULL AND TRIM(c.email) <> '' THEN LOWER(TRIM(c.email)) END,
  CASE WHEN c.phone IS NOT NULL AND TRIM(c.phone) <> '' THEN
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(c.phone), ' ', ''), '-', ''), '(', ''), ')', ''), '.', '')
  END,
  c.notes,
  CASE WHEN c.stage = 'inactive' THEN 'archived' ELSE 'active' END,
  COALESCE(NULLIF(c.created_at, ''), datetime('now')),
  COALESCE(NULLIF(c.updated_at, ''), datetime('now'))
FROM clients c;

UPDATE clients SET contact_id = (
  SELECT ct.id FROM contacts ct
  WHERE ct.organization_id = clients.organization_id
    AND ct.name = clients.name
    AND (ct.email IS clients.email)
    AND (ct.phone IS clients.phone)
  ORDER BY ct.id LIMIT 1
);

-- Leads que casan exactamente con un cliente ya convertido en Contact.
UPDATE leads SET contact_id = (
  SELECT ct.id FROM contacts ct
  WHERE ct.organization_id = leads.organization_id
    AND (
      (leads.email IS NOT NULL AND TRIM(leads.email) <> '' AND ct.normalized_email = LOWER(TRIM(leads.email)))
      OR
      (leads.phone IS NOT NULL AND TRIM(leads.phone) <> '' AND ct.normalized_phone =
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(leads.phone), ' ', ''), '-', ''), '(', ''), ')', ''), '.', ''))
    )
  ORDER BY ct.id LIMIT 1
);

-- El resto de leads estrena Contact, pero UNO POR PERSONA, no uno por lead:
-- dos leads de la misma persona (§102: pregunta en enero por una propiedad y
-- en marzo por otra) comparten Contact. Se agrupa por identidad normalizada
-- exacta — primero email, después teléfono — y sólo al final, los leads sin
-- ningún dato de contacto reciben una ficha individual.
--
-- El GROUP BY con MAX(l.id) se apoya en el comportamiento documentado de
-- SQLite: al usar un agregado max(), las columnas sueltas del SELECT se toman
-- de la fila que produjo ese máximo. Es decir, la ficha se crea con los datos
-- del lead MÁS RECIENTE de esa persona, no con una mezcla de varias filas.

-- (a) Un Contact por email distinto.
INSERT INTO contacts (organization_id, kind, name, email, phone, normalized_email, normalized_phone, notes, status, created_at, updated_at)
SELECT
  l.organization_id,
  'person',
  l.name,
  l.email,
  l.phone,
  LOWER(TRIM(l.email)),
  CASE WHEN l.phone IS NOT NULL AND TRIM(l.phone) <> '' THEN
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(l.phone), ' ', ''), '-', ''), '(', ''), ')', ''), '.', '')
  END,
  l.notes,
  'active',
  COALESCE(NULLIF(l.created_at, ''), datetime('now')),
  COALESCE(NULLIF(l.updated_at, ''), datetime('now'))
FROM leads l
WHERE l.contact_id IS NULL AND l.email IS NOT NULL AND TRIM(l.email) <> ''
GROUP BY l.organization_id, LOWER(TRIM(l.email))
HAVING MAX(l.id) IS NOT NULL;

UPDATE leads SET contact_id = (
  SELECT ct.id FROM contacts ct
  WHERE ct.organization_id = leads.organization_id
    AND ct.normalized_email = LOWER(TRIM(leads.email))
  ORDER BY ct.id LIMIT 1
)
WHERE contact_id IS NULL AND email IS NOT NULL AND TRIM(email) <> '';

-- (b) Un Contact por teléfono distinto, entre los que siguen sin enlazar.
INSERT INTO contacts (organization_id, kind, name, email, phone, normalized_phone, notes, status, created_at, updated_at)
SELECT
  l.organization_id,
  'person',
  l.name,
  l.email,
  l.phone,
  REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(l.phone), ' ', ''), '-', ''), '(', ''), ')', ''), '.', ''),
  l.notes,
  'active',
  COALESCE(NULLIF(l.created_at, ''), datetime('now')),
  COALESCE(NULLIF(l.updated_at, ''), datetime('now'))
FROM leads l
WHERE l.contact_id IS NULL AND l.phone IS NOT NULL AND TRIM(l.phone) <> ''
GROUP BY l.organization_id, REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(l.phone), ' ', ''), '-', ''), '(', ''), ')', ''), '.', '')
HAVING MAX(l.id) IS NOT NULL;

UPDATE leads SET contact_id = (
  SELECT ct.id FROM contacts ct
  WHERE ct.organization_id = leads.organization_id
    AND ct.normalized_phone = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(leads.phone), ' ', ''), '-', ''), '(', ''), ')', ''), '.', '')
  ORDER BY ct.id LIMIT 1
)
WHERE contact_id IS NULL AND phone IS NOT NULL AND TRIM(phone) <> '';

-- (c) Leads sin email ni teléfono: ficha individual, porque no hay ninguna
-- señal con la que agruparlos sin inventar.
INSERT INTO contacts (organization_id, kind, name, notes, status, created_at, updated_at)
SELECT
  l.organization_id,
  'person',
  l.name,
  l.notes,
  'active',
  COALESCE(NULLIF(l.created_at, ''), datetime('now')),
  COALESCE(NULLIF(l.updated_at, ''), datetime('now'))
FROM leads l
WHERE l.contact_id IS NULL;

UPDATE leads SET contact_id = (
  SELECT ct.id FROM contacts ct
  WHERE ct.organization_id = leads.organization_id
    AND ct.name = leads.name
    AND ct.normalized_email IS NULL
    AND ct.normalized_phone IS NULL
  ORDER BY ct.id DESC LIMIT 1
)
WHERE contact_id IS NULL;
