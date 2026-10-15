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
| Propiedades | 10 de obra nueva (las de la web; dos en alquiler, p05 y p06, para que la pestaña «Alquilar» tenga inventario) y 10 de segunda mano (una en alquiler, p18), con ficha ampliada, datos legales, propietarios, galería con portada y texto alternativo, cambios de precio con motivo, etiquetas |
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
  cron reintenta desde cero (borrado + generación) como mucho 3 veces y sólo
  si lo que falló era una generación; un restablecimiento fallido espera al
  super admin (nunca se convierte solo en un borrado).
- **Imágenes.** Se sirven como estáticos desde `public/demo-assets/norte-astur/`
  y el seed las sube a R2 por `storeAndRegisterFile` (validación, cuota y
  biblioteca de medios de la empresa), una vez por entidad.

## Propiedades de referencia

Cuatro propiedades de la demo —dos por catálogo— son los **ejemplos de máxima
calidad** de cómo debe quedar un inmueble documentado en INMO: todas las
secciones del editor trabajadas, la multimedia clasificada, planos y documentos.
La demo las enseña **primero** y con un **marco dorado**.

| Catálogo | Propiedad | Tipología |
|---|---|---|
| Propiedades (web) | `p10` Villa de diseño frente al mar en Celorio | Chalet independiente |
| Propiedades (web) | `p02` Ático con terraza junto al Campo San Francisco | Ático de lujo |
| Propiedades 2ª mano | `p11` Vivienda familiar reformada en La Florida | Piso de segunda mano |
| Propiedades 2ª mano | `p19` Casa asturiana de piedra rehabilitada cerca de Llanes | Casa de segunda mano |

Son propiedades que ya tenía la demo (no se duplica nada): la selección está en
`server/demo/reference.ts`, que las reconoce por su **referencia de agencia**
(`NA-P10`…), no por su posición en la lista ni por su id, y sólo se aplica a la
empresa marcada como demo (`isDemoOrg`, nunca por nombre o dominio). Una que se
borra, se retira o se despublica simplemente deja de coincidir.

**Orden.** En el listado del panel de la demo (`GET /api/admin/developer-properties`
y `/properties`) las dos de cada catálogo van primero, en el orden de arriba, con
la ordenación por defecto («Más recientes», sin radio ni papelera); el resto
conserva el suyo. Otra ordenación (precio, nombre, antigüedad), un filtro o la
paginación se comportan como siempre: sólo salen las que coinciden y las de
referencia no se cuelan. Las filas de la demo llevan `demoReference`; ninguna otra
empresa recibe ese campo ni cambia de orden.

**Marco dorado.** `.demo-reference-frame` (`assets/css/main.css`): 2 px de `#c6a667`
en un `::after` que rodea la tarjeta entera sin mover nada de dentro, sombra
muy suave, sin degradados ni animación. La etiqueta «Propiedad de referencia»
(sobre la portada, abajo a la izquierda) dice que es un ejemplo trabajado a fondo,
no una certificación. En la vista de lista, la fila lleva el contorno y la etiqueta.

**Contenido.** `server/demo/dataset/referencia.ts` completa lo que `properties.ts`
ya traía: ficha ampliada y datos legales y económicos, descripción de doce
partes (presentación, entorno, distribución, zonas de día y noche, exteriores,
calidades, instalaciones, equipamiento, rasgos diferenciales, perfil de comprador
e información comercial), estancias que suman la superficie útil, fotos con su
estancia, texto alternativo y descripción, planos, documentos y etiquetas. Se
aplica con los pasos `Referencia <clave>: ficha completa | estancias | fotos
clasificadas | planos | documentos` de la línea de tiempo
(`server/demo/events/referencia.ts`), por las mismas funciones que el editor
(`buildPayload`, `extractSheetPayload`, `savePropertySheet`, `syncTranslations`) y
el mismo alta de hijos y de documentos. Son **idempotentes**: se reconocen por su
contenido (estancia por nombre, plano y documento por título), así que ejecutarlos
dos veces no duplica nada.

**Cuándo se ven.** El orden y el marco llegan con el despliegue y se ven ya sobre
las propiedades de la demo que existan. El **contenido** nuevo es una serie de
pasos más de la línea de tiempo: en una demo ya sembrada aparece con **«Restablecer
la demo»** (no destructivo, el recuadro dice cuántos pasos pendientes hay) y una
demo nueva ya lo incluye. Nada se aplica solo.

**Qué es real y qué no.** Todo es ficticio y está dicho. La referencia catastral
(`DEMO0000000000000010`), la finca registral (`DEMO-FINCA-0010`) y el certificado
energético (`DEMO-SIN-REGISTRO`) son inequívocamente falsos: ninguno puede
corresponder a un inmueble real, y la descripción avisa de que los datos
energéticos y registrales son de demostración. Los documentos son fichas,
memorias, resúmenes, un informe descriptivo y un modelo de hoja de encargo —nada
de escrituras, notas simples ni certificados—, con el rótulo **«DOCUMENTO DE
DEMOSTRACIÓN — SIN VALIDEZ LEGAL»** en una franja de cada página y al pie
(`server/demo/pdf.ts`); el informe de estado de 2ª mano dice que no es una
inspección. Los planos (`public/demo-assets/norte-astur/planos/`) los dibuja
`scripts/demo-planos.ts` a partir de las mismas estancias de la ficha, con el
rótulo «PLANO DE DEMOSTRACIÓN — SIN VALIDEZ LEGAL». Las fotos son las que ya tenía
la demo (CC0, ver CREDITOS.md): las del entorno dicen que lo son.

