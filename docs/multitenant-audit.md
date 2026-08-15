# Auditoría multitenant — matriz completa

Estado: **auditoría cerrada** · 91 tablas · 216 endpoints · 7 tareas cron · 1 bucket R2.

Este documento es la fotografía por tabla del aislamiento entre inquilinos
(*tenants*) de SA Inmobiliaria. El informe de vulnerabilidades y correcciones
está en [`multitenant-hardening-report.md`](./multitenant-hardening-report.md).

## Cómo leer la matriz

**Ámbito** — cómo se decide a qué inmobiliaria pertenece una fila:

| Valor | Significado |
|---|---|
| `DIRECTO` | La propia tabla tiene columna `organization_id`. |
| `TRANSITIVO` | La tabla **no** tiene `organization_id`; pertenece a un tenant a través de una FK a una tabla padre que sí lo tiene. |
| `GLOBAL` | Dato de plataforma, deliberadamente sin tenant. Exige justificación escrita en código y `requireSuperAdmin()`. |
| `SESIÓN` | Ligado a un usuario, no a una organización (el tenant se deriva del usuario). |

**Columnas de protección** — `GET` / `POST` / `PUT` / `DELETE` / `BULK`:

| Símbolo | Significado |
|---|---|
| ✅ | Protegido y verificado con test. |
| ⚠️→✅ | **Era vulnerable**, corregido en este bloque. Ver el ID de hallazgo. |
| — | No existe esa operación para esta tabla. |
| 🔑 | Acceso por token secreto (el token *es* la credencial); ver §IDOR. |
| 🌐 | Público por diseño (catálogo publicado), filtrado por el tenant del dominio. |

`BULK` cubre listados paginados, búsquedas, agregados (`count`, `sum`),
exportaciones e importaciones masivas.

---

## 1. Núcleo de plataforma y autenticación

| Tabla | `organization_id` | Ámbito | Padre (FK) | Endpoints | GET | POST | PUT | DEL | BULK | Riesgo → Corrección |
|---|---|---|---|---|---|---|---|---|---|---|
| `organizations` | — | **GLOBAL** | — | `/api/admin/organizations/*`, `/api/admin/active-org` | ✅ | ✅ | ✅ | ✅ | ✅ | Ninguno. Es el registro de inquilinos; `tenantPolicy: global` con motivo escrito + `superAdminOnly`. |
| `users` | sí | DIRECTO | — | `/api/admin/users/*`, `/api/auth/*` | ✅ | ✅ | ✅ | ✅ | ✅ | Ninguno. Escalado a `super_admin` ya bloqueado. |
| `sessions` | — | SESIÓN | `user_id → users` | `server/utils/auth.ts` | ✅ | ✅ | — | ✅ | — | Ninguno. El tenant se resuelve del usuario en cada petición. |
| `error_logs` | sí | **GLOBAL** | — | `/api/admin/error-logs` | ✅ | — | — | ✅ | ✅ | Ninguno. Log de incidencias de plataforma; `superAdminOnly`. |
| `admin_audit_log` | sí | DIRECTO | — | `/api/admin/audit-log` | ✅ | — | — | — | ✅ | Ninguno. Cada tenant ve su propia auditoría. |
| `rate_limits` | — | GLOBAL | — | `server/utils/rateLimit.ts` | — | — | — | — | — | Ninguno. Contadores por IP, sin dato de negocio. |
| `settings` | — | GLOBAL (namespaced) | — | `/api/admin/saas/settings` | ✅ | ✅ | — | — | ✅ | Sin `organization_id`; el aislamiento es por prefijo de clave `org:<id>:`. Ver *riesgo residual R-3*. |

## 2. Catálogo inmobiliario

