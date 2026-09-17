import { schema } from './db'

/**
 * Qué es público de un comercial, en un solo sitio.
 *
 * ## Por qué existe
 *
 * `/api/public/team` y `/api/public/team/[slug]` hacían `db.select()` sin
 * proyección, así que devolvían **la fila entera de `team_members`** a
 * cualquiera, sin sesión. Entre esas columnas van datos internos de personal
 * —`nid` (documento de identidad), `employeeCode`, `department`, `hireDate`,
 * `contractType`, `managerId`, `employmentStatus`— y, sobre todo,
 * **`icalToken`**.
 *
 * `icalToken` no es un dato: es una credencial. `/calendar/<token>.ics`
 * (server/routes/calendar/[token].get.ts) está deliberadamente sin sesión
 * porque una app de calendario no puede enviar cookies — el token ES la
 * credencial. Publicarlo en un endpoint abierto entrega la agenda completa
 * del comercial: **nombre del cliente, hora y enlace de videollamada de cada
 * visita futura**. Comprobado de extremo a extremo antes de escribir esto:
 * el token salía en la respuesta pública y ese mismo token devolvía 200 en
 * el feed .ics.
 *
 * ## La regla
 *
 * Los endpoints públicos seleccionan **sólo** estas columnas. Nunca
 * `select()` a secas sobre `team_members`: una columna nueva se publicaría
 * sola el día que alguien la añada al esquema, que es exactamente como
 * apareció este problema.
 *
 * `test/unit/publicTeamProjection.test.ts` obliga a que cada columna de la
 * tabla esté clasificada aquí o en `NEVER_PUBLIC_TEAM_COLUMNS`: añadir una
 * columna sin decidir de qué lado cae rompe la prueba.
 */
export const PUBLIC_TEAM_COLUMNS = {
  id: schema.teamMembers.id,
  slug: schema.teamMembers.slug,
  name: schema.teamMembers.name,
  position: schema.teamMembers.position,
  image: schema.teamMembers.image,
  description: schema.teamMembers.description,
  experience: schema.teamMembers.experience,
  languages: schema.teamMembers.languages,
  specialties: schema.teamMembers.specialties,
  // Contacto profesional: la ficha pública del comercial ya los muestra, y
  // son el motivo por el que esa ficha existe.
  email: schema.teamMembers.email,
  phone: schema.teamMembers.phone,
  whatsapp: schema.teamMembers.whatsapp,
  facebook: schema.teamMembers.facebook,
  twitter: schema.teamMembers.twitter,
  linkedin: schema.teamMembers.linkedin,
  instagram: schema.teamMembers.instagram,
} as const

/**
 * Lo que nunca sale de la agencia, con el motivo. No es decorativo: la
 * prueba lo lee para exigir que toda columna esté clasificada.
 */
export const NEVER_PUBLIC_TEAM_COLUMNS: Record<string, string> = {
  organizationId: 'De quién es la fila. El endpoint ya filtra por inquilino; devolverlo sólo invita a probar otros.',
  nid: 'Documento de identidad del empleado.',
  employeeCode: 'Código interno de personal.',
  department: 'Organigrama interno: a quién reporta y en qué unidad trabaja no es información de cara al cliente.',
  officeName: 'Organigrama interno: qué oficina ocupa cada empleado no forma parte de su ficha pública.',
  managerId: 'Organigrama interno: expone la cadena de mando y, de paso, el id de otro empleado.',
  hireDate: 'Dato laboral: la fecha de contratación es información de la relación entre empresa y empleado.',
  contractType: 'Dato laboral: el tipo de contrato es información de la relación entre empresa y empleado.',
  employmentStatus: 'Datos laborales: publicar que alguien está de baja es un dato de salud.',
  workingHours: 'Horario laboral del empleado, distinto de la disponibilidad para citas.',
  zones: 'Reparto comercial interno: qué zonas tiene asignadas cada comercial es organización de la agencia.',
  propertyTypes: 'Reparto comercial interno: qué tipos de producto lleva cada comercial es organización de la agencia.',
  icalToken: 'ES UNA CREDENCIAL: abre /calendar/<token>.ics, que lista las visitas futuras con nombre de cliente y enlace de videollamada.',
  slotDurationMinutes: 'Configuración de la agenda. La web pública consulta huecos por el endpoint de disponibilidad, que ya los calcula.',
  bufferMinutes: 'Configuración interna de la agenda; la web pública sólo necesita los huecos ya calculados.',
  maxAppointmentsPerDay: 'Configuración de la agenda; además deja deducir la carga de trabajo.',
  showOnWeb: 'Bandera de administración: quien la ve ya está viendo sólo a los publicados.',
  sortOrder: 'Bandera de administración: ordena el listado público, pero el orden ya viene aplicado en la respuesta.',
  createdAt: 'Metadato interno de la fila, sin ningún uso en la web pública.',
  updatedAt: 'Metadato interno de la fila, sin ningún uso en la web pública.',
}
