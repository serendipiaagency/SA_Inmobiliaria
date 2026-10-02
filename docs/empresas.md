# Empresas: alta, registro público, acceso y email de plataforma

Una **empresa** es un tenant de INMO. La tabla `organizations` es el registro
de tenants: no hay otra entidad Company o Agency. Sus usuarios son las filas de
`users` con su `organization_id` y un `role`. No existe una tabla de
memberships.

Una empresa entra en INMO por **dos canales**, y los dos acaban en el mismo
provisioning:

| Canal | Quién | Ruta | Origen guardado |
|---|---|---|---|
| Sistemas > Empresas > + Nuevo | super admin | `/admin/organizations/new` → `POST /api/admin/organizations` | `admin` |
| Landing → «Registro empresa» | público | `/registro-empresa` → `POST /api/auth/login { action: 'register-company' }` | `self_service` |

El registro público vive en `login.post.ts` y no en una ruta propia por el
presupuesto de rutas de Nitro (margen 0, ver `docs/property-schema-registry.md`).
Por eso el alta interna se intercepta en el `[resource]` genérico.

## Código

| Pieza | Fichero |
|---|---|
| Provisioning (validación, unicidad, slug, alta de empresa y administrador, compensación) | `server/utils/organizations/provisioning.ts` |
| Política de acceso | `server/utils/organizations/access.ts` |
| Canales, auditoría, emails, avisos de estado, resumen de la ficha | `server/utils/organizations/lifecycle.ts` |
| Email de plataforma (remitente central) | `server/utils/email/platform.ts` + templates en `server/utils/email/templates.ts` |
| Asistente de alta | `components/admin/organizations/OrganizationCreateWizard.vue` |
| Ficha por secciones | `components/admin/organizations/OrganizationEditor.vue` |
| Registro público | `pages/registro-empresa.vue` |
| Textos de estados compartidos panel/servidor | `utils/organizationLabels.ts` |

## Provisioning: qué garantiza

- **Validación antes de escribir nada.** Cada error lleva su campo y el paso
  del asistente (`empresa`, `identidad`, `configuracion`, `acceso`), para que la
  pantalla vuelva al sitio exacto.
- **Dominio único y válido.** Se normaliza igual que el middleware de tenant
  (`normalizeHost`: minúsculas, sin puerto, sin `www.`). Rechaza los hosts
  reservados (`*.workers.dev`, `localhost`, `PRIMARY_DOMAIN`). La autoridad
  final es el índice único; una carrera entre dos altas devuelve 409, no 500.
- **Correo único.** `users.email` es único en toda la plataforma: un correo
  pertenece a una sola empresa.
- **Slug libre** derivado del nombre (`base`, `base-2`…), reintentando si
  choca.
- **Administrador inicial con rol `admin` de ESA empresa.** Nunca
  `super_admin`, nunca permisos a medida (`permissions = NULL`).
- **Compensación en lugar de transacción.** D1 no tiene transacciones
  interactivas. Si el usuario no se puede crear (por ejemplo, otra petición
  se quedó el correo), se borra la empresa recién creada, que aún no tiene
  nada colgando. Nunca queda una empresa sin el administrador pedido ni un
  usuario sin empresa.
- **Doble envío del asistente.** La misma empresa creada hace menos de un
  minuto devuelve 409. El botón además se bloquea mientras crea.
- **Canal público acotado.** El registro web no puede fijar dominio, color,
  almacenamiento ni un estado distinto de activo.

### Canal A: asistente

Tiene 5 pasos: Empresa, Identidad, Configuración, Acceso y Revisión. No se
escribe nada hasta «Crear empresa».

- **Logo.** El fichero se queda en memoria con vista previa (`ObjectURL`) y se
  sube **después** de crear la empresa a `/api/admin/upload` con
  `folder=organizations` y `organizationId=<nueva>`. Así queda a nombre de esa
  empresa (su cuota y su `media_assets`), no de la que el super admin tenga
  activa. Sólo un `super_admin` puede indicar `organizationId`, y la empresa
  tiene que existir. Para logos se aceptan PNG, JPG y WebP, máximo 2 MB.