| Tabla | `organization_id` | Ámbito | Padre (FK) | Endpoints | GET | POST | PUT | DEL | BULK | Riesgo → Corrección |
|---|---|---|---|---|---|---|---|---|---|---|
| `developers` | sí | DIRECTO | — | `/api/admin/developers/*` | ✅ | ✅ | ✅ | ✅ | ✅ | Ninguno. |
| `developer_properties` | sí | DIRECTO | — | `/api/admin/developer-properties/*`, `/api/public/properties/*`, `/api/v1/properties/*`, `/api/widget/properties` | ✅ | ⚠️→✅ | ✅ | ✅ | ✅ | **V-08**: `developerId` del body no se validaba → proyecto colgado de la promotora de otro tenant. Ahora `relations.developerId`. |
| `agent_properties` | sí | DIRECTO | — | `/api/admin/properties/*` | ✅ | ✅ | ✅ | ✅ | ✅ | Ninguno. |
| `agents` | sí | DIRECTO | — | `/api/admin/agents/*`, `/api/v1/agents` | ✅ | ✅ | ✅ | ✅ | ✅ | Ninguno. |
| `communities` | sí | DIRECTO | — | `/api/admin/communities/*`, `/api/public/communities/*` | ⚠️→✅ | ✅ | ✅ | ✅ | ✅ | **V-06**: `/api/public/communities/:id` leía por id sin filtro y devolvía además el catálogo de proyectos por nombre. Ahora filtrado por el tenant del dominio. |
| `amenities` | sí | DIRECTO | — | `/api/admin/amenities/*` | ✅ | ✅ | ✅ | ✅ | ✅ | Ninguno. |
| `locations` | sí | DIRECTO | — | `/api/admin/locations/*` | ✅ | ✅ | ✅ | ✅ | ✅ | Ninguno. |
| `master_plans` | sí | DIRECTO | — | `/api/admin/master-plans/*` | ✅ | ✅ | ✅ | ✅ | ✅ | Ninguno. |
| `team_members` | sí | DIRECTO | — | `/api/admin/team/*`, `/api/public/team/*`, `/api/public/agents/*` | ⚠️→✅ | ✅ | ✅ | ✅ | ✅ | **V-06**: `/api/public/team/:slug` leía por slug sin filtro (datos de contacto del agente). Corregido. |
| `floor_plans` | **no** | **TRANSITIVO** | `developer_property_id → developer_properties` | `/api/admin/floor-plans/*` | ⚠️→✅ | ⚠️→✅ | ⚠️→✅ | ⚠️→✅ | ⚠️→✅ | **V-01 (CRÍTICO)**: `orgScoped:false` → CRUD completo sin filtro. Ahora `tenantPolicy: parent`. |
| `property_types` | **no** | **TRANSITIVO** | `developer_property_id → developer_properties` | `/api/admin/property-types/*` | ⚠️→✅ | ⚠️→✅ | ⚠️→✅ | ⚠️→✅ | ⚠️→✅ | **V-01 (CRÍTICO)**: ídem. |
| `images` | **no** | **TRANSITIVO** | `developer_property_id → developer_properties` | `/api/admin/project-images/*` | ⚠️→✅ | ⚠️→✅ | ⚠️→✅ | ⚠️→✅ | ⚠️→✅ | **V-01 (CRÍTICO)**: ídem. |
| `property_gallery_images` | **no** | **TRANSITIVO** | `property_id → agent_properties` | `/api/admin/gallery-images/*` | ⚠️→✅ | ⚠️→✅ | ⚠️→✅ | ⚠️→✅ | ⚠️→✅ | **V-01 (CRÍTICO)**: ídem. |
| `property_social_media` | **no** | **TRANSITIVO** | `developer_property_id → developer_properties` | `/api/admin/social-media/*` | ⚠️→✅ | ⚠️→✅ | ⚠️→✅ | ⚠️→✅ | ⚠️→✅ | **V-01 (CRÍTICO)**: ídem. |
| `property_translations` | **no** | **TRANSITIVO** | `property_id → agent_properties` | `/api/admin/properties/:id` (PUT) | ✅ | ⚠️→✅ | ⚠️→✅ | ⚠️→✅ | — | **V-02 (CRÍTICO)**: `syncTranslations()` borraba/reescribía por id sin comprobar propiedad. Ver §Fase 4. |
| `blog_translations` | **no** | **TRANSITIVO** | `blog_id → blogs` | `/api/admin/blogs/:id` (PUT) | ✅ | ⚠️→✅ | ⚠️→✅ | ⚠️→✅ | — | **V-02 (CRÍTICO)**: ídem. |
| `price_history` | **no** | TRANSITIVO | `developer_property_id → developer_properties` | `/api/admin/developer-properties/:id` (PUT), `/api/public/properties/:slug/price-history` | ⚠️→✅ | ✅ | — | — | ⚠️→✅ | **V-06**: el endpoint público resolvía el slug sin filtro de tenant. Corregido. |
| `property_views` | **no** | TRANSITIVO | `developer_property_id → developer_properties` | `/api/public/properties/:slug/view`, `.../engagement` | ⚠️→✅ | ⚠️→✅ | — | — | ⚠️→✅ | **V-06**: ídem; además `engagement` exponía nº de leads y visitas. |
| `developer_property_master_plan` | **no** | TRANSITIVO | `developer_property_id → developer_properties` | (sin endpoint activo) | — | — | — | — | — | Sin superficie expuesta. Ver *riesgo residual R-4*. |
| `developer_property_location` | **no** | TRANSITIVO | `developer_property_id → developer_properties` | `/api/public/properties/:slug` | 🌐 | — | — | — | 🌐 | Ninguno. Se lee desde un proyecto ya filtrado por tenant. |
| `amenity_developer_property` | **no** | TRANSITIVO | `developer_property_id → developer_properties` | `/api/public/properties/:slug` | 🌐 | — | — | — | 🌐 | Ninguno. Ídem. |
| `amenity_community` | **no** | TRANSITIVO | `community_id → communities` | `/api/public/communities/:id` | ⚠️→✅ | — | — | — | ⚠️→✅ | **V-06**: colgaba de una comunidad leída sin filtro. Corregido con el padre. |

