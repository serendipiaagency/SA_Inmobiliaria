# Plantilla maestra de los emails de Portal INMO

Todos los emails **propios** de Portal INMO salen con la misma plantilla y el
mismo remitente:

```
Portal INMO <info@serendipiaagency.com>
```

La plantilla reproduce la referencia visual aprobada (dos capturas: la parte
superior y la inferior del mismo email). No es una interpretación: medidas,
colores y tipos se tomaron de las capturas píxel a píxel y el render se
comparó con ellas (ver «Fidelidad»).

## Qué emails la usan

`render.ts` decide por template: los que declaran `master` son de Portal INMO;
los que declaran `body` son de la agencia a sus clientes.

| Clase | Templates | Plantilla | Remitente |
|---|---|---|---|
| Alta y estado de empresas | `company_registration_welcome`, `admin_company_registered`, `company_admin_invite`, `company_status_changed`, `company_deactivated`, `admin_company_status_changed`, `company_approved`, `company_pending` | maestra | Portal INMO |
| Cuenta y seguridad | `user_welcome`, `password_reset` | maestra | Portal INMO |
| Avisos de la web de una agencia | `domain_check_failed`, `domain_check_recovered` | maestra | Portal INMO |
| Avisos internos al equipo de una agencia | `lead_created`, `contact_message`, `complaint`, `contract_accepted`, `whatsapp_message_received` | maestra | Portal INMO |
| De la agencia a SUS clientes | `appointment_*`, `contract_sent`, `deposit_received`, `payment_failed`, `saved_search_alert`, `web_thread_reply` | la de la agencia (`layout.ts`) | la agencia (`orgSender.ts`) |

Los emails que entran en la plataforma (respuestas de clientes, conversaciones
externas) no se tocan: se guardan tal cual llegan.

## Arquitectura

```
evento (alta, lead, cita…)
  → sendPlatformEmail / sendTransactionalEmail / sendInternalNotification  (platform.ts, send.ts)
  → renderTemplateEmail  (render.ts)
      ├─ template.master(data) → contenido → renderMasterEmail  (master.ts)
      └─ template.body(data)   → renderEmailLayout              (layout.ts, agencias)
  → email_log + attemptSend → Resend  (send.ts; reintentos en retry-email-queue)
```

- **Contenido ≠ presentación.** Un template de Portal INMO sólo devuelve su
  contenido: `eyebrow`, `title` (con `\n` para los saltos), `greetingName`,
  `paragraphs`, `details`, `cta` (`label` + `url`) y `footnote`. La cabecera,
  la firma, el bloque «¿Hablamos?» y el pie son siempre los mismos.
- **Tokens centralizados** en `PORTAL_INMO_EMAIL` (`master.ts`): colores,
  ancho, márgenes, radio, tipografía, marca y pie. Cambiarlos cambia todos los
  emails a la vez.
- **Saludo:** «Hola, {nombre}:» con el nombre que trae el aviso o, si no, el de
  la cuenta de esa dirección (`recipientNames`). Sin nombre, «Hola:»; nunca
  `undefined`, `null`, `{{nombre}}` ni «Hola, :».
- **Botón:** sólo si la URL es `http(s)`. Las URLs salen de `PLATFORM_BASE_URL`
  o del origen real de la petición (`links.ts`), nunca de un `localhost` fijo.
  Las tareas programadas sin petición sólo ponen botón con
  `PLATFORM_BASE_URL`.
- **Texto plano:** `attemptSend` envía también `text` (derivado del HTML con
  `htmlToText`): contenido, botón como URL, contacto y pie.
- **HTML de email:** tablas, estilos en línea y una sola regla `@media` para el
  móvil. Sin imágenes, scripts, iframes, formularios ni seguimiento.
  `color-scheme: light` para que los clientes con modo oscuro no inviertan los
  colores de forma destructiva.

## Medidas (de la referencia)

