import { TimelineBuilder, type DemoEvent } from './timeline'
import { addSetupEvents } from './events/setup'
import { addPropertyEvents } from './events/properties'
import { addCrmEvents } from './events/crm'
import { addAgendaEvents } from './events/agenda'
import { addBusinessEvents } from './events/business'
import { addCommsEvents } from './events/comms'
import { addWebEvents } from './events/web'
import { addAnalyticsEvents } from './events/analytics'

/**
 * La historia completa de «Norte Astur Inmobiliaria», en orden: la misma
 * lista en cada invocación para el mismo día de anclaje (el ejecutor guarda
 * por qué evento va).
 */
export function buildDemoTimeline(anchorDay: string, nowMs: number): DemoEvent[] {
  const tl = new TimelineBuilder(anchorDay, nowMs)
  addSetupEvents(tl)
  addPropertyEvents(tl)
  addCrmEvents(tl)
  addAgendaEvents(tl)
  addBusinessEvents(tl)
  addCommsEvents(tl)
  addWebEvents(tl)
  addAnalyticsEvents(tl)
  return tl.build()
}
