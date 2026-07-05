<template>
  <div>
    <div class="mb-6">
      <h1 class="text-2xl font-semibold tracking-tight">Widgets embebibles</h1>
      <p class="mt-1 text-sm text-stone-500">Inserta tu cartera en cualquier web con un script. Personaliza y copia.</p>
    </div>

    <!-- Presets -->
    <div class="mb-5 flex flex-wrap gap-2">
      <button
        v-for="p in presets"
        :key="p.key"
        class="rounded-lg border px-3 py-1.5 text-xs font-medium transition"
        :class="activePreset === p.key ? 'border-ink bg-ink text-white' : 'border-line bg-white text-stone-600 hover:border-stone-300'"
        @click="applyPreset(p)"
      >
        {{ p.label }}
      </button>
    </div>

    <div class="grid gap-5 lg:grid-cols-[320px_1fr]">
      <!-- Controls -->
      <div class="space-y-4">
        <AdminPanel title="Diseño">
          <div class="space-y-3">
            <label class="block"><span class="wl">Formato</span>
              <select v-model="cfg.widget" class="wi">
                <option value="grid">Cuadrícula</option>
                <option value="carousel">Carrusel</option>
                <option value="list">Lista</option>
                <option value="map">Mapa</option>
              </select>
            </label>
            <label class="block"><span class="wl">Contenido</span>
              <select v-model="cfg.filter" class="wi">
                <option value="all">Todas</option>
                <option value="featured">Destacadas</option>
                <option value="latest">Últimas</option>
                <option value="luxury">Luxury</option>
                <option value="promo">Promociones</option>
                <option value="new">Obra nueva</option>
              </select>
            </label>
            <label class="block"><span class="wl">Ciudad / zona (opcional)</span>
              <input v-model="cfg.city" class="wi" placeholder="p. ej. Marina" />
            </label>
            <div class="grid grid-cols-2 gap-3">
              <label class="block"><span class="wl">Nº propiedades</span>
                <input v-model.number="cfg.limit" type="number" min="1" max="24" class="wi" />
              </label>
              <label v-if="cfg.widget === 'grid'" class="block"><span class="wl">Columnas</span>
                <select v-model.number="cfg.cols" class="wi"><option :value="1">1</option><option :value="2">2</option><option :value="3">3</option><option :value="4">4</option></select>
              </label>
            </div>
          </div>
        </AdminPanel>

        <AdminPanel title="Estilo">
          <div class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <label class="block"><span class="wl">Tema</span>
                <select v-model="cfg.theme" class="wi"><option value="light">Claro</option><option value="dark">Oscuro</option></select>
              </label>
              <label class="block"><span class="wl">Tipografía</span>
                <select v-model="cfg.font" class="wi"><option value="sans">Sans</option><option value="serif">Serif</option></select>
              </label>
            </div>
            <label class="block"><span class="wl">Color de acento</span>
              <div class="flex items-center gap-2">
                <input v-model="cfg.accent" type="color" class="h-10 w-12 cursor-pointer rounded-lg border border-line" />
                <input v-model="cfg.accent" class="wi font-mono" />
              </div>
            </label>
            <div class="grid grid-cols-2 gap-3">
              <label class="block"><span class="wl">Radio ({{ cfg.radius }}px)</span>
                <input v-model.number="cfg.radius" type="range" min="0" max="28" class="w-full accent-ink" />
              </label>
              <label class="block"><span class="wl">Moneda</span>
                <select v-model="cfg.currency" class="wi"><option>AED</option><option>USD</option><option>EUR</option><option>GBP</option><option>CNY</option></select>
              </label>
            </div>
            <div class="flex items-center gap-4 pt-1">
              <label class="flex items-center gap-2 text-sm"><input v-model="cfg.header" type="checkbox" class="accent-ink" /> Cabecera</label>
              <label class="flex items-center gap-2 text-sm"><input v-model="cfg.branding" type="checkbox" class="accent-ink" /> Marca</label>
            </div>
          </div>
        </AdminPanel>
      </div>

      <!-- Preview + code -->
      <div class="space-y-4">
        <AdminPanel title="Vista previa en vivo" :sub="previewUrl">
          <template #action>
            <button class="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:border-ink hover:text-ink" @click="reloadKey++">Recargar</button>
          </template>
          <div class="overflow-hidden rounded-lg border border-line" :class="cfg.theme === 'dark' ? 'bg-[#0f0f0d]' : 'bg-white'">
            <iframe :key="reloadKey" :src="previewUrl" class="h-[560px] w-full" title="preview" />
          </div>
        </AdminPanel>

        <AdminPanel title="Código para insertar" sub="Pégalo en tu web donde quieras que aparezca el widget">
          <template #action>
            <button class="rounded-lg bg-ink px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-black" @click="copy">
              {{ copied ? '✓ Copiado' : 'Copiar código' }}
            </button>
          </template>
          <pre class="overflow-x-auto rounded-lg bg-ink p-4 text-[12px] leading-relaxed text-stone-100"><code>{{ snippet }}</code></pre>
          <p class="mt-3 text-xs text-stone-500">
            El widget es responsive, se ajusta solo en altura y abre las fichas en tu sitio. Los datos se sirven desde
            <code class="rounded bg-stone-100 px-1 py-0.5 text-[11px]">/api/widget/properties</code> con CORS abierto.
          </p>
        </AdminPanel>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Widgets — M&M Real Estate' })

