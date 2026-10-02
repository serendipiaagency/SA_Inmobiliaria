-- Migration number: 0086    Núcleo inmobiliario: modelo completo (FASES 0-24)
--
-- Cierre del megaprompt «Núcleo inmobiliario, CRM, leads, visitas e
-- inteligencia aplicada» (ver docs/auditoria-nucleo-megaprompt.md).
--
-- SOLO AÑADE: tablas nuevas y columnas nuevas, todas opcionales o con valor
-- por defecto. Ninguna fila existente se reescribe ni se borra; cada
-- propiedad, contacto, lead o cita queda exactamente como estaba. Se
-- despliega ANTES que el código que la usa (lección del 2026-09-15).
--
-- D1 admite como máximo 100 columnas por tabla y developer_properties ya
-- tiene 93: los campos de ficha que faltan van en dos tablas 1:1 por
-- propiedad (property_details, property_legal_economics), compartidas por los
-- dos catálogos mediante (property_kind, property_id). Columnas tipadas, no
-- JSON, para poder filtrar, buscar y usarlas en matching e IA.

-- ---------------------------------------------------------------------------
-- FASE 0 — Oficinas y equipos (hoy son texto libre en team_members)
-- ---------------------------------------------------------------------------
CREATE TABLE offices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  code TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  province TEXT,
  postal_code TEXT,
  country TEXT,
  timezone TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  deleted_at TEXT
);
CREATE INDEX offices_org ON offices(organization_id);
CREATE UNIQUE INDEX offices_org_name ON offices(organization_id, name) WHERE deleted_at IS NULL;

CREATE TABLE teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  office_id INTEGER,
  name TEXT NOT NULL,
  description TEXT,
  lead_member_id INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  deleted_at TEXT
);
CREATE INDEX teams_org ON teams(organization_id);
CREATE UNIQUE INDEX teams_org_name ON teams(organization_id, name) WHERE deleted_at IS NULL;

-- Comercial ↔ oficina, equipo y usuario del panel (hoy no hay vínculo
-- usuario ↔ comercial: createdBy apunta a users y la asignación a team_members).
ALTER TABLE team_members ADD COLUMN office_id INTEGER;
ALTER TABLE team_members ADD COLUMN team_id INTEGER;
ALTER TABLE team_members ADD COLUMN user_id INTEGER;
CREATE UNIQUE INDEX team_members_user ON team_members(user_id) WHERE user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- FASE 0 — Campos transversales en propiedades (autor y borrado lógico)
-- ---------------------------------------------------------------------------
ALTER TABLE agent_properties ADD COLUMN created_by INTEGER;
ALTER TABLE agent_properties ADD COLUMN deleted_at TEXT;
ALTER TABLE developer_properties ADD COLUMN created_by INTEGER;
ALTER TABLE developer_properties ADD COLUMN deleted_at TEXT;

