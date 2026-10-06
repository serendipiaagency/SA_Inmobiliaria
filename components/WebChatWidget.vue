<template>
  <div v-if="enabled" class="wc-root no-print" :class="{ 'wc-raised': hasActiveBar }" data-testid="webchat">
    <button v-if="!open" type="button" class="wc-launcher" aria-label="Abrir el chat" data-testid="webchat-open" @click="toggle(true)">
      <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>
      <span class="hidden sm:inline">Chatea con nosotros</span>
      <span v-if="unseen" class="wc-badge" data-testid="webchat-unseen">{{ unseen }}</span>
    </button>

    <section v-else class="wc-panel" role="dialog" aria-label="Chat con la agencia" data-testid="webchat-panel">
      <header class="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold text-ink">{{ tenant?.companyName || tenant?.name || 'Chat' }}</p>
          <p class="text-[11px] text-stone-500">Te respondemos aquí mismo en cuanto podamos.</p>
        </div>
        <button type="button" class="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-ink" aria-label="Cerrar el chat" @click="toggle(false)">✕</button>
      </header>

      <!-- Sin conversación: datos mínimos y primer mensaje -->
      <form v-if="!session" class="space-y-2 overflow-y-auto px-4 py-3" data-testid="webchat-start" @submit.prevent="start">
        <p class="rounded-lg bg-stone-50 px-3 py-2 text-[12px] text-stone-600">{{ greeting }}</p>
        <input v-model="form.name" required maxlength="120" class="wc-input" placeholder="Tu nombre" autocomplete="name" data-testid="webchat-name">
        <input v-model="form.email" type="email" maxlength="200" class="wc-input" placeholder="Email (opcional)" autocomplete="email" data-testid="webchat-email">
        <input v-model="form.phone" type="tel" maxlength="40" class="wc-input" placeholder="Teléfono (opcional)" autocomplete="tel" data-testid="webchat-phone">
        <!-- Campo trampa: una persona nunca lo ve ni lo rellena -->
        <input v-model="form.website" type="text" tabindex="-1" autocomplete="off" class="wc-trap" aria-hidden="true">
        <textarea v-model="form.message" required rows="3" maxlength="2000" class="wc-input resize-none" placeholder="¿En qué podemos ayudarte?" data-testid="webchat-message" />
        <p class="text-[10px] leading-snug text-stone-400">
          Si nos dejas email o teléfono, también podremos responderte por ahí. Usamos tus datos sólo para atender tu consulta (<NuxtLink to="/privacidad" class="underline">privacidad</NuxtLink>).
        </p>
        <button type="submit" class="w-full rounded-full bg-ink py-2 text-sm font-semibold text-white disabled:opacity-50" :disabled="busy" data-testid="webchat-send-first">{{ busy ? 'Enviando…' : 'Empezar el chat' }}</button>
      </form>

      <!-- Con conversación -->
      <template v-else>
        <div ref="scroller" class="min-h-0 flex-1 space-y-1.5 overflow-y-auto bg-stone-50 px-3 py-3" data-testid="webchat-messages">
          <p class="mb-2 text-center text-[11px] text-stone-400">{{ greeting }}</p>
          <div v-for="m in messages" :key="m.id" class="flex" :class="m.from === 'visitor' ? 'justify-end' : 'justify-start'" :data-testid="`webchat-msg-${m.from}`">
            <p class="max-w-[85%] whitespace-pre-line break-words rounded-2xl px-3 py-1.5 text-[13px]" :class="m.from === 'visitor' ? 'rounded-br-sm bg-ink text-white' : 'rounded-bl-sm bg-white text-ink ring-1 ring-line'">{{ m.body }}</p>
          </div>
        </div>
        <form class="flex items-end gap-2 border-t border-line px-3 py-2" @submit.prevent="send">
          <textarea v-model="draft" rows="1" maxlength="2000" class="wc-input min-h-[38px] flex-1 resize-none" placeholder="Escribe un mensaje…" data-testid="webchat-input" @keydown.enter.exact.prevent="send" />
          <button type="submit" class="rounded-full bg-ink px-3 py-2 text-xs font-semibold text-white disabled:opacity-40" :disabled="busy || !draft.trim()" data-testid="webchat-send">Enviar</button>
        </form>
      </template>
      <p v-if="error" class="px-4 pb-2 text-[12px] text-red-600" data-testid="webchat-error">{{ error }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * Chat de la web pública (núcleo N8a, FASE 29). Sólo aparece si la agencia
 * lo activó (Comunicaciones → Configuración). Cada conversación es un hilo
 * «Chat web» de la bandeja del panel; el comercial responde desde allí y
 * aquí se ve por sondeo (cada 6 s con el chat abierto y la pestaña visible,
 * cada 30 s con él cerrado; nunca con la pestaña oculta).
 *
 * Sin cookies: la sesión es un token opaco que guarda el almacenamiento
 * local de ESTA web (primera parte). Sólo sirve para leer y escribir en su
 * propia conversación, y la agencia la decide el servidor por el dominio.
 */
interface ChatMessage {
  id: number
  from: 'visitor' | 'agency'
  body: string
  createdAt: string
}
interface StoredSession {
  token: string
  expiresAt: string
  lastSeenId: number
}

const STORAGE_KEY = 'inmo-webchat-v1'
const ENDPOINT = '/api/public/contact'

const { tenant, load: loadTenant } = useTenant()
const { hasActiveBar } = useBottomBar()
// Cierre del núcleo (FASE 15): el lead del chat llega con el idioma de quien escribe.
const visitorLanguage = useVisitorLanguage()
const route = useRoute()
const mounted = ref(false)
const enabled = computed(() => mounted.value && Boolean(tenant.value?.webChat?.enabled) && !route.path.startsWith('/admin'))
const greeting = computed(() => tenant.value?.webChat?.greeting || '¡Hola! Escríbenos y te respondemos aquí mismo.')

const open = ref(false)
const busy = ref(false)
const error = ref('')
const session = ref<StoredSession | null>(null)
const messages = ref<ChatMessage[]>([])
const draft = ref('')
const unseen = ref(0)
const scroller = ref<HTMLElement | null>(null)
const form = reactive({ name: '', email: '', phone: '', message: '', website: '' })
let timer: ReturnType<typeof setTimeout> | null = null

function readStored(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const s = raw ? (JSON.parse(raw) as StoredSession) : null
    if (!s?.token || !s.expiresAt) return null
    // 'YYYY-MM-DD HH:MM:SS' en UTC: una sesión caducada ni se intenta.
    if (new Date(`${s.expiresAt.replace(' ', 'T')}Z`).getTime() <= Date.now()) return null
    return s
  } catch {
    return null
  }
}
function store(s: StoredSession | null) {
  try {
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Sin almacenamiento local (modo privado estricto): el chat funciona mientras la página siga abierta.
  }
}

