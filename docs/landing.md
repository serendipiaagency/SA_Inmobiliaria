# Landing comercial de INMO

La raíz del dominio principal (`/`, `pages/index.vue`) es la landing comercial
de la plataforma: la página que vende INMO a las inmobiliarias. En un dominio
de cliente esa misma ruta sirve la portada de su web (`isPortal`), como
siempre; lo que cambia aquí es la rama del host principal.

## Regla de oro: sólo lo que la plataforma hace de verdad

Todo el texto vive en `utils/landing.ts` y las secciones de
`components/landing/*` lo pintan. Nada de clientes, cifras, premios ni
capacidades inventadas; lo que no está terminado lleva su estado. La prueba
`test/unit/landing.test.ts` vigila que no vuelvan las promesas retiradas
(`LANDING_FORBIDDEN_CLAIMS`: Mapbox, Idealista, «6 canales», «gratis»,
«sin tarjeta», «migramos tu catálogo»…), que no haya precios ni cifras de
clientes y que cada enlace del menú apunte a una sección que existe.

Estado real de lo que la landing afirma (verificado contra el código al
escribirla, 2026-10):

| Afirmación | Dónde está | Estado |
| --- | --- | --- |
| Constructor Web visual, publicar, propiedades conectadas | `pages/admin/site-builder`, `components/site-builder/*` | Disponible |
| CRM: leads, contactos, asignación, reglas de reparto | `pages/admin/leads`, `server/utils/leads/*`, Enrutamiento | Disponible |
| Agenda de visitas y citas | `pages/admin/visitas`, `server/utils/appointments*` | Disponible |
| Ofertas y operaciones | `pages/admin/ofertas`, `pages/admin/deal-operations` | Disponible |
| Compatibilidades (matching) | `pages/admin/compatibilidades` | Disponible |
| Prioridad de cada lead (score explicable) | `server/utils/leadScore*` | Disponible |
| Análisis comercial (embudo, rendimiento) | `pages/admin/rendimiento`, `commercial-dashboard` | Disponible |
| Asistente INMO | `pages/admin/inmo.vue` | Con IA activada (la inmobiliaria configura su proveedor) |
| Automatizaciones | `pages/admin/automatizaciones.vue` | Disponible |
| Publicación en portales | `server/utils/publication/channels.ts` | Próximamente: el programador existe, los canales no están conectados |
| Registro de empresa inmediato | `pages/registro-empresa.vue` | Disponible (cuenta activa al momento) |
| Dominio propio | `docs/dominio.md` | Se activa con el equipo, no es autoservicio |
| Importar propiedades/contactos desde archivo | — | No existe: se dice en la FAQ |
| Planes y precios | — | No publicados: «consultar condiciones» |

La demo **no** es un acceso público a la cuenta de demostración: es una
solicitud (ver abajo).

## Estructura

Orden de las secciones, cada una un componente de `components/landing/`:

1. `LpHeader` — fija, se vuelve sólida al bajar; menú (Producto, Constructor
   Web, CRM, Funcionalidades, Cómo funciona), «Iniciar sesión» (`/admin/login`),
   «Solicitar demo» (`#solicitar-demo`) y «Crear mi inmobiliaria»
   (`/registro-empresa`, el flujo real). Menú móvil con las mismas acciones.
2. `LpHero` — «LA NUEVA FORMA DE GESTIONAR TU INMOBILIARIA» / «Tu
   inmobiliaria, toda conectada.» / subtítulo / «Crear mi inmobiliaria» y
   «Ver demo»; a la derecha la captura real del panel con cuatro tarjetas
   marcadas como «Ejemplo».
3. `LpModules` (`#producto`) — seis tarjetas, una por módulo real.
4. `LpBuilder` (`#constructor-web`) — beneficios y pestañas Editor | Web
   publicada (capturas `constructor` y `web-portada`).
5. `LpCrm` (`#crm`) — captura de leads y microdemo del recorrido de una
   consulta (cinco pasos; avanza solo, se para con el ratón, respeta
   «reducir movimiento»).
