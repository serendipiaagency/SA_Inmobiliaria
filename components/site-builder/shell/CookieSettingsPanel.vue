<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" data-testid="cookie-settings-panel" @click.self="emit('close')">
    <div class="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
      <div class="mb-1 flex items-center justify-between">
        <p class="font-serif text-lg">Cookies de la web</p>
        <button type="button" class="text-stone-300 hover:text-ink" aria-label="Cerrar" @click="emit('close')">
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
      <p class="mb-4 text-[13px] leading-relaxed text-stone-500">
        El aviso «Tu privacidad es importante» sale a cada visitante hasta que decide, y nada opcional se carga antes. Aquí indicas qué
        servicios de medición o publicidad usa tu web: sólo se cargan a quien los acepte. Los datos del responsable (razón social, CIF,
        dirección) son los de la ficha de la empresa.
      </p>

      <p v-if="loadError" class="mb-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{{ loadError }}</p>

      <label class="mb-3 block">
        <span class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-stone-500">Google Analytics 4 · ID de medición</span>
        <input v-model="form.ga4" class="w-full rounded-lg border border-line bg-white px-3 py-2 font-mono text-sm focus:border-ink focus:outline-none" placeholder="G-XXXXXXXXXX" maxlength="20" data-testid="cookie-settings-ga4" >
        <span class="mt-1 block text-[11px] text-stone-400">Vacío = sin Google Analytics. Va en la categoría «Analíticas».</span>
      </label>
      <label class="mb-3 block">
        <span class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-stone-500">Píxel de Meta · ID</span>
        <input v-model="form.metaPixel" class="w-full rounded-lg border border-line bg-white px-3 py-2 font-mono text-sm focus:border-ink focus:outline-none" placeholder="123456789012345" maxlength="24" inputmode="numeric" data-testid="cookie-settings-pixel" >
        <span class="mt-1 block text-[11px] text-stone-400">Vacío = sin píxel. Si lo indicas, el aviso añade la categoría «Publicidad».</span>
      </label>
      <label class="mb-4 flex items-start gap-2 text-[13px] text-stone-600">
        <input v-model="form.askAgain" type="checkbox" class="mt-0.5" data-testid="cookie-settings-ask-again" >
        <span>Volver a pedir el consentimiento a quien ya decidió. (Al añadir o quitar un servicio se vuelve a pedir solo.)</span>
      </label>

      <p v-if="saveError" class="mb-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700" data-testid="cookie-settings-error">{{ saveError }}</p>
      <p v-if="saved" class="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800" data-testid="cookie-settings-saved">Guardado. La web lo aplica en menos de un minuto; no hace falta publicar.</p>

      <div class="flex flex-wrap items-center justify-between gap-2">
        <button type="button" class="rounded-lg border border-line px-3 py-2 text-[13px] font-medium text-stone-600 transition hover:border-ink hover:text-ink" data-testid="cookie-settings-preview" @click="emit('preview', previewProviders)">
          Ver el aviso en el lienzo
        </button>
        <button type="button" class="btn-primary !rounded-lg !px-4 !py-2 !text-[13px] !font-medium !normal-case !tracking-normal" :disabled="saving || loading" data-testid="cookie-settings-save" @click="save">
          {{ saving ? 'Guardando…' : 'Guardar' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { NO_COOKIE_PROVIDERS, normalizeGa4Id, normalizeMetaPixelId, type CookieProviders } from '~/utils/cookieConsent'

/**
 * Constructor Web → Cookies: los proveedores sujetos al aviso de cookies de la
 * web de la organización activa (server/api/admin/site-settings.*). No es parte
 * de la página: se guarda al momento, sin «Publicar».
 */
const emit = defineEmits<{ close: []; preview: [providers: CookieProviders] }>()

const form = reactive({ ga4: '', metaPixel: '', askAgain: false })
const current = ref<CookieProviders>(NO_COOKIE_PROVIDERS)
const loading = ref(true)
const loadError = ref('')
const saving = ref(false)
const saveError = ref('')
const saved = ref(false)

/** Lo que enseñaría el aviso con lo que hay escrito (sin guardar todavía), para la muestra del lienzo. */
const previewProviders = computed<CookieProviders>(() => ({
  ga4: normalizeGa4Id(form.ga4) || null,
  metaPixel: normalizeMetaPixelId(form.metaPixel) || null,
  revision: current.value.revision,
}))

onMounted(async () => {
  try {
    const res = await $fetch<{ cookies: CookieProviders }>('/api/admin/site-settings')
    current.value = res.cookies
    form.ga4 = res.cookies.ga4 || ''
    form.metaPixel = res.cookies.metaPixel || ''
  } catch (e: any) {
    loadError.value = e?.data?.statusMessage || 'No se pudieron leer los ajustes de cookies.'
  } finally {
    loading.value = false
  }
})

async function save() {
  saveError.value = ''
  saved.value = false
  saving.value = true
  try {
    const res = await $fetch<{ cookies: CookieProviders }>('/api/admin/site-settings', { method: 'PUT', body: { ga4: form.ga4, metaPixel: form.metaPixel, askAgain: form.askAgain } })
    current.value = res.cookies
    form.ga4 = res.cookies.ga4 || ''
    form.metaPixel = res.cookies.metaPixel || ''
    form.askAgain = false
    saved.value = true
  } catch (e: any) {
    saveError.value = e?.data?.statusMessage || e?.statusMessage || 'No se pudo guardar.'
  } finally {
    saving.value = false
  }
}
</script>