const cfg = reactive({
  widget: 'grid',
  filter: 'featured',
  city: '',
  limit: 6,
  cols: 3,
  theme: 'light',
  font: 'sans',
  accent: '#16150f',
  radius: 16,
  currency: 'AED',
  header: true,
  branding: true,
})

const presets = [
  { key: 'listado', label: 'Listado', widget: 'grid', filter: 'all' },
  { key: 'carrusel', label: 'Carrusel', widget: 'carousel', filter: 'all' },
  { key: 'mapa', label: 'Mapa', widget: 'map', filter: 'all' },
  { key: 'destacadas', label: 'Destacadas', widget: 'grid', filter: 'featured' },
  { key: 'ultimas', label: 'Últimas', widget: 'grid', filter: 'latest' },
  { key: 'luxury', label: 'Luxury', widget: 'grid', filter: 'luxury', theme: 'dark', accent: '#c9a24b', font: 'serif' },
  { key: 'promo', label: 'Promociones', widget: 'grid', filter: 'promo', accent: '#059669' },
  { key: 'lista', label: 'Lista compacta', widget: 'list', filter: 'all' },
]
const activePreset = ref('destacadas')
function applyPreset(p: any) {
  activePreset.value = p.key
  cfg.widget = p.widget
  cfg.filter = p.filter
  cfg.theme = p.theme || 'light'
  cfg.accent = p.accent || '#16150f'
  cfg.font = p.font || 'sans'
}

const origin = ref('')
onMounted(() => (origin.value = window.location.origin))

const params = computed(() => {
  const p = new URLSearchParams()
  p.set('widget', cfg.widget)
  p.set('filter', cfg.filter)
  if (cfg.city) p.set('city', cfg.city)
  p.set('limit', String(cfg.limit))
  if (cfg.widget === 'grid') p.set('cols', String(cfg.cols))
  p.set('theme', cfg.theme)
  p.set('accent', cfg.accent)
  p.set('font', cfg.font)
  p.set('radius', String(cfg.radius))
  p.set('currency', cfg.currency)
  if (!cfg.header) p.set('header', '0')
  if (!cfg.branding) p.set('branding', '0')
  return p
})

const reloadKey = ref(0)
const previewUrl = computed(() => `${origin.value}/embed?${params.value.toString()}`)

const snippet = computed(() => {
  const attrs = [
    `src="${origin.value}/embed.js"`,
    `data-widget="${cfg.widget}"`,
    `data-filter="${cfg.filter}"`,
    cfg.city ? `data-city="${cfg.city}"` : '',
    `data-limit="${cfg.limit}"`,
    cfg.widget === 'grid' ? `data-cols="${cfg.cols}"` : '',
    `data-theme="${cfg.theme}"`,
    `data-accent="${cfg.accent}"`,
    `data-font="${cfg.font}"`,
    `data-radius="${cfg.radius}"`,
    `data-currency="${cfg.currency}"`,
    cfg.header ? '' : 'data-header="0"',
    cfg.branding ? '' : 'data-branding="0"',
  ].filter(Boolean)
  return `<script ${attrs.join('\n        ')}><\/script>`
})

const copied = ref(false)
async function copy() {
  try {
    await navigator.clipboard.writeText(snippet.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    /* ignore */
  }
}
</script>

<style scoped>
.wl { @apply mb-1 block text-[12px] font-medium text-stone-600; }
.wi { @apply w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink; }
</style>