## 3. CRM, citas y operaciones

| Tabla | `organization_id` | Ámbito | Padre (FK) | Endpoints | GET | POST | PUT | DEL | BULK | Riesgo → Corrección |
|---|---|---|---|---|---|---|---|---|---|---|
| `leads` | sí | DIRECTO | — | `/api/admin/saas/leads/*`, `/api/v1/leads` | ✅ | ✅ | ✅ | — | ✅ | Ninguno. `upsertLead()` ya casaba por email **+ organización**. |
| `clients` | sí | DIRECTO | — | `/api/admin/saas/clients` | ✅ | — | — | — | ✅ | Ninguno. |
| `visits` | sí | DIRECTO | — | `/api/admin/saas/visits/*`, `/api/public/agents/:slug/book`, `/api/public/appointments/:token/*` | ✅ | ✅ | ✅ | — | ✅ | Ninguno. El `agentId` de reasignación ya se validaba contra el tenant. |
| `agent_availability` | sí | DIRECTO | — | `/api/admin/saas/agents/:id/availability` | ✅ | ✅ | ✅ | ✅ | ✅ | Ninguno. |
| `agent_time_off` | sí | DIRECTO | — | `/api/admin/saas/agents/:id/time-off/*` | ✅ | ✅ | — | ✅ | ✅ | Ninguno. Ya comprobaba `agentId` **+** `organizationId`. |
| `appointment_notifications` | sí | DIRECTO | — | `server/utils/appointments/notifications.ts` | ✅ | ✅ | — | — | ✅ | Ninguno. |
| `reservations` | sí | DIRECTO | — | `/api/admin/saas/reservations` | ✅ | — | — | — | ✅ | Ninguno. |
| `deals` | sí | DIRECTO | — | `/api/admin/saas/deals/*`, `/api/admin/saas/deals-revenue` | ✅ | ⚠️→✅ | ✅ | — | ✅ | **V-08**: `leadId`/`propertyId`/`agentId` del body sin validar → comisión imputada sobre entidades de otro tenant. Corregido. |
| `valuations` | sí | DIRECTO | — | `/api/admin/saas/valuations` | ✅ | ✅ | — | — | ✅ | Ninguno. Los comparables ya salían solo del catálogo propio. |
| `contract_templates` | sí | DIRECTO | — | `/api/admin/saas/contract-templates/*` | ✅ | ✅ | — | ✅ | ✅ | Ninguno. |
| `contracts` | sí | DIRECTO | — | `/api/admin/saas/contracts/*`, `/api/public/contracts/:token/*`, `/api/client/contracts/*` | ✅ | ✅ | ✅ | — | ✅ | Ninguno en D1. El **PDF en R2** sí era accesible (**V-04**). |
| `deposit_payments` | sí | DIRECTO | — | `/api/admin/saas/deposits/*` | ✅ | ✅ | ✅ | — | ✅ | Ninguno. `contractId` ya validado contra el tenant. |
| `referral_links` | sí | DIRECTO | — | `/api/admin/saas/referral-links`, `/api/public/referral-links/:code` | 🔑 | ✅ | — | — | ✅ | Ninguno. El código es la credencial; el referido se crea en el tenant del enlace. |
| `referrals` | sí | DIRECTO | — | `/api/admin/saas/referrals/*`, `/api/public/referrals` | ✅ | ✅ | ✅ | — | ✅ | Ninguno. |
| `saved_searches` | sí | DIRECTO | — | `/api/public/saved-searches`, `/unsub/:token` | 🔑 | ✅ | ✅ | — | ✅ | Ninguno. La tarea cron filtra por `organization_id` de cada búsqueda. |
| `gdpr_requests` | sí | DIRECTO | — | `/api/admin/saas/gdpr/*` | ✅ | ✅ | — | — | ✅ | Ninguno. Export/anonimización ya acotados por organización. |
| `invoices` | **sí (nuevo, 0038)** | DIRECTO | — | `/api/admin/saas/invoices`, `/api/admin/saas/overview` | ⚠️→✅ | — | — | — | ⚠️→✅ | **V-03 (CRÍTICO)**: era GLOBAL por decisión de 0021 → cada tenant veía y sumaba la facturación de todos. Migración **0038** añade la columna. |
| `metrics_daily` | sí | DIRECTO | — | `/api/admin/saas/overview`, `/api/admin/saas/analytics` | ✅ | — | — | — | ✅ | Ninguno. |
| `automations` | sí | DIRECTO | — | `/api/admin/saas/automations/*` | ✅ | ✅ | ✅ | — | ✅ | Ninguno. |
| `api_keys` | sí | DIRECTO | — | `/api/admin/saas/apikeys/*`, `server/utils/apiAuth.ts` | ✅ | ✅ | ✅ | — | ✅ | Ninguno. La clave lleva su `organizationId`; ver §Fase 9. |
| `webhook_endpoints` | sí | DIRECTO | — | `/api/admin/saas/webhooks/*` | ✅ | ✅ | ✅ | ✅ | ✅ | Ninguno. |
| `webhook_deliveries` | **no** | TRANSITIVO | `endpoint_id → webhook_endpoints` | `/api/admin/saas/webhooks/:id/deliveries` | ✅ | ✅ | — | — | ✅ | Ninguno. El endpoint padre se verifica antes de listar entregas. |
| `visitor_submissions` | sí | DIRECTO | — | `/api/admin/visitor-submissions/*`, `/api/public/visitor` | ✅ | ✅ | — | ✅ | ✅ | Ninguno en D1. Los **PDF de KYC en R2** sí (**V-04**). |
| `information` | sí | DIRECTO | — | `/api/admin/vendor-registrations/*` | ✅ | ✅ | — | ✅ | ✅ | Ninguno. |
| `contact_messages` | sí | DIRECTO | — | `/api/admin/contact-messages/*`, `/api/public/contact` | ✅ | ✅ | — | ✅ | ✅ | Ninguno. |

