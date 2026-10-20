<template>
  <div data-testid="newsletter-editor">
    <div class="grid gap-6 lg:grid-cols-2">
      <!-- Editor -->
      <div class="space-y-4">
        <div>
          <label class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-stone-500">Nombre interno</label>
          <input v-model="draft.name" type="text" class="cfg-input" placeholder="Boletín de noviembre" data-testid="newsletter-editor-name" >
        </div>
        <div>
          <label class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-stone-500">Asunto del email</label>
          <input v-model="draft.subject" type="text" class="cfg-input" placeholder="Novedades de este mes" data-testid="newsletter-editor-subject" >
        </div>

        <div>
          <div class="mb-2 flex items-center justify-between">
            <span class="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Contenido</span>
            <div class="flex flex-wrap gap-1.5">
              <button v-for="t in BLOCK_TYPES" :key="t.type" type="button" class="rounded-md border border-line bg-white px-2 py-1 text-xs font-medium hover:bg-stone-50" :data-testid="`newsletter-add-${t.type}`" @click="addBlock(t.type)">+ {{ t.label }}</button>
            </div>
          </div>

          <div v-if="!draft.blocks.length" class="rounded-xl border border-dashed border-line py-8 text-center text-sm text-stone-400" data-testid="newsletter-blocks-empty">
            Añade bloques para componer el boletín.
          </div>
          <div v-else class="space-y-2" data-testid="newsletter-blocks">
            <div v-for="(block, i) in draft.blocks" :key="i" class="rounded-xl border border-line bg-white p-3" :data-testid="`newsletter-block-${i}`" :data-block-type="block.type">
              <div class="mb-2 flex items-center justify-between">
                <span class="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{{ labelFor(block.type) }}</span>
                <div class="flex items-center gap-1">
                  <button type="button" class="icon-btn" :disabled="i === 0" title="Subir" @click="move(i, -1)">↑</button>
                  <button type="button" class="icon-btn" :disabled="i === draft.blocks.length - 1" title="Bajar" @click="move(i, 1)">↓</button>
                  <button type="button" class="icon-btn text-rose-600" title="Quitar" :data-testid="`newsletter-remove-${i}`" @click="draft.blocks.splice(i, 1)">✕</button>
                </div>
              </div>
              <template v-if="block.type === 'heading'">
                <input v-model="block.text" type="text" class="cfg-input" placeholder="Título de sección" >
              </template>
              <template v-else-if="block.type === 'paragraph'">
                <textarea v-model="block.text" rows="3" class="cfg-input" placeholder="Escribe el texto…" />
              </template>
              <template v-else-if="block.type === 'button'">
                <div class="grid gap-2 sm:grid-cols-2">
                  <input v-model="block.label" type="text" class="cfg-input" placeholder="Texto del botón" >
                  <input v-model="block.url" type="url" class="cfg-input" placeholder="https://…" >
                </div>
              </template>
              <template v-else-if="block.type === 'image'">
                <div class="grid gap-2 sm:grid-cols-2">
                  <input v-model="block.src" type="url" class="cfg-input" placeholder="https://… (URL de la imagen)" >
                  <input v-model="block.alt" type="text" class="cfg-input" placeholder="Texto alternativo" >
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- Vista previa -->
      <div>
        <div class="mb-2 flex items-center justify-between">
          <span class="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Vista previa</span>
          <span v-if="previewPending" class="text-xs text-stone-400">Actualizando…</span>
        </div>
        <iframe v-if="previewHtml" :srcdoc="previewHtml" class="h-[460px] w-full rounded-xl border border-line bg-white" title="Vista previa del boletín" data-testid="newsletter-preview" />
        <div v-else class="flex h-[460px] items-center justify-center rounded-xl border border-dashed border-line text-sm text-stone-400">
          La vista previa aparecerá aquí.
        </div>
      </div>
    </div>

    <div class="mt-5 flex flex-wrap items-center justify-end gap-2">
      <slot name="actions" :save="save" :saving="saving" />
      <button type="button" class="dash-btn-secondary" @click="emit('cancel')">Cancelar</button>
      <button type="button" class="dash-btn" :disabled="saving" data-testid="newsletter-save" @click="save">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Editor de bloques del newsletter (Cola 17), reutilizado por campañas y
 * plantillas. Compone una lista de bloques sencillos (encabezado, párrafo,
 * botón, imagen) y muestra en vivo cómo quedaría el email, con la marca de la
 * agencia, llamando a /api/admin/newsletter/preview. No envía nada.
 */
type Block =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'button'; label: string; url: string }
  | { type: 'image'; src: string; alt: string }

interface DraftValue {
  name: string
  subject: string
  blocks: Block[]
}

const props = defineProps<{ modelValue: DraftValue; saving?: boolean }>()
const emit = defineEmits<{ (e: 'save' | 'cancel'): void }>()

const BLOCK_TYPES: { type: Block['type']; label: string }[] = [
  { type: 'heading', label: 'Título' },
  { type: 'paragraph', label: 'Texto' },
  { type: 'button', label: 'Botón' },
  { type: 'image', label: 'Imagen' },
]
const LABELS: Record<Block['type'], string> = { heading: 'Título', paragraph: 'Texto', button: 'Botón', image: 'Imagen' }
const labelFor = (t: Block['type']) => LABELS[t]

const draft = reactive(props.modelValue)

function addBlock(type: Block['type']) {
  if (type === 'heading') draft.blocks.push({ type, text: '' })
  else if (type === 'paragraph') draft.blocks.push({ type, text: '' })
  else if (type === 'button') draft.blocks.push({ type, label: '', url: '' })
  else draft.blocks.push({ type, src: '', alt: '' })
}
function move(i: number, dir: number) {
  const j = i + dir
  if (j < 0 || j >= draft.blocks.length) return
  const [b] = draft.blocks.splice(i, 1)
  draft.blocks.splice(j, 0, b)
}
function save() {
  emit('save')
}

// --- Vista previa en vivo (con rebote) -----------------------------------
const previewHtml = ref('')
const previewPending = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null
async function renderPreview() {
  previewPending.value = true
  try {
    const res = await $fetch<{ html: string }>('/api/admin/newsletter/preview', {
      method: 'POST',
      body: { subject: draft.subject, blocks: draft.blocks },
    })
    previewHtml.value = res.html
  } catch {
    // Silencioso: la vista previa es un extra, no debe romper la edición.
  } finally {
    previewPending.value = false
  }
}
watch(
  () => [draft.subject, JSON.stringify(draft.blocks)],
  () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(renderPreview, 400)
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})

const saving = computed(() => props.saving)
</script>

<style scoped>
.dash-btn {
  @apply inline-flex items-center rounded-lg bg-ink px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50;
}
.dash-btn-secondary {
  @apply inline-flex items-center rounded-lg border border-line bg-white px-4 py-2 text-[13px] font-medium text-ink transition hover:bg-stone-50 disabled:opacity-50;
}
.cfg-input {
  @apply w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-ink;
}
.icon-btn {
  @apply inline-flex h-6 w-6 items-center justify-center rounded-md text-stone-500 transition hover:bg-stone-100 disabled:opacity-30;
}
</style>
