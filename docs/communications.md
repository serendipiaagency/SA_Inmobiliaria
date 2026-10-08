# Centro de Comunicaciones (WhatsApp Business, formularios y chat web, llamadas)

> Núcleo N8a (2026-10-05): la bandeja recibe también los **formularios de la
> web** y el **chat de la web** como hilos, cada uno con su Contact, Lead y
> Property guardados. Ver «Formularios y chat web» más abajo.
>
> FASE 29, email entrante (2026-10-06): con la plataforma configurada en
> Cloudflare, la respuesta de un cliente a un email enviado desde un hilo
> vuelve a ese hilo. Ver «Email entrante» más abajo.

Bandeja de WhatsApp por agencia dentro del panel (`/admin/comunicaciones`):
recibir y responder mensajes, compartir propiedades de los dos catálogos
(Propiedades web, con enlace público, y Propiedades 2ª mano, sin él),
vincular cada conversación a un cliente o lead, anotar llamadas, programar
seguimientos en la agenda y —con Meta y donde Meta lo permite— llamar por
WhatsApp desde el navegador.

Todo lo que hay aquí sale de la documentación oficial de los proveedores.
**No se usa ningún SDK, ninguna automatización de WhatsApp Web ni ningún
endpoint que no esté en esa documentación.** Lo que un proveedor no permite
no se ofrece en la interfaz.

## Matriz de capacidades (verificada 2026-09-21)

| Capacidad | Meta WhatsApp Cloud API | Twilio (WhatsApp) |
| --- | --- | --- |
| Mensajes de texto dentro de la ventana de 24 h | **DISPONIBLE** | **DISPONIBLE** |
| Imágenes y documentos (por enlace público) | **DISPONIBLE** | **DISPONIBLE** |
| Plantillas aprobadas (fuera de la ventana) | **DISPONIBLE** | **DISPONIBLE** (Content SID) |
| Sincronizar la lista de plantillas | **DISPONIBLE** (`GET /<WABA_ID>/message_templates`) | **NO DISPONIBLE** (se registran a mano) |
| Estados entregado / leído | **DISPONIBLE** (webhook `statuses`) | **DISPONIBLE** (StatusCallback) |
| Marcar leído en el WhatsApp del cliente | **DISPONIBLE** | **NO DISPONIBLE** |
| Medios entrantes | **DISPONIBLE** (descarga con el token, se guarda en R2) | **DISPONIBLE** (URL con autenticación básica) |
| Llamadas de voz por WhatsApp (WebRTC desde el navegador) | **REQUIERE CONFIGURACIÓN** (ver requisitos) | **NO DISPONIBLE** para remitentes fuera de BR/MX/ID/IN |
| Permiso de llamada al usuario | **REQUIERE CONFIGURACIÓN** | **NO DISPONIBLE** |
| Grabación de llamadas | **NO SE OFRECE** (el audio no pasa por nuestro servidor) | — |
| Transcripción | **NO SE OFRECE** | — |

**Lo que NO se puede hacer y no se finge:** escribir texto libre a quien no
ha escrito en las últimas 24 h (WhatsApp exige plantilla), enviar a un
contacto que pidió la baja, llamar por WhatsApp sin que el usuario haya dado
permiso (Meta responde `138006`), llamar por WhatsApp con Twilio desde un
número español, o llamar a usuarios en EE. UU., Canadá, Egipto, Vietnam o
Nigeria (Meta no permite llamadas salientes ahí).

### Requisitos por proveedor

**Meta WhatsApp Cloud API**

- Una cuenta de WhatsApp Business (WABA) con un número registrado en Cloud
  API, y una app de Meta con el producto WhatsApp.
- Un token de usuario del sistema con `whatsapp_business_messaging` (y
  `whatsapp_business_management` para sincronizar plantillas).
- El `phone_number_id` del número; para las plantillas, el id de la WABA.
- El webhook de la app apuntando a `https://<tu-dominio>/api/comms/webhooks/meta`,
  suscrito a los campos **`messages`** y **`calls`**, con el App Secret para
  verificar `X-Hub-Signature-256` y un token de verificación.
- Para llamadas: límite de mensajería de al menos 2000 destinatarios/día,
  la función activada en el número (`POST /<PHONE_NUMBER_ID>/settings`, botón
  «Activar» en Configuración → Comunicaciones) y permiso del usuario para las
  salientes. Límites de Meta: 100 llamadas conectadas por usuario y día; 1
  petición de permiso por 24 h y 2 por semana por usuario; el permiso
  temporal dura 7 días; 4 llamadas seguidas sin contestar revocan el permiso.

**Twilio**

- Una cuenta de Twilio con un remitente de WhatsApp aprobado (o el sandbox
  `+14155238886` para probar; cada teléfono destino tiene que haber enviado
  antes el `join <palabra>` del sandbox).
- Account SID y Auth Token (el token firma los webhooks).
- Los webhooks del remitente apuntando a
  `https://<tu-dominio>/api/comms/webhooks/twilio/inbound` (mensaje entrante) y
  `https://<tu-dominio>/api/comms/webhooks/twilio/status` (estado; también se
  pasa como `StatusCallback` en cada envío).
- Las plantillas se registran a mano con su Content SID (`HX…`).

### Fuentes oficiales

- Mensajes: <https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages/>
  (texto, imagen, documento, plantilla, interactivo `call_permission_request`,
  `{"status":"read"}`).
- Webhooks: <https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components/>
  y verificación de firma `X-Hub-Signature-256`.
- Medios: <https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media/>
  (la URL de descarga caduca a los 5 minutos; los medios se conservan 30 días).
- Plantillas: <https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/message-template-api>
- Llamadas: <https://developers.facebook.com/docs/whatsapp/cloud-api/calling/>,
  <https://developers.facebook.com/docs/whatsapp/cloud-api/calling/user-initiated-calls/>,
  <https://developers.facebook.com/docs/whatsapp/cloud-api/calling/business-initiated-calls/>,
  <https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/user-call-permissions>,
  <https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/call-settings>
- Twilio: <https://www.twilio.com/docs/messaging/guides/webhook-request>,
  <https://www.twilio.com/docs/messaging/api/media-resource>,
  <https://www.twilio.com/docs/usage/webhooks/webhooks-security>.
- Click to chat (`https://wa.me/<número>?text=…`), lo que se usa cuando no
  hay número conectado.

## Cómo conectar un número

1. **Secreto del Worker** (una vez por plataforma):
   `wrangler secret put COMMS_CREDENTIALS_ENCRYPTION_KEY` (cualquier cadena
   larga y aleatoria; no cambiarla con canales guardados sin re-cifrar). Sin
   él no se puede conectar ningún número y los webhooks responden 503;
   *Estado del sistema* lo dice.
2. Opcional, si la plataforma usa **una sola app de Meta** para todas las
   agencias: `WHATSAPP_APP_SECRET` y `WHATSAPP_WEBHOOK_VERIFY_TOKEN`. Con
   ellos, un canal de Meta puede conectarse sin aportar su propio App Secret.
   Si cada agencia tiene su app, cada canal lleva los suyos.