## 4. Blog & CMS

| Tabla | `organization_id` | Ámbito | Padre (FK) | Endpoints | GET | POST | PUT | DEL | BULK | Riesgo → Corrección |
|---|---|---|---|---|---|---|---|---|---|---|
| `cms_articles` | sí | DIRECTO | — | `/api/admin/cms/articles/*`, `/api/public/cms/*`, `/api/public/blogs/*` | ✅ | ⚠️→✅ | ⚠️→✅ | ✅ | ✅ | **V-09**: `authorId`/`categoryId` del body sin validar. Corregido en create y update. |
| `cms_categories` | sí | DIRECTO | — | `/api/admin/cms-categories/*` | ✅ | ⚠️→✅ | ⚠️→✅ | ✅ | ✅ | **V-09**: `parentId` sin validar (jerarquía cruzada entre tenants). Corregido. |
| `cms_tags` | sí | DIRECTO | — | `/api/admin/cms-tags/*` | ✅ | ✅ | ✅ | ✅ | ✅ | Ninguno. |
| `cms_authors` | sí | DIRECTO | — | `/api/admin/cms-authors/*`, `/api/public/cms/authors/:slug` | ✅ | ⚠️→✅ | ⚠️→✅ | ✅ | ✅ | **V-09**: `userId` sin validar → autor vinculado a una cuenta de otro tenant. Corregido. |
| `cms_article_tags` | **no** | TRANSITIVO | `article_id → cms_articles` | `/api/admin/cms/articles/:id/tags` | ✅ | ✅ | ✅ | ✅ | ✅ | Ninguno. Ya verificaba artículo **y** etiquetas del propio tenant. |
| `cms_article_versions` | **no** | TRANSITIVO | `article_id → cms_articles` | `/api/admin/cms/articles/:id/versions/*` | ✅ | ✅ | — | — | ✅ | Ninguno. El artículo padre se verifica antes de listar/restaurar. |
| `cms_media` | sí | DIRECTO | — | `/api/admin/cms/media/*` | ✅ | ⚠️→✅ | ⚠️→✅ | ✅ | ✅ | **V-09**: `folderId` sin validar en subida y en mover-a-carpeta. Corregido. |
| `cms_media_folders` | sí | DIRECTO | — | `/api/admin/cms-media-folders/*` | ✅ | ⚠️→✅ | ⚠️→✅ | ✅ | ✅ | **V-09**: `parentId` sin validar. Corregido. |
| `cms_comments` | sí | DIRECTO | — | `/api/admin/cms-comments/*`, `/api/public/cms/articles/:slug/comments` | ✅ | ⚠️→✅ | ⚠️→✅ | ⚠️→✅ | ✅ | **V-09 / V-10**: `articleId` sin validar, y el contador `comment_count` se actualizaba por id de artículo sin filtro. Ambos corregidos. |
| `cms_redirects` | sí | DIRECTO | — | `/api/admin/cms-redirects/*`, `server/middleware/cms-redirects.ts` | ✅ | ✅ | ✅ | ✅ | ✅ | Ninguno. El middleware ya resolvía por tenant del dominio. |
| `cms_settings` | sí | DIRECTO | — | `/api/admin/cms/settings` | ✅ | ✅ | ✅ | — | ✅ | Ninguno. |
| `blogs` | sí | DIRECTO | — | `/api/admin/blogs/*`, `/api/public/blogs/*` | ✅ | ✅ | ✅ | ✅ | ✅ | Ninguno (salvo traducciones, **V-02**). |

