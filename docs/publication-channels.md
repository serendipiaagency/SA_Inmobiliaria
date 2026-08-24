# Publicación multicanal — inventario de canales

Estado real a fecha de esta entrega. Ningún canal tiene una integración
real: todos resuelven al adaptador compartido "no implementado"
(`server/utils/publication/adapters/notImplemented.ts`), registrado por
`server/utils/publication/adapters/registry.ts`. La columna **Implementado**
en este documento es literalmente el valor de `implemented` en
`server/utils/publication/channels.ts` — si cambia aquí, tiene que cambiar
allí también, y viceversa.

**Por qué ninguno está implementado todavía**: implementar un canal real
significa hacer una petición HTTP real a la API de ese proveedor. Eso exige
tener su documentación oficial de API y credenciales de acceso válidas para
poder desarrollar y probar contra ella. Ninguno de los 18 canales de este
catálogo tiene eso disponible en este momento — así que, siguiendo la
instrucción explícita de no inventar endpoints ni contratos de terceros,
cada uno queda honestamente bloqueado (`not_implemented`) hasta que exista.

| Canal | Clave | Tipo | Estado | Qué falta para implementarlo de verdad |
|---|---|---|---|---|
| Marketplace propio | `marketplace` | Interno | Pendiente | Decisión de producto: qué significa "publicar" aquí (¿un flag de visibilidad en `developer_properties`? ¿un feed propio?) — no hay ambigüedad de API externa, pero sí de alcance/requisitos, así que no se ha inventado un comportamiento sin especificar. |
| Web propia | `own_web` | Interno | Pendiente | Mismo caso que Marketplace propio — es el candidato más realista a implementarse primero (no depende de ningún tercero), pero necesita que el negocio defina qué acción concreta dispara. |
| Idealista | `idealista` | Portal | Bloqueado | Alta como partner/agencia en Idealista, acceso a su API de publicación (feed XML o API REST), credenciales de API. |
| Fotocasa | `fotocasa` | Portal | Bloqueado | Alta como partner en el grupo Adevinta (Fotocasa/Habitaclia), acceso a su API, credenciales. |
| Habitaclia | `habitaclia` | Portal | Bloqueado | Mismo grupo/API que Fotocasa (Adevinta) — mismos requisitos. |
| Yaencontre | `yaencontre` | Portal | Bloqueado | Alta como partner, documentación de su API de feeds/publicación, credenciales. |
| Pisos.com | `pisoscom` | Portal | Bloqueado | Alta como partner, documentación de su API, credenciales. |
| Kyero | `kyero` | Portal | Bloqueado | Alta como partner (suele ser vía feed XML), documentación del formato, credenciales/FTP de entrega. |
| JamesEdition | `jamesedition` | Portal | Bloqueado | Alta como partner de lujo, documentación de su API o proceso de feed, credenciales. |
| Rightmove | `rightmove` | Portal | Bloqueado | Alta como agencia ADF (Agency Data Feed) en Rightmove, especificación de su feed/API, credenciales. |
| Google Business | `google_business` | Social | Bloqueado | Cuenta de Google Business Profile de la organización, OAuth/API de Google Business Profile, credenciales por tenant (candidato natural a `publication_channel_credentials`, ver más abajo). |
| Facebook | `facebook` | Social | Bloqueado | App de Meta, permisos de la Graph API para páginas/catálogos, token por tenant. |
| Instagram | `instagram` | Social | Bloqueado | Mismo ecosistema que Facebook (Graph API de Meta), token por tenant. |
| LinkedIn | `linkedin` | Social | Bloqueado | App de LinkedIn, acceso a su API de publicación de páginas de empresa, token por tenant. |
| Pinterest | `pinterest` | Social | Bloqueado | App de Pinterest, acceso a su API, token por tenant. |
| TikTok | `tiktok` | Social | Bloqueado | Acceso a la API de TikTok for Business, token por tenant. |
| Newsletter | `newsletter` | Mensajería | Bloqueado | Depende del proveedor de email transaccional/marketing elegido para esto (ver Prompt 8, Resend) — no es lo mismo que un email transaccional individual, es un envío masivo con su propia lista/segmentación. |
| WhatsApp | `whatsapp` | Mensajería | Bloqueado | Cuenta de WhatsApp Business API (Meta o un BSP como Twilio), plantillas de mensaje aprobadas, credenciales. |
| Telegram | `telegram` | Mensajería | Bloqueado | Bot de Telegram por organización (más sencillo que el resto — no requiere revisión de plataforma), token de bot. |

## Arquitectura para cuando exista un canal real

1. `server/utils/publication/adapters/<canal>.ts` implementando la interfaz
   `ChannelAdapter` (`adapters/types.ts`): `validateCredentials`, `publish`,
   `updateText`, `updateImages`, `unpublish`, `getStatus`. Cada método
   real hace la petición HTTP de verdad y devuelve un `PublishResult` con
   el `externalId`/`externalUrl` reales que el proveedor confirme — nunca
   inventados.
2. Registrarlo en `adapters/registry.ts` (sustituye la entrada del stub).
3. Cambiar `implemented: false` a `true` en `channels.ts` para ese canal —
   y en la tabla de arriba, a la vez.
4. Si la credencial es global (un único acceso de la plataforma para todos
   los tenants): secreto de Worker, mismo patrón que ya usan los 18 canales
   (`secretEnvVar` en `channels.ts`, `wrangler secret put`).
5. Si la credencial es propia de cada inmobiliaria (el caso más probable
   para redes sociales — cada organización tiene su propia página de
   Facebook, su propio bot de Telegram, etc.): usar
   `server/utils/publication/credentials.ts`
   (`saveChannelCredential`/`getChannelCredential`), que ya cifra en reposo
   con AES-GCM en la tabla `publication_channel_credentials` — el
   orquestador (`adapters.ts`) ya la consulta antes de caer al secreto
   global, así que un adaptador real no necesita saber de dónde vino la
   credencial descifrada, solo recibirla en `ctx.credential`.
6. Nada más en el sistema (dispatcher, creación de programaciones, UI)
   necesita cambiar — están escritos contra la interfaz, no contra ningún
   canal concreto.