3. En el panel, **Configuración → Comunicaciones** (área *Sistema*) →
   «Conectar número»: proveedor, número en E.164, y las credenciales. Se
   cifran con AES-GCM (`server/utils/encryption.ts`, mismo esquema que el
   2FA) antes de tocar D1 y **nunca vuelven en ninguna respuesta**: el panel
   sólo sabe «hay token / hay app secret».
4. «Probar» hace una llamada real de sólo lectura (`GET /<PHONE_NUMBER_ID>` en
   Meta, `GET /Accounts/{sid}.json` en Twilio) y deja el error en la fila si
   falla.
5. Registrar el webhook en el proveedor con la URL que muestra la fila. El
   handshake de Meta (`hub.verify_token`) acepta el token del Worker o el de
   cualquier canal.
6. Plantillas: «Sincronizar desde Meta» (WABA necesaria) o «Añadir a mano».
7. Llamadas (sólo Meta): «Comprobar» / «Activar». Lo que Meta responda es lo
   que se guarda; si rechaza activar, el motivo queda en la fila.

## Cómo funciona

### Entrada (webhooks)

`server/api/comms/webhooks/*` no tienen sesión: la confianza viene entera
de la firma, verificada **con el secreto del canal al que iba el evento**.
Para Meta, el `phone_number_id` del cuerpo (leído sin fiarse todavía de
nada) elige el canal; para Twilio, el `To` (entrada) o el `From` (estado).
Firma inválida → 403 y no se toca nada. Número desconocido → 200 e ignorado
(los proveedores reintentan todo lo que no es 2xx).

Cada evento se **reclama** en `comms_webhook_events` (único por proveedor +
clave) antes de procesarse: un reenvío choca con el índice y cuenta como
duplicado. Un evento que falla al procesarse queda con `processed_ok = 0` y
el error en `note`; el webhook responde 200 igualmente.

Un mensaje entrante: contacto (por teléfono normalizado a E.164, cruzado con
`clients.phone` / `leads.phone` por los últimos 9 dígitos) → conversación
por (canal, contacto) → mensaje → `unread_count + 1`, `last_inbound_at` →
aviso interno por email la primera vez que ese número escribe (plantilla
`whatsapp_message_received`, desactivable en Ajustes).

### Salida

`sendOutbound()` (`server/utils/comms/inbox.ts`) aplica antes de llamar al
proveedor las dos reglas de WhatsApp: **ventana de 24 h** desde el último
mensaje del cliente (fuera, sólo plantillas) y **consentimiento** (un
contacto `opted_out` no recibe nada). El rechazo es nuestro, en español y con
código (`window_closed`, `opted_out`), no un 131047 de Meta. El estado
`sent` significa «aceptado por el proveedor»; `delivered`/`read` llegan por
webhook y nunca retroceden; `failed` lleva el código y el motivo.

Los archivos se envían **por enlace público** (`/api/media/<key>`, subida
por `/api/admin/upload`): el proveedor tiene que poder descargarlos, así que
en local (`wrangler dev`) un envío con archivo falla en el proveedor y queda
como fallido con el motivo. Los medios entrantes no se descargan en el
webhook: se guarda la referencia y se descargan con el token del canal la
primera vez que alguien los abre (`/api/admin/comms/messages/:id/media`),
guardándose en R2 bajo el inquilino como `media_assets` privados.

Cada mensaje saliente guarda además `sent_at`/`delivered_at`/`read_at`
(`comms_messages`, FASE 29 §109/§135): cada columna se rellena una sola vez,
la primera vez que el estado llega a ese punto por webhook — nunca se
inventa una fecha para un estado que el proveedor no ha confirmado
(`applyMessageStatus()` en `server/utils/comms/inbox.ts`).

### Compartir propiedad: dos catálogos

`buildPropertyShare()` (`server/utils/comms/admin.ts`) construye el envío
para **Propiedades (web)** o **Propiedades 2ª mano** — el mismo
`property_id` no basta para saber de qué tabla viene, así que
`comms_conversations`, `comms_messages` y `comms_calls` llevan también
`property_kind` (`'agent' | 'developer'`, mismo vocabulario que
`activities.propertyId/propertyKind`; NULL en filas anteriores a esta
migración se lee como `'developer'`, que es lo único que existía). Los dos
catálogos reutilizan `toPublicProperty()` (`server/utils/propertyPrivacy.ts`)
— el mismo filtro que protege la ficha pública — así que ningún campo
estrictamente interno (referencia, comisión, notas internas…) puede acabar
en un mensaje de WhatsApp. **2ª mano no tiene página pública** (no hay
`publishedAt` en `agent_properties`): `buildPropertyShare()` nunca inventa
un enlace para ella, `share.url` es `null` y el mensaje va sólo con foto y
ficha de texto; el picker de propiedades (`PropertyPickerModal.vue`) busca
en los dos catálogos a la vez con `searchPropertiesCompact()`
(`server/utils/properties/searchService.ts`, la misma búsqueda ligera que ya
usaba el picker de Calendario).

### Propiedad ↔ Compatibilidades

Desde `/admin/compatibilidades`, un match "Seleccionado" con contacto y
teléfono ofrece "Enviar propiedad": abre o reutiliza la conversación y llama
a `POST /api/admin/comms/conversations/:id/share-property` con
`buyerRequirementId`. Tras un envío realmente aceptado por el proveedor, la
ruta llama a `markMatchSent()` (`server/utils/matching/service.ts`) para
marcar ese match como `status: 'sent'` — un estado que **sólo** se alcanza
así, nunca desde la API manual de decisión (`setMatchStatus()` sigue
rechazando `'sent'` igual que antes). Un fallo al marcar el match no deshace
el envío ya hecho: el mensaje de WhatsApp es lo que de verdad importa.

### Reintentos (FASE 29 §136)

Un saliente `failed` se reintenta con `POST
/api/admin/comms/conversations/:id/messages` y `{ type: 'retry', messageId }`
— una rama más del endpoint de envío, **no una ruta nueva**: cuando se
escribió, el margen de claves de ruta de Nitro frente al TS2589 estaba en
cero y una ruta `/messages/:id/retry` rompía `npm run typecheck` en un
componente sin relación (ese límite ya no existe desde 2026-10-08, ver P1-14
en `docs/production-hardening-audit.md`). La lógica vive en
`retryOutboundMessage()` (`server/utils/comms/admin.ts`):

- Sólo un `direction = 'out'` con `status = 'failed'` (409 si no). Como
  `sendOutbound()` sólo guarda fila después de llamar al proveedor, un
  `failed` siempre es un rechazo real del proveedor, nunca una regla nuestra.
- **Nunca reescribe la fila fallida**: el reintento es un mensaje nuevo,
  igual que un reenvío real. El fallido se queda en el hilo.
- `property_share` se reconstruye en vivo con `buildPropertyShare()` — si
  el precio cambió entre el intento y el reintento, sale el actual.