## 5. Publication Scheduler

| Tabla | `organization_id` | Ámbito | Padre (FK) | Endpoints | GET | POST | PUT | DEL | BULK | Riesgo → Corrección |
|---|---|---|---|---|---|---|---|---|---|---|
| `publication_schedules` | sí | DIRECTO | — | `/api/admin/scheduler/*`, `/api/v1/scheduler/*` | ✅ | ⚠️→✅ | ✅ | ✅ | ✅ | **V-07**: `create` y `duplicate` aceptaban `developerPropertyId` sin comprobar propiedad → publicar el proyecto de otro tenant. Corregido. |
| `publication_jobs` | sí | DIRECTO | — | `/api/admin/scheduler/{jobs,run,retry,pause,resume,priority}` | ✅ | ✅ | ✅ | ✅ | ✅ | Ninguno. |
| `publication_templates` | sí | DIRECTO | — | `/api/admin/scheduler/templates/*` | ✅ | ✅ | ✅ | ✅ | ✅ | Ninguno. |
| `publication_channel_configs` | sí | DIRECTO | — | `/api/admin/scheduler/channels/*` | ✅ | ✅ | ✅ | — | ✅ | Ninguno. |
| `publication_automation_rules` | sí | DIRECTO | — | `/api/admin/scheduler/automations/*` | ✅ | ✅ | ✅ | ✅ | ✅ | Ninguno. |
| `publication_notifications` | sí | DIRECTO | — | `/api/admin/scheduler/notifications/*` | ✅ | ✅ | ✅ | — | ✅ | Ninguno. |
| `publication_history` | sí | DIRECTO | — | `/api/admin/scheduler/history` | ✅ | ✅ | — | — | ✅ | Ninguno. Ver *riesgo residual R-2*. |
| `publication_logs` | sí | DIRECTO | — | `server/utils/publication/dispatcher.ts` | ✅ | ✅ | — | — | ✅ | Ninguno. |
| `publication_ai_time_suggestions` | sí | DIRECTO | — | `/api/admin/scheduler/ai-time-suggestions/*` | ✅ | ✅ | — | — | ✅ | Ninguno. |
| `publication_ai_time_rules` | sí | DIRECTO | — | `/api/admin/scheduler/ai-time-rules` | ✅ | ✅ | ✅ | — | ✅ | Ninguno. |
| `publication_queue` | **no** | TRANSITIVO | `job_id → publication_jobs` | `dispatcher.ts` (cron) | ✅ | ✅ | ✅ | — | ✅ | Ninguno. Sin endpoint HTTP; el dispatcher es de plataforma (ver §Fase 6). |
| `publication_executions` | **no** | TRANSITIVO | `job_id → publication_jobs` | `dispatcher.ts`, `aiTime.ts` | ✅ | ✅ | ✅ | — | ✅ | Ninguno. Ídem. |
| `publication_retries` | **no** | TRANSITIVO | `job_id → publication_jobs` | `dispatcher.ts` | ✅ | ✅ | ✅ | — | ✅ | Ninguno. Ídem. |

