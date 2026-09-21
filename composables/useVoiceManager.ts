/**
 * VoiceManager: una sola llamada de voz viva en todo el panel, sea cual sea
 * la página. Habla WebRTC con el navegador (micrófono, RTCPeerConnection,
 * audio remoto) y con el servidor sólo para intercambiar el SDP y el
 * estado; el servidor lo pasa a Meta (WhatsApp Calling API). El audio va
 * directo navegador ↔ WhatsApp: nunca pasa por nuestro Worker, así que no
 * hay grabación posible ni transcripción.
 *
 * Flujos (docs/communications.md, "Llamadas"):
 *   saliente: micrófono → oferta SDP (con candidatos ICE ya reunidos) →
 *             POST /api/admin/comms/calls → Meta llama al usuario → cuando
 *             acepta, el webhook trae la respuesta SDP → se aplica → audio.
 *   entrante: el sondeo trae una llamada `ringing` con la oferta SDP →
 *             el usuario acepta → respuesta SDP → POST …/action accept.
 *
 * Nada de esto está probado contra Meta en producción todavía (hace falta
 * un número con Calling activo): el código sigue la documentación oficial
 * al pie de la letra y la interfaz lo dice cuando no hay canal apto.
 */

export type VoiceStatus = 'idle' | 'requesting_mic' | 'dialing' | 'ringing' | 'connecting' | 'in_call' | 'ended' | 'failed'

export interface VoiceCallView {
  id: number
  direction: 'inbound' | 'outbound'
  contactName: string
  contactPhone: string | null
  conversationId: number | null
}

export interface IncomingCallView extends VoiceCallView {
  sdpOffer: string
}

interface VoiceState {
  status: VoiceStatus
  call: VoiceCallView | null
  incoming: IncomingCallView | null
  error: string | null
  startedAt: number | null
  endedAt: number | null
  muted: boolean
  minimized: boolean
  /** Ids de llamadas entrantes ya rechazadas/ignoradas en esta sesión, para no volver a mostrarlas. */
  dismissed: number[]
  /** Al terminar una llamada se ofrece anotar el resultado. */
  pendingLog: { callId: number; contactName: string; conversationId: number | null } | null
}

// Objetos del navegador que no pueden vivir en useState (no son serializables).
let pc: RTCPeerConnection | null = null
let localStream: MediaStream | null = null
let remoteAudio: HTMLAudioElement | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

const TERMINAL = new Set(['completed', 'failed', 'rejected', 'missed', 'cancelled'])

function waitForIce(connection: RTCPeerConnection, timeoutMs = 3000): Promise<void> {
  if (connection.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      connection.removeEventListener('icegatheringstatechange', check)
      resolve()
    }
    const check = () => {
      if (connection.iceGatheringState === 'complete') done()
    }
    connection.addEventListener('icegatheringstatechange', check)
    setTimeout(done, timeoutMs)
  })
}

