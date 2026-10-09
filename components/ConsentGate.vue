<template>
  <slot v-if="allowed" />
  <div
    v-else
    v-bind="$attrs"
    class="flex flex-col items-center justify-center gap-3 rounded-2xl px-6 py-8 text-center"
    :class="tone === 'dark' ? 'bg-white/5 text-white/80' : 'border border-line bg-stone-50 text-stone-600'"
    data-testid="consent-gate"
  >
    <p class="text-[15px] font-semibold" :class="tone === 'dark' ? 'text-white' : 'text-ink'">{{ t('cookie.blocked.title').replace('{provider}', provider) }}</p>
    <p class="max-w-sm text-[13px] leading-relaxed">{{ t('cookie.blocked.text').replace('{provider}', provider) }}</p>
    <div class="flex flex-wrap items-center justify-center gap-2">
      <button
        type="button"
        class="inline-flex min-h-[40px] items-center rounded-full px-5 text-[12px] font-semibold transition"
        :class="tone === 'dark' ? 'bg-white text-ink hover:bg-stone-100' : 'bg-ink text-white hover:bg-black'"
        data-testid="consent-gate-allow"
        @click="grant(category)"
      >
        {{ t('cookie.blocked.allow') }}
      </button>
      <a
        v-if="href"
        :href="href"
        target="_blank"
        rel="noopener"
        class="inline-flex min-h-[40px] items-center rounded-full border px-5 text-[12px] font-semibold transition"
        :class="tone === 'dark' ? 'border-white/40 text-white hover:border-white' : 'border-line text-ink hover:border-ink'"
      >
        {{ t('cookie.blocked.open').replace('{provider}', provider) }} ↗
      </a>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { OptionalCookieCategory } from '~/utils/cookieConsent'

/**
 * Contenido de un tercero (vídeo de YouTube/Vimeo, publicación de
 * Instagram/TikTok) que sólo se carga con el consentimiento de «Contenido de
 * terceros». Sin él, en su lugar sale un aviso con «Permitir y ver» (concede
 * esa categoría, igual que en Configurar) y el enlace para verlo en el sitio
 * del proveedor. El servidor pinta siempre el aviso: el contenido real sólo
 * aparece en el navegador, después de leer la decisión del visitante.
 */
defineOptions({ inheritAttrs: false })
const props = withDefaults(defineProps<{ provider: string; href?: string | null; category?: OptionalCookieCategory; tone?: 'light' | 'dark' }>(), {
  href: null,
  category: 'thirdParty',
  tone: 'light',
})

const { t } = useI18n()
const { choices, grant } = useCookieConsent()
const mounted = ref(false)
onMounted(() => (mounted.value = true))
const allowed = computed(() => mounted.value && choices.value[props.category])
</script>
