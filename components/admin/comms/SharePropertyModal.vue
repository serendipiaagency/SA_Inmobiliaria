<template>
  <AdminCommsModal title="Compartir por WhatsApp" :sub="property.name" test-id="comms-share-property" @close="emit('close')">
    <template v-if="overview && !overview.configured">
      <p class="rounded-lg bg-amber-50 p-3 text-[12px] text-amber-800">
        No hay ningún número de WhatsApp conectado en esta agencia, así que el panel no puede enviarla por ti. Puedes abrir WhatsApp con el mensaje preparado o copiar el enlace.
      </p>
      <div class="mt-3 rounded-lg bg-stone-50 p-3">
        <p class="whitespace-pre-line text-[13px] text-stone-700">{{ fallbackText }}</p>
      </div>
      <div class="mt-3 flex flex-wrap gap-2">
        <a :href="`https://wa.me/?text=${encodeURIComponent(fallbackText)}`" target="_blank" rel="noopener" class="btn-primary !px-5 !py-2">Abrir en WhatsApp</a>
        <button type="button" class="btn-quiet !py-2" @click="copy">{{ copied ? 'Copiado' : 'Copiar enlace' }}</button>
      </div>
    </template>
    <template v-else>
      <label class="block">
        <span class="label">¿A quién?</span>
        <input v-model="q" type="search" class="input rounded-lg" placeholder="Busca un cliente o lead por nombre o teléfono…" data-testid="share-property-search" autofocus>
      </label>
      <p v-if="q.length < 2" class="py-4 text-center text-xs text-stone-400">Escribe al menos dos letras.</p>
      <template v-else>
        <p v-if="!results.clients.length && !results.leads.length" class="py-4 text-center text-xs text-stone-400">Nadie con ese nombre.</p>
        <button v-for="c in results.clients" :key="`c-${c.id}`" type="button" class="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left hover:bg-stone-50" :disabled="!c.phone || sending" @click="pick({ clientId: c.id })">
          <span class="text-[13px] font-medium text-ink">{{ c.name }} <span class="text-[10px] font-normal uppercase text-stone-400">cliente</span></span>
          <span class="text-[11px] text-stone-400">{{ c.phone || 'sin teléfono' }}</span>
        </button>
        <button v-for="l in results.leads" :key="`l-${l.id}`" type="button" class="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left hover:bg-stone-50" :disabled="!l.phone || sending" @click="pick({ leadId: l.id })">
          <span class="text-[13px] font-medium text-ink">{{ l.name }} <span class="text-[10px] font-normal uppercase text-stone-400">lead</span></span>
          <span class="text-[11px] text-stone-400">{{ l.phone || 'sin teléfono' }}</span>
        </button>
      </template>
      <label class="mt-3 block">
        <span class="label">Nota (opcional)</span>
        <input v-model="note" class="input rounded-lg" placeholder="Te paso la que comentamos…">
      </label>
      <p v-if="sending" class="mt-3 text-[12px] text-stone-500">Enviando…</p>
      <p v-if="error" class="mt-3 text-[12px] text-red-600">{{ error }}</p>
    </template>
  </AdminCommsModal>
</template>

<script setup lang="ts">
/**
 * Compartir una propiedad desde su ficha: elige el cliente o lead, el
 * servidor abre (o encuentra) su conversación y manda la ficha con foto y
 * enlace público. Sin número conectado, el enlace oficial wa.me con el
 * texto preparado — sin fingir que se envió nada.
 */
const props = defineProps<{ property: { id: number; name: string; slug?: string | null } }>()
const emit = defineEmits<{ close: [] }>()
const comms = useComms()
const toast = useToast()
const overview = ref<any>(null)
onMounted(async () => (overview.value = await comms.loadOverview()))

const q = ref('')
const note = ref('')
const results = ref<{ clients: any[]; leads: any[] }>({ clients: [], leads: [] })
const sending = ref(false)
const error = ref('')
const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null
watch(q, (v) => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(async () => {
    if (v.trim().length < 2) return
    results.value = await $fetch<{ clients: any[]; leads: any[] }>('/api/admin/comms/crm-search', { query: { q: v } }).catch(() => ({ clients: [], leads: [] }))
  }, 250)
})

const publicUrl = computed(() => (import.meta.client ? `${window.location.origin}/propiedades/${props.property.slug || props.property.id}` : ''))
const fallbackText = computed(() => `🏠 ${props.property.name}\n${publicUrl.value}`)

async function copy() {
  try {
    await navigator.clipboard.writeText(publicUrl.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    toast.error('No se pudo copiar')
  }
}

async function pick(target: Record<string, any>) {
  error.value = ''
  sending.value = true
  try {
    const conv = await $fetch<{ id: number }>('/api/admin/comms/conversations', { method: 'POST', body: target })
    await $fetch(`/api/admin/comms/conversations/${conv.id}/share-property`, { method: 'POST', body: { propertyId: props.property.id, note: note.value || undefined } })
    toast.success('Propiedad enviada por WhatsApp')
    emit('close')
    await navigateTo(`/admin/comunicaciones?conversation=${conv.id}`)
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.data?.error || e?.statusMessage || 'No se pudo enviar'
  } finally {
    sending.value = false
  }
}
</script>