**No aplica no es pendiente.** Lo que no corresponde a la tipología (la piscina
comunitaria de un chalet, el ascensor de una casa de piedra, el plan de pagos de
una reventa, los vídeos y tours sin recurso con licencia compatible) no se rellena
con un valor falso: cada campo lleva su motivo en `notApplicable` del dataset.
`server/demo/completeness.ts` recorre las secciones reales del editor
(`PROPERTY_BUILDER_SECTIONS`) y cuenta campos completos, «no aplica» y pendientes,
y comprueba la coherencia (superficies, estancias, dormitorios y baños, precios),
la multimedia clasificada, los documentos marcados y que ningún archivo apunte a
algo que no existe.

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

## Restablecer (no destructivo) y regenerar

Sistemas › Empresas › recuadro «Cuenta demo comercial» (sólo super admin):

- **Restablecer la demo** (`demo-reset`, confirmación simple). NO destructivo:
  quita lo que hayan dejado los visitantes y vuelve al estado que define el
  código. Funciona con la **instantánea del estado sembrado** (`snapshot.ts`):
  al terminar una siembra (o un restablecimiento) se guardan todas las filas de
  la empresa demo como JSON en R2 (`demo/norte-astur/snapshot.json`, que
  `/api/media` no sirve porque no está en `media_assets`). Restablecer, por
  tramos: 1) borra de R2 sólo los ficheros que no estén en la instantánea (los
  subidos por visitantes) y todas las filas de la empresa (sin tocar R2); 2)
  vuelve a insertar las filas de la instantánea, padres primero, con sus mismos
  ids y sus mismas claves de R2 (las imágenes no se tocan ni se vuelven a
  subir; sentencias con los valores en literal, troceadas por tamaño, en
  batches con `defer_foreign_keys`); 3) restaura la fila de la empresa y sus
  ajustes `org:<id>:%`; 4) ejecuta sólo los **eventos que el código añadió**
  desde la instantánea (los que no están en `state.done`, ver abajo), con el
  mismo anclaje de fechas; 5) guarda una instantánea nueva. Lo creado o
  cambiado por un visitante desaparece (contactos, leads, cambios en fichas,
  ficheros); lo que viene del código se conserva. No cambia el día de anclaje.
- **Regenerar desde cero…** (`demo-regenerate`, pide escribir
  `norte-astur-inmobiliaria`). Destructivo: borra todo lo de la empresa demo
  —filas, ficheros de R2 e instantánea; no la empresa— y la vuelve a sembrar
  con la historia anclada a hoy. Es lo único que re-ancla las fechas, y la
  única salida de una demo sembrada antes de que existieran las instantáneas
  (el panel lo avisa como «generada con una versión anterior»: su primer
  «Restablecer» se convierte en una regeneración, una sola vez).

Cada evento de la línea de tiempo tiene una clave estable (`día@hora etiqueta`,
`timeline.ts`) y el ejecutor apunta en `state.done` las que ya corrieron. Así
«Restablecer» reconoce los eventos nuevos del código (una zona, una guía, un
bloque de la Home…) y los ejecuta sobre el estado restaurado; el panel enseña
cuántos pasos nuevos hay pendientes. Cambiar la etiqueta de un evento lo
convierte en uno nuevo.

El borrado (`purge.ts`) se construye a partir del esquema: todas las tablas con
`organization_id` y sus tablas hijas por clave foránea, hijas primero, en un
batch; y sus ajustes `org:<id>:%` (las claves de R2 sólo al regenerar). Antes de
borrar comprueba que la empresa es la demo (slug, origen `demo` y que no es la
empresa 1). Las tablas de sesión y rastro (sesiones, retos de acceso, tokens de
contraseña, accesos a medios, subidas a medias, errores) nunca entran en la
instantánea: por eso restablecer **cierra las sesiones abiertas en la demo**
(son de los visitantes) y quien estuviera dentro vuelve a entrar con la misma
contraseña. Todo queda en la auditoría.

## Pruebas

- `test/unit/demoSeed.test.ts`: genera la demo completa sobre SQLite con todas
  las migraciones y el mismo driver de D1 que el Worker (`test/unit/helpers/d1Shim.ts`),
  con el presupuesto real de consultas; comprueba volúmenes, que la
  administradora no es super admin y su contraseña es un hash, que no se envió
  nada, que las métricas salen de los registros, que la comisión facturada es
  la de la ficha, que otra empresa no se toca, que el restablecimiento no deja
  rastro (tablas y R2) y que se puede volver a sembrar.
- `test/unit/demoReferencia.test.ts`: las cuatro propiedades de referencia
  (catálogos reales, coherencia de superficies, estancias y precios, fotos y
  planos que existen, PDF con su rótulo, y que la prioridad del listado sólo se
  aplica a la empresa demo) y la comprobación de completitud sobre la demo
  generada (dentro de `demoSeed.test.ts`, con la idempotencia de los pasos).
- `tests/e2e/demo.spec.ts`: sobre el Worker, las de referencia primero y
  marcadas en los dos listados, el resto con su orden, ordenación explícita,
  filtros y paginación sin cuelas, marco dorado en escritorio, tableta y móvil,
  y las fichas públicas con sus fotos clasificadas, plano y documentos.
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