-- ---------------------------------------------------------------------------
-- FASES 1-4 + multimedia — ficha ampliada de la propiedad (1:1)
-- ---------------------------------------------------------------------------
CREATE TABLE property_details (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  property_kind TEXT NOT NULL,          -- 'agent' (2ª mano) | 'developer' (obra nueva / web)
  property_id INTEGER NOT NULL,
  -- Identificación
  commercial_code TEXT,
  subtype TEXT,
  office_id INTEGER,
  team_id INTEGER,
  commercial_status TEXT,               -- available | reserved | sold | rented | withdrawn | draft
  -- Ubicación
  region TEXT,
  province TEXT,
  municipality TEXT,
  neighborhood TEXT,
  street_type TEXT,
  staircase TEXT,
  -- Superficies (m²)
  office_area REAL,
  commercial_area REAL,
  total_area REAL,
  computable_area REAL,
  -- Distribución
  rooms_total INTEGER,
  terraces_count INTEGER,
  balconies_count INTEGER,
  storerooms_count INTEGER,
  dressing_rooms_count INTEGER,
  studies_count INTEGER,
  floors_count INTEGER,
  -- Edificio
  renovation_year INTEGER,
  building_floors INTEGER,
  building_units INTEGER,
  has_concierge INTEGER,
  has_doorman INTEGER,
  facade TEXT,
  structure TEXT,
  -- Vivienda
  exterior_interior TEXT,               -- exterior | interior
  kitchen_type TEXT,
  has_built_in_wardrobes INTEGER,
  flooring TEXT,
  carpentry TEXT,
  glazing TEXT,
  ceiling_height REAL,
  is_renovated INTEGER,
  -- Instalaciones
  heating TEXT,
  hot_water TEXT,
  has_air_conditioning INTEGER,
  has_underfloor_heating INTEGER,
  has_fireplace INTEGER,
  has_home_automation INTEGER,
  has_alarm INTEGER,
  has_fiber INTEGER,
  has_solar_panels INTEGER,
  has_aerothermal INTEGER,
  -- Zonas comunes
  has_community_pool INTEGER,
  has_community_garden INTEGER,
  has_gym INTEGER,
  has_paddle INTEGER,
  has_tennis INTEGER,
  has_playground INTEGER,
  has_coworking INTEGER,
  has_social_room INTEGER,
  has_security INTEGER,
  -- Exterior
  views TEXT,
  is_beachfront INTEGER,
  has_private_garden INTEGER,
  has_private_pool INTEGER,
  has_porch INTEGER,
  has_patio INTEGER,
  has_balcony INTEGER,
  -- Multimedia
  virtual_tour_url TEXT,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX property_details_property ON property_details(property_kind, property_id);
CREATE INDEX property_details_org ON property_details(organization_id);
CREATE INDEX property_details_office ON property_details(organization_id, office_id);

-- ---------------------------------------------------------------------------
-- FASES 5-6 — económica, comisiones y legal (1:1)
-- ---------------------------------------------------------------------------
CREATE TABLE property_legal_economics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  property_kind TEXT NOT NULL,
  property_id INTEGER NOT NULL,
  -- Venta
  price_min_authorized REAL,
  price_recommended REAL,
  -- Alquiler
  rent_deposit REAL,                    -- fianza
  rent_guarantee REAL,                  -- depósito / garantía adicional
  rent_expenses_included INTEGER,
  community_fee_monthly REAL,
  ibi_annual REAL,
  garbage_tax_annual REAL,
  -- Comisiones
  commission_type TEXT,                 -- percentage | fixed
  commission_value REAL,
  commission_vat_pct REAL,
  buyer_fee REAL,
  owner_fee REAL,
  -- Legal
  cadastral_reference TEXT,
  registry_status TEXT,
  registry_property_number TEXT,        -- finca registral
  land_registry TEXT,                   -- registro de la propiedad
  encumbrances TEXT,                    -- cargas
  mortgage_status TEXT,
  occupancy_status TEXT,
  licenses TEXT,
  habitability_certificate TEXT,        -- cédula de habitabilidad
  ite_status TEXT,
  energy_certificate_number TEXT,
  energy_certificate_expiry TEXT,
  energy_consumption REAL,
  emissions_rating TEXT,
  emissions_value REAL,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX property_legal_economics_property ON property_legal_economics(property_kind, property_id);
CREATE INDEX property_legal_economics_org ON property_legal_economics(organization_id);

-- FASE 5 — historial de precios completo
ALTER TABLE price_history ADD COLUMN previous_price REAL;
ALTER TABLE price_history ADD COLUMN changed_by INTEGER;
ALTER TABLE price_history ADD COLUMN reason TEXT;
ALTER TABLE agent_property_price_history ADD COLUMN previous_price REAL;
ALTER TABLE agent_property_price_history ADD COLUMN changed_by INTEGER;
ALTER TABLE agent_property_price_history ADD COLUMN reason TEXT;

-- ---------------------------------------------------------------------------
-- FASE 6 — documentos de la propiedad con permisos
-- ---------------------------------------------------------------------------
CREATE TABLE property_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  property_kind TEXT NOT NULL,
  property_id INTEGER NOT NULL,
  doc_type TEXT NOT NULL,               -- deed | land_registry_note | ibi | energy_certificate | plans | contract | mandate | licenses | receipts | community | other
  title TEXT NOT NULL,
  r2_key TEXT,
  media_asset_id INTEGER,
  file_name TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  visibility TEXT NOT NULL DEFAULT 'internal', -- internal | owner | authorized_buyer | public
  issued_at TEXT,
  expires_at TEXT,
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  deleted_at TEXT
);
CREATE INDEX property_documents_property ON property_documents(organization_id, property_kind, property_id);