## 6. Asset Export Studio

| Tabla | `organization_id` | Ámbito | Padre (FK) | Endpoints | GET | POST | PUT | DEL | BULK | Riesgo → Corrección |
|---|---|---|---|---|---|---|---|---|---|---|
| `brand_kits` | sí | DIRECTO | — | `/api/admin/asset-export/brand-kit*` | ✅ | ✅ | ✅ | — | ✅ | Ninguno. |
| `brand_kit_versions` | **no** | TRANSITIVO | `brand_kit_id → brand_kits` | `.../brand-kit/versions/*` | ✅ | ✅ | ✅ | — | ✅ | Ninguno. El kit padre se verifica antes de restaurar. |
| `asset_export_templates` | sí (nullable = sistema) | DIRECTO + sistema | — | `/api/admin/asset-export/templates/*`, `/api/v1/asset-export/templates` | ✅ | ✅ | ✅ | ✅ | ✅ | Ninguno. `organizationId IS NULL` = plantilla de sistema, solo lectura + duplicar. |
| `asset_export_template_versions` | **no** | TRANSITIVO | `template_id → asset_export_templates` | (interno) | ✅ | ✅ | — | — | ✅ | Ninguno. |
| `asset_export_projects` | sí | DIRECTO | — | `/api/admin/asset-export/projects/*` | ✅ | ✅ | ✅ | — | ✅ | Ninguno. El `assetId` ya se validaba contra el catálogo propio. |
| `asset_export_project_versions` | **no** | TRANSITIVO | `project_id → asset_export_projects` | `.../projects/:id/versions/*` | ✅ | ✅ | ✅ | — | ✅ | Ninguno. |
| `asset_export_renders` | sí | DIRECTO | — | `.../renders/:id/download`, `/api/v1/asset-export/exports/*` | ✅ | ✅ | ✅ | — | ✅ | Ninguno en D1. El **PDF en R2** sí (**V-04**). |
| `export_batches` | sí | DIRECTO | — | `/api/admin/asset-export/batches/*` | ✅ | ✅ | ✅ | — | ✅ | Ninguno. `assetIds` ya se filtraba por organización al crear el lote. |
| `export_batch_items` | **no** | TRANSITIVO | `batch_id → export_batches` | `.../batches/:id/*` | ✅ | ✅ | ✅ | — | ✅ | Ninguno. |
| `asset_export_catalogs` | sí | DIRECTO | — | `/api/admin/asset-export/catalogs/*` | ✅ | ✅ | ✅ | — | ✅ | Ninguno en D1. El **PDF en R2** sí (**V-04**). |
| `asset_export_catalog_items` | **no** | TRANSITIVO | `catalog_id → asset_export_catalogs` | `.../catalogs/:id/*` | ✅ | ✅ | ✅ | — | ✅ | Ninguno. |
| `dynamic_qr_codes` | sí | DIRECTO | — | `/q/:code`, `/api/v1/asset-export/qr-codes/:id/analytics` | 🔑 | ✅ | ✅ | — | ✅ | Ninguno. El código es la credencial (short-link); las analíticas sí exigen tenant. |
| `qr_scans` | sí | DIRECTO | — | `/q/:code`, analíticas | ✅ | ✅ | — | — | ✅ | Ninguno. Cada escaneo se graba con el `organization_id` del QR. |

---

## 7. Almacenamiento R2

El bucket `sa-inmobiliaria-media` mezcla contenido público y documentos
privados. La ruta `/api/media/:key` es el único punto de lectura.

