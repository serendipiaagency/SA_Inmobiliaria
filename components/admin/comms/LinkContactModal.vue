<template>
  <AdminCommsModal title="¿Quién es este contacto?" :sub="`${phone} no está en el CRM`" test-id="comms-link-contact" @close="emit('close')">
    <div class="flex gap-1 rounded-lg bg-stone-100 p-1">
      <button type="button" class="flex-1 rounded-md px-2 py-1.5 text-xs font-medium" :class="mode === 'search' ? 'bg-white text-ink shadow-sm' : 'text-stone-500'" @click="mode = 'search'">Vincular a existente</button>
      <button type="button" class="flex-1 rounded-md px-2 py-1.5 text-xs font-medium" :class="mode === 'create' ? 'bg-white text-ink shadow-sm' : 'text-stone-500'" data-testid="link-contact-create-tab" @click="mode = 'create'">Crear lead</button>
    </div>

    <div v-if="mode === 'search'" class="mt-3">
      <input v-model="q" type="search" class="input rounded-lg" placeholder="Nombre, teléfono o email…" data-testid="link-contact-search">
      <p v-if="q.length < 2" class="py-4 text-center text-xs text-stone-400">Escribe al menos dos letras.</p>
      <template v-else>
        <p v-if="!results.clients.length && !results.leads.length" class="py-4 text-center text-xs text-stone-400">Nadie con ese nombre.</p>
        <div v-if="results.clients.length" class="mt-2">
          <p class="mb-1 text-[10px] font-semibold uppercase tracking-widest text-stone-400">Clientes</p>
          <button v-for="c in results.clients" :key="`c-${c.id}`" type="button" class="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left hover:bg-stone-50" @click="link({ clientId: c.id })">
            <span class="text-[13px] font-medium text-ink">{{ c.name }}</span>
            <span class="text-[11px] text-stone-400">{{ c.phone || c.email }}</span>
          </button>
        </div>
        <div v-if="results.leads.length" class="mt-2">
          <p class="mb-1 text-[10px] font-semibold uppercase tracking-widest text-stone-400">Leads</p>
          <button v-for="l in results.leads" :key="`l-${l.id}`" type="button" class="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left hover:bg-stone-50" @click="link({ leadId: l.id })">
            <span class="text-[13px] font-medium text-ink">{{ l.name }}</span>
            <span class="text-[11px] text-stone-400">{{ l.status }} · {{ l.phone || l.email }}</span>
          </button>
        </div>
      </template>
    </div>

    <div v-else class="mt-3 space-y-3">
      <label class="block">
        <span class="label">Nombre</span>
        <input v-model="lead.name" class="input rounded-lg" placeholder="Nombre del contacto" data-testid="link-contact-lead-name">
      </label>
      <label class="block">
        <span class="label">Email (opcional)</span>
        <input v-model="lead.email" type="email" class="input rounded-lg">
      </label>
      <p class="text-[11px] text-stone-500">El lead se crea con origen «whatsapp» y el teléfono {{ phone }}.</p>
    </div>
    <p v-if="error" class="mt-3 text-[12px] text-red-600">{{ error }}</p>
    <template #footer>
      <button type="button" class="btn-quiet !py-2" @click="emit('close')">Cancelar</button>
      <button v-if="mode === 'create'" type="button" class="btn-primary !px-5 !py-2" :disabled="saving || !lead.name.trim()" data-testid="link-contact-create-save" @click="link({ createLead: { name: lead.name, email: lead.email || undefined } })">
        {{ saving ? 'Creando…' : 'Crear lead' }}
      </button>
    </template>
  </AdminCommsModal>
</template>

<script setup lang="ts">
const props = defineProps<{ contactId: number; phone: string; suggestedName?: string | null }>()
const emit = defineEmits<{ close: []; linked: [contact: any] }>()
const mode = ref<'search' | 'create'>('search')
const q = ref('')
const results = ref<{ clients: any[]; leads: any[] }>({ clients: [], leads: [] })
const lead = reactive({ name: props.suggestedName || '', email: '' })
const saving = ref(false)
const error = ref('')
let timer: ReturnType<typeof setTimeout> | null = null
watch(q, (v) => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(async () => {
    if (v.trim().length < 2) return
    results.value = await $fetch<{ clients: any[]; leads: any[] }>('/api/admin/comms/crm-search', { query: { q: v } }).catch(() => ({ clients: [], leads: [] }))
  }, 250)
})

async function link(body: Record<string, any>) {
  error.value = ''
  saving.value = true
  try {
    const r = await $fetch<{ contact: any }>(`/api/admin/comms/contacts/${props.contactId}/link`, { method: 'POST', body })
    emit('linked', r.contact)
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.statusMessage || 'No se pudo vincular'
  } finally {
    saving.value = false
  }
}
</script>
