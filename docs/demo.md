# Cuenta demo comercial «Norte Astur Inmobiliaria»

Inmobiliaria **ficticia** de Asturias con unos seis meses de actividad, para
enseñar Portal INMO a clientes potenciales. Vive en producción como una empresa
más, aislada del resto, y se genera, se repara y se restablece desde el propio
código.

- Empresa: `Norte Astur Inmobiliaria` (slug `norte-astur-inmobiliaria`), EUR,
  Europe/Madrid, español.
- Acceso: la gerente ficticia, Carmen Valdés, entra con **demo@portalinmo**. Es
  **administradora de esa empresa**, nunca super admin: no ve Empresas, Errores
  ni Estado del sistema, ni el selector de empresas.
- La contraseña se guarda con el sistema real de autenticación (PBKDF2, el mismo
  `hashPassword` del login). En el código sólo está su **hash**
  (`DEMO_ADMIN_PASSWORD_HASH_DEFAULT` en `server/demo/dataset/company.ts`); se
  puede sustituir con la variable `DEMO_ADMIN_PASSWORD_HASH`. La contraseña no
  aparece en el código, en los logs, en la auditoría ni en ningún email.

## Qué contiene

Todo es sintético: nombres, emails (`@example.com/.net/.org`, dominios
reservados), teléfonos, empresas, operaciones y documentos. Las localidades son
reales (Oviedo, Gijón, Avilés, Llanes, Ribadesella…), pero las calles son
genéricas y sin número, y la segunda mano se publica con ubicación aproximada.

| Área | Contenido |
|---|---|
| Estructura | 3 oficinas (Oviedo, Gijón, Oriente), 3 equipos, 6 comerciales con foto, 2 promotoras, 7 comunidades, 10 reglas de reparto, SLA, 6 campos personalizados, Brand Kit y logos propios |
| Propiedades | 10 de obra nueva (las de la web) y 10 de segunda mano, con ficha ampliada, datos legales, propietarios, galería con portada y texto alternativo, cambios de precio con motivo, etiquetas |
| CRM | ~54 contactos con foto, 40 leads por su canal real (web, portales, anuncios, redes, teléfono, oficina, referidos), 26 necesidades con compatibilidades calculadas por el motor de matching, selecciones enviadas |
| Agenda | ~47 citas (completadas con su resultado, canceladas con motivo, no presentadas y futuras), 3 tours multi-inmueble, ~42 tareas |
| Negocio | 13 ofertas con su historial de revisiones (oferta, contraoferta, nueva oferta, aceptación/rechazo/retirada/caducidad), 8 operaciones por fases (3 cerradas), 8 reservas, 7 contratos (los aceptados con su PDF), 6 depósitos, 16 facturas |
| Comunicaciones | 7 conversaciones del chat de la web (con respuestas y notas internas), los formularios de la web de los leads, 10 llamadas registradas a mano con su resultado, 10 notas en fichas |
| Web y marketing | Portada del Constructor Web publicada (hero con fotos, propiedades, mapa, comunidades, servicios, equipo, formulario, blog), 4 artículos con portada, 5 documentos de INMO: Conocimiento, programa de referidos, plantillas y piezas del Asset Export, 3 catálogos combinados, 4 automatizaciones internas |
| Analítica | Vistas anónimas a las fichas de obra nueva y `metrics_daily` calculado a partir de los registros (leads, citas, reservas, cobros, visitantes) |

No hay conversaciones de WhatsApp: necesitarían un canal conectado con
credenciales reales, y la demo no las tiene ni debe tenerlas. Tampoco hay
publicación en portales (ningún canal está implementado para enviar) ni
valoraciones guardadas del tasador (las calcula el servicio en directo con las
20 propiedades).

## Cómo se genera

`server/demo/` (fuera de `server/utils/` a propósito: Nitro auto-importa todo lo
de `utils`, y el dataset exporta nombres genéricos).

- **Una historia, no una carga de filas.** `scenario.ts` construye una línea de
  tiempo de ~840 eventos (captar una propiedad, entrar un lead, una visita, una
  contraoferta, el SLA de cada mañana…). Cada evento llama a los **servicios de
  dominio reales** (`createOffer`, `transitionDealStage`, `upsertLead`,
  `createAdminAppointment`, `insertResourceRecord`…) dentro de su fecha con
  `atClock()` (`server/utils/clock.ts`): todo lo que esos servicios fechan con
  `now()` —altas, actividad, historiales, alertas— queda en el escenario.
- **Anclada a hoy.** La historia se cuenta en días respecto al día en que se
  siembra: restablecer la demo la deja siempre «al día». Lo que caería en el
  futuro se adelanta, en orden, a «hace un momento». Por eso los números de
  factura no van fijos: se asignan al sembrar, correlativos por fecha de
  emisión y con la serie del año (`invoiceNumber`, `events/business.ts`).
- **Por tramos.** No cabe en una invocación del Worker (D1 admite unas mil
  consultas por invocación). `runner.ts` ejecuta los eventos que caben en su
  presupuesto (20 s y 450 consultas; la invocación más cara ronda 530), guarda
  por dónde va en `settings` (`demo:norte-astur:state`, escrito con
  compare-and-swap) y sigue en la siguiente. Una generación completa son unos 33
  tramos.
