<template>
  <div class="mb-3">
    <span class="label">{{ label }}</span>
    <div class="flex gap-1 rounded-lg bg-stone-100 p-1">
      <button
        v-for="t in TYPES"
        :key="t.key"
        type="button"
        class="flex-1 rounded-md px-1 py-1 text-[11px] font-medium transition"
        :class="type === t.key ? 'bg-white text-ink shadow-sm' : 'text-stone-500 hover:text-ink'"
        @click="switchType(t.key)"
      >
        {{ t.label }}
      </button>
    </div>
    <input
      :value="value"
      class="input mt-2"
      :list="type === 'page' ? listId : undefined"
      :placeholder="placeholder"
      :data-testid="testId"
      @change="onChange"
      @keydown.enter.prevent="onChange"
    >
    <datalist v-if="type === 'page'" :id="listId">
      <option v-for="p in SITE_PAGES" :key="p.path" :value="p.path">{{ p.label }}</option>
    </datalist>
    <span class="mt-1 block text-[11px] text-stone-400">{{ hint }}</span>
  </div>
</template>

<script setup lang="ts">
/**
 * Destino de un botón o enlace sin tener que saber escribir una URL: página
 * del sitio (con las rutas reales sugeridas), URL externa, ancla de una
 * sección (el "Ancla" de Avanzado), teléfono o email. Se guarda como una
 * sola cadena, la misma que ya usaban los bloques (`/contacto`,
 * `https://…`, `#contacto`, `tel:…`, `mailto:…`).
 */
const props = withDefaults(defineProps<{ label: string; modelValue: string; testId?: string }>(), { testId: undefined })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

type LinkType = 'page' | 'url' | 'anchor' | 'phone' | 'email'
const TYPES: { key: LinkType; label: string }[] = [
  { key: 'page', label: 'Página' },
  { key: 'url', label: 'URL' },
  { key: 'anchor', label: 'Ancla' },
  { key: 'phone', label: 'Teléfono' },
  { key: 'email', label: 'Email' },
]
const SITE_PAGES = [
  { path: '/', label: 'Inicio' },
  { path: '/propiedades', label: 'Propiedades' },
  { path: '/mapa', label: 'Mapa' },
  { path: '/zonas', label: 'Comunidades' },
  { path: '/promotoras', label: 'Promotoras' },
  { path: '/equipo', label: 'Equipo' },
  { path: '/blog', label: 'Blog' },
  { path: '/nosotros', label: 'Nosotros' },
  { path: '/servicios', label: 'Servicios' },
  { path: '/contacto', label: 'Contacto' },
]
const listId = `sb-link-pages-${Math.random().toString(36).slice(2, 8)}`

function detect(v: string): LinkType {
  if (v.startsWith('#')) return 'anchor'
  if (v.startsWith('tel:')) return 'phone'
  if (v.startsWith('mailto:')) return 'email'
  if (/^https?:\/\//i.test(v)) return 'url'
  return 'page'
}
const forced = ref<LinkType | null>(null)
const type = computed<LinkType>(() => forced.value || detect(props.modelValue || ''))
watch(() => props.modelValue, () => (forced.value = null))

const value = computed(() => {
  const v = props.modelValue || ''
  if (type.value === 'anchor') return v.replace(/^#/, '')
  if (type.value === 'phone') return v.replace(/^tel:/, '')
  if (type.value === 'email') return v.replace(/^mailto:/, '')
  return v
})
const placeholder = computed(
  () => ({ page: '/propiedades', url: 'https://…', anchor: 'contacto', phone: '+34 600 000 000', email: 'hola@tuagencia.com' })[type.value],
)
const hint = computed(
  () =>
    ({
      page: 'Una página de tu web. Escribe / para ver las disponibles.',
      url: 'Cualquier dirección externa; se abre en la misma pestaña.',
      anchor: 'El "Ancla" de otra sección de esta página (pestaña Avanzado).',
      phone: 'Abre el marcador del teléfono en móvil.',
      email: 'Abre el programa de correo.',
    })[type.value],
)

function switchType(t: LinkType) {
  forced.value = t
}
function onChange(e: Event) {
  const raw = (e.target as HTMLInputElement).value.trim()
  if (!raw) return emit('update:modelValue', '')
  const prefix = { page: '', url: '', anchor: '#', phone: 'tel:', email: 'mailto:' }[type.value]
  let v = raw
  if (type.value === 'anchor') v = raw.replace(/^#/, '')
  if (type.value === 'phone') v = raw.replace(/^tel:/, '').replace(/\s+/g, '')
  if (type.value === 'email') v = raw.replace(/^mailto:/, '')
  if (type.value === 'page' && !v.startsWith('/')) v = `/${v}`
  emit('update:modelValue', `${prefix}${v}`)
}
</script>