| Elemento | Valor |
|---|---|
| Fondo exterior | `#EDF0EB` |
| Contenedor | 600 px, radio 16 px, márgenes laterales 40 px |
| Cabecera | `#172C22`; «Portal» blanco + «INMO» `#EE856E`, Arial 30 px negrita; lema «TU ESPACIO / INMOBILIARIO» 10,5 px `#B8CBBB` |
| Línea de la cabecera | 3 px: 70 px `#E4765F` + resto `#365043` |
| Antetítulo | 11 px negrita, mayúsculas, interletrado 1,9 px, `#BA513C` |
| Título | 38/41 px negrita, interletrado −1,7 px, `#172C22` |
| Saludo y cuerpo | 16/27 px; saludo negrita `#172C22`, texto `#536057` |
| Botón | `#CC553F`, texto blanco 16 px negrita, 16 × 28 px de relleno, radio 8 px |
| Separador | 1 px `#E4E9E1` |
| Firma | 15 px: «Seguimos a tu lado.» `#74806F` + «El equipo de Portal INMO» negrita |
| Bloque de contacto | `#E4EBDF`; «¿Hablamos?» 16 px negrita `#263E2C`; texto 14 px `#5D6E58`; correo subrayado |
| Pie (fuera del contenedor) | 12 px `#7A8576`: «PORTAL INMO · GESTIÓN INMOBILIARIA» y «Este correo se ha generado desde la plataforma.» |

## Fidelidad

El render se midió con Chromium a la escala de cada captura (93,75 % y 125 %)
contra las referencias: posición vertical y ancho de cada línea de texto,
botón, separador, bloque de contacto y pie. Todo queda a ±2 px; los anchos de
texto coinciden a ±1 px. En móvil (≤ 620 px) el contenedor ocupa el ancho, los
márgenes bajan a 24 px y el título a 30 px; la estructura no cambia.

## Remitente

- `PLATFORM_EMAIL_FROM_NAME` (por defecto «Portal INMO»),
  `PLATFORM_EMAIL_FROM_ADDRESS` (por defecto `info@serendipiaagency.com`),
  `PLATFORM_EMAIL_REPLY_TO` (independiente; por defecto la misma) y
  `PLATFORM_EMAIL_CONTACT` (el del bloque «¿Hablamos?»; por defecto la misma).
  Ningún template lleva una dirección escrita.
- Si Resend no acepta el remitente, el envío queda en cola con el error y se
  reintenta: **nunca** se cambia por otra dirección ni se finge el envío.

### Estado del dominio (consulta DNS pública, 7-oct-2026)

| Registro | Estado |
|---|---|
| DKIM `resend._domainkey.serendipiaagency.com` | presente |
| SPF `send.serendipiaagency.com` (`include:amazonses.com`) y MX de retorno | presentes |
| `resend-domain-verification` en `serendipiaagency.com` | presente |
| DMARC `_dmarc.serendipiaagency.com` | **hay DOS registros** (`v=DMARC1; p=none; rua=…` y `v=DMARC1; p=none;`). Con dos, los receptores ignoran la política. Hay que dejar uno solo, en el DNS de serendipiaagency.com |

Que el dominio figure como «Verified» en la cuenta de Resend sólo se puede
confirmar con su clave (Resend → Domains). Comprobación de punta a punta:
Sistemas › Emails › «Enviarme una prueba» (abajo) y mirar la fila en el
historial: «Enviado» y, tras el webhook, «Entregado».

## Vista previa y prueba

Sistemas › Emails › «Plantilla de los emails de Portal INMO» (sólo super
admin):

- cada email propio con **datos de ejemplo**, en escritorio y móvil, en
  español o inglés, con su remitente y asunto;
- la vista previa no envía nada (`GET /api/admin/saas/email-health?view=preview`);
- «Enviarme una prueba» (`POST /api/admin/saas/settings`, `section:
  'email-preview'`) manda esa plantilla sólo al correo del propio super admin,
  queda en `email_log` y en la auditoría. Desde la cuenta demo no sale nada.

## Pruebas

- `test/unit/emailMaster.test.ts`:
  - misma maqueta en todos los emails propios y contenido de la referencia;
  - saludo sin huecos, botón sólo con `http(s)`, escapado de lo que escribe
    un cliente y textos largos;
  - ninguna contraseña, hash ni `localhost`, y texto plano completo;
  - remitente central incluso con dominio propio de la agencia, y los emails a
    clientes sin tocar.
- `test/unit/platformEmail.test.ts`: remitente y responder-a, idempotencia y
  un proveedor que rechaza.
