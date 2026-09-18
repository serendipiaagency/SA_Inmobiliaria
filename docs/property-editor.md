# Property Editor

El editor de fichas de propiedad del panel. **Uno solo** para los cuatro
recorridos:

| Recorrido | Ruta |
| --- | --- |
| Alta, obra nueva | `/admin/developer-properties/new` |
| Edición, obra nueva | `/admin/developer-properties/<id>` |
| Alta, 2ª mano | `/admin/properties/new` |
| Edición, 2ª mano | `/admin/properties/<id>` |

Las cuatro entran por `pages/admin/[resource]/[id].vue`, que para estos dos
recursos delega en `components/property-builder/PropertyBuilder.vue` en lugar
del formulario genérico. No hay una rama visual por catálogo ni por modo: lo
único que cambia son los pasos y los campos que declara
`composables/usePropertyBuilderConfig.ts`. Si los dos catálogos dejan de
parecerse, es porque su configuración se ha separado — no porque haya dos
editores.

## Anatomía

```
PropertyBuilder.vue                 armazón: pasos, sección activa, guardado
├── PropertyEditorHeader.vue        volver · título · estado · acciones · Guardar
├── PropertyEditorSteps.vue         progreso + lista de pasos (columna izquierda)
├── PropertySectionHeader.vue       «PASO n DE N» + título + icono
├── PropertyBuilderField.vue        un campo, según su `type`
│   ├── StepperField / AgentPickerField / PaymentPlanEditor / VideoField
│   └── RichTextField.client.vue
├── LocationSection.vue             dirección granular + mapa
├── GalleryManager.vue              galería (orden, portada)
├── ChildCardManager.vue            planos, tipos de unidad
├── SocialLinksManager.vue          redes sociales
├── TranslationsEditor.vue          descripción en/ar
├── PropertyEditorFooter.vue        Anterior · aviso · Siguiente / Finalizar
└── PropertyEditorPreview.vue       vista previa en vivo (columna derecha)
```

Los gestores de la lista intermedia (galería, planos, redes, ubicación,
traducciones) son los de siempre: el rediseño les cambió las clases, no la
lógica.

Los estilos compartidos viven en `assets/css/main.css` bajo el prefijo `.pe-*`
(`pe-card`, `pe-input`, `pe-label`, `pe-btn-dark`, `pe-btn-quiet`, `pe-chip`,
`pe-drop`).

## Lo que el editor promete y cumple

- **No autoguarda.** Lo escrito vive en el formulario hasta que se pulsa
  Guardar / Crear propiedad / Finalizar. La cabecera dice si hay cambios
  pendientes y `onBeforeRouteLeave` pide confirmación antes de salir con
  algo sin guardar. El pie lo escribe tal cual en vez de copiar el
  «se guarda automáticamente» de la referencia de diseño: sería la frase
  más cómoda de poner y la más cara cuando alguien cierra la pestaña
  creyéndosela.
  Sí se guardan por su cuenta —porque son listas propias, no campos de la
  ficha— el orden de la galería y las tarjetas de planos, tipos de unidad y
  redes sociales.
- **El progreso sale de campos reales.** `sectionStates` y `progressPercent`
  cuentan los campos `required`/`recommended` que hay rellenos. Abrir un paso
  no lo marca como hecho. Un paso sin campos que seguir (galería, planos,
  redes, traducciones) se queda neutro a propósito: no hay forma honesta de
  decir que una galería está «completa».
- **La vista previa es el formulario, no una consulta.** Recibe los valores en
  vivo; escribir el precio lo cambia al instante. No guarda nada ni duplica la
  propiedad, y si la imagen no carga lo dice en vez de enseñar el icono de
  imagen rota.
- **Los desplegables enseñan castellano.** `optionLabels` en el `FieldSpec`
  traduce el valor que guarda la columna (`under_construction`, `sale`,
  `available`…). El valor enviado a la API no cambia.

## Permisos y aislamiento

- El área de ambos recursos es `web` (`server/utils/adminResources.ts`). La
  página calcula `canEdit` con `useAdminPermissions()` —el sistema de
  permisos de siempre, no uno nuevo— y se lo pasa al editor.
- Sin permiso de escritura, la ficha se abre en consulta: aviso visible, el
  cuerpo de cada paso envuelto en un `<fieldset disabled>` (los controles
  quedan deshabilitados de verdad) y sin botón de guardar. El pie sigue
  operativo para poder recorrer los pasos, que es justo lo que concede el
  permiso de lectura.
  Esto **no protege** nada: lo que protege es
  `server/middleware/01.admin-rbac.ts`. Sirve para que el panel no enseñe un
  botón que la API va a rechazar siempre.
- Una ficha de otra inmobiliaria responde 404 en `GET /api/admin/<recurso>/<id>`
  (el servidor filtra por organización antes de mirar el id). El editor lo
  captura y enseña el aviso; nunca se queda a medio pintar con datos ajenos.

## Responsive

Por debajo de `xl` (1280px) desaparecen las dos columnas laterales y los pasos
pasan a una tira horizontal sobre el formulario, que se queda con todo el
ancho. Los márgenes negativos del contenedor anulan exactamente el relleno de
`<main>` en `layouts/admin.vue` (`px-5 py-6`, `lg:px-8 lg:py-8`): con un valor
fijo el panel se desplazaba en horizontal en el móvil.

## Cómo añadir un campo o un paso

Todo pasa por `composables/usePropertyBuilderConfig.ts`:

1. **Un campo nuevo**: añade un `FieldSpec` al array `fields` del paso, con su
   `type`, su `group` y, si toca, `required`/`recommended`/`optionLabels`.
   La columna tiene que existir ya en `server/utils/adminResources.ts` como
   campo editable del recurso — si no, la API descartará el valor en silencio.
2. **Un paso nuevo**: añade un `BuilderSection` con su `key`, `label`,
   `icon` (del mapa `ICONS` de `PropertyBuilder.vue`), `description` y `kind`.
3. No hace falta tocar la plantilla del editor: el armazón dibuja lo que la
   configuración declare, y el progreso, los estados, la navegación y el
   guardado salen de ahí.

## Pruebas

- `tests/e2e/property-editor.spec.ts` — los cuatro recorridos en un navegador:
  que son el mismo editor, alta y edición que persisten de verdad, navegación
  por pasos, ausencia de autoguardado (incluida la comprobación de que el
  servidor no recibe nada), ficha de otra inmobiliaria, responsive y modo de
  sólo lectura.
- `tests/e2e/developer-properties-admin.spec.ts`,
  `tests/e2e/properties-secondhand-admin.spec.ts`,
  `tests/e2e/property-builder.spec.ts` — persistencia campo a campo por API
  (plan de pagos, orden de galería, vídeo, ubicación granular, hijos).
- `tests/e2e/cross-tenant.spec.ts` — aislamiento entre inmobiliarias.

Los `data-testid` del editor (`property-editor`, `property-editor-save`,
`property-editor-step-<key>`, …) existen para estas pruebas. Ojo al
escribirlas: los pasos se dibujan **dos veces** (columna y tira móvil,
alternadas por CSS) y las secciones inactivas siguen montadas (`v-show`), así
que casi todo existe por duplicado en el DOM — hay que filtrar por `:visible`.
