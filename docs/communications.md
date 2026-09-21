# Centro de Comunicaciones (WhatsApp Business + llamadas)

Bandeja de WhatsApp por agencia dentro del panel (`/admin/comunicaciones`):
recibir y responder mensajes, compartir propiedades con su enlace público,
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

### Actividad 360º

`comms_contacts.client_id` es un vínculo guardado de verdad (a diferencia
del resto del histórico del cliente, que se cruza por email/nombre). La
ficha del cliente (`/admin/clientes/:id`) muestra sus conversaciones y
llamadas en la pestaña «Comunicaciones» y en la cronología («WhatsApp
recibido/enviado», «Llamada realizada/recibida»), con enlace al hilo.

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
| Webhooks | `server/api/comms/webhooks/{meta.get,meta.post}.ts`, `twilio/{inbound,status}.post.ts` |
| API del panel | `server/api/admin/comms/**` |
| Interfaz | `pages/admin/comunicaciones/{index,configuracion}.vue`, `components/admin/comms/*`, `composables/{useComms,useVoiceManager}.ts` |
| Pruebas | `test/unit/comms.*.test.ts`, `tests/e2e/comms.spec.ts` |
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
