/**
 * Estado global del Centro de Comunicaciones en el panel: si la agencia
 * tiene un número conectado y qué puede hacer con él, el contador de no
 * leídos del menú, y el sondeo de cambios (`/api/admin/comms/updates`) del
 * que también se alimentan las llamadas entrantes del VoiceManager.
 *
 * No hay WebSockets en este despliegue: el layout del panel pregunta cada
 * pocos segundos y la bandeja, cuando está abierta, acelera el ritmo. Los
 * componentes reaccionan al ref `updates` (la última respuesta) en vez de
 * pedir la lista entera cada vez.
 */

export interface CommsCapabilities {
  messaging: boolean
  media: boolean
  templates: boolean
  templateSync: boolean
  readReceipts: boolean
  markRead: boolean
  calling: boolean
  callPermissions: boolean
}

export interface CommsOverview {
  configured: boolean
  encryptionAvailable: boolean
  channels: any[]
  defaultChannelId: number | null
  capabilities: CommsCapabilities
  settings: { defaultCountryPrefix: string | null; unknownContactPolicy: 'ask' | 'lead'; notifyInternal: boolean }
  unread: number
  providers: any[]
}

export interface CommsUpdates {
  now: string
  unread: number
  conversations: any[]
  calls: any[]
  incomingCalls: any[]
}

const DEFAULT_INTERVAL_MS = 10_000

export function useComms() {
  const overview = useState<CommsOverview | null>('comms-overview', () => null)
  const unread = useState<number>('comms-unread', () => 0)
  const updates = useState<CommsUpdates | null>('comms-updates', () => null)
  const lastSync = useState<string | null>('comms-last-sync', () => null)
  const polling = useState<{ timer: ReturnType<typeof setInterval> | null; intervalMs: number; inFlight: boolean; failures: number }>('comms-polling', () => ({ timer: null, intervalMs: DEFAULT_INTERVAL_MS, inFlight: false, failures: 0 }))

  async function loadOverview(force = false): Promise<CommsOverview | null> {
    if (overview.value && !force) return overview.value
    try {
      const data = await $fetch<CommsOverview>('/api/admin/comms/overview')
      overview.value = data
      unread.value = data.unread
      return data
    } catch {
      return overview.value
    }
  }

  async function poll(): Promise<CommsUpdates | null> {
    if (import.meta.server || polling.value.inFlight) return null
    polling.value.inFlight = true
    try {
      const data = await $fetch<CommsUpdates>('/api/admin/comms/updates', { query: lastSync.value ? { since: lastSync.value } : {} })
      lastSync.value = data.now
      unread.value = data.unread
      updates.value = data
      polling.value.failures = 0
      return data
    } catch {
      // Un fallo de red no para el sondeo; tras varios seguidos se espacia.
      polling.value.failures++
      return null
    } finally {
      polling.value.inFlight = false
    }
  }

  function startPolling(intervalMs = DEFAULT_INTERVAL_MS) {
    if (import.meta.server) return
    if (polling.value.timer && polling.value.intervalMs === intervalMs) return
    stopPolling()
    polling.value.intervalMs = intervalMs
    polling.value.timer = setInterval(() => {
      if (document.visibilityState === 'hidden') return
      if (polling.value.failures >= 3 && Math.random() < 0.6) return
      poll()
    }, intervalMs)
    poll()
  }

  function stopPolling() {
    if (polling.value.timer) clearInterval(polling.value.timer)
    polling.value.timer = null
  }

  /** La bandeja abierta sondea más deprisa; al salir vuelve al ritmo del layout. */
  function usePollingRate(intervalMs: number) {
    onMounted(() => startPolling(intervalMs))
    onBeforeUnmount(() => startPolling(DEFAULT_INTERVAL_MS))
  }

  return { overview, unread, updates, lastSync, loadOverview, poll, startPolling, stopPolling, usePollingRate }
}