- Una plantilla se vuelve a buscar en el canal por nombre e idioma (409 si
  ya no existe); texto y archivos reusan `body`/`media_url` guardados.
- Pasa otra vez por `sendOutbound()`: ventana de 24 h y consentimiento se
  vuelven a comprobar — un texto fuera de la ventana ya no se reintenta.

No hay reintento automático en segundo plano: WhatsApp no garantiza que un
reenvío ciego sea idempotente (un mensaje rechazado por número inválido o
token caducado volvería a fallar igual), así que reintentar es una decisión
de quien lleva el hilo.

### Bandeja: filtros y contexto (FASE 29 §121/§123)

`GET /api/admin/comms/conversations` acepta, además de `status`/`assigned`/`q`:
`channel=<id>`, `unread=1` y `propertyId`+`propertyKind`. Con propiedad, una
conversación cuenta si esa propiedad es su contexto **o si se envió alguna vez
en ese hilo** (`comms_messages.property_id`) — el contexto sólo guarda la
última. Una fila con `property_kind` NULL de antes de la 0082 cuenta como
`developer`. Contacto y lead se buscan con `q`, que ya cruzaba nombres de
clientes y leads.

`GET /api/admin/comms/conversations/:id` devuelve también, **resuelto en
vivo y nunca copiado a la conversación**:

- `lead` — `stage`, `status` y la proyección `nextActionAt`/`nextActionType`
  (`task:<tipo>` o `appointment:<tipo>`, `server/utils/leads/nextAction.ts`).
- `buyerRequirements` — las activas del Contact detrás del contacto de
  WhatsApp (vía `resolveActivityContact()`; sin vínculo, lista vacía).
- `appointments` — las citas futuras programadas de ese lead (`visits.lead_id`).
- `property` resuelve ahora los dos catálogos según `property_kind` — antes
  sólo miraba `developer_properties`, así que una propiedad de contexto de 2ª
  mano se quedaba en `null`.

`createFollowUpVisit()` («Programar seguimiento») escribe ahora
`visits.lead_id` desde `comms_contacts.lead_id` y llama a
`syncLeadNextAction()`, igual que el resto de caminos que crean citas
(`appointments/adminCreate.ts`, `tours.ts`, la reserva pública). Antes un
seguimiento creado desde aquí no contaba como próxima acción del lead.

### Consentimiento

- Un mensaje del cliente pone `consent_status = opted_in` (origen
  `inbound_message`) si estaba «sin registrar».
- «STOP», «BAJA», «unsubscribe», «cancelar», «no molestar» lo ponen
  `opted_out` (origen `keyword`). Sólo lo revierte un opt-in a mano en la
  ficha del contacto (queda registrado quién lo hizo).

### Contacto desconocido

Un número que no cruza con ningún cliente ni lead se muestra como
«Desconocido» en la bandeja. Desde la ficha del contacto: vincular a un
cliente o lead existente, o crear un lead (origen `whatsapp`). En Ajustes,
«Contacto desconocido → Crear un lead automáticamente» lo hace solo.

**Las dos vías crean el lead con `upsertLead()`** (`server/utils/leads.ts`,
FASE 29 §118-120), el mismo circuito que el formulario web, la reserva y
`POST /api/v1/leads`: resuelve o crea el Contact (dedup por teléfono/email,
nunca fusiona), registra `LEAD_CREATED` en Activity, enruta según las reglas
de la agencia y avisa al equipo. Antes cada una hacía su propio `INSERT` en
`leads` y el lead nacía sin Contact, sin reparto y sin actividad.

Como el webhook no tiene sesión y `server/utils/comms/*` no depende de H3, la
ruta inyecta el circuito: `IngestContext.createLead = (l) => upsertLead(event, l)`
(webhooks de Meta y Twilio) y `upsertContact(…, { createLead })` (panel). **Sin
`createLead` no se crea ningún lead**, nunca por otra vía. Al abrir una
conversación o un contacto desde la ficha de un cliente o lead no se inyecta:
esa ficha ya es la persona.

### Actividad 360º

`comms_contacts.client_id` es un vínculo guardado de verdad (a diferencia
del resto del histórico del cliente, que se cruza por email/nombre). La
ficha del cliente (`/admin/clientes/:id`) muestra sus conversaciones y
llamadas en la pestaña «Comunicaciones» y en la cronología («WhatsApp
recibido/enviado», «Llamada realizada/recibida»), con enlace al hilo.

Desde FASE 29 (§139-142) las mismas comunicaciones aparecen fuera de la
ficha del cliente, siempre por vínculo guardado y sin ruta nueva (entonces
el margen de TS2589 estaba en cero, ver «Reintentos»):

| Dónde | Qué | De dónde sale |
| --- | --- | --- |
| Ficha del contacto (`/admin/contactos/:id`, pestaña Comunicaciones; los leads enlazan aquí) | WhatsApp, llamadas y emails enviados de todos sus leads y clientes | `GET /api/admin/saas/contacts/:id` → `communications` |
| Ficha de la operación (`/admin/deal-operations/:id`) | Las del comprador — la relación Deal↔Conversation se deriva, no se guarda | La misma respuesta del contacto, que la página ya pedía para el nombre |
| Ficha del cliente | Lo de antes + emails enviados | `GET /api/admin/clients/:id/related` → `emails` |
| Ficha de una propiedad (los dos catálogos; sólo con lectura de CRM) | Conversaciones donde es el contexto o donde se envió | `GET /api/admin/comms/conversations?propertyId=&propertyKind=` |

`listPersonCommunications()` (`server/utils/comms/related.ts`) es la única
consulta para las tres primeras. Los emails que lista son **los enviados**:
Resend no recibe correo (su webhook sólo trae el estado de entrega de lo que
enviamos), así que no hay una bandeja de email general y no se inventa una
(§115). Se cruzan por la dirección exacta a la que se envió —`email_log`
guarda una fila por destinatario— y nunca se devuelve el HTML del correo,
sólo asunto, plantilla, estado y fechas. Lo que el cliente RESPONDE a un email
de un hilo web entra en ese hilo con el email entrante (FASE 29, abajo), así
que aparece con los hilos web de la persona, no en esta lista.

Desde FASE 29 (§128), un envío de propiedad real y una llamada contestada
de verdad generan además un evento de `activities` — `PROPERTY_SENT` y
`CALL_COMPLETED` (`ACTIVITY_EVENT_TYPES`,
`server/utils/activity/service.ts`) — con el mismo contacto/lead que la
conversación, resuelto por `resolveActivityContact()`
(`server/utils/comms/inbox.ts`: de `comms_contacts` a `leads.contactId` o
`clients.contactId`, o `null` si no hay vínculo — nunca se inventa uno).
Ninguno de los dos vuelca el texto del mensaje ni notas en el `metadata` del
evento. `PROPERTY_SENT` se dispara sólo dentro de `sendOutbound()` — el
único punto por el que pasa todo envío saliente — cuando el proveedor
confirma de verdad el envío de una propiedad; `CALL_COMPLETED` sólo cuando
hay evidencia real de que se contestó (`finalStatus === 'completed'` en el
webhook de WhatsApp Calling, o resultado «contestada» al registrar una
llamada a mano) — nunca por abrir el marcador `tel:` o iniciar una llamada
que nadie contesta.