- **Quién avanza.** La tarea `demo:provision` del cron de cada minuto
  (`server/tasks/demo/provision.ts`) y, más rápido, la pantalla del super admin
  mientras esté abierta. Sólo una invocación a la vez (cerrojo con caducidad).
- **Creación automática.** Con `DEMO_TENANT_AUTOPROVISION = "1"` (wrangler.toml)
  el cron la crea sola la primera vez que no existe. Nunca la borra por su
  cuenta.
- **Fallos.** Un evento que falla para la generación con el error visible. El
  cron la reintenta desde cero (borrado + generación) como mucho 3 veces;
  después espera al super admin.
- **Imágenes.** Se sirven como estáticos desde `public/demo-assets/norte-astur/`
  y el seed las sube a R2 por `storeAndRegisterFile` (validación, cuota y
  biblioteca de medios de la empresa), una vez por entidad.

## Qué se bloquea

La empresa está marcada con `organizations.registration_source = 'demo'` (el
mecanismo que ya existía para el origen del alta; no hay un campo nuevo). Con
esa marca (`isDemoOrg`, `server/utils/demo/tenant.ts`):

| Canal | Comportamiento en la demo |
|---|---|
| Email (`attemptSend`) | No se envía; el registro queda «fallido» con el motivo «Cuenta de demostración: no se envía nada fuera de la plataforma» |
| WhatsApp (avisos de citas y bandeja) | No se envía; queda registrado como no enviado |
| Llamadas (Meta/Twilio) | No se inician |
| Webhooks salientes | No se entregan |
| Depósitos con Stripe | 409: no se crea cobro |
| Alta de canal de WhatsApp y remitente de email propio | 409 |
| Recordatorios de citas | No se envían; la cita queda «Sin recordatorio» |
| Enlaces `tel:`, `mailto:`, WhatsApp en el navegador | No hacen nada y lo avisan (`plugins/demo-links.client.ts`), en el panel y en la web |

Las automatizaciones de la demo sólo tienen acciones internas (crear tareas,
avisos en la campana del panel) y se crean al final de la historia, así que sólo
actúan sobre lo que haga quien use la demo.

## Ver la web de la demo

La demo no tiene dominio propio. «Vista previa del sitio» (pie del menú) y el
icono «Abrir sitio publicado» del Constructor Web abren `/?vista_previa=<id>`
en el dominio principal: sólo con sesión en esa empresa (o de super admin) esa
navegación se sirve como ella, `Cache-Control: private, no-store` y `noindex`
(`server/utils/sitePreview.ts`). Se ve igual que la web publicada, sin franja
(desde 2026-10): se abre en otra pestaña y se vuelve cerrándola; la dirección
`/?vista_previa=salir` la cierra en ese navegador. Sirve igual para cualquier
empresa sin dominio.

## Restablecer

Sistemas › Empresas › recuadro «Cuenta demo comercial» › **Restablecer la
demo…** (sólo super admin; pide escribir `norte-astur-inmobiliaria`). Borra los
datos de la empresa demo —no la empresa— y la vuelve a generar con fecha de hoy.

El borrado (`purge.ts`) se construye a partir del esquema: todas las tablas con
`organization_id` y sus tablas hijas por clave foránea, hijas primero, en un
batch; las claves de R2 de su biblioteca de medios y sus ajustes `org:<id>:%`.
Antes de borrar comprueba que la empresa es la demo (slug, origen `demo` y que no
es la empresa 1). Queda en la auditoría.

## Pruebas

- `test/unit/demoSeed.test.ts`: genera la demo completa sobre SQLite con todas
  las migraciones y el mismo driver de D1 que el Worker (`test/unit/helpers/d1Shim.ts`),
  con el presupuesto real de consultas; comprueba volúmenes, que la
  administradora no es super admin y su contraseña es un hash, que no se envió
  nada, que las métricas salen de los registros, que la comisión facturada es
  la de la ficha, que otra empresa no se toca, que el restablecimiento no deja
  rastro (tablas y R2) y que se puede volver a sembrar.
- `test/unit/demoDataset.test.ts`: el dataset sólo usa valores de los catálogos
  reales (tipos, subtipos, ficha ampliada, papeles de propietario, financiación)
  y cada foto tiene su texto alternativo.

## Imágenes y créditos

Todas las fotos son CC0 o Public Domain Mark (Wikimedia Commons, Openverse,
WordPress Photos, StockSnap), con autor y origen en
`public/demo-assets/norte-astur/CREDITOS.md`. Algunas están recortadas o con un
rótulo difuminado (listadas allí). Los logotipos de la agencia y de las dos
promotoras son propios y ficticios.

Retratos: los 61 de la gerente, los comerciales y los contactos son
**fotografías reales** de modelos publicadas en StockSnap con licencia CC0
(ninguna ilustración ni imagen generada), recortadas a un cuadrado centrado en
la cara. Se eligieron para que no se repita ninguna persona y la edad aparente
encaje con cada papel.

Galerías: cada propiedad tiene entre 3 y 8 fotos; las que tienen menos fotos de
la vivienda se completan con fotos del entorno (la localidad), como en un anuncio
real. Las fotos de la empresa Villa Florida Apartamentos, The Residences at
Mandarin Oriental y DTILE están marcadas por sus propios autores como dominio
público (PDM) en Flickr: el PDM no es una cesión legal como CC0, así que si se
prefiere ser más estricto, son las primeras que conviene sustituir.