function propertySlug(): string | undefined {
  const m = /^\/propiedades\/([^/?#]+)/.exec(route.path)
  return m ? decodeURIComponent(m[1]) : undefined
}

async function scrollToBottom() {
  await nextTick()
  if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
}

function handleError(e: any, fallback: string) {
  const status = e?.statusCode || e?.response?.status
  if (status === 404) {
    // La sesión caducó o la agencia apagó el chat: se empieza de cero, sin fingir que sigue viva.
    session.value = null
    messages.value = []
    store(null)
    error.value = 'Esta conversación ya no está disponible. Puedes empezar una nueva.'
  } else if (status === 429) {
    error.value = e?.data?.statusMessage && !/Too many/.test(e.data.statusMessage) ? e.data.statusMessage : 'Has enviado varios mensajes seguidos. Espera un momento.'
  } else {
    error.value = e?.data?.statusMessage || fallback
  }
}

function mergeMessages(incoming: ChatMessage[]) {
  for (const m of incoming) if (!messages.value.some((x) => x.id === m.id)) messages.value.push(m)
  messages.value.sort((a, b) => a.id - b.id)
}

async function start() {
  if (busy.value) return
  error.value = ''
  busy.value = true
  try {
    const r = await $fetch<{ token: string; expiresAt: string; messages: ChatMessage[] }>(ENDPOINT, {
      method: 'POST',
      query: { channel: 'chat', action: 'start' },
      body: { ...form, propertySlug: propertySlug(), language: visitorLanguage() },
    })
    messages.value = r.messages
    session.value = { token: r.token, expiresAt: r.expiresAt, lastSeenId: r.messages.at(-1)?.id ?? 0 }
    store(session.value)
    form.message = ''
    schedule()
    scrollToBottom()
  } catch (e: any) {
    handleError(e, 'No se pudo enviar el mensaje.')
  } finally {
    busy.value = false
  }
}

async function send() {
  const text = draft.value.trim()
  if (!text || busy.value || !session.value) return
  error.value = ''
  busy.value = true
  try {
    const r = await $fetch<{ message: ChatMessage }>(ENDPOINT, { method: 'POST', query: { channel: 'chat', action: 'send' }, body: { token: session.value.token, message: text } })
    mergeMessages([r.message])
    draft.value = ''
    scrollToBottom()
  } catch (e: any) {
    handleError(e, 'No se pudo enviar el mensaje.')
  } finally {
    busy.value = false
  }
}

async function poll() {
  if (!session.value || document.visibilityState === 'hidden') return
  const after = messages.value.at(-1)?.id ?? 0
  try {
    const r = await $fetch<{ messages: ChatMessage[] }>(ENDPOINT, { method: 'POST', query: { channel: 'chat', action: 'poll' }, body: { token: session.value.token, after } })
    if (r.messages.length) {
      mergeMessages(r.messages)
      if (open.value) {
        session.value.lastSeenId = messages.value.at(-1)?.id ?? 0
        store(session.value)
        scrollToBottom()
      }
    }
    unseen.value = open.value ? 0 : messages.value.filter((m) => m.from === 'agency' && m.id > (session.value?.lastSeenId ?? 0)).length
  } catch (e: any) {
    if ((e?.statusCode || e?.response?.status) === 404) handleError(e, '')
  }
}

function schedule() {
  if (timer) clearTimeout(timer)
  if (!session.value) return
  timer = setTimeout(
    async () => {
      await poll()
      schedule()
    },
    open.value ? 6000 : 30000,
  )
}

function toggle(value: boolean) {
  open.value = value
  error.value = ''
  if (value && session.value) {
    unseen.value = 0
    session.value.lastSeenId = messages.value.at(-1)?.id ?? session.value.lastSeenId
    store(session.value)
    poll()
    scrollToBottom()
  }
  schedule()
}

onMounted(async () => {
  await loadTenant()
  mounted.value = true
  if (!tenant.value?.webChat?.enabled) return
  session.value = readStored()
  if (session.value) {
    await poll()
    schedule()
  }
})
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
</script>

<style scoped>
.wc-root {
  position: fixed;
  left: 20px;
  bottom: 20px;
  z-index: 45;
  transition: bottom 0.25s var(--ease-out);
}
.wc-raised {
  bottom: 88px;
}
.wc-launcher {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 9999px;
  background: #16150f;
  color: #fff;
  padding: 11px 16px;
  font-size: 13px;
  font-weight: 600;
  box-shadow: 0 10px 26px -10px rgba(0, 0, 0, 0.5);
}
.wc-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 20px;
  height: 20px;
  border-radius: 9999px;
  background: #10b981;
  color: #fff;
  font-size: 11px;
  line-height: 20px;
  text-align: center;
  padding: 0 5px;
}
.wc-panel {
  display: flex;
  flex-direction: column;
  width: min(360px, calc(100vw - 40px));
  height: min(520px, calc(100vh - 120px));
  overflow: hidden;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 24px 60px -20px rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(0, 0, 0, 0.08);
}
.wc-input {
  width: 100%;
  border-radius: 10px;
  border: 1px solid #e7e5e4;
  background: #fff;
  padding: 8px 10px;
  font-size: 13px;
}
.wc-input:focus {
  outline: none;
  border-color: #16150f;
}
.wc-trap {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  opacity: 0;
}
</style>