### Llamadas

Dos caminos, los dos actividad real de la ficha:

- **WhatsApp Calling (Meta)**: `composables/useVoiceManager.ts` crea la
  `RTCPeerConnection` en el navegador (micrófono, STUN público, OPUS,
  ICE + DTLS-SRTP, que es lo que Meta exige), genera la oferta SDP con los
  candidatos ICE ya reunidos y la manda a `POST /api/admin/comms/calls`; el
  servidor la pasa a `POST /<PHONE_NUMBER_ID>/calls {action: connect}`. La
  respuesta SDP llega por el webhook `calls` (evento `connect`) y el
  navegador la recoge en `GET /api/admin/comms/calls/:id`. Una entrante llega
  como `connect` con `direction: USER_INITIATED` y la oferta; el sondeo la
  enseña como «llamada entrante», y aceptar envía `pre_accept` + `accept`
  con la respuesta (Meta corta sola una entrante no aceptada en 30–60 s).
  `terminate` y `reject` van por `POST /api/admin/comms/calls/:id/action`.
  El audio va directo navegador ↔ WhatsApp: **no hay grabación posible ni
  transcripción**; el servidor sólo ve SDP y estados.
- **Registrar llamada**: una llamada telefónica normal, anotada a mano con
  dirección, resultado, duración y notas. Es lo que ofrece el botón «Llamar»
  cuando el canal no admite llamadas (marca con `tel:` y abre el formulario).

En los dos casos, al terminar se anota el resultado y, si procede, se
programa un seguimiento: una fila real de `visits` (canal `phone`, `video` o
`in_person`) con la misma comprobación de solapes que la reserva pública,
que aparece en CRM → Visitas y dispara los recordatorios.

**Catálogo de la propiedad (arreglo, FASE 29 cierre).** Desde el
incremento 1 la propiedad de contexto de un hilo puede ser de 2ª mano, pero
las llamadas y los seguimientos seguían suponiendo obra nueva: la llamada
nunca escribía `comms_calls.property_kind` (la columna existía desde la
migración 0082), `CALL_COMPLETED` se registraba siempre con
`propertyKind: 'developer'`, y «Programar seguimiento» buscaba la propiedad
sólo en `developer_properties` sin comprobar que existiera — un seguimiento
sobre un piso de 2ª mano quedaba apuntando a la promoción con el mismo id (o
a ninguna). Ahora el catálogo viaja de punta a punta: la interfaz lo manda
(`propertyKind` junto a `propertyId`), y cuando no llega se toma el del hilo
o el de la llamada; `createFollowUpVisit` resuelve la propiedad en su
catálogo y dentro de la organización (404 si no es suya) y escribe
`visits.property_kind`, igual que `appointments/adminCreate.ts`. Mensajes y
llamadas serializados exponen ya `propertyKind`.

**Estado real de las llamadas:** el código sigue la documentación oficial
al pie de la letra y está cubierto por pruebas unitarias con respuestas de
Meta simuladas, pero **no ha podido probarse contra Meta en producción**:
hace falta un número con Calling activo (límite de mensajería ≥ 2000) y
esta plataforma todavía no tiene ninguno. Cuando lo haya, la primera
llamada real es la validación pendiente; la interfaz sólo ofrece «Llamar
por WhatsApp» cuando el canal dice `calling_status = enabled`.

### «Tiempo real»

No hay WebSockets ni SSE en este despliegue (Workers + D1, sin Durable
Objects). El panel sondea `GET /api/admin/comms/updates?since=` cada 10 s
(cada 4 s con la bandeja abierta, nunca con la pestaña oculta) y aplica en
sitio lo que cambió: conversaciones tocadas, llamadas que cambiaron de
estado y llamadas entrantes sonando. El contador del menú sale de ahí.

## Formularios y chat web (núcleo N8a, FASE 29)

Migración `0087_comunicaciones_web_y_aperturas.sql`. Un hilo web no es un hilo
de WhatsApp: no hay número de la agencia (`comms_channels`) ni teléfono
obligatorio (`comms_contacts`, que exige E.164 único por agencia), así que vive
en su propia tabla y la bandeja lista los dos juntos.

- `comms_web_threads`: `kind` (`form` | `chat`), estado, comercial asignado,
  **Contact (`contact_id`), Lead (`lead_id`) y Property (`property_id` +
  `property_kind`) guardados al crearse**, datos que dejó el visitante, último
  formulario (`form_type`), página desde la que escribió (sólo la ruta, y sólo
  si es de la misma web), no leídos y, en el chat, el SHA-256 del token de
  sesión y su caducidad.
- `comms_web_messages`: `direction` (`in` | `out` | `note`), `via` (`form` |
  `chat` | `email` | `note`), cuerpo, campos de texto del formulario (nunca
  ficheros), ficha compartida, estado y, si salió por email, su fila de
  `email_log` (el estado que se enseña es el de esa fila: entregado o rebotado
  lo escribe el webhook de Resend).

Lógica en `server/utils/comms/web.ts` (sin H3, como `inbox.ts`), lado público en
`server/utils/comms/webPublic.ts`, enlaces personales en
`server/utils/comms/shareLinks.ts`.

### Formularios → hilo «Formulario web»

Las rutas públicas que crean leads llaman a `recordWebFormSubmission()`
DESPUÉS de guardar lo suyo y dentro de un `try/catch` (el formulario nunca
falla por esto):

| Formulario | Ruta | `form_type` | Propiedad |
| --- | --- | --- | --- |
| Contacto (`/contacto`, portada) | `POST /api/public/contact` | `contact` | con `propertySlug` (obra nueva, viva, de la agencia) |
| Formulario de captación del Constructor Web | `POST /api/public/contact` (`form: 'lead_form'`) | `lead_form` | igual |
| «Atendido por» de la ficha de una propiedad | `POST /api/public/contact` (`form: 'property'`) | `property` | obligatoria (422 si no es de la agencia, pública y viva); exige `privacyAccepted` y guarda `privacyAcceptedAt` en los campos del hilo |
| Solicitud de visita (reserva con un comercial) | `POST /api/public/agents/:slug/book` | `visit_request` | la de la cita |
| Verificación de visitante | `POST /api/public/visitor` | `visitor` | — (los PDF KYC no se copian: sólo se dice cuántos hay) |
| Referidos | `POST /api/public/referrals` | `referral` | — (agencia = la del enlace) |