- **Si el logo falla,** la empresa ya existe y la pantalla de éxito lo dice.
- **Administrador inicial.** «Invitar ahora» crea la cuenta sin contraseña
  utilizable y le envía `company_admin_invite`: un enlace de un solo uso para
  definir la contraseña, que caduca en 60 minutos, por el mismo flujo que
  `/reset-password`. Desde la ficha → Usuarios se puede **reenviar**
  (`POST /api/admin/organizations { action: 'resend-invite' }`).
- **Email y datos legales** quedan fuera del alta y se editan en la ficha.

### Canal B: registro público

El formulario pide empresa, nombre comercial (opcional), correo, contraseña y
confirmación (mínimo 8 caracteres), además de aceptar términos y privacidad.

- La contraseña se guarda con PBKDF2 (`hashPassword`). Nunca se guarda en
  claro ni de forma reversible, nunca va en un email, en la auditoría ni en
  los logs.
- **Campos prohibidos.** Si el cuerpo trae `role`, `permissions`,
  `isSuperAdmin`, `superAdmin`, `tenantId`, `organizationId`, `orgId`,
  `accessLevel`, `status`, `approvalStatus`, `billingStatus`,
  `registrationSource` o `domain`, se **rechaza con 400**. No se ignora en
  silencio.
- **Honeypot.** El campo invisible `website` relleno hace que se rechace.
- **Límite por IP:** 5 registros por hora (bucket `company-register`, propio y
  separado del login).
- **Sin autologin.** Tras el alta, la pantalla de éxito lleva a
  `/admin/login?registered=1&email=…`, con el correo ya rellenado.
- **Éxito honesto.** La pantalla sólo dice «te hemos enviado un email» si el
  envío salió de verdad. Si quedó en cola o falló, lo dice, y la cuenta sigue
  lista.

## Política de acceso

El acceso de una empresa depende de **dimensiones separadas**, añadidas por la
migración 0085 (no es un único booleano):

| Columna | Valores | Quién la decide |
|---|---|---|
| `status` | `active`, `suspended` | super admin (ficha → Estado) |
| `approval_status` | `approved`, `pending`, `rejected` | política de alta (hoy siempre `approved`) |
| `billing_status` | `not_required`, `pending`, `active`, `past_due` | pago (hoy no hay billing: `not_required`) |
| `registration_source` | `admin`, `self_service` | el canal; no decide el acceso por sí mismo |

`decideOrganizationAccess()` es **el único sitio** que decide. Se aplica en dos
puntos:

1. **Login** (`server/api/auth/login.post.ts`): después de validar la
   contraseña, así que contar el motivo no ayuda a enumerar cuentas. La
   respuesta es 403 con `data.reason` y un mensaje para la empresa.
2. **Cada petición con sesión** (`loadSessionUser` en `server/utils/auth.ts`):
   suspender una empresa corta al momento las sesiones abiertas. No borra
   sesiones ni cuentas, así que reactivarla devuelve el acceso tal cual.

Falla cerrada: un valor desconocido deniega. El `super_admin` es de la
plataforma, no de una empresa, y nunca se le aplica.

**Política actual del registro público: acceso inmediato** (aprobada, sin pago).

### Flujos futuros (preparados, no activos)

- **Aprobación previa.** Cambiar `SELF_REGISTRATION_POLICY.approvalStatus` a
  `'pending'`. El login y la sesión ya deniegan con «pendiente de aprobación».
  Falta construir:
  - la acción del super admin «Aprobar» o «Rechazar» en la ficha → Estado;
  - el envío de `company_pending` en el alta y de `company_approved` al
    aprobar (los dos templates ya existen);
  - que la pantalla de éxito del registro diga «pendiente» en vez de «ya
    puedes entrar». La respuesta ya trae `access`.