CREATE TABLE property_document_access (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  document_id INTEGER NOT NULL,
  contact_id INTEGER NOT NULL,
  granted_by INTEGER,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX property_document_access_unique ON property_document_access(document_id, contact_id);

-- ---------------------------------------------------------------------------
-- FASE 7 — multimedia completa
-- ---------------------------------------------------------------------------
ALTER TABLE images ADD COLUMN title TEXT;
ALTER TABLE images ADD COLUMN alt TEXT;
ALTER TABLE images ADD COLUMN caption TEXT;
ALTER TABLE images ADD COLUMN language TEXT;
ALTER TABLE images ADD COLUMN is_publishable INTEGER NOT NULL DEFAULT 1;
ALTER TABLE images ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0;
ALTER TABLE images ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0;
ALTER TABLE property_gallery_images ADD COLUMN title TEXT;
ALTER TABLE property_gallery_images ADD COLUMN alt TEXT;
ALTER TABLE property_gallery_images ADD COLUMN caption TEXT;
ALTER TABLE property_gallery_images ADD COLUMN language TEXT;
ALTER TABLE property_gallery_images ADD COLUMN is_publishable INTEGER NOT NULL DEFAULT 1;
ALTER TABLE property_gallery_images ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0;
ALTER TABLE property_gallery_images ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0;

-- Vídeos, tours virtuales, renders, PDF, drone y 360 (las fotos y planos
-- siguen en sus tablas). Cada recurso con su metadato completo.
CREATE TABLE property_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  property_kind TEXT NOT NULL,
  property_id INTEGER NOT NULL,
  media_type TEXT NOT NULL,             -- video | virtual_tour | render | pdf | drone | pano360 | other
  url TEXT,
  r2_key TEXT,
  title TEXT,
  alt TEXT,
  caption TEXT,
  language TEXT,
  is_main INTEGER NOT NULL DEFAULT 0,
  is_publishable INTEGER NOT NULL DEFAULT 1,
  is_private INTEGER NOT NULL DEFAULT 0,
  is_hidden INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  deleted_at TEXT
);
CREATE INDEX property_media_property ON property_media(organization_id, property_kind, property_id);

-- ---------------------------------------------------------------------------
-- FASE 8 — roles de contacto y contactos de una propiedad
-- ---------------------------------------------------------------------------
CREATE TABLE contact_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  contact_id INTEGER NOT NULL,
  role TEXT NOT NULL,                   -- buyer | seller | owner | landlord | tenant | investor | collaborator | supplier | other
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX contact_roles_unique ON contact_roles(contact_id, role);
CREATE INDEX contact_roles_org ON contact_roles(organization_id, role);

CREATE TABLE property_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  property_kind TEXT NOT NULL,
  property_id INTEGER NOT NULL,
  contact_id INTEGER NOT NULL,
  role TEXT NOT NULL,                   -- owner | co_owner | attorney | tenant | contact
  ownership_pct REAL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  deleted_at TEXT
);
CREATE INDEX property_contacts_property ON property_contacts(organization_id, property_kind, property_id);
CREATE INDEX property_contacts_contact ON property_contacts(organization_id, contact_id);

-- FASE 9 — cabecera CRM 360
ALTER TABLE contacts ADD COLUMN country TEXT;
ALTER TABLE contacts ADD COLUMN source TEXT;
ALTER TABLE contacts ADD COLUMN office_id INTEGER;
ALTER TABLE contacts ADD COLUMN last_contact_at TEXT;
ALTER TABLE contacts ADD COLUMN next_action_type TEXT;
ALTER TABLE contacts ADD COLUMN next_action_at TEXT;

-- ---------------------------------------------------------------------------
-- FASE 0 — Note como entidad
-- ---------------------------------------------------------------------------
CREATE TABLE notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  entity_type TEXT NOT NULL,            -- contact | lead | property | appointment | deal
  entity_id INTEGER NOT NULL,
  property_kind TEXT,
  contact_id INTEGER,
  lead_id INTEGER,
  property_id INTEGER,
  appointment_id INTEGER,
  deal_operation_id INTEGER,
  body TEXT NOT NULL,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  deleted_at TEXT
);
CREATE INDEX notes_entity ON notes(organization_id, entity_type, entity_id);
CREATE INDEX notes_contact ON notes(organization_id, contact_id);

-- ---------------------------------------------------------------------------
-- FASE 0 — campos personalizados por organización
-- ---------------------------------------------------------------------------
CREATE TABLE custom_field_definitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  entity_type TEXT NOT NULL,            -- property | contact | lead | appointment | deal
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL,             -- text | textarea | number | boolean | date | select | multiselect
  options_json TEXT,
  is_required INTEGER NOT NULL DEFAULT 0,
  section TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  help_text TEXT,
  is_public INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  deleted_at TEXT
);
CREATE UNIQUE INDEX custom_field_definitions_key ON custom_field_definitions(organization_id, entity_type, key);