El formulario de la ficha (`form: 'property'`) llama a `upsertLead()` con
`reuse: 'same_property'` (sólo reutiliza el lead de esa persona sobre ESA
propiedad: preguntar por otra es otro lead del mismo Contact) y
`routingFallback: 'property_responsible'` (si ninguna regla de enrutado lo
asigna, va al comercial responsable de la propiedad, si sigue activo en la
agencia). `sourceDetail` = «Ficha de propiedad». Como el lead nuevo ya avisa
con `lead_created`, no se manda además `contact_message`. Para todos los
formularios de este endpoint: campo trampa `website`, `submissionId` (un doble
clic no crea nada dos veces: `claimOnce()` en `server/utils/rateLimit.ts`) y
tope de 32 KB del cuerpo.

Las reclamaciones (`type: complaint`) no son hilos: no crean lead. El lead lo
crea `upsertLead()` como siempre; el hilo guarda ese lead, el Contact de ese
lead (`leads.contact_id`) y su comercial como asignado. Los envíos de la misma
persona (mismo lead → mismo Contact → mismo email) se acumulan en el mismo
hilo, que se reabre. Un `leadId` de otra agencia se ignora (no se vincula).

### Chat de la web

Activable por agencia (`comms_settings.web_chat_enabled`, apagado por defecto,
y `web_chat_greeting`) en Configuración → Comunicaciones. `GET
/api/public/tenant` devuelve `webChat: { enabled, greeting }` y el componente
`components/WebChatWidget.vue` (en `layouts/default.vue` y en la rama de
portal de `layouts/root.vue`, o sea, en toda la web pública) sólo aparece si
está activo. Es un **ajuste por agencia**, no un bloque del Constructor Web:
así está en todas las páginas, no sólo en la portada.

API — una rama del endpoint de contacto, no una ruta nueva (presupuesto de
rutas = 0): `POST /api/public/contact?channel=chat&action=…`

| `action` | Cuerpo | Respuesta |
| --- | --- | --- |
| `start` | `{ name, email?, phone?, message, propertySlug?, website (trampa), token? }` | `{ token, expiresAt, status, messages }` |
| `send` | `{ token, message }` | `{ message }` |
| `poll` | `{ token, after }` | `{ status, messages }` |

Protección:

- La agencia la decide el host (`resolvePublicOrgId`), nunca el cuerpo. Con el
  chat apagado: 404.
- Límite de tasa por IP y acción **antes de leer el cuerpo**
  (`server/utils/rateLimit.ts`): `start` 5 / 10 min, `send` 30 / 5 min, `poll`
  120 / 10 min. Además, 15 mensajes seguidos del visitante sin respuesta del
  equipo → 429 («espera a que te respondan»).
- Campo trampa `website` (400 si llega relleno); nombre ≤ 120, email y
  teléfono validados, mensaje 1-2000 caracteres sin caracteres de control y
  con como mucho 3 enlaces.
- El token es la única credencial: 32 bytes aleatorios en base64url; se guarda
  sólo su SHA-256 (índice único parcial). Sólo da acceso a SU hilo en ESA
  agencia (otra agencia, token inventado o caducado → 404). El sondeo nunca
  devuelve notas internas, ni quién del equipo respondió, ni ids de otros
  hilos. La sesión dura 30 días desde el último mensaje del visitante.
- Sin cookies: el widget guarda el token en `localStorage` de la web de la
  agencia (primera parte). Sin CORS: otra web no puede leer las respuestas.
- Con email o teléfono se crea/reutiliza su lead por `upsertLead()` (origen
  `web`, detalle «Chat web», mensaje original y primer contacto de la web). Sin
  ellos es un visitante anónimo al que sólo se le responde por el chat.
- El sondeo del widget: cada 6 s con el chat abierto y la pestaña visible, cada
  30 s cerrado, nunca con la pestaña oculta. Una respuesta del equipo que
  llega al navegador pasa a `delivered` (es lo único que se sabe: no si la leyó).

No se envía aviso interno por email de un chat anónimo nuevo (sí el de «lead
nuevo» cuando deja email o teléfono): la bandeja lo cuenta en no leídos.

### La bandeja con hilos web

Sin rutas nuevas: los mismos endpoints de `/api/admin/comms/conversations`
aceptan la clave `w<n>`:

| Endpoint | Con `:id = w<n>` |
| --- | --- |
| `GET /conversations?source=all\|whatsapp\|web_form\|web_chat` | Mezcla WhatsApp y web por `lastMessageAt`; cada fila lleva `source`. Un número de WhatsApp concreto (`channel`) deja fuera los web. `counts` suma los dos. |
| `GET /conversations/:id` | `kind: 'web'`, mensajes, contexto (lead, necesidades, citas, propiedad, Contact) y `reply` (canales reales con su motivo). |
| `PATCH /conversations/:id` | estado, comercial (de la agencia, si no 404) y propiedad (viva, de la agencia). |
| `POST /conversations/:id/messages` | `{ type: 'text', via: 'chat'\|'email', body }` o `{ type: 'property', via, propertyId, propertyKind }`. |
| `POST /conversations/:id/notes` · `/read` | nota interna (el visitante nunca la ve) · no leídos a cero. |
| `GET /updates` | incluye los hilos web tocados desde `since`; `unread` los suma. |

**Responder sólo por un canal real** (`webReplyOptions()`): chat si es un hilo
de chat con la sesión viva; email si dejó email **y** la plataforma tiene
`RESEND_API_KEY` (plantilla `web_thread_reply`, el texto se escapa entero, sale
con la identidad de la agencia y deja su fila en `email_log`); WhatsApp si dejó
un teléfono normalizable y hay un número conectado — la interfaz abre (o
encuentra) su hilo real de WhatsApp con `POST /api/admin/comms/conversations`,
donde sigue aplicando la ventana de 24 h. Si no hay canal: 409 con el motivo, y
la interfaz sólo deja nota interna. Una respuesta aceptada marca el primer
contacto / primera respuesta humana del lead (`markLeadContacted`) y una ficha
enviada deja `PROPERTY_SENT` (`entityType: comms_web_message`).

**Enlace personal (FASE 32).** Una ficha de obra nueva compartida por email o
chat con una persona conocida (el hilo tiene Contact o Lead) lleva
`/propiedades/<slug>?f=<token>` (`property_share_links`, sólo el hash). La
página de la propiedad lo registra al pintarse
(`POST /api/public/properties/:slug/view` con `{ f }`); el servidor sólo lo
cuenta si el token es de esa agencia y esa propiedad. La primera apertura deja
`PROPERTY_SHARE_OPENED` con `metadata.via = 'link'` y recalcula el Lead Score
(ver docs/lead-score.md). 2ª mano no tiene página pública: va sin enlace.

### El Contact se guarda en el hilo de WhatsApp

Antes el Contact de una conversación de WhatsApp se deducía en cada lectura
(`comms_contacts.lead_id/client_id` → `leads/clients.contact_id`). Ahora
`comms_conversations.crm_contact_id` lo **guarda** cuando se conoce: al crear
el hilo (`findOrCreateConversation`), al vincular el contacto
(`contacts/:id/link`, `contacts` y `openConversation`, que llaman a
`syncConversationCrmContact`; desvincular lo borra) y al abrir el hilo (se
rellena si faltaba). Las filas anteriores quedan a NULL hasta su próxima
apertura o vínculo; mientras, el código sigue deduciéndolo como respaldo. La
ficha del Contact encuentra sus hilos por ese vínculo guardado
(`listPersonCommunications({ contactIds })`) y el panel del hilo enlaza a su
ficha.