- **Pago.** `billingStatus: 'pending'` deniega con «pendiente de completar el
  alta». **No hay pasarela de pago ficticia.** Hace falta un proveedor real
  (Stripe ya está integrado para otras cosas, ver `docs/stripe-payments.md`)
  y que su webhook verificado marque `billing_status = 'active'`.

## Auditoría (Auditoría, no Activity)

Todo queda en `admin_audit_log` (Sistema → Auditoría). Nada de esto va a
Activity, que es el timeline comercial de cada agencia.

| Acción | `resource` | `detail` | Ámbito |
|---|---|---|---|
| Alta desde el panel | `organizations` | origen, estado y dominio | plataforma (`organizationId` null) |
| Administrador inicial invitado | `users` | rol y «administrador inicial de la empresa #N» | plataforma |
| Reenvío de invitación | `users` (`run`) | resultado del envío | plataforma |
| Alta por registro web | `organizations` | «autorregistro web (self_service)» | la propia empresa; actor = el administrador que se registró |
| Administrador del registro web | `users` | rol | la propia empresa |
| Cambio de dominio o estado | `organizations` (`update`) | `estado: active → suspended`, `dominio: a → b` | plataforma |

Nunca aparecen contraseñas, hashes ni tokens.

## Email de plataforma

Es lo que INMO envía a las empresas y al super admin sobre el alta y el estado
de las empresas. Es distinto del email de cada empresa a SUS clientes, que sale
con su propia identidad (`resolveOrgEmailIdentity`, ver `docs/resend-email.md`).

- **Remitente central:** `INMO <info@serendipiaagency.com>`. Ningún template
  lo lleva escrito: sale de `platformEmailConfig()`.
- **Responder-a:** independiente del remitente.
- **Templates:**
  - activos: `company_registration_welcome`, `admin_company_registered`,
    `company_admin_invite`, `company_deactivated`, `company_status_changed`,
    `admin_company_status_changed`;
  - preparados: `company_approved`, `company_pending`.
- **Mismo proveedor y misma cola.** Usa el mismo `email_log` (con el
  `organizationId` de la empresa de la que trata), la misma cola de
  reintentos (`retry-email-queue`) y el mismo webhook de entrega que el resto.
- **Idempotencia.** La bienvenida y el aviso de alta se mandan con `once`: un
  reintento de la petición no manda dos.
- **Un fallo del email nunca deshace el alta.** Queda en `email_log` como
  `queued` o `failed`, con su error, y la respuesta lo dice.
- **Nunca se cambia el remitente** por otro para «arreglar» un envío fallido,
  ni se finge un envío.
- Todos los emails llevan también versión de **texto plano**.

### Qué sale de dónde

| Email | Remitente |
|---|---|
| Alta y estado de empresas (`company_*`, `admin_company_*`), bienvenida e invitación | **INMO <info@serendipiaagency.com>** (`platform.ts`) |
| Cuenta: bienvenida de usuario (`user_welcome`), recuperar contraseña (`password_reset`), avisos técnicos del dominio web (`domain_check_*`) | **INMO <info@serendipiaagency.com>** siempre (`SYSTEM_SENDER_TEMPLATES` en `orgSender.ts`), con la marca de la empresa en el cuerpo |
| Todo lo que la empresa envía a SUS clientes y a SU equipo (leads, citas, contratos, depósitos, avisos internos…) | **El remitente de la empresa** (abajo) |

## Remitente propio de cada empresa

Cada empresa puede enviar a sus clientes y a su equipo desde **su propia
dirección**. El código está en `server/utils/email/orgSender.ts` y la pantalla
en `components/admin/email/OrgEmailSenderPanel.vue`. La configura su
administrador en **Sistema → Emails**; el super admin, desde Empresas → ficha →
Email.

| Situación | Cabecera From | Responder a |
|---|---|---|
| Dominio propio **verificado** en Resend | `Costa Azul <hola@costaazul.es>` | su «Responder a» (si lo hay) |
| Sin dominio, o aún sin verificar (lo normal: no hace falta configurar nada) | `Costa Azul <info@serendipiaagency.com>` | «Responder a» → dirección del remitente → email legal → correo de su primer administrador |

