<template>
  <div class="flex items-center gap-1">
    <!-- Language -->
    <div ref="langRoot" class="relative">
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest2 text-stone-500 transition hover:border-ink hover:text-ink"
        :aria-expanded="open === 'lang'"
        aria-label="Idioma"
        @click="toggle('lang')"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 3.8 6 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-6-3.8-9S9.5 5.7 12 3z" /></svg>
        <span>{{ currentLocale.code }}</span>
      </button>
      <transition name="pop">
        <div v-if="open === 'lang'" class="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-xl">
          <p class="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-stone-400">{{ t('selector.language') }}</p>
          <button
            v-for="l in locales"
            :key="l.code"
            type="button"
            class="flex w-full items-center gap-2.5 px-3 py-2 text-sm transition hover:bg-stone-50"
            :class="l.code === locale ? 'font-semibold text-ink' : 'text-stone-600'"
            @click="pickLang(l.code)"
          >
            <span class="text-base leading-none">{{ l.flag }}</span>
            <span class="flex-1 text-left">{{ l.label }}</span>
            <svg v-if="l.code === locale" class="h-4 w-4 text-ink" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5" /></svg>
          </button>
        </div>
      </transition>
    </div>

    <!-- Currency -->
    <div ref="curRoot" class="relative">
      <button
        type="button"
        class="flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest2 text-stone-500 transition hover:border-ink hover:text-ink"
        :aria-expanded="open === 'cur'"
        aria-label="Moneda"
        @click="toggle('cur')"
      >
        <span>{{ current.symbol === current.code ? current.code : `${current.symbol} ${current.code}` }}</span>
        <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      <transition name="pop">
        <div v-if="open === 'cur'" class="absolute right-0 z-50 mt-2 w-40 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-xl">
          <p class="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-stone-400">{{ t('selector.currency') }}</p>
          <button
            v-for="c in currencies"
            :key="c.code"
            type="button"
            class="flex w-full items-center gap-2.5 px-3 py-2 text-sm transition hover:bg-stone-50"
            :class="c.code === code ? 'font-semibold text-ink' : 'text-stone-600'"
            @click="pickCur(c.code)"
          >
            <span class="w-5 text-center">{{ c.symbol === c.code ? '' : c.symbol }}</span>
            <span class="flex-1 text-left">{{ c.code }}</span>
            <svg v-if="c.code === code" class="h-4 w-4 text-ink" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5" /></svg>
          </button>
        </div>
      </transition>
    </div>
  </div>
</template>

<script setup lang="ts">
const { t, locale, locales, currentLocale, setLocale } = useI18n()
const { code, current, currencies, setCurrency } = useCurrency()

const open = ref<'lang' | 'cur' | null>(null)
const langRoot = ref<HTMLElement | null>(null)
const curRoot = ref<HTMLElement | null>(null)

function toggle(which: 'lang' | 'cur') {
  open.value = open.value === which ? null : which
}
function pickLang(c: string) {
  setLocale(c)
  open.value = null
}
function pickCur(c: string) {
  setCurrency(c)
  open.value = null
}

function onDocClick(e: MouseEvent) {
  const tgt = e.target as Node
  if (langRoot.value?.contains(tgt) || curRoot.value?.contains(tgt)) return
  open.value = null
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<style scoped>
.pop-enter-active,
.pop-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
