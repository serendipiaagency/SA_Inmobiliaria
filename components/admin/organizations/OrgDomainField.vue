<template>
  <div>
    <label :for="`${uid}-input`" class="label">Dominio <span class="font-normal normal-case tracking-normal text-stone-400">(opcional)</span></label>
    <input
      :id="`${uid}-input`"
      :value="modelValue"
      type="text"
      class="input"
      placeholder="inmobiliaria.es"
      autocomplete="off"
      spellcheck="false"
      inputmode="url"
      :aria-invalid="problem ? 'true' : undefined"
      :aria-describedby="`${uid}-help`"
      :disabled="disabled"
      data-testid="org-domain"
      @input="onInput"
    >
    <div :id="`${uid}-help`" class="mt-1.5 text-xs" aria-live="polite" data-testid="org-domain-status" :data-state="state">
      <p v-if="problem" class="font-medium text-red-600">{{ problem }}</p>
      <p v-else-if="state === 'checking'" class="text-stone-500">Comprobando disponibilidad…</p>
      <p v-else-if="state === 'ok' && preview" class="text-emerald-700">
        Disponible · la web de la empresa responderá en <span class="font-mono">https://{{ preview }}</span>
      </p>
      <p v-else class="text-stone-500">Sin «https://» ni rutas. Puedes dejarlo vacío y asignarlo más adelante; el DNS se configura aparte.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { previewDomain, type DomainState } from '~/utils/organizationLabels'

/**
 * Dominio propio con validación inmediata contra el servidor
 * (GET /api/admin/organizations?domainAvailable=…): mismo normalizador y
 * mismos dominios reservados que al guardar. Expone `state` al padre para
 * que no deje avanzar con un dominio ocupado o inválido.
 */
const props = defineProps<{ modelValue: string; excludeId?: number | null; disabled?: boolean; error?: string | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: string]; 'update:state': [state: DomainState] }>()

const uid = useId()
const state = ref<DomainState>(props.modelValue ? 'checking' : 'empty')
const serverMessage = ref<string | null>(null)
const preview = computed(() => previewDomain(props.modelValue || ''))
const problem = computed(() => props.error || (state.value === 'taken' || state.value === 'invalid' || state.value === 'error' ? serverMessage.value : null))

let timer: ReturnType<typeof setTimeout> | null = null
let seq = 0

function setState(s: DomainState) {
  state.value = s
  emit('update:state', s)
}

async function check(value: string) {
  const mine = ++seq
  if (!previewDomain(value)) {
    serverMessage.value = null
    return setState('empty')
  }
  setState('checking')
  try {
    const res = await $fetch<{ domain: string | null; available: boolean; message: string | null }>('/api/admin/organizations', {
      query: { domainAvailable: value, ...(props.excludeId ? { excludeId: props.excludeId } : {}) },
    })
    if (mine !== seq) return
    serverMessage.value = res.message
    if (res.available) setState('ok')
    else setState(res.domain ? 'taken' : 'invalid')
  } catch {
    if (mine !== seq) return
    serverMessage.value = 'No se ha podido comprobar el dominio. Se volverá a comprobar al guardar.'
    setState('error')
  }
}

function onInput(e: Event) {
  const value = (e.target as HTMLInputElement).value
  emit('update:modelValue', value)
  if (timer) clearTimeout(timer)
  if (!value.trim()) {
    seq++
    serverMessage.value = null
    setState('empty')
    return
  }
  setState('checking')
  timer = setTimeout(() => check(value), 400)
}

onMounted(() => {
  if (props.modelValue) check(props.modelValue)
  else emit('update:state', 'empty')
})
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
</script>