| Prefijo | Naturaleza | Antes | Ahora |
|---|---|---|---|
| `uploads/…`, `<recurso>/…` | Imágenes de catálogo, públicas por diseño | Público | Público (sin cambio) |
| `cms/<org>/…` | Media del blog, embebida en artículos públicos | Público | Público (sin cambio) |
| `visitor-docs/…` | **KYC**: pasaporte, Emirates ID, extractos bancarios | Solo `requireAdmin` → **cualquier admin de cualquier tenant** | Admin **+** propiedad verificada contra `visitor_submissions` |
| `asset-export-renders/…` | PDF generados | **Sin ninguna regla → público** | Admin **+** propiedad verificada contra `asset_export_renders` |
| `asset-export-catalogs/…` | Catálogos combinados | **Sin ninguna regla → público** | Admin **+** propiedad (catálogo o fragmento) |
| `contracts/…` | Contratos firmados | **Sin ninguna regla → público** | Admin **+** propiedad verificada contra `contracts` |

La propiedad se resuelve **buscando la fila que referencia esa clave exacta**,
nunca parseando el `orgId` incrustado en la ruta: esa ruta la controla el
llamante por completo. `server/utils/mediaAccess.ts`.

Además, `/api/admin/upload` ya no puede escribir en ninguno de los prefijos
privados (antes el nombre de carpeta venía del cliente sin restricción).

---

## 8. Tareas programadas (cron)

Un Cron Trigger no tiene contexto de petición ni, por tanto, organización
activa. Las siete tareas son **de plataforma por diseño** y recorren todos los
inquilinos, pero cada escritura se hace con el `organization_id` de la fila que
la origina.

| Tarea | Recorre todos los tenants | Escribe con tenant correcto |
|---|---|---|
| `scheduler:dispatch` | sí | ✅ del job |
| `appointments:reminders` | sí | ✅ de la visita |
| `cms:expire-articles` | sí | ✅ del artículo |
| `marketing:saved-search-alerts` | sí | ✅ de la búsqueda guardada |
| `scheduler:recompute-ai-time` | sí | ✅ por organización |
| `system:backup-d1` | sí | n/a (volcado completo a R2) |
| `system:cleanup-error-logs` | sí | n/a (log global) |

---

## 9. Clasificación IDOR

Todo endpoint con `/:id`, `/:slug`, `/:token`, `/:code` clasificado según el
criterio de la Fase 8.

| Clase | Regla | Endpoints |
|---|---|---|
| **PUBLIC RESOURCE** | Sin auth, pero filtrado por el tenant del *hostname* (`resolvePublicOrgId`) | `/api/public/properties/:slug` y sus 7 sub-rutas, `/api/public/communities/:id`, `/api/public/team/:slug`, `/api/public/blogs/:slug`, `/api/public/cms/**`, `/api/widget/properties`, `/api/public/ask`, `/api/public/favorite` |
| **PRIVATE TENANT RESOURCE** | Exige sesión admin **y** propiedad por `tenantPolicy` | Todo `/api/admin/**`, `/api/media/<prefijo privado>` |
| **PRIVATE USER RESOURCE** | Exige sesión y coincidencia de propietario (email) | `/api/client/dashboard`, `/api/client/contracts/:id/download` |
| **SECRET TOKEN RESOURCE** | El token es la credencial; ≥20 bytes de `crypto.getRandomValues` | `/api/public/appointments/:token(+cancel,+reschedule)`, `/api/public/contracts/:token(+accept)`, `/calendar/:token`, `/unsub/:token`, `/q/:code`, `/api/public/referral-links/:code` |

Todos los tokens secretos se generan con `crypto.getRandomValues` (20–24
bytes, 160–192 bits) y se comparan por igualdad exacta en columna indexada. No
hay identificadores privados adivinables: donde el id es secuencial, la
autorización nunca depende de conocerlo.

**Regla de respuesta**: un recurso de otro inquilino devuelve **404, nunca
403**. Un 403 confirmaría que el id existe en la plataforma, convirtiendo una
conjetura a ciegas en una enumeración confirmada. Esto se verifica en test
(`expectCrossTenantDenied`).

---

## 10. API pública v1

Las claves se validan en `server/utils/apiAuth.ts`: `sha256(plaintext)`
indexado, y la clave aporta `organizationId`, `scopes` (`read` / `write`) y
`revoked`. **El tenant sale siempre de la clave, nunca del cuerpo ni de la
query.**