CREATE TABLE custom_field_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  definition_id INTEGER NOT NULL,
  entity_type TEXT NOT NULL,
  entity_kind TEXT,                     -- para propiedades: agent | developer
  entity_id INTEGER NOT NULL,
  value_text TEXT,
  value_number REAL,
  value_json TEXT,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX custom_field_values_unique ON custom_field_values(definition_id, entity_kind, entity_id);
CREATE INDEX custom_field_values_entity ON custom_field_values(organization_id, entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- FASES 12-16 — leads
-- ---------------------------------------------------------------------------
ALTER TABLE leads ADD COLUMN office_id INTEGER;
ALTER TABLE leads ADD COLUMN team_id INTEGER;
ALTER TABLE leads ADD COLUMN created_by INTEGER;
ALTER TABLE leads ADD COLUMN deleted_at TEXT;
ALTER TABLE leads ADD COLUMN first_contact_at TEXT;
-- converted_contact_id NO se añade aquí: la tabla leads de producción ya la
-- tiene (resto del incidente de 0069: su esquema se creó por otro camino,
-- ver migrations/0070_*.sql y .github/workflows/d1-add-leads-whatsapp-column.yml),
-- y repetirla hizo fallar la primera aplicación de esta migración en
-- producción ("duplicate column name: converted_contact_id"; D1 la revirtió
-- entera). El contacto al que se convierte un lead es leads.contact_id: el
-- código no usa converted_contact_id en ningún sitio.
ALTER TABLE leads ADD COLUMN converted_at TEXT;
ALTER TABLE leads ADD COLUMN language TEXT;
ALTER TABLE leads ADD COLUMN external_id TEXT;

-- FASE 15 — routing por oficina y por horario
ALTER TABLE lead_routing_rules ADD COLUMN target_office_id INTEGER;
ALTER TABLE lead_routing_rules ADD COLUMN schedule_json TEXT;

-- ---------------------------------------------------------------------------
-- FASES 17-19 — citas y resultado de visita
-- ---------------------------------------------------------------------------
ALTER TABLE visits ADD COLUMN contact_id INTEGER;
ALTER TABLE visits ADD COLUMN office_id INTEGER;
ALTER TABLE visits ADD COLUMN timezone TEXT;
ALTER TABLE visits ADD COLUMN meeting_point TEXT;
ALTER TABLE visits ADD COLUMN internal_notes TEXT;
ALTER TABLE visits ADD COLUMN cancellation_reason TEXT;
ALTER TABLE visits ADD COLUMN cancelled_at TEXT;
ALTER TABLE visits ADD COLUMN reminder_status TEXT;
ALTER TABLE visits ADD COLUMN created_by INTEGER;
ALTER TABLE visits ADD COLUMN updated_at TEXT;
ALTER TABLE visits ADD COLUMN deleted_at TEXT;
ALTER TABLE visits ADD COLUMN interest_level INTEGER;
ALTER TABLE visits ADD COLUMN outcome_liked TEXT;
ALTER TABLE visits ADD COLUMN outcome_disliked TEXT;
ALTER TABLE visits ADD COLUMN price_perception TEXT;   -- cheap | fair | expensive
ALTER TABLE visits ADD COLUMN location_rating INTEGER;  -- 1-5
ALTER TABLE visits ADD COLUMN condition_rating INTEGER; -- 1-5
ALTER TABLE visits ADD COLUMN layout_rating INTEGER;    -- 1-5
ALTER TABLE visits ADD COLUMN wants_second_visit INTEGER;
ALTER TABLE visits ADD COLUMN wants_to_offer INTEGER;
ALTER TABLE visits ADD COLUMN discarded INTEGER;

-- ---------------------------------------------------------------------------
-- FASES 22-24 — tareas y operaciones
-- ---------------------------------------------------------------------------
ALTER TABLE tasks ADD COLUMN deleted_at TEXT;
ALTER TABLE deal_operations ADD COLUMN office_id INTEGER;
ALTER TABLE deal_operations ADD COLUMN deleted_at TEXT;
ALTER TABLE reservations ADD COLUMN deal_operation_id INTEGER;
ALTER TABLE deposit_payments ADD COLUMN deal_operation_id INTEGER;
ALTER TABLE contracts ADD COLUMN deal_operation_id INTEGER;