### Lo que sigue sin existir (y no se simula)

- **Una bandeja de email general.** El email entrante (abajo) sólo recibe
  RESPUESTAS a los emails enviados desde un hilo web, en ese hilo. Un correo
  nuevo que un cliente escriba a la agencia sin responder a uno de esos emails
  no entra en la plataforma, y sin la configuración de Cloudflare tampoco las
  respuestas: entonces llegan al «Responder a» de la agencia, como antes.
- **Llamadas.** Siguen sin validarse con una llamada real (ver «Estado real de
  las llamadas»): no hay número de Meta con Calling activo en esta plataforma.

## Email entrante (FASE 29)

Sin migración: reutiliza `comms_web_threads`, `comms_web_messages` (un mensaje
`direction = 'in'`, `via = 'email'`) y `comms_webhook_events` (idempotencia).
Hoy sólo existe para **hilos web** (formulario y chat): son los únicos desde
los que la bandeja envía email (`replyToWebThread()`, plantilla
`web_thread_reply`).

### Cómo funciona

1. **Envío.** Si la plataforma tiene `INBOUND_EMAIL_DOMAIN` y
   `INBOUND_EMAIL_SECRET`, `replyToWebThread()` pide a `threadReplyAddress()`
   (`server/utils/comms/inboundAddress.ts`) la dirección del hilo y se la pasa a
   `sendTransactionalEmail()` como `replyTo`:

   ```
   Reply-To: respuestas+<orgId>-<threadId>-<firma>@<INBOUND_EMAIL_DOMAIN>
   ```

   `<firma>` = HMAC-SHA256(`INBOUND_EMAIL_SECRET`, `inbound-reply:v1:<orgId>:<threadId>`)
   truncado a 20 caracteres hexadecimales (80 bits; hexadecimal porque las
   direcciones de email no distinguen mayúsculas de forma fiable). **Sólo
   cambia el Reply-To**: el remitente (From) sigue siendo el de siempre
   (el nombre de la agencia con la dirección de la plataforma,
   `Agencia <info@serendipiaagency.com>`, o su dominio verificado —
   `server/utils/email/orgSender.ts`); nunca se envía como
   otra dirección. La dirección queda en `email_log.reply_to`, así que un
   reintento de la cola sale con la misma. **Sin las dos variables (o con un
   secreto de menos de 32 caracteres) no cambia nada**: el Reply-To es el de la
   agencia, exactamente como antes, y el redactor del hilo dice que la
   respuesta llegará a ese buzón y no al hilo.
2. **Recepción.** Cloudflare Email Routing entrega el correo al Worker
   (manejador `email`). Con el preset `cloudflare_module`, Nitro lo pasa al hook
   `cloudflare:email`, que escucha `server/plugins/inbound-email.ts` (un plugin,
   no una ruta HTTP: desde fuera sólo se llega por Email Routing). El trabajo está
   en `handleInboundEmail()` (`server/utils/comms/inboundEmail.ts`, sin H3).
3. **Verificación.** Del destinatario del **sobre** (`message.to`, no la
   cabecera To): formato `respuestas+…`, dominio = `INBOUND_EMAIL_DOMAIN`,
   firma comparada en tiempo constante, y el hilo se busca por id **y**
   `organization_id`. Si cualquier cosa falla —firma mala o manipulada, hilo de
   otra agencia, hilo que no existe, email entrante sin configurar— se rechaza
   con `message.setReject()` y **siempre la misma razón genérica** («Esta
   direccion no acepta mensajes.»), sin decir cuál falló. Las razones van en
   ASCII porque viajan en la respuesta SMTP.
4. **Lectura.** Correo de más de 10 MB → rechazo («demasiado grande»; Email
   Routing admite 25 MiB, pero los adjuntos no se guardan y no merece la pena
   leerlos). El MIME lo lee `postal-mime` (dependencia nueva, MIT-0, sin
   dependencias propias; la misma librería que usa el simulador de email de
   Wrangler): multipart, quoted-printable, base64, charsets y asuntos
   codificados. Se usa el texto plano; si sólo hay HTML, se pasa a texto
   cortando antes de la cita (`gmail_quote`, `divRplyFwdMsg`/`appendonsend` de
   Outlook, `moz-cite-prefix`, `yahoo_quoted`, `<blockquote>`).
5. **Sin la cita.** `stripQuotedReply()` corta en la línea «El … escribió:» /
   «On … wrote:» (también partida en dos líneas, como hace Gmail), en el bloque
   «De: / Enviado: / Asunto:» de Outlook, en «-----Mensaje original-----» o en
   un bloque FINAL de líneas con «>». Una respuesta intercalada se deja entera,
   y si quitar la cita dejara el mensaje vacío se guarda el texto completo. Se
   acota a 5000 caracteres (lo mismo que un formulario), avisando si se recortó.
6. **Al hilo.** `appendInboundEmailMessage()` (`web.ts`) guarda el mensaje con
   asunto, remitente (la cabecera From, sólo informativa: lo que autoriza es la
   dirección firmada) y, si los traía, la lista de adjuntos; el hilo se reabre
   si estaba cerrado, pasa a último mensaje y suma un no leído en la bandeja.
7. **Efectos**, como un mensaje entrante del chat o de WhatsApp:
   - `leads.last_contact_at` del lead del hilo (si no está en la papelera): la
     última interacción real, lo mismo que hace `upsertLead()` cuando la persona
     vuelve a escribir por un formulario; cierra «sin contacto X días» en el
     siguiente repaso del SLA. **No** `markLeadContacted()`: eso es el primer
     contacto / primera respuesta humana DE LA AGENCIA, y aquí escribe el cliente.
   - Activity `EMAIL_REPLY_RECEIVED` (`comms_web_message`, actor `contact`), sin
     el texto en `metadata`: sólo el hilo y cuántos adjuntos no se guardaron.
   - Lead Score: «Respondió recientemente» cuenta la respuesta por email
     (`lastInboundKind = 'email'`, docs/lead-score.md). Sólo email: un mensaje
     del chat web sigue sin contar, como antes.
   - Automatizaciones: ningún disparador escucha mensajes entrantes
     (`utils/automationCatalog.ts`), así que no hay nada más que avisar.

**Adjuntos: no se guardan.** La dirección firmada autentica el HILO, no a la
persona: cualquiera a quien se reenvíe el email puede escribir en él. Guardar
sin revisión en el R2 de la agencia lo que adjunte cualquiera (DNI, nóminas…
o un ejecutable) sería almacenar datos personales y posibles programas
maliciosos que nadie ha pedido. El mensaje del hilo dice qué traía (nombre,
tamaño, y «ejecutable» si lo es) para pedirlo por un canal donde la agencia
decida guardarlo.