export function useVoiceManager() {
  const state = useState<VoiceState>('voice-manager', () => ({
    status: 'idle',
    call: null,
    incoming: null,
    error: null,
    startedAt: null,
    endedAt: null,
    muted: false,
    minimized: false,
    dismissed: [],
    pendingLog: null,
  }))
  const toast = useToast()

  const active = computed(() => state.value.status !== 'idle' && state.value.status !== 'ended' && state.value.status !== 'failed')

  function cleanupMedia() {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = null
    try {
      pc?.close()
    } catch {
      // ya cerrada
    }
    pc = null
    localStream?.getTracks().forEach((t) => t.stop())
    localStream = null
    if (remoteAudio) {
      remoteAudio.srcObject = null
      remoteAudio.remove()
      remoteAudio = null
    }
  }

  function finish(status: 'ended' | 'failed', error?: string | null) {
    cleanupMedia()
    const call = state.value.call
    state.value.status = status
    state.value.error = error ?? null
    state.value.endedAt = Date.now()
    state.value.muted = false
    if (call && status === 'ended' && state.value.startedAt) {
      state.value.pendingLog = { callId: call.id, contactName: call.contactName, conversationId: call.conversationId }
    }
    if (error) toast.error(error, 6000)
  }

  async function setupPeer(): Promise<RTCPeerConnection> {
    if (!import.meta.client || typeof RTCPeerConnection === 'undefined') throw new Error('Este navegador no admite llamadas (WebRTC).')
    state.value.status = 'requesting_mic'
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      throw new Error('No se pudo acceder al micrófono. Permite el micrófono en el navegador para llamar.')
    }
    // STUN público para descubrir la IP; Meta exige ICE + DTLS-SRTP y OPUS,
    // que es lo que el navegador negocia por defecto.
    const connection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
    localStream.getTracks().forEach((t) => connection.addTrack(t, localStream!))
    connection.ontrack = (ev) => {
      if (!remoteAudio) {
        remoteAudio = document.createElement('audio')
        remoteAudio.autoplay = true
        remoteAudio.setAttribute('data-voice-remote', '')
        document.body.appendChild(remoteAudio)
      }
      remoteAudio.srcObject = ev.streams[0]
    }
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'connected' && state.value.status !== 'in_call') {
        state.value.status = 'in_call'
        state.value.startedAt = state.value.startedAt ?? Date.now()
      }
      if (connection.connectionState === 'failed') finish('failed', 'La conexión de audio falló.')
      if (connection.connectionState === 'disconnected' || connection.connectionState === 'closed') {
        if (active.value) finish('ended')
      }
    }
    pc = connection
    return connection
  }

  function watchCall(callId: number) {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = setInterval(async () => {
      try {
        const r = await $fetch<{ call: any }>(`/api/admin/comms/calls/${callId}`)
        await applyServerCall(r.call)
      } catch {
        // el siguiente tick lo reintenta
      }
    }, 1500)
  }

  /** Aplica el estado que llega del servidor (sondeo propio o el general del panel). */
  async function applyServerCall(call: any) {
    if (!call || !state.value.call || call.id !== state.value.call.id) return
    if (call.status === 'ringing' && state.value.status === 'dialing') state.value.status = 'ringing'
    if (call.session?.answer?.sdp && pc && !pc.currentRemoteDescription) {
      state.value.status = 'connecting'
      try {
        await pc.setRemoteDescription({ type: 'answer', sdp: call.session.answer.sdp })
      } catch (e: any) {
        finish('failed', `No se pudo aplicar la respuesta de WhatsApp: ${e?.message || e}`)
        return
      }
    }
    if (TERMINAL.has(call.status)) {
      if (call.status === 'failed') finish('failed', call.errorMessage || 'La llamada falló.')
      else if (call.status === 'rejected') finish('ended', 'El contacto rechazó la llamada.')
      else finish('ended')
    }
  }

  async function startCall(target: { conversationId?: number | null; contactId?: number | null; contactName: string; contactPhone?: string | null; propertyId?: number | null }) {
    if (active.value) {
      toast.info('Ya hay una llamada en curso.')
      return
    }
    state.value.error = null
    state.value.pendingLog = null
    state.value.startedAt = null
    state.value.endedAt = null
    state.value.minimized = false
    state.value.call = { id: 0, direction: 'outbound', contactName: target.contactName, contactPhone: target.contactPhone ?? null, conversationId: target.conversationId ?? null }
    try {
      const connection = await setupPeer()
      state.value.status = 'dialing'
      const offer = await connection.createOffer({ offerToReceiveAudio: true })
      await connection.setLocalDescription(offer)
      await waitForIce(connection)
      const sdp = connection.localDescription?.sdp
      if (!sdp) throw new Error('No se pudo generar la oferta de audio.')
      const r = await $fetch<{ call: any }>('/api/admin/comms/calls', {
        method: 'POST',
        body: { conversationId: target.conversationId ?? undefined, contactId: target.contactId ?? undefined, sdpOffer: sdp, propertyId: target.propertyId ?? undefined },
      })
      state.value.call = { ...state.value.call!, id: r.call.id, conversationId: r.call.conversationId ?? state.value.call!.conversationId }
      watchCall(r.call.id)
    } catch (e: any) {
      const message = e?.data?.statusMessage || e?.statusMessage || e?.message || 'No se pudo iniciar la llamada.'
      finish('failed', message)
    }
  }

  function offerIncoming(calls: any[]) {
    if (active.value || state.value.incoming) return
    const candidate = (calls || []).find((c) => c.status === 'ringing' && !state.value.dismissed.includes(c.id) && c.session?.offer?.sdp)
    if (!candidate) return
    state.value.incoming = {
      id: candidate.id,
      direction: 'inbound',
      contactName: candidate.contactName || candidate.contactPhone || 'Desconocido',
      contactPhone: candidate.contactPhone ?? null,
      conversationId: candidate.conversationId ?? null,
      sdpOffer: candidate.session.offer.sdp,
    }
  }

  /** El sondeo general: una entrante que dejó de sonar desaparece del aviso. */
  function syncIncoming(calls: any[]) {
    if (state.value.incoming) {
      const still = (calls || []).some((c) => c.id === state.value.incoming!.id && c.status === 'ringing')
      if (!still) state.value.incoming = null
    }
    offerIncoming(calls)
  }

  async function acceptIncoming() {
    const incoming = state.value.incoming
    if (!incoming) return
    state.value.incoming = null
    state.value.error = null
    state.value.pendingLog = null
    state.value.startedAt = null
    state.value.endedAt = null
    state.value.minimized = false
    state.value.call = { id: incoming.id, direction: 'inbound', contactName: incoming.contactName, contactPhone: incoming.contactPhone, conversationId: incoming.conversationId }
    try {
      const connection = await setupPeer()
      state.value.status = 'connecting'
      await connection.setRemoteDescription({ type: 'offer', sdp: incoming.sdpOffer })
      const answer = await connection.createAnswer()
      await connection.setLocalDescription(answer)
      await waitForIce(connection)
      const sdp = connection.localDescription?.sdp
      if (!sdp) throw new Error('No se pudo generar la respuesta de audio.')
      // pre_accept acelera la conexión (Meta lo recomienda); accept la cierra.
      await $fetch(`/api/admin/comms/calls/${incoming.id}/action`, { method: 'POST', body: { action: 'pre_accept', sdpAnswer: sdp } }).catch(() => null)
      await $fetch(`/api/admin/comms/calls/${incoming.id}/action`, { method: 'POST', body: { action: 'accept', sdpAnswer: sdp } })
      state.value.startedAt = Date.now()
      watchCall(incoming.id)
    } catch (e: any) {
      finish('failed', e?.data?.statusMessage || e?.statusMessage || e?.message || 'No se pudo aceptar la llamada.')
    }
  }

  async function rejectIncoming() {
    const incoming = state.value.incoming
    if (!incoming) return
    state.value.incoming = null
    state.value.dismissed = [...state.value.dismissed, incoming.id]
    await $fetch(`/api/admin/comms/calls/${incoming.id}/action`, { method: 'POST', body: { action: 'reject' } }).catch(() => null)
  }

  function dismissIncoming() {
    const incoming = state.value.incoming
    if (!incoming) return
    state.value.incoming = null
    state.value.dismissed = [...state.value.dismissed, incoming.id]
  }

  async function hangup() {
    const call = state.value.call
    if (call?.id && active.value) {
      await $fetch(`/api/admin/comms/calls/${call.id}/action`, { method: 'POST', body: { action: 'terminate' } }).catch(() => null)
    }
    finish('ended')
  }

  function toggleMute() {
    state.value.muted = !state.value.muted
    localStream?.getAudioTracks().forEach((t) => (t.enabled = !state.value.muted))
  }

  function dismiss() {
    if (active.value) return
    state.value.status = 'idle'
    state.value.call = null
    state.value.error = null
  }

  function clearPendingLog() {
    state.value.pendingLog = null
  }

  return { state, active, startCall, hangup, toggleMute, acceptIncoming, rejectIncoming, dismissIncoming, syncIncoming, applyServerCall, dismiss, clearPendingLog }
}
