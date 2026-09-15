/**
 * Nombres legibles para las columnas del CRUD genérico
 * (pages/admin/[resource]/index.vue y [id].vue).
 *
 * ## Por qué
 *
 * Esas dos pantallas sirven 14 entradas del menú —Usuarios, Comunidades,
 * Equipo, las cinco taxonomías del CMS, las tres de Bandeja, Auditoría,
 * Empresas…— y hasta ahora imprimían el nombre de la columna tal cual:
 * `id`, `createdAt`, `emailSenderDomainVerified`. Para quien usa el panel eso
 * no es una cabecera de tabla, es una filtración del esquema.
 *
 * La etiqueta buena, cuando existe, es la que el propio recurso declara en
 * `fields[campo].label` (server/utils/adminResources.ts). Esto cubre el resto:
 * las columnas técnicas que aparecen en `listFields` pero no son campos
 * editables —`id`, las marcas de tiempo, las claves foráneas— y cualquier
 * campo nuevo que todavía no tenga etiqueta.
 */

/**
 * Columnas que aparecen en `listFields` de varios recursos y no tienen (ni
 * deben tener) un campo editable detrás. Sin esto, la conversión automática
 * produciría cosas como "Created At" o "Email Sender Domain Verified".
 */
const KNOWN_FIELD_LABELS: Record<string, string> = {
  id: 'ID',
  createdAt: 'Creado',
  updatedAt: 'Actualizado',
  name: 'Nombre',
  email: 'Email',
  userEmail: 'Email',
  phone: 'Teléfono',
  phoneNumber: 'Teléfono',
  slug: 'Slug',
  title: 'Título',
  description: 'Descripción',
  status: 'Estado',
  statusCode: 'Código',
  type: 'Tipo',
  role: 'Rol',
  price: 'Precio',
  size: 'Superficie',
  image: 'Imagen',
  label: 'Etiqueta',
  category: 'Categoría',
  city: 'Ciudad',
  location: 'Ubicación',
  community: 'Comunidad',
  domain: 'Dominio',
  url: 'URL',
  path: 'Ruta',
  fromPath: 'Ruta origen',
  toPath: 'Ruta destino',
  method: 'Método',
  action: 'Acción',
  resource: 'Recurso',
  resourceId: 'ID del recurso',
  message: 'Mensaje',
  subject: 'Asunto',
  platform: 'Plataforma',
  position: 'Puesto',
  department: 'Departamento',
  specialty: 'Especialidad',
  nationality: 'Nacionalidad',
  employmentStatus: 'Situación laboral',
  officeName: 'Oficina',
  contactPersonName: 'Persona de contacto',
  authorName: 'Autor',
  parentId: 'Pertenece a',
  articleId: 'Artículo',
  propertyId: 'Propiedad',
  developerPropertyId: 'Proyecto',
  teamMemberId: 'Miembro del equipo',
  propertyType: 'Tipo de inmueble',
  unitType: 'Tipo de unidad',
  paymentForRent: 'Pago (alquiler)',
  targetAudience: 'Público objetivo',
  emailSenderAddress: 'Email remitente',
  emailSenderDomainVerified: 'Dominio verificado',
  fileKey: 'Archivo',
  sortOrder: 'Orden',
  hits: 'Visitas',
}

/**
 * Último recurso para un campo sin etiqueta: `emailSenderName` → "Email sender
 * name". No es una traducción —no puede serlo— pero es legible, y sobre todo
 * se nota que falta una etiqueta de verdad, que es justo lo que se quiere.
 */
export function humanizeFieldName(field: string): string {
  const spaced = String(field)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : String(field)
}

interface ResourceMetaLike {
  fields?: Record<string, { label?: string } | undefined>
}

/**
 * La etiqueta a enseñar para una columna: primero la que declara el recurso,
 * luego el diccionario de columnas técnicas, y sólo entonces la conversión
 * automática.
 */
export function fieldLabel(meta: ResourceMetaLike | null | undefined, field: string): string {
  const declared = meta?.fields?.[field]?.label
  if (declared) return declared
  return KNOWN_FIELD_LABELS[field] || humanizeFieldName(field)
}

/** Expuesto para que una prueba pueda comprobar que ninguna columna se queda sin nombre. */
export { KNOWN_FIELD_LABELS }