**Respuestas automáticas** (fuera de la oficina, `Auto-Submitted`,
`X-Autoreply`, `Precedence: bulk/list/junk`, informes de entrega
`multipart/report`, `MAILER-DAEMON`/`postmaster` o remitente vacío): se aceptan
—rechazarlas provocaría más rebotes— pero no entran en el hilo; queda la fila
de `comms_webhook_events` con la nota.

**Idempotencia y freno.** Cada correo se reclama en `comms_webhook_events`
(`provider = 'email_inbound'`, clave = agencia, hilo y SHA-256 del Message-ID
—o del correo entero si no lo trae—): el mismo correo dos veces entra una. Si
guardar falla, la clave se libera (la fila queda como auditoría del fallo) y se
rechaza con «inténtalo más tarde». Más de 20 respuestas por email a un mismo
hilo en una hora se rechazan (un bucle de respuestas automáticas o alguien con
la dirección).

**Privacidad.** El secreto sólo se usa en `inboundAddress.ts` para firmar y
verificar; nunca sale en una respuesta HTTP, un log, Activity, auditoría ni
`email_log` (la dirección firmada sí está en `email_log.reply_to`: es la del
hilo, no el secreto). El panel sólo sabe si las variables están y son válidas.
La línea de log del Worker dice el resultado y el hilo (`[email entrante]
stored hilo w12`), nunca direcciones, asunto ni texto; la fila de
`comms_webhook_events` guarda hilo, tamaño y número de adjuntos, sin contenido.
Un error de consulta no se copia (su mensaje llevaría el cuerpo del correo en
los parámetros): sólo el de su causa.

**Rotar el secreto** invalida todas las direcciones ya enviadas: una respuesta
a un email antiguo se rechazaría. Hacerlo sólo si se ha filtrado.

**Lo que no se ha podido comprobar aquí.** No hay credenciales de Cloudflare
en el entorno de desarrollo: el circuito se ha probado con MIME real y la
SQLite real (`test/unit/inboundEmail.test.ts`), pero no con un correo real a
través de Email Routing. Y `setReject()` se llama dentro del `waitUntil` en el
que Nitro ejecuta el hook; la documentación de Cloudflare no dice si un rechazo
hecho ahí llega a la respuesta SMTP. Si no llegara, un correo inválido se
descartaría en silencio en lugar de rebotar — nunca entraría en un hilo: la
verificación no depende de eso. La primera respuesta real es la validación
pendiente.

### Qué tiene que hacer el propietario en Cloudflare

Una vez por plataforma (y otra para staging, con otro dominio o subdominio):

1. **Elegir el dominio de respuestas.** Tiene que ser una zona de la cuenta de
   Cloudflare o un subdominio suyo. **Recomendado: un subdominio dedicado**
   (p. ej. `respuestas.<dominio-de-la-plataforma>`): activar Email Routing en el
   dominio raíz cambia sus registros MX, y si ese dominio ya recibe correo
   (p. ej. `info@serendipiaagency.com` en otro proveedor) dejaría de llegarle.
2. **Activar Email Routing.** Panel de Cloudflare → la zona → Email → Email
   Routing (en el panel nuevo: Compute → Email Service → Email Routing) →
   activar. Para un subdominio: Email Routing → Settings → **Subdomains** →
   añadir el subdominio; Cloudflare crea sus registros MX (y el TXT de SPF) en
   ese subdominio. Esperar a que el estado diga que los registros están bien.
3. **Activar «Subaddressing»** en Email Routing → Settings (es lo que hace que
   `respuestas+…@dominio` case con la regla de `respuestas@dominio`).
4. **Regla de enrutado.** Email Routing → Routing rules → Create address:
   dirección `respuestas@<dominio>`, acción **Send to a Worker**, destino el
   Worker `sa-inmobiliaria` (en staging, `sa-inmobiliaria-staging`). En un
   dominio raíz también vale el catch-all → Send to a Worker; en un subdominio
   no: Cloudflare sólo admite el catch-all en el dominio raíz, de ahí la
   subdirección.
5. **Variable y secreto del Worker.**
   - `INBOUND_EMAIL_DOMAIN` = el dominio del paso 1, sin `@` ni `https://`
     (p. ej. `respuestas.serendipiaagency.com`). Es una variable: descomentar la
     línea de ejemplo de `[vars]` en `wrangler.toml` (y en `[env.staging.vars]`
     con el de staging) y desplegar por el pipeline — un `wrangler deploy`
     sustituye las variables puestas a mano en el panel por las de
     `wrangler.toml`. También vale como secreto (`wrangler secret put
     INBOUND_EMAIL_DOMAIN`), que el despliegue no toca.
   - `INBOUND_EMAIL_SECRET`: `wrangler secret put INBOUND_EMAIL_SECRET` (y
     `--env staging`), con 32 caracteres aleatorios o más (p. ej. la salida de
     `openssl rand -hex 32`). Distinto en cada entorno.
6. **Comprobar.** Configuración → Comunicaciones → «Email entrante» pasa a
   «Activo» (y Sistema → Estado del sistema, a ok). Responder por email a un hilo
   web propio con una dirección de prueba, contestar a ese email desde el buzón
   de prueba y ver la respuesta en el hilo, sin la cita. Email Routing →
   Activity log muestra cada entrega al Worker (y los rechazos).

## Permisos y aislamiento

- **Bandeja, hilos, contactos, llamadas, plantillas (lectura)**: área
  **CRM** (`/api/admin/comms/**`).
- **Números, credenciales, ajustes, alta/borrado de plantillas**: área
  **Sistema** (`/api/admin/comms/channels/**`, `/settings`, `POST/DELETE /templates`).
- Marcar leído y el sondeo de cambios quedan a nivel de lectura de CRM.
- Toda tabla `comms_*` lleva `organization_id` y cada endpoint pasa por
  `requireOrgScope()`; un id de otra agencia es 404, nunca 403.
  `test/unit/tenantScopeCoverage.test.ts` exime los cuatro webhooks con el
  motivo escrito y exige que sigan verificando la firma.
- `(provider, external_phone_id)` es único en toda la plataforma: un mismo
  número no puede estar conectado en dos agencias.

**No se ha tocado la matriz de áreas ni `requireOrgScope()`**: sólo se han
añadido reglas nuevas a `server/utils/adminRouteMatrix.ts`.

## Privacidad

- Sin grabación de llamadas y sin transcripción, por construcción.
- Los medios entrantes se guardan como `media_assets` privados del
  inquilino (sólo administradores de esa organización, por `/api/media`).
- Los tokens no salen del servidor y no se registran en logs; en la base
  están cifrados; *Estado del sistema* sólo dice si el secreto existe.
- El `payload_json` de `comms_webhook_events` guarda el evento tal cual
  (recortado a 16 KB) para poder auditar un fallo; es dato del inquilino.

## Datos