| Endpoint | Scope | Lectura acotada | Escritura acotada | FKs validadas |
|---|---|---|---|---|
| `GET /api/v1/properties` | read | ✅ | — | — |
| `GET /api/v1/properties/:id` | read | ✅ | — | — |
| `GET /api/v1/communities` | read | ✅ | — | — |
| `GET /api/v1/agents` | read | ✅ | — | — |
| `POST /api/v1/leads` | write | — | ✅ | ✅ `propertyId` (422 si es de otro tenant) |
| `GET /api/v1/scheduler/channels` | read | ✅ | — | — |
| `GET /api/v1/scheduler/schedules(/:id)` | read | ✅ | — | — |
| `GET /api/v1/asset-export/templates` | read | ✅ | — | — |
| `POST /api/v1/asset-export/exports` | write | — | ✅ | ✅ `templateId`, `assetId` |
| `GET /api/v1/asset-export/exports/:id(/download)` | read | ✅ | — | — |
| `GET /api/v1/asset-export/qr-codes/:id/analytics` | read | ✅ | — | — |

No se encontró ninguna fuga en `/api/v1`. Es la superficie mejor aislada del
proyecto y se ha añadido cobertura E2E para mantenerlo así.

---

## 11. Modelo de política de tenant (Fase 2)

`orgScoped: boolean` **ya no existe**. Su valor `false` significaba dos cosas
incompatibles a la vez —"esta tabla es global" y "esta tabla hereda el tenant
del padre"— y el CRUD genérico trataba ambas como *sin filtro*.

Cada recurso declara ahora una `tenantPolicy` obligatoria
(`server/utils/tenantPolicy.ts`):

```ts
tenantPolicy: { type: 'direct' }                        // columna propia
tenantPolicy: {                                          // heredado del padre
  type: 'parent',
  foreignKey: 'developerPropertyId',
  parentTable: schema.developerProperties,
  parentLabel: 'Proyecto',
}
tenantPolicy: {                                          // dos saltos (soportado)
  type: 'nestedParent',
  foreignKey: '…', parentTable: …, parentForeignKey: '…', grandparentTable: …,
}
tenantPolicy: { type: 'global', reason: '…' }            // motivo obligatorio
```

`buildTenantWhere()` es la **única** fuente de verdad del aislamiento del CRUD
genérico: traduce la política a un `WHERE` (igualdad directa, o `EXISTS`
correlacionado sobre el padre/abuelo) y **falla cerrado** —lanza 403— si le
llega una organización nula en un recurso con tenant. Un recurso sin política
no compila.

`nestedParent` está implementado y probado en el resolver, pero **hoy ningún
recurso lo usa**: toda tabla hija del registro está a exactamente un salto de
una fila con `organization_id`. Existe para que una tabla futura a dos saltos
pueda declarar su cadena real en lugar de verse empujada al escape `global`.

---

## 12. Cobertura de pruebas

| Suite | Qué cubre | Casos |
|---|---|---|
| `test/unit/multitenant.crossTenant.test.ts` | Matriz completa READ/LIST/UPDATE/DELETE/CREATE-hijo/CREATE-relación/`organizationId` inyectado, sobre **los 26 recursos con tenant** | 150 |
| `test/unit/multitenant.translations.test.ts` | Ataques a `syncTranslations` (incluida la reutilización de una autorización legítima apuntando a otro id) | 5 |
| `test/unit/multitenant.mediaAccess.test.ts` | Propiedad de objetos R2 por prefijo privado | 9 |
| `test/unit/auth.orgScope.test.ts` | `resolveActiveOrgId` (preexistente) | 6 |
| `tests/e2e/cross-tenant.spec.ts` | Los mismos ataques sobre HTTP real, con dos inquilinos y sesiones reales | 11 |

Las unitarias corren contra **SQLite real** (`node:sqlite`) con **las
migraciones reales aplicadas**, mediante `drizzle-orm/sqlite-proxy`, de modo
que el código de construcción de consultas de producción se ejecuta sin
modificar. Un esquema de juguete no habría detectado nada de esto.

La matriz se autoprotege: si se añade un recurso sin *fixture*, el test
`every tenant-scoped resource is covered by the attack matrix` falla; si se
declara `global` sin justificación revisada, falla `a global policy always
carries a written reason and is super_admin-only`.