6. `LpProperties` (`#propiedades`) — pestañas Panel de gestión | Ficha pública.
7. `LpIntelligence` (`#inteligencia`) — seis capacidades con su estado real
   (Disponible / Con IA activada / Próximamente).
7b. `LpFeatures` (`#funcionalidades`) — inventario completo de la plataforma
   por áreas (web y marketing, propiedades, CRM, agenda y operaciones,
   comunicaciones, equipo, inteligencia, datos), cada punto una pantalla real
   del panel, con estado (Disponible / Con IA activada / Con proveedor
   configurado / Próximamente).
8. `LpHowItWorks` (`#como-funciona`) — línea de tiempo de seis pasos; cada
   paso enseña la pantalla real en la que ocurre.
9. `LpDemo` (`#demo` y `#solicitar-demo`) — la web de la demo (escritorio y
   móvil) y el bloque de solicitud: «Empieza por una conversación», tres
   pasos (entendemos tu operación, demo con contexto, ruta de implantación),
   firma de Serendipia Agency y el formulario con cabecera «Demo
   personalizada», sin promesas falsas («sin tarjeta» no se dice porque no
   hay cobro alguno que evitar).
10. `LpAccess` (`#planes`) — «Planes y acceso» sin precios: cómo se empieza,
    qué incluye, condiciones bajo consulta.
11. `LpFaq` (`#faq`) — diez preguntas con respuestas honestas (`<details>`).
12. `LpFinal` — CTA final sobre fondo oscuro.
13. `LpFooter` — pie de INMO (producto, acceso, contacto, legal). No es el
    pie de ninguna inmobiliaria.

Tokens visuales (sin ámbito, en `pages/index.vue`): verde petróleo
`--lp-ink #172c22`, blanco cálido `--lp-paper #fbf9f5`, coral `--lp-accent
#cc553f` (los de la plantilla de email «Portal INMO»), Inter, radios 18–20
px, botones redondeados, tarjetas con sombra suave al pasar. Todo responde a
`prefers-reduced-motion`.

La landing antigua `/para-inmobiliarias` (prometía Idealista, migraciones de
catálogo y planes con precio) redirige con 301 a `/`
(`server/middleware/00.legacy-demo-redirect.ts`).

## Capturas reales (nunca pantallas inventadas)

`LANDING_SHOTS` referencia diez archivos de `public/landing/*.webp`, servidos
desde el propio dominio (la CSP sólo admite imágenes propias). Se generan con
`scripts/capturas-landing.mjs` desde la **cuenta de demostración** («Norte
Astur Inmobiliaria», datos sintéticos) en un servidor local:

```
E2E_RUN='node scripts/capturas-landing.mjs' bash scripts/e2e.sh
```

`scripts/e2e.sh` construye la app, levanta una D1 limpia y `wrangler dev`, y
con `E2E_RUN` ejecuta ese comando en vez de la suite. El script entra como
super admin del arranque local, crea la demo (`demo-create` / `demo-advance`),
entra como su gerente y fotografía a 1440×900 (@2x, reducido a 2000 px de
ancho) el panel, el CRM, el editor de una propiedad, la agenda, las
operaciones, el Constructor Web y, en vista previa, la portada, una ficha y el
contacto de la web pública; la portada también a 390×844 para el móvil.
Nunca contra producción: las credenciales son las del arranque local.

Si falta un archivo, `LpShot` enseña el hueco con el texto de lo que debería
ir («Captura pendiente: …», `data-testid="landing-shot-missing"`) y
`test/unit/landing.test.ts` falla: las capturas forman parte del código.

Las capturas se regeneran cuando cambie de forma visible lo que enseñan; no
hace falta por cada cambio del panel.

Dos cosas que las capturas sacaron a la luz (2026-10):

- El panel de la cuenta demo enseñaba una alerta roja «Hay emails que no
  están saliendo»: los envíos que la demo bloquea a propósito (`provider:
  'none'`, `server/utils/email/send.ts`) contaban como caída del canal en
  `GET /api/admin/saas/email-health`. Ahora ese endpoint los excluye, como ya
  pretendía el comentario del guard: no son un fallo del canal.
