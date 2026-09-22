<template>
  <AdminCommsModal title="Enviar plantilla" sub="Fuera de la ventana de 24 h, WhatsApp sólo entrega plantillas aprobadas" test-id="comms-template-picker" @close="emit('close')">
    <p v-if="!templates.length" class="rounded-lg bg-amber-50 p-3 text-[12px] text-amber-800">
      Este número no tiene plantillas registradas. Se añaden (o se sincronizan desde Meta) en <NuxtLink to="/admin/comunicaciones/configuracion" class="font-medium underline">Configuración → Comunicaciones</NuxtLink>.
    </p>
    <template v-else>
      <label class="block">
        <span class="label">Plantilla</span>
        <select v-model.number="templateId" class="input rounded-lg" data-testid="template-select">
          <option v-for="t in templates" :key="t.id" :value="t.id">{{ t.name }} ({{ t.language }}){{ t.status !== 'approved' ? ` — ${t.status}` : '' }}</option>
        </select>
      </label>
      <div v-if="selected" class="mt-3 space-y-3">
        <div v-for="n in paramCount" :key="n">
          <span class="label">Valor {{ n }}</span>
          <input v-model="params[n - 1]" class="input rounded-lg" :placeholder="`{{${n}}}`" :data-testid="`template-param-${n}`">
        </div>
        <div class="rounded-lg bg-stone-50 p-3">
          <p class="mb-1 text-[10px] font-semibold uppercase tracking-widest text-stone-400">Vista previa</p>
          <p class="whitespace-pre-line text-[13px] text-stone-700" data-testid="template-preview">{{ preview }}</p>
        </div>
      </div>
    </template>
    <p v-if="error" class="mt-3 text-[12px] text-red-600">{{ error }}</p>
    <template #footer>
      <button type="button" class="btn-quiet !py-2" @click="emit('close')">Cancelar</button>
      <button type="button" class="btn-primary !px-5 !py-2" :disabled="!selected || sending || !paramsReady" data-testid="template-send" @click="send">{{ sending ? 'Enviando…' : 'Enviar' }}</button>
    </template>
  </AdminCommsModal>
</template>

<script setup lang="ts">
const props = defineProps<{ conversationId: number; templates: any[] }>()
const emit = defineEmits<{ close: []; sent: [message: any] }>()
const templateId = ref<number>(props.templates[0]?.id || 0)
const params = ref<string[]>([])
const sending = ref(false)
const error = ref('')

const selected = computed(() => props.templates.find((t) => t.id === templateId.value) || null)
const paramCount = computed(() => {
  let max = 0
  for (const m of String(selected.value?.body || '').matchAll(/\{\{\s*(\d+)\s*\}\}/g)) max = Math.max(max, Number(m[1]))
  return max
})
const paramsReady = computed(() => Array.from({ length: paramCount.value }, (_, i) => params.value[i]?.trim()).every(Boolean))
const preview = computed(() => String(selected.value?.body || '').replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => params.value[Number(n) - 1] || `{{${n}}}`))
watch(templateId, () => (params.value = []))

async function send() {
  error.value = ''
  sending.value = true
  try {
    const r = await $fetch<{ message: any }>(`/api/admin/comms/conversations/${props.conversationId}/messages`, { method: 'POST', body: { type: 'template', templateId: templateId.value, params: params.value.slice(0, paramCount.value) } })
    emit('sent', r.message)
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.statusMessage || 'No se pudo enviar'
  } finally {
    sending.value = false
  }
}
</script>