**Sin configurar nada** una empresa ya envía con su nombre y recibe las
respuestas: al darla de alta (registro web o asistente), el correo de su
administrador queda como su «Responder a» (`email_reply_to`), y para las
empresas anteriores a esto se usa en el momento el de su primer
administrador. La verificación del dominio es opcional: sólo hace falta para
que también la DIRECCIÓN sea la suya. Es el mismo modelo que CA_backend
(`src/core/email/business-sender.ts`).

Nunca se envía desde una dirección de empresa sin verificar. Resend la
rechazaría, y además sería suplantar un dominio no probado. Antes de este
cambio el remitente por defecto era `notificaciones@sa-inmobiliaria.com`, un
dominio que **no existe**; con `RESEND_API_KEY` puesta, Resend habría
rechazado todos esos envíos.

### Verificación autoservicio

1. La empresa guarda `hola@su-dominio.es`. INMO reclama el dominio para ella y
   lo da de alta en la cuenta de Resend de la plataforma (`POST /domains`,
   región `eu-west-1`).
2. El panel muestra los registros DNS que Resend pide:
   - `MX` y `TXT` (SPF) en `send.<dominio>`;
   - `TXT` (DKIM) en `resend._domainkey.<dominio>`.

   Ninguno toca el correo que la empresa ya tiene.
3. «Comprobar ahora» llama a `POST /domains/:id/verify` y lee el estado. Al
   abrir la pantalla, el estado se sincroniza con lo que Resend diga en ese
   momento.
4. Con `verified`, `organizations.email_sender_domain_verified = 1`: desde ahí
   los emails salen de su dirección.

**Reglas de seguridad:**

- **Un dominio es de una sola empresa.** Su dueño se guarda en `settings`
  (`org:platform:email-domain:<dominio>`), sin migración. Otra empresa no
  puede usarlo, aunque ya esté verificado en la cuenta, porque enviaría como
  la primera.
- **Dominios ya presentes en Resend.** Un dominio que ya estaba en la cuenta
  sin dueño en INMO (dado de alta a mano) sólo lo puede asignar un
  `super_admin`.
- **Dominios rechazados como remitente:** el dominio de la plataforma
  (`serendipiaagency.com` y sus subdominios), `resend.dev` y los buzones
  gratuitos (Gmail, Outlook, Yahoo, iCloud…), porque nadie puede verificar su
  DNS. Sí valen como «Responder a».
- **La dirección sólo cambia por este flujo.** `emailSenderAddress` ya no es
  editable por el `PUT` genérico de `organizations`.
- **Cambiar de dominio** vuelve a «sin verificar». El dominio anterior sigue
  siendo de esa empresa, así que si vuelve a él no tiene que repetir el DNS.
- **Rutas:**
  - `GET /api/admin/saas/email-health?view=sender` (área `system`, lectura);
  - `POST /api/admin/saas/settings { section: 'email-sender', action?: 'verify' }` (área `system`, escritura).

  `organizationId` sólo lo acepta de un `super_admin`.

### Requisitos en Resend (bloqueo externo)

- **La clave `RESEND_API_KEY` tiene que ser «Full access».** Una clave
  «Sending access» puede enviar, pero no crear ni verificar dominios; el panel
  lo explica si es el caso. Tampoco puede restringirse a un solo dominio: la
  plataforma envía desde los dominios de todas las empresas.
- **El plan de Resend limita cuántos dominios caben en la cuenta.** Cuando no
  quedan, el alta del dominio falla con el mensaje de Resend y la empresa
  sigue enviando con su nombre desde la dirección de la plataforma.

### Configuración