- La ficha pública (`/propiedades/<slug>`) es la del catálogo de la web
  (promociones, `developer_properties`); una propiedad de 2ª mano no tiene
  ficha pública todavía (la FAQ lo dice). Su 404 se pinta con la marca de la
  empresa del dominio principal aunque haya vista previa activa: es un detalle
  de la página de error, apuntado y pendiente.

## Solicitud de demo

`POST /api/public/demo-request` (`server/api/public/demo-request.post.ts`):

- Guarda la solicitud en `platform_demo_requests` (migración 0094,
  `server/utils/demoRequests.ts`): nombre, correo, inmobiliaria, teléfono
  (opcional), tamaño del equipo e interés (listas cerradas,
  `LANDING_DEMO_FORM`), mensaje, idioma, consentimiento con su fecha. Es una
  tabla **de la plataforma**: sin `organization_id`, sin lead en ningún CRM.
- Confirma por correo a quien la pidió (`demo_request_received`) y avisa a los
  super admins (`admin_demo_requested`, `platformAdminRecipients`), los dos con
  la identidad de Portal INMO (`sendPlatformEmail`). Si el correo falla, la
  solicitud queda guardada igual y la respuesta lo dice
  (`confirmationEmail: sent | queued | failed | not_configured`).
- Protección: `rateLimit('demo-request', 5/10 min por IP)`, cuerpo ≤ 16 KB,
  campo trampa `website`, consentimiento obligatorio (422 si no),
  `submissionId` + `claimOnce` contra el doble clic.

Bandeja: Sistema → **Solicitudes de demo** (`pages/admin/solicitudes-demo.vue`,
sólo super admin: `/^demo-requests(?:\/|$)/` → `super-admin` en
`adminRouteMatrix.ts`). Filtros por estado con recuentos, búsqueda, cambio de
estado (Nueva / Contactada / Cerrada), notas internas y borrado a petición
de la persona; cada cambio queda en la auditoría.

## SEO y rendimiento

- `useHead`: `lang="es"`, título «INMO — Tu inmobiliaria, toda conectada»,
  descripción, Open Graph y Twitter con la captura del panel, canónica en el
  host principal, JSON-LD `SoftwareApplication` (sin precio: «bajo consulta»)
  y `FAQPage` con las diez preguntas.
- Un único `h1`; secciones con `id` y títulos `h2`; pestañas con `role=tablist`
  y teclado; FAQ con `<details>`; todas las imágenes con `alt`, `width` y
  `height`; sólo la captura del hero es `eager`/`fetchpriority=high`, el resto
  `lazy`.
- Sin fuentes ni scripts externos nuevos. Analítica: si la agencia del host
  principal ya carga GA4 con consentimiento (`plugins/consent-scripts.client.ts`),
  cada botón con `data-landing-event` envía su nombre al hacer clic; si no, no
  se carga nada.

## Pruebas

- `test/unit/landing.test.ts` — promesas prohibidas, estados, sin precios,
  anclas, acciones reales, capturas existentes, opciones del formulario.
- `test/unit/demoRequests.test.ts` — validación, bandeja, estado/notas, borrado.
- `tests/e2e/landing.spec.ts` — recorrido completo: cabecera y hero, módulos,
  pestañas, microdemo, inteligencia, línea de tiempo, formulario de demo
  (validación, envío real con correo al simulador, campo trampa, duplicado,
  sin consentimiento, límite de tasa), bandeja del super admin (y 403 para
  un admin de empresa), FAQ, CTA final, pie, flujos a registro y login, SEO,
  responsive (móvil y tablet sin desbordes), imágenes, redirección de la
  landing antigua y analítica.

## Limitaciones conocidas

- La web pública de la demo sólo se ve en vista previa (`?vista_previa=<id>`,
  con sesión en esa empresa): la landing enseña capturas, no un enlace vivo.
- No hay planes ni precios publicados: la sección remite a consultar.
- La landing está sólo en español (la plataforma, en seis idiomas): el
  `hreflang` llegará cuando haya versión traducida.