Migración `0065_communications_center.sql` — aditiva, sólo tablas nuevas:
`comms_settings`, `comms_channels`, `comms_contacts`, `comms_conversations`,
`comms_messages`, `comms_calls`, `comms_templates`, `comms_webhook_events`.
Ninguna fila existente cambia. Esquema en `server/db/schema.ts`.

Migración `0087_comunicaciones_web_y_aperturas.sql` (núcleo N8a, aditiva) —
tablas nuevas `comms_web_threads`, `comms_web_messages` y
`property_share_links`; columnas `comms_conversations.crm_contact_id` (NULL en
las filas existentes), `comms_settings.web_chat_enabled` (0: el chat queda
apagado en todas las agencias) y `comms_settings.web_chat_greeting`. Ninguna
fila existente se reescribe.

Migración `0082_comms_property_kind_and_message_timestamps.sql` (FASE 29,
aditiva) — añade `property_kind` (`TEXT`, `'agent' | 'developer'`) a
`comms_conversations`, `comms_messages` y `comms_calls`, y `sent_at`,
`delivered_at`, `read_at` (`TEXT`) a `comms_messages`. Ninguna fila
existente se reescribe: `property_kind` queda `NULL` en las filas antiguas
y el código lo interpreta como `'developer'` (lo único que existía antes de
esta migración), y los tres timestamps nuevos quedan `NULL` hasta el
próximo cambio de estado de cada mensaje.

### Simulador del proveedor en la suite e2e

`scripts/e2e.sh` arranca `scripts/e2e-provider-mock.mjs`, un servidor HTTP
local que imita `POST /<versión>/<PHONE_NUMBER_ID>/messages` de la Graph API
(devuelve un `wamid.e2e.*`) y expone `GET /__requests` con todo lo
recibido. El Worker de `wrangler dev` lo usa porque recibe
`WHATSAPP_GRAPH_BASE_URL=http://127.0.0.1:8799`, y `graphBase()` **sólo
respeta esa variable si apunta a loopback por http** (`127.0.0.1`,
`localhost`, `[::1]`): cualquier otro valor se ignora y se sigue usando
`https://graph.facebook.com`, así que una variable mal puesta en producción
nunca puede desviar mensajes ni el token de acceso a otro host (probado en
`test/unit/comms.metaCloud.test.ts`).

Con él, el E2E principal de FASES 25-29
(`tests/e2e/principal-flow-fase25-29.spec.ts`) recorre un envío real de
punta a punta — «Enviar propiedad» desde Compatibilidades, mensaje
`property_share` aceptado, PropertyMatch en `sent`, `PROPERTY_SENT` en
Activity y la conversación en la ficha del Contacto — y comprueba el cuerpo
exacto que habría recibido Meta: ningún campo interno (referencias de
agencia/externas) sale en el mensaje (§125).

## Piezas

| Pieza | Fichero |
| --- | --- |
| Tipos, teléfonos, matriz de capacidades | `server/utils/comms/{types,phone}.ts`, `providers/registry.ts` |
| Meta Cloud API (envío, medios, plantillas, llamadas, firma, parser) | `server/utils/comms/providers/metaCloud.ts` |
| Twilio (envío, medios, parser) | `server/utils/comms/providers/twilio.ts` (+ firma en `server/utils/whatsapp.ts`) |
| Credenciales cifradas y enrutado de canales | `server/utils/comms/credentials.ts` |
| Bandeja: contactos, conversaciones, envío, ventana, consentimiento | `server/utils/comms/inbox.ts`, `matching.ts` |
| Idempotencia de webhooks | `server/utils/comms/ingest.ts` |
| Llamadas | `server/utils/comms/calls.ts` |
| Medios entrantes | `server/utils/comms/media.ts` |
| Compartir propiedad (dos catálogos) | `server/utils/comms/admin.ts` (`buildPropertyShare`), `server/utils/propertyPrivacy.ts` (`toPublicProperty`), `server/utils/properties/searchService.ts` (`searchPropertiesCompact`) |
| Comunicaciones de una persona (contacto, cliente, operación) | `server/utils/comms/related.ts`, `components/admin/comms/RelatedCommunications.vue` |
| Comunicaciones de una propiedad | `components/property-builder/PropertyCommunications.vue` |
| Propiedad ↔ Compatibilidades (envío marca el match) | `server/utils/matching/service.ts` (`markMatchSent`), `pages/admin/compatibilidades.vue` |
| Webhooks | `server/api/comms/webhooks/{meta.get,meta.post}.ts`, `twilio/{inbound,status}.post.ts` |
| API del panel | `server/api/admin/comms/**` |
| Interfaz | `pages/admin/comunicaciones/{index,configuracion}.vue`, `components/admin/comms/*`, `composables/{useComms,useVoiceManager}.ts` |
| Formularios y chat web (hilos, respuesta, enlaces personales) | `server/utils/comms/{web,webPublic,shareLinks}.ts`, `components/admin/comms/{WebComposer,WebMessageBubble,WebThreadPanel}.vue`, `components/WebChatWidget.vue` |
| Email entrante (dirección firmada, recepción, MIME, entrada al hilo) | `server/utils/comms/{inboundAddress,inboundEmail}.ts`, `server/plugins/inbound-email.ts`, estado en `GET /api/admin/comms/channels` (`inboundEmail`) |
| Pruebas | `test/unit/comms.*.test.ts`, `test/unit/nucleoN8a.test.ts`, `test/unit/inboundEmail.test.ts`, `tests/e2e/comms.spec.ts`, `tests/e2e/nucleo-n8a.spec.ts`, `tests/e2e/cierre-d4e.spec.ts`, `tests/e2e/principal-flow-fase25-29.spec.ts` (+ simulador `scripts/e2e-provider-mock.mjs`) |
| Ayuda in-app | `/admin/ayuda` → CRM → Comunicaciones |

## Qué falta para tenerlo del todo en producción

1. `COMMS_CREDENTIALS_ENCRYPTION_KEY` en el Worker (secreto).
2. Aplicar la migración `0065` en la D1 de producción (con las anteriores
   pendientes, si las hay) — el pipeline no lo hace mientras
   `production-preflight` falle por `PRODUCTION_URL`.
3. Un número real de Meta (o Twilio) conectado desde Configuración →
   Comunicaciones, con su webhook registrado.
4. Para llamadas: un número de Meta con Calling activo; la primera llamada
   real es la validación pendiente.
5. Para formularios y chat web (núcleo N8a): la migración `0087` aplicada; el
   chat se activa por agencia en Configuración → Comunicaciones; responder por
   email exige `RESEND_API_KEY` (sin él, el redactor lo dice y no envía).
6. Para el email entrante (FASE 29, sin migración): Email Routing en Cloudflare
   con la regla `respuestas@<dominio>` → Worker, «Subaddressing» activado,
   `INBOUND_EMAIL_DOMAIN` y el secreto `INBOUND_EMAIL_SECRET` (pasos en «Email
   entrante → Qué tiene que hacer el propietario en Cloudflare»).