| Variable | Tipo | Por defecto | Para qué |
|---|---|---|---|
| `RESEND_API_KEY` | **secreto** | — | Sin ella no sale ningún email (quedan en `email_log`, la pantalla dice «no enviado»). **Full access**, para poder dar de alta los dominios de las empresas |
| `PLATFORM_EMAIL_FROM_NAME` | var | `INMO` | Nombre del remitente de plataforma |
| `PLATFORM_EMAIL_FROM_ADDRESS` | var | `info@serendipiaagency.com` | Dirección del remitente de plataforma |
| `PLATFORM_EMAIL_REPLY_TO` | var | la misma dirección | Responder-a |
| `PLATFORM_ADMIN_NOTIFY_EMAILS` | var | las cuentas `super_admin` | Quién recibe «nueva empresa registrada» y los cambios de estado (separados por comas) |
| `PLATFORM_BASE_URL` | var | el origen de la petición | Origen de los enlaces de los emails (login, definir contraseña, ficha) |

Las `var` van en `wrangler.toml` `[vars]` o en el dashboard del Worker. El
secreto se pone con `wrangler secret put RESEND_API_KEY`, o desde
Dashboard → Workers → sa-inmobiliaria → Settings → Variables and Secrets.

### Bloqueo externo: dominio en Resend

Resend sólo acepta enviar desde `info@serendipiaagency.com` si el dominio
**`serendipiaagency.com` está verificado en la misma cuenta de Resend** a la
que pertenece `RESEND_API_KEY`. Esto no se puede hacer desde el código.

1. Resend → Domains → Add domain → `serendipiaagency.com`.
2. En el DNS de `serendipiaagency.com`, crear los registros que Resend indica:
   - **SPF:** `TXT` en `send.serendipiaagency.com` y `MX` de retorno;
   - **DKIM:** `TXT` en `resend._domainkey.serendipiaagency.com`.
3. Recomendado: **DMARC**, `TXT` en `_dmarc.serendipiaagency.com`, por ejemplo
   `v=DMARC1; p=none; rua=mailto:info@serendipiaagency.com`.
4. Esperar a que Resend marque el dominio como **Verified**.

**Cómo saber en qué punto está.** Haz un alta y mira el resultado del envío,
o `email_log`:

- `not_configured`: falta `RESEND_API_KEY`.
- `queued` con `error_message` del tipo «domain is not verified»: falta el
  paso de DNS.
- `sent`: funciona. La entrega real la confirma después el webhook de Resend.

## Pruebas

- `test/unit/organizationProvisioning.test.ts`:
  - la matriz de la política de acceso;
  - el provisioning de los dos canales;
  - dominio y correo duplicados;
  - la compensación;
  - el slug;
  - el doble envío;
  - los límites del canal público.
- `test/unit/platformEmail.test.ts`:
  - el remitente central en **todos** los templates de plataforma, incluso
    con una empresa con identidad propia verificada;
  - el responder-a independiente;
  - que no salen contraseñas;
  - el escape de HTML;
  - `once`;
  - un proveedor que rechaza (no se cambia el remitente);
  - sin clave;
  - los destinatarios del super admin.
- `test/unit/loginError.test.ts`: el mensaje de la política en el login.
- `tests/e2e/empresas.spec.ts`, de punta a punta con el simulador de Resend
  (`RESEND_BASE_URL`, sólo loopback):
  - **asistente:**
    - ruta, pasos, validación, dominio ocupado, logo, color, revisión con
      «Editar», Atrás y Continuar;
    - doble clic: una sola empresa;
    - invitación desde INMO;
    - listado legible;
    - ficha con guardado y suspensión con aviso;
    - confirmación al salir;
    - empresa antigua;
    - 403 sin super admin;
  - **registro:**
    - CTA de la landing, formulario, éxito honesto, emails sin contraseña;
    - login normal, sin autologin;
    - rol `admin` de su empresa y aislamiento de tenant;
    - 403 en Empresas;
    - suspender corta la sesión y el login lo explica;
    - campos prohibidos, correo duplicado, doble envío simultáneo;
    - fallo del proveedor;
    - límite por IP.
