/**
 * Abstracción futura de sincronización con calendarios externos (FASE 20,
 * secciones 23-25 del megaprompt). Ningún código llama a esto todavía — es
 * sólo la forma que tendría un proveedor externo cuando exista de verdad,
 * para que integrarlo no obligue a rediseñar `visits` otra vez.
 *
 * INMO Appointment (`visits`) sigue siendo la identidad estable: nunca se
 * diseña el dominio dependiendo del id de Google/Microsoft. Las columnas que
 * este futuro proveedor rellenaría ya existen (migración 0075):
 * `visits.calendarProvider` / `externalCalendarId` / `externalEventId` /
 * `calendarSyncStatus` — ninguna obligatoria, ninguna escrita hoy.
 */

export interface CalendarProvider {
  readonly name: 'google' | 'outlook'
  /** Crea el evento externo correspondiente a una cita ya existente en `visits` y devuelve su id externo. */
  createEvent(input: { organizationId: number; visitId: number; scheduledAt: string; endsAt: string; title: string; attendeeEmail?: string | null }): Promise<{ externalEventId: string }>
  updateEvent(externalEventId: string, patch: { scheduledAt?: string; endsAt?: string; cancelled?: boolean }): Promise<void>
  deleteEvent(externalEventId: string): Promise<void>
}
